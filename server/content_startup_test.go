package main

import (
	"context"
	"glotworld/server/internal/contentstore"
	"path/filepath"
	"testing"
)

func TestContentStartupWithoutLegacyManifests(t *testing.T) {
	bundle, err := contentstore.LoadJSON("content.json")
	if err != nil {
		t.Fatal(err)
	}
	source, err := filepath.Abs(worldSeedPath)
	if err != nil {
		t.Fatal(err)
	}
	compiler, err := filepath.Abs("../scripts/admin-world-compiler.mjs")
	if err != nil {
		t.Fatal(err)
	}

	// Production starts with only the content catalog, not the legacy fixtures
	// that happen to be available when tests run from the server source tree.
	t.Chdir(t.TempDir())
	previous := curriculumFiles
	curriculumFiles = manifestFiles{}
	t.Cleanup(func() { curriculumFiles = previous })
	store, err := NewJSONStore("")
	if err != nil {
		t.Fatal(err)
	}
	app := NewApp(store, Curriculum{}, nil, 128)
	t.Cleanup(app.Close)
	if err := app.InstallContent(bundle); err != nil {
		t.Fatalf("install catalog without legacy files: %v", err)
	}
	if len(app.courseCurricula) != len(bundle.Courses) {
		t.Fatal("not all courses were installed")
	}
	if len(app.curriculum.MiniGameContent) == 0 {
		t.Fatal("expedition and story exercises were not installed")
	}
	app.installProductionManifests()
	if err := app.initWorldEditing(context.Background(), source, compiler); err != nil {
		t.Fatalf("initialize production world: %v", err)
	}
	if res := request(app, "GET", "/api/health", "", nil); res.Code != 200 {
		t.Fatalf("health: %d %s", res.Code, res.Body.String())
	}
}
