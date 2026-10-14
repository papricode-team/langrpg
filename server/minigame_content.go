package main

import (
	"encoding/json"
	"fmt"
	"slices"
	"strings"
)

// A content exercise shares its target's existing word card, while its authored
// game and scaffold remain fixed. Client context cannot select another answer.
type MiniGameContentBinding struct {
	MiniGameID  string
	Level       string
	RegionID    string
	ContentID   string
	ForceHinted bool
	Labels      map[int]string // Planning field options, including wrong values.
}

type contentExercise struct {
	Exercise
	MiniGameID string `json:"miniGameId"`
	Level      string `json:"level"`
	RegionID   string `json:"regionId"`
	ContentID  string `json:"contentId"`
	Supported  *bool  `json:"supported,omitempty"`
}

type encounterLearning struct {
	EncounterID  string            `json:"encounterId"`
	MapID        string            `json:"mapId"`
	Level        string            `json:"level"`
	WordIDs      []string          `json:"wordIds"`
	TargetWordID string            `json:"targetWordId"`
	ExerciseIDs  map[string]string `json:"exerciseIds"`
	Supported    bool              `json:"supported,omitempty"`
}

type placementLearning struct {
	MapID         string   `json:"mapId"`
	Level         string   `json:"level"`
	FieldID       string   `json:"fieldId"`
	ExerciseID    string   `json:"exerciseId"`
	WordIDs       []string `json:"wordIds"`
	TargetWordID  string   `json:"targetWordId"`
	AllowedValues []int    `json:"allowedValues"`
	Supported     *bool    `json:"supported,omitempty"`
	Labels        []struct {
		Value int    `json:"value"`
		Label string `json:"label"`
	} `json:"labels"`
}

type miniGameLearningManifest struct {
	Version    int                 `json:"version"`
	Exercises  []contentExercise   `json:"exercises"`
	Encounters []encounterLearning `json:"encounters"`
	Placements []placementLearning `json:"placements"`
}

var authoredStoryGames = []string{"lost-hour", "seed-packets", "17-59"}

// Validate the whole installed manifest before extending the live curriculum.
// Reusing an existing word item is deliberate; duplicate exercises or conflicting
// targets are errors rather than silently replacing core curriculum entries.
func loadMiniGameExercises(c *Curriculum, data []byte, source string) error {
	var rules expeditionManifest
	if source == "expedition" {
		var err error
		rules, err = expeditionContent()
		if err != nil {
			return err
		}
	}
	return loadMiniGameExercisesWithRules(c, data, source, rules)
}

