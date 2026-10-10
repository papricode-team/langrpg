package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"sort"
	"strings"
	"time"
)

type ExposureInput struct {
	ExerciseID string   `json:"exerciseId,omitempty"`
	UnitID     string   `json:"unitId,omitempty"`
	ActivityID string   `json:"activityId,omitempty"`
	ScenarioID string   `json:"scenarioId,omitempty"`
	NPCID      string   `json:"npcId,omitempty"`
	Level      string   `json:"level,omitempty"`
	WordIDs    []string `json:"wordIds,omitempty"`
}

func exerciseWords(exercise Exercise) []string {
	words := append([]string{}, exercise.WordIDs...)
	if exercise.TargetWordID != "" && !contains(words, exercise.TargetWordID) {
		words = append(words, exercise.TargetWordID)
	}
	return words
}

func (a *App) exposure(w http.ResponseWriter, r *http.Request) {
	hash, err := bearer(r)
	if err != nil {
		apiFailure(w, err)
		return
	}
	if !a.allow("exposure:"+hash, 120) {
		writeError(w, 429, "too many exposure requests; try again in a minute")
		return
	}
	var input ExposureInput
	if err = decodeJSON(w, r, &input); err != nil {
		apiFailure(w, err)
		return
	}
	contexts := 0
	for _, present := range []bool{input.ExerciseID != "", input.UnitID != "", input.ActivityID != "", input.NPCID != "", len(input.WordIDs) > 0} {
		if present {
			contexts++
		}
	}
	if contexts != 1 || (input.Level != "" && !validLevel(input.Level)) || (input.ScenarioID != "" && input.ActivityID == "") {
		writeError(w, 400, "choose one known exercise, unit, activity context or visible word list")
		return
	}
	words := []string{}
	switch {
	case input.ExerciseID != "":
		exercise, exists := a.curriculum.Exercises[input.ExerciseID]
		if !exists || (input.Level != "" && a.curriculum.Items[exercise.ItemID].Level != input.Level) {
			writeError(w, 400, "unknown or other-level exposure exercise")
			return
		}
		words = exerciseWords(exercise)
		input.Level = a.curriculum.Items[exercise.ItemID].Level
	case input.UnitID != "":
		unit, exists := a.curriculum.Units[input.UnitID]
		if !exists || (input.Level != "" && unit.Level != input.Level) {
			writeError(w, 400, "unknown or other-level exposure unit")
			return
		}
		words = append(words, unit.RequiredWordIDs...)
		input.Level = unit.Level
		for _, id := range unit.RequiredExerciseIDs {
			words = append(words, exerciseWords(a.curriculum.Exercises[id])...)
		}
	case input.ActivityID != "":
		pool := activityPools[input.ActivityID][input.Level]
		if len(pool) != 4 {
			writeError(w, 400, "unknown exposure activity or level")
			return
		}
		if input.ScenarioID != "" {
			ids, exists := a.curriculum.ActivityWordIDs[input.ScenarioID]
			if !exists || !strings.HasPrefix(input.ScenarioID, input.ActivityID+"-"+strings.ToLower(input.Level)+"-") {
				writeError(w, 400, "unknown or other-level mission scene")
				return
			}
			words = append(words, ids...)
		} else {
			for _, id := range pool {
				words = append(words, exerciseWords(a.curriculum.Exercises[id])...)
			}
		}
	case input.NPCID != "":
		ids, exists := a.curriculum.NPCWordIDs[input.NPCID]
		if !exists {
			writeError(w, 400, "unknown NPC word context")
			return
		}
		words = append(words, ids...)
		input.Level = ""
	case len(input.WordIDs) > 0:
		if len(input.WordIDs) > 36 {
			writeError(w, 400, "expose at most 36 visible words at once")
			return
		}
		words = append(words, input.WordIDs...)
		input.Level = ""
	}
	unique := map[string]bool{}
	for _, id := range words {
		if _, exists := a.curriculum.Lexicon[id]; !exists {
			writeError(w, 400, "exposure contains an unknown word")
			return
		}
		unique[id] = true
	}
	words = words[:0]
	for id := range unique {
		words = append(words, id)
	}
	sort.Strings(words)
	// Canonical contexts and sorted visible lists are idempotent per account.
	// A repeated render cannot inflate counts or continually postpone recall.
	if len(input.WordIDs) > 0 {
		input.WordIDs = words
	}
	request, _ := json.Marshal(input)
	digest := sha256.Sum256(request)
	key := "exposure:" + hex.EncodeToString(digest[:])
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()
	account, _, duplicate, err := a.store.Mutate(ctx, hash, key, request, func(account *Account) (Receipt, error) {
		now := a.now().UTC()
		migrateContextExposures(&account.Progress, a.curriculum, now)
		recordExposures(&account.Progress, words, now)
		return Receipt{}, nil
	})
	if err != nil {
		apiFailure(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"xpAdded": 0, "duplicate": duplicate, "progress": account.Progress})
}

func recordExposures(p *Progress, wordIDs []string, now time.Time) {
	ensureProgress(p)
	for _, id := range wordIDs {
		word := p.Words[id]
		word.WordID = id
		word.Exposures++
		word.ContextExposures++
		word.LastSeenAt = now.UTC()
		if memory, exists := p.Items["word-"+id]; exists {
			syncWordCards(&word, memory)
		}
		refreshWordMastery(&word)
		p.Words[id] = word
	}
}
