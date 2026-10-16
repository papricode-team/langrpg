package main

import (
	"context"
	"encoding/json"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"glotworld/server/internal/migrate"
	"glotworld/server/internal/pgtest"
	"glotworld/server/migrations"
)

// A deployment upgrades with its world in world_content. Migration 0007 moves
// it into the world tables, and the server boots the same world and story line
// changes from them. WORLD_MIGRATION_DOCUMENT names another scene document to
// rehearse with, such as a copy of production's.
func TestPostgresWorldContentMovesIntoWorldTables(t *testing.T) {
	if testing.Short() {
		t.Skip("starts the Node edit worker")
	}
	ctx := context.Background()
	url := pgtest.SchemaURL(t, pgtest.URL(t), "world_tables")
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	list, err := migrations.All()
	if err != nil {
		t.Fatal(err)
	}
	before := 0
	for before < len(list) && list[before].Version < 7 {
		before++
	}
	if _, err := migrate.Apply(ctx, pool, list[:before]); err != nil {
		t.Fatal(err)
	}
	path := worldSeedPath
	if override := os.Getenv("WORLD_MIGRATION_DOCUMENT"); override != "" {
		path = override
	}
	document, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	worker := newWorldWorker("../scripts/admin-world-worker.mjs", "..")
	t.Cleanup(worker.stop)
	published, err := worker.reconcile(ctx, document, nil)
	if err != nil {
		t.Fatal(err)
	}
	at := time.Date(2026, 10, 15, 12, 0, 0, 0, time.UTC)
	hidden, edited := "0193a1b2-0000-7000-8000-000000000001", "0193a1b2-0000-7000-8000-000000000002"
	story := StoryOverrides{
		HiddenLines: map[string]HiddenLine{hidden: {GraphID: "graph-a", By: "Ada", At: at}},
		EditedLines: map[string]EditedLine{hidden: {GraphID: "graph-a", Text: "Hallo.", By: "Ada", At: at}, edited: {GraphID: "graph-b", Text: "Guten Tag.", Translations: map[string]string{"en": "Good day."}, By: "Ben", At: at}},
	}
	// The row exactly as the previous release stored it.
	row, _ := json.Marshal(map[string]any{"document": published.Document, "revision": "previous-hash", "contentVersion": published.ContentVersion,
		"worldMaps": published.WorldMaps, "investigations": published.Investigations, "diagnostics": []string{}, "story": story})
	if _, err := pool.Exec(ctx, "INSERT INTO world_content(id,data) VALUES('main',$1)", row); err != nil {
		t.Fatal(err)
	}
	pool.Close()

	app, store, _ := postgresWorldApp(t, url, "admin@example.com")
	current := app.editing.current
	if current.Revision != "1" || storedWorldRevision(t, store) != "1" {
		t.Fatalf("the upgrade republished the world: revision %s", current.Revision)
	}
	if !sameJSON(current.Document, published.Document) || current.ContentVersion != published.ContentVersion {
		t.Fatal("the world changed while moving into the tables")
	}
	gotStory, _ := json.Marshal(current.Story)
	wantStory, _ := json.Marshal(story)
	if !sameJSON(gotStory, wantStory) {
		t.Fatalf("story line changes were lost: %s", gotStory)
	}
	var towns, edits int
	if err := store.Pool().QueryRow(ctx, "SELECT (SELECT count(*) FROM world_maps), (SELECT count(*) FROM world_edits WHERE source='migration')").Scan(&towns, &edits); err != nil || towns != 3 || edits != 1 {
		t.Fatalf("expected 3 towns and one migration entry, got %d and %d: %v", towns, edits, err)
	}
}
