package main

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

const polarAPIVersion = "2026-10"
const billingRefreshInterval = time.Minute
const billingVerificationLifetime = 24 * time.Hour

// BillingState is persisted only on the server. Checkout redirects and browser
// input never write an entitlement. Periodic reconciliation bounds stale access
// even if a refund/revocation webhook could not be delivered.
type BillingState struct {
	Plan            string               `json:"plan,omitempty"`
	CustomerID      string               `json:"customerId,omitempty"`
	SubscriptionID  string               `json:"subscriptionId,omitempty"`
	LifetimeOrderID string               `json:"lifetimeOrderId,omitempty"`
	PaidUntil       time.Time            `json:"paidUntil,omitempty"`
	VerifiedAt      time.Time            `json:"verifiedAt,omitempty"`
	WebhookReceipts map[string]time.Time `json:"webhookReceipts,omitempty"`
}

type PolarBilling struct {
	accessToken     string
	webhookSecret   string
	monthlyProduct  string
	lifetimeProduct string
	publicURL       string
	baseURL         string
	client          *http.Client
}

// All configuration is server-only: never put a token or webhook secret in a
// VITE_ variable. Empty configuration keeps the trial walls active while checkout
// reports that billing is unavailable.
func polarBillingFromEnv() (*PolarBilling, error) {
	keys := []string{"POLAR_ACCESS_TOKEN", "POLAR_WEBHOOK_SECRET", "POLAR_MONTHLY_PRODUCT_ID", "POLAR_LIFETIME_PRODUCT_ID"}
	values := make([]string, len(keys))
	for i, key := range keys {
		values[i] = strings.TrimSpace(os.Getenv(key))
	}
	if values[0] == "" && values[1] == "" {
		return nil, nil
	}
	for i, value := range values {
		if value == "" {
			return nil, fmt.Errorf("%s is required when Polar billing is configured", keys[i])
		}
	}
	if values[2] == values[3] {
		return nil, errors.New("Polar monthly and lifetime product IDs must differ")
	}
	server := env("POLAR_SERVER", "production")
	base := "https://api.polar.sh"
	if server == "sandbox" {
		base = "https://sandbox-api.polar.sh"
	} else if server != "production" {
		return nil, errors.New("POLAR_SERVER must be production or sandbox")
	}
	public := strings.TrimRight(strings.TrimSpace(os.Getenv("PUBLIC_URL")), "/")
	u, err := url.Parse(public)
	if err != nil || u.Host == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" || (u.Scheme != "https" && !(server == "sandbox" && u.Scheme == "http" && (u.Hostname() == "localhost" || u.Hostname() == "127.0.0.1"))) {
		return nil, errors.New("PUBLIC_URL must be an absolute HTTPS game URL (sandbox also permits HTTP localhost)")
	}
	if len(values[1]) < 24 {
		return nil, errors.New("POLAR_WEBHOOK_SECRET must contain the full endpoint secret")
	}
	return &PolarBilling{accessToken: values[0], webhookSecret: values[1], monthlyProduct: values[2], lifetimeProduct: values[3], publicURL: public, baseURL: base, client: &http.Client{Timeout: 6 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}}, nil
}

func (a *App) billingAvailable() bool {
	return a.billing != nil && a.billing.accessToken != "" && a.billing.monthlyProduct != "" && a.billing.lifetimeProduct != ""
}

func (a *App) hasPaidAccess(account Account, now time.Time) bool {
	b := account.Billing
	if !a.billingAvailable() || account.Email == "" || b.CustomerID == "" || b.VerifiedAt.IsZero() || now.Before(b.VerifiedAt) || now.Sub(b.VerifiedAt) > billingVerificationLifetime {
		return false
	}
	return b.Plan == "lifetime" && b.LifetimeOrderID != "" || b.Plan == "monthly" && b.SubscriptionID != "" && now.Before(b.PaidUntil)
}

type polarHTTPError struct{ status int }

func (e *polarHTTPError) Error() string { return fmt.Sprintf("Polar returned HTTP %d", e.status) }

