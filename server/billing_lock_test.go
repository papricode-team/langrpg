package main

import (
	"context"
	"net/http"
	"strings"
	"sync"
	"testing"
	"time"
)

// Creem requests must not run while the account row is locked: a slow Creem
// would otherwise stall every request that touches the same account.
func TestCreemRequestsRunOutsideTheAccountLock(t *testing.T) {
	app := testApp(t)
	token, player := createSession(t, app, "Unlocked Ada")
	if err := app.store.SetCredentials(context.Background(), tokenHash(token), "unlocked@example.com", "encoded"); err != nil {
		t.Fatal(err)
	}
	f := newCreemFixture(player.ID, "monthly", app.now())
	if _, err := app.store.UpdateAccountByID(context.Background(), player.ID, func(account *Account) error {
		account.Billing = f.state()
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	var mu sync.Mutex
	var blocked, ledgerChanged bool
	app.billing = testCreem(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		done := make(chan error, 1)
		go func() {
			_, err := app.store.UpdateAccountByID(context.Background(), player.ID, func(account *Account) error {
				mu.Lock()
				defer mu.Unlock()
				// Change the ledger once mid-reconciliation; the stale snapshot
				// must be discarded and recomputed, not applied.
				if !ledgerChanged {
					ledgerChanged = true
					account.Billing.CustomerID = "customer"
				}
				return nil
			})
			done <- err
		}()
		select {
		case err := <-done:
			if err != nil {
				t.Errorf("concurrent account write: %v", err)
			}
		case <-time.After(2 * time.Second):
			mu.Lock()
			blocked = true
			mu.Unlock()
		}
		if r.URL.Path == "/v1/checkouts" && r.Method == "POST" {
			writeJSON(w, 200, map[string]string{"id": "second-checkout", "checkout_url": "https://www.creem.io/payment/checkout"})
			return
		}
		f.serve(w, r)
	}))
	w := request(app, "POST", "/api/billing/sync", token, nil)
	if blocked {
		t.Fatal("a Creem request ran while the account row was locked")
	}
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"phase":"paid"`) {
		t.Fatalf("sync after a concurrent ledger change: %d %s", w.Code, w.Body.String())
	}
	if f.calls < 6 {
		t.Fatalf("a snapshot computed from a changed ledger was applied without retrying (%d Creem calls)", f.calls)
	}
	account, err := app.store.GetAccountByID(context.Background(), player.ID)
	if err != nil || account.Billing.Plan != "monthly" || account.Billing.CustomerID != "customer" {
		t.Fatalf("reconciled state: %+v %v", account.Billing, err)
	}
}

func TestCreemCheckoutCreationRunsOutsideTheAccountLock(t *testing.T) {
	app := testApp(t)
	token, player := createSession(t, app, "Checkout Lock Ada")
	if err := app.store.SetCredentials(context.Background(), tokenHash(token), "checkout-lock@example.com", "encoded"); err != nil {
		t.Fatal(err)
	}
	blocked := false
	app.billing = testCreem(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/checkouts" || r.Method != "POST" {
			w.WriteHeader(404)
			return
		}
		done := make(chan struct{})
		go func() {
			_, _ = app.store.UpdateAccountByID(context.Background(), player.ID, func(*Account) error { return nil })
			close(done)
		}()
		select {
		case <-done:
		case <-time.After(2 * time.Second):
			blocked = true
		}
		writeJSON(w, 200, map[string]string{"id": "checkout", "checkout_url": "https://www.creem.io/payment/checkout"})
	}))
	w := request(app, "POST", "/api/billing/checkout", token, map[string]string{"plan": "monthly"})
	if blocked {
		t.Fatal("checkout creation ran while the account row was locked")
	}
	account, _ := app.store.GetAccountByID(context.Background(), player.ID)
	if w.Code != 200 || len(account.Billing.Purchases) != 1 || account.Billing.Reference == "" {
		t.Fatalf("checkout: %d %s %+v", w.Code, w.Body.String(), account.Billing)
	}
}
