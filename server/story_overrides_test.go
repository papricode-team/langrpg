package main

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
)

func storyAdminApp(t *testing.T) (*App, string) {
	t.Helper()
	app := contentTestApp(t)
	if err := app.initWorldEditing(context.Background(), worldSeedPath, "../scripts/admin-world-compiler.mjs"); err != nil {
		t.Fatal(err)
	}
	app.adminEmails = map[string]bool{"admin@example.com": true}
	token, _ := createSession(t, app, "Story Editor")
	if err := app.store.SetCredentials(context.Background(), tokenHash(token), "admin@example.com", "stored-password-hash"); err != nil {
		t.Fatal(err)
	}
	return app, token
}

type servedLine struct {
	ID         string `json:"id"`
	SentenceID string `json:"sentenceId"`
	ClipID     string `json:"clipId"`
	German     string `json:"german"`
	English    string `json:"english"`
	Edited     bool   `json:"edited"`
}

func servedLines(t *testing.T, app *App, token, graphID string) map[string]servedLine {
	t.Helper()
	res := request(app, "GET", "/api/content/graphs/"+graphID, token, nil)
	if res.Code != 200 {
		t.Fatalf("graph: %d %s", res.Code, res.Body.String())
	}
	var record struct {
		Body struct {
			Nodes  []struct{ Lines []servedLine } `json:"nodes"`
			Topics []struct{ Lines []servedLine } `json:"topics"`
		} `json:"body"`
	}
	if err := json.Unmarshal(res.Body.Bytes(), &record); err != nil {
		t.Fatal(err)
	}
	lines := map[string]servedLine{}
	for _, node := range append(record.Body.Nodes, record.Body.Topics...) {
		for _, line := range node.Lines {
			lines[line.ID] = line
		}
	}
	return lines
}

func readStoryListing(t *testing.T, app *App, token string) storyListing {
	t.Helper()
	res := request(app, "GET", "/api/admin/story", token, nil)
	var listing storyListing
	if res.Code != 200 || json.Unmarshal(res.Body.Bytes(), &listing) != nil {
		t.Fatalf("listing: %d %s", res.Code, res.Body.String())
	}
	return listing
}

func TestAdminStoryListingFollowsThePlayOrder(t *testing.T) {
	app, token := storyAdminApp(t)
	player, _ := createSession(t, app, "Player")
	if res := request(app, "GET", "/api/admin/story", player, nil); res.Code != 403 {
		t.Fatalf("players must not read the admin story: %d", res.Code)
	}
	listing := readStoryListing(t, app, token)
	if len(listing.Scenes) < 41 || listing.Scenes[0].QuestID != "a1-arrival" || listing.Scenes[1].QuestID != "a1-timetable" {
		t.Fatalf("scenes should follow the story order: %d scenes", len(listing.Scenes))
	}
	first := listing.Scenes[0]
	if first.Title == "" || first.NPC != "otto" || len(first.Synopsis) == 0 || listing.NPCs["otto"].Name != "Otto" {
		t.Fatalf("scene header: %+v", first)
	}
	if len(listing.Acts) == 0 || listing.Acts[0].Title == "" || len(listing.Acts[0].Premise) == 0 {
		t.Fatalf("acts: %+v", listing.Acts)
	}
	var decision *storyBlock
	for i := range first.Blocks {
		if first.Blocks[i].Kind == "choice" {
			decision = &first.Blocks[i]
		}
	}
	if decision == nil || len(decision.Choices) != 2 || decision.Choices[0].Text == "" || decision.Choices[0].Next == "" {
		t.Fatalf("decision: %+v", decision)
	}
	flags := []string{}
	for _, effect := range decision.Choices[0].Effects {
		if flag, ok := effect["flag"].(string); ok {
			flags = append(flags, flag)
		}
	}
	if strings.Join(flags, ",") != "platform-reported" {
		t.Fatalf("choice effects should name flags: %v", decision.Choices[0].Effects)
	}
	conditional := false
	for _, block := range listing.Scenes[1].Blocks {
		for _, line := range block.Lines {
			if line.Condition["flag"] == "platform-protected" {
				conditional = true
			}
		}
	}
	if !conditional {
		t.Fatal("later scenes should show which choice their lines depend on")
	}
	linked := 0
	for _, block := range first.Blocks {
		for _, line := range block.Lines {
			for _, word := range line.Words {
				if _, ok := listing.Lexemes[word.Lexeme]; ok {
					linked++
				}
			}
		}
	}
	if linked == 0 {
		t.Fatal("lines should link their words to the lexicon")
	}
}

