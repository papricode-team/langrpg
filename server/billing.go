package main

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
	"time"
)

const billingRefreshInterval = time.Minute
const billingVerificationLifetime = 24 * time.Hour

// BillingState is persisted only on the server. Checkout redirects and browser
// input never write an entitlement. Periodic reconciliation bounds stale access
// even if a refund/revocation webhook could not be delivered.
type BillingState struct {
	Reference          string               `json:"reference,omitempty"`
	Purchases          []CreemPurchase      `json:"purchases,omitempty"`
	Plan               string               `json:"plan,omitempty"`
	CustomerID         string               `json:"customerId,omitempty"`
	SubscriptionID     string               `json:"subscriptionId,omitempty"`
	SubscriptionStatus string               `json:"subscriptionStatus,omitempty"`
	LifetimeOrderID    string               `json:"lifetimeOrderId,omitempty"`
	PaidUntil          time.Time            `json:"paidUntil,omitempty"`
	VerifiedAt         time.Time            `json:"verifiedAt,omitempty"`
	WebhookReceipts    map[string]time.Time `json:"webhookReceipts,omitempty"`
}

type CreemBilling struct {
	accessToken     string
	webhookSecret   string
	monthlyProduct  string
	yearlyProduct   string
	lifetimeProduct string
	publicURL       string
	baseURL         string
	client          *http.Client
}

