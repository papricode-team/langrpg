package billing

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"slices"
	"time"
)

// Purchase only contains references obtained through server-created
// checkouts. Customer email and redirect parameters never establish ownership.
type Purchase struct {
	CheckoutID     string    `json:"checkoutId"`
	RequestID      string    `json:"requestId"`
	ProductID      string    `json:"productId"`
	CreatedAt      time.Time `json:"createdAt"`
	CustomerID     string    `json:"customerId,omitempty"`
	SubscriptionID string    `json:"subscriptionId,omitempty"`
	OrderID        string    `json:"orderId,omitempty"`
	TransactionID  string    `json:"transactionId,omitempty"`
	// Plan is fixed when the purchase is recorded, so later product ID changes
	// never revoke what was bought.
	Plan string `json:"plan,omitempty"`
}

// Creem references can be bare IDs or expanded objects, depending on endpoint.
type Ref struct {
	ID string `json:"id"`
}

func (r *Ref) UnmarshalJSON(data []byte) error {
	if string(data) == "null" {
		r.ID = ""
		return nil
	}
	if len(data) > 0 && data[0] == '"' {
		return json.Unmarshal(data, &r.ID)
	}
	type ref Ref
	return json.Unmarshal(data, (*ref)(r))
}

type Checkout struct {
	ID           string            `json:"id"`
	Mode         string            `json:"mode"`
	Status       string            `json:"status"`
	RequestID    string            `json:"request_id"`
	URL          string            `json:"checkout_url"`
	Product      Ref               `json:"product"`
	Customer     Ref               `json:"customer"`
	Subscription Ref               `json:"subscription"`
	Metadata     map[string]string `json:"metadata"`
	Order        struct {
		ID          string `json:"id"`
		Status      string `json:"status"`
		Currency    string `json:"currency"`
		Product     Ref    `json:"product"`
		Customer    Ref    `json:"customer"`
		Transaction Ref    `json:"transaction"`
	} `json:"order"`
}
type Subscription struct {
	ID                 string    `json:"id"`
	Mode               string    `json:"mode"`
	Product            Ref       `json:"product"`
	Customer           Ref       `json:"customer"`
	Status             string    `json:"status"`
	LastTransactionID  string    `json:"last_transaction_id"`
	CurrentPeriodStart time.Time `json:"current_period_start_date"`
	CurrentPeriodEnd   time.Time `json:"current_period_end_date"`
}
type Transaction struct {
	ID             string `json:"id"`
	Mode           string `json:"mode"`
	Currency       string `json:"currency"`
	Type           string `json:"type"`
	Status         string `json:"status"`
	AmountPaid     int64  `json:"amount_paid"`
	RefundedAmount int64  `json:"refunded_amount"`
	Order          Ref    `json:"order"`
	Subscription   Ref    `json:"subscription"`
	Customer       Ref    `json:"customer"`
	CreatedAt      int64  `json:"created_at"`
	PeriodStart    int64  `json:"period_start"`
	PeriodEnd      int64  `json:"period_end"`
}

func Time(timestamp int64) time.Time {
	if timestamp > 100000000000 {
		return time.UnixMilli(timestamp).UTC()
	}
	return time.Unix(timestamp, 0).UTC()
}
func (p *Client) ModeMatches(mode string) bool {
	if p.BaseURL == "https://test-api.creem.io" {
		return mode == "test" || mode == "sandbox"
	}
	return mode == "prod"
}
func (p *Client) Get(ctx context.Context, resource, key, id string, output any) error {
	if id == "" {
		return errors.New("missing Creem reference")
	}
	return p.Request(ctx, "GET", "/v1/"+resource+"?"+url.Values{key: {id}}.Encode(), nil, output)
}

// PlanFor maps a configured product to its plan, or "" for any other product.
func (p *Client) PlanFor(product string) string {
	switch {
	case product == "":
		return ""
	case product == p.MonthlyProduct:
		return "monthly"
	case product == p.YearlyProduct:
		return "yearly"
	case product == p.LifetimeProduct:
		return "lifetime"
	}
	return ""
}

// checkoutBound reports a checkout created by this server for the account.
func (p *Client) checkoutBound(c Checkout, accountID, reference string) bool {
	return c.ID != "" && c.RequestID != "" && p.ModeMatches(c.Mode) && reference != "" && c.Metadata["account_id"] == accountID && c.Metadata["billing_reference"] == reference
}

// CheckoutBelongsTo admits a new checkout only for a currently offered product.
// Purchases already recorded keep their plan when product IDs change later.
func (p *Client) CheckoutBelongsTo(c Checkout, accountID, reference string) bool {
	return p.checkoutBound(c, accountID, reference) && p.PlanFor(c.Product.ID) != ""
}
func (p *Client) paidTransaction(t Transaction, customer string, disputed []string) bool {
	return t.ID != "" && p.ModeMatches(t.Mode) && t.Customer.ID == customer && customer != "" && t.Status == "paid" && t.Currency == "EUR" && t.AmountPaid > 0 && t.RefundedAmount == 0 && !slices.Contains(disputed, t.ID)
}

// PendingCheckoutLifetime is how long an unpaid checkout is rechecked. After
// that it is dropped; a later signed checkout.completed webhook re-adds it.
const PendingCheckoutLifetime = 24 * time.Hour

// NotFound reports a Creem 404: the object does not exist for this key.
func NotFound(err error) bool {
	var status *HTTPError
	return errors.As(err, &status) && status.Status == http.StatusNotFound
}

