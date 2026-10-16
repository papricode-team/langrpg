package main

import (
	"context"
	"encoding/json"
	"net/http"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"
	"unicode/utf16"
	"unicode/utf8"

	"glotworld/server/internal/contentstore"
	"glotworld/server/internal/store"
)

// StoryOverrides holds admin changes layered over authored story content. They
// never touch source files, translations or audio, so every change is reversible.
type StoryOverrides struct {
	// Hidden monologue lines, keyed by line UUID.
	HiddenLines map[string]HiddenLine `json:"hiddenLines,omitempty"`
	// Rewritten lines, keyed by line UUID.
	EditedLines map[string]EditedLine `json:"editedLines,omitempty"`
}

type HiddenLine struct {
	GraphID string    `json:"graphId"`
	By      string    `json:"by"`
	At      time.Time `json:"at"`
}

// EditedLine replaces a line's target-language text and its translations. The
// recorded audio, simpler variants and word alignment belong to the authored
// sentence, so players get the edited line without them.
type EditedLine struct {
	GraphID      string            `json:"graphId"`
	Text         string            `json:"text"`
	Translations map[string]string `json:"translations,omitempty"`
	By           string            `json:"by"`
	At           time.Time         `json:"at"`
}

// The admin story editor reads the whole story in play order: acts, scenes,
// their dialogue blocks and branches, and which words each line uses.

type storyWord struct {
	Start  int    `json:"start"`
	End    int    `json:"end"`
	Lexeme string `json:"lexeme,omitempty"`
}

type storyText struct {
	Text         string            `json:"text"`
	Translations map[string]string `json:"translations"`
	Words        []storyWord       `json:"words"`
}

type storyTask struct {
	Mode   string `json:"mode,omitempty"`
	Prompt string `json:"prompt"`
	Answer string `json:"answer,omitempty"`
}

type storyEdit struct {
	storyText
	By string    `json:"by"`
	At time.Time `json:"at"`
}

type storyLine struct {
	ID          string `json:"id"`
	Speaker     string `json:"speaker"`
	AddressedTo string `json:"addressedTo,omitempty"`
	storyText
	Audio     bool           `json:"audio"`
	Hidden    bool           `json:"hidden"`
	HiddenBy  string         `json:"hiddenBy,omitempty"`
	HiddenAt  *time.Time     `json:"hiddenAt,omitempty"`
	Locked    string         `json:"locked,omitempty"`
	Condition map[string]any `json:"condition,omitempty"`
	Reply     *storyTask     `json:"reply,omitempty"`
	Variants  []storyText    `json:"variants,omitempty"`
	Edit      *storyEdit     `json:"edit,omitempty"`
}

type storyChoice struct {
	ID string `json:"id"`
	storyText
	Next      string           `json:"next"`
	Effects   []map[string]any `json:"effects"`
	Condition map[string]any   `json:"condition,omitempty"`
}

type storyBlock struct {
	ID        string         `json:"id"`
	Kind      string         `json:"kind"`
	Label     string         `json:"label"`
	Next      string         `json:"next,omitempty"`
	Terminal  bool           `json:"terminal,omitempty"`
	Question  *storyText     `json:"question,omitempty"`
	Condition map[string]any `json:"condition,omitempty"`
	Task      *storyTask     `json:"task,omitempty"`
	Choices   []storyChoice  `json:"choices,omitempty"`
	Lines     []storyLine    `json:"lines"`
}

type storyObjective struct {
	Text  string `json:"text"`
	Stage string `json:"stage"`
}

type storyScene struct {
	GraphID    string           `json:"graphId"`
	CourseID   string           `json:"courseId"`
	QuestID    string           `json:"questId"`
	QuestUUID  string           `json:"questUuid"`
	Level      string           `json:"level"`
	Title      string           `json:"title"`
	Subtitle   string           `json:"subtitle"`
	NPC        string           `json:"npc"`
	Location   string           `json:"location"`
	Start      string           `json:"start"`
	Synopsis   []storyText      `json:"synopsis"`
	Objectives []storyObjective `json:"objectives"`
	Blocks     []storyBlock     `json:"blocks"`
}