func (p *PolarBilling) request(ctx context.Context, method, path string, input, output any) error {
	var body io.Reader
	if input != nil {
		data, err := json.Marshal(input)
		if err != nil {
			return err
		}
		body = bytes.NewReader(data)
	}
	req, err := http.NewRequestWithContext(ctx, method, p.baseURL+path, body)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+p.accessToken)
	req.Header.Set("Polar-Version", polarAPIVersion)
	req.Header.Set("Accept", "application/json")
	if input != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := p.client.Do(req)
	if err != nil {
		return errors.New("Polar is temporarily unreachable")
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return &polarHTTPError{resp.StatusCode}
	}
	if output == nil {
		return nil
	}
	data, err := io.ReadAll(io.LimitReader(resp.Body, (1<<20)+1))
	if err != nil || len(data) > 1<<20 {
		return errors.New("invalid Polar response size")
	}
	if err = json.Unmarshal(data, output); err != nil {
		return errors.New("invalid Polar response")
	}
	return nil
}

type polarCustomer struct {
	ID         string     `json:"id"`
	ExternalID string     `json:"external_id"`
	DeletedAt  *time.Time `json:"deleted_at"`
}
type polarSubscription struct {
	ID                 string     `json:"id"`
	ProductID          string     `json:"product_id"`
	Status             string     `json:"status"`
	Currency           string     `json:"currency"`
	Amount             int64      `json:"amount"`
	RecurringInterval  string     `json:"recurring_interval"`
	CancelAtPeriodEnd  bool       `json:"cancel_at_period_end"`
	CurrentPeriodStart time.Time  `json:"current_period_start"`
	CurrentPeriodEnd   time.Time  `json:"current_period_end"`
	EndsAt             *time.Time `json:"ends_at"`
}
type polarCustomerState struct {
	polarCustomer
	ActiveSubscriptions []polarSubscription `json:"active_subscriptions"`
}
type polarOrder struct {
	ID             string        `json:"id"`
	CustomerID     string        `json:"customer_id"`
	Customer       polarCustomer `json:"customer"`
	ProductID      string        `json:"product_id"`
	SubscriptionID string        `json:"subscription_id"`
	Status         string        `json:"status"`
	Paid           bool          `json:"paid"`
	Currency       string        `json:"currency"`
	SubtotalAmount int64         `json:"subtotal_amount"`
	TaxAmount      int64         `json:"tax_amount"`
	TotalAmount    int64         `json:"total_amount"`
	NetAmount      int64         `json:"net_amount"`
	RefundedAmount int64         `json:"refunded_amount"`
	CreatedAt      time.Time     `json:"created_at"`
	Items          []struct {
		EndTimestamp *time.Time `json:"end_timestamp"`
	} `json:"items"`
}

