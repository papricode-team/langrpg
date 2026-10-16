// Package billing is the Creem client and the purchase-verification state
// machine. It holds no account storage: callers load a State, ask for a
// verified Snapshot, and persist it. Checkout redirects and browser input
// never write an entitlement.
package billing

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"
)

// RefreshInterval is how long a verified snapshot is reused before Creem is
// asked again; VerificationLifetime bounds access if Creem stays unreachable.
const (
	RefreshInterval      = time.Minute
	VerificationLifetime = 24 * time.Hour
)

// State is persisted with the account, only ever written by the server.
// Periodic reconciliation bounds stale access even if a refund/revocation
// webhook could not be delivered.
type State struct {
	Reference          string               `json:"reference,omitempty"`
	Purchases          []Purchase           `json:"purchases,omitempty"`
	Plan               string               `json:"plan,omitempty"`
	CustomerID         string               `json:"customerId,omitempty"`
	SubscriptionID     string               `json:"subscriptionId,omitempty"`
	SubscriptionStatus string               `json:"subscriptionStatus,omitempty"`
	LifetimeOrderID    string               `json:"lifetimeOrderId,omitempty"`
	PaidUntil          time.Time            `json:"paidUntil,omitempty"`
	VerifiedAt         time.Time            `json:"verifiedAt,omitempty"`
	WebhookReceipts    map[string]time.Time `json:"webhookReceipts,omitempty"`
	// DisputedTransactions come from signed dispute.created webhooks. A
	// disputed payment grants nothing, whatever status Creem still reports.
	DisputedTransactions []string `json:"disputedTransactions,omitempty"`
	// OverlappingPurchases counts paying purchases beyond the first: the
	// player was charged twice and support should refund one.
	OverlappingPurchases int `json:"overlappingPurchases,omitempty"`
}

// Client talks to the Creem API with server-only credentials.
type Client struct {
	AccessToken     string
	WebhookSecret   string
	MonthlyProduct  string
	YearlyProduct   string
	LifetimeProduct string
	PublicURL       string
	BaseURL         string
	HTTP            *http.Client
	// Observe, when set, receives every API call's operation, latency and error.
	Observe func(operation string, elapsed time.Duration, err error)

	offersMu sync.Mutex
	offers   []Offer
	offersAt time.Time
}

// Operation names a request path without IDs or query strings.
func Operation(method, path string) string {
	path, _, _ = strings.Cut(path, "?")
	if strings.HasPrefix(path, "/v1/subscriptions/") && strings.HasSuffix(path, "/cancel") {
		path = "/v1/subscriptions/{id}/cancel"
	}
	return method + " " + path
}

func env(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

// FromEnv reads the Creem configuration. All of it is server-only: never put
// a token or webhook secret in a VITE_ variable. FREE_TO_PLAY or empty
// credentials disable billing (nil client) and allow unlimited free play.
// The yearly product is optional; without it the yearly plan is not offered.
func FromEnv() (*Client, error) {
	freeToPlay, err := strconv.ParseBool(strings.TrimSpace(env("FREE_TO_PLAY", "false")))
	if err != nil {
		return nil, errors.New("FREE_TO_PLAY must be true or false")
	}
	if freeToPlay {
		return nil, nil
	}
	keys := []string{"CREEM_API_KEY", "CREEM_WEBHOOK_SECRET", "CREEM_MONTHLY_PRODUCT_ID", "CREEM_LIFETIME_PRODUCT_ID"}
	values := make([]string, len(keys))
	for i, key := range keys {
		values[i] = strings.TrimSpace(os.Getenv(key))
	}
	if values[0] == "" && values[1] == "" {
		return nil, nil
	}
	for i, value := range values {
		if value == "" {
			return nil, fmt.Errorf("%s is required when Creem billing is configured", keys[i])
		}
	}
	yearly := strings.TrimSpace(os.Getenv("CREEM_YEARLY_PRODUCT_ID"))
	if values[2] == values[3] || yearly != "" && (values[2] == yearly || values[3] == yearly) {
		return nil, errors.New("Creem monthly, yearly and lifetime product IDs must differ")
	}
	server := env("CREEM_SERVER", "production")
	base := "https://api.creem.io"
	if server == "sandbox" {
		base = "https://test-api.creem.io"
	} else if server != "production" {
		return nil, errors.New("CREEM_SERVER must be production or sandbox")
	}
	public := strings.TrimRight(strings.TrimSpace(os.Getenv("PUBLIC_URL")), "/")
	u, err := url.Parse(public)
	if err != nil || u.Host == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" || (u.Scheme != "https" && !(server == "sandbox" && u.Scheme == "http" && (u.Hostname() == "localhost" || u.Hostname() == "127.0.0.1"))) {
		return nil, errors.New("PUBLIC_URL must be an absolute HTTPS game URL (sandbox also permits HTTP localhost)")
	}
	if len(values[1]) < 24 {
		return nil, errors.New("CREEM_WEBHOOK_SECRET must contain the full endpoint secret")
	}
	return &Client{AccessToken: values[0], WebhookSecret: values[1], MonthlyProduct: values[2], LifetimeProduct: values[3], YearlyProduct: yearly, PublicURL: public, BaseURL: base, HTTP: &http.Client{Timeout: 6 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}}, nil
}