func loadMiniGameExercisesWithRules(c *Curriculum, data []byte, source string, rules expeditionManifest) error {
	var manifest miniGameLearningManifest
	if err := json.Unmarshal(data, &manifest); err != nil {
		return err
	}
	if manifest.Version != 1 || len(manifest.Exercises) == 0 || (source != "story" && source != "expedition") {
		return fmt.Errorf("invalid mini-game learning manifest")
	}
	exercises := map[string]contentExercise{}
	items := map[string]Item{}
	bindings := map[string]MiniGameContentBinding{}
	for _, row := range manifest.Exercises {
		e := row.Exercise
		word, targetExists := c.Lexicon[e.TargetWordID]
		if !safeID.MatchString(e.ID) || !validMode(e.Mode) || strings.TrimSpace(e.Answer) == "" || len(e.Answer) > 1024 || !targetExists || e.ItemID != "word-"+word.ID || len(e.WordIDs) == 0 || !contains(e.WordIDs, word.ID) {
			return fmt.Errorf("invalid independent content exercise %q", e.ID)
		}
		if _, exists := c.Exercises[e.ID]; exists {
			return fmt.Errorf("duplicate content exercise %q", e.ID)
		}
		if _, exists := exercises[e.ID]; exists {
			return fmt.Errorf("duplicate content exercise %q", e.ID)
		}
		if !uniqueIDs(e.WordIDs) {
			return fmt.Errorf("content exercise %q repeats a word", e.ID)
		}
		for _, id := range e.WordIDs {
			if _, exists := c.Lexicon[id]; !exists {
				return fmt.Errorf("content exercise %q uses unknown word %q", e.ID, id)
			}
		}
		seenAnswers := map[string]bool{normalizeAnswer(e.Answer, e.CaseSensitive): true}
		for _, answer := range e.AcceptedAnswers {
			normalized := normalizeAnswer(answer, e.CaseSensitive)
			if normalized == "" || len(answer) > 1024 || seenAnswers[normalized] {
				return fmt.Errorf("content exercise %q has invalid or repeated answers", e.ID)
			}
			seenAnswers[normalized] = true
		}
		if item, exists := c.Items[e.ItemID]; exists {
			if item.Level != word.Level {
				return fmt.Errorf("content exercise %q conflicts with its lexical item", e.ID)
			}
		} else {
			items[e.ItemID] = Item{ID: e.ItemID, Level: word.Level}
		}
		exercises[e.ID] = row
		if source == "story" {
			if !contains(authoredStoryGames, row.MiniGameID) || !validLevel(row.Level) || !safeID.MatchString(row.ContentID) || row.RegionID != "" {
				return fmt.Errorf("invalid story binding for %q", e.ID)
			}
			bindings[e.ID] = MiniGameContentBinding{MiniGameID: row.MiniGameID, Level: row.Level, ContentID: row.ContentID, ForceHinted: row.Supported != nil && *row.Supported}
		}
	}
	if source == "story" && (len(manifest.Encounters) > 0 || len(manifest.Placements) > 0) {
		return fmt.Errorf("story manifest cannot install expedition bindings")
	}
	if source == "expedition" {
		if err := bindExpeditionExercises(exercises, bindings, manifest, rules); err != nil {
			return err
		}
	}
	for id, row := range exercises {
		binding, exists := bindings[id]
		if !exists || (row.MiniGameID != "" && row.MiniGameID != binding.MiniGameID) || (row.Level != "" && row.Level != binding.Level) || (row.RegionID != "" && row.RegionID != binding.RegionID) || (row.ContentID != "" && row.ContentID != binding.ContentID) || (row.Supported != nil && *row.Supported != binding.ForceHinted) {
			return fmt.Errorf("content exercise %q has no matching canonical binding", id)
		}
		if _, exists := c.MiniGameContent[id]; exists {
			return fmt.Errorf("duplicate content binding %q", id)
		}
	}
	if c.MiniGameContent == nil {
		c.MiniGameContent = map[string]MiniGameContentBinding{}
	}
	for id, item := range items {
		c.Items[id] = item
	}
	for id, row := range exercises {
		c.Exercises[id] = row.Exercise
		c.MiniGameContent[id] = bindings[id]
	}
	return nil
}

func sameWords(a, b []string) bool {
	if len(a) != len(b) || !uniqueIDs(b) {
		return false
	}
	for _, id := range a {
		if !contains(b, id) {
			return false
		}
	}
	return true
}

