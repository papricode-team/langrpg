package main

import (
	"bytes"
	"compress/gzip"
	"io"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestFrontendAndAPIShareServer(t *testing.T) {
	directory := t.TempDir()
	if err := os.Mkdir(filepath.Join(directory, "assets"), 0755); err != nil {
		t.Fatal(err)
	}
	for name, content := range map[string]string{"index.html": "<html>Game</html>", "assets/app.js": "console.log('game');", ".secret": "private"} {
		if err := os.WriteFile(filepath.Join(directory, name), []byte(content), 0644); err != nil {
			t.Fatal(err)
		}
	}
	app := testApp(t)
	var err error
	app.frontend, err = newFrontendHandler(directory)
	if err != nil {
		t.Fatal(err)
	}
	for _, test := range []struct {
		method, path string
		status       int
		content      string
	}{
		{"GET", "/", 200, "<html>Game</html>"},
		{"GET", "/index.html", 200, "<html>Game</html>"},
		{"GET", "/course/station", 200, "<html>Game</html>"},
		{"GET", "/assets/app.js", 200, "console.log('game');"},
		{"HEAD", "/assets/app.js", 200, ""},
		{"GET", "/assets/missing.js", 404, ""},
		{"GET", "/assets/missing", 404, ""},
		{"GET", "/assets/", 404, ""},
		{"GET", "/.secret", 404, ""},
		{"GET", "/api/unknown", 404, "endpoint not found"},
		{"GET", "/api", 404, "endpoint not found"},
		{"GET", "/api/progress", 401, ""},
		{"GET", "/api/health", 200, "json-development"},
		{"POST", "/course/station", 405, ""},
	} {
		t.Run(test.method+" "+test.path, func(t *testing.T) {
			w := request(app, test.method, test.path, "", nil)
			if w.Code != test.status || !strings.Contains(w.Body.String(), test.content) {
				t.Fatalf("response %d %s", w.Code, w.Body.String())
			}
			if test.method == "HEAD" && w.Body.Len() != 0 {
				t.Fatal("HEAD returned a body")
			}
		})
	}
	if got := request(app, "GET", "/", "", nil).Header().Get("Cache-Control"); got != "no-cache" {
		t.Fatalf("app shell cache: %s", got)
	}
	if got := request(app, "GET", "/api/health", "", nil).Header().Get("Cache-Control"); got != "no-store" {
		t.Fatalf("API cache: %s", got)
	}
	if _, err = newFrontendHandler(t.TempDir()); err == nil {
		t.Fatal("missing build did not fail initialization")
	}
}

func TestFrontendCompressionAndAudioRanges(t *testing.T) {
	directory := t.TempDir()
	content := strings.Repeat("const word = 'Bahnhof';\n", 100)
	var compressed bytes.Buffer
	writer := gzip.NewWriter(&compressed)
	_, _ = writer.Write([]byte(content))
	_ = writer.Close()
	for name, data := range map[string][]byte{"index.html": []byte("Game"), "app.js": []byte(content), "app.js.gz": compressed.Bytes(), "speech.mp3": []byte("0123456789")} {
		if err := os.WriteFile(filepath.Join(directory, name), data, 0644); err != nil {
			t.Fatal(err)
		}
	}
	frontend, err := newFrontendHandler(directory)
	if err != nil {
		t.Fatal(err)
	}
	for _, test := range []struct {
		encoding string
		gzip     bool
	}{{"gzip", true}, {"br, gzip;q=0.5", true}, {"gzip;q=0", false}, {"identity", false}} {
		r := httptest.NewRequest("GET", "/app.js", nil)
		r.Header.Set("Accept-Encoding", test.encoding)
		w := httptest.NewRecorder()
		frontend.ServeHTTP(w, r)
		if w.Code != 200 || !strings.Contains(w.Header().Get("Content-Type"), "javascript") || w.Header().Get("Vary") != "Accept-Encoding" {
			t.Fatalf("asset headers: %d %v", w.Code, w.Header())
		}
		body := w.Body.String()
		if test.gzip {
			if w.Header().Get("Content-Encoding") != "gzip" {
				t.Fatal("compressed response missing encoding")
			}
			reader, err := gzip.NewReader(w.Body)
			if err != nil {
				t.Fatal(err)
			}
			decoded, err := io.ReadAll(reader)
			_ = reader.Close()
			if err != nil {
				t.Fatal(err)
			}
			body = string(decoded)
		} else if w.Header().Get("Content-Encoding") != "" {
			t.Fatal("gzip was sent when excluded")
		}
		if body != content {
			t.Fatal("served bundle changed")
		}
	}
	r := httptest.NewRequest("GET", "/speech.mp3", nil)
	r.Header.Set("Range", "bytes=2-5")
	w := httptest.NewRecorder()
	frontend.ServeHTTP(w, r)
	if w.Code != 206 || w.Body.String() != "2345" || w.Header().Get("Content-Range") != "bytes 2-5/10" {
		t.Fatalf("audio range: %d %s %v", w.Code, w.Body.String(), w.Header())
	}
}
