package store

import (
	"context"
	"errors"
	"sort"
	"time"

	"github.com/jackc/pgx/v5"
)

// AdminToken lets a tool act as an administrator, for example an agent editing
// the world. Only the token's hash is stored.
type AdminToken struct {
	ID        string     `json:"id"`
	AccountID string     `json:"accountId"`
	Name      string     `json:"name"`
	Hash      string     `json:"hash,omitempty"`
	CreatedAt time.Time  `json:"createdAt"`
	LastUsed  *time.Time `json:"lastUsedAt,omitempty"`
	RevokedAt *time.Time `json:"revokedAt,omitempty"`
}

type AdminTokens interface {
	CreateAdminToken(context.Context, AdminToken) error
	// AdminTokenAccount returns the account of a live token and records its use.
	AdminTokenAccount(ctx context.Context, hash string) (Account, error)
	ListAdminTokens(context.Context) ([]AdminToken, error)
	RevokeAdminToken(ctx context.Context, id string) error
}

// Token use is recorded at most once a minute.
const adminTokenTouch = time.Minute

func (s *JSONStore) CreateAdminToken(_ context.Context, token AdminToken) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.state.Accounts[token.AccountID]; !ok {
		return ErrNotFound
	}
	if s.state.AdminTokens == nil {
		s.state.AdminTokens = map[string]AdminToken{}
	}
	s.state.AdminTokens[token.ID] = token
	if err := s.save(); err != nil {
		delete(s.state.AdminTokens, token.ID)
		return err
	}
	return nil
}

func (s *JSONStore) AdminTokenAccount(_ context.Context, hash string) (Account, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for id, token := range s.state.AdminTokens {
		if token.Hash != hash || token.RevokedAt != nil {
			continue
		}
		account, ok := s.state.Accounts[token.AccountID]
		if !ok {
			return Account{}, ErrUnauthorized
		}
		now := time.Now().UTC()
		if token.LastUsed == nil || now.Sub(*token.LastUsed) > adminTokenTouch {
			token.LastUsed = &now
			s.state.AdminTokens[id] = token
			_ = s.save()
		}
		return s.hooks.clone(account), nil
	}
	return Account{}, ErrUnauthorized
}

func (s *JSONStore) ListAdminTokens(_ context.Context) ([]AdminToken, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	tokens := []AdminToken{}
	for _, token := range s.state.AdminTokens {
		token.Hash = ""
		tokens = append(tokens, token)
	}
	sort.Slice(tokens, func(i, j int) bool { return tokens[i].CreatedAt.After(tokens[j].CreatedAt) })
	return tokens, nil
}

func (s *JSONStore) RevokeAdminToken(_ context.Context, id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	token, ok := s.state.AdminTokens[id]
	if !ok {
		return ErrNotFound
	}
	if token.RevokedAt != nil {
		return nil
	}
	now := time.Now().UTC()
	token.RevokedAt = &now
	s.state.AdminTokens[id] = token
	if err := s.save(); err != nil {
		token.RevokedAt = nil
		s.state.AdminTokens[id] = token
		return err
	}
	return nil
}

func (s *PGStore) CreateAdminToken(ctx context.Context, token AdminToken) error {
	_, err := s.pool.Exec(ctx, "INSERT INTO admin_tokens(id,account_id,name,token_hash,created_at) VALUES($1,$2,$3,$4,$5)", token.ID, token.AccountID, token.Name, token.Hash, token.CreatedAt)
	return err
}

func (s *PGStore) AdminTokenAccount(ctx context.Context, hash string) (Account, error) {
	var id, accountID string
	var lastUsed *time.Time
	err := s.pool.QueryRow(ctx, "SELECT id,account_id,last_used_at FROM admin_tokens WHERE token_hash=$1 AND revoked_at IS NULL", hash).Scan(&id, &accountID, &lastUsed)
	if errors.Is(err, pgx.ErrNoRows) {
		return Account{}, ErrUnauthorized
	}
	if err != nil {
		return Account{}, err
	}
	if lastUsed == nil || time.Since(*lastUsed) > adminTokenTouch {
		// Recording use is best effort; a failed touch never fails a request.
		_, _ = s.pool.Exec(ctx, "UPDATE admin_tokens SET last_used_at=NOW() WHERE id=$1", id)
	}
	return s.GetAccountByID(ctx, accountID)
}

func (s *PGStore) ListAdminTokens(ctx context.Context) ([]AdminToken, error) {
	rows, err := s.pool.Query(ctx, "SELECT id,account_id,name,created_at,last_used_at,revoked_at FROM admin_tokens ORDER BY created_at DESC")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	tokens := []AdminToken{}
	for rows.Next() {
		var token AdminToken
		if err := rows.Scan(&token.ID, &token.AccountID, &token.Name, &token.CreatedAt, &token.LastUsed, &token.RevokedAt); err != nil {
			return nil, err
		}
		tokens = append(tokens, token)
	}
	return tokens, rows.Err()
}

func (s *PGStore) RevokeAdminToken(ctx context.Context, id string) error {
	result, err := s.pool.Exec(ctx, "UPDATE admin_tokens SET revoked_at=COALESCE(revoked_at,NOW()) WHERE id=$1", id)
	if err != nil {
		return err
	}
	if result.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}
