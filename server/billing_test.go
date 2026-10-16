package main

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"glotworld/server/internal/billing"
	"glotworld/server/internal/billing/billingtest"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func signedCreemEvent(secret string, body []byte) *http.Request {
	r := httptest.NewRequest("POST", "/api/billing/webhook", strings.NewReader(string(body)))
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(body)
	r.Header.Set("Creem-Signature", hex.EncodeToString(mac.Sum(nil)))
	return r
}
func creemEvent(id, event string, now time.Time, object any) []byte {
	body, _ := json.Marshal(map[string]any{"id": id, "eventType": event, "created_at": now.UnixMilli(), "object": object})
	return body
}
func setupCreemAccount(t *testing.T, app *App, plan string) (string, Player, *billingtest.Fixture) {
	t.Helper()
	token, player := createSession(t, app, "Billing Ada")
	ctx := context.Background()
	if err := app.store.SetCredentials(ctx, tokenHash(token), "billing-"+player.ID+"@example.com", "encoded"); err != nil {
		t.Fatal(err)
	}
	f := billingtest.NewFixture(player.ID, plan, app.now())
	app.billing = billingtest.NewClient(http.HandlerFunc(f.Serve))
	_, err := app.store.UpdateAccountByID(ctx, player.ID, func(a *Account) error {
		a.Billing = f.State()
		a.Access.PlayedNanoseconds = int64(trialPlayLimit)
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	return token, player, f
}
func TestCreemWebhookRefundDuplicateReplayAndOutage(t *testing.T) {
	app := testApp(t)
	token, player, f := setupCreemAccount(t, app, "lifetime")
	send := func(id, typ string, at time.Time, object any) int {
		body := creemEvent(id, typ, at, object)
		r := signedCreemEvent(app.billing.WebhookSecret, body)
		w := httptest.NewRecorder()
		app.billingWebhook(w, r)
		return w.Code
	}
	if code := send("first", "checkout.completed", app.now(), map[string]string{"id": "checkout"}); code != 200 {
		t.Fatal(code)
	}
	if w := request(app, "GET", "/api/progress", token, nil); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	account, _ := app.store.GetAccountByID(context.Background(), player.ID)
	if account.Billing.Plan != "lifetime" || len(account.Billing.WebhookReceipts) != 1 {
		t.Fatal("payment not saved")
	}
	calls := f.Calls
	if send("first", "checkout.completed", app.now(), map[string]string{"id": "checkout"}) != 200 || f.Calls != calls+1 {
		t.Fatal("duplicate reconciled twice")
	}
	if send("old", "checkout.completed", app.now().Add(-25*time.Hour), map[string]string{"id": "checkout"}) != 403 {
		t.Fatal("old replay accepted")
	}
	f.Transaction.Status = "refunded"
	f.Transaction.RefundedAmount = 2999
	if send("refund", "refund.created", app.now(), map[string]any{"id": "refund", "transaction": map[string]string{"id": "transaction"}}) != 200 {
		t.Fatal("refund rejected")
	}
	if w := request(app, "GET", "/api/progress", token, nil); w.Code != 402 {
		t.Fatal("refund retained access", w.Code)
	}
	// A late checkout event must query current refunded state instead of granting.
	if send("late", "checkout.completed", app.now(), map[string]string{"id": "checkout"}) != 200 {
		t.Fatal("late event rejected")
	}
	account, _ = app.store.GetAccountByID(context.Background(), player.ID)
	if account.Billing.Plan != "" {
		t.Fatal("out of order event resurrected payment")
	}
	f.Fail = true
	if send("outage", "subscription.update", app.now(), map[string]any{"metadata": map[string]string{"account_id": player.ID}}) != 503 {
		t.Fatal("failed reconciliation acknowledged")
	}
	account, _ = app.store.GetAccountByID(context.Background(), player.ID)
	if _, ok := account.Billing.WebhookReceipts["outage"]; ok {
		t.Fatal("failed webhook recorded")
	}
}
func TestCreemCheckoutBindsAccountAndSyncPortal(t *testing.T) {
	for _, plan := range []string{"monthly", "yearly"} {
		t.Run(plan, func(t *testing.T) {
			app := testApp(t)
			token, player := createSession(t, app, "Checkout Ada")
			if w := request(app, "POST", "/api/billing/checkout", token, map[string]string{"plan": plan}); w.Code != 401 {
				t.Fatal("guest allowed")
			}
			app.store.SetCredentials(context.Background(), tokenHash(token), "ada@example.com", "encoded")
			f := billingtest.NewFixture(player.ID, plan, app.now())
			app.billing = billingtest.NewClient(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path == "/v1/checkouts" && r.Method == "POST" {
					var input struct {
						ProductID  string            `json:"product_id"`
						RequestID  string            `json:"request_id"`
						Customer   map[string]string `json:"customer"`
						Metadata   map[string]string `json:"metadata"`
						SuccessURL string            `json:"success_url"`
					}
					json.NewDecoder(r.Body).Decode(&input)
					if input.ProductID != plan+"-product" || input.Customer != nil || input.Metadata["account_id"] != player.ID || len(input.Metadata["billing_reference"]) < 24 || input.SuccessURL != "https://game.example/?billing=success" {
						t.Error("checkout identity/config not server bound")
					}
					f.Checkout.RequestID = input.RequestID
					f.Checkout.Metadata = input.Metadata
					// The real create response omits request_id; retrieval includes it.
					writeJSON(w, 200, map[string]string{"id": "checkout", "checkout_url": "https://www.creem.io/payment/checkout"})
					return
				}
				f.Serve(w, r)
			}))
			if w := request(app, "POST", "/api/billing/checkout", token, map[string]string{"plan": "unrelated"}); w.Code != 400 {
				t.Fatal("unlisted plan allowed")
			}
			w := request(app, "POST", "/api/billing/checkout", token, map[string]string{"plan": plan})
			if w.Code != 200 {
				t.Fatal(w.Code, w.Body.String())
			}
			a, _ := app.store.GetAccountByID(context.Background(), player.ID)
			if len(a.Billing.Purchases) != 1 || a.Billing.Plan != "" || a.Billing.Purchases[0].RequestID == "" || a.Billing.Purchases[0].RequestID != f.Checkout.RequestID {
				t.Fatal("checkout itself granted access")
			}
			if w = request(app, "POST", "/api/billing/sync", token, nil); w.Code != 200 || !strings.Contains(w.Body.String(), `"phase":"paid"`) {
				t.Fatal("paid sync failed", w.Code, w.Body.String())
			}
			if w = request(app, "POST", "/api/billing/portal", token, nil); w.Code != 200 || !strings.Contains(w.Body.String(), "my-orders/login") {
				t.Fatal("portal failed", w.Code)
			}
			if w = request(app, "POST", "/api/billing/checkout", token, map[string]string{"plan": plan}); w.Code != 409 {
				t.Fatal("duplicate subscription allowed", w.Code)
			}

		})
	}
}
func TestCreemRenewalRefreshAndOutageGrace(t *testing.T) {
	app := testApp(t)
	token, player, f := setupCreemAccount(t, app, "monthly")
	now := app.now()
	_, err := app.refreshBilling(context.Background(), mustBillingAccount(t, app, player.ID), true)
	if err != nil {
		t.Fatal(err)
	}
	app.now = func() time.Time { return now.Add(30 * 24 * time.Hour) }
	f.Subscription.CurrentPeriodStart = app.now()
	f.Subscription.CurrentPeriodEnd = app.now().Add(30 * 24 * time.Hour)
	f.Transaction.CreatedAt = app.now().UnixMilli()
	f.Transaction.PeriodEnd = f.Subscription.CurrentPeriodEnd.UnixMilli()
	if w := request(app, "GET", "/api/access", token, nil); w.Code != 200 || !strings.Contains(w.Body.String(), `"phase":"paid"`) {
		t.Fatal("renewal failed", w.Code, w.Body.String())
	}
	f.Fail = true
	a := mustBillingAccount(t, app, player.ID)
	if !app.hasPaidAccess(a, app.now().Add(time.Hour)) || app.hasPaidAccess(a, app.now().Add(25*time.Hour)) {
		t.Fatal("outage grace unbounded")
	}
}
func mustBillingAccount(t *testing.T, app *App, id string) Account {
	t.Helper()
	a, err := app.store.GetAccountByID(context.Background(), id)
	if err != nil {
		t.Fatal(err)
	}
	return a
}

