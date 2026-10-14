package main

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"
)

// Exercise real HTTP serialization through an httptest handler, without sockets
// or any external purchases. The fake deliberately authenticates every request.
type polarTestTransport struct{ handler http.Handler }

func (t polarTestTransport) RoundTrip(r *http.Request) (*http.Response, error) {
	w := httptest.NewRecorder()
	t.handler.ServeHTTP(w, r)
	return w.Result(), nil
}

func testPolar(handler http.Handler) *PolarBilling {
	return &PolarBilling{accessToken: "test-secret-token", webhookSecret: "whsec_" + base64.StdEncoding.EncodeToString(bytes.Repeat([]byte{7}, 32)), monthlyProduct: "monthly-product", lifetimeProduct: "lifetime-product", publicURL: "https://game.example", baseURL: "https://api.polar.sh", client: &http.Client{Transport: polarTestTransport{handler}}}
}

func polarPaidOrder(externalID, product string, now time.Time) polarOrder {
	amount := int64(2999)
	if product == "monthly-product" {
		amount = 299
	}
	return polarOrder{ID: "paid-order", CustomerID: "customer", Customer: polarCustomer{ID: "customer", ExternalID: externalID}, ProductID: product, Status: "paid", Paid: true, Currency: "eur", SubtotalAmount: amount, NetAmount: amount, CreatedAt: now}
}

func TestPolarEntitlementsRequireAuthoritativePaidOrders(t *testing.T) {
	now := time.Date(2026, 10, 14, 12, 0, 0, 0, time.UTC)
	baseCustomer := polarCustomerState{polarCustomer: polarCustomer{ID: "customer", ExternalID: "player"}}
	monthly := polarSubscription{ID: "subscription", ProductID: "monthly-product", Status: "active", Currency: "eur", Amount: 299, RecurringInterval: "month", CurrentPeriodStart: now.Add(-time.Hour), CurrentPeriodEnd: now.Add(30 * 24 * time.Hour)}
	monthlyOrder := polarPaidOrder("player", "monthly-product", monthly.CurrentPeriodStart)
	monthlyOrder.SubscriptionID = monthly.ID
	lifetime := polarPaidOrder("player", "lifetime-product", now)
	cases := []struct {
		name     string
		customer polarCustomerState
		orders   []polarOrder
		plan     string
		fail     bool
	}{
		{"lifetime", baseCustomer, []polarOrder{lifetime}, "lifetime", false},
		{"monthly", polarCustomerState{baseCustomer.polarCustomer, []polarSubscription{monthly}}, []polarOrder{monthlyOrder}, "monthly", false},
		{"active but unpaid", polarCustomerState{baseCustomer.polarCustomer, []polarSubscription{monthly}}, nil, "", false},
		{"revoked monthly", baseCustomer, []polarOrder{monthlyOrder}, "", false},
		{"mismatched customer", polarCustomerState{polarCustomer: polarCustomer{ID: "customer", ExternalID: "someone-else"}}, []polarOrder{lifetime}, "", true},
	}
	refunded := lifetime
	refunded.Status, refunded.RefundedAmount = "refunded", 2999
	cases = append(cases, struct {
		name     string
		customer polarCustomerState
		orders   []polarOrder
		plan     string
		fail     bool
	}{"refunded lifetime", baseCustomer, []polarOrder{refunded}, "", false})
	partial := lifetime
	partial.RefundedAmount = 1
	cases = append(cases, struct {
		name     string
		customer polarCustomerState
		orders   []polarOrder
		plan     string
		fail     bool
	}{"partial refund", baseCustomer, []polarOrder{partial}, "", false})
	wrongProduct := lifetime
	wrongProduct.ProductID = "unrelated-product"
	cases = append(cases, struct {
		name     string
		customer polarCustomerState
		orders   []polarOrder
		plan     string
		fail     bool
	}{"unrelated product", baseCustomer, []polarOrder{wrongProduct}, "", false})
	wrongCurrency := lifetime
	wrongCurrency.Currency = "usd"
	cases = append(cases, struct {
		name     string
		customer polarCustomerState
		orders   []polarOrder
		plan     string
		fail     bool
	}{"wrong currency", baseCustomer, []polarOrder{wrongCurrency}, "", false})
	wrongAccount := lifetime
	wrongAccount.Customer.ExternalID = "different-player"
	cases = append(cases, struct {
		name     string
		customer polarCustomerState
		orders   []polarOrder
		plan     string
		fail     bool
	}{"other account order", baseCustomer, []polarOrder{wrongAccount}, "", false})
	wrongPrice := lifetime
	wrongPrice.NetAmount = 0
	cases = append(cases, struct {
		name     string
		customer polarCustomerState
		orders   []polarOrder
		plan     string
		fail     bool
	}{"unpaid zero net", baseCustomer, []polarOrder{wrongPrice}, "", false})
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			p := testPolar(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.Header.Get("Authorization") != "Bearer test-secret-token" || r.Header.Get("Polar-Version") != polarAPIVersion {
					t.Error("server authentication/version missing")
				}
				switch r.URL.Path {
				case "/v1/customers/external/player/state":
					writeJSON(w, 200, tc.customer)
				case "/v1/orders/":
					if r.URL.Query().Get("external_customer_id") != "player" || len(r.URL.Query()["product_id"]) != 2 {
						t.Error("orders must use external identity and allowlisted products")
					}
					writeJSON(w, 200, map[string]any{"items": tc.orders, "pagination": map[string]int{"max_page": 1}})
				default:
					t.Errorf("unexpected path %s", r.URL.Path)
					w.WriteHeader(404)
				}
			}))
			state, err := p.snapshot(context.Background(), "player", now)
			if tc.fail {
				if err == nil {
					t.Fatal("identity mismatch should fail")
				}
				return
			}
			if err != nil || state.Plan != tc.plan {
				t.Fatalf("snapshot=%+v error=%v want plan=%s", state, err, tc.plan)
			}
			if tc.plan == "monthly" && !state.PaidUntil.Equal(monthly.CurrentPeriodEnd) {
				t.Fatal("subscription does not expire at its paid period end")
			}
		})
	}
}

