package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"glotworld/server/internal/contentstore"
	"glotworld/server/internal/store"
	"log/slog"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"
)

func (a *App) contentAccount(w http.ResponseWriter, r *http.Request) (Account, bool) {
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
	if a.content == nil {
		writeError(w, 503, "learning content is not installed")
		return Account{}, false
	}
	return account, true
}
func (a *App) listCourses(w http.ResponseWriter, r *http.Request) {
	hash, err := bearer(r)
	if err != nil {
		apiFailure(w, err)
		return
	}
	account, err := a.store.Get(r.Context(), hash)
	if err != nil {
		apiFailure(w, err)
		return
	}
	if a.content == nil {
		writeError(w, 503, "learning content is not installed")
		return
	}
	courses := make([]map[string]any, 0, len(a.content.Courses))
	for _, course := range a.content.Courses {
		data, _ := json.Marshal(course)
		var c map[string]any
		_ = json.Unmarshal(data, &c)
		delete(c, "slug")
		_, enrolled := account.CourseStates[course.ID]
		c["enrolled"] = enrolled || account.ActiveCourseID == course.ID
		courses = append(courses, c)
	}
	writeJSON(w, 200, map[string]any{"courses": courses, "activeCourseId": account.ActiveCourseID})
}
func (a *App) activateCourse(w http.ResponseWriter, r *http.Request) {
	hash, err := bearer(r)
	if err != nil {
		apiFailure(w, err)
		return
	}
	if a.content == nil {
		writeError(w, 503, "learning content is not installed")
		return
	}
	var input struct {
		CourseID        string `json:"courseId"`
		SupportLanguage string `json:"supportLanguage"`
	}
	if err = decodeJSON(w, r, &input); err != nil {
		apiFailure(w, err)
		return
	}
	course, exists := a.content.ByCourse[input.CourseID]
	if !exists || !contentstore.UUID.MatchString(input.CourseID) {
		writeError(w, 404, "course not found")
		return
	}
	if !contains(course.SupportLanguages, input.SupportLanguage) {
		writeError(w, 400, "choose a support language declared by this course")
		return
	}
	account, err := a.store.UpdateAccount(r.Context(), hash, func(account *Account) error {
		a.saveCourseLocation(account)
		if input.CourseID != account.ActiveCourseID {
			if a.billing != nil {
				settlePlay(account, a.now().UTC())
			}
			account.Access.Generation++
			account.Access.ActiveSince = time.Time{}
			account.Access.ActiveUntil = time.Time{}
			account.Access.SessionLeases = nil
			saved, exists := account.CourseStates[input.CourseID]
			if !exists {
				saved = CourseState{Progress: newProgress(), Player: courseStartingPlayer(account.Player, course)}
			}
			name, avatar, id := account.Player.Name, account.Player.Avatar, account.Player.ID
			account.Progress = saved.Progress
			ensureProgress(&account.Progress)
			account.StorySaves = saved.StorySaves
			account.RewardedQuestIDs = saved.RewardedQuestIDs
			account.RewardedExpeditionIDs = saved.RewardedExpeditionIDs
			account.Player = saved.Player
			account.Player.ID = id
			account.Player.Name = name
			account.Player.Avatar = avatar
			account.ActiveCourseID = input.CourseID
			if exists && !a.classroomCourse(input.CourseID) {
				account.Player, saved.LocationFrame = a.world.RestoreSavedCourseLocation(account.Player, saved.LocationFrame)
				account.CourseStates[input.CourseID] = saved
			}
		}
		account.Preferences.BaseLanguage = input.SupportLanguage
		c := a.courseCurricula[input.CourseID]
		migrateContextExposures(&account.Progress, c, a.now().UTC())
		migrateIntake(&account.Progress, c.Syllabus)
		introduceDue(&account.Progress, c.Syllabus, a.now().UTC())
		store.SnapshotCourse(account)
		return nil
	})
	if err != nil {
		apiFailure(w, err)
		return
	}
	// Close an old socket before its next position save can overwrite the newly
	// restored course's location. Its access generation guard also rejects writes.
	a.world.ResetPlayer(account.Player.ID)
	writeJSON(w, 200, map[string]any{"course": publicCourse(course), "activeCourseId": account.ActiveCourseID, "player": account.Player, "progress": account.Progress, "preferences": account.Preferences})
}
func publicCourse(c contentstore.Course) map[string]any {
	data, _ := json.Marshal(c)
	var out map[string]any
	_ = json.Unmarshal(data, &out)
	delete(out, "slug")
	return out
}

