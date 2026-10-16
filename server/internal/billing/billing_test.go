package billing_test

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"glotworld/server/internal/billing"
	"glotworld/server/internal/billing/billingtest"
)

func signedCreemEvent(secret string, body []byte) *http.Request {
	r := httptest.NewRequest("POST", "/api/billing/webhook", strings.NewReader(string(body)))
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(body)
	r.Header.Set("Creem-Signature", hex.EncodeToString(mac.Sum(nil)))
	return r
}

func TestCreemEntitlementsRequireBoundCheckoutAndPaidTransactions(t *testing.T) {
	now := time.Date(2026, 10, 14, 12, 0, 0, 0, time.UTC)
	cases := []struct {
		name, plan, want string
		change           func(*billingtest.Fixture)
		fail             bool
	}{
		{"lifetime", "lifetime", "lifetime", nil, false}, {"monthly", "monthly", "monthly", nil, false}, {"yearly", "yearly", "yearly", nil, false},
		{"expired yearly", "yearly", "", func(f *billingtest.Fixture) { f.Subscription.CurrentPeriodEnd = now }, false},
		{"refunded yearly", "yearly", "", func(f *billingtest.Fixture) { f.Transaction.RefundedAmount = 999 }, false},
		{"pending checkout", "lifetime", "", func(f *billingtest.Fixture) { f.Checkout.Status = "pending" }, false},
		{"other account", "lifetime", "", func(f *billingtest.Fixture) { f.Checkout.Metadata["account_id"] = "other" }, false},
		{"wrong reference", "lifetime", "", func(f *billingtest.Fixture) { f.Checkout.Metadata["billing_reference"] = "other" }, false},
		{"different request", "lifetime", "", func(f *billingtest.Fixture) { f.Checkout.RequestID = "other" }, false},
		{"different product", "lifetime", "", func(f *billingtest.Fixture) { f.Checkout.Product.ID = "other" }, false},
		{"test checkout in production", "lifetime", "", func(f *billingtest.Fixture) { f.Checkout.Mode = "test" }, false},
		{"refunded", "lifetime", "", func(f *billingtest.Fixture) { f.Transaction.Status = "refunded"; f.Transaction.RefundedAmount = 2999 }, false},
		{"partial refund", "lifetime", "", func(f *billingtest.Fixture) { f.Transaction.RefundedAmount = 1 }, false},
		{"disputed", "lifetime", "", func(f *billingtest.Fixture) { f.Transaction.Status = "chargeback" }, false},
		{"wrong currency", "lifetime", "", func(f *billingtest.Fixture) { f.Transaction.Currency = "USD" }, false},
		{"zero paid", "lifetime", "", func(f *billingtest.Fixture) { f.Transaction.AmountPaid = 0 }, false},
		{"different payer", "lifetime", "", func(f *billingtest.Fixture) { f.Transaction.Customer.ID = "other" }, false},
		{"different order", "lifetime", "", func(f *billingtest.Fixture) { f.Transaction.Order.ID = "other" }, false},
		{"test payment in production", "lifetime", "", func(f *billingtest.Fixture) { f.Transaction.Mode = "test" }, false},
		{"scheduled cancellation", "monthly", "monthly", func(f *billingtest.Fixture) { f.Subscription.Status = "scheduled_cancel" }, false},
		{"canceled paid period", "monthly", "monthly", func(f *billingtest.Fixture) { f.Subscription.Status = "canceled" }, false},
		{"unpaid monthly", "monthly", "", func(f *billingtest.Fixture) { f.Subscription.Status = "unpaid" }, false},
		{"trial never paid", "monthly", "", func(f *billingtest.Fixture) { f.Subscription.Status = "trialing" }, false},
		{"expired monthly", "monthly", "", func(f *billingtest.Fixture) { f.Subscription.CurrentPeriodEnd = now }, false},
		{"future period", "monthly", "", func(f *billingtest.Fixture) { f.Subscription.CurrentPeriodStart = now.Add(time.Hour) }, false},
		{"stale renewal payment", "monthly", "", func(f *billingtest.Fixture) {
			f.Transaction.CreatedAt = now.Add(-31 * 24 * time.Hour).UnixMilli()
			f.Transaction.PeriodEnd = now.Add(-time.Hour).UnixMilli()
		}, false},
		{"wrong subscription", "monthly", "", func(f *billingtest.Fixture) { f.Transaction.Subscription.ID = "other" }, false},
		{"wrong subscription product", "monthly", "", func(f *billingtest.Fixture) { f.Subscription.Product.ID = "other" }, false},
		{"provider outage", "monthly", "", func(f *billingtest.Fixture) { f.Fail = true }, true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			f := billingtest.NewFixture("player", tc.plan, now)
			state := f.State()
			if tc.change != nil {
				tc.change(f)
			}
			p := billingtest.NewClient(http.HandlerFunc(f.Serve))
			got, err := p.Snapshot(context.Background(), "player", state, now)
			if (err != nil) != tc.fail || got.Plan != tc.want {
				t.Fatalf("snapshot=%+v err=%v", got, err)
			}
			if (got.Plan == "monthly" || got.Plan == "yearly") && !got.PaidUntil.Equal(f.Subscription.CurrentPeriodEnd) {
				t.Fatal("wrong expiry")
			}
		})
	}
}