type storyAct struct {
	CourseID    string      `json:"courseId"`
	Number      string      `json:"number"`
	Title       string      `json:"title"`
	Level       string      `json:"level"`
	MapID       string      `json:"mapId"`
	Premise     []storyText `json:"premise"`
	Goal        []storyText `json:"goal"`
	Cliffhanger []storyText `json:"cliffhanger"`
}

type storyChapter struct {
	CourseID    string `json:"courseId"`
	Level       string `json:"level"`
	Title       string `json:"title"`
	Description string `json:"description"`
	Color       string `json:"color"`
}

type storyCourse struct {
	ID               string   `json:"id"`
	Title            string   `json:"title"`
	Target           string   `json:"target"`
	SupportLanguages []string `json:"supportLanguages"`
}

type storyNPC struct {
	Name  string `json:"name"`
	Role  string `json:"role"`
	Color string `json:"color"`
}

type storyLexeme struct {
	Lemma   string `json:"lemma"`
	Level   string `json:"level"`
	Meaning string `json:"meaning"`
	POS     string `json:"pos,omitempty"`
}

type storyListing struct {
	Courses  []storyCourse          `json:"courses"`
	Acts     []storyAct             `json:"acts"`
	Chapters []storyChapter         `json:"chapters"`
	NPCs     map[string]storyNPC    `json:"npcs"`
	Lexemes  map[string]storyLexeme `json:"lexemes"`
	Scenes   []storyScene           `json:"scenes"`
}

var stageLabels = map[string]string{"intro": "Greeting and story", "gate": "Before the task", "choice": "The decision", "complete": "After the decision"}

func (a *App) storyOverrides() StoryOverrides {
	if a.editing == nil {
		return StoryOverrides{}
	}
	a.editing.mu.RLock()
	defer a.editing.mu.RUnlock()
	return a.editing.current.Story
}

func (a *App) lineKey(id string) string {
	if a.canonical == nil {
		return strings.ToLower(id)
	}
	return a.canonical.Translate(strings.ToLower(id), true)
}

// worldName turns a content UUID into its authored slug for display.
func (a *App) worldName(id string) string {
	if a.canonical == nil || id == "" {
		return id
	}
	name := a.canonical.Translate(id, false)
	if kind, slug, ok := strings.Cut(name, ":"); ok && !strings.Contains(slug, ":") && kind != "quest" {
		return slug
	}
	return name
}

// lineLock explains why a line must stay, or returns "" when it may be hidden.
// Only monologue lines qualify: replies are graded, and the decision line
// carries the scene's question.
func lineLock(stage string, line map[string]any, visible int) string {
	switch {
	case line["reply"] != nil:
		return "The player answers this line. It cannot be hidden."
	case stage == "choice":
		return "This line leads to the player's decision. It cannot be hidden."
	case stage == "complete":
		return "Lines after the decision react to the player's choice. They cannot be hidden."
	case visible <= 1:
		return "This is the last line left here. Keep at least one."
	}
	return ""
}

func (a *App) recordBody(id string) map[string]any {
	if a.content == nil || id == "" {
		return nil
	}
	record, ok := a.content.ByID[a.lineKey(id)]
	if !ok {
		record, ok = a.content.ByID[id]
	}
	if !ok {
		return nil
	}
	var body map[string]any
	_ = json.Unmarshal(record.Body, &body)
	return body
}

