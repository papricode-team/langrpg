package main

import (
	"context"
	"glotworld/server/internal/billing/billingtest"
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
	f := billingtest.NewFixture(player.ID, "monthly", app.now())
	if _, err := app.store.UpdateAccountByID(context.Background(), player.ID, func(account *Account) error {
		account.Billing = f.State()
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	var mu sync.Mutex
	var blocked, ledgerChanged bool
	app.billing = billingtest.NewClient(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
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
		f.Serve(w, r)
	}))
	w := request(app, "POST", "/api/billing/sync", token, nil)
	if blocked {
		t.Fatal("a Creem request ran while the account row was locked")
	}
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"phase":"paid"`) {
		t.Fatalf("sync after a concurrent ledger change: %d %s", w.Code, w.Body.String())
	}
	if f.Calls < 6 {
		t.Fatalf("a snapshot computed from a changed ledger was applied without retrying (%d Creem calls)", f.Calls)
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
	app.billing = billingtest.NewClient(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
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

// Admin billing actions follow the same rule: Creem (including the
// cancellation request) runs before the account row is locked, a ledger change
// in the meantime forces a recompute, and the audit entry is written once.
func TestAdminBillingActionsRunCreemOutsideTheAccountLock(t *testing.T) {
	for _, action := range []string{"sync-billing", "cancel-subscription"} {
		t.Run(action, func(t *testing.T) {
			app, admin, _, player := adminUsersFixture(t)
			now := time.Now().UTC()
			app.now = func() time.Time { return now }
			f := billingtest.NewFixture(player.ID, "monthly", now)
			if _, err := app.store.UpdateAccountByID(context.Background(), player.ID, func(account *Account) error {
				account.Billing = f.State()
				return nil
			}); err != nil {
				t.Fatal(err)
			}
			var mu sync.Mutex
			blocked, ledgerChanged, cancellations := false, false, 0
			app.billing = billingtest.NewClient(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				done := make(chan error, 1)
				go func() {
					_, err := app.store.UpdateAccountByID(context.Background(), player.ID, func(account *Account) error {
						mu.Lock()
						defer mu.Unlock()
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
				if r.URL.Path == "/v1/subscriptions/subscription/cancel" {
					cancellations++
					f.Subscription.Status = "scheduled_cancel"
					writeJSON(w, 200, f.Subscription)
					return
				}
				f.Serve(w, r)
			}))
			before, _ := app.store.GetAccountByID(context.Background(), player.ID)
			if w := adminAction(t, app, admin, player.ID, action, nil); w.Code != 200 {
				t.Fatalf("%s: %d %s", action, w.Code, w.Body.String())
			}
			mu.Lock()
			defer mu.Unlock()
			if blocked {
				t.Fatalf("%s called Creem while the account row was locked", action)
			}
			account, err := app.store.GetAccountByID(context.Background(), player.ID)
			if err != nil || account.Billing.Plan != "monthly" || account.Billing.CustomerID != "customer" {
				t.Fatalf("reconciled state: %+v %v", account.Billing, err)
			}
			if len(account.Support.Audit) != len(before.Support.Audit)+1 || account.Support.Audit[len(account.Support.Audit)-1].Action != action {
				t.Fatalf("audit must record the applied action exactly once: %+v", account.Support.Audit)
			}
			if action == "cancel-subscription" && (cancellations != 1 || account.Billing.SubscriptionStatus != "scheduled_cancel") {
				t.Fatalf("cancellation repeated or lost: %d %+v", cancellations, account.Billing)
			}
		})
	}
}
