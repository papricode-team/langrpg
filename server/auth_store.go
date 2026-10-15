package main

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

var ErrCredentialsConflict = errors.New("account credentials already exist")
var ErrCredentialsChanged = errors.New("account credentials changed; try again with your current password")

type CredentialChange struct {
	PreviousEmail, PreviousHash string
	Email, PasswordHash         string
}

// Compare the credentials that were verified before hashing, under the same
// lock as the write. Concurrent edits cannot restore an old email or password.
func (change CredentialChange) apply(account *Account) error {
	if account.Email == "" || account.Email != change.PreviousEmail || account.PasswordHash != change.PreviousHash {
		return ErrCredentialsChanged
	}
	account.Email, account.PasswordHash = change.Email, change.PasswordHash
	account.Support.Reset = PasswordReset{}
	// Their tokens are revoked with every other session of the account.
	account.Support.Sessions = nil
	return nil
}

// ChangeCredentials also revokes every other session of the account, keeping
// only the caller's: a stolen token must not survive a password change.
func (s *JSONStore) ChangeCredentials(_ context.Context, hash string, change CredentialChange) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	id, ok := s.sessionLocked(hash)
	if !ok {
		return ErrUnauthorized
	}
	for otherID, other := range s.state.Accounts {
		if otherID != id && other.Email == change.Email {
			return ErrCredentialsConflict
		}
	}
	previous := s.state.Accounts[id]
	account := cloneAccount(previous)
	if err := change.apply(&account); err != nil {
		return err
	}
	removed := map[string]time.Time{}
	for other, owner := range s.state.Sessions {
		if owner == id && other != hash {
			removed[other] = s.state.SessionUse[other]
			s.dropSessionLocked(other)
		}
	}
	s.state.Accounts[id] = account
	if err := s.save(); err != nil {
		s.state.Accounts[id] = previous
		for other, used := range removed {
			s.state.Sessions[other] = id
			if !used.IsZero() {
				s.touchSessionLocked(other, used)
			}
		}
		return err
	}
	return nil
}

// ChangeCredentials updates the account and deletes every other session of it
// in one transaction, keeping only the caller's session.
func (s *PGStore) ChangeCredentials(ctx context.Context, hash string, change CredentialChange) error {
	err := s.changeCredentials(ctx, hash, change)
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		return ErrCredentialsConflict
	}
	return err
}

func (s *PGStore) changeCredentials(ctx context.Context, hash string, change CredentialChange) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	id, data, err := s.lockSessionAccount(ctx, tx, hash)
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
	ensureProgress(&account.Progress)
	if err = change.apply(&account); err != nil {
		return err
	}
	if data, err = json.Marshal(account); err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, "UPDATE accounts SET data=$2 WHERE id=$1", id, data); err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, "DELETE FROM sessions WHERE account_id=$1 AND token_hash<>$2", id, hash); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (s *JSONStore) SetCredentials(ctx context.Context, hash, email, encoded string) error {
	return s.RegisterWithReferral(ctx, hash, email, encoded, "", time.Now().UTC())
}

func (s *JSONStore) RegisterWithReferral(_ context.Context, hash, email, encoded, referralID string, now time.Time) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	id, ok := s.sessionLocked(hash)
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
	previousInviter, exists := s.state.Accounts[referralID]
	inviter := cloneAccount(previousInviter)
	credited := exists && creditReferral(&account, &inviter, email, now)
	account.Email, account.PasswordHash = email, encoded
	account.Analytics.RegisteredAt = now
	s.state.Accounts[id] = account
	previousUse, hadUse := s.state.SessionUse[hash]
	s.touchSessionLocked(hash, s.sessionNow())
	if credited {
		s.state.Accounts[referralID] = inviter
	}
	if err := s.save(); err != nil {
		s.state.Accounts[id] = previous
		if credited {
			s.state.Accounts[referralID] = previousInviter
		}
		if hadUse {
			s.touchSessionLocked(hash, previousUse)
		}
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
	s.touchSessionLocked(hash, s.sessionNow())
	if err := s.save(); err != nil {
		s.dropSessionLocked(hash)
		return err
	}
	return nil
}

func (s *PGStore) SetCredentials(ctx context.Context, hash, email, encoded string) error {
	return s.RegisterWithReferral(ctx, hash, email, encoded, "", time.Now().UTC())
}

func (s *PGStore) RegisterWithReferral(ctx context.Context, hash, email, encoded, referralID string, now time.Time) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	var id string
	err = tx.QueryRow(ctx, "SELECT account_id FROM sessions WHERE token_hash=$1", hash).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrUnauthorized
	}
	if err != nil {
		return err
	}
	ids := []string{id}
	if referralID != "" && referralID != id {
		ids = append(ids, referralID)
	}
	// Every registration locks both accounts in the same order. Concurrent
	// signups for an inviter cannot lose a credit or deadlock with another pair.
	rows, err := tx.Query(ctx, "SELECT id,data FROM accounts WHERE id=ANY($1::text[]) ORDER BY id FOR UPDATE", ids)
	if err != nil {
		return err
	}
	accounts := map[string]Account{}
	for rows.Next() {
		var rowID string
		var data []byte
		var account Account
		if err = rows.Scan(&rowID, &data); err == nil {
			err = json.Unmarshal(data, &account)
		}
		if err != nil {
			rows.Close()
			return err
		}
		accounts[rowID] = account
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	account, exists := accounts[id]
	if !exists {
		return ErrUnauthorized
	}
	if account.Email != "" {
		return ErrCredentialsConflict
	}
	inviter, exists := accounts[referralID]
	credited := exists && creditReferral(&account, &inviter, email, now)
	account.Email, account.PasswordHash = email, encoded
	account.Analytics.RegisteredAt = now
	data, err := json.Marshal(account)
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
	// Linking an email starts this session's idle clock now, even if the guest
	// session itself was dormant for longer than the idle limit.
	if _, err = tx.Exec(ctx, "UPDATE sessions SET last_used_at=$2 WHERE token_hash=$1", hash, s.sessionNow()); err != nil {
		return err
	}
	if credited {
		data, err = json.Marshal(inviter)
		if err != nil {
			return err
		}
		if _, err = tx.Exec(ctx, "UPDATE accounts SET data=$2 WHERE id=$1", referralID, data); err != nil {
			return err
		}
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

// DeleteSession revokes only this device's token, preserving the account and other sessions.
func (s *JSONStore) DeleteSession(_ context.Context, hash string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	id, exists := s.state.Sessions[hash]
	if !exists {
		return nil
	}
	used, hadUse := s.state.SessionUse[hash]
	s.dropSessionLocked(hash)
	if err := s.save(); err != nil {
		s.state.Sessions[hash] = id
		if hadUse {
			s.touchSessionLocked(hash, used)
		}
		return err
	}
	return nil
}

func (s *PGStore) DeleteSession(ctx context.Context, hash string) error {
	_, err := s.pool.Exec(ctx, "DELETE FROM sessions WHERE token_hash=$1", hash)
	return err
}
