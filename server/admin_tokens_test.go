package main

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
)

func TestAdminTokensActForTheirAdminUntilRevoked(t *testing.T) {
	app, session := adminWorldTestApp(t, "")
	created := request(app, "POST", "/api/admin/tokens", session, map[string]any{"name": "World MCP"})
	var body struct {
		Token  string `json:"token"`
		Record struct {
			ID string `json:"id"`
		} `json:"record"`
	}
	if created.Code != 201 || json.Unmarshal(created.Body.Bytes(), &body) != nil || !strings.HasPrefix(body.Token, adminTokenPrefix) {
		t.Fatalf("create token: %d %s", created.Code, created.Body.String())
	}
	if listed := request(app, "GET", "/api/admin/tokens", session, nil); listed.Code != 200 || strings.Contains(listed.Body.String(), tokenHash(body.Token)) || !strings.Contains(listed.Body.String(), "World MCP") {
		t.Fatalf("listing must name tokens without their hashes: %s", listed.Body.String())
	}
	if w := request(app, "GET", "/api/admin/world/export", body.Token, nil); w.Code != 200 || !strings.Contains(w.Body.String(), worldExportFormat) {
		t.Fatalf("token export: %d %s", w.Code, adminWorldResponseBody(w))
	}
	if w := request(app, "POST", "/api/admin/tokens", body.Token, map[string]any{"name": "copy"}); w.Code != 403 {
		t.Fatalf("a token minted another token: %d", w.Code)
	}
	// A token stops acting when its account leaves ADMIN_EMAILS.
	app.adminEmails = map[string]bool{}
	if w := request(app, "GET", "/api/admin/world/export", body.Token, nil); w.Code != 403 {
		t.Fatalf("token outlived admin access: %d", w.Code)
	}
	app.adminEmails = map[string]bool{"admin@example.com": true}
	if w := request(app, "POST", "/api/admin/tokens/"+body.Record.ID+"/revoke", session, map[string]any{}); w.Code != 200 {
		t.Fatalf("revoke: %d %s", w.Code, w.Body.String())
	}
	if w := request(app, "GET", "/api/admin/world/export", body.Token, nil); w.Code != 401 {
		t.Fatalf("revoked token still works: %d", w.Code)
	}
}

func TestWorldExportImportRoundTripsTownsAndStoryLines(t *testing.T) {
	app, token := adminWorldTestApp(t, "")
	exported := request(app, "GET", "/api/admin/world/export", token, nil)
	var bundle map[string]json.RawMessage
	if exported.Code != 200 || json.Unmarshal(exported.Body.Bytes(), &bundle) != nil {
		t.Fatalf("export: %d", exported.Code)
	}
	var revision string
	_ = json.Unmarshal(bundle["revision"], &revision)
	draft := adminWorldDraft(t, bundle["document"], func(maps map[string]any) {
		spawn := maps[DefaultMapID].(map[string]any)["spawn"].(map[string]any)
		spawn["x"] = spawn["x"].(float64) + 5
	})
	bundle["document"] = draft
	bundle["story"] = json.RawMessage(`{"hiddenLines":{"0193a1b2-0000-7000-8000-000000000001":{"graphId":"g","by":"Ada","at":"2026-10-16T08:00:00Z"}}}`)
	data, _ := json.Marshal(bundle)
	if w := adminWorldRequest(app, "PUT", "/api/admin/world/import", token, "stale", "application/json", data); w.Code != 409 {
		t.Fatalf("import over a newer world: %d", w.Code)
	}
	if w := adminWorldRequest(app, "PUT", "/api/admin/world/import", token, revision, "application/json", data); w.Code != 200 {
		t.Fatalf("import: %d %s", w.Code, adminWorldResponseBody(w))
	}
	stored, err := app.editing.load(context.Background())
	if err != nil || !sameJSON(stored.Document, draft) || len(stored.Story.HiddenLines) != 1 {
		t.Fatalf("import did not store the towns and story lines: %v", err)
	}
	edits := request(app, "GET", "/api/admin/world/edits?limit=1", token, nil)
	if edits.Code != 200 || !strings.Contains(edits.Body.String(), `"source":"editor"`) || !strings.Contains(edits.Body.String(), `"`+DefaultMapID+`"`) {
		t.Fatalf("edit log: %s", edits.Body.String())
	}
}
