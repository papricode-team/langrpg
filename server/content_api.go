package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"lernen01/server/internal/contentstore"
)

func contentBody(record contentstore.Record) map[string]any {
	var body map[string]any
	_ = json.Unmarshal(record.Body, &body)
	if body == nil {
		body = map[string]any{}
	}
	body["id"] = record.ID
	return body
}

func contentString(body map[string]any, key string) string {
	value, _ := body[key].(string)
	return value
}

func contentStrings(body map[string]any, key string) []string {
	values, _ := body[key].([]any)
	result := []string{}
	for _, value := range values {
		if id, ok := value.(string); ok {
			result = append(result, id)
		}
	}
	return result
}

// A strict deny-list is also applied recursively: optional/new content fields
// cannot accidentally reveal grading targets in any read endpoint.
func safeContent(value any, language string) any {
	switch value := value.(type) {
	case map[string]any:
		out := map[string]any{}
		var selectedSupport map[string]any
		for key, child := range value {
			switch strings.ToLower(key) {
			case "slug", "localid", "legacyid", "answer", "acceptedanswers", "explanation", "orderexplanation", "expected", "correct", "correctanswer", "modelanswer", "validvalues", "solutions", "solution", "turkish":
				continue
			}
			if key == "support" {
				if support, ok := child.(map[string]any); ok {
					selected, exists := support[language]
					selectedLanguage := language
					if !exists {
						selected, exists = support["en"]
						selectedLanguage = "en"
					}
					if exists {
						out[key] = map[string]any{selectedLanguage: safeContent(selected, selectedLanguage)}
						selectedSupport, _ = selected.(map[string]any)
					}
					continue
				}
			}
			if translations, ok := child.(map[string]any); ok && (key == "meaning" || key == "meanings" || key == "translations" || key == "hint") {
				if selected, exists := translations[language]; exists {
					out[key] = safeContent(selected, language)
					continue
				}
			}
			out[key] = safeContent(child, language)
		}
		if selectedSupport != nil {
			for _, key := range []string{"english", "prompt", "hint", "title", "subtitle", "role", "summary", "description", "objectives", "gatePrompt", "instruction", "note", "optionMeanings"} {
				if translated, exists := selectedSupport[key]; exists {
					out[key] = safeContent(translated, language)
				}
			}
			out["localized"] = true
		}
		if language == "tr" {
			if turkish, ok := value["turkish"].(string); ok {
				out["english"] = turkish
				out["localized"] = true
			}
		}
		return out
	case []any:
		out := make([]any, len(value))
		for i, child := range value {
			out[i] = safeContent(child, language)
		}
		return out
	default:
		return value
	}
}

func (a *App) contentAccount(w http.ResponseWriter, r *http.Request, kind string, limit, count int) (Account, bool) {
	hash, err := bearer(r)
	if err != nil {
		apiFailure(w, err)
		return Account{}, false
	}
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()
	account, err := a.getAccount(ctx, hash)
	if err != nil {
		apiFailure(w, err)
		return Account{}, false
	}
	if status := a.accessState(account, a.now().UTC()); accessBlocked(status) {
		writeAccessBlocked(w, status)
		return Account{}, false
	}
	if !a.allowCount("content-"+kind+":"+account.Player.ID, limit, count) {
		a.logContentDenial(account.Player.ID, 429, kind)
		w.Header().Set("Retry-After", "60")
		writeError(w, 429, "too many content requests; try again in a minute")
		return Account{}, false
	}
	if a.content == nil {
		writeError(w, 503, "content catalogue is unavailable")
		return Account{}, false
	}
	return account, true
}

func (a *App) logContentDenial(accountID string, status int, kind string) {
	key := "content-denials:" + accountID + ":" + kind + ":" + http.StatusText(status)
	a.rateMu.Lock()
	window := a.limits[key]
	if time.Since(window.At) > time.Minute {
		window = rateWindow{At: time.Now()}
	}
	window.Count++
	a.limits[key] = window
	count := window.Count
	a.rateMu.Unlock()
	// Log totals at powers of two to keep enumeration from flooding logs.
	if count&(count-1) == 0 {
		slog.Info("content access denied", "accountId", accountID, "status", status, "kind", kind, "count", count)
	}
}

