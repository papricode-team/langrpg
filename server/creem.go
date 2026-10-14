package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/url"
	"time"
)

// CreemPurchase only contains references obtained through server-created
// checkouts. Customer email and redirect parameters never establish ownership.
type CreemPurchase struct {
	CheckoutID     string    `json:"checkoutId"`
	RequestID      string    `json:"requestId"`
	ProductID      string    `json:"productId"`
	CreatedAt      time.Time `json:"createdAt"`
	CustomerID     string    `json:"customerId,omitempty"`
	SubscriptionID string    `json:"subscriptionId,omitempty"`
	OrderID        string    `json:"orderId,omitempty"`
	TransactionID  string    `json:"transactionId,omitempty"`
}

// Creem references can be bare IDs or expanded objects, depending on endpoint.
type creemRef struct {
	ID string `json:"id"`
}

func (r *creemRef) UnmarshalJSON(data []byte) error {
	if string(data) == "null" {
		r.ID = ""
		return nil
	}
	if len(data) > 0 && data[0] == '"' {
		return json.Unmarshal(data, &r.ID)
	}
	type ref creemRef
	return json.Unmarshal(data, (*ref)(r))
}

type creemCheckout struct {
	ID           string            `json:"id"`
	Mode         string            `json:"mode"`
	Status       string            `json:"status"`
	RequestID    string            `json:"request_id"`
	URL          string            `json:"checkout_url"`
	Product      creemRef          `json:"product"`
	Customer     creemRef          `json:"customer"`
	Subscription creemRef          `json:"subscription"`
	Metadata     map[string]string `json:"metadata"`
	Order        struct {
		ID          string   `json:"id"`
		Status      string   `json:"status"`
		Currency    string   `json:"currency"`
		Product     creemRef `json:"product"`
		Customer    creemRef `json:"customer"`
		Transaction creemRef `json:"transaction"`
	} `json:"order"`
}
type creemSubscription struct {
	ID                 string    `json:"id"`
	Mode               string    `json:"mode"`
	Product            creemRef  `json:"product"`
	Customer           creemRef  `json:"customer"`
	Status             string    `json:"status"`
	LastTransactionID  string    `json:"last_transaction_id"`
	CurrentPeriodStart time.Time `json:"current_period_start_date"`
	CurrentPeriodEnd   time.Time `json:"current_period_end_date"`
}
type creemTransaction struct {
	ID             string   `json:"id"`
	Mode           string   `json:"mode"`
	Currency       string   `json:"currency"`
	Type           string   `json:"type"`
	Status         string   `json:"status"`
	AmountPaid     int64    `json:"amount_paid"`
	RefundedAmount int64    `json:"refunded_amount"`
	Order          creemRef `json:"order"`
	Subscription   creemRef `json:"subscription"`
	Customer       creemRef `json:"customer"`
	CreatedAt      int64    `json:"created_at"`
	PeriodStart    int64    `json:"period_start"`
	PeriodEnd      int64    `json:"period_end"`
}