// sentence reads a sentence record with every translation and its word list.
func (a *App) sentence(id string) storyText {
	result := storyText{Translations: map[string]string{}, Words: []storyWord{}}
	body := a.recordBody(id)
	if body == nil {
		return result
	}
	result.Text = stringValue(body["text"])
	if translations, ok := body["translations"].(map[string]any); ok {
		for lang, entry := range translations {
			if value, ok := entry.(map[string]any); ok {
				result.Translations[lang] = stringValue(value["text"])
			}
		}
	}
	for _, entry := range anyValues(body["words"]) {
		word, _ := entry.(map[string]any)
		span, _ := word["range"].(map[string]any)
		start, _ := span["start"].(float64)
		end, _ := span["end"].(float64)
		if end > start {
			result.Words = append(result.Words, storyWord{Start: int(start), End: int(end), Lexeme: stringValue(word["lexemeId"])})
		}
	}
	return result
}

func (a *App) sentences(value any) []storyText {
	result := []storyText{}
	for _, entry := range anyValues(value) {
		ref, _ := entry.(map[string]any)
		if text := a.sentence(stringValue(ref["sentenceId"])); text.Text != "" {
			result = append(result, text)
		}
	}
	return result
}

func (a *App) task(exerciseID string) *storyTask {
	body := a.recordBody(exerciseID)
	if body == nil {
		return nil
	}
	task := &storyTask{Mode: stringValue(body["mode"]), Prompt: stringValue(body["prompt"])}
	if support, ok := body["support"].(map[string]any); ok {
		if en, ok := support["en"].(map[string]any); ok && stringValue(en["prompt"]) != "" {
			task.Prompt = stringValue(en["prompt"])
		}
	}
	if grading, ok := body["grading"].(map[string]any); ok {
		task.Answer = stringValue(grading["answer"])
	}
	return task
}

// readable rewrites content UUIDs inside conditions and effects as slugs.
func (a *App) readable(value map[string]any) map[string]any {
	if value == nil {
		return nil
	}
	out := map[string]any{}
	for key, item := range value {
		if text, ok := item.(string); ok && (key == "flag" || key == "withoutFlag" || key == "item" || key == "missingItem") {
			item = a.worldName(text)
		}
		out[key] = item
	}
	return out
}

func localText(value any, fallback string) string {
	if text, ok := value.(string); ok && text != "" {
		return text
	}
	return fallback
}

