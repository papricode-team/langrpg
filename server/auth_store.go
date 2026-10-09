package main

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

var ErrCredentialsConflict = errors.New("account credentials already exist")

func (s *JSONStore) SetCredentials(_ context.Context, hash, email, encoded string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	id, ok := s.state.Sessions[hash]
	if !ok {
		return ErrUnauthorized
	}
	previous := s.state.Accounts[id]
	if previous.Email != "" {
		return ErrCredentialsConflict
	}
	for _, account := range s.state.Accounts {
		if account.Email == email {
			return ErrCredentialsConflict
		}
	}
	account := cloneAccount(previous)
	account.Email, account.PasswordHash = email, encoded
	s.state.Accounts[id] = account
	if err := s.save(); err != nil {
		s.state.Accounts[id] = previous
		return err
	}
	return nil
}

func (s *JSONStore) GetByEmail(_ context.Context, email string) (Account, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, account := range s.state.Accounts {
		if account.Email == email && email != "" {
			return cloneAccount(account), nil
		}
	}
	return Account{}, ErrUnauthorized
}

func (s *JSONStore) AddSession(_ context.Context, hash, id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.state.Accounts[id]; !ok {
		return ErrUnauthorized
	}
	s.state.Sessions[hash] = id
	if err := s.save(); err != nil {
		delete(s.state.Sessions, hash)
		return err
	}
	return nil
}

func (s *PGStore) SetCredentials(ctx context.Context, hash, email, encoded string) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	var id string
	var data []byte
	err = tx.QueryRow(ctx, "SELECT a.id,a.data FROM accounts a JOIN sessions s ON s.account_id=a.id WHERE s.token_hash=$1 FOR UPDATE OF a", hash).Scan(&id, &data)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrUnauthorized
	}
	if err != nil {
		return err
	}
	var account Account
	if err = json.Unmarshal(data, &account); err != nil {
		return err
	}
	if account.Email != "" {
		return ErrCredentialsConflict
	}
	account.Email, account.PasswordHash = email, encoded
	data, err = json.Marshal(account)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, "UPDATE accounts SET data=$2 WHERE id=$1", id, data)
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		return ErrCredentialsConflict
	}
	if err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (s *PGStore) GetByEmail(ctx context.Context, email string) (Account, error) {
	var data []byte
	err := s.pool.QueryRow(ctx, "SELECT data FROM accounts WHERE data->>'email'=$1", email).Scan(&data)
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

func (s *PGStore) AddSession(ctx context.Context, hash, id string) error {
	_, err := s.pool.Exec(ctx, "INSERT INTO sessions(token_hash,account_id) VALUES($1,$2)", hash, id)
	return err
}
