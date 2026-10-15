package main

import (
	"context"
	"encoding/json"
	"glotworld/server/internal/store"
	"net/http"
	"slices"
	"strings"
	"time"
)

type expeditionRule struct {
	ID      string `json:"id"`
	MapID   string `json:"mapId"`
	Choices []bool `json:"choices"`
}
type expeditionField struct {
	ID     string `json:"id"`
	Values []int  `json:"values"`
}
type expeditionGameRule struct {
	ID          string            `json:"id"`
	Fields      []expeditionField `json:"fields"`
	ValidValues [][]int           `json:"validValues"`
	Order       []string          `json:"order"`
}
type expeditionManifest struct {
	Encounters []expeditionRule     `json:"encounters"`
	Games      []expeditionGameRule `json:"games"`
}

// Completed agreements predate these flexible timing fields. Keep the earned
// route/order and annotate only the newly introduced field with its default;
// unfinished drafts must still choose a time themselves.
func migrateExpeditionPlans(plans map[string]ExpeditionPlanState) {
	defaults := map[string]struct {
		field string
		value int
	}{
		"saffroncourt": {"arrival", 17},
		"terracielo":   {"pickup", 15},
		"sunpatch":     {"broadcast", 7},
	}
	for key, plan := range plans {
		mapID, level, ok := strings.Cut(key, ":")
		entry, known := defaults[mapID]
		if !ok || !validLevel(level) || !known || !plan.Completed {
			continue
		}
		if _, exists := plan.Values[entry.field]; exists {
			continue
		}
		if plan.Values == nil {
			plan.Values = map[string]int{}
		}
		plan.Values[entry.field] = entry.value
		plans[key] = plan
	}
}

func expeditionContent() (expeditionManifest, error) {
	b, err := curriculumFiles.ReadFile("expeditions.json")
	if err != nil {
		return expeditionManifest{}, err
	}
	var manifest expeditionManifest
	err = json.Unmarshal(b, &manifest)
	return manifest, err
}

