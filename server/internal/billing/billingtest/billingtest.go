// Package billingtest provides a fake Creem API for tests of billing and of
// the HTTP handlers that use it.
package billingtest

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"time"

	"glotworld/server/internal/billing"
)

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

type transport struct{ handler http.Handler }

// RoundTrip serves requests in-process with the fake handler.
func (t transport) RoundTrip(r *http.Request) (*http.Response, error) {
	w := httptest.NewRecorder()
	t.handler.ServeHTTP(w, r)
	return w.Result(), nil
}

// NewClient returns a configured client whose requests reach handler.
func NewClient(handler http.Handler) *billing.Client {
	return &billing.Client{AccessToken: "test-secret-token", WebhookSecret: "test-webhook-secret-at-least-32-bytes", MonthlyProduct: "monthly-product", YearlyProduct: "yearly-product", LifetimeProduct: "lifetime-product", PublicURL: "https://game.example", BaseURL: "https://api.creem.io", HTTP: &http.Client{Transport: transport{handler}}}
}

// Fixture is a fake Creem account: one checkout, subscription and transaction
// that Serve answers for, plus switches to simulate an outage.
type Fixture struct {
	Now          time.Time
	Checkout     billing.Checkout
	Subscription billing.Subscription
	Transaction  billing.Transaction
	Fail         bool
	Calls        int
}

// NewFixture builds a paid purchase of plan for accountID at now.
func NewFixture(accountID, plan string, now time.Time) *Fixture {
	f := &Fixture{Now: now}
	f.Checkout.ID = "checkout"
	f.Checkout.Mode = "prod"
	f.Checkout.Status = "completed"
	f.Checkout.RequestID = "request"
	f.Checkout.Product.ID = plan + "-product"
	f.Checkout.Customer.ID = "customer"
	f.Checkout.Metadata = map[string]string{"account_id": accountID, "billing_reference": "reference"}
	f.Checkout.Order.ID = "order"
	f.Checkout.Order.Status = "paid"
	f.Checkout.Order.Currency = "EUR"
	f.Checkout.Order.Product.ID = f.Checkout.Product.ID
	f.Checkout.Order.Customer.ID = "customer"
	f.Checkout.Order.Transaction.ID = "transaction"
	f.Transaction = billing.Transaction{ID: "transaction", Mode: "prod", Status: "paid", Currency: "EUR", Type: "payment", AmountPaid: 2999, Customer: billing.Ref{ID: "customer"}, Order: billing.Ref{ID: "order"}, CreatedAt: now.UnixMilli()}
	if plan == "monthly" || plan == "yearly" {
		f.Checkout.Subscription.ID = "subscription"
		f.Transaction.Type = "invoice"
		f.Transaction.Subscription.ID = "subscription"
		f.Transaction.AmountPaid = 299
		f.Transaction.PeriodEnd = now.Add(30 * 24 * time.Hour).UnixMilli()
		f.Subscription = billing.Subscription{ID: "subscription", Mode: "prod", Product: billing.Ref{ID: plan + "-product"}, Customer: billing.Ref{ID: "customer"}, Status: "active", LastTransactionID: "transaction", CurrentPeriodStart: now.Add(-time.Hour), CurrentPeriodEnd: now.Add(30 * 24 * time.Hour)}
	}
	if plan == "yearly" {
		f.Transaction.AmountPaid = 999
		f.Subscription.CurrentPeriodEnd = now.AddDate(1, 0, 0)
		f.Transaction.PeriodEnd = f.Subscription.CurrentPeriodEnd.UnixMilli()
	}
	return f
}

// State is the purchase ledger an account holds before verification.
func (f *Fixture) State() billing.State {
	return billing.State{Reference: "reference", Purchases: []billing.Purchase{{CheckoutID: "checkout", RequestID: "request", ProductID: f.Checkout.Product.ID, CreatedAt: f.Now}}}
}

// Serve answers Creem API requests from the fixture.
func (f *Fixture) Serve(w http.ResponseWriter, r *http.Request) {
	f.Calls++
	if r.Header.Get("x-api-key") != "test-secret-token" || r.Header.Get("Authorization") != "" {
		w.WriteHeader(401)
		return
	}
	if f.Fail {
		w.WriteHeader(503)
		return
	}
	switch r.URL.Path {
	case "/v1/checkouts":
		if r.Method == "GET" {
			writeJSON(w, 200, f.Checkout)
		} else {
			w.WriteHeader(405)
		}
	case "/v1/subscriptions":
		writeJSON(w, 200, f.Subscription)
	case "/v1/transactions":
		writeJSON(w, 200, f.Transaction)
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
