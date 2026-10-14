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
// webhook can never overwrite a later, authoritative Polar snapshot.
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
