package main

import (
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"regexp"
	"sort"
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
	ActivityBoards  map[string]ActivityBoardScenario
	ActivityPrices  map[string]int
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
	merged, err := mergeCurriculum(base, course)
	if err != nil {
		return Curriculum{}, err
	}
	boards, err := curriculumFiles.ReadFile("activity_boards.json")
	if err != nil {
		return Curriculum{}, fmt.Errorf("activity board manifest: %w", err)
	}
	if err = loadActivityBoards(&merged, boards); err != nil {
		return Curriculum{}, err
	}
	return merged, nil
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
	production := e.Mode == "production"
	normalized := normalizeAnswer(answer, e.CaseSensitive && !production)
	for _, accepted := range append([]string{e.Answer}, e.AcceptedAnswers...) {
		if production && e.CaseSensitive && formalAddressChanged(answer, accepted) {
			continue
		}
		expected := normalizeAnswer(accepted, e.CaseSensitive && !production)
		if normalized == expected {
			return true
		}
		if production && productionAnswerMatches(normalized, expected) {
			return true
		}
	}
	return false
}

func umlautKeyboardForm(value string) string {
	return strings.NewReplacer("ä", "ae", "ö", "oe", "ü", "ue", "Ä", "Ae", "Ö", "Oe", "Ü", "Ue", "ß", "ss", "ẞ", "SS").Replace(value)
}

// Capitalization of formal address can change who a sentence refers to.
// Noun and sentence capitals are accepted with guidance; this distinction stays.
func formalAddressChanged(answer, expected string) bool {
	a, b := strings.Fields(normalizeAnswer(answer, true)), strings.Fields(normalizeAnswer(expected, true))
	if len(a) != len(b) {
		return false
	}
	for i, token := range b {
		if contains([]string{"Sie", "Ihnen", "Ihr", "Ihre", "Ihren", "Ihrem", "Ihrer", "Ihres"}, token) && a[i] == strings.ToLower(token) {
			return true
		}
	}
	return false
}

// Forgive a single mechanical typing slip, not substitutions, grammar changes,
// or missing umlauts. Short function words remain exact.
func productionAnswerMatches(answer, expected string) bool {
	actualWords := strings.Fields(umlautKeyboardForm(answer))
	expectedWords := strings.Fields(umlautKeyboardForm(expected))
	if len(actualWords) != len(expectedWords) {
		return false
	}
	slips := 0
	for i, word := range actualWords {
		if word == expectedWords[i] {
			continue
		}
		if slips > 0 || !mechanicalTypo(word, expectedWords[i]) {
			return false
		}
		slips++
	}
	return true
}

func mechanicalTypo(answer, expected string) bool {
	a, b := []rune(answer), []rune(expected)
	if len(a) < 5 || len(b) < 5 {
		return false
	}
	for _, word := range [][]rune{a, b} {
		for _, letter := range word {
			if !unicode.IsLetter(letter) {
				return false
			}
		}
	}
	if len(a) == len(b) {
		for i := 0; i < len(a)-1; i++ {
			if a[i] == b[i] {
				continue
			}
			if unicode.IsUpper(a[i]) || unicode.IsUpper(a[i+1]) || a[i] != b[i+1] || a[i+1] != b[i] {
				return false
			}
			return string(a[i+2:]) == string(b[i+2:])
		}
		return false
	}
	if len(a) < len(b) {
		a, b = b, a
	}
	if len(a) != len(b)+1 {
		return false
	}
	for i := 1; i < len(a); i++ {
		if a[i] == a[i-1] && !unicode.IsUpper(a[i]) && string(a[:i])+string(a[i+1:]) == string(b) {
			return true
		}
	}
	return false
}

// Feedback identifies what to revisit while the authored explanation supplies
// context. It never claims that every unlisted paraphrase is incorrect German.
func (e Exercise) Feedback(answer string) string {
	if e.Grade(answer) {
		if e.Mode == "production" {
			for _, accepted := range append([]string{e.Answer}, e.AcceptedAnswers...) {
				actual, expected := normalizeAnswer(answer, true), normalizeAnswer(accepted, true)
				if productionAnswerMatches(strings.ToLower(actual), strings.ToLower(expected)) && !productionAnswerMatches(actual, expected) {
					return "Accepted. Remember capitalization: begin sentences and German nouns with a capital letter. " + e.Explanation
				}
			}
		}
		return e.Explanation
	}
	actual, expected := normalizeAnswer(answer, e.CaseSensitive), normalizeAnswer(e.Answer, e.CaseSensitive)
	if e.CaseSensitive && umlautKeyboardForm(strings.ToLower(actual)) == umlautKeyboardForm(strings.ToLower(expected)) {
		return "Check capitalization: begin sentences, German nouns and formal Sie with a capital letter."
	}
	a, b := strings.Fields(strings.ToLower(actual)), strings.Fields(strings.ToLower(expected))
	articles := []string{"der", "die", "das", "den", "dem", "des", "ein", "eine", "einen", "einem", "einer", "eines"}
	if len(a) == len(b) {
		for i, token := range a {
			if token != b[i] && contains(articles, token) && contains(articles, b[i]) {
				return "Check the article: its ending must match the noun's gender and its role in the sentence."
			}
		}
	}
	if len(a) == len(b) {
		left, right := append([]string{}, a...), append([]string{}, b...)
		sort.Strings(left)
		sort.Strings(right)
		if strings.Join(left, " ") == strings.Join(right, " ") {
			for _, connector := range []string{"weil", "dass", "obwohl", "wenn", "falls"} {
				if contains(b, connector) {
					return "Check word order: after weil, dass, obwohl, wenn or falls, the conjugated verb belongs at the end of that clause."
				}
			}
			return "Check word order: in a statement, the conjugated verb normally takes the second position."
		}
	}
	if e.Mode == "production" {
		return "Check spelling and the requested form. Use ae, oe or ue when your keyboard cannot type an umlaut. " + e.Explanation
	}
	return e.Explanation
}
