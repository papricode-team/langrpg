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
	if err := app.initWorldEditing(context.Background(), worldSeedPath, "../scripts/admin-world-compiler.mjs"); err != nil {
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
	var revision int64
	if err := store.Pool().QueryRow(context.Background(), "SELECT revision FROM world_publication WHERE id='main'").Scan(&revision); err != nil {
		t.Fatal(err)
	}
	return revisionText(revision)
}

// editStoredScene changes one town's row and counts a new publication, as
// another process would.
func editStoredScene(t *testing.T, store *PGStore, mapID string, edit func(map[string]any)) {
	t.Helper()
	ctx := context.Background()
	var data []byte
	if err := store.Pool().QueryRow(ctx, "SELECT scene FROM world_maps WHERE id=$1", mapID).Scan(&data); err != nil {
		t.Fatal(err)
	}
	var scene map[string]any
	if err := json.Unmarshal(data, &scene); err != nil {
		t.Fatal(err)
	}
	edit(scene)
	data, _ = json.Marshal(scene)
	if _, err := store.Pool().Exec(ctx, "UPDATE world_maps SET scene=$2 WHERE id=$1", mapID, data); err != nil {
		t.Fatal(err)
	}
	if _, err := store.Pool().Exec(ctx, "UPDATE world_publication SET revision=revision+1"); err != nil {
		t.Fatal(err)
	}
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
	var edits int
	if err := store.Pool().QueryRow(context.Background(), "SELECT count(*) FROM world_edits WHERE source='editor' AND maps=ARRAY['waldruh']").Scan(&edits); err != nil || edits != 1 {
		t.Fatalf("the edit log missed the edit: %d %v", edits, err)
	}

	// The stored world predates a story character the current release needs.
	var missing string
	editStoredScene(t, store, "lindenhafen", func(scene map[string]any) {
		npcs := scene["npcs"].([]any)
		missing = npcs[len(npcs)-1].(map[string]any)["id"].(string)
		scene["npcs"] = npcs[:len(npcs)-1]
	})
	app.Close()

	restarted, restartedStore, token := postgresWorldApp(t, url, "second@example.com")
	if stored := storedWorldRevision(t, restartedStore); stored != restarted.editing.current.Revision {
		t.Fatalf("reconciled world was not stored: memory %s, storage %s", restarted.editing.current.Revision, stored)
	}
	var restored bool
	if err := restartedStore.Pool().QueryRow(context.Background(), "SELECT scene::jsonb->'npcs' @> jsonb_build_array(jsonb_build_object('id',$1::text)) FROM world_maps WHERE id='lindenhafen'", missing).Scan(&restored); err != nil || !restored {
		t.Fatalf("the missing story character %s was not stored: %v", missing, err)
	}
	if code, body := postOps(restarted, token, []map[string]any{{"kind": "move", "map": "waldruh", "id": lamp.ID, "x": lamp.X + 8, "y": lamp.Y}}); code != 200 {
		t.Fatalf("edit after restart: %d %v", code, body)
	}

	// Another process publishes behind this one's back: the edit still lands.
	editStoredScene(t, restartedStore, "nebelstadt", func(scene map[string]any) {
		spawn := scene["spawn"].(map[string]any)
		spawn["x"] = spawn["x"].(float64) + 2
	})
	if code, body := postOps(restarted, token, []map[string]any{{"kind": "move", "map": "waldruh", "id": lamp.ID, "x": lamp.X + 12, "y": lamp.Y}}); code != 200 {
		t.Fatalf("edit after an outside publication: %d %v", code, body)
	}
	if stored := storedWorldRevision(t, restartedStore); stored != restarted.editing.current.Revision {
		t.Fatalf("memory %s and storage %s disagree after the retry", restarted.editing.current.Revision, stored)
	}
}
