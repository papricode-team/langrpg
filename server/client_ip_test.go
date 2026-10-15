package main

import (
	"fmt"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestParseTrustedProxies(t *testing.T) {
	prefixes, err := parseTrustedProxies(" 10.0.0.0/8, 172.18.0.5 ,fd00::/8,")
	if err != nil || len(prefixes) != 3 || prefixes[1].Bits() != 32 {
		t.Fatalf("parse: %v %v", prefixes, err)
	}
	if prefixes, err := parseTrustedProxies(""); err != nil || len(prefixes) != 0 {
		t.Fatalf("empty must trust nothing: %v %v", prefixes, err)
	}
	if _, err := parseTrustedProxies("10.0.0.0/8,proxy.internal"); err == nil {
		t.Fatal("an invalid entry must reject the whole list")
	}
}

func TestClientIPHonoursForwardingOnlyFromTrustedProxies(t *testing.T) {
	app := testApp(t)
	var err error
	if app.trustedProxies, err = parseTrustedProxies("10.0.0.0/8"); err != nil {
		t.Fatal(err)
	}
	cases := []struct {
		name, remote, forwarded, realIP, want string
	}{
		{"direct client ignores spoofed headers", "203.0.113.7:5000", "198.51.100.1", "198.51.100.2", "203.0.113.7"},
		{"trusted proxy without headers", "10.0.0.2:5000", "", "", "10.0.0.2"},
		{"trusted proxy single hop", "10.0.0.2:5000", "198.51.100.9", "", "198.51.100.9"},
		{"client-prepended hops are ignored", "10.0.0.2:5000", "1.2.3.4, 198.51.100.9", "", "198.51.100.9"},
		{"chained trusted proxies are skipped", "10.0.0.2:5000", "198.51.100.9, 10.0.0.3", "", "198.51.100.9"},
		{"only trusted hops falls back to leftmost proxy", "10.0.0.2:5000", "10.0.0.4, 10.0.0.3", "", "10.0.0.4"},
		{"malformed hop stops attribution", "10.0.0.2:5000", "198.51.100.9, not-an-ip", "", "10.0.0.2"},
		{"x-real-ip from trusted proxy", "10.0.0.2:5000", "", "198.51.100.10", "198.51.100.10"},
		{"ipv4-mapped peer", "[::ffff:10.0.0.2]:5000", "198.51.100.11", "", "198.51.100.11"},
	}
	for _, c := range cases {
		r := httptest.NewRequest("POST", "/api/account/login", nil)
		r.RemoteAddr = c.remote
		if c.forwarded != "" {
			r.Header.Set("X-Forwarded-For", c.forwarded)
		}
		if c.realIP != "" {
			r.Header.Set("X-Real-IP", c.realIP)
		}
		if got := app.clientIP(r); got != c.want {
			t.Errorf("%s: got %s, want %s", c.name, got, c.want)
		}
	}
}

func TestLoginLimitIsPerForwardedClientBehindProxy(t *testing.T) {
	app := testApp(t)
	app.trustedProxies, _ = parseTrustedProxies("10.0.0.1")
	login := func(remote, forwarded string) int {
		r := httptest.NewRequest("POST", "/api/account/login", strings.NewReader(`{"email":"nobody@example.com","password":"wrong-password"}`))
		r.Header.Set("Content-Type", "application/json")
		r.RemoteAddr = remote
		r.Header.Set("X-Forwarded-For", forwarded)
		w := httptest.NewRecorder()
		app.Handler().ServeHTTP(w, r)
		return w.Code
	}
	for i := 0; i < 10; i++ {
		// Distinct emails keep the per-email limit out of the way.
		r := httptest.NewRequest("POST", "/api/account/login", strings.NewReader(fmt.Sprintf(`{"email":"user%d@example.com","password":"wrong-password"}`, i)))
		r.Header.Set("Content-Type", "application/json")
		r.RemoteAddr = "10.0.0.1:4000"
		r.Header.Set("X-Forwarded-For", "198.51.100.1")
		w := httptest.NewRecorder()
		app.Handler().ServeHTTP(w, r)
		if w.Code != 401 {
			t.Fatalf("login %d: %d", i, w.Code)
		}
	}
	if code := login("10.0.0.1:4000", "198.51.100.1"); code != 429 {
		t.Fatalf("the throttled client should be limited: %d", code)
	}
	if code := login("10.0.0.1:4000", "198.51.100.2"); code != 401 {
		t.Fatalf("another client behind the same proxy must not share the limit: %d", code)
	}
	// A direct client cannot escape its own limit by forging the header.
	for i := 0; i < 10; i++ {
		login("203.0.113.5:4000", fmt.Sprintf("198.51.100.%d", 100+i))
	}
	if code := login("203.0.113.5:4000", "198.51.100.200"); code != 429 {
		t.Fatalf("spoofed forwarding from an untrusted peer must be ignored: %d", code)
	}
}

func TestLimiterFloodNeverDeniesFreshOrResetsThrottledKeys(t *testing.T) {
	app := testApp(t)
	for i := 0; i < 3; i++ {
		app.allow("throttled", 2)
	}
	if app.allow("throttled", 2) {
		t.Fatal("throttled key should be limited")
	}
	for i := 0; i < 3*maxLimiterKeys; i++ {
		if !app.allow(fmt.Sprintf("flood-%d", i), 5) {
			t.Fatalf("flood key %d was denied; a full limiter must evict, not fail closed", i)
		}
	}
	if !app.allow("fresh", 1) {
		t.Fatal("a fresh key must be allowed after a flood of distinct keys")
	}
	if len(app.limits) > maxLimiterKeys {
		t.Fatalf("limiter grew to %d keys", len(app.limits))
	}
	if app.allow("throttled", 2) {
		t.Fatal("a flood of one-off keys must not evict a throttled client")
	}
}

func TestUnauthenticatedBearerFloodsCreateNoLimiterKeys(t *testing.T) {
	app := testApp(t)
	before := len(app.limits)
	for i := 0; i < 50; i++ {
		token := fmt.Sprintf("%064d", i)
		if w := request(app, "POST", "/api/account/register", token, map[string]string{"email": "a@example.com", "password": "long-enough-password"}); w.Code != 401 {
			t.Fatalf("register with unknown token: %d %s", w.Code, w.Body.String())
		}
		if w := request(app, "POST", "/api/access/heartbeat", token, map[string]bool{"active": true}); w.Code != 401 {
			t.Fatalf("heartbeat with unknown token: %d %s", w.Code, w.Body.String())
		}
		if w := request(app, "POST", "/api/access/reset", token, nil); w.Code != 401 {
			t.Fatalf("reset with unknown token: %d %s", w.Code, w.Body.String())
		}
	}
	if len(app.limits) != before {
		t.Fatalf("unknown sessions created %d limiter keys", len(app.limits)-before)
	}
}