func (a *App) contentMissing(w http.ResponseWriter, account Account, kind string) {
	a.logContentDenial(account.Player.ID, 404, kind)
	writeError(w, 404, "content not found")
}

func writeContent(w http.ResponseWriter, r *http.Request, value any) {
	data, err := json.Marshal(value)
	if err != nil {
		apiFailure(w, err)
		return
	}
	hash := sha256.Sum256(data)
	etag := `"` + hex.EncodeToString(hash[:]) + `"`
	w.Header().Set("Cache-Control", "private, max-age=60")
	w.Header().Set("ETag", etag)
	w.Header().Add("Vary", "Authorization")
	w.Header().Add("Vary", "Accept-Language")
	for _, candidate := range strings.Split(r.Header.Get("If-None-Match"), ",") {
		if strings.TrimSpace(candidate) == etag || strings.TrimSpace(candidate) == "*" {
			w.WriteHeader(http.StatusNotModified)
			return
		}
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(200)
	_, _ = w.Write(data)
}

func (a *App) contentQuestVisible(id string, p *Progress) bool {
	slug := a.content.Slug(id)
	if _, exists := a.curriculum.Quests[slug]; !exists {
		return false
	}
	return a.requireQuestAccess(slug, p) == nil
}

func contentLevel(p *Progress) string {
	if routeUnlocked("nebelstadt", p.CompletedQuestIDs) {
		return "B1"
	}
	if routeUnlocked("waldruh", p.CompletedQuestIDs) {
		return "A2"
	}
	return "A1"
}

func levelWithin(level, allowed string) bool {
	order := map[string]int{"A1": 1, "A2": 2, "B1": 3}
	return order[level] > 0 && order[level] <= order[allowed]
}

func (a *App) contentUnitVisible(id string, p *Progress) bool {
	slug := a.content.Slug(id)
	unit, exists := a.curriculum.Units[slug]
	if !exists || !levelWithin(unit.Level, contentLevel(p)) {
		return false
	}
	return a.requireUnitVocabulary(unit, p) == nil
}

func (a *App) contentExerciseVisible(id string, p *Progress) bool {
	return a.contentPlacementExercise(id) || a.contentExerciseEntitled(id, p)
}

var placementExerciseSlugs = []string{"a1-arrival-exercise-1", "a1-cafe-exercise-6", "a1-lost-parcel-exercise-2", "a2-evening-plans-exercise-4", "a2-archive-exercise-4", "a2-apartment-exercise-6", "b1-council-exercise-5", "b1-witness-exercise-3"}

func (a *App) contentPlacementExercise(id string) bool {
	if !contains(placementExerciseSlugs, a.content.Slug(id)) {
		return false
	}
	_, exists := a.content.Get("exercises", id)
	return exists
}

func (a *App) contentExerciseEntitled(id string, p *Progress) bool {
	slug := a.content.Slug(id)
	exercise, exists := a.curriculum.Exercises[slug]
	if !exists {
		return false
	}
	if a.contentStationReachable(id, p) {
		return true
	}
	if record, ok := a.content.Get("exercises", id); ok {
		body := contentBody(record)
		if quest := contentString(body, "questId"); quest != "" {
			return a.contentQuestVisible(quest, p)
		}
		if route := contentString(body, "mapId"); route != "" {
			return routeUnlocked(route, p.CompletedQuestIDs)
		}
		if binding, ok := a.curriculum.MiniGameContent[slug]; ok && binding.RegionID != "" && !routeUnlocked(binding.RegionID, p.CompletedQuestIDs) {
			return false
		}
		if exercise.TargetWordID != "" {
			return p.wordIntroduced(exercise.TargetWordID) && levelWithin(a.curriculum.Items[exercise.ItemID].Level, contentLevel(p))
		}
		if unit := contentString(body, "unitId"); unit != "" {
			return a.contentUnitVisible(unit, p)
		}
	}
	if exercise.TargetWordID != "" {
		return p.wordIntroduced(exercise.TargetWordID) && levelWithin(a.curriculum.Items[exercise.ItemID].Level, contentLevel(p))
	}
	for questID, quest := range a.curriculum.Quests {
		if contains(quest.RequiredItemIDs, exercise.ItemID) && a.requireQuestAccess(questID, p) == nil {
			return true
		}
	}
	for unitID, unit := range a.curriculum.Units {
		if contains(unit.RequiredExerciseIDs, slug) && a.contentUnitVisible(a.content.Resolve("units", unitID), p) {
			return true
		}
	}
	return false
}

func (a *App) contentStationReachable(id string, p *Progress) bool {
	for _, room := range a.contentStationRooms[id] {
		route, interior, _ := strings.Cut(room, "/")
		if validInterior(route, interior) && routeUnlocked(route, p.CompletedQuestIDs) {
			return true
		}
	}
	return false
}

func (a *App) contentLineVisible(record contentstore.Record, p *Progress) bool {
	body := contentBody(record)
	if placement, _ := body["placement"].(bool); placement {
		return a.contentPlacementExercise(contentString(body, "exerciseId"))
	}
	if completed, _ := body["completedOnly"].(bool); completed && !contains(p.CompletedQuestIDs, a.content.Slug(contentString(body, "questId"))) {
		return false
	}
	if object := contentString(body, "objectId"); object != "" {
		if !a.contentObjectVisible(object, p, false) {
			return false
		}
		if strings.Contains(record.Slug, ":secret:") && !a.contentObjectVisible(object, p, true) {
			return false
		}
	}
	if strings.HasPrefix(record.Slug, "exercise:") {
		exerciseID := contentString(body, "exerciseId")
		exercise, ok := a.curriculum.Exercises[a.content.Slug(exerciseID)]
		if !ok || !a.contentExerciseVisible(exerciseID, p) {
			return false
		}
		if exercise.Mode == "production" && p.ExerciseStats[exercise.ID].Attempts == 0 {
			if de, ok := body["de"].(map[string]any); ok && normalizeAnswer(contentString(de, "text"), exercise.CaseSensitive) == normalizeAnswer(exercise.Answer, exercise.CaseSensitive) {
				return false
			}
		}
		return true
	}
	questID := contentString(body, "questId")
	if questID != "" {
		if !a.contentQuestVisible(questID, p) {
			return false
		}
		quest := a.content.Slug(questID)
		if contains(p.CompletedQuestIDs, quest) {
			return true
		}
		if !contentConditionMet(body["condition"], p) {
			return false
		}
		stage := contentString(body, "stage")
		if stage == "" {
			stage = contentString(body, "nodeId")
		}
		if node, ok := a.content.Get("nodes", stage); ok {
			stage = contentString(contentBody(node), "stage")
		}
		current := storyNode(p, quest)
		return stage == "" || stage == current || (current == "intro" && stage == "gate") || (current == "gate" && stage == "choice")
	}
	if id := contentString(body, "exerciseId"); id != "" {
		return a.contentExerciseVisible(id, p)
	}
	if id := contentString(body, "unitId"); id != "" {
		return a.contentUnitVisible(id, p)
	}
	if id := contentString(body, "lexemeId"); id != "" {
		return p.wordIntroduced(a.content.Slug(id))
	}
	if route := contentString(body, "mapId"); route != "" {
		return routeUnlocked(route, p.CompletedQuestIDs) && contentConditionMet(body["condition"], p)
	}
	if act := contentString(body, "act"); act != "" {
		return act == "1" || act == contentLevel(p) || (act == "2" && routeUnlocked("waldruh", p.CompletedQuestIDs)) || (act == "3" && routeUnlocked("nebelstadt", p.CompletedQuestIDs))
	}
	// Unowned lines are never public, even if their UUID is known.
	return false
}

func contentConditionMet(value any, p *Progress) bool {
	conditions, ok := value.(map[string]any)
	if !ok {
		return true
	}
	if _, typed := conditions["flag"]; typed || conditions["withoutFlag"] != nil || conditions["item"] != nil || conditions["missingItem"] != nil || conditions["faction"] != nil || conditions["ending"] != nil {
		data, _ := json.Marshal(conditions)
		var condition StoryCondition
		if json.Unmarshal(data, &condition) != nil {
			return false
		}
		return condition.met(&p.Story)
	}
	for flag, value := range conditions {
		if required, ok := value.(bool); ok && p.Story.Flags[flag] != required {
			return false
		}
	}
	return true
}

func (a *App) contentObjectVisible(object string, p *Progress, secret bool) bool {
	owners := a.contentObjectQuests[object]
	if len(owners) == 0 {
		// Scenery objects have no investigation transition. Their map owner
		// supplies entitlement; authored investigation secrets require proof.
		return true
	}
	for _, quest := range owners {
		if contains(p.CompletedQuestIDs, quest) {
			return true
		}
		if secret {
			if contains(p.Story.Inspections[quest], object) {
				return true
			}
		} else if a.requireQuestAccess(quest, p) == nil {
			return true
		}
	}
	return false
}

// Owner visibility and per-line visibility are both enforced. An object can be
// opened without returning its undiscovered secret references to the client.
func (a *App) visibleLineReferences(value any, p *Progress) any {
	switch typed := value.(type) {
	case map[string]any:
		if id, ok := typed["lineId"].(string); ok {
			line, exists := a.content.Get("lines", id)
			if !exists || !a.contentLineVisible(line, p) {
				return nil
			}
		}
		out := map[string]any{}
		for key, child := range typed {
			if key == "lineIds" {
				ids := []any{}
				for _, id := range contentStrings(typed, key) {
					line, exists := a.content.Get("lines", id)
					if exists && a.contentLineVisible(line, p) {
						ids = append(ids, id)
					}
				}
				out[key] = ids
				continue
			}
			if selected := a.visibleLineReferences(child, p); selected != nil {
				out[key] = selected
			}
		}
		return out
	case []any:
		out := []any{}
		for _, child := range typed {
			if selected := a.visibleLineReferences(child, p); selected != nil {
				out = append(out, selected)
			}
		}
		return out
	default:
		return value
	}
}

func (a *App) contentLexemeVisible(id string, p *Progress) bool {
	if p.wordIntroduced(a.content.Slug(id)) {
		return true
	}
	for _, lineID := range a.contentLexemeLines[id] {
		if record, ok := a.content.Get("lines", lineID); ok && a.contentLineVisible(record, p) {
			return true
		}
	}
	return false
}

func (a *App) contentBootstrap(w http.ResponseWriter, r *http.Request) {
	account, ok := a.contentAccount(w, r, "bootstrap", 6, 1)
	if !ok {
		return
	}
	result := map[string]any{"npcs": []any{}, "quests": []any{}, "units": []any{}, "chapters": []any{}, "counts": map[string]int{}}
	counts := result["counts"].(map[string]int)
	for key, count := range a.contentCounts {
		counts[key] = count
	}
	for _, kind := range []string{"npcs", "quests", "units"} {
		rows := []any{}
		for _, record := range a.content.Records[kind] {
			body := contentBody(record)
			skeleton := map[string]any{"id": record.ID}
			if kind == "npcs" {
				skeleton["portraitId"] = record.Slug
			}
			for _, key := range []string{"name", "role", "portrait", "portraitId", "title", "subtitle", "level", "location", "npcId", "mapId", "chapterId", "graphId", "greetingLineIds", "exerciseIds", "objectives", "support", "reward", "x", "y", "color"} {
				if value, exists := body[key]; exists {
					skeleton[key] = value
				}
			}
			if kind == "quests" {
				skeleton["unlocked"] = a.contentQuestVisible(record.ID, &account.Progress)
			}
			if kind == "units" {
				skeleton["unlocked"] = a.contentUnitVisible(record.ID, &account.Progress)
				delete(skeleton, "exerciseIds")
				skeleton["exerciseCount"] = len(contentStrings(body, "exerciseIds"))
				skeleton["wordCount"] = len(contentStrings(body, "wordIds"))
				skeleton["grammarIds"] = body["grammarIds"]
			}
			rows = append(rows, skeleton)
		}
		result[kind] = rows
		counts[kind] = len(rows)
	}
	for _, kind := range []string{"lexemes", "exercises", "lines"} {
		counts[kind] = len(a.content.Records[kind])
	}
	grammar := []any{}
	for _, record := range a.content.Records["grammar"] {
		body := contentBody(record)
		skeleton := map[string]any{"id": record.ID, "level": body["level"], "title": body["title"], "unlocked": false}
		if support, ok := body["support"].(map[string]any); ok {
			titles := map[string]any{}
			for language, value := range support {
				if fields, ok := value.(map[string]any); ok {
					titles[language] = map[string]any{"title": fields["title"]}
				}
			}
			skeleton["support"] = titles
		}
		for _, unitID := range a.contentGrammarUnits[record.ID] {
			if _, exists := skeleton["unitId"]; !exists {
				skeleton["unitId"] = unitID
			}
			if a.contentUnitVisible(unitID, &account.Progress) {
				skeleton["unitId"] = unitID
				skeleton["unlocked"] = true
				break
			}
		}
		grammar = append(grammar, skeleton)
	}
	result["grammar"] = grammar
	placementIDs := []any{}
	for _, slug := range placementExerciseSlugs {
		if id := a.content.Resolve("exercises", slug); id != "" {
			placementIDs = append(placementIDs, id)
		}
	}
	result["placementExerciseIds"] = placementIDs
	narratives := []any{}
	for _, record := range a.content.Records["narratives"] {
		body := contentBody(record)
		skeleton := map[string]any{"id": record.ID}
		for _, key := range []string{"kind", "mapId", "questId", "objectId", "npcId", "interiorId", "level", "number", "title", "cutsceneKind", "ending", "guideId"} {
			if value, ok := body[key]; ok {
				skeleton[key] = value
			}
		}
		narratives = append(narratives, skeleton)
	}
	result["narratives"] = narratives
	for _, record := range a.content.Records["narratives"] {
		body := contentBody(record)
		if contentString(body, "kind") == "act" && contentString(body, "level") == contentLevel(&account.Progress) {
			result["currentAct"] = map[string]any{"id": record.ID, "mapId": body["mapId"], "number": body["number"], "title": body["title"]}
			break
		}
	}
	// Metadata is explicitly selected; grading and corpus text never bootstrap.
	for _, key := range []string{"edition", "sources", "chapters"} {
		if data := a.content.Metadata[key]; len(data) > 0 {
			var value any
			if json.Unmarshal(data, &value) == nil {
				result[key] = value
			}
		}
	}
	writeContent(w, r, safeContent(result, normalizedPreferences(account.Preferences).BaseLanguage))
}

func (a *App) contentSingle(w http.ResponseWriter, r *http.Request, kind string, limit int, visible func(contentstore.Record, *Progress) bool) {
	account, ok := a.contentAccount(w, r, kind, limit, 1)
	if !ok {
		return
	}
	id := r.PathValue("id")
	record, exists := a.content.Get(kind, id)
	if !contentstore.UUID.MatchString(id) || !exists || !visible(record, &account.Progress) {
		a.contentMissing(w, account, kind)
		return
	}
	writeContent(w, r, safeContent(contentBody(record), normalizedPreferences(account.Preferences).BaseLanguage))
}

func (a *App) contentGraph(w http.ResponseWriter, r *http.Request) {
	account, ok := a.contentAccount(w, r, "graphs", 10, 1)
	if !ok {
		return
	}
	id := r.PathValue("id")
	record, exists := a.content.Get("graphs", id)
	body := contentBody(record)
	quest := contentString(body, "questId")
	if quest == "" {
		quest = a.content.Resolve("quests", record.Slug)
	}
	if !contentstore.UUID.MatchString(id) || !exists || !a.contentQuestVisible(quest, &account.Progress) {
		a.contentMissing(w, account, "graphs")
		return
	}
	if nodes, ok := body["nodes"].([]any); ok {
		for _, value := range nodes {
			if node, ok := value.(map[string]any); ok {
				choices := []any{}
				for _, choiceID := range contentStrings(node, "choiceIds") {
					if choice, ok := a.content.Get("choices", choiceID); ok {
						choices = append(choices, contentBody(choice))
					}
				}
				node["choices"] = choices
			}
		}
	}
	writeContent(w, r, safeContent(body, normalizedPreferences(account.Preferences).BaseLanguage))
}
func (a *App) contentExercise(w http.ResponseWriter, r *http.Request) {
	account, ok := a.contentAccount(w, r, "exercises", 60, 1)
	if !ok {
		return
	}
	id := r.PathValue("id")
	record, exists := a.content.Get("exercises", id)
	if !contentstore.UUID.MatchString(id) || !exists || !a.contentExerciseVisible(id, &account.Progress) {
		a.contentMissing(w, account, "exercises")
		return
	}
	body := contentBody(record)
	exercise := a.curriculum.Exercises[record.Slug]
	if exercise.Mode == "production" {
		delete(body, "german")
		delete(body, "exampleLineId")
	}
	// Context words let the client hold back practice whose words are not restored yet.
	words := []string{}
	for _, word := range a.curriculum.ContextWordIDs[record.Slug] {
		if lexeme := a.content.Resolve("lexemes", word); lexeme != "" {
			words = append(words, lexeme)
		}
	}
	body["wordIds"] = words
	writeContent(w, r, safeContent(body, normalizedPreferences(account.Preferences).BaseLanguage))
}
func (a *App) contentUnit(w http.ResponseWriter, r *http.Request) {
	account, ok := a.contentAccount(w, r, "units", 30, 1)
	if !ok {
		return
	}
	id := r.PathValue("id")
	record, exists := a.content.Get("units", id)
	if !contentstore.UUID.MatchString(id) || !exists || !a.contentUnitVisible(id, &account.Progress) {
		a.contentMissing(w, account, "units")
		return
	}
	body := contentBody(record)
	grammar := []any{}
	for _, grammarID := range contentStrings(body, "grammarIds") {
		if row, ok := a.content.Get("grammar", grammarID); ok {
			guide := contentBody(row)
			guide["instruction"] = guide["explanation"]
			if support, ok := guide["support"].(map[string]any); ok {
				for _, value := range support {
					if fields, ok := value.(map[string]any); ok {
						fields["instruction"] = fields["explanation"]
					}
				}
			}
			grammar = append(grammar, guide)
		}
	}
	body["grammar"] = grammar
	writeContent(w, r, safeContent(body, normalizedPreferences(account.Preferences).BaseLanguage))
}
func (a *App) contentExpedition(w http.ResponseWriter, r *http.Request) {
	a.contentSingle(w, r, "expeditions", 30, a.contentRouteVisible)
}
func (a *App) contentMinigame(w http.ResponseWriter, r *http.Request) {
	account, ok := a.contentAccount(w, r, "minigames", 30, 1)
	if !ok {
		return
	}
	id := r.PathValue("id")
	record, exists := a.content.Get("minigames", id)
	if !contentstore.UUID.MatchString(id) || !exists || !a.contentRouteVisible(record, &account.Progress) {
		a.contentMissing(w, account, "minigames")
		return
	}
	body := contentBody(record)
	if contentString(body, "kind") == "activity" {
		visible := []any{}
		if scenarios, ok := body["scenarios"].([]any); ok {
			for _, value := range scenarios {
				if scenario, ok := value.(map[string]any); ok && a.contentExerciseEntitled(contentString(scenario, "exerciseId"), &account.Progress) {
					visible = append(visible, scenario)
				}
			}
		}
		if len(visible) == 0 {
			a.contentMissing(w, account, "minigames")
			return
		}
		body["scenarios"] = visible
	}
	writeContent(w, r, safeContent(body, normalizedPreferences(account.Preferences).BaseLanguage))
}
func (a *App) contentNarrative(w http.ResponseWriter, r *http.Request) {
	account, ok := a.contentAccount(w, r, "narratives", 30, 1)
	if !ok {
		return
	}
	id := r.PathValue("id")
	record, exists := a.content.Get("narratives", id)
	if !contentstore.UUID.MatchString(id) || !exists || !a.contentNarrativeVisible(record, &account.Progress) {
		a.contentMissing(w, account, "narratives")
		return
	}
	writeContent(w, r, safeContent(a.visibleLineReferences(contentBody(record), &account.Progress), normalizedPreferences(account.Preferences).BaseLanguage))
}

func (a *App) contentNarrativeVisible(record contentstore.Record, p *Progress) bool {
	body := contentBody(record)
	if ending := contentString(body, "ending"); ending != "" && ending != p.Story.Ending {
		return false
	}
	if quest := contentString(body, "questId"); quest != "" {
		completedOnly, _ := body["completedOnly"].(bool)
		if contentString(body, "kind") == "clue" || completedOnly {
			return contains(p.CompletedQuestIDs, a.content.Slug(quest))
		}
		return a.contentQuestVisible(quest, p)
	}
	if unit := contentString(body, "unitId"); unit != "" {
		return a.contentUnitVisible(unit, p)
	}
	if object := contentString(body, "objectId"); object != "" && !a.contentObjectVisible(object, p, false) {
		return false
	}
	if route := contentString(body, "mapId"); route != "" {
		return routeUnlocked(route, p.CompletedQuestIDs)
	}
	for _, lineID := range contentStrings(body, "lineIds") {
		line, ok := a.content.Get("lines", lineID)
		if !ok || !a.contentLineVisible(line, p) {
			return false
		}
	}
	return len(contentStrings(body, "lineIds")) > 0
}
func (a *App) contentRouteVisible(record contentstore.Record, p *Progress) bool {
	body := contentBody(record)
	if kind := contentString(body, "kind"); kind == "activity" || kind == "activity-scenario" {
		if !levelWithin(contentString(body, "level"), contentLevel(p)) {
			return false
		}
		if kind == "activity-scenario" {
			return a.contentExerciseEntitled(contentString(body, "exerciseId"), p)
		}
		return true
	}
	if quest := contentString(body, "questId"); quest != "" {
		return a.contentQuestVisible(quest, p)
	}
	route := contentString(body, "mapId")
	if route == "" {
		route = contentString(body, "regionId")
	}
	if route == "" && strings.HasPrefix(record.Slug, "plan:") {
		route = strings.TrimPrefix(record.Slug, "plan:")
	}
	if route == "" && !strings.Contains(record.Slug, ":") {
		route = record.Slug
	}
	return route != "" && routeUnlocked(route, p.CompletedQuestIDs)
}

func (a *App) contentBatch(w http.ResponseWriter, r *http.Request, kind string, cap, limit int, visible func(contentstore.Record, *Progress) bool) {
	if _, err := bearer(r); err != nil {
		apiFailure(w, err)
		return
	}
	ids := strings.Split(r.URL.Query().Get("ids"), ",")
	if len(ids) == 0 || len(ids) > cap || ids[0] == "" {
		writeError(w, 400, "invalid content batch size")
		return
	}
	for _, id := range ids {
		if !contentstore.UUID.MatchString(id) {
			writeError(w, 400, "content ids must be UUIDs")
			return
		}
	}
	account, ok := a.contentAccount(w, r, kind, limit, len(ids))
	if !ok {
		return
	}
	rows := []any{}
	seen := map[string]bool{}
	for _, id := range ids {
		if seen[id] {
			continue
		}
		seen[id] = true
		record, exists := a.content.Get(kind, id)
		if !exists || !visible(record, &account.Progress) {
			a.logContentDenial(account.Player.ID, 404, kind)
			continue
		}
		rows = append(rows, safeContent(contentBody(record), normalizedPreferences(account.Preferences).BaseLanguage))
	}
	writeContent(w, r, map[string]any{kind: rows})
}
func (a *App) contentLines(w http.ResponseWriter, r *http.Request) {
	a.contentBatch(w, r, "lines", 12, 120, a.contentLineVisible)
}
func (a *App) contentLexemes(w http.ResponseWriter, r *http.Request) {
	a.contentBatch(w, r, "lexemes", 24, 240, func(record contentstore.Record, p *Progress) bool { return a.contentLexemeVisible(record.ID, p) })
}