func TestPolarInclusiveVATAndCancellationAtPaidPeriodEnd(t *testing.T) {
	now := time.Date(2026, 10, 14, 12, 0, 0, 0, time.UTC)
	end := now.Add(20 * 24 * time.Hour)
	monthly := polarSubscription{ID: "subscription", ProductID: "monthly-product", Status: "active", Currency: "eur", Amount: 299, RecurringInterval: "month", CurrentPeriodStart: now.Add(-10 * 24 * time.Hour), CurrentPeriodEnd: end, CancelAtPeriodEnd: true, EndsAt: &end}
	for _, plan := range []string{"lifetime", "monthly"} {
		t.Run(plan, func(t *testing.T) {
			order := polarPaidOrder("player", plan+"-product", now)
			customer := polarCustomerState{polarCustomer: polarCustomer{ID: "customer", ExternalID: "player"}}
			order.SubtotalAmount, order.NetAmount, order.TaxAmount, order.TotalAmount = 2520, 2520, 479, 2999
			if plan == "monthly" {
				order.SubscriptionID, order.CreatedAt = monthly.ID, monthly.CurrentPeriodStart
				order.SubtotalAmount, order.NetAmount, order.TaxAmount, order.TotalAmount = 251, 251, 48, 299
				customer.ActiveSubscriptions = []polarSubscription{monthly}
			}
			p := testPolar(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if strings.Contains(r.URL.Path, "/state") {
					writeJSON(w, 200, customer)
					return
				}
				writeJSON(w, 200, map[string]any{"items": []polarOrder{order}, "pagination": map[string]int{"max_page": 1}})
			}))
			state, err := p.snapshot(context.Background(), "player", now)
			if err != nil || state.Plan != plan {
				t.Fatalf("VAT-inclusive %s denied: %+v %v", plan, state, err)
			}
			if plan == "monthly" {
				app := testApp(t)
				app.billing = p
				account := Account{Email: "ada@example.com", Billing: state}
				if !app.hasPaidAccess(account, now) || app.hasPaidAccess(account, end) {
					t.Fatal("cancellation must preserve access only through paid period")
				}
				customer.ActiveSubscriptions[0].Status = "canceled"
				revoked, err := p.snapshot(context.Background(), "player", now)
				if err != nil || revoked.Plan != "" {
					t.Fatal("immediately revoked subscription retained access")
				}
			}
		})
	}
}

