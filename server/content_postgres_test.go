package main

import (
	"context"
	"encoding/json"
	"glotworld/server/internal/contentstore"
	"glotworld/server/internal/pgtest"
	"os"
	"reflect"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// contentTestSchemaURL isolates a test in its own schema of the test database.
func contentTestSchemaURL(t *testing.T, databaseURL string) string {
	t.Helper()
	return pgtest.SchemaURL(t, databaseURL, "content_upgrade")
}

func TestPostgresContentImportBootMigrationAndCourseRestart(t *testing.T) {
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("set TEST_DATABASE_URL to a disposable PostgreSQL database")
	}
	url = contentTestSchemaURL(t, url)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()
	bundle, err := contentstore.LoadJSON("content.json")
	if err != nil {
		t.Fatal(err)
	}
	// Exercise the exact legacy table shape published before multi-course IDs.
	// Those tables predate the server's schema, so create them first; the
	// versioned migrations then adopt and convert them at boot.
	legacy, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	for kind, table := range contentstore.Tables {
		if kind == "sentence" {
			continue
		}
		if _, err = legacy.Exec(ctx, "CREATE TABLE "+table+"(id UUID PRIMARY KEY,slug TEXT NOT NULL UNIQUE,version INT NOT NULL,body JSONB NOT NULL)"); err != nil {
			t.Fatal(err)
		}
	}
	if _, err = legacy.Exec(ctx, `INSERT INTO content_exercises(id,slug,version,body) VALUES($1,'a1-arrival-exercise-1',1,'{"answer":"published legacy row"}')`, bundle.PublishedIDs["exercises:a1-arrival-exercise-1"]); err != nil {
		t.Fatal(err)
	}
	legacy.Close()
	store, err := NewPGStore(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	app := NewApp(store, Curriculum{}, nil, 128)
	t.Cleanup(func() { app.Close() })
	var legacyRows int
	if err = store.Pool().QueryRow(ctx, `SELECT count(*) FROM content_exercises WHERE course_id IS NULL`).Scan(&legacyRows); err != nil || legacyRows != 0 {
		t.Fatalf("migration left %d course-less legacy rows: %v", legacyRows, err)
	}
	if err = contentstore.Import(ctx, store.Pool(), bundle); err != nil {
		t.Fatal(err)
	}
	loaded, err := contentstore.LoadPostgres(ctx, store.Pool())
	if err != nil {
		t.Fatal(err)
	}
	if len(loaded.Records) != len(bundle.Records) || !reflect.DeepEqual(loaded.IDs, bundle.IDs) || !reflect.DeepEqual(loaded.PublishedIDs, bundle.PublishedIDs) || len(loaded.Courses) != len(bundle.Courses) {
		t.Fatal("PostgreSQL catalog differs from the imported bundle")
	}
	for _, source := range bundle.Records {
		var expected, actual any
		if json.Unmarshal(source.Body, &expected) != nil || json.Unmarshal(loaded.ByID[source.ID].Body, &actual) != nil || !reflect.DeepEqual(actual, expected) {
			t.Fatalf("PostgreSQL changed authored content %s", source.ID)
		}
	}
	// A database constraint failure after upserts must not publish a partial catalog.
	broken := *bundle
	broken.Records = append([]contentstore.Record{}, bundle.Records...)
	duplicate := broken.Records[0]
	duplicate.ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"
	broken.Records = append(broken.Records, duplicate)
	broken.Records[0].Body = json.RawMessage(`{"rollbackProbe":true}`)
	if err = contentstore.Import(ctx, store.Pool(), &broken); err == nil {
		t.Fatal("duplicate authored slug did not reject the import")
	}
	afterFailure, err := contentstore.LoadPostgres(ctx, store.Pool())
	if err != nil || len(afterFailure.Records) != len(loaded.Records) || !reflect.DeepEqual(afterFailure.ByID[bundle.Records[0].ID], loaded.ByID[bundle.Records[0].ID]) {
		t.Fatalf("failed import changed the published catalog: %v", err)
	}
	if err = app.InstallContent(loaded); err != nil {
		t.Fatal(err)
	}
	token, player := createSession(t, app, "Postgres course Ada")
	t.Cleanup(func() {
		if store == nil {
			return
		}
		cleanup, done := context.WithTimeout(context.Background(), 5*time.Second)
		defer done()
		_, _ = store.Pool().Exec(cleanup, "DELETE FROM learning_events WHERE account_id=$1", player.ID)
		_, _ = store.Pool().Exec(cleanup, "DELETE FROM sessions WHERE account_id=$1", player.ID)
		_, _ = store.Pool().Exec(cleanup, "DELETE FROM accounts WHERE id=$1", player.ID)
	})
	hash := tokenHash(token)
	// Seed the pre-UUID representation, including an immutable graded receipt.
	exercise := app.curriculum.Exercises["a1-arrival-exercise-1"]
	input := AttemptInput{ID: "postgres-legacy-content-proof", ExerciseID: bundle.PublishedIDs["exercises:"+exercise.ID], ItemID: bundle.PublishedIDs["items:"+exercise.ItemID], Mode: exercise.Mode, Answer: exercise.Answer}
	requestBody, _ := json.Marshal(input)
	_, err = store.UpdateAccount(ctx, hash, func(account *Account) error {
		account.ActiveCourseID = ""
		account.CourseStates = nil
		oldQuest, oldWord := bundle.PublishedIDs["quests:a1-arrival"], bundle.PublishedIDs["lexemes:ich-pron"]
		account.Progress.CompletedQuestIDs = []string{oldQuest}
		account.Progress.Words[oldWord] = WordMemory{WordID: oldWord, Exposures: 7}
		account.Progress.Story.Nodes[oldQuest] = bundle.PublishedIDs["nodes:a1-arrival:complete"]
		account.StorySaves = map[string]StorySave{"one": {Slot: "one", Story: account.Progress.Story, CompletedQuestIDs: []string{oldQuest}}}
		account.RewardedQuestIDs = []string{oldQuest}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	_, _, _, err = store.Mutate(ctx, hash, "attempt:"+input.ID, requestBody, func(account *Account) (Receipt, error) {
		account.Progress.XP = 7
		correct := true
		return Receipt{Correct: &correct, XPAdded: 7}, nil
	})
	if err != nil {
		t.Fatal(err)
	}
	legacyAccount, err := app.store.Get(ctx, hash)
	if err != nil {
		t.Fatal(err)
	}
	if eligible, err := app.hasRecordedExercise(ctx, hash, legacyAccount, exercise.ID); err != nil || !eligible {
		t.Fatalf("published PG receipt lost recovery eligibility before migration: %v", err)
	}
	for range 2 {
		if err = app.canonical.Migrate(ctx); err != nil {
			t.Fatal(err)
		}
	}
	raw, err := store.Get(ctx, hash)
	if err != nil {
		t.Fatal(err)
	}
	quest := testContentID(t, app, "quest", "a1-arrival")
	word := testContentID(t, app, "lexeme", "ich-pron")
	if raw.Progress.Words[word].Exposures != 7 || raw.RewardedQuestIDs[0] != quest || raw.StorySaves["one"].CompletedQuestIDs[0] != quest {
		t.Fatal("PostgreSQL UUID migration lost evidence, reward ledger or save slot")
	}
	_, receipt, duplicateReceipt, err := app.store.Mutate(ctx, hash, "attempt:"+input.ID, requestBody, func(*Account) (Receipt, error) {
		t.Fatal("migrated PostgreSQL receipt ran its mutation again")
		return Receipt{}, nil
	})
	if err != nil || !duplicateReceipt || receipt.XPAdded != 7 {
		t.Fatalf("migrated PostgreSQL receipt retry: %v %v %+v", err, duplicateReceipt, receipt)
	}
	english := testContentID(t, app, "course", "english")
	if res := request(app, "POST", "/api/course/activate", token, map[string]any{"courseId": english, "supportLanguage": "de"}); res.Code != 200 {
		t.Fatal(res.Body.String())
	}
	proof := AttemptInput{ID: "postgres-english-proof", ExerciseID: testContentID(t, app, "exercise", "en-first-request"), ItemID: testContentID(t, app, "item", "en-first-request-item"), QuestID: testContentID(t, app, "quest", "en-first-conversation"), Mode: "production", Answer: "Please say it again."}
	first := decodeAttempt(t, request(app, "POST", "/api/attempt", token, proof))
	if !first.Correct {
		t.Fatal("PostgreSQL English proof did not grade")
	}
	app.Close()
	store, err = NewPGStore(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	app = NewApp(store, Curriculum{}, nil, 128)
	loaded, err = contentstore.LoadPostgres(ctx, store.Pool())
	if err != nil {
		t.Fatal(err)
	}
	if err = app.InstallContent(loaded); err != nil {
		t.Fatal(err)
	}
	retry := decodeAttempt(t, request(app, "POST", "/api/attempt", token, proof))
	if !retry.Duplicate || retry.XPAdded != 0 || retry.Progress.XP != first.Progress.XP {
		t.Fatal("PostgreSQL restart lost English receipt or separate progress")
	}
	if res := request(app, "POST", "/api/attempt", token, map[string]any{"recover": true, "exerciseId": proof.ExerciseID}); res.Code != 200 {
		t.Fatalf("PostgreSQL restart lost answer-recovery eligibility: %s", res.Body.String())
	}
	if res := request(app, "POST", "/api/course/activate", token, map[string]any{"courseId": testContentID(t, app, "course", "german"), "supportLanguage": "en"}); res.Code != 200 {
		t.Fatal(res.Body.String())
	}
	account, err := app.store.GetAccountByID(ctx, player.ID)
	if err != nil || account.Progress.XP != 7 || account.Progress.Words["ich-pron"].Exposures != 7 || account.StorySaves["one"].Slot != "one" {
		t.Fatalf("PostgreSQL course restart did not restore German evidence: %v %+v", err, account.Progress)
	}
}