// All configuration is server-only: never put a token or webhook secret in a
// VITE_ variable. FREE_TO_PLAY or empty credentials disable billing and allow
// unlimited free play.
func creemBillingFromEnv() (*CreemBilling, error) {
	freeToPlay, err := strconv.ParseBool(strings.TrimSpace(env("FREE_TO_PLAY", "false")))
	if err != nil {
		return nil, errors.New("FREE_TO_PLAY must be true or false")
	}
	if freeToPlay {
		return nil, nil
	}
	keys := []string{"CREEM_API_KEY", "CREEM_WEBHOOK_SECRET", "CREEM_MONTHLY_PRODUCT_ID", "CREEM_LIFETIME_PRODUCT_ID", "CREEM_YEARLY_PRODUCT_ID"}
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
	if values[2] == values[3] || values[2] == values[4] || values[3] == values[4] {
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
	return &CreemBilling{accessToken: values[0], webhookSecret: values[1], monthlyProduct: values[2], lifetimeProduct: values[3], yearlyProduct: values[4], publicURL: public, baseURL: base, client: &http.Client{Timeout: 6 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}}, nil
}

func (a *App) billingAvailable() bool {
	return a.billing != nil && a.billing.accessToken != "" && a.billing.monthlyProduct != "" && a.billing.lifetimeProduct != "" && a.billing.yearlyProduct != ""
}

func (a *App) hasPaidAccess(account Account, now time.Time) bool {
	b := account.Billing
	if !a.billingAvailable() || account.Email == "" || b.CustomerID == "" || b.VerifiedAt.IsZero() || now.Before(b.VerifiedAt) || now.Sub(b.VerifiedAt) > billingVerificationLifetime {
		return false
	}
	return b.Plan == "lifetime" && b.LifetimeOrderID != "" || (b.Plan == "monthly" || b.Plan == "yearly") && b.SubscriptionID != "" && now.Before(b.PaidUntil)
}

type creemHTTPError struct{ status int }

func (e *creemHTTPError) Error() string { return fmt.Sprintf("Creem returned HTTP %d", e.status) }

func (p *CreemBilling) request(ctx context.Context, method, path string, input, output any) error {
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
	req.Header.Set("x-api-key", p.accessToken)
	req.Header.Set("Accept", "application/json")
	if input != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := p.client.Do(req)
	if err != nil {
		return errors.New("Creem is temporarily unreachable")
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return &creemHTTPError{resp.StatusCode}
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

func (a *App) refreshBilling(ctx context.Context, account Account, force bool) (Account, error) {
	if !a.billingAvailable() || account.Email == "" {
		return account, nil
	}
	now := a.now().UTC()
	if !force && billingSnapshotFresh(account.Billing, now) {
		return account, nil
	}
	return a.reconcileBilling(ctx, account.Player.ID, now, func(current *Account) (bool, error) {
		return current.Email != "" && (force || !billingSnapshotFresh(current.Billing, now)), nil
	}, func(current *Account, snapshot BillingState) {
		snapshot.WebhookReceipts = current.Billing.WebhookReceipts
		current.Billing = snapshot
		if a.hasPaidAccess(*current, now) && current.Analytics.PaidAt.IsZero() {
			current.Analytics.PaidAt = now
		}
	})
}

var errBillingLedgerChanged = errors.New("billing purchases changed during reconciliation; try again")

// sameBillingLedger compares the inputs a Creem snapshot is computed from.
func sameBillingLedger(left, right BillingState) bool {
	l, _ := json.Marshal([]any{left.Reference, left.CustomerID, left.Purchases})
	r, _ := json.Marshal([]any{right.Reference, right.CustomerID, right.Purchases})
	return bytes.Equal(l, r)
}

// reconcileBilling queries Creem without holding the account row lock, then
// applies the snapshot under the lock only if the purchase ledger it was
// computed from is unchanged; a concurrent checkout or webhook causes a retry
// with the newer ledger. prepare runs on the unlocked read and again under the
// lock (it must be deterministic); returning false makes the call a no-op.
func (a *App) reconcileBilling(ctx context.Context, accountID string, now time.Time, prepare func(*Account) (bool, error), apply func(*Account, BillingState)) (Account, error) {
	for attempt := 0; attempt < 3; attempt++ {
		current, err := a.store.GetAccountByID(ctx, accountID)
		if err != nil {
			return Account{}, err
		}
		proceed, err := prepare(&current)
		if err != nil || !proceed {
			return current, err
		}
		snapshot, err := a.billing.snapshot(ctx, accountID, current.Billing, now)
		if err != nil {
			return Account{}, err
		}
		updated, err := a.store.UpdateAccountByID(ctx, accountID, func(locked *Account) error {
			proceed, err := prepare(locked)
			if err != nil || !proceed {
				return err
			}
			if !sameBillingLedger(locked.Billing, current.Billing) {
				return errBillingLedgerChanged
			}
			apply(locked, snapshot)
			return nil
		})
		if errors.Is(err, errBillingLedgerChanged) {
			continue
		}
		return updated, err
	}
	return Account{}, errBillingLedgerChanged
}

func billingSnapshotFresh(state BillingState, now time.Time) bool {
	// At renewal, a previously verified subscription snapshot cannot prove access
	// to the new period. Reconcile immediately even if its cache is only seconds
	// old, rather than briefly showing a wall to an already-renewed customer.
	return !((state.Plan == "monthly" || state.Plan == "yearly") && !now.Before(state.PaidUntil)) && !state.VerifiedAt.IsZero() && now.Sub(state.VerifiedAt) >= 0 && now.Sub(state.VerifiedAt) < billingRefreshInterval
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

func validCreemURL(value string) bool {
	u, err := url.Parse(value)
	return err == nil && u.Scheme == "https" && u.User == nil && u.Port() == "" && (u.Hostname() == "creem.io" || strings.HasSuffix(u.Hostname(), ".creem.io"))
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
	} else if input.Plan == "yearly" {
		product = a.billing.yearlyProduct
	} else if input.Plan != "monthly" {
		writeError(w, 400, "choose monthly, yearly or lifetime")
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
	checkoutURL, err := a.createCheckout(ctx, account.Player.ID, product)
	if err != nil {
		a.recordAnalytics(r.Context(), account, AnalyticsEvent{Name: "checkout_failed", Detail: input.Plan})
		writeError(w, 503, "unable to start checkout; please try again")
		return
	}
	a.recordAnalytics(r.Context(), account, AnalyticsEvent{Name: "checkout_started", Detail: input.Plan})
	writeJSON(w, 200, map[string]string{"url": checkoutURL})
}

// pendingPurchases keeps paid purchases and unpaid checkouts from the last day.
func (a *App) pendingPurchases(billing BillingState) []CreemPurchase {
	kept := make([]CreemPurchase, 0, len(billing.Purchases))
	for _, purchase := range billing.Purchases {
		if purchase.CustomerID != "" || a.now().Sub(purchase.CreatedAt) < 24*time.Hour {
			kept = append(kept, purchase)
		}
	}
	return kept
}

// createCheckout creates the Creem checkout outside the account row lock.
// The billing reference is persisted first, so the checkout's metadata binds
// it to this account; the purchase is recorded afterwards under the lock.
// If that final write fails, the orphaned checkout is harmless: it grants
// nothing unless paid, and a paid checkout.completed webhook records it.
func (a *App) createCheckout(ctx context.Context, accountID, product string) (string, error) {
	reserved, err := a.store.UpdateAccountByID(ctx, accountID, func(current *Account) error {
		if a.hasPaidAccess(*current, a.now()) {
			return errors.New("already subscribed")
		}
		if len(a.pendingPurchases(current.Billing)) >= 32 {
			return errors.New("too many pending purchases; use billing management")
		}
		if current.Billing.Reference == "" {
			reference, err := randomID(24)
			if err != nil {
				return err
			}
			current.Billing.Reference = reference
		}
		return nil
	})
	if err != nil {
		return "", err
	}
	requestID, err := randomID(24)
	if err != nil {
		return "", err
	}
	customer := map[string]string{"email": reserved.Email}
	if reserved.Billing.CustomerID != "" {
		customer = map[string]string{"id": reserved.Billing.CustomerID}
	}
	var response creemCheckout
	if err = a.billing.request(ctx, "POST", "/v1/checkouts", map[string]any{
		"product_id": product, "request_id": requestID, "units": 1,
		"customer":    customer,
		"success_url": a.billing.publicURL + "/?billing=success",
		"metadata":    map[string]string{"account_id": accountID, "billing_reference": reserved.Billing.Reference},
	}, &response); err != nil {
		return "", err
	}
	// Creem may omit request_id from creation responses. Retrieval returns it,
	// and reconciliation verifies it against our persisted request before access.
	if response.ID == "" || response.RequestID != "" && response.RequestID != requestID || !validCreemURL(response.URL) {
		return "", errors.New("invalid checkout response")
	}
	_, err = a.store.UpdateAccountByID(ctx, accountID, func(current *Account) error {
		// Serialize with webhook reconciliation; only IDs and references
		// returned by our own server-created sessions are persisted.
		if a.hasPaidAccess(*current, a.now()) {
			return errors.New("already subscribed")
		}
		if current.Billing.Reference != reserved.Billing.Reference {
			return errors.New("billing reference changed during checkout")
		}
		kept := a.pendingPurchases(current.Billing)
		if len(kept) >= 32 {
			return errors.New("too many pending purchases; use billing management")
		}
		current.Billing.Purchases = append(kept, CreemPurchase{CheckoutID: response.ID, RequestID: requestID, ProductID: product, CreatedAt: a.now().UTC()})
		return nil
	})
	if err != nil {
		return "", err
	}
	return response.URL, nil
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
	// Game signup does not verify mailbox ownership. Creem can reuse a customer
	// for the same billing email, so a store-generated magic link could expose
	// unrelated purchases. Let Creem authenticate the billing email itself.
	writeJSON(w, 200, map[string]string{"url": "https://www.creem.io/my-orders/login"})
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

func verifyCreemWebhook(secret string, headers http.Header, body []byte) bool {
	provided, err := hex.DecodeString(headers.Get("Creem-Signature"))
	if err != nil {
		return false
	}
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write(body)
	return hmac.Equal(mac.Sum(nil), provided)
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
	if !verifyCreemWebhook(a.billing.webhookSecret, r.Header, body) {
		writeError(w, 403, "invalid webhook signature")
		return
	}
	var event struct {
		ID        string `json:"id"`
		Type      string `json:"eventType"`
		CreatedAt int64  `json:"created_at"`
		Object    struct {
			ID           string            `json:"id"`
			Metadata     map[string]string `json:"metadata"`
			Subscription creemRef          `json:"subscription"`
			Transaction  creemRef          `json:"transaction"`
		} `json:"object"`
	}
	if json.Unmarshal(body, &event) != nil || event.ID == "" || len(event.ID) > 200 {
		writeError(w, 400, "invalid webhook body")
		return
	}
	now := a.now().UTC()
	age := now.Sub(creemTime(event.CreatedAt))
	// Creem signs the raw payload (including created_at), without a separate
	// delivery timestamp. Accept its documented retry window, reject old replays.
	if event.CreatedAt <= 0 || age < -5*time.Minute || age > 24*time.Hour {
		writeError(w, 403, "webhook timestamp outside retry window")
		return
	}
	if event.Type != "checkout.completed" && !strings.HasPrefix(event.Type, "subscription.") && event.Type != "refund.created" && event.Type != "dispute.created" {
		w.WriteHeader(200)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
	defer cancel()
	accountID := event.Object.Metadata["account_id"]
	var checkout *creemCheckout
	if event.Type == "checkout.completed" {
		var authoritative creemCheckout
		if err = a.billing.get(ctx, "checkouts", "checkout_id", event.Object.ID, &authoritative); err != nil {
			writeError(w, 503, "unable to reconcile webhook")
			return
		}
		accountID = authoritative.Metadata["account_id"]
		checkout = &authoritative
	} else if accountID == "" {
		subscriptionID, transactionID := event.Object.Subscription.ID, event.Object.Transaction.ID
		if strings.HasPrefix(event.Type, "subscription.") {
			subscriptionID = event.Object.ID
		}
		accountID, err = a.store.FindBillingAccount(ctx, subscriptionID, transactionID)
		if errors.Is(err, ErrUnauthorized) && transactionID != "" {
			var transaction creemTransaction
			if err = a.billing.get(ctx, "transactions", "transaction_id", transactionID, &transaction); err != nil {
				writeError(w, 503, "unable to reconcile webhook")
				return
			}
			accountID, err = a.store.FindBillingAccount(ctx, transaction.Subscription.ID, transactionID)
		}
		if err != nil && !errors.Is(err, ErrUnauthorized) {
			writeError(w, 503, "unable to reconcile webhook")
			return
		}
	}
	if accountID == "" {
		w.WriteHeader(200)
		return
	}
	// Creem is queried outside the account row lock; see reconcileBilling.
	_, err = a.reconcileBilling(ctx, accountID, now, func(account *Account) (bool, error) {
		if account.Email == "" {
			return false, nil
		}
		if _, duplicate := account.Billing.WebhookReceipts[event.ID]; duplicate {
			return false, nil
		}
		if checkout != nil {
			if !a.billing.checkoutBelongsTo(*checkout, account.Player.ID, account.Billing.Reference) {
				return false, nil
			}
			found := false
			for _, purchase := range account.Billing.Purchases {
				found = found || purchase.CheckoutID == checkout.ID
			}
			if !found {
				if len(account.Billing.Purchases) >= 64 {
					return false, errors.New("purchase reconciliation limit exceeded")
				}
				account.Billing.Purchases = append(account.Billing.Purchases, CreemPurchase{CheckoutID: checkout.ID, RequestID: checkout.RequestID, ProductID: checkout.Product.ID, CreatedAt: now})
			}
		}
		return true, nil
	}, func(account *Account, snapshot BillingState) {
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
		snapshot.WebhookReceipts[event.ID] = now
		account.Billing = snapshot
		if a.hasPaidAccess(*account, now) && account.Analytics.PaidAt.IsZero() {
			account.Analytics.PaidAt = now
		}
	})
	if errors.Is(err, ErrUnauthorized) {
		w.WriteHeader(200)
		return
	}
	if err != nil {
		writeError(w, 503, "unable to reconcile webhook")
		return
	}
	w.WriteHeader(200)
}
