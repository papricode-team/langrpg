package main

import (
	"context"
	"encoding/json"
	"errors"
	"glotworld/server/internal/billing"
	"io"
	"log/slog"
	"net/http"
	"slices"
	"strings"
	"time"
)

func (a *App) billingAvailable() bool { return a.billing.Available() }

func (a *App) hasPaidAccess(account Account, now time.Time) bool {
	return a.billing.HasPaidAccess(account.Email, account.Billing, now)
}

// creemBackoff is how long unforced refreshes skip Creem after a failed
// call, so an outage does not add a slow Creem request to every heartbeat.
const creemBackoff = 30 * time.Second

// hasBillingLedger reports anything Creem could verify. Accounts that never
// started a checkout skip reconciliation and its write entirely.
func hasBillingLedger(state billing.State) bool {
	return len(state.Purchases) > 0 || state.CustomerID != "" || state.Plan != ""
}

func (a *App) refreshBilling(ctx context.Context, account Account, force bool) (Account, error) {
	if !a.billingAvailable() || account.Email == "" || !hasBillingLedger(account.Billing) {
		return account, nil
	}
	now := a.now().UTC()
	if !force && (billing.SnapshotFresh(account.Billing, now) || now.UnixNano() < a.creemBackoffUntil.Load()) {
		return account, nil
	}
	updated, err := a.reconcileBilling(ctx, account.Player.ID, now, func(current *Account) (bool, error) {
		return current.Email != "" && (force || !billing.SnapshotFresh(current.Billing, now)), nil
	}, func(current *Account, snapshot billing.State) {
		snapshot.WebhookReceipts = current.Billing.WebhookReceipts
		a.applyBilling(current, snapshot, now)
	})
	if err != nil && !errors.Is(err, billing.ErrLedgerChanged) && !errors.Is(err, ErrUnauthorized) {
		a.creemBackoffUntil.Store(now.Add(creemBackoff).UnixNano())
	}
	return updated, err
}

// applyBilling stores a verified snapshot and reports a new double charge.
func (a *App) applyBilling(account *Account, snapshot billing.State, now time.Time) {
	if snapshot.OverlappingPurchases > account.Billing.OverlappingPurchases {
		slog.Warn("account holds more than one paying Creem purchase; refund the extra one", "accountId", account.Player.ID, "overlapping", snapshot.OverlappingPurchases)
	}
	account.Billing = snapshot
	if a.hasPaidAccess(*account, now) && account.Analytics.PaidAt.IsZero() {
		account.Analytics.PaidAt = now
	}
}