func TestPostgresCreemBillingPersistRefundAndRollback(t *testing.T) {
	databaseURL := os.Getenv("TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("requires disposable PostgreSQL")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	store, err := NewPGStore(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	app := NewApp(store, testCurriculum(), nil, 10)
	defer app.Close()
	token, player, f := setupCreemAccount(t, app, "lifetime")
	defer func() {
		cleanup, done := context.WithTimeout(context.Background(), 5*time.Second)
		defer done()
		store.Pool().Exec(cleanup, "DELETE FROM learning_events WHERE account_id=$1", player.ID)
		store.Pool().Exec(cleanup, "DELETE FROM sessions WHERE account_id=$1", player.ID)
		store.Pool().Exec(cleanup, "DELETE FROM accounts WHERE id=$1", player.ID)
	}()
	f.Transaction.ID = "transaction-" + player.ID
	f.Checkout.Order.Transaction.ID = f.Transaction.ID
	if _, err := app.refreshBilling(ctx, mustBillingAccount(t, app, player.ID), true); err != nil {
		t.Fatal(err)
	}
	id, err := store.FindBillingAccount(ctx, "", f.Transaction.ID)
	if err != nil || id != player.ID {
		t.Fatal("refund lookup", id, err)
	}
	a := mustBillingAccount(t, app, player.ID)
	if a.Billing.Plan != "lifetime" {
		t.Fatal("payment not persisted")
	}
	failure := errors.New("rollback")
	_, err = store.UpdateAccountByID(ctx, player.ID, func(a *Account) error { a.Billing.Plan = "invalid"; return failure })
	if !errors.Is(err, failure) || mustBillingAccount(t, app, player.ID).Billing.Plan != "lifetime" {
		t.Fatal("rollback failed")
	}
	f.Transaction.Status = "refunded"
	f.Transaction.RefundedAmount = 2999
	body := creemEvent("refund", "refund.created", app.now(), map[string]any{"transaction": map[string]string{"id": f.Transaction.ID}})
	w := httptest.NewRecorder()
	app.billingWebhook(w, signedCreemEvent(app.billing.WebhookSecret, body))
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	if w = request(app, "GET", "/api/progress", token, nil); w.Code != 402 {
		t.Fatal("refund persisted access", w.Code)
	}
	if a = mustBillingAccount(t, app, player.ID); len(a.Billing.WebhookReceipts) != 1 || a.Billing.Plan != "" {
		t.Fatal("refund persistence failed")
	}
	// Billing references and receipts survive the JSON persistence implementation too.
	file := filepath.Join(t.TempDir(), "billing.json")
	js, _ := NewJSONStore(file)
	if err = js.Create(ctx, "hash", a); err != nil {
		t.Fatal(err)
	}
	js2, err := NewJSONStore(file)
	if err != nil {
		t.Fatal(err)
	}
	saved, err := js2.GetAccountByID(ctx, player.ID)
	if err != nil || len(saved.Billing.Purchases) != 1 || len(saved.Billing.WebhookReceipts) != 1 {
		t.Fatal("JSON references lost")
	}
}

func TestCreemExistingCustomerCheckoutUsesIDWithoutEmail(t *testing.T) {
	app := testApp(t)
	token, player := createSession(t, app, "Returning Ada")
	app.store.SetCredentials(context.Background(), tokenHash(token), "ada@example.com", "encoded")
	_, err := app.store.UpdateAccountByID(context.Background(), player.ID, func(a *Account) error { a.Billing.CustomerID = "customer"; return nil })
	if err != nil {
		t.Fatal(err)
	}
	app.billing = billingtest.NewClient(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" || r.URL.Path != "/v1/checkouts" {
			t.Error("unexpected request", r.URL.Path)
			w.WriteHeader(400)
			return
		}
		var input struct {
			RequestID string            `json:"request_id"`
			Customer  map[string]string `json:"customer"`
		}
		json.NewDecoder(r.Body).Decode(&input)
		if len(input.Customer) != 1 || input.Customer["id"] != "customer" {
			t.Fatal("Creem accepts ID or email, not both")
		}
		writeJSON(w, 200, map[string]string{"id": "checkout", "request_id": input.RequestID, "checkout_url": "https://www.creem.io/payment/checkout"})
	}))
	if w := request(app, "POST", "/api/billing/checkout", token, map[string]string{"plan": "lifetime"}); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
}

