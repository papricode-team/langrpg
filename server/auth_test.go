package main

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
)

func TestAccountLoginRestoresIdentityAndProgressAfterRestart(t *testing.T) {
	path := filepath.Join(t.TempDir(), "state.json")
	store, err := NewJSONStore(path)
	if err != nil {
		t.Fatal(err)
	}
	app := NewApp(store, testCurriculum(), nil, 10)
	defer app.Close()
	token, player := createSession(t, app, "Juniper")
	before := decodeAttempt(t, request(app, "POST", "/api/attempt", token, attemptFor("before-signup")))
	credentials := map[string]string{"email": " PLAYER@Example.com ", "password": "a long lantern password"}
	registered := request(app, "POST", "/api/account/register", token, credentials)
	if registered.Code != 200 {
		t.Fatalf("register: %d %s", registered.Code, registered.Body.String())
	}
	stored, err := store.Get(context.Background(), tokenHash(token))
	if err != nil || stored.Email != "player@example.com" || stored.PasswordHash == credentials["password"] || !verifyPassword(credentials["password"], stored.PasswordHash) {
		t.Fatal("credentials not securely stored")
	}
	data, err := os.ReadFile(path)
	if err != nil || strings.Contains(string(data), credentials["password"]) || strings.Contains(string(data), token) {
		t.Fatal("raw credentials persisted")
	}
	resumed := request(app, "POST", "/api/session", token, map[string]any{})
	if strings.Contains(resumed.Body.String(), "passwordHash") || strings.Contains(resumed.Body.String(), stored.PasswordHash) {
		t.Fatal("session leaked password hash")
	}
	reopened, err := NewJSONStore(path)
	if err != nil {
		t.Fatal(err)
	}
	app2 := NewApp(reopened, testCurriculum(), nil, 10)
	defer app2.Close()
	login := request(app2, "POST", "/api/account/login", "", credentials)
	if login.Code != 200 {
		t.Fatalf("login: %d %s", login.Code, login.Body.String())
	}
	var result struct {
		Token    string
		Player   Player
		Progress Progress
		Account  struct {
			Registered bool
			Email      string
		}
	}
	if err = json.Unmarshal(login.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if result.Token == token || result.Player != player || result.Progress.XP != before.Progress.XP || !result.Account.Registered || result.Account.Email != "player@example.com" {
		t.Fatal("login did not restore identity and progress")
	}
	if request(app2, "GET", "/api/progress", result.Token, nil).Code != 200 || request(app2, "GET", "/api/progress", token, nil).Code != 200 {
		t.Fatal("both devices must retain valid sessions")
	}
	retry := decodeAttempt(t, request(app2, "POST", "/api/attempt", result.Token, attemptFor("before-signup")))
	if !retry.Duplicate || retry.XPAdded != 0 {
		t.Fatal("cross-device login lost learning receipts")
	}
}

func TestAccountCredentialValidationAndLoginFailures(t *testing.T) {
	app := testApp(t)
	token, _ := createSession(t, app, "Robin")
	valid := map[string]string{"email": "robin@example.com", "password": "a long lantern password"}
	if got := request(app, "POST", "/api/account/register", "", valid).Code; got != 401 {
		t.Fatalf("anonymous registration: %d", got)
	}
	for _, input := range []map[string]string{
		{"email": "bad", "password": valid["password"]},
		{"email": "Robin <robin@example.com>", "password": valid["password"]},
		{"email": valid["email"], "password": "short"},
		{"email": valid["email"], "password": strings.Repeat("x", 129)},
	} {
		if got := request(app, "POST", "/api/account/register", token, input).Code; got != 400 {
			t.Fatalf("invalid registration: %d", got)
		}
	}
	if got := request(app, "POST", "/api/account/register", token, valid).Code; got != 200 {
		t.Fatalf("register: %d", got)
	}
	if got := request(app, "POST", "/api/account/register", token, valid).Code; got != 200 {
		t.Fatalf("signup retry: %d", got)
	}
	// A separate session gets a fresh registration rate window.
	linked, _ := app.store.Get(context.Background(), tokenHash(token))
	retryToken, _ := randomID(32)
	if err := app.store.AddSession(context.Background(), tokenHash(retryToken), linked.Player.ID); err != nil {
		t.Fatal(err)
	}
	if got := request(app, "POST", "/api/account/register", retryToken, map[string]string{"email": valid["email"], "password": "a different long password"}).Code; got != 409 {
		t.Fatalf("credentials overwritten: %d", got)
	}
	var failure string
	for _, email := range []string{valid["email"], "missing@example.com"} {
		result := request(app, "POST", "/api/account/login", "", map[string]string{"email": email, "password": "wrong password"})
		if result.Code != 401 {
			t.Fatalf("wrong credentials: %d", result.Code)
		}
		if failure != "" && failure != result.Body.String() {
			t.Fatal("login reveals whether an email exists")
		}
		failure = result.Body.String()
	}
}

func TestConcurrentEmailRegistrationHasOneOwner(t *testing.T) {
	app := testApp(t)
	first, _ := createSession(t, app, "Willow")
	second, _ := createSession(t, app, "Ember")
	results := make(chan int, 2)
	var workers sync.WaitGroup
	for _, token := range []string{first, second} {
		workers.Go(func() {
			results <- request(app, "POST", "/api/account/register", token, map[string]string{"email": "shared@example.com", "password": "a long lantern password"}).Code
		})
	}
	workers.Wait()
	close(results)
	counts := map[int]int{}
	for code := range results {
		counts[code]++
	}
	if counts[200] != 1 || counts[409] != 1 {
		t.Fatalf("email uniqueness failed: %v", counts)
	}
}

func TestLoginRateLimit(t *testing.T) {
	app := testApp(t)
	for range 10 {
		if got := request(app, "POST", "/api/account/login", "", map[string]string{"email": "invalid", "password": "wrong"}).Code; got != 401 {
			t.Fatalf("unexpected status: %d", got)
		}
	}
	if got := request(app, "POST", "/api/account/login", "", map[string]string{"email": "invalid", "password": "wrong"}).Code; got != 429 {
		t.Fatalf("unlimited login attempts: %d", got)
	}
}