// storyListing reads every course's story for the admin story editor.
func (a *App) storyListing(overrides StoryOverrides) storyListing {
	listing := storyListing{Courses: []storyCourse{}, Acts: []storyAct{}, Chapters: []storyChapter{}, NPCs: map[string]storyNPC{}, Lexemes: map[string]storyLexeme{}, Scenes: []storyScene{}}
	if a.content == nil {
		return listing
	}
	graphs := map[string]contentstore.Record{}
	for _, record := range a.content.Records {
		if record.Kind == "graph" {
			graphs[record.ID] = record
		}
	}
	placed := map[string]bool{}
	for _, course := range a.content.Courses {
		title := course.Slug
		_ = json.Unmarshal(course.Title, &title)
		listing.Courses = append(listing.Courses, storyCourse{ID: course.ID, Title: title, Target: course.Target, SupportLanguages: course.SupportLanguages})
		var bootstrap struct {
			Quests []struct {
				ID       string `json:"id"`
				WorldID  string `json:"worldId"`
				GraphID  string `json:"graphId"`
				Level    string `json:"level"`
				Title    string `json:"title"`
				Subtitle string `json:"subtitle"`
				NPC      string `json:"npcId"`
				Location string `json:"location"`
				Story    any    `json:"story"`
			} `json:"quests"`
			Chapters []storyChapter `json:"chapters"`
			NPCs     []struct {
				WorldID string `json:"worldId"`
				Name    string `json:"name"`
				Role    string `json:"role"`
				Color   string `json:"color"`
			} `json:"npcs"`
			Acts []struct {
				Number      string `json:"number"`
				Title       string `json:"title"`
				Level       string `json:"level"`
				MapID       string `json:"mapId"`
				Premise     any    `json:"premise"`
				Goal        any    `json:"goal"`
				Cliffhanger any    `json:"cliffhanger"`
			} `json:"acts"`
		}
		if data, ok := a.content.Private(course.ID, "bootstrap"); ok {
			_ = json.Unmarshal(data, &bootstrap)
		}
		for _, chapter := range bootstrap.Chapters {
			chapter.CourseID = course.ID
			listing.Chapters = append(listing.Chapters, chapter)
		}
		for _, npc := range bootstrap.NPCs {
			listing.NPCs[npc.WorldID] = storyNPC{Name: npc.Name, Role: npc.Role, Color: npc.Color}
		}
		for _, act := range bootstrap.Acts {
			listing.Acts = append(listing.Acts, storyAct{CourseID: course.ID, Number: act.Number, Title: act.Title, Level: act.Level, MapID: act.MapID,
				Premise: a.sentences(act.Premise), Goal: a.sentences(act.Goal), Cliffhanger: a.sentences(act.Cliffhanger)})
		}
		for _, quest := range bootstrap.Quests {
			record, ok := graphs[quest.GraphID]
			if !ok || placed[record.ID] {
				continue
			}
			placed[record.ID] = true
			scene := a.storyScene(record, overrides)
			scene.QuestID, scene.QuestUUID = quest.WorldID, quest.ID
			scene.Title, scene.Subtitle, scene.NPC, scene.Location = quest.Title, quest.Subtitle, quest.NPC, quest.Location
			scene.Synopsis = a.sentences(quest.Story)
			if quest.Level != "" {
				scene.Level = quest.Level
			}
			listing.Scenes = append(listing.Scenes, scene)
		}
	}
	// Scenes without a bootstrap entry still appear, after the story.
	rest := []contentstore.Record{}
	for id, record := range graphs {
		if !placed[id] {
			rest = append(rest, record)
		}
	}
	sort.Slice(rest, func(i, j int) bool { return rest[i].Slug < rest[j].Slug })
	for _, record := range rest {
		scene := a.storyScene(record, overrides)
		scene.Title = record.Slug
		listing.Scenes = append(listing.Scenes, scene)
	}
	lexicon := a.storyLexicon()
	for _, scene := range listing.Scenes {
		eachStoryText(&scene, func(text storyText) {
			for _, word := range text.Words {
				if entry, ok := lexicon.entries[word.Lexeme]; ok {
					listing.Lexemes[word.Lexeme] = entry
				}
			}
		})
	}
	return listing
}

func eachStoryText(scene *storyScene, visit func(storyText)) {
	for _, block := range scene.Blocks {
		if block.Question != nil {
			visit(*block.Question)
		}
		for _, choice := range block.Choices {
			visit(choice.storyText)
		}
		for _, line := range block.Lines {
			visit(line.storyText)
			if line.Edit != nil {
				visit(line.Edit.storyText)
			}
		}
	}
}

