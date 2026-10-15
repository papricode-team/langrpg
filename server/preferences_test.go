package main

import (
	"context"
	"encoding/json"
	"glotworld/server/internal/store"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

type sessionPreferences struct {
	Token       string      `json:"token"`
	Preferences Preferences `json:"preferences"`
	Progress    Progress    `json:"progress"`
}

func decodeSessionPreferences(t *testing.T, body []byte) sessionPreferences {
	t.Helper()
	var value sessionPreferences
	if err := json.Unmarshal(body, &value); err != nil {
		t.Fatal(err)
	}
	return value
}

func TestBaseLanguageDefaultsToEnglishAndRoundTripsAcrossRestart(t *testing.T) {
	path := filepath.Join(t.TempDir(), "state.json")
	store, err := NewJSONStore(path)
	if err != nil {
		t.Fatal(err)
	}
	app := NewApp(store, testCurriculum(), nil, 10)
	token, _ := createSession(t, app, "Ada")
	resumed := request(app, "POST", "/api/session", token, map[string]any{})
	if resumed.Code != 200 || decodeSessionPreferences(t, resumed.Body.Bytes()).Preferences.BaseLanguage != "en" {
		t.Fatalf("new session must default to English support: %d %s", resumed.Code, resumed.Body.String())
	}
	decodeAttempt(t, request(app, "POST", "/api/attempt", token, attemptFor("before-language")))
	updated := request(app, "POST", "/api/preferences", token, Preferences{BaseLanguage: "tr"})
	if updated.Code != 200 || !strings.Contains(updated.Body.String(), `"baseLanguage":"tr"`) {
		t.Fatalf("update preferences: %d %s", updated.Code, updated.Body.String())
	}
	app.Close()

	restored, err := NewJSONStore(path)
	if err != nil {
		t.Fatal(err)
	}
	app = NewApp(restored, testCurriculum(), nil, 10)
	defer app.Close()
	after := request(app, "POST", "/api/session", token, map[string]any{})
	value := decodeSessionPreferences(t, after.Body.Bytes())
	if after.Code != 200 || value.Preferences.BaseLanguage != "tr" {
		t.Fatalf("base language did not follow the account: %d %s", after.Code, after.Body.String())
	}
	if value.Progress.XP != 6 || value.Progress.Attempts != 1 {
		t.Fatalf("changing the base language altered learning progress: %+v", value.Progress)
	}
	// A later profile edit must keep the preference.
	edit := request(app, "POST", "/api/session", token, map[string]any{"name": "Mira", "avatar": Avatar{Hair: "#001122", Skin: "#ccbbaa", Outfit: "#998877"}})
	if edit.Code != 200 || decodeSessionPreferences(t, edit.Body.Bytes()).Preferences.BaseLanguage != "tr" {
		t.Fatalf("profile edit dropped the base language: %d %s", edit.Code, edit.Body.String())
	}
	// Attempts are graded identically: the base language never reaches answer matching.
	if result := decodeAttempt(t, request(app, "POST", "/api/attempt", token, attemptFor("after-language"))); !result.Correct {
		t.Fatal("Turkish support changed server grading")
	}
}

func TestBaseLanguageCanBeChosenAtFirstRunAndRejectsUnknownValues(t *testing.T) {
	app := testApp(t)
	recipe := Avatar{Hair: "#302020", Skin: "#edcaaa", Outfit: "#456789"}
	created := request(app, "POST", "/api/session", "", map[string]any{"name": "Deniz", "avatar": recipe, "baseLanguage": "tr"})
	if created.Code != 201 || decodeSessionPreferences(t, created.Body.Bytes()).Preferences.BaseLanguage != "tr" {
		t.Fatalf("first-run language choice was not saved: %d %s", created.Code, created.Body.String())
	}
	if bad := request(app, "POST", "/api/session", "", map[string]any{"name": "Deniz", "avatar": recipe, "baseLanguage": "fr"}); bad.Code != 400 {
		t.Fatalf("unsupported first-run language accepted: %d", bad.Code)
	}
	token := decodeSessionPreferences(t, created.Body.Bytes()).Token
	for _, value := range []string{"", "de", "TR", "turkish"} {
		if bad := request(app, "POST", "/api/preferences", token, map[string]string{"baseLanguage": value}); bad.Code != 400 {
			t.Fatalf("unsupported base language %q accepted: %d", value, bad.Code)
		}
	}
	if anonymous := request(app, "POST", "/api/preferences", "", Preferences{BaseLanguage: "en"}); anonymous.Code != 401 {
		t.Fatalf("preferences changed without a session: %d", anonymous.Code)
	}
}

// State written before preferences existed has no field at all; it must load as English.
func TestLegacyStateWithoutPreferencesLoadsAsEnglish(t *testing.T) {
	path := filepath.Join(t.TempDir(), "state.json")
	store, err := NewJSONStore(path)
	if err != nil {
		t.Fatal(err)
	}
	app := NewApp(store, testCurriculum(), nil, 10)
	token, _ := createSession(t, app, "Ada")
	app.Close()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var raw map[string]any
	if err = json.Unmarshal(data, &raw); err != nil {
		t.Fatal(err)
	}
	for _, account := range raw["accounts"].(map[string]any) {
		delete(account.(map[string]any), "preferences")
	}
	legacy, _ := json.Marshal(raw)
	if err = os.WriteFile(path, legacy, 0600); err != nil {
		t.Fatal(err)
	}
	restored, err := NewJSONStore(path)
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	account, err := restored.Get(ctx, tokenHash(token))
	if err != nil {
		t.Fatal(err)
	}
	if account.Preferences.BaseLanguage != "" || normalizedPreferences(account.Preferences).BaseLanguage != "en" {
		t.Fatalf("legacy preferences did not normalise to English: %+v", account.Preferences)
	}
	app = NewApp(restored, testCurriculum(), nil, 10)
	defer app.Close()
	resumed := request(app, "POST", "/api/session", token, map[string]any{})
	if resumed.Code != 200 || decodeSessionPreferences(t, resumed.Body.Bytes()).Preferences.BaseLanguage != "en" {
		t.Fatalf("legacy account resumed without English default: %d %s", resumed.Code, resumed.Body.String())
	}
}

func normalizedPreferences(p Preferences) Preferences { return store.NormalizePreferences(p) }