func TestCreemSnapshotDropsDeadCheckoutsWithoutBlockingPaidOnes(t *testing.T) {
	now := time.Date(2026, 10, 14, 12, 0, 0, 0, time.UTC)
	f := billingtest.NewFixture("player", "lifetime", now)
	state := f.State()
	paid, err := billingtest.NewClient(http.HandlerFunc(f.Serve)).Snapshot(context.Background(), "player", state, now)
	if err != nil || paid.Plan != "lifetime" {
		t.Fatal(paid, err)
	}
	// Abandoned checkouts: one Creem no longer knows, one unpaid for over a day,
	// one unpaid and recent. Only the recent one is kept; none blocks access.
	paid.Purchases = append(paid.Purchases,
		billing.Purchase{CheckoutID: "gone", RequestID: "r1", ProductID: "monthly-product", CreatedAt: now.Add(-time.Hour)},
		billing.Purchase{CheckoutID: "stale", RequestID: "r2", ProductID: "monthly-product", CreatedAt: now.Add(-25 * time.Hour)},
		billing.Purchase{CheckoutID: "recent", RequestID: "r3", ProductID: "monthly-product", CreatedAt: now.Add(-time.Hour)})
	p := billingtest.NewClient(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := r.URL.Query().Get("checkout_id")
		if r.URL.Path != "/v1/checkouts" || id == "checkout" {
			f.Serve(w, r)
			return
		}
		if id == "gone" {
			w.WriteHeader(404)
			return
		}
		checkout := f.Checkout
		checkout.ID, checkout.Status, checkout.Product.ID = id, "pending", "monthly-product"
		checkout.RequestID = map[string]string{"stale": "r2", "recent": "r3"}[id]
		_ = json.NewEncoder(w).Encode(checkout)
	}))
	got, err := p.Snapshot(context.Background(), "player", paid, now)
	if err != nil || got.Plan != "lifetime" || len(got.Purchases) != 2 || got.Purchases[1].CheckoutID != "recent" {
		t.Fatalf("snapshot=%+v err=%v", got, err)
	}
}

func TestCreemPurchasesKeepTheirPlanWhenProductIDsChange(t *testing.T) {
	now := time.Date(2026, 10, 14, 12, 0, 0, 0, time.UTC)
	for _, plan := range []string{"lifetime", "monthly"} {
		f := billingtest.NewFixture("player", plan, now)
		p := billingtest.NewClient(http.HandlerFunc(f.Serve))
		// A purchase recorded before plans were stored learns its plan once.
		first, err := p.Snapshot(context.Background(), "player", f.State(), now)
		if err != nil || first.Plan != plan || first.Purchases[0].Plan != plan {
			t.Fatal(first, err)
		}
		p.LifetimeProduct, p.MonthlyProduct = "new-lifetime", "new-monthly"
		got, err := p.Snapshot(context.Background(), "player", first, now)
		if err != nil || got.Plan != plan {
			t.Fatalf("%s: a product ID change revoked a purchase: %+v %v", plan, got, err)
		}
	}
}

func TestCreemDisputesAndDoubleChargesAreVisible(t *testing.T) {
	now := time.Date(2026, 10, 14, 12, 0, 0, 0, time.UTC)
	f := billingtest.NewFixture("player", "lifetime", now)
	p := billingtest.NewClient(http.HandlerFunc(f.Serve))
	state := f.State()
	state.DisputedTransactions = []string{"transaction"}
	if got, err := p.Snapshot(context.Background(), "player", state, now); err != nil || got.Plan != "" || len(got.DisputedTransactions) != 1 {
		t.Fatal("a disputed payment granted access", got, err)
	}
	state = f.State()
	state.Purchases = append(state.Purchases, state.Purchases[0])
	if got, err := p.Snapshot(context.Background(), "player", state, now); err != nil || got.Plan != "lifetime" || got.OverlappingPurchases != 1 {
		t.Fatal("double charge not reported", got, err)
	}
}

func TestCreemOffersReadPricesAndRetryAfterFailure(t *testing.T) {
	now := time.Date(2026, 10, 14, 12, 0, 0, 0, time.UTC)
	f := billingtest.NewFixture("player", "lifetime", now)
	p := billingtest.NewClient(http.HandlerFunc(f.Serve))
	p.YearlyProduct = ""
	offers := p.Offers(context.Background(), now)
	if len(offers) != 2 || offers[0].Plan != "monthly" || offers[0].Amount != 299 || offers[0].Currency != "EUR" || offers[1].Plan != "lifetime" || offers[1].Amount != 2999 {
		t.Fatalf("offers=%+v", offers)
	}
	calls := f.Calls
	p.Offers(context.Background(), now.Add(30*time.Minute))
	if f.Calls != calls {
		t.Fatal("prices were not cached")
	}
	f.Fail = true
	offers = p.Offers(context.Background(), now.Add(2*time.Hour))
	if len(offers) != 2 || offers[0].Amount != 0 {
		t.Fatalf("an outage must list plans without prices: %+v", offers)
	}
	f.Fail = false
	if offers = p.Offers(context.Background(), now.Add(2*time.Hour+2*time.Minute)); offers[0].Amount != 299 {
		t.Fatal("a failed price read was cached for too long")
	}
}

