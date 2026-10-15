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
	if err := app.initWorldEditing(context.Background(), "../web/src/data/world-scenes.json", "../scripts/admin-world-compiler.mjs"); err != nil {
		t.Fatal(err)
	}
	app.adminEmails = map[string]bool{"admin@example.com": true}
	token, _ := createSession(t, app, "Story Editor")
	if err := app.store.SetCredentials(context.Background(), tokenHash(token), "admin@example.com", "stored-password-hash"); err != nil {
		t.Fatal(err)
	}
	return app, token
}

func servedLineIDs(t *testing.T, app *App, token, graphID string) map[string]bool {
	t.Helper()
	res := request(app, "GET", "/api/content/graphs/"+graphID, token, nil)
	if res.Code != 200 {
		t.Fatalf("graph: %d %s", res.Code, res.Body.String())
	}
	var record struct {
		Body struct {
			Nodes  []struct{ Lines []struct{ ID string } } `json:"nodes"`
			Topics []struct{ Lines []struct{ ID string } } `json:"topics"`
		} `json:"body"`
	}
	if err := json.Unmarshal(res.Body.Bytes(), &record); err != nil {
		t.Fatal(err)
	}
	ids := map[string]bool{}
	for _, node := range append(record.Body.Nodes, record.Body.Topics...) {
		for _, line := range node.Lines {
			ids[line.ID] = true
		}
	}
	return ids
}

func TestAdminsHideAndRestoreMonologueLinesOnly(t *testing.T) {
	app, token := storyAdminApp(t)
	graphID := app.content.IDs["graph:a1-arrival"]
	if graphID == "" {
		t.Fatal("missing a1-arrival graph")
	}
	player, _ := createSession(t, app, "Player")
	if res := request(app, "GET", "/api/admin/story/lines", player, nil); res.Code != 403 {
		t.Fatalf("players must not read admin story lines: %d", res.Code)
	}
	res := request(app, "GET", "/api/admin/story/lines", token, nil)
	var listing struct{ Graphs []storyGraph }
	if res.Code != 200 || json.Unmarshal(res.Body.Bytes(), &listing) != nil {
		t.Fatalf("listing: %d %s", res.Code, res.Body.String())
	}
	var hideable, reply, decision string
	for _, graph := range listing.Graphs {
		if graph.ID != graphID {
			continue
		}
		for _, block := range graph.Blocks {
			for _, line := range block.Lines {
				switch {
				case block.Kind == "intro" && line.Locked == "" && hideable == "" && line.German != "":
					hideable = line.ID
				case strings.Contains(line.Locked, "answers"):
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
	if !servedLineIDs(t, app, token, graphID)[hideable] {
		t.Fatal("line should be served before hiding")
	}
	if res := request(app, "POST", "/api/admin/story/lines", token, map[string]any{"lineId": hideable, "hidden": true}); res.Code != 200 {
		t.Fatalf("hide: %d %s", res.Code, res.Body.String())
	}
	if servedLineIDs(t, app, token, graphID)[hideable] {
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
	if !servedLineIDs(t, app, token, graphID)[hideable] {
		t.Fatal("restored line should be served again")
	}
	if len(app.editing.current.Story.HiddenLines) != 0 {
		t.Fatal("restore should clear the override")
	}
}
