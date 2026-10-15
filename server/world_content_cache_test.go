package main

import (
	"net/http/httptest"
	"testing"
)

func worldContentRequest(app *App, remote, etag string) *httptest.ResponseRecorder {
	r := httptest.NewRequest("GET", "/api/world-content", nil)
	r.RemoteAddr = remote
	if etag != "" {
		r.Header.Set("If-None-Match", etag)
	}
	w := httptest.NewRecorder()
	app.Handler().ServeHTTP(w, r)
	return w
}

func TestWorldContentRevalidatesAndIsRateLimited(t *testing.T) {
	app, _ := adminWorldTestApp(t, t.TempDir()+"/state.json")
	first := worldContentRequest(app, "198.51.100.1:1000", "")
	etag := first.Header().Get("ETag")
	if first.Code != 200 || etag == "" || first.Header().Get("Cache-Control") != "no-cache" || first.Body.Len() == 0 {
		t.Fatalf("first download: %d etag=%q cache=%q", first.Code, etag, first.Header().Get("Cache-Control"))
	}
	for _, header := range []string{etag, "W/" + etag, `"other", ` + etag, "*"} {
		cached := worldContentRequest(app, "198.51.100.1:1000", header)
		if cached.Code != 304 || cached.Body.Len() != 0 || cached.Header().Get("ETag") != etag {
			t.Fatalf("If-None-Match %s: %d with %d bytes", header, cached.Code, cached.Body.Len())
		}
	}
	if stale := worldContentRequest(app, "198.51.100.1:1000", `"world-stale"`); stale.Code != 200 || stale.Body.Len() == 0 {
		t.Fatalf("a stale tag must download the world: %d", stale.Code)
	}
	for i := 0; i < worldContentPerMinute; i++ {
		worldContentRequest(app, "198.51.100.2:1000", etag)
	}
	limited := worldContentRequest(app, "198.51.100.2:1000", etag)
	if limited.Code != 429 || limited.Header().Get("Retry-After") == "" {
		t.Fatalf("world downloads are not rate limited per client: %d", limited.Code)
	}
	if other := worldContentRequest(app, "198.51.100.3:1000", etag); other.Code != 304 {
		t.Fatalf("another client must not share the limit: %d", other.Code)
	}
}
