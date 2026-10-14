package main

import (
	"context"
	"encoding/json"
	"lernen01/server/internal/contentstore"
	"os"
	"reflect"
	"testing"
	"time"
)

func TestPostgresContentImportBootMigrationAndCourseRestart(t *testing.T) {
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("set TEST_DATABASE_URL to a disposable PostgreSQL database")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	store, err := NewPGStore(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	app := NewApp(store, Curriculum{}, nil, 128)
	t.Cleanup(func() { app.Close() })
	bundle, err := contentstore.LoadJSON("content.json")
	if err != nil {
		t.Fatal(err)
	}
	if err = contentstore.Import(ctx, store.pool, bundle); err != nil {
		t.Fatal(err)
	}
	loaded, err := contentstore.LoadPostgres(ctx, store.pool)
	if err != nil {
		t.Fatal(err)
	}
	if len(loaded.Records) != len(bundle.Records) || !reflect.DeepEqual(loaded.IDs, bundle.IDs) || len(loaded.Courses) != len(bundle.Courses) {
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
	if err = contentstore.Import(ctx, store.pool, &broken); err == nil {
		t.Fatal("duplicate authored slug did not reject the import")
	}
	afterFailure, err := contentstore.LoadPostgres(ctx, store.pool)
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
		_, _ = store.pool.Exec(cleanup, "DELETE FROM learning_events WHERE account_id=$1", player.ID)
		_, _ = store.pool.Exec(cleanup, "DELETE FROM sessions WHERE account_id=$1", player.ID)
		_, _ = store.pool.Exec(cleanup, "DELETE FROM accounts WHERE id=$1", player.ID)
	})
	hash := tokenHash(token)
	// Seed the pre-UUID representation, including an immutable graded receipt.
	exercise := app.curriculum.Exercises["a1-arrival-exercise-1"]
	input := AttemptInput{ID: "postgres-legacy-content-proof", ExerciseID: exercise.ID, ItemID: exercise.ItemID, Mode: exercise.Mode, Answer: exercise.Answer}
	requestBody, _ := json.Marshal(input)
	_, err = store.UpdateAccount(ctx, hash, func(account *Account) error {
		account.ActiveCourseID = ""
		account.CourseStates = nil
		account.Progress.CompletedQuestIDs = []string{"a1-arrival"}
		account.Progress.Words["ich-pron"] = WordMemory{WordID: "ich-pron", Exposures: 7}
		account.Progress.Story.Nodes["a1-arrival"] = "complete"
		account.StorySaves = map[string]StorySave{"one": {Slot: "one", Story: account.Progress.Story, CompletedQuestIDs: []string{"a1-arrival"}}}
		account.RewardedQuestIDs = []string{"a1-arrival"}
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
	loaded, err = contentstore.LoadPostgres(ctx, store.pool)
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