// lookup fetches a Creem object. A missing reference or a 404 reports false
// without an error, so one unusable purchase never blocks the others; only a
// transient failure (outage, auth, bad response) aborts the snapshot.
func (p *Client) lookup(ctx context.Context, resource, key, id string, output any) (bool, error) {
	if id == "" {
		return false, nil
	}
	err := p.Get(ctx, resource, key, id, output)
	if NotFound(err) {
		return false, nil
	}
	return err == nil, err
}

// Snapshot verifies every recorded purchase with Creem. A purchase that can
// never grant access (unknown, mismatched, or an unpaid checkout older than
// PendingCheckoutLifetime) is dropped or skipped; it does not fail the rest.
func (p *Client) Snapshot(ctx context.Context, accountID string, previous State, now time.Time) (State, error) {
	result := State{Reference: previous.Reference, VerifiedAt: now, DisputedTransactions: append([]string(nil), previous.DisputedTransactions...)}
	granting := 0
	for _, purchase := range previous.Purchases {
		if purchase.Plan == "" {
			// Purchases recorded before plans were stored take today's mapping once.
			purchase.Plan = p.PlanFor(purchase.ProductID)
		}
		if purchase.CustomerID == "" {
			var checkout Checkout
			found, err := p.lookup(ctx, "checkouts", "checkout_id", purchase.CheckoutID, &checkout)
			if err != nil {
				return State{}, err
			}
			if !found || !p.checkoutBound(checkout, accountID, previous.Reference) || checkout.ID != purchase.CheckoutID || checkout.RequestID != purchase.RequestID || checkout.Product.ID != purchase.ProductID {
				continue
			}
			if checkout.Status != "completed" || checkout.Customer.ID == "" || checkout.Order.ID == "" || checkout.Order.Customer.ID != checkout.Customer.ID || checkout.Order.Product.ID != purchase.ProductID || checkout.Order.Currency != "EUR" || checkout.Order.Status != "paid" {
				if now.Sub(purchase.CreatedAt) < PendingCheckoutLifetime {
					result.Purchases = append(result.Purchases, purchase)
				}
				continue
			}
			purchase.CustomerID, purchase.SubscriptionID, purchase.OrderID, purchase.TransactionID = checkout.Customer.ID, checkout.Subscription.ID, checkout.Order.ID, checkout.Order.Transaction.ID
		}
		result.Purchases = append(result.Purchases, purchase)
		if purchase.Plan == "lifetime" {
			if purchase.SubscriptionID != "" {
				continue
			}
			var transaction Transaction
			found, err := p.lookup(ctx, "transactions", "transaction_id", purchase.TransactionID, &transaction)
			if err != nil {
				return State{}, err
			}
			if found && transaction.ID == purchase.TransactionID && p.paidTransaction(transaction, purchase.CustomerID, previous.DisputedTransactions) && transaction.Order.ID == purchase.OrderID && transaction.Subscription.ID == "" && transaction.Type == "payment" {
				granting++
				result.Plan, result.CustomerID, result.LifetimeOrderID = "lifetime", purchase.CustomerID, purchase.OrderID
			}
			continue
		}
		if (purchase.Plan != "monthly" && purchase.Plan != "yearly") || purchase.SubscriptionID == "" {
			continue
		}
		var subscription Subscription
		found, err := p.lookup(ctx, "subscriptions", "subscription_id", purchase.SubscriptionID, &subscription)
		if err != nil {
			return State{}, err
		}
		if !found || subscription.ID != purchase.SubscriptionID || !p.ModeMatches(subscription.Mode) || subscription.Product.ID != purchase.ProductID || subscription.Customer.ID != purchase.CustomerID {
			continue
		}
		if subscription.Status != "active" && subscription.Status != "scheduled_cancel" && subscription.Status != "canceled" && subscription.Status != "past_due" {
			continue
		}
		if subscription.CurrentPeriodStart.After(now) || !subscription.CurrentPeriodEnd.After(now) || subscription.LastTransactionID == "" {
			continue
		}
		var transaction Transaction
		found, err = p.lookup(ctx, "transactions", "transaction_id", subscription.LastTransactionID, &transaction)
		if err != nil {
			return State{}, err
		}
		if !found || transaction.ID != subscription.LastTransactionID || !p.paidTransaction(transaction, purchase.CustomerID, previous.DisputedTransactions) || transaction.Subscription.ID != subscription.ID || transaction.Type != "invoice" {
			continue
		}
		// A nominally active subscription is insufficient: its latest unrefunded
		// payment must cover the current period. VAT-inclusive subtotals may vary.
		coversPeriod := transaction.CreatedAt > 0 && !Time(transaction.CreatedAt).Before(subscription.CurrentPeriodStart.Add(-5*time.Minute))
		if transaction.PeriodEnd > 0 {
			coversPeriod = !Time(transaction.PeriodEnd).Before(subscription.CurrentPeriodEnd.Add(-time.Second))
		}
		if !coversPeriod {
			continue
		}
		granting++
		if result.Plan != "lifetime" && subscription.CurrentPeriodEnd.After(result.PaidUntil) {
			result.Plan, result.CustomerID, result.SubscriptionID, result.PaidUntil = purchase.Plan, purchase.CustomerID, subscription.ID, subscription.CurrentPeriodEnd
			result.SubscriptionStatus = subscription.Status
		}
	}
	// More than one paying purchase means the player was charged twice.
	result.OverlappingPurchases = max(0, granting-1)
	// A known customer remains available for managing canceled or refunded plans.
	if result.CustomerID == "" {
		result.CustomerID = previous.CustomerID
	}
	return result, nil
}
