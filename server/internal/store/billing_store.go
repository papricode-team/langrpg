package store

import (
	"context"
	"errors"
	"glotworld/server/internal/billing"

	"github.com/jackc/pgx/v5"
)

func (s *JSONStore) GetAccountByID(_ context.Context, id string) (Account, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	account, ok := s.state.Accounts[id]
	if !ok {
		return Account{}, ErrUnauthorized
	}
	return s.hooks.clone(account), nil
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
	account := s.hooks.clone(previous)
	if err := fn(&account); err != nil {
		return Account{}, err
	}
	s.state.Accounts[id] = account
	if err := s.save(); err != nil {
		s.state.Accounts[id] = previous
		return Account{}, err
	}
	return s.hooks.clone(account), nil
}

func (s *PGStore) GetAccountByID(ctx context.Context, id string) (Account, error) {
	_, account, err := s.scanAccount(s.pool.QueryRow(ctx, "SELECT "+pgAccountColumns+" FROM accounts a WHERE a.id=$1", id))
	if errors.Is(err, pgx.ErrNoRows) {
		return Account{}, ErrUnauthorized
	}
	return account, err
}

func (s *PGStore) UpdateAccountByID(ctx context.Context, id string, fn func(*Account) error) (Account, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Account{}, err
	}
	defer tx.Rollback(ctx)
	_, account, err := s.scanAccount(tx.QueryRow(ctx, "SELECT "+pgAccountColumns+" FROM accounts a WHERE a.id=$1 FOR UPDATE OF a", id))
	if errors.Is(err, pgx.ErrNoRows) {
		return Account{}, ErrUnauthorized
	}
	if err != nil {
		return Account{}, err
	}
	purchases := clonePurchases(account.Billing.Purchases)
	if err = fn(&account); err != nil {
		return Account{}, err
	}
	if err = s.writeAccount(ctx, tx, id, purchases, account); err != nil {
		return Account{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return Account{}, err
	}
	return account, nil
}

func (s *JSONStore) FindBillingAccount(_ context.Context, subscriptionID, transactionID string) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for id, account := range s.state.Accounts {
		if billing.PurchaseMatches(account.Billing, subscriptionID, transactionID) {
			return id, nil
		}
	}
	return "", ErrUnauthorized
}
func (s *PGStore) FindBillingAccount(ctx context.Context, subscriptionID, transactionID string) (string, error) {
	if subscriptionID == "" && transactionID == "" {
		return "", ErrUnauthorized
	}
	// Each reference is looked up separately, by its own partial index on
	// billing_purchases (the <>'' condition lets a generic plan use it), so an
	// empty one never widens the match.
	var id string
	err := pgx.ErrNoRows
	for _, match := range []struct{ column, value string }{{"subscription_id", subscriptionID}, {"transaction_id", transactionID}} {
		if match.value == "" {
			continue
		}
		err = s.pool.QueryRow(ctx, `SELECT account_id FROM billing_purchases WHERE `+match.column+`=$1 AND `+match.column+`<>'' ORDER BY account_id LIMIT 1`, match.value).Scan(&id)
		if !errors.Is(err, pgx.ErrNoRows) {
			break
		}
	}
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrUnauthorized
	}
	return id, err
}