func TestPolarOrdersPaginationAndSubscriptionExpiry(t *testing.T) {
	now := time.Date(2026, 10, 14, 12, 0, 0, 0, time.UTC)
	p := testPolar(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.Contains(r.URL.Path, "/state") {
			writeJSON(w, 200, polarCustomerState{polarCustomer: polarCustomer{ID: "customer", ExternalID: "player"}})
			return
		}
		orders := []polarOrder{}
		if r.URL.Query().Get("page") == "2" {
			orders = append(orders, polarPaidOrder("player", "lifetime-product", now))
		}
		writeJSON(w, 200, map[string]any{"items": orders, "pagination": map[string]int{"max_page": 2}})
	}))
	state, err := p.snapshot(context.Background(), "player", now)
	if err != nil || state.Plan != "lifetime" {
		t.Fatalf("pagination missed paid order: %+v %v", state, err)
	}
	app := testApp(t)
	app.billing = p
	account := Account{Email: "player@example.com", Billing: BillingState{CustomerID: "customer", Plan: "monthly", SubscriptionID: "subscription", PaidUntil: now, VerifiedAt: now}}
	if app.hasPaidAccess(account, now) {
		t.Fatal("monthly access persists at expired period boundary")
	}
	account.Billing = state
	if !app.hasPaidAccess(account, now) || app.hasPaidAccess(account, now.Add(25*time.Hour)) {
		t.Fatal("cached entitlement freshness is not bounded")
	}
	account.Email = ""
	if app.hasPaidAccess(account, now) {
		t.Fatal("guest cannot obtain paid account access")
	}
}

func signedPolarWebhook(t *testing.T, secret string, legacy bool, id string, now time.Time, body []byte) *http.Request {
	t.Helper()
	key := []byte(secret)
	if !legacy {
		var err error
		key, err = base64.StdEncoding.DecodeString(strings.TrimPrefix(secret, "whsec_"))
		if err != nil {
			t.Fatal(err)
		}
	}
	stamp := strconv.FormatInt(now.Unix(), 10)
	mac := hmac.New(sha256.New, key)
	mac.Write(append([]byte(id+"."+stamp+"."), body...))
	r := httptest.NewRequest("POST", "/api/billing/webhook", bytes.NewReader(body))
	r.Header.Set("Webhook-Id", id)
	r.Header.Set("Webhook-Timestamp", stamp)
	r.Header.Set("Webhook-Signature", "v1,"+base64.StdEncoding.EncodeToString(mac.Sum(nil)))
	return r
}

func TestPolarWebhookSignaturesTamperingReplayAndRotation(t *testing.T) {
	secret := testPolar(nil).webhookSecret
	now := time.Date(2026, 10, 14, 12, 0, 0, 0, time.UTC)
	body := []byte(`{"type":"customer.state_changed","data":{"external_id":"player"}}`)
	for _, legacy := range []bool{false, true} {
		r := signedPolarWebhook(t, secret, legacy, "event", now, body)
		if !verifyPolarWebhook(secret, r.Header, body, now) {
			t.Fatalf("valid signature rejected legacy=%v", legacy)
		}
		if verifyPolarWebhook(secret, r.Header, append(body, ' '), now) {
			t.Fatal("tampered body accepted")
		}
		if verifyPolarWebhook(secret, r.Header, body, now.Add(6*time.Minute)) {
			t.Fatal("old replay accepted")
		}
		if verifyPolarWebhook(secret, r.Header, body, now.Add(-6*time.Minute)) {
			t.Fatal("future timestamp accepted")
		}
		r.Header.Set("Webhook-Signature", "v1,aW52YWxpZA== "+r.Header.Get("Webhook-Signature"))
		if !verifyPolarWebhook(secret, r.Header, body, now) {
			t.Fatal("valid rotation signature rejected")
		}
		r.Header.Set("Webhook-Id", "changed-event")
		if verifyPolarWebhook(secret, r.Header, body, now) {
			t.Fatal("tampered event id accepted")
		}
	}
}

