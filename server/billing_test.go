package main

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"
)

type creemTestTransport struct{ handler http.Handler }

func (t creemTestTransport) RoundTrip(r *http.Request) (*http.Response, error) {
	w := httptest.NewRecorder()
	t.handler.ServeHTTP(w, r)
	return w.Result(), nil
}
func testCreem(handler http.Handler) *CreemBilling {
	return &CreemBilling{accessToken: "test-secret-token", webhookSecret: "test-webhook-secret-at-least-32-bytes", monthlyProduct: "monthly-product", lifetimeProduct: "lifetime-product", publicURL: "https://game.example", baseURL: "https://api.creem.io", client: &http.Client{Transport: creemTestTransport{handler}}}
}
func copyWebhookReceipts(receipts map[string]time.Time) map[string]time.Time {
	out := map[string]time.Time{}
	for id, at := range receipts {
		out[id] = at
	}
	return out
}

type creemFixture struct {
	now          time.Time
	checkout     creemCheckout
	subscription creemSubscription
	transaction  creemTransaction
	fail         bool
	calls        int
}

func newCreemFixture(accountID, plan string, now time.Time) *creemFixture {
	f := &creemFixture{now: now}
	f.checkout.ID = "checkout"
	f.checkout.Mode = "prod"
	f.checkout.Status = "completed"
	f.checkout.RequestID = "request"
	f.checkout.Product.ID = plan + "-product"
	f.checkout.Customer.ID = "customer"
	f.checkout.Metadata = map[string]string{"account_id": accountID, "billing_reference": "reference"}
	f.checkout.Order.ID = "order"
	f.checkout.Order.Status = "paid"
	f.checkout.Order.Currency = "EUR"
	f.checkout.Order.Product.ID = f.checkout.Product.ID
	f.checkout.Order.Customer.ID = "customer"
	f.checkout.Order.Transaction.ID = "transaction"
	f.transaction = creemTransaction{ID: "transaction", Mode: "prod", Status: "paid", Currency: "EUR", Type: "payment", AmountPaid: 2999, Customer: creemRef{ID: "customer"}, Order: creemRef{ID: "order"}, CreatedAt: now.UnixMilli()}
	if plan == "monthly" {
		f.checkout.Subscription.ID = "subscription"
		f.transaction.Type = "invoice"
		f.transaction.Subscription.ID = "subscription"
		f.transaction.AmountPaid = 299
		f.transaction.PeriodEnd = now.Add(30 * 24 * time.Hour).UnixMilli()
		f.subscription = creemSubscription{ID: "subscription", Mode: "prod", Product: creemRef{ID: "monthly-product"}, Customer: creemRef{ID: "customer"}, Status: "active", LastTransactionID: "transaction", CurrentPeriodStart: now.Add(-time.Hour), CurrentPeriodEnd: now.Add(30 * 24 * time.Hour)}
	}
	return f
}
func (f *creemFixture) state() BillingState {
	return BillingState{Reference: "reference", Purchases: []CreemPurchase{{CheckoutID: "checkout", RequestID: "request", ProductID: f.checkout.Product.ID, CreatedAt: f.now}}}
}
func (f *creemFixture) serve(w http.ResponseWriter, r *http.Request) {
	f.calls++
	if r.Header.Get("x-api-key") != "test-secret-token" || r.Header.Get("Authorization") != "" {
		w.WriteHeader(401)
		return
	}
	if f.fail {
		w.WriteHeader(503)
		return
	}
	switch r.URL.Path {
	case "/v1/checkouts":
		if r.Method == "GET" {
			writeJSON(w, 200, f.checkout)
		} else {
			w.WriteHeader(405)
		}
	case "/v1/subscriptions":
		writeJSON(w, 200, f.subscription)
	case "/v1/transactions":
		writeJSON(w, 200, f.transaction)
	case "/v1/customers/billing":
		var input map[string]string
		_ = json.NewDecoder(r.Body).Decode(&input)
		if input["customer_id"] != "customer" {
			w.WriteHeader(400)
			return
		}
		writeJSON(w, 200, map[string]string{"customer_portal_link": "https://www.creem.io/customer-portal/session"})
	default:
		w.WriteHeader(404)
	}
}
func TestCreemEntitlementsRequireBoundCheckoutAndPaidTransactions(t *testing.T) {
	now := time.Date(2026, 10, 14, 12, 0, 0, 0, time.UTC)
	cases := []struct {
		name, plan, want string
		change           func(*creemFixture)
		fail             bool
	}{
		{"lifetime", "lifetime", "lifetime", nil, false}, {"monthly", "monthly", "monthly", nil, false},
		{"pending checkout", "lifetime", "", func(f *creemFixture) { f.checkout.Status = "pending" }, false},
		{"other account", "lifetime", "", func(f *creemFixture) { f.checkout.Metadata["account_id"] = "other" }, true},
		{"wrong reference", "lifetime", "", func(f *creemFixture) { f.checkout.Metadata["billing_reference"] = "other" }, true},
		{"different request", "lifetime", "", func(f *creemFixture) { f.checkout.RequestID = "other" }, true},
		{"different product", "lifetime", "", func(f *creemFixture) { f.checkout.Product.ID = "other" }, true},
		{"test checkout in production", "lifetime", "", func(f *creemFixture) { f.checkout.Mode = "test" }, true},
		{"refunded", "lifetime", "", func(f *creemFixture) { f.transaction.Status = "refunded"; f.transaction.RefundedAmount = 2999 }, false},
		{"partial refund", "lifetime", "", func(f *creemFixture) { f.transaction.RefundedAmount = 1 }, false},
		{"disputed", "lifetime", "", func(f *creemFixture) { f.transaction.Status = "chargeback" }, false},
		{"wrong currency", "lifetime", "", func(f *creemFixture) { f.transaction.Currency = "USD" }, false},
		{"zero paid", "lifetime", "", func(f *creemFixture) { f.transaction.AmountPaid = 0 }, false},
		{"different payer", "lifetime", "", func(f *creemFixture) { f.transaction.Customer.ID = "other" }, false},
		{"different order", "lifetime", "", func(f *creemFixture) { f.transaction.Order.ID = "other" }, false},
		{"test payment in production", "lifetime", "", func(f *creemFixture) { f.transaction.Mode = "test" }, false},
		{"scheduled cancellation", "monthly", "monthly", func(f *creemFixture) { f.subscription.Status = "scheduled_cancel" }, false},
		{"canceled paid period", "monthly", "monthly", func(f *creemFixture) { f.subscription.Status = "canceled" }, false},
		{"unpaid monthly", "monthly", "", func(f *creemFixture) { f.subscription.Status = "unpaid" }, false},
		{"trial never paid", "monthly", "", func(f *creemFixture) { f.subscription.Status = "trialing" }, false},
		{"expired monthly", "monthly", "", func(f *creemFixture) { f.subscription.CurrentPeriodEnd = now }, false},
		{"future period", "monthly", "", func(f *creemFixture) { f.subscription.CurrentPeriodStart = now.Add(time.Hour) }, false},
		{"stale renewal payment", "monthly", "", func(f *creemFixture) {
			f.transaction.CreatedAt = now.Add(-31 * 24 * time.Hour).UnixMilli()
			f.transaction.PeriodEnd = now.Add(-time.Hour).UnixMilli()
		}, false},
		{"wrong subscription", "monthly", "", func(f *creemFixture) { f.transaction.Subscription.ID = "other" }, false},
		{"wrong subscription product", "monthly", "", func(f *creemFixture) { f.subscription.Product.ID = "other" }, true},
		{"provider outage", "monthly", "", func(f *creemFixture) { f.fail = true }, true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			f := newCreemFixture("player", tc.plan, now)
			state := f.state()
			if tc.change != nil {
				tc.change(f)
			}
			p := testCreem(http.HandlerFunc(f.serve))
			got, err := p.snapshot(context.Background(), "player", state, now)
			if (err != nil) != tc.fail || got.Plan != tc.want {
				t.Fatalf("snapshot=%+v err=%v", got, err)
			}
			if got.Plan == "monthly" && !got.PaidUntil.Equal(f.subscription.CurrentPeriodEnd) {
				t.Fatal("wrong expiry")
			}
		})
	}
}
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
func TestCreemWebhookSignatureAndReferenceSerialization(t *testing.T) {
	secret := testCreem(nil).webhookSecret
	body := []byte(`{"id":"event"}`)
	r := signedCreemEvent(secret, body)
	if !verifyCreemWebhook(secret, r.Header, body) || verifyCreemWebhook(secret, r.Header, append(body, ' ')) {
		t.Fatal("signature verification failed")
	}
	for _, value := range []string{`"id"`, `{"id":"id"}`} {
		var ref creemRef
		if json.Unmarshal([]byte(value), &ref) != nil || ref.ID != "id" {
			t.Fatal("expanded reference failed")
		}
	}
	if validCreemURL("https://creem.io.evil.test/pay") || validCreemURL("https://user@creem.io/pay") || validCreemURL("http://creem.io/pay") || !validCreemURL("https://www.creem.io/payment/ch_123") {
		t.Fatal("unsafe payment URL")
	}
}
func setupCreemAccount(t *testing.T, app *App, plan string) (string, Player, *creemFixture) {
	t.Helper()
	token, player := createSession(t, app, "Billing Ada")
	ctx := context.Background()
	if err := app.store.SetCredentials(ctx, tokenHash(token), "billing-"+player.ID+"@example.com", "encoded"); err != nil {
		t.Fatal(err)
	}
	f := newCreemFixture(player.ID, plan, app.now())
	app.billing = testCreem(http.HandlerFunc(f.serve))
	_, err := app.store.UpdateAccountByID(ctx, player.ID, func(a *Account) error {
		a.Billing = f.state()
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
		r := signedCreemEvent(app.billing.webhookSecret, body)
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
	calls := f.calls
	if send("first", "checkout.completed", app.now(), map[string]string{"id": "checkout"}) != 200 || f.calls != calls+1 {
		t.Fatal("duplicate reconciled twice")
	}
	if send("old", "checkout.completed", app.now().Add(-25*time.Hour), map[string]string{"id": "checkout"}) != 403 {
		t.Fatal("old replay accepted")
	}
	f.transaction.Status = "refunded"
	f.transaction.RefundedAmount = 2999
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
	f.fail = true
	if send("outage", "subscription.update", app.now(), map[string]any{"metadata": map[string]string{"account_id": player.ID}}) != 503 {
		t.Fatal("failed reconciliation acknowledged")
	}
	account, _ = app.store.GetAccountByID(context.Background(), player.ID)
	if _, ok := account.Billing.WebhookReceipts["outage"]; ok {
		t.Fatal("failed webhook recorded")
	}
}
func TestCreemCheckoutBindsAccountAndSyncPortal(t *testing.T) {
	app := testApp(t)
	token, player := createSession(t, app, "Checkout Ada")
	if w := request(app, "POST", "/api/billing/checkout", token, map[string]string{"plan": "monthly"}); w.Code != 401 {
		t.Fatal("guest allowed")
	}
	app.store.SetCredentials(context.Background(), tokenHash(token), "ada@example.com", "encoded")
	f := newCreemFixture(player.ID, "monthly", app.now())
	app.billing = testCreem(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/v1/checkouts" && r.Method == "POST" {
			var input struct {
				ProductID  string            `json:"product_id"`
				RequestID  string            `json:"request_id"`
				Customer   map[string]string `json:"customer"`
				Metadata   map[string]string `json:"metadata"`
				SuccessURL string            `json:"success_url"`
			}
			json.NewDecoder(r.Body).Decode(&input)
			if input.ProductID != "monthly-product" || input.Customer["email"] != "ada@example.com" || input.Metadata["account_id"] != player.ID || len(input.Metadata["billing_reference"]) < 24 || input.SuccessURL != "https://game.example/?billing=success" {
				t.Error("checkout identity/config not server bound")
			}
			f.checkout.RequestID = input.RequestID
			f.checkout.Metadata = input.Metadata
			writeJSON(w, 200, map[string]string{"id": "checkout", "request_id": input.RequestID, "checkout_url": "https://www.creem.io/payment/checkout"})
			return
		}
		f.serve(w, r)
	}))
	if w := request(app, "POST", "/api/billing/checkout", token, map[string]string{"plan": "unrelated"}); w.Code != 400 {
		t.Fatal("unlisted plan allowed")
	}
	w := request(app, "POST", "/api/billing/checkout", token, map[string]string{"plan": "monthly"})
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	a, _ := app.store.GetAccountByID(context.Background(), player.ID)
	if len(a.Billing.Purchases) != 1 || a.Billing.Plan != "" {
		t.Fatal("checkout itself granted access")
	}
	if w = request(app, "POST", "/api/billing/sync", token, nil); w.Code != 200 || !strings.Contains(w.Body.String(), `"phase":"paid"`) {
		t.Fatal("paid sync failed", w.Code, w.Body.String())
	}
	if w = request(app, "POST", "/api/billing/portal", token, nil); w.Code != 200 || !strings.Contains(w.Body.String(), "my-orders/login") {
		t.Fatal("portal failed", w.Code)
	}
	if w = request(app, "POST", "/api/billing/checkout", token, map[string]string{"plan": "monthly"}); w.Code != 409 {
		t.Fatal("duplicate subscription allowed", w.Code)
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
	f.subscription.CurrentPeriodStart = app.now()
	f.subscription.CurrentPeriodEnd = app.now().Add(30 * 24 * time.Hour)
	f.transaction.CreatedAt = app.now().UnixMilli()
	f.transaction.PeriodEnd = f.subscription.CurrentPeriodEnd.UnixMilli()
	if w := request(app, "GET", "/api/access", token, nil); w.Code != 200 || !strings.Contains(w.Body.String(), `"phase":"paid"`) {
		t.Fatal("renewal failed", w.Code, w.Body.String())
	}
	f.fail = true
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
func TestCreemEnvironmentValidation(t *testing.T) {
	for _, key := range []string{"CREEM_API_KEY", "CREEM_WEBHOOK_SECRET", "CREEM_MONTHLY_PRODUCT_ID", "CREEM_LIFETIME_PRODUCT_ID", "CREEM_SERVER", "PUBLIC_URL"} {
		t.Setenv(key, "")
	}
	t.Setenv("CREEM_MONTHLY_PRODUCT_ID", "monthly")
	t.Setenv("CREEM_LIFETIME_PRODUCT_ID", "lifetime")
	if cfg, err := creemBillingFromEnv(); err != nil || cfg != nil {
		t.Fatal("empty billing must be disabled", err)
	}
	t.Setenv("CREEM_API_KEY", "key")
	if _, err := creemBillingFromEnv(); err == nil {
		t.Fatal("partial billing accepted")
	}
	t.Setenv("CREEM_WEBHOOK_SECRET", testCreem(nil).webhookSecret)
	t.Setenv("PUBLIC_URL", "http://game.example")
	if _, err := creemBillingFromEnv(); err == nil {
		t.Fatal("insecure public URL allowed")
	}
	t.Setenv("PUBLIC_URL", "https://game.example")
	cfg, err := creemBillingFromEnv()
	if err != nil || cfg.baseURL != "https://api.creem.io" {
		t.Fatal(err)
	}
	t.Setenv("CREEM_SERVER", "sandbox")
	t.Setenv("PUBLIC_URL", "http://localhost:5189")
	cfg, err = creemBillingFromEnv()
	if err != nil || cfg.baseURL != "https://test-api.creem.io" {
		t.Fatal(err)
	}
}
func TestBillingAccountUpdatesRollbackAndSerialize(t *testing.T) {
	store, err := NewJSONStore("")
	if err != nil {
		t.Fatal(err)
	}
	account := Account{Player: Player{ID: "account"}, Email: "ada@example.com"}
	if err = store.Create(context.Background(), "hash", account); err != nil {
		t.Fatal(err)
	}
	if _, err = store.UpdateAccountByID(context.Background(), "missing", func(*Account) error { return nil }); !errors.Is(err, ErrUnauthorized) {
		t.Fatal("unknown account accepted")
	}
	failure := errors.New("reconcile failed")
	if _, err = store.UpdateAccountByID(context.Background(), "account", func(a *Account) error { a.Billing.Plan = "lifetime"; return failure }); !errors.Is(err, failure) {
		t.Fatal("failed update was committed")
	}
	stored, _ := store.GetAccountByID(context.Background(), "account")
	if stored.Billing.Plan != "" {
		t.Fatal("failed update changed entitlement")
	}
	var workers sync.WaitGroup
	for range 12 {
		workers.Add(1)
		go func() {
			defer workers.Done()
			_, err := store.UpdateAccountByID(context.Background(), "account", func(a *Account) error {
				a.Billing.WebhookReceipts = copyWebhookReceipts(a.Billing.WebhookReceipts)
				a.Billing.WebhookReceipts[strconv.Itoa(len(a.Billing.WebhookReceipts))] = time.Now()
				return nil
			})
			if err != nil {
				t.Error(err)
			}
		}()
	}
	workers.Wait()
	stored, _ = store.GetAccountByID(context.Background(), "account")
	if len(stored.Billing.WebhookReceipts) != 12 {
		t.Fatal("concurrent billing writes lost updates")
	}
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
		store.pool.Exec(cleanup, "DELETE FROM learning_events WHERE account_id=$1", player.ID)
		store.pool.Exec(cleanup, "DELETE FROM sessions WHERE account_id=$1", player.ID)
		store.pool.Exec(cleanup, "DELETE FROM accounts WHERE id=$1", player.ID)
	}()
	f.transaction.ID = "transaction-" + player.ID
	f.checkout.Order.Transaction.ID = f.transaction.ID
	if _, err := app.refreshBilling(ctx, mustBillingAccount(t, app, player.ID), true); err != nil {
		t.Fatal(err)
	}
	id, err := store.FindBillingAccount(ctx, "", f.transaction.ID)
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
	f.transaction.Status = "refunded"
	f.transaction.RefundedAmount = 2999
	body := creemEvent("refund", "refund.created", app.now(), map[string]any{"transaction": map[string]string{"id": f.transaction.ID}})
	w := httptest.NewRecorder()
	app.billingWebhook(w, signedCreemEvent(app.billing.webhookSecret, body))
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
	app.billing = testCreem(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
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
