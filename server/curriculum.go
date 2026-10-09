package main

import (
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"regexp"
	"strings"
	"unicode"

	"golang.org/x/text/unicode/norm"
)

//go:embed *.json
var curriculumFiles embed.FS

type Quest struct {
	ID              string   `json:"id"`
	Reward          int      `json:"reward"`
	RequiredItemIDs []string `json:"requiredItemIds"`
}

type Exercise struct {
	ID              string   `json:"id"`
	ItemID          string   `json:"itemId"`
	Mode            string   `json:"mode"`
	Answer          string   `json:"answer"`
	AcceptedAnswers []string `json:"acceptedAnswers"`
	CaseSensitive   bool     `json:"caseSensitive"`
	WordIDs         []string `json:"wordIds,omitempty"`
	TargetWordID    string   `json:"targetWordId,omitempty"`
	Explanation     string   `json:"explanation,omitempty"`
}

type Item struct {
	ID        string     `json:"id"`
	Level     string     `json:"level"`
	Exercises []Exercise `json:"exercises"`
}

type Curriculum struct {
	Quests          map[string]Quest
	Items           map[string]Item
	Exercises       map[string]Exercise
	Lexicon         map[string]Lexeme
	Units           map[string]CourseUnit
	ContextWordIDs  map[string][]string
	ActivityWordIDs map[string][]string
	NPCWordIDs      map[string][]string
}

type Lexeme struct {
	ID    string `json:"id"`
	Level string `json:"level"`
}

type CourseUnit struct {
	ID                  string   `json:"id"`
	Level               string   `json:"level"`
	Reward              int      `json:"reward"`
	RequiredItemIDs     []string `json:"requiredItemIds"`
	RequiredWordIDs     []string `json:"requiredWordIds"`
	RequiredExerciseIDs []string `json:"requiredExerciseIds"`
}

var lexicalID = regexp.MustCompile(`^[A-Za-z0-9_-]{1,70}$`)

func validLevel(level string) bool { return level == "A1" || level == "A2" || level == "B1" }

func loadCurriculum() (Curriculum, error) {
	b, err := curriculumFiles.ReadFile("curriculum.json")
	if err != nil {
		return Curriculum{}, err
	}
	base, err := parseCurriculum(b)
	if err != nil {
		return Curriculum{}, err
	}
	b, err = curriculumFiles.ReadFile("course.json")
	if errors.Is(err, fs.ErrNotExist) {
		return base, nil
	}
	if err != nil {
		return Curriculum{}, err
	}
	course, err := parseCurriculum(b)
	if err != nil {
		return Curriculum{}, fmt.Errorf("course manifest: %w", err)
	}
	return mergeCurriculum(base, course)
}