func TestPolarCheckoutBindsAccountAndAllowlistsPlan(t *testing.T) {
	app := testApp(t)
	token, player := createSession(t, app, "Paid Ada")
	checkoutCalls := 0
	app.billing = testPolar(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/v1/customers/external/" + player.ID + "/state":
			w.WriteHeader(404)
		case "/v1/checkouts/":
			checkoutCalls++
			var input map[string]any
			if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
				t.Fatal(err)
			}
			products, ok := input["products"].([]any)
			if !ok || len(products) != 1 || products[0] != "monthly-product" || input["external_customer_id"] != player.ID || input["customer_email"] != "ada@example.com" {
				t.Errorf("untrusted checkout identity/product: %#v", input)
			}
			if input["allow_trial"] != false || input["allow_discount_codes"] != false {
				t.Error("checkout unexpectedly permits trials/discounts")
			}
			if input["success_url"] != "https://game.example/?billing=success&checkout_id={CHECKOUT_ID}" {
				t.Error("unexpected return URL")
			}
			writeJSON(w, 201, map[string]string{"url": "https://polar.sh/checkout/session"})
		default:
			t.Errorf("unexpected path %s", r.URL.Path)
			w.WriteHeader(404)
		}
	}))
	if r := request(app, "POST", "/api/billing/checkout", token, map[string]string{"plan": "monthly"}); r.Code != 401 {
		t.Fatalf("anonymous checkout: %d", r.Code)
	}
	if err := app.store.SetCredentials(context.Background(), tokenHash(token), "ada@example.com", "encoded"); err != nil {
		t.Fatal(err)
	}
	if r := request(app, "POST", "/api/billing/checkout", token, map[string]string{"plan": "attacker-product"}); r.Code != 400 {
		t.Fatalf("unallowlisted checkout: %d", r.Code)
	}
	r := request(app, "POST", "/api/billing/checkout", token, map[string]string{"plan": "monthly", "email": "attacker@example.com", "customerId": "victim"})
	if r.Code != 200 || checkoutCalls != 1 {
		t.Fatalf("checkout failed: %d %s", r.Code, r.Body.String())
	}
	account, err := app.store.Get(context.Background(), tokenHash(token))
	if err != nil || app.hasPaidAccess(account, app.now()) {
		t.Fatal("creating checkout granted access")
	}
}

func TestPolarWebhookReconciliationRefundAndDuplicatePersist(t *testing.T) {
	store, err := NewJSONStore(filepath.Join(t.TempDir(), "state.json"))
	if err != nil {
		t.Fatal(err)
	}
	app := NewApp(store, testCurriculum(), nil, 10)
	t.Cleanup(app.Close)
	now := time.Date(2026, 10, 14, 12, 0, 0, 0, time.UTC)
	app.now = func() time.Time { return now }
	token, player := createSession(t, app, "Refund Ada")
	if err = store.SetCredentials(context.Background(), tokenHash(token), "refund@example.com", "encoded"); err != nil {
		t.Fatal(err)
	}
	order := polarPaidOrder(player.ID, "lifetime-product", now)
	requests := 0
	app.billing = testPolar(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests++
		if strings.Contains(r.URL.Path, "/state") {
			writeJSON(w, 200, polarCustomerState{polarCustomer: polarCustomer{ID: "customer", ExternalID: player.ID}})
			return
		}
		writeJSON(w, 200, map[string]any{"items": []polarOrder{order}, "pagination": map[string]int{"max_page": 1}})
	}))
	// The payload lies about subscription data; only the current API snapshot wins.
	deliver := func(id string) int {
		body, _ := json.Marshal(map[string]any{"type": "order.paid", "data": map[string]any{"customer": map[string]string{"external_id": player.ID}, "status": "paid"}})
		r := signedPolarWebhook(t, app.billing.webhookSecret, false, id, now, body)
		w := httptest.NewRecorder()
		app.Handler().ServeHTTP(w, r)
		return w.Code
	}
	if code := deliver("payment-event"); code != 202 {
		t.Fatalf("webhook failed: %d", code)
	}
	account, err := store.Get(context.Background(), tokenHash(token))
	if err != nil || !app.hasPaidAccess(account, now) {
		t.Fatal("paid lifetime not granted")
	}
	requestCount := requests
	if code := deliver("payment-event"); code != 202 || requests != requestCount {
		t.Fatal("duplicate webhook was not idempotent")
	}
	order.Status, order.RefundedAmount = "refunded", 2999
	if code := deliver("refund-event"); code != 202 {
		t.Fatalf("refund webhook failed: %d", code)
	}
	account, _ = store.Get(context.Background(), tokenHash(token))
	if app.hasPaidAccess(account, now) {
		t.Fatal("refund did not revoke lifetime")
	}
	// A delayed payment event still sees the refunded authoritative order.
	if code := deliver("delayed-payment-event"); code != 202 {
		t.Fatalf("delayed event failed: %d", code)
	}
	account, _ = store.Get(context.Background(), tokenHash(token))
	if app.hasPaidAccess(account, now) {
		t.Fatal("out-of-order payment re-granted refunded access")
	}
	reopened, err := NewJSONStore(store.path)
	if err != nil {
		t.Fatal(err)
	}
	restored, err := reopened.GetAccountByID(context.Background(), player.ID)
	if err != nil || restored.Billing.Plan != "" || len(restored.Billing.WebhookReceipts) != 3 {
		t.Fatalf("reconciliation/dedup did not persist: %+v %v", restored.Billing, err)
	}
}

