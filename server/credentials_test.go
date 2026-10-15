package main

import (
	"context"
	"encoding/json"
	"errors"
	"path/filepath"
	"reflect"
	"strings"
	"sync"
	"testing"
)

func TestCredentialChangesPersistAndPreserveAdventure(t *testing.T) {
	file := filepath.Join(t.TempDir(), "accounts.json")
	store, err := NewJSONStore(file)
	if err != nil {
		t.Fatal(err)
	}
	app := NewApp(store, testCurriculum(), nil, 10)
	defer app.Close()
	token, _ := createSession(t, app, "Juniper")
	password := "original lantern password"
	if res := request(app, "POST", "/api/account/register", token, map[string]string{"email": "juniper@example.com", "password": password}); res.Code != 200 {
		t.Fatal(res.Body.String())
	}
	decodeAttempt(t, request(app, "POST", "/api/attempt", token, attemptFor("before-change")))
	before, _ := store.Get(context.Background(), tokenHash(token))
	for _, change := range []map[string]string{
		{"currentPassword": password, "email": " NEW@Example.com "},
		{"currentPassword": password, "newPassword": "updated lantern password"},
	} {
		res := request(app, "POST", "/api/account/credentials", token, change)
		if res.Code != 200 {
			t.Fatalf("change: %d %s", res.Code, res.Body.String())
		}
		if strings.Contains(res.Body.String(), "password") {
			t.Fatal("credential response leaked password data")
		}
		var metadata struct {
			Registered bool
			Email      string
		}
		if json.Unmarshal(res.Body.Bytes(), &metadata) != nil || !metadata.Registered || metadata.Email != "new@example.com" {
			t.Fatal("updated email missing from account response")
		}
	}
	reopened, err := NewJSONStore(file)
	if err != nil {
		t.Fatal(err)
	}
	app2 := NewApp(reopened, testCurriculum(), nil, 10)
	defer app2.Close()
	after, err := reopened.Get(context.Background(), tokenHash(token))
	if err != nil || !reflect.DeepEqual(before.Player, after.Player) || !reflect.DeepEqual(before.Progress, after.Progress) {
		t.Fatal("credential change lost the adventure or current session")
	}
	if !verifyPassword("updated lantern password", after.PasswordHash) || verifyPassword(password, after.PasswordHash) {
		t.Fatal("password was not replaced")
	}
	for _, credentials := range []struct {
		email, password string
		status          int
	}{
		{"juniper@example.com", password, 401},
		{"new@example.com", password, 401},
		{"new@example.com", "updated lantern password", 200},
	} {
		res := request(app2, "POST", "/api/account/login", "", map[string]string{"email": credentials.email, "password": credentials.password})
		if res.Code != credentials.status {
			t.Fatalf("login: %d %s", res.Code, res.Body.String())
		}
	}
}

func TestCredentialChangeValidation(t *testing.T) {
	password := "original lantern password"
	for _, test := range []struct {
		name   string
		body   map[string]string
		status int
	}{
		{"wrong password", map[string]string{"currentPassword": "incorrect", "email": "new@example.com"}, 403},
		{"missing password", map[string]string{"email": "new@example.com"}, 403},
		{"invalid email", map[string]string{"currentPassword": password, "email": "invalid"}, 400},
		{"empty email", map[string]string{"currentPassword": password, "email": ""}, 400},
		{"short password", map[string]string{"currentPassword": password, "newPassword": "short"}, 400},
		{"long password", map[string]string{"currentPassword": password, "newPassword": strings.Repeat("x", 129)}, 400},
		{"missing change", map[string]string{"currentPassword": password}, 400},
		{"two changes", map[string]string{"currentPassword": password, "email": "new@example.com", "newPassword": password}, 400},
		{"email in use", map[string]string{"currentPassword": password, "email": "other@example.com"}, 409},
		{"admin email", map[string]string{"currentPassword": password, "email": "admin@example.com"}, 409},
	} {
		t.Run(test.name, func(t *testing.T) {
			app := testApp(t)
			app.adminEmails = map[string]bool{"admin@example.com": true}
			token, _ := createSession(t, app, "Juniper")
			other, _ := createSession(t, app, "Willow")
			encoded, _ := hashPassword(password)
			if err := app.store.SetCredentials(context.Background(), tokenHash(token), "juniper@example.com", encoded); err != nil {
				t.Fatal(err)
			}
			if err := app.store.SetCredentials(context.Background(), tokenHash(other), "other@example.com", encoded); err != nil {
				t.Fatal(err)
			}
			before, _ := app.store.Get(context.Background(), tokenHash(token))
			res := request(app, "POST", "/api/account/credentials", token, test.body)
			if res.Code != test.status {
				t.Fatalf("status: %d %s", res.Code, res.Body.String())
			}
			after, _ := app.store.Get(context.Background(), tokenHash(token))
			if !reflect.DeepEqual(before, after) {
				t.Fatal("failed update changed the account")
			}
		})
	}
}