func parseCurriculum(b []byte) (Curriculum, error) {
	var manifest struct {
		Quests          []Quest             `json:"quests"`
		Items           []Item              `json:"items"`
		Exercises       []Exercise          `json:"exercises"`
		Lexicon         []Lexeme            `json:"lexicon"`
		Units           []CourseUnit        `json:"units"`
		ContextWordIDs  map[string][]string `json:"contextWordIds"`
		ActivityWordIDs map[string][]string `json:"activityWordIds"`
		NPCWordIDs      map[string][]string `json:"npcWordIds"`
	}
	if err := json.Unmarshal(b, &manifest); err != nil {
		return Curriculum{}, err
	}
	c := Curriculum{Quests: map[string]Quest{}, Items: map[string]Item{}, Exercises: map[string]Exercise{}, Lexicon: map[string]Lexeme{}, Units: map[string]CourseUnit{}, ContextWordIDs: map[string][]string{}, ActivityWordIDs: map[string][]string{}, NPCWordIDs: map[string][]string{}}
	for _, word := range manifest.Lexicon {
		if !lexicalID.MatchString(word.ID) || !validLevel(word.Level) {
			return c, fmt.Errorf("invalid lexeme %q", word.ID)
		}
		if _, exists := c.Lexicon[word.ID]; exists {
			return c, fmt.Errorf("duplicate lexeme %q", word.ID)
		}
		c.Lexicon[word.ID] = word
	}
	for exerciseID, ids := range manifest.ContextWordIDs {
		if !safeID.MatchString(exerciseID) || len(ids) == 0 {
			return c, fmt.Errorf("invalid contextual exposure mapping %q", exerciseID)
		}
		seen := map[string]bool{}
		for _, id := range ids {
			if _, exists := c.Lexicon[id]; !exists || seen[id] {
				return c, fmt.Errorf("context mapping %q has invalid word %q", exerciseID, id)
			}
			seen[id] = true
		}
		c.ContextWordIDs[exerciseID] = ids
	}
	for kind, mappings := range map[string]map[string][]string{"activity": manifest.ActivityWordIDs, "npc": manifest.NPCWordIDs} {
		for key, ids := range mappings {
			if key == "" || len(key) > 120 {
				return c, fmt.Errorf("invalid %s exposure context", kind)
			}
			seen := map[string]bool{}
			for _, id := range ids {
				if _, exists := c.Lexicon[id]; !exists || seen[id] {
					return c, fmt.Errorf("%s context %q has unknown or repeated word %q", kind, key, id)
				}
				seen[id] = true
			}
			if kind == "activity" {
				c.ActivityWordIDs[key] = ids
			} else {
				c.NPCWordIDs[key] = ids
			}
		}
	}
	for _, item := range manifest.Items {
		if item.ID == "" {
			return c, fmt.Errorf("curriculum contains empty item ID")
		}
		if _, ok := c.Items[item.ID]; ok {
			return c, fmt.Errorf("duplicate item %q", item.ID)
		}
		c.Items[item.ID] = item
		for _, exercise := range item.Exercises {
			exercise.ItemID = item.ID
			manifest.Exercises = append(manifest.Exercises, exercise)
		}
	}
	for _, quest := range manifest.Quests {
		if quest.ID == "" || quest.Reward < 0 || len(quest.RequiredItemIDs) == 0 {
			return c, fmt.Errorf("invalid quest %q", quest.ID)
		}
		if _, ok := c.Quests[quest.ID]; ok {
			return c, fmt.Errorf("duplicate quest %q", quest.ID)
		}
		for _, id := range quest.RequiredItemIDs {
			if _, ok := c.Items[id]; !ok {
				return c, fmt.Errorf("quest %q requires unknown item %q", quest.ID, id)
			}
		}
		c.Quests[quest.ID] = quest
	}
	for _, exercise := range manifest.Exercises {
		if exercise.ID == "" || !validMode(exercise.Mode) || exercise.Answer == "" {
			return c, fmt.Errorf("invalid exercise %q", exercise.ID)
		}
		if _, ok := c.Items[exercise.ItemID]; !ok {
			return c, fmt.Errorf("exercise %q uses unknown item", exercise.ID)
		}
		if _, ok := c.Exercises[exercise.ID]; ok {
			return c, fmt.Errorf("duplicate exercise %q", exercise.ID)
		}
		if exercise.TargetWordID == "" && strings.HasPrefix(exercise.ItemID, "word-") {
			id := strings.TrimPrefix(exercise.ItemID, "word-")
			if _, exists := c.Lexicon[id]; exists {
				exercise.TargetWordID = id
			}
		}
		if exercise.TargetWordID != "" {
			word, exists := c.Lexicon[exercise.TargetWordID]
			if !exists || exercise.ItemID != "word-"+exercise.TargetWordID || c.Items[exercise.ItemID].Level != word.Level {
				return c, fmt.Errorf("exercise %q has invalid independent word target", exercise.ID)
			}
		}
		seenWords := map[string]bool{}
		for _, id := range exercise.WordIDs {
			if _, exists := c.Lexicon[id]; !exists || seenWords[id] {
				return c, fmt.Errorf("exercise %q has unknown or duplicate exposure word %q", exercise.ID, id)
			}
			seenWords[id] = true
		}
		c.Exercises[exercise.ID] = exercise
	}
	for _, unit := range manifest.Units {
		if !safeID.MatchString(unit.ID) || !validLevel(unit.Level) || unit.Reward < 0 || unit.Reward > 100 || len(unit.RequiredItemIDs)+len(unit.RequiredWordIDs)+len(unit.RequiredExerciseIDs) == 0 {
			return c, fmt.Errorf("invalid course unit %q", unit.ID)
		}
		if !uniqueIDs(unit.RequiredItemIDs) || !uniqueIDs(unit.RequiredWordIDs) || !uniqueIDs(unit.RequiredExerciseIDs) {
			return c, fmt.Errorf("unit %q repeats a required target", unit.ID)
		}
		if _, exists := c.Units[unit.ID]; exists {
			return c, fmt.Errorf("duplicate course unit %q", unit.ID)
		}
		for _, id := range unit.RequiredItemIDs {
			if item, exists := c.Items[id]; !exists || item.Level != unit.Level {
				return c, fmt.Errorf("unit %q requires unknown or other-level item %q", unit.ID, id)
			}
		}
		for _, id := range unit.RequiredWordIDs {
			if word, exists := c.Lexicon[id]; !exists || word.Level != unit.Level {
				return c, fmt.Errorf("unit %q requires unknown or other-level word %q", unit.ID, id)
			}
		}
		for _, id := range unit.RequiredExerciseIDs {
			exercise, exists := c.Exercises[id]
			if !exists || c.Items[exercise.ItemID].Level != unit.Level {
				return c, fmt.Errorf("unit %q requires unknown or other-level exercise %q", unit.ID, id)
			}
		}
		c.Units[unit.ID] = unit
	}
	if len(c.Exercises) == 0 {
		return c, fmt.Errorf("curriculum has no server-gradable exercises")
	}
	return c, nil
}

