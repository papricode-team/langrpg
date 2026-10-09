package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"time"
)

func (a *App) completeUnit(w http.ResponseWriter, r *http.Request) {
	hash, err := bearer(r)
	if err != nil {
		apiFailure(w, err)
		return
	}
	if !a.allow("course:"+hash, 60) {
		writeError(w, 429, "too many course requests; try again in a minute")
		return
	}
	var input struct {
		UnitID string `json:"unitId"`
	}
	if err = decodeJSON(w, r, &input); err != nil {
		apiFailure(w, err)
		return
	}
	unit, exists := a.curriculum.Units[input.UnitID]
	if !exists {
		writeError(w, 400, "unknown course unit")
		return
	}
	request, _ := json.Marshal(input)
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()
	account, receipt, duplicate, err := a.store.Mutate(ctx, hash, "unit:"+unit.ID, request, func(account *Account) (Receipt, error) {
		ensureProgress(&account.Progress)
		if contains(account.Progress.CompletedUnitIDs, unit.ID) {
			return Receipt{}, nil
		}
		for _, id := range unit.RequiredExerciseIDs {
			stats := account.Progress.ExerciseStats[id]
			if stats.Correct == 0 {
				return Receipt{}, &APIError{409, fmt.Sprintf("answer every required exercise first (missing %s)", id)}
			}
			if a.curriculum.Exercises[id].TargetWordID != "" && stats.UnaidedSuccesses == 0 {
				return Receipt{}, &APIError{409, fmt.Sprintf("recall the word independently in this exercise first (missing %s)", id)}
			}
		}
		for _, id := range unit.RequiredWordIDs {
			word := account.Progress.Words[id]
			successes := 0
			for _, stats := range word.ModeStats {
				successes += stats.UnaidedSuccesses
			}
			if successes == 0 {
				return Receipt{}, &APIError{409, fmt.Sprintf("recall each required word independently first (missing %s)", id)}
			}
		}
		for _, id := range unit.RequiredItemIDs {
			correct := 0
			for _, stats := range account.Progress.Items[id].ModeStats {
				correct += stats.Correct
			}
			if correct == 0 {
				return Receipt{}, &APIError{409, fmt.Sprintf("answer every required target first (missing %s)", id)}
			}
		}
		account.Progress.CompletedUnitIDs = append(account.Progress.CompletedUnitIDs, unit.ID)
		account.Progress.XP += unit.Reward
		return Receipt{XPAdded: unit.Reward}, nil
	})
	if err != nil {
		apiFailure(w, err)
		return
	}
	added := receipt.XPAdded
	if duplicate {
		added = 0
	}
	writeJSON(w, 200, map[string]any{"xpAdded": added, "duplicate": duplicate, "progress": account.Progress})
}

// Fixed authored mission pools. Three distinct successes from the current run
// are required; unrelated, invented or cross-level answers cannot finish it.
var activityPools = map[string]map[string][]string{
	"cafe": {
		"A1": {"a1-cafe-exercise-1", "a1-cafe-exercise-2", "a1-cafe-exercise-5", "a1-cafe-exercise-6"},
		"A2": {"a2-evening-plans-exercise-2", "a2-evening-plans-exercise-5", "a2-evening-plans-exercise-6", "a2-broken-clock-exercise-2"},
		"B1": {"b1-storm-exercise-3", "b1-storm-exercise-4", "b1-work-exercise-2", "b1-work-exercise-3"},
	},
	"market": {
		"A1": {"a1-market-exercise-1", "a1-market-exercise-3", "a1-market-exercise-4", "a1-market-exercise-6"},
		"A2": {"a2-evening-plans-exercise-5", "a2-apartment-exercise-2", "a2-rail-trip-exercise-5", "a2-archive-exercise-4"},
		"B1": {"b1-new-route-exercise-3", "b1-new-route-exercise-6", "b1-storm-exercise-5", "b1-council-exercise-3"},
	},
	"detective": {
		"A1": {"a1-workshop-exercise-1", "a1-workshop-exercise-4", "a1-lost-parcel-exercise-1", "a1-station-exercise-4"},
		"A2": {"a2-broken-clock-exercise-1", "a2-broken-clock-exercise-2", "a2-broken-clock-exercise-7", "a2-archive-exercise-1"},
		"B1": {"b1-witness-exercise-2", "b1-witness-exercise-4", "b1-witness-exercise-5", "b1-atlas-exercise-1"},
	},
	"delivery": {
		"A1": {"a1-lost-parcel-exercise-3", "a1-lost-parcel-exercise-4", "a1-lost-parcel-exercise-5", "a1-lost-parcel-exercise-6"},
		"A2": {"a2-rail-trip-exercise-1", "a2-rail-trip-exercise-2", "a2-rail-trip-exercise-3", "a2-rail-trip-exercise-7"},
		"B1": {"b1-new-route-exercise-1", "b1-new-route-exercise-4", "b1-new-route-exercise-7", "b1-storm-exercise-6"},
	},
}

