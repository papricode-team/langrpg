package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"sort"
	"strings"
	"time"

	"glotworld/server/internal/contentstore"
)

// StoryOverrides holds admin changes layered over authored story content. They
// never touch source files, translations or audio, so every change is reversible.
type StoryOverrides struct {
	// Hidden monologue lines, keyed by line UUID.
	HiddenLines map[string]HiddenLine `json:"hiddenLines,omitempty"`
}

type HiddenLine struct {
	GraphID string    `json:"graphId"`
	By      string    `json:"by"`
	At      time.Time `json:"at"`
}

// storyLine is one line of a character's monologue as admins see it.
type storyLine struct {
	ID      string `json:"id"`
	Speaker string `json:"speaker"`
	German  string `json:"german"`
	English string `json:"english"`
	Hidden  bool   `json:"hidden"`
	// Why the line cannot be hidden; empty when it can.
	Locked string `json:"locked,omitempty"`
}

type storyBlock struct {
	Kind  string      `json:"kind"`
	Label string      `json:"label"`
	Lines []storyLine `json:"lines"`
}

type storyGraph struct {
	ID       string       `json:"id"`
	CourseID string       `json:"courseId"`
	QuestID  string       `json:"questId"`
	Level    string       `json:"level"`
	Blocks   []storyBlock `json:"blocks"`
}

var stageLabels = map[string]string{"intro": "Greeting and story", "gate": "Before the task", "choice": "The decision", "complete": "After the decision"}

func (a *App) hiddenLines() map[string]HiddenLine {
	if a.editing == nil {
		return nil
	}
	a.editing.mu.RLock()
	defer a.editing.mu.RUnlock()
	return a.editing.current.Story.HiddenLines
}

