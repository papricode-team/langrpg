package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"

	"github.com/jackc/pgx/v5"
)

func (s *JSONStore) UpdateAccount(_ context.Context, hash string, fn func(*Account) error) (Account, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	id, ok := s.sessionLocked(hash)
	if !ok {
		return Account{}, ErrUnauthorized
	}
	previous := s.state.Accounts[id]
	account := cloneAccount(previous)
	if err := fn(&account); err != nil {
		return Account{}, err
	}
	oldData, _ := json.Marshal(previous)
	newData, _ := json.Marshal(account)
	if bytes.Equal(oldData, newData) {
		return account, nil
	}
	s.state.Accounts[id] = account
	if err := s.save(); err != nil {
		s.state.Accounts[id] = previous
		return Account{}, err
	}
	return cloneAccount(account), nil
}

func (s *JSONStore) ResetGame(_ context.Context, hash string) (Account, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	id, ok := s.sessionLocked(hash)
	if !ok {
		return Account{}, ErrUnauthorized
	}
	previous := s.state.Accounts[id]
	account := cloneAccount(previous)
	if err := resetGameProgress(&account); err != nil {
		return Account{}, err
	}
	actions := s.state.Actions[id]
	s.state.Accounts[id] = account
	delete(s.state.Actions, id)
	if err := s.save(); err != nil {
		s.state.Accounts[id], s.state.Actions[id] = previous, actions
		return Account{}, err
	}
	return cloneAccount(account), nil
}

func (s *PGStore) UpdateAccount(ctx context.Context, hash string, fn func(*Account) error) (Account, error) {
	return s.updateSessionAccount(ctx, hash, false, fn)
}

func (s *PGStore) ResetGame(ctx context.Context, hash string) (Account, error) {
	return s.updateSessionAccount(ctx, hash, true, resetGameProgress)
}

func (s *PGStore) updateSessionAccount(ctx context.Context, hash string, clearEvents bool, fn func(*Account) error) (Account, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Account{}, err
	}
	defer tx.Rollback(ctx)
	var id string
	var previous []byte
	id, previous, err = s.lockSessionAccount(ctx, tx, hash)
	if errors.Is(err, pgx.ErrNoRows) {
		return Account{}, ErrUnauthorized
	}
	if err != nil {
		return Account{}, err
	}
	var account Account
	if err = json.Unmarshal(previous, &account); err != nil {
		return Account{}, err
	}
	ensureProgress(&account.Progress)
	before, err := json.Marshal(account)
	if err != nil {
		return Account{}, err
	}
	if err = fn(&account); err != nil {
		return Account{}, err
	}
	data, err := json.Marshal(account)
	if err != nil {
		return Account{}, err
	}
	if !clearEvents && bytes.Equal(before, data) {
		return account, tx.Commit(ctx)
	}
	if _, err = tx.Exec(ctx, "UPDATE accounts SET data=$2 WHERE id=$1", id, data); err != nil {
		return Account{}, err
	}
	if clearEvents {
		if _, err = tx.Exec(ctx, "DELETE FROM learning_events WHERE account_id=$1", id); err != nil {
			return Account{}, err
		}
	}
	if err = tx.Commit(ctx); err != nil {
		return Account{}, err
	}
	return account, nil
}