func TestAdminsHideAndRestoreMonologueLinesOnly(t *testing.T) {
	app, token := storyAdminApp(t)
	graphID := app.content.IDs["graph:a1-arrival"]
	if graphID == "" {
		t.Fatal("missing a1-arrival graph")
	}
	var hideable, reply, decision string
	for _, scene := range readStoryListing(t, app, token).Scenes {
		if scene.GraphID != graphID {
			continue
		}
		for _, block := range scene.Blocks {
			for _, line := range block.Lines {
				switch {
				case block.Kind == "intro" && line.Locked == "" && hideable == "" && line.Text != "":
					hideable = line.ID
				case line.Reply != nil && strings.Contains(line.Locked, "answers"):
					reply = line.ID
				case block.Kind == "choice" && decision == "":
					decision = line.ID
				}
			}
		}
	}
	if hideable == "" || reply == "" || decision == "" {
		t.Fatalf("fixture lines: %q %q %q", hideable, reply, decision)
	}
	if _, ok := servedLines(t, app, token, graphID)[hideable]; !ok {
		t.Fatal("line should be served before hiding")
	}
	if res := request(app, "POST", "/api/admin/story/lines", token, map[string]any{"lineId": hideable, "hidden": true}); res.Code != 200 {
		t.Fatalf("hide: %d %s", res.Code, res.Body.String())
	}
	if _, ok := servedLines(t, app, token, graphID)[hideable]; ok {
		t.Fatal("hidden line is still served")
	}
	for _, id := range []string{reply, decision} {
		if res := request(app, "POST", "/api/admin/story/lines", token, map[string]any{"lineId": id, "hidden": true}); res.Code != 422 || !strings.Contains(res.Body.String(), "cannot be hidden") {
			t.Fatalf("protected line %s: %d %s", id, res.Code, res.Body.String())
		}
	}
	if res := request(app, "POST", "/api/admin/story/lines", token, map[string]any{"lineId": hideable, "hidden": false}); res.Code != 200 {
		t.Fatalf("restore: %d %s", res.Code, res.Body.String())
	}
	if _, ok := servedLines(t, app, token, graphID)[hideable]; !ok {
		t.Fatal("restored line should be served again")
	}
	if len(app.editing.current.Story.HiddenLines) != 0 {
		t.Fatal("restore should clear the override")
	}
}

func TestAdminsRewriteStoryLinesForEveryone(t *testing.T) {
	app, token := storyAdminApp(t)
	graphID := app.content.IDs["graph:a1-arrival"]
	var target storyLine
	for _, scene := range readStoryListing(t, app, token).Scenes {
		if scene.GraphID == graphID {
			for _, line := range scene.Blocks[0].Lines {
				if strings.Contains(line.Text, "{name}") {
					target = line
				}
			}
		}
	}
	if target.ID == "" {
		t.Fatal("fixture needs a line with {name}")
	}
	edit := func(value map[string]any) (int, string) {
		value["lineId"] = target.ID
		res := request(app, "POST", "/api/admin/story/lines", token, value)
		return res.Code, res.Body.String()
	}
	if code, body := edit(map[string]any{"text": "Hier steht {vorname}."}); code != 422 || !strings.Contains(body, "{name}") {
		t.Fatalf("unknown placeholders must be refused: %d %s", code, body)
	}
	if code, body := edit(map[string]any{"text": "   "}); code != 422 {
		t.Fatalf("empty text must be refused: %d %s", code, body)
	}
	code, body := edit(map[string]any{"text": "Hier steht  {name}. Die Laterne ist alt.", "translations": map[string]string{"en": "It says {name}. The lantern is old."}})
	if code != 200 {
		t.Fatalf("edit: %d %s", code, body)
	}
	var saved struct{ Scene storyScene }
	_ = json.Unmarshal([]byte(body), &saved)
	var edited *storyLine
	for _, block := range saved.Scene.Blocks {
		for i := range block.Lines {
			if block.Lines[i].ID == target.ID {
				edited = &block.Lines[i]
			}
		}
	}
	if edited == nil || edited.Edit == nil || edited.Edit.Text != "Hier steht {name}. Die Laterne ist alt." || edited.Text != target.Text {
		t.Fatalf("the listing should keep the authored text beside the edit: %+v", edited)
	}
	if edited.Edit.Translations["tr"] != target.Translations["tr"] || edited.Edit.By == "" {
		t.Fatalf("untouched translations are carried over: %+v", edited.Edit)
	}
	lantern := false
	for _, word := range edited.Edit.Words {
		if word.Lexeme != "" && app.storyLexicon().entries[word.Lexeme].Lemma == "Laterne" {
			lantern = true
		}
	}
	if !lantern {
		t.Fatalf("edited words should link to the lexicon: %+v", edited.Edit.Words)
	}
	served := servedLines(t, app, token, graphID)[target.ID]
	if served.German != "Hier steht {name}. Die Laterne ist alt." || served.English != "It says {name}. The lantern is old." || served.SentenceID != "" || served.ClipID != "" || !served.Edited {
		t.Fatalf("players should get the edited line without the old audio: %+v", served)
	}
	if code, body := edit(map[string]any{"reset": true}); code != 200 {
		t.Fatalf("reset: %d %s", code, body)
	}
	if served := servedLines(t, app, token, graphID)[target.ID]; served.SentenceID == "" || served.Edited {
		t.Fatalf("reset should serve the authored sentence again: %+v", served)
	}
	if code, _ := edit(map[string]any{"text": target.Text}); code != 200 || len(app.editing.current.Story.EditedLines) != 0 {
		t.Fatal("saving the authored text should not store an edit")
	}
}

func TestStoryDraftCheckLinksWords(t *testing.T) {
	app, token := storyAdminApp(t)
	res := request(app, "POST", "/api/admin/story/check", token, map[string]any{"text": "Die Laterne ist {nme}.", "authored": "Hier steht {name}."})
	var result struct {
		Words    []storyWord
		Lexemes  map[string]storyLexeme
		Problems []string
	}
	if res.Code != 200 || json.Unmarshal(res.Body.Bytes(), &result) != nil {
		t.Fatalf("check: %d %s", res.Code, res.Body.String())
	}
	if len(result.Words) != 3 || result.Words[1].Start != 4 || result.Words[1].End != 11 || result.Lexemes[result.Words[1].Lexeme].Lemma != "Laterne" {
		t.Fatalf("words: %+v", result)
	}
	if len(result.Problems) != 1 {
		t.Fatalf("placeholder problem expected: %v", result.Problems)
	}
	if words := app.analyzeStoryText("Grüß dich, Bär"); len(words) != 3 || words[2].Start != 11 || words[2].End != 14 {
		t.Fatalf("offsets should count UTF-16 units: %+v", words)
	}
}
