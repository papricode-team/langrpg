package main

import (
	"context"
	"encoding/json"
	"net/http"
	"slices"
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

type ExpeditionPlanState struct {
	Level     string         `json:"level"`
	Values    map[string]int `json:"values"`
	Order     []string       `json:"order"`
	Completed bool           `json:"completed"`
	Attempts  int            `json:"attempts"`
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
		Selected    int    `json:"selected"`
	}
	if err = decodeJSON(w, r, &input); err != nil {
		apiFailure(w, err)
		return
	}
	if !safeID.MatchString(input.ID) {
		writeError(w, 400, "invalid encounter action ID")
		return
	}
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
	if rule == nil || input.Selected < 0 || input.Selected >= len(rule.Choices) {
		writeError(w, 400, "unknown encounter or choice")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()
	request, _ := json.Marshal(input)
	account, _, duplicate, err := a.store.Mutate(ctx, hash, "expedition:"+input.ID, request, func(account *Account) (Receipt, error) {
		if !routeUnlocked(rule.MapID, account.Progress.CompletedQuestIDs) {
			return Receipt{}, routeLockedError(rule.MapID)
		}
		s := &account.Progress.Story
		record := s.Expeditions[input.EncounterID]
		record.Selected = input.Selected
		record.Correct = rule.Choices[input.Selected]
		record.Attempts++
		s.Expeditions[input.EncounterID] = record
		return Receipt{}, nil
	})
	if err != nil {
		apiFailure(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"record": account.Progress.Story.Expeditions[input.EncounterID], "progress": account.Progress, "duplicate": duplicate})
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
	account, receipt, duplicate, err := a.store.Mutate(ctx, hash, "expedition-plan:"+input.ID, request, func(account *Account) (Receipt, error) {
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
			s.ExpeditionPlans[key] = ExpeditionPlanState{input.Level, input.Values, input.Order, correct, previous.Attempts + 1}
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
	plan := ExpeditionPlanState{input.Level, input.Values, input.Order, correct, account.Progress.Story.ExpeditionPlans[key].Attempts}
	writeJSON(w, 200, map[string]any{"correct": correct, "plan": plan, "progress": account.Progress, "xpAdded": added, "duplicate": duplicate})
}