func TestCreemWebhookSignatureAndReferenceSerialization(t *testing.T) {
	secret := billingtest.NewClient(nil).WebhookSecret
	body := []byte(`{"id":"event"}`)
	r := signedCreemEvent(secret, body)
	if !billing.VerifyWebhook(secret, r.Header, body) || billing.VerifyWebhook(secret, r.Header, append(body, ' ')) {
		t.Fatal("signature verification failed")
	}
	for _, value := range []string{`"id"`, `{"id":"id"}`} {
		var ref billing.Ref
		if json.Unmarshal([]byte(value), &ref) != nil || ref.ID != "id" {
			t.Fatal("expanded reference failed")
		}
	}
	if billing.ValidURL("https://creem.io.evil.test/pay") || billing.ValidURL("https://user@creem.io/pay") || billing.ValidURL("http://creem.io/pay") || !billing.ValidURL("https://www.creem.io/payment/ch_123") {
		t.Fatal("unsafe payment URL")
	}
}

func TestCreemEnvironmentValidation(t *testing.T) {
	for _, key := range []string{"FREE_TO_PLAY", "CREEM_API_KEY", "CREEM_WEBHOOK_SECRET", "CREEM_MONTHLY_PRODUCT_ID", "CREEM_LIFETIME_PRODUCT_ID", "CREEM_YEARLY_PRODUCT_ID", "CREEM_SERVER", "PUBLIC_URL"} {
		t.Setenv(key, "")
	}
	if cfg, err := billing.FromEnv(); err != nil || cfg != nil {
		t.Fatal("absent Creem configuration must enable free play", err)
	}
	t.Setenv("CREEM_MONTHLY_PRODUCT_ID", "monthly")
	t.Setenv("CREEM_LIFETIME_PRODUCT_ID", "lifetime")
	t.Setenv("CREEM_YEARLY_PRODUCT_ID", "yearly")
	if cfg, err := billing.FromEnv(); err != nil || cfg != nil {
		t.Fatal("empty billing must be disabled", err)
	}
	t.Setenv("CREEM_API_KEY", "key")
	if _, err := billing.FromEnv(); err == nil {
		t.Fatal("partial billing accepted")
	}
	t.Setenv("CREEM_WEBHOOK_SECRET", billingtest.NewClient(nil).WebhookSecret)
	t.Setenv("PUBLIC_URL", "http://game.example")
	if _, err := billing.FromEnv(); err == nil {
		t.Fatal("insecure public URL allowed")
	}
	t.Setenv("PUBLIC_URL", "https://game.example")
	cfg, err := billing.FromEnv()
	if err != nil || cfg.BaseURL != "https://api.creem.io" {
		t.Fatal(err)
	}
	t.Setenv("CREEM_YEARLY_PRODUCT_ID", "")
	if cfg, err = billing.FromEnv(); err != nil || cfg.YearlyProduct != "" || !cfg.Available() {
		t.Fatal("the yearly plan must be optional", err)
	}
	t.Setenv("CREEM_YEARLY_PRODUCT_ID", "monthly")
	if _, err = billing.FromEnv(); err == nil {
		t.Fatal("duplicate product IDs accepted")
	}
	t.Setenv("CREEM_YEARLY_PRODUCT_ID", "yearly")
	t.Setenv("CREEM_SERVER", "sandbox")
	t.Setenv("PUBLIC_URL", "http://localhost:5189")
	cfg, err = billing.FromEnv()
	if err != nil || cfg.BaseURL != "https://test-api.creem.io" {
		t.Fatal(err)
	}
	t.Setenv("FREE_TO_PLAY", "true")
	cfg, err = billing.FromEnv()
	if err != nil || cfg != nil {
		t.Fatal("free-to-play override must disable configured billing", err)
	}
	t.Setenv("CREEM_WEBHOOK_SECRET", "")
	if cfg, err = billing.FromEnv(); err != nil || cfg != nil {
		t.Fatal("free-to-play override must ignore incomplete Creem configuration", err)
	}
	t.Setenv("FREE_TO_PLAY", "false")
	if _, err = billing.FromEnv(); err == nil {
		t.Fatal("disabling free-to-play override must restore Creem validation")
	}
	t.Setenv("FREE_TO_PLAY", "invalid")
	if _, err = billing.FromEnv(); err == nil {
		t.Fatal("invalid free-to-play flag accepted")
	}
}