func creemTime(timestamp int64) time.Time {
	if timestamp > 100000000000 {
		return time.UnixMilli(timestamp).UTC()
	}
	return time.Unix(timestamp, 0).UTC()
}
func (p *CreemBilling) modeMatches(mode string) bool {
	if p.baseURL == "https://test-api.creem.io" {
		return mode == "test" || mode == "sandbox"
	}
	return mode == "prod"
}
func (p *CreemBilling) get(ctx context.Context, resource, key, id string, output any) error {
	if id == "" {
		return errors.New("missing Creem reference")
	}
	return p.request(ctx, "GET", "/v1/"+resource+"?"+url.Values{key: {id}}.Encode(), nil, output)
}
func (p *CreemBilling) checkoutBelongsTo(c creemCheckout, accountID, reference string) bool {
	return c.ID != "" && c.RequestID != "" && p.modeMatches(c.Mode) && reference != "" && c.Metadata["account_id"] == accountID && c.Metadata["billing_reference"] == reference && (c.Product.ID == p.monthlyProduct || c.Product.ID == p.yearlyProduct || c.Product.ID == p.lifetimeProduct)
}
func (p *CreemBilling) paidTransaction(t creemTransaction, customer string) bool {
	return t.ID != "" && p.modeMatches(t.Mode) && t.Customer.ID == customer && customer != "" && t.Status == "paid" && t.Currency == "EUR" && t.AmountPaid > 0 && t.RefundedAmount == 0
}
func (p *CreemBilling) snapshot(ctx context.Context, accountID string, previous BillingState, now time.Time) (BillingState, error) {
	result := BillingState{Reference: previous.Reference, VerifiedAt: now, Purchases: append([]CreemPurchase(nil), previous.Purchases...)}
	for i := range result.Purchases {
		purchase := &result.Purchases[i]
		if purchase.CustomerID == "" {
			var checkout creemCheckout
			if err := p.get(ctx, "checkouts", "checkout_id", purchase.CheckoutID, &checkout); err != nil {
				return BillingState{}, err
			}
			if !p.checkoutBelongsTo(checkout, accountID, previous.Reference) || checkout.ID != purchase.CheckoutID || checkout.RequestID != purchase.RequestID || checkout.Product.ID != purchase.ProductID {
				return BillingState{}, errors.New("Creem checkout identity mismatch")
			}
			if checkout.Status != "completed" {
				continue
			}
			if checkout.Customer.ID == "" || checkout.Order.ID == "" || checkout.Order.Customer.ID != checkout.Customer.ID || checkout.Order.Product.ID != purchase.ProductID || checkout.Order.Currency != "EUR" || checkout.Order.Status != "paid" {
				continue
			}
			purchase.CustomerID, purchase.SubscriptionID, purchase.OrderID, purchase.TransactionID = checkout.Customer.ID, checkout.Subscription.ID, checkout.Order.ID, checkout.Order.Transaction.ID
		}
		if purchase.ProductID == p.lifetimeProduct && purchase.SubscriptionID == "" {
			var transaction creemTransaction
			if err := p.get(ctx, "transactions", "transaction_id", purchase.TransactionID, &transaction); err != nil {
				return BillingState{}, err
			}
			if transaction.ID == purchase.TransactionID && p.paidTransaction(transaction, purchase.CustomerID) && transaction.Order.ID == purchase.OrderID && transaction.Subscription.ID == "" && transaction.Type == "payment" {
				result.Plan, result.CustomerID, result.LifetimeOrderID = "lifetime", purchase.CustomerID, purchase.OrderID
			}
			continue
		}
		plan := "monthly"
		if purchase.ProductID == p.yearlyProduct {
			plan = "yearly"
		}
		if (purchase.ProductID != p.monthlyProduct && purchase.ProductID != p.yearlyProduct) || purchase.SubscriptionID == "" {
			continue
		}
		var subscription creemSubscription
		if err := p.get(ctx, "subscriptions", "subscription_id", purchase.SubscriptionID, &subscription); err != nil {
			return BillingState{}, err
		}
		if subscription.ID != purchase.SubscriptionID || !p.modeMatches(subscription.Mode) || subscription.Product.ID != purchase.ProductID || subscription.Customer.ID != purchase.CustomerID {
			return BillingState{}, errors.New("Creem subscription identity mismatch")
		}
		if subscription.Status != "active" && subscription.Status != "scheduled_cancel" && subscription.Status != "canceled" && subscription.Status != "past_due" {
			continue
		}
		if subscription.CurrentPeriodStart.After(now) || !subscription.CurrentPeriodEnd.After(now) || subscription.LastTransactionID == "" {
			continue
		}
		var transaction creemTransaction
		if err := p.get(ctx, "transactions", "transaction_id", subscription.LastTransactionID, &transaction); err != nil {
			return BillingState{}, err
		}
		if transaction.ID != subscription.LastTransactionID || !p.paidTransaction(transaction, purchase.CustomerID) || transaction.Subscription.ID != subscription.ID || transaction.Type != "invoice" {
			continue
		}
		// A nominally active subscription is insufficient: its latest unrefunded
		// payment must cover the current period. VAT-inclusive subtotals may vary.
		coversPeriod := transaction.CreatedAt > 0 && !creemTime(transaction.CreatedAt).Before(subscription.CurrentPeriodStart.Add(-5*time.Minute))
		if transaction.PeriodEnd > 0 {
			coversPeriod = !creemTime(transaction.PeriodEnd).Before(subscription.CurrentPeriodEnd.Add(-time.Second))
		}
		if coversPeriod && result.Plan != "lifetime" && subscription.CurrentPeriodEnd.After(result.PaidUntil) {
			result.Plan, result.CustomerID, result.SubscriptionID, result.PaidUntil = plan, purchase.CustomerID, subscription.ID, subscription.CurrentPeriodEnd
		}
	}
	// A known customer remains available for managing canceled or refunded plans.
	if result.CustomerID == "" {
		result.CustomerID = previous.CustomerID
	}
	return result, nil
}