func (a *App) lineKey(id string) string {
	if a.canonical == nil {
		return strings.ToLower(id)
	}
	return a.canonical.translate(strings.ToLower(id), true)
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

func (a *App) sentenceText(id string) (string, string) {
	if a.content == nil || id == "" {
		return "", ""
	}
	record, ok := a.content.ByID[a.lineKey(id)]
	if !ok {
		return "", ""
	}
	var body struct {
		Text         string `json:"text"`
		Translations map[string]struct {
			Text string `json:"text"`
		} `json:"translations"`
	}
	_ = json.Unmarshal(record.Body, &body)
	return body.Text, body.Translations["en"].Text
}

// storyGraphs lists every scene's monologue for the admin Story tab.
func (a *App) storyGraphs(hidden map[string]HiddenLine) []storyGraph {
	graphs := []storyGraph{}
	if a.content == nil {
		return graphs
	}
	for _, record := range a.content.Records {
		if record.Kind != "graph" {
			continue
		}
		var body map[string]any
		if json.Unmarshal(record.Body, &body) != nil {
			continue
		}
		questID := stringValue(body["questId"])
		if a.canonical != nil {
			questID = a.canonical.translate(questID, false)
		}
		graph := storyGraph{ID: record.ID, CourseID: record.CourseID, QuestID: questID, Level: stringValue(body["level"])}
		block := func(kind, label string, lines []any) storyBlock {
			visible := 0
			for _, entry := range lines {
				line, _ := entry.(map[string]any)
				if _, gone := hidden[a.lineKey(stringValue(line["id"]))]; !gone {
					visible++
				}
			}
			result := storyBlock{Kind: kind, Label: label, Lines: []storyLine{}}
			for _, entry := range lines {
				line, _ := entry.(map[string]any)
				id := stringValue(line["id"])
				_, isHidden := hidden[a.lineKey(id)]
				german, english := a.sentenceText(stringValue(line["sentenceId"]))
				lock := ""
				if !isHidden {
					lock = lineLock(kind, line, visible)
				}
				result.Lines = append(result.Lines, storyLine{ID: id, Speaker: stringValue(line["speaker"]), German: german, English: english, Hidden: isHidden, Locked: lock})
			}
			return result
		}
		for _, entry := range anyValues(body["nodes"]) {
			node, _ := entry.(map[string]any)
			stage := stringValue(node["stage"])
			graph.Blocks = append(graph.Blocks, block(stage, stageLabels[stage], anyValues(node["lines"])))
		}
		for _, entry := range anyValues(body["topics"]) {
			topic, _ := entry.(map[string]any)
			question, _ := a.sentenceText(stringValue(topic["sentenceId"]))
			if question == "" {
				question = "Optional question"
			}
			graph.Blocks = append(graph.Blocks, block("topic", "Question: "+question, anyValues(topic["lines"])))
		}
		graphs = append(graphs, graph)
	}
	sort.SliceStable(graphs, func(i, j int) bool { return graphs[i].CourseID < graphs[j].CourseID })
	return graphs
}

// filterHiddenLines removes hidden monologue lines from a served graph body.
func (a *App) filterHiddenLines(body map[string]any) {
	hidden := a.hiddenLines()
	if len(hidden) == 0 {
		return
	}
	keep := func(lines []any) []any {
		result := make([]any, 0, len(lines))
		for _, entry := range lines {
			line, _ := entry.(map[string]any)
			if _, gone := hidden[a.lineKey(stringValue(line["id"]))]; !gone {
				result = append(result, entry)
			}
		}
		return result
	}
	for _, key := range []string{"nodes", "topics"} {
		for _, entry := range anyValues(body[key]) {
			container, _ := entry.(map[string]any)
			if container != nil && container["lines"] != nil {
				container["lines"] = keep(anyValues(container["lines"]))
			}
		}
	}
}

func (a *App) readStoryLines(w http.ResponseWriter, r *http.Request) {
	if _, ok := a.requireAdmin(w, r); !ok || !a.editorAvailable(w) {
		return
	}
	writeJSON(w, 200, map[string]any{"graphs": a.storyGraphs(a.hiddenLines())})
}

// setStoryLine hides or restores one monologue line for every player.
func (a *App) setStoryLine(w http.ResponseWriter, r *http.Request) {
	account, ok := a.requireAdmin(w, r)
	if !ok || !a.editorAvailable(w) {
		return
	}
	var body struct {
		LineID string `json:"lineId"`
		Hidden bool   `json:"hidden"`
	}
	if err := decodeJSON(w, r, &body); err != nil {
		apiFailure(w, err)
		return
	}
	if !contentstore.UUID.MatchString(body.LineID) {
		apiFailure(w, worldProblems(400, "invalid", "Choose a story line."))
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
	hidden := map[string]HiddenLine{}
	for id, line := range previous.Story.HiddenLines {
		hidden[id] = line
	}
	var found *storyGraph
	var line *storyLine
	graphs := a.storyGraphs(hidden)
	for gi := range graphs {
		for bi := range graphs[gi].Blocks {
			for li := range graphs[gi].Blocks[bi].Lines {
				if a.lineKey(graphs[gi].Blocks[bi].Lines[li].ID) == key {
					found, line = &graphs[gi], &graphs[gi].Blocks[bi].Lines[li]
				}
			}
		}
	}
	if found == nil {
		apiFailure(w, worldProblems(404, "missing", "That line is not part of any story scene."))
		return
	}
	if body.Hidden {
		if line.Hidden {
			writeJSON(w, 200, map[string]any{"graph": *found})
			return
		}
		if line.Locked != "" {
			apiFailure(w, worldProblems(422, "locked", line.Locked))
			return
		}
		hidden[key] = HiddenLine{GraphID: found.ID, By: adminDisplayName(account), At: a.now().UTC()}
	} else {
		delete(hidden, key)
	}
	next := *previous
	next.Story = StoryOverrides{HiddenLines: hidden}
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()
	if err := editing.store.SaveWorldContent(ctx, previous.Revision, &next); err != nil {
		if errors.Is(err, ErrConflict) {
			apiFailure(w, worldProblems(409, "stale", "The world changed while saving. Reload and try again."))
			return
		}
		apiFailure(w, err)
		return
	}
	editing.mu.Lock()
	editing.current = &next
	editing.mu.Unlock()
	a.world.publishStoryChange(found.ID, found.QuestID)
	for _, graph := range a.storyGraphs(hidden) {
		if graph.ID == found.ID {
			writeJSON(w, 200, map[string]any{"graph": graph})
			return
		}
	}
	writeJSON(w, 200, map[string]any{})
}

// publishStoryChange tells players to fetch a scene's dialogue again.
func (w *World) publishStoryChange(graphID, questID string) {
	message, err := json.Marshal(map[string]any{"type": "story.changed", "graphId": graphID, "questId": questID})
	if err != nil {
		return
	}
	w.mu.Lock()
	defer w.mu.Unlock()
	for _, client := range w.clients {
		w.enqueueLocked(client, message)
	}
}
