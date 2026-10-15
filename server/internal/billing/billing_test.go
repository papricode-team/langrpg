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
		{"other account", "lifetime", "", func(f *billingtest.Fixture) { f.Checkout.Metadata["account_id"] = "other" }, true},
		{"wrong reference", "lifetime", "", func(f *billingtest.Fixture) { f.Checkout.Metadata["billing_reference"] = "other" }, true},
		{"different request", "lifetime", "", func(f *billingtest.Fixture) { f.Checkout.RequestID = "other" }, true},
		{"different product", "lifetime", "", func(f *billingtest.Fixture) { f.Checkout.Product.ID = "other" }, true},
		{"test checkout in production", "lifetime", "", func(f *billingtest.Fixture) { f.Checkout.Mode = "test" }, true},
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
		{"wrong subscription product", "monthly", "", func(f *billingtest.Fixture) { f.Subscription.Product.ID = "other" }, true},
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
