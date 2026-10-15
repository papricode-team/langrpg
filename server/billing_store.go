package main

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/jackc/pgx/v5"
)

func (s *JSONStore) GetAccountByID(_ context.Context, id string) (Account, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	account, ok := s.state.Accounts[id]
	if !ok {
		return Account{}, ErrUnauthorized
	}
	return cloneAccount(account), nil
}

// Reconciliation runs inside the same account lock as its write. An older
// webhook can never overwrite a later, authoritative Creem snapshot.
func (s *JSONStore) UpdateAccountByID(_ context.Context, id string, fn func(*Account) error) (Account, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	previous, ok := s.state.Accounts[id]
	if !ok {
		return Account{}, ErrUnauthorized
	}
	account := cloneAccount(previous)
	if err := fn(&account); err != nil {
		return Account{}, err
	}
	s.state.Accounts[id] = account
	if err := s.save(); err != nil {
		s.state.Accounts[id] = previous
		return Account{}, err
	}
	return cloneAccount(account), nil
}

func (s *PGStore) GetAccountByID(ctx context.Context, id string) (Account, error) {
	var data []byte
	err := s.pool.QueryRow(ctx, "SELECT data FROM accounts WHERE id=$1", id).Scan(&data)
	if errors.Is(err, pgx.ErrNoRows) {
		return Account{}, ErrUnauthorized
	}
	if err != nil {
		return Account{}, err
	}
	var account Account
	err = json.Unmarshal(data, &account)
	ensureProgress(&account.Progress)
	return account, err
}

func (s *PGStore) UpdateAccountByID(ctx context.Context, id string, fn func(*Account) error) (Account, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Account{}, err
	}
	defer tx.Rollback(ctx)
	var data []byte
	err = tx.QueryRow(ctx, "SELECT data FROM accounts WHERE id=$1 FOR UPDATE", id).Scan(&data)
	if errors.Is(err, pgx.ErrNoRows) {
		return Account{}, ErrUnauthorized
	}
	if err != nil {
		return Account{}, err
	}
	var account Account
	if err = json.Unmarshal(data, &account); err != nil {
		return Account{}, err
	}
	ensureProgress(&account.Progress)
	if err = fn(&account); err != nil {
		return Account{}, err
	}
	data, err = json.Marshal(account)
	if err != nil {
		return Account{}, err
	}
	if _, err = tx.Exec(ctx, "UPDATE accounts SET data=$2 WHERE id=$1", id, data); err != nil {
		return Account{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return Account{}, err
	}
	return account, nil
}

// Locate refunds/disputes by payment references, never by an email address or
// customer alone (one Creem customer can have purchases for several accounts).
func billingPurchaseMatches(billing BillingState, subscriptionID, transactionID string) bool {
	for _, purchase := range billing.Purchases {
		if subscriptionID != "" && purchase.SubscriptionID == subscriptionID || transactionID != "" && purchase.TransactionID == transactionID {
			return true
		}
	}
	return false
}
func (s *JSONStore) FindBillingAccount(_ context.Context, subscriptionID, transactionID string) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for id, account := range s.state.Accounts {
		if billingPurchaseMatches(account.Billing, subscriptionID, transactionID) {
			return id, nil
		}
	}
	return "", ErrUnauthorized
}
func (s *PGStore) FindBillingAccount(ctx context.Context, subscriptionID, transactionID string) (string, error) {
	if subscriptionID == "" && transactionID == "" {
		return "", ErrUnauthorized
	}
	// JSONB containment is served by the accounts_billing_purchases GIN index
	// (jsonb_path_ops); each reference is looked up separately so an empty
	// one never widens the match.
	var id string
	err := pgx.ErrNoRows
	for _, match := range []struct{ key, value string }{{"subscriptionId", subscriptionID}, {"transactionId", transactionID}} {
		if match.value == "" {
			continue
		}
		purchase, _ := json.Marshal([]map[string]string{{match.key: match.value}})
		err = s.pool.QueryRow(ctx, `SELECT id FROM accounts WHERE data->'billing'->'purchases' @> $1::jsonb LIMIT 1`, purchase).Scan(&id)
		if !errors.Is(err, pgx.ErrNoRows) {
			break
		}
	}
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrUnauthorized
	}
	return id, err
}