func TestPolarSyncAndPortalUseMatchingServerCustomer(t *testing.T) {
	app := testApp(t)
	token, player := createSession(t, app, "Portal Ada")
	if err := app.store.SetCredentials(context.Background(), tokenHash(token), "portal@example.com", "encoded"); err != nil {
		t.Fatal(err)
	}
	app.billing = testPolar(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/v1/customers/external/" + player.ID + "/state":
			writeJSON(w, 200, polarCustomerState{polarCustomer: polarCustomer{ID: "customer", ExternalID: player.ID}})
		case "/v1/orders/":
			writeJSON(w, 200, map[string]any{"items": []polarOrder{polarPaidOrder(player.ID, "lifetime-product", app.now())}, "pagination": map[string]int{"max_page": 1}})
		case "/v1/customer-sessions/":
			var input map[string]string
			json.NewDecoder(r.Body).Decode(&input)
			if input["customer_id"] != "customer" {
				t.Error("portal trusted browser customer identity")
			}
			writeJSON(w, 201, map[string]string{"customer_portal_url": "https://polar.sh/customer-portal/session"})
		default:
			w.WriteHeader(404)
		}
	}))
	w := request(app, "POST", "/api/billing/sync", token, map[string]string{"checkout_id": "fake-success"})
	var response struct {
		Access AccessStatus `json:"access"`
	}
	json.Unmarshal(w.Body.Bytes(), &response)
	if w.Code != 200 || response.Access.Phase != "paid" || response.Access.Plan != "lifetime" {
		t.Fatalf("sync failed: %d %s", w.Code, w.Body.String())
	}
	if w = request(app, "POST", "/api/billing/portal", token, map[string]string{"customer_id": "victim"}); w.Code != 200 {
		t.Fatalf("portal failed: %d %s", w.Code, w.Body.String())
	}
	if w = request(app, "POST", "/api/billing/checkout", token, map[string]string{"plan": "monthly"}); w.Code != 409 {
		t.Fatalf("paid account could subscribe twice: %d", w.Code)
	}
}