func TestCredentialChangeRequiresRegisteredSessionAndIsRateLimited(t *testing.T) {
	app := testApp(t)
	token, _ := createSession(t, app, "Juniper")
	input := map[string]string{"currentPassword": "incorrect", "email": "new@example.com"}
	for _, session := range []string{"", "invalid-token"} {
		if res := request(app, "POST", "/api/account/credentials", session, input); res.Code != 401 {
			t.Fatalf("unauthenticated change: %d", res.Code)
		}
	}
	if res := request(app, "POST", "/api/account/credentials", token, input); res.Code != 403 {
		t.Fatalf("guest change: %d", res.Code)
	}
	encoded, _ := hashPassword("original lantern password")
	if err := app.store.SetCredentials(context.Background(), tokenHash(token), "juniper@example.com", encoded); err != nil {
		t.Fatal(err)
	}
	for range 6 {
		if res := request(app, "POST", "/api/account/credentials", token, input); res.Code != 403 {
			t.Fatalf("password rejection: %d", res.Code)
		}
	}
	if res := request(app, "POST", "/api/account/credentials", token, input); res.Code != 429 {
		t.Fatalf("unlimited credential attempts: %d", res.Code)
	}
}

func TestConcurrentCredentialChangesKeepOneEmailOwnerAndRejectStalePassword(t *testing.T) {
	app := testApp(t)
	ctx := context.Background()
	first, _ := createSession(t, app, "Juniper")
	second, _ := createSession(t, app, "Willow")
	encoded, _ := hashPassword("original lantern password")
	tokens := []string{first, second}
	emails := []string{"juniper@example.com", "willow@example.com"}
	for i, token := range tokens {
		if err := app.store.SetCredentials(ctx, tokenHash(token), emails[i], encoded); err != nil {
			t.Fatal(err)
		}
	}
	results := make(chan error, 2)
	var workers sync.WaitGroup
	for i, token := range tokens {
		workers.Go(func() {
			results <- app.store.ChangeCredentials(ctx, tokenHash(token), CredentialChange{emails[i], encoded, "shared@example.com", encoded})
		})
	}
	workers.Wait()
	close(results)
	success, conflict := 0, 0
	for err := range results {
		if err == nil {
			success++
		} else if errors.Is(err, ErrCredentialsConflict) {
			conflict++
		} else {
			t.Fatal(err)
		}
	}
	if success != 1 || conflict != 1 {
		t.Fatal("concurrent updates shared an email")
	}
	current, _ := app.store.Get(ctx, tokenHash(first))
	change := CredentialChange{current.Email, encoded, current.Email, "new-password-hash"}
	if err := app.store.ChangeCredentials(ctx, tokenHash(first), change); err != nil {
		t.Fatal(err)
	}
	change.Email = "stale@example.com"
	if err := app.store.ChangeCredentials(ctx, tokenHash(first), change); !errors.Is(err, ErrCredentialsChanged) {
		t.Fatalf("stale credentials accepted: %v", err)
	}
}