// reconcileBilling queries Creem without holding the account row lock, then
// applies the snapshot under the lock only if the purchase ledger it was
// computed from is unchanged; a concurrent checkout or webhook causes a retry
// with the newer ledger. prepare runs on the unlocked read and again under the
// lock (it must be deterministic); returning false makes the call a no-op.
func (a *App) reconcileBilling(ctx context.Context, accountID string, now time.Time, prepare func(*Account) (bool, error), apply func(*Account, billing.State)) (Account, error) {
	for attempt := 0; attempt < 3; attempt++ {
		current, err := a.store.GetAccountByID(ctx, accountID)
		if err != nil {
			return Account{}, err
		}
		proceed, err := prepare(&current)
		if err != nil || !proceed {
			return current, err
		}
		snapshot, err := a.billing.Snapshot(ctx, accountID, current.Billing, now)
		if err != nil {
			return Account{}, err
		}
		updated, err := a.store.UpdateAccountByID(ctx, accountID, func(locked *Account) error {
			proceed, err := prepare(locked)
			if err != nil || !proceed {
				return err
			}
			if !billing.SameLedger(locked.Billing, current.Billing) {
				return billing.ErrLedgerChanged
			}
			apply(locked, snapshot)
			return nil
		})
		if errors.Is(err, billing.ErrLedgerChanged) {
			continue
		}
		return updated, err
	}
	return Account{}, billing.ErrLedgerChanged
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
	product := map[string]string{"monthly": a.billing.MonthlyProduct, "yearly": a.billing.YearlyProduct, "lifetime": a.billing.LifetimeProduct}[input.Plan]
	if product == "" {
		writeError(w, 400, "choose one of the offered plans")
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
	checkoutURL, err := a.createCheckout(ctx, account.Player.ID, input.Plan, product)
	if err != nil {
		a.recordAnalytics(r.Context(), account, AnalyticsEvent{Name: "checkout_failed", Detail: input.Plan})
		writeError(w, 503, "unable to start checkout; please try again")
		return
	}
	a.recordAnalytics(r.Context(), account, AnalyticsEvent{Name: "checkout_started", Detail: input.Plan})
	writeJSON(w, 200, map[string]string{"url": checkoutURL})
}

// pendingPurchases keeps paid purchases and unpaid checkouts from the last day.
func (a *App) pendingPurchases(state billing.State) []billing.Purchase {
	kept := make([]billing.Purchase, 0, len(state.Purchases))
	for _, purchase := range state.Purchases {
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
func (a *App) createCheckout(ctx context.Context, accountID, plan, product string) (string, error) {
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
	input := map[string]any{
		"product_id": product, "request_id": requestID, "units": 1,
		"success_url": a.billing.PublicURL + "/?billing=success",
		"metadata":    map[string]string{"account_id": accountID, "billing_reference": reserved.Billing.Reference},
	}
	// Game signup does not verify the email, so a first checkout lets the payer
	// enter their own billing email; receipts never go to an unproven address.
	if reserved.Billing.CustomerID != "" {
		input["customer"] = map[string]string{"id": reserved.Billing.CustomerID}
	}
	var response billing.Checkout
	if err = a.billing.Request(ctx, "POST", "/v1/checkouts", input, &response); err != nil {
		return "", err
	}
	// Creem may omit request_id from creation responses. Retrieval returns it,
	// and reconciliation verifies it against our persisted request before access.
	if response.ID == "" || response.RequestID != "" && response.RequestID != requestID || !billing.ValidURL(response.URL) {
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
		current.Billing.Purchases = append(kept, billing.Purchase{CheckoutID: response.ID, RequestID: requestID, ProductID: product, Plan: plan, CreatedAt: a.now().UTC().Truncate(time.Microsecond)})
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

func (a *App) billingWebhook(w http.ResponseWriter, r *http.Request) {
	if !a.billingAvailable() || a.billing.WebhookSecret == "" {
		writeError(w, 503, "billing is not configured")
		return
	}
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 1<<20))
	if err != nil {
		writeError(w, 413, "webhook body is too large")
		return
	}
	if !billing.VerifyWebhook(a.billing.WebhookSecret, r.Header, body) {
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
			Subscription billing.Ref       `json:"subscription"`
			Transaction  billing.Ref       `json:"transaction"`
		} `json:"object"`
	}
	if json.Unmarshal(body, &event) != nil || event.ID == "" || len(event.ID) > 200 {
		writeError(w, 400, "invalid webhook body")
		return
	}
	now := a.now().UTC()
	age := now.Sub(billing.Time(event.CreatedAt))
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
	var checkout *billing.Checkout
	if event.Type == "checkout.completed" {
		var authoritative billing.Checkout
		if err = a.billing.Get(ctx, "checkouts", "checkout_id", event.Object.ID, &authoritative); err != nil {
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
			var transaction billing.Transaction
			if err = a.billing.Get(ctx, "transactions", "transaction_id", transactionID, &transaction); err != nil {
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
			if !a.billing.CheckoutBelongsTo(*checkout, account.Player.ID, account.Billing.Reference) {
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
				account.Billing.Purchases = append(account.Billing.Purchases, billing.Purchase{CheckoutID: checkout.ID, RequestID: checkout.RequestID, ProductID: checkout.Product.ID, Plan: a.billing.PlanFor(checkout.Product.ID), CreatedAt: now.Truncate(time.Microsecond)})
			}
		}
		// Record the disputed payment before verifying, so the snapshot
		// withdraws it even while Creem still reports it as paid.
		if disputed := event.Object.Transaction.ID; event.Type == "dispute.created" && disputed != "" && !slices.Contains(account.Billing.DisputedTransactions, disputed) {
			if len(account.Billing.DisputedTransactions) >= 64 {
				return false, errors.New("dispute limit exceeded")
			}
			account.Billing.DisputedTransactions = append(account.Billing.DisputedTransactions, disputed)
		}
		return true, nil
	}, func(account *Account, snapshot billing.State) {
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
		a.applyBilling(account, snapshot, now)
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

// billingOffers lists the plans the paywall may show, with Creem's prices.
func (a *App) billingOffers(w http.ResponseWriter, r *http.Request) {
	if !a.billingAvailable() {
		writeJSON(w, 200, map[string]any{"offers": []billing.Offer{}})
		return
	}
	if !a.allow("billing-offers:"+a.clientIP(r), 60) {
		writeError(w, 429, "too many requests; try again in a minute")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	writeJSON(w, 200, map[string]any{"offers": a.billing.Offers(ctx, a.now().UTC())})
}