// storyScene reads one dialogue graph with the admin overrides applied.
func (a *App) storyScene(record contentstore.Record, overrides StoryOverrides) storyScene {
	var body map[string]any
	_ = json.Unmarshal(record.Body, &body)
	questID := stringValue(body["questId"])
	scene := storyScene{GraphID: record.ID, CourseID: record.CourseID, QuestID: a.worldName(questID), QuestUUID: questID, Level: stringValue(body["level"]),
		Start: stringValue(body["start"]), Synopsis: []storyText{}, Objectives: []storyObjective{}, Blocks: []storyBlock{}}
	for _, entry := range anyValues(body["objectives"]) {
		objective, _ := entry.(map[string]any)
		scene.Objectives = append(scene.Objectives, storyObjective{Text: stringValue(objective["text"]), Stage: stringValue(objective["stage"])})
	}
	lines := func(stage string, entries []any) []storyLine {
		visible := 0
		for _, entry := range entries {
			line, _ := entry.(map[string]any)
			if _, gone := overrides.HiddenLines[a.lineKey(stringValue(line["id"]))]; !gone {
				visible++
			}
		}
		result := []storyLine{}
		for _, entry := range entries {
			line, _ := entry.(map[string]any)
			id := stringValue(line["id"])
			key := a.lineKey(id)
			value := storyLine{ID: id, Speaker: stringValue(line["speaker"]), AddressedTo: stringValue(line["addressedTo"]), storyText: a.sentence(stringValue(line["sentenceId"])),
				Audio: stringValue(line["clipId"]) != ""}
			if hidden, ok := overrides.HiddenLines[key]; ok {
				at := hidden.At
				value.Hidden, value.HiddenBy, value.HiddenAt = true, hidden.By, &at
			} else {
				value.Locked = lineLock(stage, line, visible)
			}
			if condition, ok := line["condition"].(map[string]any); ok {
				value.Condition = a.readable(condition)
			}
			if reply, ok := line["reply"].(map[string]any); ok {
				value.Reply = a.task(stringValue(reply["exerciseId"]))
			}
			for _, variant := range anyValues(line["variants"]) {
				ref, _ := variant.(map[string]any)
				if text := a.sentence(stringValue(ref["sentenceId"])); text.Text != "" {
					value.Variants = append(value.Variants, text)
				}
			}
			if edit, ok := overrides.EditedLines[key]; ok {
				value.Edit = &storyEdit{storyText: storyText{Text: edit.Text, Translations: edit.Translations, Words: a.analyzeStoryText(edit.Text)}, By: edit.By, At: edit.At}
				if value.Edit.Translations == nil {
					value.Edit.Translations = map[string]string{}
				}
			}
			result = append(result, value)
		}
		return result
	}
	for _, entry := range anyValues(body["nodes"]) {
		node, _ := entry.(map[string]any)
		stage := stringValue(node["stage"])
		block := storyBlock{ID: stringValue(node["id"]), Kind: stage, Label: stageLabels[stage], Next: stringValue(node["next"]), Lines: lines(stage, anyValues(node["lines"]))}
		block.Terminal, _ = node["terminal"].(bool)
		if exercise := stringValue(node["gateExerciseId"]); exercise != "" {
			block.Task = a.task(exercise)
			if prompt := stringValue(body["gatePrompt"]); prompt != "" && block.Task != nil {
				block.Task.Prompt = prompt
			}
		}
		for _, entry := range anyValues(node["choices"]) {
			choice, _ := entry.(map[string]any)
			value := storyChoice{ID: stringValue(choice["id"]), storyText: a.sentence(stringValue(choice["sentenceId"])), Next: stringValue(choice["next"]), Effects: []map[string]any{}}
			for _, effect := range anyValues(choice["effects"]) {
				if effect, ok := effect.(map[string]any); ok {
					value.Effects = append(value.Effects, a.readable(effect))
				}
			}
			if condition, ok := choice["condition"].(map[string]any); ok {
				value.Condition = a.readable(condition)
			}
			block.Choices = append(block.Choices, value)
		}
		scene.Blocks = append(scene.Blocks, block)
	}
	for _, entry := range anyValues(body["topics"]) {
		topic, _ := entry.(map[string]any)
		question := a.sentence(stringValue(topic["sentenceId"]))
		block := storyBlock{ID: stringValue(topic["id"]), Kind: "topic", Label: "Optional question", Question: &question, Lines: lines("topic", anyValues(topic["lines"]))}
		if condition, ok := topic["condition"].(map[string]any); ok {
			block.Condition = a.readable(condition)
		}
		scene.Blocks = append(scene.Blocks, block)
	}
	return scene
}

// Story vocabulary ----------------------------------------------------------------------------

type storyLexicon struct {
	entries map[string]storyLexeme
	// Surface form → lexeme IDs, exact case and lower case, per course.
	exact, folded map[string][]string
}

var storyLexicons sync.Map // *contentstore.Bundle → *storyLexicon