// Available reports a fully configured client. A nil client is unavailable.
func (p *Client) Available() bool {
	return p != nil && p.AccessToken != "" && p.MonthlyProduct != "" && p.LifetimeProduct != ""
}

// HasPaidAccess reports whether a recently verified snapshot grants play.
// Accounts without an email never hold paid access.
func (p *Client) HasPaidAccess(email string, b State, now time.Time) bool {
	if !p.Available() || email == "" || b.CustomerID == "" || b.VerifiedAt.IsZero() || now.Before(b.VerifiedAt) || now.Sub(b.VerifiedAt) > VerificationLifetime {
		return false
	}
	return b.Plan == "lifetime" && b.LifetimeOrderID != "" || (b.Plan == "monthly" || b.Plan == "yearly") && b.SubscriptionID != "" && now.Before(b.PaidUntil)
}

// HTTPError is a non-2xx Creem response.
type HTTPError struct{ Status int }

func (e *HTTPError) Error() string { return fmt.Sprintf("Creem returned HTTP %d", e.Status) }

// Request calls the Creem API. Output, when non-nil, receives the decoded body.
func (p *Client) Request(ctx context.Context, method, path string, input, output any) (err error) {
	if p.Observe != nil {
		started := time.Now()
		defer func() { p.Observe(Operation(method, path), time.Since(started), err) }()
	}
	var body io.Reader
	if input != nil {
		data, err := json.Marshal(input)
		if err != nil {
			return err
		}
		body = bytes.NewReader(data)
	}
	req, err := http.NewRequestWithContext(ctx, method, p.BaseURL+path, body)
	if err != nil {
		return err
	}
	req.Header.Set("x-api-key", p.AccessToken)
	req.Header.Set("Accept", "application/json")
	if input != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := p.HTTP.Do(req)
	if err != nil {
		return errors.New("Creem is temporarily unreachable")
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return &HTTPError{resp.StatusCode}
	}
	if output == nil {
		return nil
	}
	data, err := io.ReadAll(io.LimitReader(resp.Body, (1<<20)+1))
	if err != nil || len(data) > 1<<20 {
		return errors.New("invalid Creem response size")
	}
	if err = json.Unmarshal(data, output); err != nil {
		return errors.New("invalid Creem response")
	}
	return nil
}

// SnapshotFresh reports a snapshot recent enough to reuse without Creem.
func SnapshotFresh(state State, now time.Time) bool {
	// At renewal, a previously verified subscription snapshot cannot prove access
	// to the new period. Reconcile immediately even if its cache is only seconds
	// old, rather than briefly showing a wall to an already-renewed customer.
	return !((state.Plan == "monthly" || state.Plan == "yearly") && !now.Before(state.PaidUntil)) && !state.VerifiedAt.IsZero() && now.Sub(state.VerifiedAt) >= 0 && now.Sub(state.VerifiedAt) < RefreshInterval
}