func (a *App) readContent(w http.ResponseWriter, r *http.Request) {
	account, ok := a.contentAccount(w, r)
	if !ok {
		return
	}
	path := strings.TrimPrefix(r.URL.Path, "/api/content/")
	if path == "sentences" || path == "lexemes" {
		a.contentBatch(w, r, account, path)
		return
	}
	if path == "units" {
		a.contentUnits(w, r, account)
		return
	}
	kind, id, has := strings.Cut(path, "/")
	limits := map[string]int{"bootstrap": 6, "graphs": 10, "exercises": 60, "units": 60, "expeditions": 30, "minigames": 30, "contexts": 60}
	if !a.contentBudget(w, account, kind, limits[kind], 1) {
		return
	}
	var record contentstore.Record
	if path == "bootstrap" {
		for _, candidate := range a.content.Records {
			if candidate.Kind == "bootstrap" && candidate.CourseID == account.ActiveCourseID {
				record = candidate
				break
			}
		}
	} else {
		if !has || !contentstore.UUID.MatchString(id) {
			writeError(w, 400, "content IDs must be UUIDs")
			return
		}
		record = a.content.ByID[a.canonical.Translate(strings.ToLower(id), true)]
		singular := map[string]string{"graphs": "graph", "exercises": "exercise", "units": "unit", "expeditions": "expedition", "minigames": "minigame", "contexts": "context"}[kind]
		if record.Kind != singular {
			record = contentstore.Record{}
		}
	}
	if record.ID == "" || !a.recordVisible(record, account) {
		a.contentMissing(w, account, kind)
		return
	}
	value := a.publicRecordForAccount(record, account)
	if record.Kind == "bootstrap" {
		body := value["body"].(map[string]any)
		counts := map[string]int{}
		for _, candidate := range a.content.Records {
			if candidate.CourseID == account.ActiveCourseID {
				counts[candidate.Kind]++
			}
		}
		body["counts"] = counts
		body["course"] = publicCourse(a.content.ByCourse[account.ActiveCourseID])
	}
	a.writeContent(w, r, account, value)
}
func (a *App) contentBudget(w http.ResponseWriter, account Account, kind string, limit, count int) bool {
	if limit < 1 {
		writeError(w, 404, "content not found")
		return false
	}
	if !a.allowCount("content:"+account.Player.ID+":"+kind, limit, count) {
		slog.Info("content read limited", "account", account.Player.ID, "kind", kind, "records", count, "status", 429)
		w.Header().Set("Retry-After", "60")
		writeError(w, 429, "content read budget exhausted; try again in a minute")
		return false
	}
	return true
}
func (a *App) contentMissing(w http.ResponseWriter, account Account, kind string) {
	slog.Info("content record unavailable", "account", account.Player.ID, "kind", kind, "status", 404)
	writeError(w, 404, "content not found")
}
func (a *App) contentBatch(w http.ResponseWriter, r *http.Request, account Account, path string) {
	ids := strings.Split(r.URL.Query().Get("ids"), ",")
	cap, limit, kind := 12, 120, "sentence"
	if path == "lexemes" {
		cap, limit, kind = 24, 240, "lexeme"
	}
	if len(ids) < 1 || len(ids) > cap {
		writeError(w, 400, fmt.Sprintf("request 1 to %d UUIDs", cap))
		return
	}
	seen := map[string]bool{}
	for _, id := range ids {
		if !contentstore.UUID.MatchString(id) {
			writeError(w, 400, "content IDs must be UUIDs")
			return
		}
		if seen[id] {
			writeError(w, 400, "request each content UUID once")
			return
		}
		seen[id] = true
	}
	if !a.contentBudget(w, account, path, limit, len(ids)) {
		return
	}
	records := []map[string]any{}
	for _, id := range ids {
		record, exists := a.content.ByID[a.canonical.Translate(strings.ToLower(id), true)]
		if exists && record.Kind == kind && a.recordVisible(record, account) {
			records = append(records, a.publicRecordForAccount(record, account))
		} else {
			slog.Info("content batch record unavailable", "account", account.Player.ID, "kind", kind, "status", 404)
		}
	}
	a.writeContent(w, r, account, map[string]any{"records": records})
}
func (a *App) contentUnits(w http.ResponseWriter, r *http.Request, account Account) {
	offset, err := strconv.Atoi(r.URL.Query().Get("offset"))
	if r.URL.Query().Get("offset") == "" {
		offset = 0
		err = nil
	}
	if err != nil || offset < 0 || offset > 100000 {
		writeError(w, 400, "invalid offset")
		return
	}
	limit := 12
	if value := r.URL.Query().Get("limit"); value != "" {
		limit, err = strconv.Atoi(value)
	}
	if err != nil || limit < 1 || limit > 24 {
		writeError(w, 400, "limit must be 1 to 24")
		return
	}
	var visible []contentstore.Record
	for _, record := range a.content.Records {
		if record.Kind == "unit" && a.recordVisible(record, account) {
			visible = append(visible, record)
		}
	}
	sort.Slice(visible, func(i, j int) bool { return visible[i].Slug < visible[j].Slug })
	end := min(len(visible), offset+limit)
	start := min(offset, len(visible))
	if !a.contentBudget(w, account, "units", 60, max(1, end-start)) {
		return
	}
	records := []map[string]any{}
	for _, record := range visible[start:end] {
		records = append(records, a.publicRecordForAccount(record, account))
	}
	a.writeContent(w, r, account, map[string]any{"records": records, "total": len(visible), "offset": offset, "nextOffset": end})
}