// storyLexicon indexes the course lexicon by surface form. Content is
// immutable after boot, so the index is built once per installed bundle.
func (a *App) storyLexicon() *storyLexicon {
	if a.content == nil {
		return &storyLexicon{entries: map[string]storyLexeme{}, exact: map[string][]string{}, folded: map[string][]string{}}
	}
	if cached, ok := storyLexicons.Load(a.content); ok {
		return cached.(*storyLexicon)
	}
	lexicon := &storyLexicon{entries: map[string]storyLexeme{}, exact: map[string][]string{}, folded: map[string][]string{}}
	add := func(table map[string][]string, form, id string) {
		for _, existing := range table[form] {
			if existing == id {
				return
			}
		}
		table[form] = append(table[form], id)
	}
	target := map[string]string{}
	for _, course := range a.content.Courses {
		target[course.ID] = course.Target
	}
	for _, record := range a.content.Records {
		if record.Kind != "lexeme" || target[record.CourseID] != "de" {
			continue
		}
		var body struct {
			Lemma    string            `json:"lemma"`
			Level    string            `json:"level"`
			POS      string            `json:"pos"`
			Meanings map[string]string `json:"meanings"`
			Forms    []string          `json:"forms"`
		}
		if json.Unmarshal(record.Body, &body) != nil || body.Lemma == "" {
			continue
		}
		lexicon.entries[record.ID] = storyLexeme{Lemma: body.Lemma, Level: body.Level, Meaning: body.Meanings["en"], POS: body.POS}
		for _, form := range append([]string{body.Lemma}, body.Forms...) {
			if form = strings.TrimSpace(form); form != "" && !strings.HasPrefix(form, "-") {
				add(lexicon.exact, form, record.ID)
				add(lexicon.folded, strings.ToLower(form), record.ID)
			}
		}
	}
	actual, _ := storyLexicons.LoadOrStore(a.content, lexicon)
	return actual.(*storyLexicon)
}

var storyToken = regexp.MustCompile(`\{[^{}]*\}|[\p{L}\p{M}]+(?:['’-][\p{L}\p{M}]+)*`)

// analyzeStoryText splits a target-language line into words and links each
// unambiguous form to its lexeme, the way the content build does. Offsets are
// UTF-16, matching authored word ranges in the browser.
func (a *App) analyzeStoryText(text string) []storyWord {
	lexicon := a.storyLexicon()
	words := []storyWord{}
	for _, span := range storyToken.FindAllStringIndex(text, -1) {
		token := text[span[0]:span[1]]
		if strings.HasPrefix(token, "{") {
			continue
		}
		matches := lexicon.exact[token]
		if len(matches) == 0 {
			matches = lexicon.folded[strings.ToLower(token)]
		}
		word := storyWord{Start: utf16Len(text[:span[0]]), End: utf16Len(text[:span[1]])}
		if len(matches) == 1 {
			word.Lexeme = matches[0]
		}
		words = append(words, word)
	}
	return words
}

func utf16Len(text string) int {
	n := 0
	for _, r := range text {
		n += len(utf16.Encode([]rune{r}))
	}
	return n
}

// Serving ---------------------------------------------------------------------------------------

// applyStoryOverrides removes hidden lines from a served graph body and swaps
// in edited text for the player's support language.
func (a *App) applyStoryOverrides(body map[string]any, lang string) {
	story := a.storyOverrides()
	if len(story.HiddenLines) == 0 && len(story.EditedLines) == 0 {
		return
	}
	apply := func(lines []any) []any {
		result := make([]any, 0, len(lines))
		for _, entry := range lines {
			line, _ := entry.(map[string]any)
			key := a.lineKey(stringValue(line["id"]))
			if _, gone := story.HiddenLines[key]; gone {
				continue
			}
			if edit, ok := story.EditedLines[key]; ok && line != nil {
				delete(line, "sentenceId")
				delete(line, "variants")
				line["clipId"] = ""
				line["german"] = edit.Text
				line["english"] = edit.Translations[lang]
				line["localized"] = true
				line["edited"] = true
			}
			result = append(result, entry)
		}
		return result
	}
	for _, key := range []string{"nodes", "topics"} {
		for _, entry := range anyValues(body[key]) {
			container, _ := entry.(map[string]any)
			if container != nil && container["lines"] != nil {
				container["lines"] = apply(anyValues(container["lines"]))
			}
		}
	}
}