// ErrLedgerChanged reports that the purchases a snapshot was computed from
// changed before it could be applied.
var ErrLedgerChanged = errors.New("billing purchases changed during reconciliation; try again")

// SameLedger compares the inputs a Creem snapshot is computed from.
func SameLedger(left, right State) bool {
	l, _ := json.Marshal([]any{left.Reference, left.CustomerID, left.Purchases, left.DisputedTransactions})
	r, _ := json.Marshal([]any{right.Reference, right.CustomerID, right.Purchases, right.DisputedTransactions})
	return bytes.Equal(l, r)
}

// ValidURL accepts only HTTPS Creem-hosted pages.
func ValidURL(value string) bool {
	u, err := url.Parse(value)
	return err == nil && u.Scheme == "https" && u.User == nil && u.Port() == "" && (u.Hostname() == "creem.io" || strings.HasSuffix(u.Hostname(), ".creem.io"))
}

// VerifyWebhook checks the Creem-Signature HMAC over the raw body.
func VerifyWebhook(secret string, headers http.Header, body []byte) bool {
	provided, err := hex.DecodeString(headers.Get("Creem-Signature"))
	if err != nil {
		return false
	}
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write(body)
	return hmac.Equal(mac.Sum(nil), provided)
}

// PurchaseMatches locates refunds/disputes by payment references, never by an
// email address or customer alone (one Creem customer can have purchases for
// several accounts).
func PurchaseMatches(state State, subscriptionID, transactionID string) bool {
	for _, purchase := range state.Purchases {
		if subscriptionID != "" && purchase.SubscriptionID == subscriptionID || transactionID != "" && purchase.TransactionID == transactionID {
			return true
		}
	}
	return false
}

// Offer is a plan the paywall can show. Amount is in minor units and is zero
// when Creem's price could not be read; the checkout page always shows it.
type Offer struct {
	Plan     string `json:"plan"`
	Amount   int64  `json:"amount,omitempty"`
	Currency string `json:"currency,omitempty"`
}

// offersLifetime is how long product prices are reused; a failed read is
// retried sooner so an outage never pins the paywall to missing prices.
const (
	offersLifetime      = time.Hour
	offersRetryInterval = time.Minute
)

// Offers lists the configured plans with their Creem prices, so the paywall
// shows what the checkout will charge instead of a copy kept in the client.
func (p *Client) Offers(ctx context.Context, now time.Time) []Offer {
	p.offersMu.Lock()
	cached, at := p.offers, p.offersAt
	p.offersMu.Unlock()
	if cached != nil && now.Sub(at) >= 0 && now.Sub(at) < offersLifetime {
		return cached
	}
	offers, complete := []Offer{}, true
	for _, plan := range []struct{ name, product string }{{"monthly", p.MonthlyProduct}, {"yearly", p.YearlyProduct}, {"lifetime", p.LifetimeProduct}} {
		if plan.product == "" {
			continue
		}
		offer := Offer{Plan: plan.name}
		var product struct {
			ID       string `json:"id"`
			Mode     string `json:"mode"`
			Price    int64  `json:"price"`
			Currency string `json:"currency"`
		}
		if err := p.Get(ctx, "products", "product_id", plan.product, &product); err == nil && product.ID == plan.product && p.ModeMatches(product.Mode) && product.Price > 0 {
			offer.Amount, offer.Currency = product.Price, strings.ToUpper(product.Currency)
		} else {
			complete = false
		}
		offers = append(offers, offer)
	}
	stamp := now
	if !complete {
		stamp = now.Add(offersRetryInterval - offersLifetime)
	}
	p.offersMu.Lock()
	p.offers, p.offersAt = offers, stamp
	p.offersMu.Unlock()
	return offers
}