func TestFreeToPlayOverrideBypassesExpiredTrial(t *testing.T) {
	t.Setenv("FREE_TO_PLAY", "true")
	t.Setenv("CREEM_API_KEY", "key")
	t.Setenv("CREEM_WEBHOOK_SECRET", billingtest.NewClient(nil).WebhookSecret)
	cfg, err := billing.FromEnv()
	if err != nil || cfg != nil {
		t.Fatal("free-to-play override must disable configured billing", err)
	}
	app := testApp(t)
	app.billing = cfg
	if status := app.accessState(Account{Email: "free@example.com", Access: PlayAccess{PlayedNanoseconds: int64(trialPlayLimit)}}, app.now()); status.Phase != "free" || status.BillingAvailable {
		t.Fatalf("free-to-play override did not bypass the expired trial: %+v", status)
	}
}

func TestCreemDisputeWebhookWithdrawsAccessWhileCreemStillShowsPaid(t *testing.T) {
	app := testApp(t)
	token, player, _ := setupCreemAccount(t, app, "lifetime")
	if _, err := app.refreshBilling(context.Background(), mustBillingAccount(t, app, player.ID), true); err != nil {
		t.Fatal(err)
	}
	if w := request(app, "GET", "/api/progress", token, nil); w.Code != 200 {
		t.Fatal(w.Code)
	}
	body := creemEvent("dispute", "dispute.created", app.now(), map[string]any{"id": "dispute", "transaction": "transaction"})
	w := httptest.NewRecorder()
	app.billingWebhook(w, signedCreemEvent(app.billing.WebhookSecret, body))
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	if w := request(app, "GET", "/api/progress", token, nil); w.Code != 402 {
		t.Fatal("a disputed payment kept access", w.Code)
	}
	if a := mustBillingAccount(t, app, player.ID); len(a.Billing.DisputedTransactions) != 1 || a.Billing.Plan != "" {
		t.Fatal("dispute not stored", a.Billing)
	}
}