func (a *App) answerExpedition(w http.ResponseWriter, r *http.Request) {
	hash, err := bearer(r)
	if err != nil {
		apiFailure(w, err)
		return
	}
	var input struct {
		ID          string `json:"id"`
		EncounterID string `json:"encounterId"`
		Selected    *int   `json:"selected"`
	}
	if err = decodeJSON(w, r, &input); err != nil {
		apiFailure(w, err)
		return
	}
	if !safeID.MatchString(input.ID) {
		writeError(w, 400, "invalid encounter action ID")
		return
	}
	if input.Selected == nil {
		writeError(w, 400, "select an encounter reply before submitting")
		return
	}
	selected := *input.Selected
	manifest, err := expeditionContent()
	if err != nil {
		apiFailure(w, err)
		return
	}
	var rule *expeditionRule
	for i := range manifest.Encounters {
		if manifest.Encounters[i].ID == input.EncounterID {
			rule = &manifest.Encounters[i]
			break
		}
	}
	if rule == nil || selected < 0 || selected >= len(rule.Choices) {
		writeError(w, 400, "unknown encounter or choice")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()
	request, _ := json.Marshal(input)
	account, receipt, duplicate, err := a.mutate(ctx, hash, "expedition:"+input.ID, request, func(account *Account) (Receipt, error) {
		if !routeUnlocked(rule.MapID, account.Progress.CompletedQuestIDs) {
			return Receipt{}, routeLockedError(rule.MapID)
		}
		s := &account.Progress.Story
		record := s.Expeditions[input.EncounterID]
		record.Selected = selected
		record.Correct = rule.Choices[selected]
		record.Attempts++
		s.Expeditions[input.EncounterID] = record
		correct := record.Correct
		return Receipt{Correct: &correct}, nil
	})
	if err != nil {
		apiFailure(w, err)
		return
	}
	record := account.Progress.Story.Expeditions[input.EncounterID]
	record.Selected, record.Correct = selected, rule.Choices[selected]
	if receipt.Correct != nil {
		record.Correct = *receipt.Correct
	}
	feedback := a.contentExpeditionFeedback(input.EncounterID, selected, store.NormalizePreferences(account.Preferences).BaseLanguage)
	result := map[string]any{"record": record, "progress": account.Progress, "duplicate": duplicate, "correct": record.Correct, "feedback": feedback, "explanation": feedback}
	writeJSON(w, 200, result)
}

// Called only after the selected answer has committed, including safe retries.
func (a *App) contentExpeditionFeedback(encounterID string, selected int, language string) string {
	if a.content == nil {
		return ""
	}
	id := a.content.IDs["expedition:"+encounterID]
	record, exists := a.content.ByID[id]
	if !exists || record.CourseID != a.curriculum.CourseID {
		return ""
	}
	var body map[string]any
	if json.Unmarshal(record.Body, &body) != nil {
		return ""
	}
	choices := anyValues(body["choices"])
	if selected < 0 || selected >= len(choices) {
		return ""
	}
	choice, _ := choices[selected].(map[string]any)
	if support, ok := choice["support"].(map[string]any); ok {
		if localized, ok := support[language].(map[string]any); ok {
			if response := stringValue(localized["response"]); response != "" {
				return response
			}
		}
	}
	return stringValue(choice["response"])
}

func (a *App) planExpedition(w http.ResponseWriter, r *http.Request) {
	hash, err := bearer(r)
	if err != nil {
		apiFailure(w, err)
		return
	}
	var input struct {
		ID     string         `json:"id"`
		MapID  string         `json:"mapId"`
		Level  string         `json:"level"`
		Values map[string]int `json:"values"`
		Order  []string       `json:"order"`
	}
	if err = decodeJSON(w, r, &input); err != nil {
		apiFailure(w, err)
		return
	}
	if !safeID.MatchString(input.ID) || !validLevel(input.Level) {
		writeError(w, 400, "invalid neighborhood plan or scaffold")
		return
	}
	manifest, err := expeditionContent()
	if err != nil {
		apiFailure(w, err)
		return
	}
	var rule *expeditionGameRule
	for i := range manifest.Games {
		if manifest.Games[i].ID == input.MapID {
			rule = &manifest.Games[i]
			break
		}
	}
	if rule == nil || len(input.Values) != len(rule.Fields) || len(input.Order) > len(rule.Order) {
		writeError(w, 400, "unknown neighborhood plan or fields")
		return
	}
	values := []int{}
	for _, field := range rule.Fields {
		value, ok := input.Values[field.ID]
		if !ok || !slices.Contains(field.Values, value) {
			writeError(w, 400, "a plan field is outside its authored options")
			return
		}
		values = append(values, value)
	}
	seen := map[string]bool{}
	for _, id := range input.Order {
		if !contains(rule.Order, id) || seen[id] {
			writeError(w, 400, "the sequence contains an unknown or repeated step")
			return
		}
		seen[id] = true
	}
	correct := false
	if slices.Equal(input.Order, rule.Order) {
		for _, valid := range rule.ValidValues {
			if slices.Equal(values, valid) {
				correct = true
				break
			}
		}
	}
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()
	request, _ := json.Marshal(input)
	key := input.MapID + ":" + input.Level
	account, receipt, duplicate, err := a.mutate(ctx, hash, "expedition-plan:"+input.ID, request, func(account *Account) (Receipt, error) {
		if !routeUnlocked(input.MapID, account.Progress.CompletedQuestIDs) {
			return Receipt{}, routeLockedError(input.MapID)
		}
		s := &account.Progress.Story
		previous := s.ExpeditionPlans[key]
		if previous.Completed && !correct {
			// A later practice draft cannot erase an agreement already earned.
			// Retain its successful values for the notebook, counting the retry.
			previous.Attempts++
			s.ExpeditionPlans[key] = previous
		} else {
			s.ExpeditionPlans[key] = ExpeditionPlanState{Level: input.Level, Values: input.Values, Order: input.Order, Completed: correct, Attempts: previous.Attempts + 1}
		}
		reward := 0
		flag := "expedition:" + key
		if correct {
			s.Flags[flag] = true
			if !contains(account.RewardedExpeditionIDs, key) {
				account.RewardedExpeditionIDs = append(account.RewardedExpeditionIDs, key)
				reward = 30
				account.Progress.XP += reward
			}
		}
		return Receipt{XPAdded: reward}, nil
	})
	if err != nil {
		apiFailure(w, err)
		return
	}
	added := receipt.XPAdded
	if duplicate {
		added = 0
	}
	// Return the tested draft separately from the permanent earned agreement.
	// The editor can show an incorrect retry while the notebook stays intact.
	plan := ExpeditionPlanState{Level: input.Level, Values: input.Values, Order: input.Order, Completed: correct, Attempts: account.Progress.Story.ExpeditionPlans[key].Attempts}
	result := map[string]any{"correct": correct, "plan": plan, "progress": account.Progress, "xpAdded": added, "duplicate": duplicate}
	if correct {
		if agreement := a.expeditionAgreement(input.MapID, input.Values); agreement != "" {
			result["agreement"] = agreement
		}
	}
	writeJSON(w, 200, result)
}
