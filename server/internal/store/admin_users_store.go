package store

import (
	"context"
	"encoding/json"
	"errors"
	"glotworld/server/internal/billing"
	"glotworld/server/internal/world"
	"sort"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

func matchesAdminSearch(a Account, query, kind string) bool {
	return (kind != "registered" || a.Email != "") && (kind != "guest" || a.Email == "") &&
		(strings.Contains(strings.ToLower(a.Email), query) || strings.Contains(strings.ToLower(a.Player.Name), query) || strings.Contains(strings.ToLower(a.Player.ID), query))
}

// The directory never loads progress, credentials, reset secrets or support sessions.
func adminAccountSummary(a Account) Account {
	return Account{Player: world.Player{ID: a.Player.ID, Name: a.Player.Name}, Email: a.Email, CreatedAt: a.CreatedAt, Billing: billing.State{Plan: a.Billing.Plan, CustomerID: a.Billing.CustomerID, SubscriptionID: a.Billing.SubscriptionID, SubscriptionStatus: a.Billing.SubscriptionStatus, LifetimeOrderID: a.Billing.LifetimeOrderID, PaidUntil: a.Billing.PaidUntil, VerifiedAt: a.Billing.VerifiedAt}, Support: AccountSupport{Grant: a.Support.Grant}, ActiveCourseID: a.ActiveCourseID, Access: PlayAccess{PlayedNanoseconds: a.Access.PlayedNanoseconds, ResetTrial: a.Access.ResetTrial}, Referrals: a.Referrals}
}
func (s *JSONStore) ListAdminAccounts(_ context.Context, query, kind string, offset, limit int) ([]Account, int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	accounts := []Account{}
	for _, account := range s.state.Accounts {
		if matchesAdminSearch(account, query, kind) {
			accounts = append(accounts, adminAccountSummary(account))
		}
	}
	sort.Slice(accounts, func(i, j int) bool {
		if accounts[i].CreatedAt.Equal(accounts[j].CreatedAt) {
			return accounts[i].Player.ID < accounts[j].Player.ID
		}
		return accounts[i].CreatedAt.After(accounts[j].CreatedAt)
	})
	total := len(accounts)
	return accounts[min(offset, total):min(offset+limit, total)], total, nil
}
func (s *PGStore) ListAdminAccounts(ctx context.Context, query, kind string, offset, limit int) ([]Account, int, error) {
	const filter = ` WHERE ($2 <> 'registered' OR email IS NOT NULL) AND ($2 <> 'guest' OR email IS NULL) AND (strpos(lower(COALESCE(email,'')), $1)>0 OR strpos(lower(player_name), $1)>0 OR strpos(lower(id), $1)>0)`
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
	if err != nil {
		return nil, 0, err
	}
	defer tx.Rollback(ctx)
	var total int
	if err = tx.QueryRow(ctx, `SELECT count(*) FROM accounts`+filter, query, kind).Scan(&total); err != nil {
		return nil, 0, err
	}
	rows, err := tx.Query(ctx, `SELECT id,COALESCE(email,''),player_name,created_at,jsonb_build_object('billing',(data->'billing') - 'purchases' - 'webhookReceipts','support',jsonb_build_object('grant',data->'support'->'grant'),'access',data->'access','referrals',data->'referrals','activeCourseId',data->'activeCourseId') FROM accounts`+filter+` ORDER BY created_at DESC NULLS LAST,id LIMIT $3 OFFSET $4`, query, kind, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	accounts := []Account{}
	for rows.Next() {
		var data []byte
		var a Account
		var created *time.Time
		if err = rows.Scan(&a.Player.ID, &a.Email, &a.Player.Name, &created, &data); err == nil {
			err = json.Unmarshal(data, &a)
		}
		if created != nil {
			a.CreatedAt = created.UTC()
		}
		if err != nil {
			rows.Close()
			return nil, 0, err
		}
		accounts = append(accounts, adminAccountSummary(a))
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return nil, 0, err
	}
	return accounts, total, tx.Commit(ctx)
}

// Account changes, audit entries and session issuance/revocation commit together.
func (s *JSONStore) ManageAccount(_ context.Context, id string, revoke bool, newSession string, fn func(*Account) error) (Account, []string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	previous, ok := s.state.Accounts[id]
	if !ok {
		return Account{}, nil, ErrUnauthorized
	}
	account := s.hooks.clone(previous)
	if err := fn(&account); err != nil {
		return Account{}, nil, err
	}
	removed := []string{}
	if revoke {
		for hash, owner := range s.state.Sessions {
			if owner == id {
				removed = append(removed, hash)
				delete(s.state.Sessions, hash)
			}
		}
		previousUse := map[string]time.Time{}
		for _, hash := range removed {
			if at, ok := s.state.SessionUse[hash]; ok {
				previousUse[hash] = at
			}
			delete(s.state.SessionUse, hash)
		}
		defer func() {
			// Restore use timestamps if the save below failed and sessions came back.
			for hash, at := range previousUse {
				if _, back := s.state.Sessions[hash]; back {
					s.touchSessionLocked(hash, at)
				}
			}
		}()
		account.Support.Sessions = nil
		account.Access.ActiveSince = time.Time{}
		account.Access.ActiveUntil = time.Time{}
		account.Access.SessionLeases = nil
	}
	if newSession != "" {
		s.state.Sessions[newSession] = id
		s.touchSessionLocked(newSession, s.sessionNow())
	}
	s.state.Accounts[id] = account
	if err := s.save(); err != nil {
		s.state.Accounts[id] = previous
		if newSession != "" {
			s.dropSessionLocked(newSession)
		}
		for _, hash := range removed {
			s.state.Sessions[hash] = id
		}
		return Account{}, nil, err
	}
	return s.hooks.clone(account), removed, nil
}
func (s *PGStore) ManageAccount(ctx context.Context, id string, revoke bool, newSession string, fn func(*Account) error) (Account, []string, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Account{}, nil, err
	}
	defer tx.Rollback(ctx)
	_, account, err := s.scanAccount(tx.QueryRow(ctx, `SELECT `+pgAccountColumns+` FROM accounts a WHERE a.id=$1 FOR UPDATE OF a`, id))
	if errors.Is(err, pgx.ErrNoRows) {
		return Account{}, nil, ErrUnauthorized
	}
	if err != nil {
		return Account{}, nil, err
	}
	purchases := clonePurchases(account.Billing.Purchases)
	if err = fn(&account); err != nil {
		return Account{}, nil, err
	}
	removed := []string{}
	if revoke {
		rows, e := tx.Query(ctx, `DELETE FROM sessions WHERE account_id=$1 RETURNING token_hash`, id)
		if e != nil {
			return Account{}, nil, e
		}
		for rows.Next() {
			var hash string
			if e = rows.Scan(&hash); e != nil {
				rows.Close()
				return Account{}, nil, e
			}
			removed = append(removed, hash)
		}
		e = rows.Err()
		rows.Close()
		if e != nil {
			return Account{}, nil, e
		}
		account.Support.Sessions = nil
		account.Access.ActiveSince = time.Time{}
		account.Access.ActiveUntil = time.Time{}
		account.Access.SessionLeases = nil
	}
	if newSession != "" {
		if _, err = tx.Exec(ctx, `INSERT INTO sessions(token_hash,account_id) VALUES($1,$2)`, newSession, id); err != nil {
			return Account{}, nil, err
		}
	}
	if err = s.writeAccount(ctx, tx, id, purchases, account); err != nil {
		return Account{}, nil, err
	}
	if err = tx.Commit(ctx); err != nil {
		return Account{}, nil, err
	}
	return account, removed, nil
}