func TestCreemOutageBacksOffAndTrialAccountsSkipReconciliation(t *testing.T) {
	app := testApp(t)
	_, player, f := setupCreemAccount(t, app, "monthly")
	f.Fail = true
	account := mustBillingAccount(t, app, player.ID)
	if _, err := app.refreshBilling(context.Background(), account, false); err == nil {
		t.Fatal("outage not reported")
	}
	calls := f.Calls
	if _, err := app.refreshBilling(context.Background(), account, false); err != nil || f.Calls != calls {
		t.Fatal("refresh retried Creem during the backoff", err, f.Calls-calls)
	}
	if _, err := app.refreshBilling(context.Background(), account, true); err == nil || f.Calls == calls {
		t.Fatal("a forced refresh must still ask Creem")
	}
	token, trial := createSession(t, app, "Trial Ada")
	app.store.SetCredentials(context.Background(), tokenHash(token), "trial@example.com", "encoded")
	before := mustBillingAccount(t, app, trial.ID)
	if after, err := app.refreshBilling(context.Background(), before, true); err != nil || !after.Billing.VerifiedAt.IsZero() {
		t.Fatal("an account without purchases was reconciled", err)
	}
}

func TestCreemOffersListConfiguredPlans(t *testing.T) {
	app := testApp(t)
	f := billingtest.NewFixture("player", "lifetime", app.now())
	app.billing = billingtest.NewClient(http.HandlerFunc(f.Serve))
	app.billing.YearlyProduct = ""
	w := request(app, "GET", "/api/billing/offers", "", nil)
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"plan":"monthly","amount":299,"currency":"EUR"`) || strings.Contains(w.Body.String(), "yearly") {
		t.Fatal(w.Code, w.Body.String())
	}
	token, _ := createSession(t, app, "Yearly Ada")
	app.store.SetCredentials(context.Background(), tokenHash(token), "yearly@example.com", "encoded")
	if w := request(app, "POST", "/api/billing/checkout", token, map[string]string{"plan": "yearly"}); w.Code != 400 {
		t.Fatal("unoffered plan accepted", w.Code, w.Body.String())
	}
}
