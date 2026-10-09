package main

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"reflect"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestPostgresRestartRestoresProfileProgressAndReceipts(t *testing.T) {
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("set TEST_DATABASE_URL to a disposable PostgreSQL database for integration checks")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	store, err := NewPGStore(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	app := NewApp(store, testCurriculum(), nil, 10)
	token, player := createSession(t, app, "Restart Ada")
	t.Cleanup(func() {
		cleanup, done := context.WithTimeout(context.Background(), 5*time.Second)
		defer done()
		_, _ = store.pool.Exec(cleanup, "DELETE FROM learning_events WHERE account_id=$1", player.ID)
		_, _ = store.pool.Exec(cleanup, "DELETE FROM sessions WHERE account_id=$1", player.ID)
		_, _ = store.pool.Exec(cleanup, "DELETE FROM accounts WHERE id=$1", player.ID)
		app.Close()
	})
	decodeAttempt(t, request(app, "POST", "/api/attempt", token, attemptFor("restart-one")))
	decodeAttempt(t, request(app, "POST", "/api/attempt", token, AttemptInput{ID: "restart-two", ItemID: "item-two", ExerciseID: "exercise-two", Answer: "Ich bin hier", Mode: "production", QuestID: "quest"}))
	if result := request(app, "POST", "/api/quest/complete", token, map[string]string{"questId": "quest"}); result.Code != 200 {
		t.Fatalf("complete quest: %d %s", result.Code, result.Body.String())
	}
	avatar := Avatar{Hair: "#001122", Skin: "#ccbbaa", Outfit: "#456789"}
	before, err := store.UpdateProfile(ctx, tokenHash(token), "Restart Mira", avatar)
	if err != nil {
		t.Fatal(err)
	}
	// Recreate both storage and application, including startup schema initialization.
	app.Close()
	reopened, err := NewPGStore(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	store = reopened
	app = NewApp(store, testCurriculum(), nil, 10)
	after, err := store.Get(ctx, tokenHash(token))
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(before, after) {
		t.Fatal("restart changed profile, progress or review schedules")
	}
	if result := request(app, "POST", "/api/session", token, map[string]any{}); result.Code != 200 {
		t.Fatalf("resume session after restart: %d %s", result.Code, result.Body.String())
	}
	retry := decodeAttempt(t, request(app, "POST", "/api/attempt", token, attemptFor("restart-one")))
	if !retry.Duplicate || retry.XPAdded != 0 || retry.Progress.XP != before.Progress.XP {
		t.Fatal("restart lost the saved attempt receipt or awarded duplicate XP")
	}
	result := request(app, "POST", "/api/quest/complete", token, map[string]string{"questId": "quest"})
	var quest struct {
		Duplicate bool `json:"duplicate"`
		XPAdded   int  `json:"xpAdded"`
	}
	if result.Code != 200 || json.Unmarshal(result.Body.Bytes(), &quest) != nil || !quest.Duplicate || quest.XPAdded != 0 {
		t.Fatalf("restart lost quest reward receipt: %d %s", result.Code, result.Body.String())
	}
}

func TestPostgresTransactionsAndIdempotency(t *testing.T) {
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("set TEST_DATABASE_URL to a disposable PostgreSQL database for integration checks")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	store, err := NewPGStore(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	app := NewApp(store, testCurriculum(), nil, 10)
	t.Cleanup(app.Close)
	token, player := createSession(t, app, "Postgres Ada")
	t.Cleanup(func() {
		cleanup, done := context.WithTimeout(context.Background(), 5*time.Second)
		defer done()
		_, _ = store.pool.Exec(cleanup, "DELETE FROM learning_events WHERE account_id=$1", player.ID)
		_, _ = store.pool.Exec(cleanup, "DELETE FROM sessions WHERE account_id=$1", player.ID)
		_, _ = store.pool.Exec(cleanup, "DELETE FROM accounts WHERE id=$1", player.ID)
	})
	var workers sync.WaitGroup
	for range 12 {
		workers.Add(1)
		go func() {
			defer workers.Done()
			response := request(app, "POST", "/api/attempt", token, attemptFor("pg-once"))
			if response.Code != 200 {
				t.Errorf("PostgreSQL attempt: %d %s", response.Code, response.Body.String())
			}
		}()
	}
	workers.Wait()
	account, err := store.Get(ctx, tokenHash(token))
	if err != nil {
		t.Fatal(err)
	}
	if account.Progress.XP != 6 || account.Progress.Attempts != 1 {
		t.Fatalf("transactional duplicate awarded %+v", account.Progress)
	}
	var count int
	if err = store.pool.QueryRow(ctx, "SELECT COUNT(*) FROM learning_events WHERE account_id=$1", player.ID).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 1 {
		t.Fatalf("duplicate created %d receipts", count)
	}
	var receiptJSON []byte
	if err = store.pool.QueryRow(ctx, "SELECT receipt FROM learning_events WHERE account_id=$1", player.ID).Scan(&receiptJSON); err != nil {
		t.Fatal(err)
	}
	var receipt Receipt
	if err = json.Unmarshal(receiptJSON, &receipt); err != nil {
		t.Fatal(err)
	}
	if receipt.FSRSReview == nil || receipt.ScheduledMode != "recognition" {
		t.Fatal("FSRS review log was not persisted")
	}
	avatar := Avatar{Hair: "#001122", Skin: "#ccbbaa", Outfit: "#456789"}
	updated, err := store.UpdateProfile(ctx, tokenHash(token), "Postgres Mira", avatar)
	if err != nil {
		t.Fatal(err)
	}
	if updated.Progress.XP != 6 || updated.Player.Avatar != avatar {
		t.Fatal("profile edit lost PostgreSQL progress")
	}
	if _, err = store.Get(ctx, "invalid"); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("unknown PostgreSQL credential: %v", err)
	}
}

func TestPostgresPausedActivityUsesImmutableReceipts(t *testing.T) {
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("set TEST_DATABASE_URL to a disposable PostgreSQL database for integration checks")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	store, err := NewPGStore(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	b, err := curriculumFiles.ReadFile("curriculum.json")
	if err != nil {
		t.Fatal(err)
	}
	curriculum, err := parseCurriculum(b)
	if err != nil {
		t.Fatal(err)
	}
	app := NewApp(store, curriculum, nil, 10)
	t.Cleanup(app.Close)
	token, player := createSession(t, app, "Paused Postgres Ada")
	t.Cleanup(func() {
		cleanup, done := context.WithTimeout(context.Background(), 5*time.Second)
		defer done()
		_, _ = store.pool.Exec(cleanup, "DELETE FROM learning_events WHERE account_id=$1", player.ID)
		_, _ = store.pool.Exec(cleanup, "DELETE FROM sessions WHERE account_id=$1", player.ID)
		_, _ = store.pool.Exec(cleanup, "DELETE FROM accounts WHERE id=$1", player.ID)
	})
	proof := missionSuccesses(t, app, token, "pg-paused-"+player.ID)
	ex := curriculum.Exercises[proof.ExerciseIDs[0]]
	decodeAttempt(t, request(app, "POST", "/api/attempt", token, AttemptInput{ID: "pg-wrong-" + player.ID, ItemID: ex.ItemID, ExerciseID: ex.ID, Mode: ex.Mode, Answer: "wrong", ActivityID: proof.ActivityID, RunID: proof.ID}))
	_, _, _, err = store.Mutate(ctx, tokenHash(token), "test-history-clear", json.RawMessage(`{}`), func(account *Account) (Receipt, error) {
		account.Progress.RecentAttempts = map[string]AttemptEvidence{}
		return Receipt{}, nil
	})
	if err != nil {
		t.Fatal(err)
	}
	app.now = func() time.Time { return time.Now().UTC().Add(30 * 24 * time.Hour) }
	if _, _, err = store.ActivityProofs(ctx, "invalid", proof.ActivityID, proof.ID, proof.AttemptIDs); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("unauthenticated receipt lookup: %v", err)
	}
	w := request(app, "POST", "/api/activity/complete", token, proof)
	var result struct {
		XPAdded  int              `json:"xpAdded"`
		Activity ActivityProgress `json:"activity"`
	}
	if w.Code != 200 {
		t.Fatalf("durable PostgreSQL completion %d %s", w.Code, w.Body.String())
	}
	_ = json.Unmarshal(w.Body.Bytes(), &result)
	if result.XPAdded != 20 || result.Activity.CorrectedAnswers != 1 || result.Activity.Completions != 1 {
		t.Fatalf("PostgreSQL receipt outcome changed: %+v", result)
	}
}

func TestPostgresWordEvidenceAndAdditiveMigration(t *testing.T) {
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("set TEST_DATABASE_URL to a disposable PostgreSQL database for integration checks")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	store, err := NewPGStore(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	course, err := parseCurriculum([]byte(tinyCourseJSON))
	if err != nil {
		t.Fatal(err)
	}
	app := NewApp(store, course, nil, 10)
	t.Cleanup(app.Close)
	token, player := createSession(t, app, "Migration Ada")
	t.Cleanup(func() {
		cleanup, done := context.WithTimeout(context.Background(), 5*time.Second)
		defer done()
		_, _ = store.pool.Exec(cleanup, "DELETE FROM learning_events WHERE account_id=$1", player.ID)
		_, _ = store.pool.Exec(cleanup, "DELETE FROM sessions WHERE account_id=$1", player.ID)
		_, _ = store.pool.Exec(cleanup, "DELETE FROM accounts WHERE id=$1", player.ID)
	})
	oldJSON := `{"player":{"id":"` + player.ID + `","name":"Migration Ada"},"progress":{"xp":91,"completedQuestIds":["old-quest"],"attempts":8,"correctAttempts":6,"items":{}},"createdAt":"2026-01-01T00:00:00Z"}`
	if _, err = store.pool.Exec(ctx, "UPDATE accounts SET data=$2 WHERE id=$1", player.ID, oldJSON); err != nil {
		t.Fatal(err)
	}
	old, err := store.Get(ctx, tokenHash(token))
	if err != nil {
		t.Fatal(err)
	}
	if old.Progress.Words == nil || len(old.Progress.Words) != 0 || old.Progress.XP != 91 || old.Progress.CompletedUnitIDs == nil {
		t.Fatalf("JSONB read did not migrate %+v", old.Progress)
	}
	var workers sync.WaitGroup
	for range 12 {
		workers.Add(1)
		go func() {
			defer workers.Done()
			ex := course.Exercises["word-bahnhof-recognition"]
			w := request(app, "POST", "/api/attempt", token, AttemptInput{ID: "pg-word-once", ItemID: ex.ItemID, ExerciseID: ex.ID, Mode: ex.Mode, Answer: ex.Answer})
			if w.Code != 200 {
				t.Errorf("word attempt %d %s", w.Code, w.Body.String())
			}
		}()
	}
	workers.Wait()
	account, err := store.Get(ctx, tokenHash(token))
	if err != nil {
		t.Fatal(err)
	}
	if account.Progress.XP != 97 || account.Progress.Words["bahnhof"].Exposures != 1 || account.Progress.Words["bahnhof"].DirectAttempts != 1 || account.Progress.ExerciseStats["word-bahnhof-recognition"].Correct != 1 {
		t.Fatalf("JSONB duplicate word evidence %+v", account.Progress)
	}
	courseAttempt(t, app, token, "pg-production", "word-bahnhof-production", false)
	for range 2 {
		if w := request(app, "POST", "/api/course/complete", token, map[string]string{"unitId": "unit-station"}); w.Code != 200 {
			t.Fatalf("JSONB unit %d %s", w.Code, w.Body.String())
		}
	}
	account, err = store.Get(ctx, tokenHash(token))
	if err != nil {
		t.Fatal(err)
	}
	if account.Progress.XP != 125 || strings.Join(account.Progress.CompletedUnitIDs, ",") != "unit-station" || strings.Join(account.Progress.CompletedQuestIDs, ",") != "old-quest" {
		t.Fatalf("JSONB migration or reward changed %+v", account.Progress)
	}
	if account.Progress.Revision != 3 || account.Progress.Words["bahnhof"].Evidence["recognition"].UnaidedSuccesses != 1 || len(account.Progress.Items["word-bahnhof"].Cards) != 2 {
		t.Fatal("JSONB lost revision, compact word evidence or canonical FSRS cards")
	}
}

func TestPostgresAccountCredentials(t *testing.T) {
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("set TEST_DATABASE_URL to a disposable PostgreSQL database")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	store, err := NewPGStore(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	app := NewApp(store, testCurriculum(), nil, 10)
	t.Cleanup(func() { app.Close() })
	token, first := createSession(t, app, "Linked Juniper")
	other, second := createSession(t, app, "Linked Ember")
	t.Cleanup(func() {
		cleanup, done := context.WithTimeout(context.Background(), 5*time.Second)
		defer done()
		for _, id := range []string{first.ID, second.ID} {
			_, _ = store.pool.Exec(cleanup, "DELETE FROM learning_events WHERE account_id=$1", id)
			_, _ = store.pool.Exec(cleanup, "DELETE FROM sessions WHERE account_id=$1", id)
			_, _ = store.pool.Exec(cleanup, "DELETE FROM accounts WHERE id=$1", id)
		}
	})
	before := decodeAttempt(t, request(app, "POST", "/api/attempt", token, attemptFor("linked-before")))
	decodeAttempt(t, request(app, "POST", "/api/attempt", other, attemptFor("linked-before")))
	email := strings.ToLower(first.ID) + "@example.com"
	encoded, err := hashPassword("a long lantern password")
	if err != nil {
		t.Fatal(err)
	}
	var workers sync.WaitGroup
	results := make(chan error, 2)
	for _, credential := range []string{token, other} {
		workers.Go(func() { results <- store.SetCredentials(ctx, tokenHash(credential), email, encoded) })
	}
	workers.Wait()
	close(results)
	successes, conflicts := 0, 0
	for result := range results {
		if result == nil {
			successes++
		} else if errors.Is(result, ErrCredentialsConflict) {
			conflicts++
		} else {
			t.Fatal(result)
		}
	}
	if successes != 1 || conflicts != 1 {
		t.Fatal("database allowed duplicate email ownership")
	}
	owner, err := store.GetByEmail(ctx, email)
	if err != nil || owner.Email != email || !verifyPassword("a long lantern password", owner.PasswordHash) {
		t.Fatal("database lost credentials")
	}
	// Use the same durable identity after reopening the database connection.
	app.Close()
	store, err = NewPGStore(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	app = NewApp(store, testCurriculum(), nil, 10)
	login := request(app, "POST", "/api/account/login", "", map[string]string{"email": email, "password": "a long lantern password"})
	if login.Code != 200 {
		t.Fatalf("database login: %d %s", login.Code, login.Body.String())
	}
	var result struct {
		Token    string
		Player   Player
		Progress Progress
	}
	if err = json.Unmarshal(login.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if result.Player.ID != owner.Player.ID {
		t.Fatal("login changed the player identity")
	}
	if result.Progress.XP != before.Progress.XP {
		t.Fatal("login lost learning progress")
	}
	if strings.Contains(login.Body.String(), encoded) || strings.Contains(login.Body.String(), "passwordHash") {
		t.Fatal("login leaked password material")
	}
	if got := request(app, "GET", "/api/progress", result.Token, nil).Code; got != 200 {
		t.Fatalf("new device session failed: %d", got)
	}
}
