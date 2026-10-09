package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestDeploymentVersionPersistsAcrossRestartAndChangesWithBuild(t *testing.T) {
	directory := t.TempDir()
	writeVersion := func(version string) {
		t.Helper()
		data, err := json.Marshal(map[string]string{"version": version})
		if err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(directory, "version.json"), data, 0644); err != nil {
			t.Fatal(err)
		}
	}
	start := func() *App {
		t.Helper()
		app := testApp(t)
		var err error
		app.version, err = loadDeploymentVersion(directory)
		if err != nil {
			t.Fatal(err)
		}
		return app
	}
	assertVersion := func(app *App, want string) {
		t.Helper()
		w := request(app, "GET", "/api/version", "", nil)
		var response map[string]string
		if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
			t.Fatal(err)
		}
		if w.Code != http.StatusOK || response["version"] != want || len(response) != 1 {
			t.Fatalf("version response %d %s; want %s", w.Code, w.Body.String(), want)
		}
	}
	const first = "ce02a841-823f-4c23-b6bb-c1b42eb205cd"
	const next = "b258707d-9897-49b7-ad9e-78fbbdce87e0"
	writeVersion(first)
	original := start()
	assertVersion(original, first)
	assertVersion(start(), first)
	writeVersion(next)
	assertVersion(original, first)
	assertVersion(start(), next)
}

type unavailableVersionStore struct{ Store }

func (unavailableVersionStore) Health(context.Context) error { return errors.New("database offline") }

func TestDeploymentVersionUnauthenticatedUncachedAndIndependentOfStorage(t *testing.T) {
	app := testApp(t)
	app.version = "deployed-build"
	app.store = unavailableVersionStore{app.store}
	if w := request(app, "GET", "/api/health", "", nil); w.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected storage outage; health returned %d", w.Code)
	}
	for _, authorization := range []string{"", "invalid-token"} {
		w := request(app, "GET", "/api/version", authorization, nil)
		if w.Code != http.StatusOK || w.Header().Get("Cache-Control") != "no-store" || !strings.HasPrefix(w.Header().Get("Content-Type"), "application/json") {
			t.Fatalf("version check %d %s %v", w.Code, w.Body.String(), w.Header())
		}
	}
	for _, test := range []struct {
		origin string
		status int
	}{
		{"http://localhost:5173", http.StatusOK},
		{"https://evil.example", http.StatusForbidden},
	} {
		r := httptest.NewRequest("GET", "/api/version", nil)
		r.Header.Set("Origin", test.origin)
		w := httptest.NewRecorder()
		app.Handler().ServeHTTP(w, r)
		if w.Code != test.status || w.Header().Get("Cache-Control") != "no-store" {
			t.Fatalf("origin %s: %d %v", test.origin, w.Code, w.Header())
		}
		if test.status == http.StatusOK && w.Header().Get("Access-Control-Allow-Origin") != test.origin {
			t.Fatalf("allowed origin missing CORS header: %v", w.Header())
		}
	}
}

func TestDeploymentVersionMetadataUnavailable(t *testing.T) {
	for _, test := range []struct {
		name, data string
		wantError  bool
	}{
		{"missing", "", false},
		{"invalid JSON", "{", true},
		{"missing version", `{}`, true},
		{"null", `null`, true},
		{"wrong type", `{"version":12}`, true},
		{"empty version", `{"version":""}`, true},
		{"unsafe version", `{"version":"build with spaces"}`, true},
		{"trailing JSON", `{"version":"build"} {}`, true},
		{"oversized", strings.Repeat(" ", 4097), true},
	} {
		t.Run(test.name, func(t *testing.T) {
			directory := t.TempDir()
			if test.data != "" {
				if err := os.WriteFile(filepath.Join(directory, "version.json"), []byte(test.data), 0644); err != nil {
					t.Fatal(err)
				}
			}
			version, err := loadDeploymentVersion(directory)
			if version != "" || (err != nil) != test.wantError {
				t.Fatalf("unavailable metadata returned version %q, error %v", version, err)
			}
			app := testApp(t)
			app.version = version
			w := request(app, "GET", "/api/version", "", nil)
			if w.Code != http.StatusServiceUnavailable || w.Header().Get("Cache-Control") != "no-store" {
				t.Fatalf("unavailable version response %d %s %v", w.Code, w.Body.String(), w.Header())
			}
		})
	}
	if version, err := loadDeploymentVersion(""); version != "" || err != nil {
		t.Fatalf("API-only version %q, error %v", version, err)
	}
}