func activityContains(activityID, level, exerciseID string) bool {
	return contains(activityPools[activityID][level], exerciseID)
}

type ActivityCompletionInput struct {
	ID          string   `json:"id"`
	ActivityID  string   `json:"activityId"`
	Level       string   `json:"level"`
	ExerciseIDs []string `json:"exerciseIds"`
	AttemptIDs  []string `json:"attemptIds"`
}

func uniqueIDs(ids []string) bool {
	seen := map[string]bool{}
	for _, id := range ids {
		if !safeID.MatchString(id) || seen[id] {
			return false
		}
		seen[id] = true
	}
	return true
}

func (a *App) completeActivity(w http.ResponseWriter, r *http.Request) {
	hash, err := bearer(r)
	if err != nil {
		apiFailure(w, err)
		return
	}
	if !a.allow("activity:"+hash, 60) {
		writeError(w, 429, "too many mission requests; try again in a minute")
		return
	}
	var input ActivityCompletionInput
	if err = decodeJSON(w, r, &input); err != nil {
		apiFailure(w, err)
		return
	}
	if !safeID.MatchString(input.ID) || len(activityPools[input.ActivityID][input.Level]) != 4 || len(input.ExerciseIDs) != 3 || len(input.AttemptIDs) != 3 || !uniqueIDs(input.ExerciseIDs) || !uniqueIDs(input.AttemptIDs) {
		writeError(w, 400, "send a known mission, level, run ID and three distinct exercise/attempt IDs")
		return
	}
	for _, id := range input.ExerciseIDs {
		exercise, exists := a.curriculum.Exercises[id]
		if !exists || !activityContains(input.ActivityID, input.Level, id) || a.curriculum.Items[exercise.ItemID].Level != input.Level {
			writeError(w, 400, "exercise does not belong to this mission and level")
			return
		}
	}
	// Proof is set membership rather than list order; retries can reorder IDs.
	sort.Strings(input.ExerciseIDs)
	sort.Strings(input.AttemptIDs)
	request, _ := json.Marshal(input)
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()
	proofs, corrected, err := a.store.ActivityProofs(ctx, hash, input.ActivityID, input.ID, input.AttemptIDs)
	if err != nil {
		apiFailure(w, err)
		return
	}
	account, receipt, duplicate, err := a.store.Mutate(ctx, hash, "activity-run:"+input.ID, request, func(account *Account) (Receipt, error) {
		ensureProgress(&account.Progress)
		now := a.now().UTC()
		answered := map[string]bool{}
		for _, id := range input.AttemptIDs {
			action, exists := proofs[id]
			var proof AttemptInput
			if !exists || json.Unmarshal(action.Request, &proof) != nil || action.Receipt.Correct == nil || !*action.Receipt.Correct || proof.ID != id || proof.ActivityID != input.ActivityID || proof.RunID != input.ID || !contains(input.ExerciseIDs, proof.ExerciseID) {
				return Receipt{}, &APIError{409, "complete three distinct targets successfully in this mission run first"}
			}
			answered[proof.ExerciseID] = true
		}
		if len(answered) != 3 {
			return Receipt{}, &APIError{409, "three different mission targets are required"}
		}
		key := input.ActivityID + ":" + input.Level
		activity := account.Progress.Activities[key]
		reward := 0
		if activity.Completions == 0 {
			activity.CompletedAt = now
			reward = map[string]int{"A1": 20, "A2": 30, "B1": 40}[input.Level]
		}
		activity.ActivityID, activity.Level = input.ActivityID, input.Level
		activity.Completions++
		activity.LastCompletedAt = now
		activity.ExerciseIDs = append([]string{}, input.ExerciseIDs...)
		activity.CorrectedAnswers = corrected
		account.Progress.Activities[key] = activity
		account.Progress.XP += reward
		return Receipt{XPAdded: reward, Activity: &activity}, nil
	})
	if err != nil {
		apiFailure(w, err)
		return
	}
	added := receipt.XPAdded
	if duplicate {
		added = 0
	}
	writeJSON(w, 200, map[string]any{"xpAdded": added, "duplicate": duplicate, "reason": "Validated three distinct, successfully answered targets from this mission run.", "activity": receipt.Activity, "progress": account.Progress})
}