func (p *PolarBilling) snapshot(ctx context.Context, externalID string, now time.Time) (BillingState, error) {
	result := BillingState{VerifiedAt: now}
	var customer polarCustomerState
	err := p.request(ctx, "GET", "/v1/customers/external/"+url.PathEscape(externalID)+"/state", nil, &customer)
	var httpError *polarHTTPError
	if errors.As(err, &httpError) && httpError.status == 404 {
		return result, nil
	}
	if err != nil {
		return BillingState{}, err
	}
	if customer.ID == "" || customer.ExternalID != externalID {
		return BillingState{}, errors.New("Polar customer identity mismatch")
	}
	if customer.DeletedAt != nil {
		return result, nil
	}
	result.CustomerID = customer.ID
	// Read orders for both allowlisted products, including refunds. A subscription
	// being active alone is insufficient: the current period must have been paid.
	var orders []polarOrder
	for page := 1; page <= 100; page++ {
		query := url.Values{"external_customer_id": {externalID}, "product_id": {p.monthlyProduct, p.lifetimeProduct}, "limit": {"100"}, "page": {strconv.Itoa(page)}, "sorting": {"-created_at"}}
		var response struct {
			Items      []polarOrder `json:"items"`
			Pagination struct {
				MaxPage int `json:"max_page"`
			} `json:"pagination"`
		}
		if err = p.request(ctx, "GET", "/v1/orders/?"+query.Encode(), nil, &response); err != nil {
			return BillingState{}, err
		}
		orders = append(orders, response.Items...)
		if page >= response.Pagination.MaxPage {
			break
		}
		if page == 100 {
			return BillingState{}, errors.New("Polar order pagination limit exceeded")
		}
	}
	validOrder := func(order polarOrder) bool {
		return order.ID != "" && order.CustomerID == customer.ID && order.Customer.ExternalID == externalID && order.Status == "paid" && order.Paid && order.RefundedAmount == 0 && order.Currency == "eur" && order.NetAmount > 0
	}
	for _, order := range orders {
		// Polar extracts VAT from inclusive prices, so order.subtotal_amount
		// varies by billing country. The immutable product ID identifies the
		// configured plan; nominal prices are set on those products in Polar.
		if validOrder(order) && order.ProductID == p.lifetimeProduct && order.SubscriptionID == "" {
			result.Plan, result.LifetimeOrderID = "lifetime", order.ID
			return result, nil
		}
	}
	for _, subscription := range customer.ActiveSubscriptions {
		if subscription.ID == "" || subscription.ProductID != p.monthlyProduct || subscription.Status != "active" || subscription.Currency != "eur" || subscription.RecurringInterval != "month" || subscription.CurrentPeriodStart.After(now) || !subscription.CurrentPeriodEnd.After(now) {
			continue
		}
		paidUntil := subscription.CurrentPeriodEnd
		if subscription.EndsAt != nil && subscription.EndsAt.Before(paidUntil) {
			paidUntil = *subscription.EndsAt
		}
		if !paidUntil.After(now) {
			continue
		}
		for _, order := range orders {
			if !validOrder(order) || order.ProductID != p.monthlyProduct || order.SubscriptionID != subscription.ID {
				continue
			}
			coversPeriod := !order.CreatedAt.Before(subscription.CurrentPeriodStart.Add(-5 * time.Minute))
			for _, item := range order.Items {
				coversPeriod = coversPeriod || item.EndTimestamp != nil && !item.EndTimestamp.Before(paidUntil)
			}
			if coversPeriod && paidUntil.After(result.PaidUntil) {
				result.Plan, result.SubscriptionID, result.PaidUntil = "monthly", subscription.ID, paidUntil
			}
		}
	}
	return result, nil
}

func (a *App) refreshBilling(ctx context.Context, account Account, force bool) (Account, error) {
	if !a.billingAvailable() || account.Email == "" {
		return account, nil
	}
	now := a.now().UTC()
	if !force && billingSnapshotFresh(account.Billing, now) {
		return account, nil
	}
	return a.store.UpdateAccountByID(ctx, account.Player.ID, func(current *Account) error {
		if !force && billingSnapshotFresh(current.Billing, now) {
			return nil
		}
		snapshot, err := a.billing.snapshot(ctx, current.Player.ID, now)
		if err != nil {
			return err
		}
		snapshot.WebhookReceipts = current.Billing.WebhookReceipts
		current.Billing = snapshot
		return nil
	})
}

func billingSnapshotFresh(state BillingState, now time.Time) bool {
	// At renewal, a previously verified monthly snapshot cannot prove access
	// to the new period. Reconcile immediately even if its cache is only seconds
	// old, rather than briefly showing a wall to an already-renewed customer.
	return !(state.Plan == "monthly" && !now.Before(state.PaidUntil)) && !state.VerifiedAt.IsZero() && now.Sub(state.VerifiedAt) >= 0 && now.Sub(state.VerifiedAt) < billingRefreshInterval
}

func (a *App) billingAccount(w http.ResponseWriter, r *http.Request) (Account, bool) {
	hash, err := bearer(r)
	if err != nil {
		apiFailure(w, err)
		return Account{}, false
	}
	account, err := a.store.Get(r.Context(), hash)
	if err != nil {
		apiFailure(w, err)
		return Account{}, false
	}
	if account.Email == "" {
		writeError(w, 401, "log in or create an account before subscribing")
		return Account{}, false
	}
	if !a.billingAvailable() {
		writeError(w, 503, "subscriptions are not available yet; please try again later")
		return Account{}, false
	}
	if !a.allow("billing:"+account.Player.ID, 20) {
		writeError(w, 429, "too many billing requests; try again in a minute")
		return Account{}, false
	}
	return account, true
}