func mergeCurriculum(base, course Curriculum) (Curriculum, error) {
	if base.Lexicon == nil {
		base.Lexicon = map[string]Lexeme{}
	}
	if base.Units == nil {
		base.Units = map[string]CourseUnit{}
	}
	if base.ContextWordIDs == nil {
		base.ContextWordIDs = map[string][]string{}
	}
	if base.ActivityWordIDs == nil {
		base.ActivityWordIDs = map[string][]string{}
	}
	if base.NPCWordIDs == nil {
		base.NPCWordIDs = map[string][]string{}
	}
	for id, value := range course.Items {
		if _, exists := base.Items[id]; exists {
			return Curriculum{}, fmt.Errorf("course duplicates legacy item %q", id)
		}
		base.Items[id] = value
	}
	for id, value := range course.Exercises {
		if _, exists := base.Exercises[id]; exists {
			return Curriculum{}, fmt.Errorf("course duplicates legacy exercise %q", id)
		}
		base.Exercises[id] = value
	}
	for id, value := range course.Quests {
		if _, exists := base.Quests[id]; exists {
			return Curriculum{}, fmt.Errorf("course duplicates legacy quest %q", id)
		}
		base.Quests[id] = value
	}
	for id, value := range course.Lexicon {
		if _, exists := base.Lexicon[id]; exists {
			return Curriculum{}, fmt.Errorf("course duplicates lexeme %q", id)
		}
		base.Lexicon[id] = value
	}
	for id, value := range course.Units {
		if _, exists := base.Units[id]; exists {
			return Curriculum{}, fmt.Errorf("course duplicates unit %q", id)
		}
		base.Units[id] = value
	}
	for exerciseID, ids := range course.ContextWordIDs {
		exercise, exists := base.Exercises[exerciseID]
		if !exists || exercise.TargetWordID != "" {
			return Curriculum{}, fmt.Errorf("invalid context exposure exercise %q", exerciseID)
		}
		if _, exists := base.ContextWordIDs[exerciseID]; exists {
			return Curriculum{}, fmt.Errorf("duplicate context exposure mapping %q", exerciseID)
		}
		base.ContextWordIDs[exerciseID] = ids
		for _, id := range ids {
			if !contains(exercise.WordIDs, id) {
				exercise.WordIDs = append(exercise.WordIDs, id)
			}
		}
		base.Exercises[exerciseID] = exercise
	}
	for id, ids := range course.ActivityWordIDs {
		if _, exists := base.ActivityWordIDs[id]; exists {
			return Curriculum{}, fmt.Errorf("duplicate activity word context %q", id)
		}
		base.ActivityWordIDs[id] = ids
	}
	for id, ids := range course.NPCWordIDs {
		if _, exists := base.NPCWordIDs[id]; exists {
			return Curriculum{}, fmt.Errorf("duplicate NPC word context %q", id)
		}
		base.NPCWordIDs[id] = ids
	}
	return base, nil
}

func validMode(mode string) bool {
	return mode == "recognition" || mode == "production" || mode == "listening"
}

func (c Curriculum) listeningOnlyItem(itemID string) bool {
	listening := false
	for _, exercise := range c.Exercises {
		if exercise.ItemID != itemID {
			continue
		}
		if exercise.Mode != "listening" {
			return false
		}
		listening = true
	}
	return listening
}

func normalizeAnswer(answer string, caseSensitive bool) string {
	answer = norm.NFC.String(strings.TrimSpace(answer))
	answer = strings.Join(strings.Fields(answer), " ")
	answer = strings.TrimRightFunc(answer, func(r rune) bool { return r == '.' || r == '!' || r == '?' || unicode.IsSpace(r) })
	if !caseSensitive {
		answer = strings.ToLower(answer)
	}
	return answer
}

func (e Exercise) Grade(answer string) bool {
	normalized := normalizeAnswer(answer, e.CaseSensitive)
	if normalized == normalizeAnswer(e.Answer, e.CaseSensitive) {
		return true
	}
	for _, accepted := range e.AcceptedAnswers {
		if normalized == normalizeAnswer(accepted, e.CaseSensitive) {
			return true
		}
	}
	return false
}
