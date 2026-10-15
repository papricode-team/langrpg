package main

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"regexp"
	"strings"
	"testing"
	"time"

	"glotworld/server/internal/billing/billingtest"
	"glotworld/server/internal/metrics"

	"github.com/coder/websocket"
)

const testMetricsToken = "metrics-token-for-tests-0123456789"

func scrape(t *testing.T, app *App, authorization string) *httptest.ResponseRecorder {
	t.Helper()
	r := httptest.NewRequest("GET", "/metrics", nil)
	if authorization != "" {
		r.Header.Set("Authorization", authorization)
	}
	w := httptest.NewRecorder()
	app.Handler().ServeHTTP(w, r)
	return w
}

func scrapeText(t *testing.T, app *App) string {
	t.Helper()
	w := scrape(t, app, "Bearer "+testMetricsToken)
	if w.Code != 200 || w.Header().Get("Content-Type") != metrics.ContentType {
		t.Fatalf("scrape: %d %q", w.Code, w.Header().Get("Content-Type"))
	}
	if err := metrics.Validate(w.Body.String()); err != nil {
		t.Fatalf("invalid exposition: %v\n%s", err, w.Body.String())
	}
	return w.Body.String()
}

func TestMetricsEndpointRequiresConfiguredToken(t *testing.T) {
	app := testApp(t)
	if w := scrape(t, app, "Bearer "+testMetricsToken); w.Code != 404 {
		t.Fatalf("without METRICS_TOKEN the endpoint must not exist: %d", w.Code)
	}
	app.metricsToken = testMetricsToken
	for _, header := range []string{"", "Bearer wrong-token-of-similar-length-000", "Basic " + testMetricsToken, "Bearer " + testMetricsToken + "x", "bearer " + testMetricsToken} {
		if w := scrape(t, app, header); w.Code != 401 || strings.Contains(w.Body.String(), "glotworld_") {
			t.Fatalf("%q: %d", header, w.Code)
		}
	}
	scrapeText(t, app)
	for value, valid := range map[string]bool{"": true, "short": false, "has space in the middle!": false, testMetricsToken: true} {
		if _, err := parseMetricsToken(value); (err == nil) != valid {
			t.Fatalf("METRICS_TOKEN %q: %v", value, err)
		}
	}
}

func seriesCount(text, family string) int {
	count := 0
	for _, line := range strings.Split(text, "\n") {
		if strings.HasPrefix(line, family+"{") || strings.HasPrefix(line, family+" ") {
			count++
		}
	}
	return count
}

func TestMetricsLabelsStayBoundedUnderHostileTraffic(t *testing.T) {
	app := testApp(t)
	app.metricsToken = testMetricsToken
	handler := app.Handler()
	for i := 0; i < 400; i++ {
		for _, target := range []struct{ method, path string }{
			{"GET", fmt.Sprintf("/api/unknown/%d?token=secret-%d", i, i)},
			{"GET", fmt.Sprintf("/api/admin/users/%d", i)},
			{fmt.Sprintf("BREW%d", i), "/api/health"},
			{"POST", fmt.Sprintf("/no-such-page-%d", i)},
		} {
			w := httptest.NewRecorder()
			handler.ServeHTTP(w, httptest.NewRequest(target.method, target.path, nil))
		}
	}
	text := scrapeText(t, app)
	if n := seriesCount(text, "glotworld_http_requests_total"); n == 0 || n > 20 {
		t.Fatalf("request series must stay bounded by route pattern, got %d:\n%s", n, text)
	}
	for _, leak := range []string{"/api/unknown/1", "secret-", "BREW", "/api/admin/users/1"} {
		if strings.Contains(text, leak) {
			t.Fatalf("raw request data %q reached a label", leak)
		}
	}
	for _, want := range []string{`route="/api/admin/users/{id}",method="GET",status="4xx"`, `route="/api/",method="GET",status="4xx"`, `method="OTHER"`} {
		if !strings.Contains(text, want) {
			t.Fatalf("missing %s in:\n%s", want, text)
		}
	}
}

