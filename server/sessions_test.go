package main

import (
	"context"
	"encoding/json"
	"glotworld/server/internal/store"
	"os"
	"strings"
	"testing"
	"time"
)

func loginToken(t *testing.T, app *App, email, password string) string {
	t.Helper()
	w := request(app, "POST", "/api/account/login", "", credentialInput{Email: email, Password: password})
	var value struct{ Token string }
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &value) != nil || value.Token == "" {
		t.Fatalf("login: %d %s", w.Code, w.Body.String())
	}
	return value.Token
}

func progressCode(app *App, token string) int {
	return request(app, "GET", "/api/progress", token, nil).Code
}

// sessionLifecycle runs against either store: credential changes revoke other
// sessions, linked sessions expire when idle, and guest sessions never do.
// sessionClock is the session policy of either store.
type sessionClock interface {
	SetClockForTest(func() time.Time)
	SetSessionIdle(time.Duration)
}

func sessionLifecycle(t *testing.T, app *App, policy sessionClock, pruner store.SessionPruner, register func(string)) {
	clock := time.Now().UTC()
	policy.SetClockForTest(func() time.Time { return clock })
	policy.SetSessionIdle(90 * 24 * time.Hour)

	guest, guestPlayer := createSession(t, app, "Guest Wren")
	first, player := createSession(t, app, "Linked Wren")
	register(guestPlayer.ID)
	register(player.ID)
	email := strings.ToLower(player.ID) + "@example.com"
	if w := request(app, "POST", "/api/account/register", first, credentialInput{Email: email, Password: "the first long password"}); w.Code != 200 {
		t.Fatalf("register: %d %s", w.Code, w.Body.String())
	}
	second := loginToken(t, app, email, "the first long password")
	third := loginToken(t, app, email, "the first long password")

	// A password change keeps the caller's session and revokes every other one.
	if w := request(app, "POST", "/api/account/credentials", first, map[string]any{"currentPassword": "the first long password", "newPassword": "the second long password"}); w.Code != 200 {
		t.Fatalf("change password: %d %s", w.Code, w.Body.String())
	}
	if progressCode(app, first) != 200 {
		t.Fatal("the session that changed the password must survive")
	}
	for _, token := range []string{second, third} {
		if code := progressCode(app, token); code != 401 {
			t.Fatalf("another session survived a password change: %d", code)
		}
	}
	fresh := loginToken(t, app, email, "the second long password")

	// Use within the idle window keeps a linked session alive; disuse expires it.
	clock = clock.Add(60 * 24 * time.Hour)
	if progressCode(app, first) != 200 {
		t.Fatal("linked session expired before its idle limit")
	}
	clock = clock.Add(60 * 24 * time.Hour)
	if progressCode(app, first) != 200 {
		t.Fatal("a session used 60 days ago must remain valid")
	}
	if code := progressCode(app, fresh); code != 401 {
		t.Fatalf("a linked session idle for 120 days must expire: %d", code)
	}
	if progressCode(app, guest) != 200 {
		t.Fatal("guest sessions are the only credential and must never expire")
	}

	// Cleanup removes the expired linked session only.
	if count, err := pruner.PruneExpiredSessions(context.Background()); err != nil || count < 1 {
		t.Fatalf("prune: %d %v", count, err)
	}
	policy.SetSessionIdle(0)
	if code := progressCode(app, fresh); code != 401 {
		t.Fatalf("the pruned session must be deleted, not merely hidden: %d", code)
	}
	if progressCode(app, first) != 200 || progressCode(app, guest) != 200 {
		t.Fatal("cleanup removed a live or guest session")
	}

	// Linking an email to a long-dormant guest starts a fresh idle window.
	policy.SetSessionIdle(90 * 24 * time.Hour)
	clock = clock.Add(200 * 24 * time.Hour)
	if w := request(app, "POST", "/api/account/register", guest, credentialInput{Email: strings.ToLower(guestPlayer.ID) + "@example.com", Password: "a dormant guest password"}); w.Code != 200 {
		t.Fatalf("dormant guest register: %d %s", w.Code, w.Body.String())
	}
	if progressCode(app, guest) != 200 {
		t.Fatal("a newly linked session must not be expired by its guest history")
	}
}

func TestJSONSessionsRevokeOnCredentialChangeAndExpireWhenIdle(t *testing.T) {
	storage, err := NewJSONStore(t.TempDir() + "/state.json")
	if err != nil {
		t.Fatal(err)
	}
	app := NewApp(storage, testCurriculum(), nil, 10)
	t.Cleanup(app.Close)
	sessionLifecycle(t, app, storage, storage, func(string) {})
	// Use timestamps persist with the state file.
	reloaded, err := NewJSONStore(storage.Path())
	if err != nil {
		t.Fatal(err)
	}
	reloaded.EditStateForTest(func(state *store.DiskState) {
		if len(state.SessionUse) != len(state.Sessions) {
			t.Fatalf("session use was not persisted: %d of %d", len(state.SessionUse), len(state.Sessions))
		}
	})
}

func TestPostgresSessionsRevokeOnCredentialChangeAndExpireWhenIdle(t *testing.T) {
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
	var ids []string
	t.Cleanup(func() {
		cleanup, done := context.WithTimeout(context.Background(), 5*time.Second)
		defer done()
		for _, id := range ids {
			_, _ = store.Pool().Exec(cleanup, "DELETE FROM learning_events WHERE account_id=$1", id)
			_, _ = store.Pool().Exec(cleanup, "DELETE FROM sessions WHERE account_id=$1", id)
			_, _ = store.Pool().Exec(cleanup, "DELETE FROM accounts WHERE id=$1", id)
		}
		app.Close()
	})
	sessionLifecycle(t, app, store, store, func(id string) { ids = append(ids, id) })
}