func TestPolarExpiredMonthlyCacheRefreshesRenewalImmediately(t *testing.T) {
	app := testApp(t)
	now := time.Date(2026, 10, 14, 12, 0, 0, 0, time.UTC)
	app.now = func() time.Time { return now }
	token, player := createSession(t, app, "Renewal Ada")
	if err := app.store.SetCredentials(context.Background(), tokenHash(token), "renewal@example.com", "encoded"); err != nil {
		t.Fatal(err)
	}
	_, err := app.store.UpdateAccount(context.Background(), tokenHash(token), func(account *Account) error {
		account.Access.PlayedNanoseconds = int64(trialPlayLimit)
		account.Billing = BillingState{CustomerID: "customer", Plan: "monthly", SubscriptionID: "subscription", PaidUntil: now, VerifiedAt: now.Add(-time.Second)}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	end := now.Add(30 * 24 * time.Hour)
	app.billing = testPolar(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.Contains(r.URL.Path, "/state") {
			writeJSON(w, 200, polarCustomerState{polarCustomer: polarCustomer{ID: "customer", ExternalID: player.ID}, ActiveSubscriptions: []polarSubscription{{ID: "subscription", ProductID: "monthly-product", Status: "active", Currency: "eur", RecurringInterval: "month", CurrentPeriodStart: now, CurrentPeriodEnd: end}}})
			return
		}
		order := polarPaidOrder(player.ID, "monthly-product", now)
		order.SubscriptionID = "subscription"
		writeJSON(w, 200, map[string]any{"items": []polarOrder{order}, "pagination": map[string]int{"max_page": 1}})
	}))
	w := request(app, "GET", "/api/access", token, nil)
	var response struct {
		Access AccessStatus `json:"access"`
	}
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &response) != nil || response.Access.Phase != "paid" {
		t.Fatalf("renewed subscription falsely hit a wall: %d %s", w.Code, w.Body.String())
	}
	if w = request(app, "GET", "/api/progress", token, nil); w.Code != 200 {
		t.Fatalf("paid renewal could not play: %d %s", w.Code, w.Body.String())
	}
	account, _ := app.store.Get(context.Background(), tokenHash(token))
	if !account.Billing.PaidUntil.Equal(end) {
		t.Fatal("renewal verification did not persist")
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

func TestPostgresBillingReconciliationPersistsRollbackAndRefund(t *testing.T) {
	databaseURL := os.Getenv("TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("set TEST_DATABASE_URL to a disposable PostgreSQL database")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	store, err := NewPGStore(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	app := NewApp(store, testCurriculum(), nil, 10)
	now := time.Date(2026, 10, 14, 12, 0, 0, 0, time.UTC)
	app.now = func() time.Time { return now }
	token, player := createSession(t, app, "PG Billing Ada")
	t.Cleanup(func() {
		cleanupCtx, done := context.WithTimeout(context.Background(), 5*time.Second)
		defer done()
		_, _ = store.pool.Exec(cleanupCtx, "DELETE FROM learning_events WHERE account_id=$1", player.ID)
		_, _ = store.pool.Exec(cleanupCtx, "DELETE FROM sessions WHERE account_id=$1", player.ID)
		_, _ = store.pool.Exec(cleanupCtx, "DELETE FROM accounts WHERE id=$1", player.ID)
		app.Close()
	})
	if err = store.SetCredentials(ctx, tokenHash(token), "pg-billing-"+player.ID+"@example.com", "encoded"); err != nil {
		t.Fatal(err)
	}
	if _, err = store.UpdateAccount(ctx, tokenHash(token), func(account *Account) error { account.Access.PlayedNanoseconds = int64(trialPlayLimit); return nil }); err != nil {
		t.Fatal(err)
	}
	failure := errors.New("failed authoritative reconciliation")
	if _, err = store.UpdateAccountByID(ctx, player.ID, func(account *Account) error {
		account.Billing = BillingState{Plan: "lifetime", CustomerID: "customer", LifetimeOrderID: "uncommitted-order", VerifiedAt: now}
		return failure
	}); !errors.Is(err, failure) {
		t.Fatalf("failed reconciliation did not roll back: %v", err)
	}
	account, err := store.GetAccountByID(ctx, player.ID)
	if err != nil || account.Billing.Plan != "" || account.Billing.LifetimeOrderID != "" {
		t.Fatalf("failed callback granted persisted access: %+v %v", account.Billing, err)
	}
	order := polarPaidOrder(player.ID, "lifetime-product", now)
	order.SubtotalAmount, order.NetAmount, order.TaxAmount, order.TotalAmount = 2520, 2520, 479, 2999
	app.billing = testPolar(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer test-secret-token" {
			t.Error("reconciliation was not authenticated")
		}
		if strings.Contains(r.URL.Path, "/state") {
			writeJSON(w, 200, polarCustomerState{polarCustomer: polarCustomer{ID: "customer", ExternalID: player.ID}})
			return
		}
		writeJSON(w, 200, map[string]any{"items": []polarOrder{order}, "pagination": map[string]int{"max_page": 1}})
	}))
	deliver := func(target *App, id string) {
		t.Helper()
		body, _ := json.Marshal(map[string]any{"type": "order.updated", "data": map[string]any{"customer": map[string]string{"external_id": player.ID}}})
		r := signedPolarWebhook(t, target.billing.webhookSecret, false, id, now, body)
		w := httptest.NewRecorder()
		target.Handler().ServeHTTP(w, r)
		if w.Code != 202 {
			t.Fatalf("PostgreSQL webhook: %d %s", w.Code, w.Body.String())
		}
	}
	deliver(app, "pg-paid-event")
	paid, err := store.Get(ctx, tokenHash(token))
	if err != nil || !app.hasPaidAccess(paid, now) || paid.Billing.WebhookReceipts["pg-paid-event"].IsZero() {
		t.Fatalf("paid entitlement/receipt not committed: %+v %v", paid.Billing, err)
	}
	if _, err = store.UpdateAccountByID(ctx, player.ID, func(account *Account) error {
		account.Billing.Plan, account.Billing.LifetimeOrderID = "monthly", ""
		account.Billing.WebhookReceipts["uncommitted-event"] = now
		return failure
	}); !errors.Is(err, failure) {
		t.Fatalf("failed update changed existing entitlement: %v", err)
	}
	rolledBack, err := store.GetAccountByID(ctx, player.ID)
	if err != nil || !reflect.DeepEqual(rolledBack.Billing, paid.Billing) {
		t.Fatalf("failed callback changed paid state: %+v %v", rolledBack.Billing, err)
	}
	// A new connection/application has no in-memory billing state to fall back on.
	reopened, err := NewPGStore(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	restoredApp := NewApp(reopened, testCurriculum(), nil, 10)
	t.Cleanup(restoredApp.Close)
	restoredApp.billing, restoredApp.now = app.billing, app.now
	restored, err := reopened.GetAccountByID(ctx, player.ID)
	if err != nil || !reflect.DeepEqual(restored.Billing, paid.Billing) || !restoredApp.hasPaidAccess(restored, now) {
		t.Fatalf("reopened PostgreSQL lost billing state: %+v %v", restored.Billing, err)
	}
	order.Status, order.RefundedAmount = "refunded", order.NetAmount
	deliver(restoredApp, "pg-refund-event")
	// Replaying the earlier paid event after reopening cannot resurrect access.
	deliver(restoredApp, "pg-paid-event")
	refunded, err := store.Get(ctx, tokenHash(token))
	if err != nil || app.hasPaidAccess(refunded, now) || refunded.Billing.Plan != "" || len(refunded.Billing.WebhookReceipts) != 2 {
		t.Fatalf("refund/dedup state not persisted: %+v %v", refunded.Billing, err)
	}
	if status := restoredApp.accessState(refunded, now); status.Phase != "payment_required" {
		t.Fatalf("refunded account bypassed paywall: %+v", status)
	}
}