// Admin endpoints -----------------------------------------------------------------------------

func (a *App) readStory(w http.ResponseWriter, r *http.Request) {
	if _, ok := a.requireAdmin(w, r); !ok || !a.editorAvailable(w) {
		return
	}
	writeJSON(w, 200, a.storyListing(a.storyOverrides()))
}

var storyPlaceholder = regexp.MustCompile(`\{[^{}]*\}`)

// placeholderProblem names a {placeholder} the authored line does not use.
// The game fills only the placeholders it knows, so an invented one would
// reach players as literal braces.
func placeholderProblem(text, authored string) string {
	known := map[string]bool{}
	for _, name := range storyPlaceholder.FindAllString(authored, -1) {
		known[name] = true
	}
	for _, name := range storyPlaceholder.FindAllString(text, -1) {
		if !known[name] {
			if len(known) == 0 {
				return "This line has no placeholders. Remove " + name + "."
			}
			names := make([]string, 0, len(known))
			for name := range known {
				names = append(names, name)
			}
			sort.Strings(names)
			return "Use only the placeholders of the original line: " + strings.Join(names, ", ") + "."
		}
	}
	if strings.ContainsAny(storyPlaceholder.ReplaceAllString(text, ""), "{}") {
		return "Close every { with a }."
	}
	return ""
}

const maxStoryLineLength = 240

// checkStoryText analyses a draft line so the editor can show which words a
// rewrite teaches before it is saved.
func (a *App) checkStoryText(w http.ResponseWriter, r *http.Request) {
	if _, ok := a.requireAdmin(w, r); !ok || !a.editorAvailable(w) {
		return
	}
	var body struct {
		Text     string `json:"text"`
		Authored string `json:"authored"`
	}
	if err := decodeJSON(w, r, &body); err != nil {
		apiFailure(w, err)
		return
	}
	if utf8.RuneCountInString(body.Text) > maxStoryLineLength*2 {
		apiFailure(w, worldProblems(400, "invalid", "That line is too long to check."))
		return
	}
	lexicon := a.storyLexicon()
	words := a.analyzeStoryText(body.Text)
	lexemes := map[string]storyLexeme{}
	for _, word := range words {
		if entry, ok := lexicon.entries[word.Lexeme]; ok {
			lexemes[word.Lexeme] = entry
		}
	}
	problems := []string{}
	if problem := placeholderProblem(body.Text, body.Authored); problem != "" {
		problems = append(problems, problem)
	}
	writeJSON(w, 200, map[string]any{"words": words, "lexemes": lexemes, "problems": problems})
}