func TestMetricsCoverWorldLimiterAndCreem(t *testing.T) {
	app := testApp(t)
	app.metricsToken = testMetricsToken
	token, player := createSession(t, app, "Measured Ada")
	// Install the billing client before any socket goroutine can read it.
	f := billingtest.NewFixture(player.ID, "monthly", app.now())
	app.billing = billingtest.NewClient(http.HandlerFunc(f.Serve))
	app.billing.Observe = app.metrics.observeCreem
	server := httptest.NewServer(app.Handler())
	t.Cleanup(server.Close)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	conn, _, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(server.URL, "http")+"/api/world?token="+token, nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = conn.CloseNow() })
	readWorld(t, ctx, conn, "welcome")
	for i := 0; i < 11; i++ {
		request(app, "POST", "/api/account/login", "", credentialInput{Email: fmt.Sprintf("u%d@example.com", i), Password: "wrong password"})
	}
	if err = app.store.SetCredentials(ctx, tokenHash(token), "measured@example.com", "encoded"); err != nil {
		t.Fatal(err)
	}
	if _, err = app.store.UpdateAccountByID(ctx, player.ID, func(account *Account) error { account.Billing = f.State(); return nil }); err != nil {
		t.Fatal(err)
	}
	if w := request(app, "POST", "/api/billing/sync", token, nil); w.Code != 200 {
		t.Fatalf("sync: %d %s", w.Code, w.Body.String())
	}
	f.Fail = true
	request(app, "POST", "/api/admin/users/x/sync-billing", token, map[string]string{"reason": "x"})
	app.rateMu.Lock()
	delete(app.limits, "billing:"+player.ID)
	app.rateMu.Unlock()
	request(app, "POST", "/api/billing/sync", token, nil)
	app.metrics.setContentLoad(1500 * time.Millisecond)

	text := scrapeText(t, app)
	for _, pattern := range []string{
		`(?m)^glotworld_world_connections\{map="lindenhafen"\} 1$`,
		`(?m)^glotworld_world_connections\{map="waldruh"\} 0$`,
		`(?m)^glotworld_rate_limit_rejections_total\{limiter="login"\} 1$`,
		`(?m)^glotworld_rate_limit_keys [1-9]`,
		`(?m)^glotworld_creem_requests_total\{operation="GET /v1/checkouts",outcome="ok"\} [1-9]`,
		`(?m)^glotworld_creem_requests_total\{operation="GET /v1/[a-z]+",outcome="http_5xx"\} [1-9]`,
		`(?m)^glotworld_creem_request_duration_seconds_count\{operation="GET /v1/subscriptions"\} [1-9]`,
		`(?m)^glotworld_http_requests_in_flight [1-9]`,
		`(?m)^glotworld_content_load_duration_seconds 1.5$`,
	} {
		if !regexp.MustCompile(pattern).MatchString(text) {
			t.Fatalf("missing %s in:\n%s", pattern, text)
		}
	}
	// A WebSocket is counted when its request ends.
	_ = conn.Close(websocket.StatusNormalClosure, "")
	upgraded := regexp.MustCompile(`(?m)^glotworld_http_requests_total\{route="/api/world",method="GET",status="1xx"\} 1$`)
	for deadline := time.Now().Add(3 * time.Second); !upgraded.MatchString(text) && time.Now().Before(deadline); time.Sleep(20 * time.Millisecond) {
		text = scrapeText(t, app)
	}
	if !upgraded.MatchString(text) {
		t.Fatalf("the finished upgrade was not counted:\n%s", text)
	}
	if strings.Contains(text, `route="/api/world",method="GET",status="1xx",le=`) {
		t.Fatal("websocket lifetimes must not enter the latency histogram")
	}
	if strings.Contains(text, "glotworld_pgxpool_") {
		t.Fatal("pool metrics are only exported for PostgreSQL")
	}
}

func TestPostgresMetricsIncludePoolAndContentImport(t *testing.T) {
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("set TEST_DATABASE_URL to a disposable PostgreSQL database")
	}
	url = contentTestSchemaURL(t, url)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	store, err := NewPGStore(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	app := NewApp(store, testCurriculum(), nil, 10)
	t.Cleanup(app.Close)
	app.metricsToken = testMetricsToken
	if _, err = store.Pool().Exec(ctx, `INSERT INTO content_imports(id,fingerprint,imported_at,duration_ms) VALUES('main','f',to_timestamp(1700000000),2500)`); err != nil {
		t.Fatal(err)
	}
	text := scrapeText(t, app)
	for _, pattern := range []string{
		`(?m)^glotworld_pgxpool_total_conns [1-9]`,
		`(?m)^glotworld_pgxpool_acquires_total [1-9]`,
		`(?m)^glotworld_content_import_duration_seconds 2.5$`,
		`(?m)^glotworld_content_import_timestamp_seconds 1.7e\+09$`,
	} {
		if !regexp.MustCompile(pattern).MatchString(text) {
			t.Fatalf("missing %s in:\n%s", pattern, text)
		}
	}
}
