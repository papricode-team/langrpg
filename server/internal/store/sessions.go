package store

import (
	"context"
	"fmt"
	"log/slog"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// Sessions of accounts with an email expire after this long without use; the
// holder can log in again. Guest sessions never expire: the bearer token is a
// guest's only credential, so expiring it would delete their adventure.
const DefaultSessionIdle = 90 * 24 * time.Hour

// Recording use costs a write, so it is refreshed at most hourly per session.
const sessionTouchInterval = time.Hour

func ParseSessionIdle(value string) (time.Duration, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return DefaultSessionIdle, nil
	}
	days, err := strconv.Atoi(value)
	if err != nil || days < 0 || days > 36500 {
		return 0, fmt.Errorf("SESSION_IDLE_DAYS must be a whole number of days from 0 (never expire) to 36500")
	}
	return time.Duration(days) * 24 * time.Hour, nil
}

// sessionIdlePolicy is shared by both stores. A zero idle disables expiry.
type sessionIdlePolicy struct {
	idle  time.Duration
	clock func() time.Time
}

func newSessionIdlePolicy() sessionIdlePolicy {
	return sessionIdlePolicy{idle: DefaultSessionIdle, clock: time.Now}
}

func (p *sessionIdlePolicy) SetSessionIdle(idle time.Duration) { p.idle = idle }

func (p *sessionIdlePolicy) sessionNow() time.Time {
	if p.clock == nil {
		return time.Now().UTC()
	}
	return p.clock().UTC()
}

// sessionCutoff is the oldest last use that still authenticates a linked
// account. With expiry disabled every timestamp qualifies.
func (p *sessionIdlePolicy) sessionCutoff(now time.Time) time.Time {
	if p.idle <= 0 {
		return time.Time{}
	}
	return now.Add(-p.idle)
}

func (p *sessionIdlePolicy) sessionExpired(account Account, lastUsed, now time.Time) bool {
	return p.idle > 0 && account.Email != "" && !lastUsed.IsZero() && lastUsed.Before(p.sessionCutoff(now))
}

// sessionLocked resolves a JSON-store session, rejecting idle linked sessions
// and recording use at most hourly. Callers hold s.mu.
func (s *JSONStore) sessionLocked(hash string) (string, bool) {
	id, ok := s.state.Sessions[hash]
	if !ok {
		return "", false
	}
	now := s.sessionNow()
	last, known := s.state.SessionUse[hash]
	if known && s.sessionExpired(s.state.Accounts[id], last, now) {
		return "", false
	}
	// A session saved before use tracking existed is treated as used now.
	if !known || now.Sub(last) >= sessionTouchInterval {
		s.touchSessionLocked(hash, now)
		if err := s.save(); err != nil {
			slog.Warn("session use was not saved", "error", err)
		}
	}
	return id, true
}

func (s *JSONStore) touchSessionLocked(hash string, now time.Time) {
	if s.state.SessionUse == nil {
		s.state.SessionUse = map[string]time.Time{}
	}
	s.state.SessionUse[hash] = now
}

func (s *JSONStore) dropSessionLocked(hash string) {
	delete(s.state.Sessions, hash)
	delete(s.state.SessionUse, hash)
}

// PruneExpiredSessions deletes idle sessions of linked accounts. Guest
// sessions are never pruned.
func (s *JSONStore) PruneExpiredSessions(context.Context) (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	now := s.sessionNow()
	type removed struct {
		hash, id string
		used     time.Time
	}
	var expired []removed
	for hash, id := range s.state.Sessions {
		if last, known := s.state.SessionUse[hash]; known && s.sessionExpired(s.state.Accounts[id], last, now) {
			expired = append(expired, removed{hash, id, last})
		}
	}
	if len(expired) == 0 {
		return 0, nil
	}
	for _, e := range expired {
		s.dropSessionLocked(e.hash)
	}
	if err := s.save(); err != nil {
		for _, e := range expired {
			s.state.Sessions[e.hash] = e.id
			s.touchSessionLocked(e.hash, e.used)
		}
		return 0, err
	}
	return len(expired), nil
}

// PruneExpiredSessions deletes idle sessions of linked accounts in one statement.
func (s *PGStore) PruneExpiredSessions(ctx context.Context) (int, error) {
	if s.idle <= 0 {
		return 0, nil
	}
	result, err := s.pool.Exec(ctx, `DELETE FROM sessions s USING accounts a WHERE a.id=s.account_id AND a.email IS NOT NULL AND s.last_used_at < $1`, s.sessionCutoff(s.sessionNow()))
	if err != nil {
		return 0, err
	}
	return int(result.RowsAffected()), nil
}

// pgLiveSession is appended to queries that join accounts a and sessions s.
// $2 is the idle cutoff from sessionCutoff.
const pgLiveSession = ` AND (s.last_used_at > $2 OR a.email IS NULL)`

type SessionPruner interface {
	PruneExpiredSessions(context.Context) (int, error)
}

// PruneSessionsPeriodically removes expired linked sessions hourly until ctx ends.
func PruneSessionsPeriodically(ctx context.Context, pruner SessionPruner, every time.Duration) {
	ticker := time.NewTicker(every)
	defer ticker.Stop()
	for {
		run, cancel := context.WithTimeout(ctx, time.Minute)
		count, err := pruner.PruneExpiredSessions(run)
		cancel()
		if err != nil && ctx.Err() == nil {
			slog.Warn("expired session cleanup failed", "error", err)
		} else if count > 0 {
			slog.Info("expired sessions removed", "count", count)
		}
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

type pgExecer interface {
	Exec(context.Context, string, ...any) (pgconn.CommandTag, error)
}

// touchSession records use when the stored timestamp is at least an hour old.
func (s *PGStore) touchSession(ctx context.Context, db pgExecer, hash string, lastUsed, now time.Time) error {
	if now.Sub(lastUsed) < sessionTouchInterval {
		return nil
	}
	_, err := db.Exec(ctx, `UPDATE sessions SET last_used_at=$2 WHERE token_hash=$1 AND last_used_at<$2`, hash, now)
	return err
}

// lockSessionAccount resolves a live session and locks its account row for the
// transaction, recording use in the same transaction when it is stale.
func (s *PGStore) lockSessionAccount(ctx context.Context, tx pgx.Tx, hash string) (string, Account, error) {
	var lastUsed time.Time
	now := s.sessionNow()
	id, account, err := s.scanAccount(tx.QueryRow(ctx, "SELECT "+pgAccountColumns+",s.last_used_at FROM accounts a JOIN sessions s ON s.account_id=a.id WHERE s.token_hash=$1"+pgLiveSession+" FOR UPDATE OF a", hash, s.sessionCutoff(now)), &lastUsed)
	if err != nil {
		return "", Account{}, err
	}
	if err = s.touchSession(ctx, tx, hash, lastUsed, now); err != nil {
		return "", Account{}, err
	}
	return id, account, nil
}