// setStoryLine hides, restores, rewrites or resets one line for every player.
func (a *App) setStoryLine(w http.ResponseWriter, r *http.Request) {
	account, ok := a.requireAdmin(w, r)
	if !ok || !a.editorAvailable(w) {
		return
	}
	var body struct {
		LineID       string            `json:"lineId"`
		Hidden       *bool             `json:"hidden"`
		Text         *string           `json:"text"`
		Translations map[string]string `json:"translations"`
		Reset        bool              `json:"reset"`
	}
	if err := decodeJSON(w, r, &body); err != nil {
		apiFailure(w, err)
		return
	}
	if !contentstore.UUID.MatchString(body.LineID) {
		apiFailure(w, worldProblems(400, "invalid", "Choose a story line."))
		return
	}
	if body.Hidden == nil && body.Text == nil && !body.Reset {
		apiFailure(w, worldProblems(400, "invalid", "Say what should change on this line."))
		return
	}
	key := a.lineKey(body.LineID)
	editing := a.editing
	deadline := time.Now().Add(5 * time.Second)
	for !editing.writes.TryLock() {
		if time.Now().After(deadline) {
			apiFailure(w, worldProblems(409, "stale", "Another change is still being saved. Try again in a moment."))
			return
		}
		time.Sleep(25 * time.Millisecond)
	}
	defer editing.writes.Unlock()
	editing.mu.RLock()
	previous := editing.current
	editing.mu.RUnlock()
	story := StoryOverrides{HiddenLines: map[string]HiddenLine{}, EditedLines: map[string]EditedLine{}}
	for id, line := range previous.Story.HiddenLines {
		story.HiddenLines[id] = line
	}
	for id, line := range previous.Story.EditedLines {
		story.EditedLines[id] = line
	}
	scene, line := a.findStoryLine(key, story)
	if scene == nil {
		apiFailure(w, worldProblems(404, "missing", "That line is not part of any story scene."))
		return
	}
	now, by := a.now().UTC(), adminDisplayName(account)
	if body.Hidden != nil {
		switch {
		case *body.Hidden && line.Hidden:
		case *body.Hidden && line.Locked != "":
			apiFailure(w, worldProblems(422, "locked", line.Locked))
			return
		case *body.Hidden:
			story.HiddenLines[key] = HiddenLine{GraphID: scene.GraphID, By: by, At: now}
		default:
			delete(story.HiddenLines, key)
		}
	}
	if body.Reset {
		delete(story.EditedLines, key)
	}
	if body.Text != nil {
		text := strings.Join(strings.Fields(*body.Text), " ")
		switch {
		case text == "":
			apiFailure(w, worldProblems(422, "invalid", "Write the line, or hide it instead."))
			return
		case utf8.RuneCountInString(text) > maxStoryLineLength:
			apiFailure(w, worldProblems(422, "invalid", "Keep a line under 240 characters. Split longer speech over two lines."))
			return
		}
		if problem := placeholderProblem(text, line.Text); problem != "" {
			apiFailure(w, worldProblems(422, "invalid", problem))
			return
		}
		translations := map[string]string{}
		same := text == line.Text
		for _, lang := range a.content.ByCourse[scene.CourseID].SupportLanguages {
			value := line.Translations[lang]
			if supplied, ok := body.Translations[lang]; ok {
				value = strings.Join(strings.Fields(supplied), " ")
			}
			if utf8.RuneCountInString(value) > maxStoryLineLength*2 {
				apiFailure(w, worldProblems(422, "invalid", "That translation is too long."))
				return
			}
			translations[lang] = value
			same = same && value == line.Translations[lang]
		}
		if same {
			delete(story.EditedLines, key)
		} else {
			story.EditedLines[key] = EditedLine{GraphID: scene.GraphID, Text: text, Translations: translations, By: by, At: now}
		}
	}
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()
	stored := store.StoryLine{Key: key, GraphID: scene.GraphID}
	if hidden, ok := story.HiddenLines[key]; ok {
		stored.Hidden, _ = json.Marshal(hidden)
	}
	if edited, ok := story.EditedLines[key]; ok {
		stored.Edited, _ = json.Marshal(edited)
	}
	if err := editing.store.SaveStoryLine(ctx, stored); err != nil {
		apiFailure(w, err)
		return
	}
	next := *previous
	next.Story = story
	editing.mu.Lock()
	editing.current = &next
	editing.mu.Unlock()
	a.world.PublishStoryChange(scene.GraphID, scene.QuestID)
	updated, _ := a.findStoryLine(key, story)
	writeJSON(w, 200, map[string]any{"scene": *updated})
}

func (a *App) findStoryLine(key string, story StoryOverrides) (*storyScene, *storyLine) {
	if a.content == nil {
		return nil, nil
	}
	for _, record := range a.content.Records {
		if record.Kind != "graph" {
			continue
		}
		scene := a.storyScene(record, story)
		for bi := range scene.Blocks {
			for li := range scene.Blocks[bi].Lines {
				if a.lineKey(scene.Blocks[bi].Lines[li].ID) == key {
					return &scene, &scene.Blocks[bi].Lines[li]
				}
			}
		}
	}
	return nil, nil
}