func validPolarURL(value string) bool {
	u, err := url.Parse(value)
	return err == nil && u.Scheme == "https" && u.User == nil && u.Port() == "" && (u.Hostname() == "polar.sh" || strings.HasSuffix(u.Hostname(), ".polar.sh"))
}

func (a *App) billingCheckout(w http.ResponseWriter, r *http.Request) {
	account, ok := a.billingAccount(w, r)
	if !ok {
		return
	}
	var input struct {
		Plan string `json:"plan"`
	}
	if err := decodeJSON(w, r, &input); err != nil {
		apiFailure(w, err)
		return
	}
	product := a.billing.monthlyProduct
	if input.Plan == "lifetime" {
		product = a.billing.lifetimeProduct
	} else if input.Plan != "monthly" {
		writeError(w, 400, "choose monthly or lifetime")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
	defer cancel()
	account, err := a.refreshBilling(ctx, account, true)
	if err != nil {
		writeError(w, 503, "unable to check your subscription; please try again")
		return
	}
	if a.hasPaidAccess(account, a.now()) {
		writeError(w, 409, "your account already has paid access")
		return
	}
	var response struct {
		URL string `json:"url"`
	}
	err = a.billing.request(ctx, "POST", "/v1/checkouts/", map[string]any{
		"products": []string{product}, "external_customer_id": account.Player.ID,
		"customer_email": account.Email, "customer_name": account.Player.Name,
		"allow_trial": false, "allow_discount_codes": false,
		"success_url": a.billing.publicURL + "/?billing=success&checkout_id={CHECKOUT_ID}",
		"return_url":  a.billing.publicURL + "/?billing=cancelled",
		"metadata":    map[string]string{"account_id": account.Player.ID, "plan": input.Plan},
	}, &response)
	if err != nil || !validPolarURL(response.URL) {
		writeError(w, 503, "unable to start checkout; please try again")
		return
	}
	writeJSON(w, 200, map[string]string{"url": response.URL})
}

func (a *App) billingPortal(w http.ResponseWriter, r *http.Request) {
	account, ok := a.billingAccount(w, r)
	if !ok {
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
	defer cancel()
	account, err := a.refreshBilling(ctx, account, true)
	if err != nil {
		writeError(w, 503, "unable to check your subscription; please try again")
		return
	}
	if account.Billing.CustomerID == "" {
		writeError(w, 409, "subscribe first to manage billing")
		return
	}
	var response struct {
		URL string `json:"customer_portal_url"`
	}
	err = a.billing.request(ctx, "POST", "/v1/customer-sessions/", map[string]string{"customer_id": account.Billing.CustomerID, "return_url": a.billing.publicURL + "/?billing=portal"}, &response)
	if err != nil || !validPolarURL(response.URL) {
		writeError(w, 503, "unable to open billing management; please try again")
		return
	}
	writeJSON(w, 200, map[string]string{"url": response.URL})
}

func (a *App) billingSync(w http.ResponseWriter, r *http.Request) {
	account, ok := a.billingAccount(w, r)
	if !ok {
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
	defer cancel()
	account, err := a.refreshBilling(ctx, account, true)
	if err != nil {
		writeError(w, 503, "unable to verify payment yet; please try again")
		return
	}
	writeJSON(w, 200, map[string]any{"access": a.accessState(account, a.now())})
}

func verifyPolarWebhook(secret string, headers http.Header, body []byte, now time.Time) bool {
	id, timestamp := headers.Get("Webhook-Id"), headers.Get("Webhook-Timestamp")
	if id == "" || len(id) > 200 || strings.ContainsAny(id, ". \t\r\n") {
		return false
	}
	seconds, err := strconv.ParseInt(timestamp, 10, 64)
	if err != nil {
		return false
	}
	delta := now.Sub(time.Unix(seconds, 0))
	if delta < -5*time.Minute || delta > 5*time.Minute {
		return false
	}
	// New Polar secrets follow Standard Webhooks. Polar also supports older
	// endpoints whose HMAC key is the complete UTF-8 secret, as do their SDKs.
	keys := [][]byte{[]byte(secret)}
	if decoded, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(secret, "whsec_")); err == nil && len(decoded) >= 24 {
		keys = append(keys, decoded)
	}
	message := append([]byte(id+"."+timestamp+"."), body...)
	for _, key := range keys {
		mac := hmac.New(sha256.New, key)
		_, _ = mac.Write(message)
		expected := mac.Sum(nil)
		for _, signature := range strings.Fields(headers.Get("Webhook-Signature")) {
			version, encoded, ok := strings.Cut(signature, ",")
			if !ok || version != "v1" {
				continue
			}
			provided, err := base64.StdEncoding.DecodeString(encoded)
			if err == nil && hmac.Equal(expected, provided) {
				return true
			}
		}
	}
	return false
}

func (a *App) billingWebhook(w http.ResponseWriter, r *http.Request) {
	if !a.billingAvailable() || a.billing.webhookSecret == "" {
		writeError(w, 503, "billing is not configured")
		return
	}
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 1<<20))
	if err != nil {
		writeError(w, 413, "webhook body is too large")
		return
	}
	now := a.now().UTC()
	if !verifyPolarWebhook(a.billing.webhookSecret, r.Header, body, now) {
		writeError(w, 403, "invalid webhook signature")
		return
	}
	var event struct {
		Type string `json:"type"`
		Data struct {
			ID         string        `json:"id"`
			ExternalID string        `json:"external_id"`
			CustomerID string        `json:"customer_id"`
			OrderID    string        `json:"order_id"`
			Customer   polarCustomer `json:"customer"`
		} `json:"data"`
	}
	if err = json.Unmarshal(body, &event); err != nil {
		writeError(w, 400, "invalid webhook body")
		return
	}
	if !strings.HasPrefix(event.Type, "customer.") && !strings.HasPrefix(event.Type, "subscription.") && !strings.HasPrefix(event.Type, "order.") && !strings.HasPrefix(event.Type, "refund.") {
		w.WriteHeader(202)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
	defer cancel()
	externalID := event.Data.Customer.ExternalID
	if strings.HasPrefix(event.Type, "customer.") {
		externalID = event.Data.ExternalID
	}
	if externalID == "" && event.Data.OrderID != "" {
		var order polarOrder
		if err = a.billing.request(ctx, "GET", "/v1/orders/"+url.PathEscape(event.Data.OrderID), nil, &order); err != nil {
			writeError(w, 503, "unable to reconcile webhook")
			return
		}
		externalID = order.Customer.ExternalID
	}
	if externalID == "" && event.Data.CustomerID != "" {
		var customer polarCustomer
		if err = a.billing.request(ctx, "GET", "/v1/customers/"+url.PathEscape(event.Data.CustomerID), nil, &customer); err != nil {
			writeError(w, 503, "unable to reconcile webhook")
			return
		}
		externalID = customer.ExternalID
	}
	if externalID == "" {
		w.WriteHeader(202)
		return
	}
	_, err = a.store.UpdateAccountByID(ctx, externalID, func(account *Account) error {
		if account.Email == "" {
			return nil
		}
		id := r.Header.Get("Webhook-Id")
		if _, duplicate := account.Billing.WebhookReceipts[id]; duplicate {
			return nil
		}
		snapshot, err := a.billing.snapshot(ctx, account.Player.ID, now)
		if err != nil {
			return err
		}
		snapshot.WebhookReceipts = map[string]time.Time{}
		for key, at := range account.Billing.WebhookReceipts {
			if now.Sub(at) < 24*time.Hour {
				snapshot.WebhookReceipts[key] = at
			}
		}
		if len(snapshot.WebhookReceipts) >= 128 {
			var oldestKey string
			var oldest time.Time
			for key, at := range snapshot.WebhookReceipts {
				if oldestKey == "" || at.Before(oldest) {
					oldestKey, oldest = key, at
				}
			}
			delete(snapshot.WebhookReceipts, oldestKey)
		}
		snapshot.WebhookReceipts[id] = now
		account.Billing = snapshot
		return nil
	})
	if errors.Is(err, ErrUnauthorized) {
		w.WriteHeader(202)
		return
	}
	if err != nil {
		writeError(w, 503, "unable to reconcile webhook")
		return
	}
	w.WriteHeader(202)
}