func bindExpeditionExercises(exercises map[string]contentExercise, bindings map[string]MiniGameContentBinding, manifest miniGameLearningManifest, rules expeditionManifest) error {
	encounters := map[string]expeditionRule{}
	games := map[string]expeditionGameRule{}
	for _, row := range rules.Encounters {
		encounters[row.ID] = row
	}
	for _, row := range rules.Games {
		games[row.ID] = row
	}
	contexts := map[string]bool{}
	bind := func(id, mode, target string, words []string, binding MiniGameContentBinding) error {
		row, exists := exercises[id]
		_, duplicate := bindings[id]
		if !exists || duplicate || row.Mode != mode || row.TargetWordID != target || !sameWords(row.WordIDs, words) || !validLevel(binding.Level) {
			return fmt.Errorf("invalid expedition exercise binding %q", id)
		}
		bindings[id] = binding
		return nil
	}
	for _, row := range manifest.Encounters {
		rule, exists := encounters[row.EncounterID]
		key := row.EncounterID + ":" + row.Level
		if !exists || rule.MapID != row.MapID || contexts[key] || len(row.ExerciseIDs) != 2 {
			return fmt.Errorf("invalid expedition encounter mapping %q", key)
		}
		contexts[key] = true
		for _, mode := range []string{"recognition", "listening"} {
			if err := bind(row.ExerciseIDs[mode], mode, row.TargetWordID, row.WordIDs, MiniGameContentBinding{MiniGameID: "expedition-encounters", Level: row.Level, RegionID: row.MapID, ContentID: row.EncounterID, ForceHinted: row.Supported}); err != nil {
				return err
			}
		}
	}
	for _, row := range manifest.Placements {
		game, exists := games[row.MapID]
		fieldIndex := -1
		for i, field := range game.Fields {
			if field.ID == row.FieldID {
				fieldIndex = i
			}
		}
		key := row.MapID + ":" + row.Level + ":" + row.FieldID
		if !exists || fieldIndex < 0 || contexts[key] {
			return fmt.Errorf("invalid expedition placement mapping %q", key)
		}
		contexts[key] = true
		field := game.Fields[fieldIndex]
		labels := map[int]string{}
		for _, option := range row.Labels {
			if _, exists := labels[option.Value]; exists || strings.TrimSpace(option.Label) == "" || !slices.Contains(field.Values, option.Value) {
				return fmt.Errorf("invalid planning option for %q", key)
			}
			labels[option.Value] = option.Label
		}
		if len(labels) != len(field.Values) {
			return fmt.Errorf("planning mapping %q must name every available value", key)
		}
		acceptedValues := map[int]bool{}
		for _, allocation := range game.ValidValues {
			if len(allocation) != len(game.Fields) {
				return fmt.Errorf("invalid canonical plan allocation %q", game.ID)
			}
			acceptedValues[allocation[fieldIndex]] = true
		}
		if len(acceptedValues) != len(row.AllowedValues) {
			return fmt.Errorf("planning mapping %q contradicts complete allocations", key)
		}
		seen := map[int]bool{}
		for _, value := range row.AllowedValues {
			if !acceptedValues[value] || seen[value] {
				return fmt.Errorf("invalid accepted planning value for %q", key)
			}
			seen[value] = true
		}
		supported := row.Supported == nil || *row.Supported
		binding := MiniGameContentBinding{MiniGameID: "neighborhood-boards", Level: row.Level, RegionID: row.MapID, ContentID: row.FieldID, ForceHinted: supported, Labels: labels}
		if err := bind(row.ExerciseID, "recognition", row.TargetWordID, row.WordIDs, binding); err != nil {
			return err
		}
		exercise := exercises[row.ExerciseID].Exercise
		answers := append([]string{exercise.Answer}, exercise.AcceptedAnswers...)
		expected := map[string]bool{}
		for value := range acceptedValues {
			expected[normalizeAnswer(labels[value], exercise.CaseSensitive)] = true
		}
		if len(expected) != len(answers) {
			return fmt.Errorf("planning answers for %q contradict authored allocations", key)
		}
		for _, answer := range answers {
			if !expected[normalizeAnswer(answer, exercise.CaseSensitive)] {
				return fmt.Errorf("planning answer for %q accepts an invalid value", key)
			}
		}
	}
	return nil
}

func (a *App) validateMiniGameContent(input AttemptInput, exercise Exercise) error {
	binding, authored := a.curriculum.MiniGameContent[exercise.ID]
	if !authored {
		if input.RegionID != "" || input.ContentID != "" || input.SelectedValue != nil || contains(authoredStoryGames, input.MiniGameID) || input.MiniGameID == "expedition-encounters" || input.MiniGameID == "neighborhood-boards" {
			return &APIError{400, "this mini-game requires its installed content exercise"}
		}
		return nil
	}
	if input.MiniGameID != binding.MiniGameID || input.Level != binding.Level || input.RegionID != binding.RegionID || input.ContentID != binding.ContentID || input.AnswerKind != "" || input.ContextExerciseID != "" || input.SceneAttempt || input.GuidedChoice || input.ActivityID != "" || input.RunID != "" || input.QuestID != "" {
		return &APIError{400, "mini-game, scaffold and content must match the authored exercise"}
	}
	if binding.Labels == nil {
		if input.SelectedValue != nil {
			return &APIError{400, "only a planning placement accepts a selected resource value"}
		}
		return nil
	}
	if input.SelectedValue == nil {
		return &APIError{400, "send the selected resource's canonical value"}
	}
	label, exists := binding.Labels[*input.SelectedValue]
	if !exists || (input.Answer != "__timeout__" && normalizeAnswer(input.Answer, exercise.CaseSensitive) != normalizeAnswer(label, exercise.CaseSensitive)) {
		return &APIError{400, "the selected resource and answer must identify the same authored option"}
	}
	return nil
}
