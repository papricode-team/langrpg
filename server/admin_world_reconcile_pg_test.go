package main

import (
	"context"
	"encoding/json"
	"testing"

	"glotworld/server/internal/pgtest"
)

// postgresWorldApp boots world editing on a PostgreSQL schema, as a deployment does.
func postgresWorldApp(t *testing.T, url, email string) (*App, *PGStore, string) {
	t.Helper()
	store, err := NewPGStore(context.Background(), url)
	if err != nil {
		t.Fatal(err)
	}
	app := NewApp(store, testCurriculum(), nil, 10)
	t.Cleanup(app.Close)
	if err := app.initWorldEditing(context.Background(), "../web/src/data/world-scenes.json", "../scripts/admin-world-compiler.mjs"); err != nil {
		t.Fatal(err)
	}
	app.adminEmails = map[string]bool{email: true}
	token, _ := createSession(t, app, "World Editor")
	if err := app.store.SetCredentials(context.Background(), tokenHash(token), email, "stored-password-hash"); err != nil {
		t.Fatal(err)
	}
	return app, store, token
}

func storedWorldRevision(t *testing.T, store *PGStore) string {
	t.Helper()
	var revision string
	if err := store.Pool().QueryRow(context.Background(), "SELECT data->>'revision' FROM world_content WHERE id='main'").Scan(&revision); err != nil {
		t.Fatal(err)
	}
	return revision
}

// A release that adds story anchors reconciles the saved world at startup. The
// reconciled world must be stored, or every later edit is refused as a conflict.
func TestPostgresWorldEditsPublishAfterStartupReconciliation(t *testing.T) {
	if testing.Short() {
		t.Skip("starts the Node edit worker")
	}
	url := pgtest.SchemaURL(t, pgtest.URL(t), "world_reconcile")
	app, store, token := postgresWorldApp(t, url, "first@example.com")
	lamp := editSceneScenery(t, app, "waldruh")[0]
	if code, body := postOps(app, token, []map[string]any{{"kind": "move", "map": "waldruh", "id": lamp.ID, "x": lamp.X + 4, "y": lamp.Y}}); code != 200 {
		t.Fatalf("first edit: %d %v", code, body)
	}

	// The stored world predates a story character the current release needs.
	ctx := context.Background()
	var data []byte
	if err := store.Pool().QueryRow(ctx, "SELECT data FROM world_content WHERE id='main'").Scan(&data); err != nil {
		t.Fatal(err)
	}
	var row map[string]any
	if err := json.Unmarshal(data, &row); err != nil {
		t.Fatal(err)
	}
	scene := row["document"].(map[string]any)["maps"].(map[string]any)["lindenhafen"].(map[string]any)
	npcs := scene["npcs"].([]any)
	scene["npcs"] = npcs[:len(npcs)-1]
	document, _ := json.Marshal(row["document"])
	row["revision"] = worldRevision(document)
	data, _ = json.Marshal(row)
	if _, err := store.Pool().Exec(ctx, "UPDATE world_content SET data=$1 WHERE id='main'", data); err != nil {
		t.Fatal(err)
	}
	app.Close()

	restarted, restartedStore, token := postgresWorldApp(t, url, "second@example.com")
	if stored := storedWorldRevision(t, restartedStore); stored != restarted.editing.current.Revision {
		t.Fatalf("reconciled world was not stored: memory %s, storage %s", restarted.editing.current.Revision, stored)
	}
	if code, body := postOps(restarted, token, []map[string]any{{"kind": "move", "map": "waldruh", "id": lamp.ID, "x": lamp.X + 8, "y": lamp.Y}}); code != 200 {
		t.Fatalf("edit after restart: %d %v", code, body)
	}

	// Another process publishes behind this one's back: the edit still lands.
	behind := restarted.editing.current
	data, _ = json.Marshal(behind)
	if err := json.Unmarshal(data, &row); err != nil {
		t.Fatal(err)
	}
	// It moved the spawn point, a real edit with its own revision.
	world := row["document"].(map[string]any)
	spawn := world["maps"].(map[string]any)["nebelstadt"].(map[string]any)["spawn"].(map[string]any)
	spawn["x"] = spawn["x"].(float64) + 2
	document, _ = json.Marshal(world)
	row["revision"] = worldRevision(document)
	data, _ = json.Marshal(row)
	if _, err := restartedStore.Pool().Exec(ctx, "UPDATE world_content SET data=$1 WHERE id='main'", data); err != nil {
		t.Fatal(err)
	}
	if code, body := postOps(restarted, token, []map[string]any{{"kind": "move", "map": "waldruh", "id": lamp.ID, "x": lamp.X + 12, "y": lamp.Y}}); code != 200 {
		t.Fatalf("edit after an outside publication: %d %v", code, body)
	}
	if stored := storedWorldRevision(t, restartedStore); stored != restarted.editing.current.Revision {
		t.Fatalf("memory %s and storage %s disagree after the retry", restarted.editing.current.Revision, stored)
	}
}
