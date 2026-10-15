package main

import (
	"context"
	"encoding/json"
	"glotworld/server/internal/billing/billingtest"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
)

func TestUnconfiguredBillingAllowsUnlimitedFreePlay(t *testing.T) {
	for _, tc := range []struct {
		name       string
		registered bool
		played     time.Duration
	}{
		{"new guest", false, 0},
		{"expired guest", false, guestPlayLimit},
		{"new account", true, 0},
		{"expired account", true, trialPlayLimit},
	} {
		t.Run(tc.name, func(t *testing.T) {
			app := testApp(t)
			clock := trialTestClock(app)
			token, player := createSession(t, app, "Free Ada")
			_, err := app.store.UpdateAccount(context.Background(), tokenHash(token), func(account *Account) error {
				if tc.registered {
					account.Email = "free@example.com"
				}
				account.Access.PlayedNanoseconds = int64(tc.played)
				// A lease saved before billing was disabled must not consume time.
				account.Access.ActiveSince = app.now().Add(-10 * time.Second)
				account.Access.ActiveUntil = app.now().Add(20 * time.Second)
				account.Access.SessionLeases = map[string]time.Time{tokenHash(token): account.Access.ActiveUntil}
				return nil
			})
			if err != nil {
				t.Fatal(err)
			}
			resume := request(app, "POST", "/api/session", token, map[string]any{})
			var session struct{ Access AccessStatus }
			if resume.Code != 200 || json.Unmarshal(resume.Body.Bytes(), &session) != nil || session.Access.Phase != "free" || session.Access.Registered != tc.registered || session.Access.BillingAvailable || session.Access.Plan != "" {
				t.Fatalf("session did not grant free access: %d %s", resume.Code, resume.Body.String())
			}
			status := playTrial(t, app, token, clock, 16*time.Minute)
			if status.Phase != "free" || accessBlocked(status) || status.PlayedSeconds != int(tc.played/time.Second) {
				t.Fatalf("free play expired or consumed trial time: %+v", status)
			}
			result := decodeAttempt(t, request(app, "POST", "/api/attempt", token, attemptFor("free-attempt")))
			if !result.Correct || result.XPAdded == 0 {
				t.Fatal("free play did not save learning progress")
			}
			if !decodeAttempt(t, request(app, "POST", "/api/attempt", token, attemptFor("free-attempt"))).Duplicate {
				t.Fatal("free play lost idempotent receipts")
			}
			if response := request(app, "GET", "/api/progress", token, nil); response.Code != 200 {
				t.Fatalf("free progress read blocked: %d %s", response.Code, response.Body.String())
			}
			account, err := app.store.GetAccountByID(context.Background(), player.ID)
			if err != nil {
				t.Fatal(err)
			}
			if account.Access.PlayedNanoseconds != int64(tc.played) || !account.Access.ActiveSince.IsZero() || !account.Access.ActiveUntil.IsZero() || len(account.Access.SessionLeases) != 0 {
				t.Fatalf("free play retained or renewed trial leases: %+v", account.Access)
			}
			// Re-enabling billing restores the saved trial instead of granting paid access.
			app.billing = billingtest.NewClient(nil)
			if status := app.accessState(account, app.now()); status.Phase == "free" || status.Phase == "paid" || accessBlocked(status) != (tc.played > 0) {
				t.Fatalf("configured billing ignored the saved trial: %+v", status)
			}
		})
	}
}

func TestUnconfiguredBillingAllowsWorldAfterTrialExpiry(t *testing.T) {
	app := testApp(t)
	clock := trialTestClock(app)
	token, _ := createSession(t, app, "Free World Ada")
	if _, err := app.store.UpdateAccount(context.Background(), tokenHash(token), func(account *Account) error {
		account.Access.PlayedNanoseconds = int64(trialPlayLimit)
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(app.Handler())
	defer server.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	conn, _, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(server.URL, "http")+"/api/world?token="+token, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.CloseNow()
	readWorld(t, ctx, conn, "welcome")
	clock.Add(int64(time.Hour))
	// Invalid movement reaches normal validation instead of closing at a trial wall.
	writeWorld(t, ctx, conn, map[string]any{"type": "move", "x": -1, "y": 1})
	readWorld(t, ctx, conn, "error")
	if status := trialStatus(t, app, token, nil); status.Phase != "free" {
		t.Fatalf("connected world lost free access: %+v", status)
	}
}