const contentWireVersion = "content-api-v2"

func (a *App) writeContent(w http.ResponseWriter, r *http.Request, account Account, value any) {
	data, _ := json.Marshal(value)
	if a.canonical != nil {
		data = a.canonical.Raw(data, true)
	}
	identity := contentWireVersion + ":" + account.Player.ID + ":" + account.ActiveCourseID + ":" + account.Preferences.BaseLanguage + ":" + strconv.FormatInt(account.Progress.Revision, 10)
	hash := sha256.Sum256(append([]byte(identity), data...))
	etag := `"` + hex.EncodeToString(hash[:]) + `"`
	w.Header().Set("ETag", etag)
	w.Header().Set("Cache-Control", "private, max-age=0, must-revalidate")
	w.Header().Add("Vary", "Authorization")
	if r.Header.Get("If-None-Match") == etag {
		w.WriteHeader(http.StatusNotModified)
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(data)
}
func (a *App) publicRecord(record contentstore.Record, lang string) map[string]any {
	var value any
	_ = json.Unmarshal(record.Body, &value)
	return map[string]any{"id": record.ID, "courseId": record.CourseID, "kind": record.Kind, "version": record.Version, "body": stripContent(value, lang, "")}
}

var secretContentKeys = map[string]bool{"answer": true, "acceptedAnswers": true, "explanation": true, "orderExplanation": true, "modelAnswer": true, "correctedAnswer": true, "correctAnswer": true, "correct": true, "answerIndex": true, "correctIndex": true, "solution": true, "solutions": true, "validValues": true, "answers": true, "canonical": true, "response": true, "expected": true, "localId": true, "legacyId": true}

func stripContent(value any, lang, parent string) any {
	switch v := value.(type) {
	case map[string]any:
		out := map[string]any{}
		for key, item := range v {
			if secretContentKeys[key] || key == "authoring" || key == "owners" || key == "slug" {
				continue
			}
			if parent == "translations" || parent == "meanings" || parent == "glosses" || parent == "support" || strings.HasSuffix(parent, "Translations") {
				if key != lang {
					continue
				}
			}
			out[key] = stripContent(item, lang, key)
		}
		return out
	case []any:
		for i, item := range v {
			v[i] = stripContent(item, lang, parent)
		}
		return v
	default:
		return value
	}
}
func (a *App) recordVisible(record contentstore.Record, account Account) bool {
	if record.CourseID != account.ActiveCourseID {
		return false
	}
	if record.Kind == "bootstrap" {
		return true
	}
	var body map[string]any
	if json.Unmarshal(record.Body, &body) != nil {
		return false
	}
	id := record.Slug
	if id == "" && a.canonical != nil {
		id = a.canonical.Translate(record.ID, false)
	}
	switch record.Kind {
	case "graph":
		quest, _ := body["questId"].(string)
		if quest == "" {
			quest = id
		}
		quest = a.canonical.Translate(quest, false)
		return a.questVisible(quest, account)
	case "exercise":
		exercise, ok := a.curriculum.Exercises[id]
		if !ok {
			return false
		}
		return a.exerciseVisible(exercise, account) || a.placementExerciseVisible(exercise.ID, account)
	case "unit":
		unit, ok := a.curriculum.Units[id]
		if !ok {
			return false
		}
		return a.levelVisible(unit.Level, account)
	case "expedition":
		mapID, _ := body["mapId"].(string)
		if mapID == "" {
			mapID = stringValue(body["routeId"])
		}
		if mapID == "" {
			mapID = id
		}
		return routeUnlocked(mapID, account.Progress.CompletedQuestIDs)
	case "minigame":
		levels := stringValues(body["levels"])
		if len(levels) > 0 {
			available := false
			for _, level := range levels {
				if a.levelVisible(level, account) {
					available = true
					break
				}
			}
			if !available {
				return false
			}
		}
		quests := stringValues(body["questIds"])
		if len(quests) > 0 {
			available := false
			for _, quest := range quests {
				if a.questVisible(a.canonical.Translate(quest, false), account) {
					available = true
					break
				}
			}
			if !available {
				return false
			}
		}
		if mapID, _ := body["regionId"].(string); mapID != "" && !routeUnlocked(mapID, account.Progress.CompletedQuestIDs) {
			return false
		}
		for _, word := range stringValues(body["wordIds"]) {
			if !account.Progress.WordIntroduced(a.canonical.Translate(word, false)) {
				return false
			}
		}
		return a.levelVisible(stringValue(body["level"]), account)
	case "lexeme":
		if account.Progress.WordIntroduced(id) {
			return true
		}
		if _, ok := account.Progress.Words[id]; ok {
			return true
		}
		for _, sentenceID := range a.lexemeSentences[record.ID] {
			sentence := a.content.ByID[sentenceID]
			var body map[string]any
			if json.Unmarshal(sentence.Body, &body) == nil && a.sentenceVisible(body, account) {
				return true
			}
		}
		return false
	case "sentence", "context":
		return a.sentenceVisible(body, account)
	}
	return false
}
func (a *App) levelVisible(level string, account Account) bool {
	if level == "" || level == "A0" || level == "A1" {
		return true
	}
	if level == "A2" {
		return routeUnlocked("waldruh", account.Progress.CompletedQuestIDs)
	}
	if level == "B1" {
		return routeUnlocked("nebelstadt", account.Progress.CompletedQuestIDs)
	}
	return false
}
func (a *App) questVisible(id string, account Account) bool {
	if _, ok := a.curriculum.Quests[id]; !ok {
		return false
	}
	if contains(account.Progress.CompletedQuestIDs, id) {
		return true
	}
	return a.requireQuestAccess(id, &account.Progress) == nil
}
func (a *App) exerciseVisible(e Exercise, account Account) bool {
	if a.stationExerciseVisible(e.ID, account) {
		return true
	}
	if e.TargetWordID != "" {
		return account.Progress.WordIntroduced(e.TargetWordID)
	}
	for _, quest := range a.curriculum.Quests {
		if contains(quest.RequiredItemIDs, e.ItemID) {
			return a.questVisible(quest.ID, account)
		}
	}
	return a.levelVisible(a.curriculum.Items[e.ItemID].Level, account)
}
func (a *App) sentenceVisible(body map[string]any, account Account) bool {
	owners := anyValues(body["owners"])
	if len(owners) == 0 {
		return false
	}
	for _, entry := range owners {
		owner, _ := entry.(map[string]any)
		if raw, ok := owner["condition"]; ok {
			data, _ := json.Marshal(raw)
			var condition StoryCondition
			if json.Unmarshal(data, &condition) != nil || !condition.met(&account.Progress.Story) {
				continue
			}
		}
		id := stringValue(owner["id"])
		kind := stringValue(owner["kind"])
		if kind == "graph" {
			graph := a.content.ByID[id]
			if graph.ID == "" {
				continue
			}
			var g map[string]any
			_ = json.Unmarshal(graph.Body, &g)
			quest := a.canonical.Translate(stringValue(g["questId"]), false)
			if !a.questVisible(quest, account) {
				continue
			}
			if contains(account.Progress.CompletedQuestIDs, quest) {
				return true
			}
			node := stringValue(owner["nodeId"])
			if node == "" {
				return true
			}
			stage := node
			if slug, ok := a.canonical.ReverseID(node); ok {
				_, stage, _ = strings.Cut(slug, ":")
			}
			current := storyNode(&account.Progress, quest)
			if stage == current {
				return true
			}
			continue
		}
		id = a.canonical.Translate(id, false)
		switch kind {
		case "quest", "story", "narrative":
			if a.questVisible(id, account) {
				return true
			}
		case "exercise":
			if e, ok := a.curriculum.Exercises[id]; ok && (a.exerciseVisible(e, account) || a.placementExerciseVisible(e.ID, account)) {
				if e.Mode == "production" && genericNormalize(stringValue(body["text"]), a.curriculum.Grading, false) == genericNormalize(e.Answer, a.curriculum.Grading, false) {
					continue
				}
				return true
			}
		case "unit":
			if unit, ok := a.curriculum.Units[id]; ok && a.levelVisible(unit.Level, account) {
				return true
			}
			if id == "" && a.levelVisible(stringValue(owner["level"]), account) {
				return true
			}
		case "lexeme":
			if account.Progress.WordIntroduced(id) {
				return true
			}
		case "activity":
			if a.levelVisible(stringValue(owner["level"]), account) {
				return true
			}
		case "expedition":
			mapID := stringValue(owner["routeId"])
			if mapID == "" {
				mapID = stringValue(owner["mapId"])
			}
			if mapID != "" && routeUnlocked(mapID, account.Progress.CompletedQuestIDs) {
				return true
			}
		case "npc":
			if a.levelVisible(stringValue(owner["level"]), account) {
				return true
			}
		case "interior":
			if a.validInterior(DefaultMapID, id) {
				return true
			}
		case "specialItem":
			for _, item := range account.Progress.Story.Inventory {
				if id != "" && a.canonical.Translate(item, false) == id {
					return true
				}
			}
		case "storyEnding":
			if id != "" && account.Progress.Story.Ending == id {
				return true
			}
		case "placement":
			if id == account.ActiveCourseID && a.placementEligible(account) {
				return true
			}
		case "object":
			for mapID := range a.world.Maps() {
				if strings.HasPrefix(id, mapID+"-") && routeUnlocked(mapID, account.Progress.CompletedQuestIDs) {
					return true
				}
			}
			for _, rule := range a.curriculum.StoryRules {
				if a.questVisible(rule.QuestID, account) {
					for _, object := range rule.Objects {
						if object.ID == id {
							return true
						}
					}
				}
			}

		case "minigame":
			if record, ok := a.content.ByID[stringValue(owner["id"])]; ok && a.recordVisible(record, account) {
				return true
			}
		case "journal":
			return true
		case "act":
			if a.levelVisible(stringValue(owner["level"]), account) {
				return true
			}
		}
	}
	return false
}
func stringValue(v any) string { s, _ := v.(string); return s }
func anyValues(v any) []any    { a, _ := v.([]any); return a }
func stringValues(v any) []string {
	var out []string
	for _, value := range anyValues(v) {
		if s, ok := value.(string); ok {
			out = append(out, s)
		}
	}
	return out
}

func (a *App) enrollCourse(w http.ResponseWriter, r *http.Request) {
	hash, err := bearer(r)
	if err != nil {
		apiFailure(w, err)
		return
	}
	if a.content == nil {
		writeError(w, 503, "learning content is not installed")
		return
	}
	var input struct {
		CourseID        string `json:"courseId"`
		SupportLanguage string `json:"supportLanguage"`
	}
	if err = decodeJSON(w, r, &input); err != nil {
		apiFailure(w, err)
		return
	}
	course, ok := a.content.ByCourse[input.CourseID]
	if !ok {
		writeError(w, 404, "course not found")
		return
	}
	if !contains(course.SupportLanguages, input.SupportLanguage) {
		writeError(w, 400, "choose a support language declared by this course")
		return
	}
	account, err := a.store.UpdateAccount(r.Context(), hash, func(account *Account) error {
		if account.CourseStates == nil {
			account.CourseStates = map[string]CourseState{}
		}
		if _, ok := account.CourseStates[input.CourseID]; !ok {
			account.CourseStates[input.CourseID] = CourseState{Progress: newProgress(), Player: courseStartingPlayer(account.Player, course), SupportLanguage: input.SupportLanguage}
		}
		return nil
	})
	if err != nil {
		apiFailure(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"course": publicCourse(course), "activeCourseId": account.ActiveCourseID, "enrolled": true})
}

// Recovery stays on the attempt endpoint, checks the persisted account/course
// evidence, and records answer assistance without manufacturing an attempt.
func (a *App) recoverAnswer(w http.ResponseWriter, r *http.Request, hash string, input AttemptInput) {
	if input.Answer != "" || input.Preview || input.ExerciseID == "" {
		writeError(w, 400, "recover an exercise using only its ID")
		return
	}
	exercise, exists := a.curriculum.Exercises[input.ExerciseID]
	if !exists {
		writeError(w, 404, "exercise not found")
		return
	}
	account, err := a.getAccount(r.Context(), hash)
	if err != nil {
		apiFailure(w, err)
		return
	}
	if !a.allow("answer-recovery:"+account.Player.ID, 60) {
		slog.Info("answer recovery limited", "account", account.Player.ID, "status", 429)
		writeError(w, 429, "too many answer recoveries; try again in a minute")
		return
	}
	eligible, err := a.hasRecordedExercise(r.Context(), hash, account, input.ExerciseID)
	if err != nil {
		apiFailure(w, err)
		return
	}
	if !a.exerciseVisible(exercise, account) || !eligible {
		writeError(w, 409, "record your first answer before showing the model answer")
		return
	}
	ctx := r.Context()
	if ctx.Value(accessGenerationKey{}) == nil {
		ctx = context.WithValue(ctx, accessGenerationKey{}, account.Access.Generation)
	}
	account, err = a.store.UpdateAccount(ctx, hash, func(account *Account) error {
		if err := checkAccessGeneration(ctx, *account); err != nil {
			return err
		}
		now := a.now().UTC()
		if status := a.accessState(*account, now); accessBlocked(status) {
			return &AccessDeniedError{Access: status}
		}
		ensureStory(&account.Progress)
		if account.Progress.AnswerHelpAt == nil {
			account.Progress.AnswerHelpAt = map[string]time.Time{}
		}
		account.Progress.Story.Flags["answer-help:"+input.ExerciseID] = true
		account.Progress.AnswerHelpAt[input.ExerciseID] = now
		account.Progress.Revision++
		return nil
	})
	if err != nil {
		apiFailure(w, err)
		return
	}
	reason := a.courseFeedback(exercise, exercise.Answer, account.Preferences.BaseLanguage)
	writeJSON(w, 200, map[string]any{"recovered": true, "exerciseId": input.ExerciseID, "correctedAnswer": exercise.Answer, "reason": reason, "xpAdded": 0, "progress": account.Progress})
}

func (a *App) publicRecordForAccount(record contentstore.Record, account Account) map[string]any {
	value := a.publicRecord(record, account.Preferences.BaseLanguage)
	if record.Kind == "graph" {
		body, _ := value["body"].(map[string]any)
		a.applyStoryOverrides(body, account.Preferences.BaseLanguage)
		for _, entry := range anyValues(body["investigations"]) {
			object, _ := entry.(map[string]any)
			id := stringValue(object["objectId"])
			worldID := a.canonical.Translate(id, false)
			if worldID != "" {
				object["worldId"] = worldID
				object["objectId"] = a.canonical.Translate(worldID, true)
			}
		}
		return value
	}
	if record.Kind == "bootstrap" {
		body, _ := value["body"].(map[string]any)
		a.filterBootstrap(body, account)
		return value
	}
	if record.Kind == "context" {
		body, _ := value["body"].(map[string]any)
		if stringValue(body["category"]) == "expeditionGame" {
			a.publicExpeditionGame(body, account)
		}
		return value
	}
	if record.Kind == "minigame" {
		body, _ := value["body"].(map[string]any)
		exerciseIDs := []string{}
		for id, binding := range a.curriculum.MiniGameContent {
			if binding.MiniGameID == record.Slug && a.levelVisible(binding.Level, account) {
				if uuid, ok := a.canonical.ForwardID(id); ok {
					exerciseIDs = append(exerciseIDs, uuid)
				}
			}
		}
		sort.Strings(exerciseIDs)
		body["exerciseIds"] = exerciseIDs
		if scripts, ok := body["scripts"].(map[string]any); ok {
			for level := range scripts {
				if validLevel(level) && !a.levelVisible(level, account) {
					delete(scripts, level)
				}
			}
		}
		return value
	}
	if record.Kind != "exercise" {
		return value
	}
	body, _ := value["body"].(map[string]any)
	exercise, ok := a.curriculum.Exercises[record.Slug]
	if !ok {
		return value
	}
	words := make([]string, 0, len(exercise.WordIDs))
	for _, word := range exercise.WordIDs {
		words = append(words, a.canonical.Translate(word, true))
	}
	body["wordIds"] = words
	attempted := account.Progress.ExerciseStats[exercise.ID].Attempts > 0
	body["answerAvailable"] = attempted
	if exercise.Mode == "production" {
		if sentenceID, ok := body["sentenceId"].(string); ok {
			sentence := a.content.ByID[sentenceID]
			var s map[string]any
			_ = json.Unmarshal(sentence.Body, &s)
			if genericNormalize(stringValue(s["text"]), a.curriculum.Grading, false) == genericNormalize(exercise.Answer, a.curriculum.Grading, false) {
				delete(body, "sentenceId")
			}
		}
		// Legacy hints occasionally quote the entire authored target. Treat those
		// quotes as answer disclosure while preserving ordinary form/meaning hints.
		var redact func(any)
		redact = func(v any) {
			if m, ok := v.(map[string]any); ok {
				for key, item := range m {
					if key == "hint" || key == "example" {
						if text, ok := item.(string); ok && strings.Contains(strings.ToLower(text), strings.ToLower(strings.TrimRight(exercise.Answer, ".!?"))) {
							delete(m, key)
							continue
						}
					}
					redact(item)
				}
			}
		}
		redact(body)
	}
	return value
}

func (a *App) filterBootstrap(body map[string]any, account Account) {
	activeLevel := "A1"
	if a.levelVisible("A2", account) {
		activeLevel = "A2"
	}
	if a.levelVisible("B1", account) {
		activeLevel = "B1"
	}
	acts := []any{}
	for _, entry := range anyValues(body["acts"]) {
		act, _ := entry.(map[string]any)
		// All regions keep a safe map/act skeleton. Only opened acts carry narrative
		// references, so atlas navigation does not lose future destination metadata.
		if level := stringValue(act["level"]); level != activeLevel && !a.levelVisible(level, account) {
			skeleton := map[string]any{}
			for _, key := range []string{"mapId", "level", "number", "title"} {
				if v, ok := act[key]; ok {
					skeleton[key] = v
				}
			}
			act = skeleton
		}
		acts = append(acts, act)
	}
	body["acts"] = acts
	clues := []any{}
	for _, entry := range anyValues(body["clues"]) {
		clue, _ := entry.(map[string]any)
		if contains(account.Progress.CompletedQuestIDs, a.canonical.Translate(stringValue(clue["questId"]), false)) {
			clues = append(clues, clue)
		}
	}
	body["clues"] = clues
	contexts := []any{}
	for _, entry := range anyValues(body["contexts"]) {
		context, _ := entry.(map[string]any)
		record := a.content.ByID[stringValue(context["id"])]
		if record.ID != "" && a.recordVisible(record, account) {
			contexts = append(contexts, context)
		}
	}
	body["contexts"] = contexts
	var prune func(any) any
	prune = func(value any) any {
		switch v := value.(type) {
		case map[string]any:
			if id, ok := v["sentenceId"].(string); ok {
				record := a.content.ByID[id]
				if record.ID == "" || !a.recordVisible(record, account) {
					return nil
				}
			}
			out := map[string]any{}
			for k, x := range v {
				if y := prune(x); y != nil {
					out[k] = y
				}
			}
			return out
		case []any:
			out := []any{}
			for _, x := range v {
				if y := prune(x); y != nil {
					out = append(out, y)
				}
			}
			return out
		default:
			return v
		}
	}
	for _, key := range []string{"npcs", "acts", "clues", "objects", "journalNarratives"} {
		body[key] = prune(body[key])
	}
}