func copyWebhookReceipts(receipts map[string]time.Time) map[string]time.Time {
	out := map[string]time.Time{}
	for k, v := range receipts {
		out[k] = v
	}
	return out
}

func TestPolarEnvironmentValidation(t *testing.T) {
	for _, key := range []string{"POLAR_ACCESS_TOKEN", "POLAR_WEBHOOK_SECRET", "POLAR_MONTHLY_PRODUCT_ID", "POLAR_LIFETIME_PRODUCT_ID", "POLAR_SERVER", "PUBLIC_URL"} {
		t.Setenv(key, "")
	}
	t.Setenv("POLAR_MONTHLY_PRODUCT_ID", "monthly")
	t.Setenv("POLAR_LIFETIME_PRODUCT_ID", "lifetime")
	if config, err := polarBillingFromEnv(); err != nil || config != nil {
		t.Fatal("public product defaults should not enable billing")
	}
	t.Setenv("POLAR_ACCESS_TOKEN", "test-token")
	if _, err := polarBillingFromEnv(); err == nil {
		t.Fatal("partial credential config accepted")
	}
	t.Setenv("POLAR_WEBHOOK_SECRET", testPolar(nil).webhookSecret)
	t.Setenv("PUBLIC_URL", "http://game.example")
	if _, err := polarBillingFromEnv(); err == nil {
		t.Fatal("insecure production return URL accepted")
	}
	t.Setenv("PUBLIC_URL", "https://game.example")
	config, err := polarBillingFromEnv()
	if err != nil || config.baseURL != "https://api.polar.sh" {
		t.Fatalf("production config rejected: %v", err)
	}
	t.Setenv("POLAR_SERVER", "sandbox")
	t.Setenv("PUBLIC_URL", "http://localhost:5187")
	config, err = polarBillingFromEnv()
	if err != nil || config.baseURL != "https://sandbox-api.polar.sh" {
		t.Fatalf("sandbox config rejected: %v", err)
	}
}
