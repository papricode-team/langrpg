package main

import (
	"bytes"
	"context"
	"log/slog"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/coder/websocket"
)

type lockedBuffer struct {
	mu sync.Mutex
	b  bytes.Buffer
}

func (b *lockedBuffer) Write(p []byte) (int, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.b.Write(p)
}

func (b *lockedBuffer) String() string {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.b.String()
}

func captureLogs(t *testing.T) *lockedBuffer {
	t.Helper()
	buffer := &lockedBuffer{}
	previous := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(buffer, nil)))
	t.Cleanup(func() { slog.SetDefault(previous) })
	return buffer
}

func TestAccessLogRecordsRequestsWithoutSecrets(t *testing.T) {
	app := testApp(t)
	token, _ := createSession(t, app, "Logged Ada")
	logs := captureLogs(t)

	r := httptest.NewRequest("GET", "/api/progress?secret=query-value", nil)
	r.Header.Set("Authorization", "Bearer "+token)
	r.Header.Set("X-Request-ID", "trace-123")
	w := httptest.NewRecorder()
	app.Handler().ServeHTTP(w, r)
	if w.Code != 200 || w.Header().Get("X-Request-ID") != "trace-123" {
		t.Fatalf("request ID was not echoed: %d %q", w.Code, w.Header().Get("X-Request-ID"))
	}
	line := logs.String()
	for _, want := range []string{"requestId=trace-123", "method=GET", "path=/api/progress", "status=200", "durationMs="} {
		if !strings.Contains(line, want) {
			t.Fatalf("access log lacks %s: %s", want, line)
		}
	}

	// Invalid inbound IDs are replaced rather than logged verbatim.
	r = httptest.NewRequest("GET", "/api/progress", nil)
	r.Header.Set("Authorization", "Bearer "+token)
	r.Header.Set("X-Request-ID", "bad id\nforged=1")
	w = httptest.NewRecorder()
	app.Handler().ServeHTTP(w, r)
	if generated := w.Header().Get("X-Request-ID"); generated == "" || strings.Contains(generated, " ") {
		t.Fatalf("invalid request ID was echoed: %q", generated)
	}

	// The world socket carries its token in the query string.
	server := httptest.NewServer(app.Handler())
	t.Cleanup(server.Close)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	conn, _, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(server.URL, "http")+"/api/world?token="+token, nil)
	if err != nil {
		t.Fatalf("websocket upgrade through the access log: %v", err)
	}
	readWorld(t, ctx, conn, "welcome")
	_ = conn.Close(websocket.StatusNormalClosure, "")
	deadline := time.Now().Add(3 * time.Second)
	for !strings.Contains(logs.String(), "path=/api/world") && time.Now().Before(deadline) {
		time.Sleep(20 * time.Millisecond)
	}
	all := logs.String()
	if !strings.Contains(all, "path=/api/world") || !strings.Contains(all, "status=101") {
		t.Fatalf("websocket request was not logged as an upgrade: %s", all)
	}
	for _, secret := range []string{token, tokenHash(token), "query-value", "Bearer", "forged=1"} {
		if strings.Contains(all, secret) {
			t.Fatalf("access log leaked %q", secret)
		}
	}

	// Successful health probes are not logged.
	before := logs.String()
	request(app, "GET", "/api/live", "", nil)
	request(app, "GET", "/api/health", "", nil)
	if logs.String() != before {
		t.Fatalf("health probes were logged: %s", strings.TrimPrefix(logs.String(), before))
	}
}
