package store

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"glotworld/server/internal/avatar"
	"glotworld/server/internal/world"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Store interface {
	ListAdminAccounts(context.Context, string, string, int, int) ([]Account, int, error)
	ManageAccount(context.Context, string, bool, string, func(*Account) error) (Account, []string, error)
	RecordAnalytics(context.Context, []AnalyticsEvent, time.Time) error
	ReadAnalytics(context.Context, time.Time, time.Time) ([]AnalyticsFact, []AnalyticsAccount, error)
	WorldIdentity() world.Identity
	Create(context.Context, string, Account) error
	Get(context.Context, string) (Account, error)
	UpdateProfile(context.Context, string, string, avatar.Avatar) (Account, error)
	UpdatePreferences(context.Context, string, Preferences) (Account, error)
	SetCredentials(context.Context, string, string, string) error
	ChangeCredentials(context.Context, string, CredentialChange) error
	RegisterWithReferral(context.Context, string, string, string, string, time.Time) error
	GetByEmail(context.Context, string) (Account, error)
	AddSession(context.Context, string, string) error
	DeleteSession(context.Context, string) error
	UpdateAccount(context.Context, string, func(*Account) error) (Account, error)
	ResetGame(context.Context, string) (Account, error)
	GetAccountByID(context.Context, string) (Account, error)
	FindBillingAccount(context.Context, string, string) (string, error)
	UpdateAccountByID(context.Context, string, func(*Account) error) (Account, error)
	Mutate(context.Context, string, string, json.RawMessage, func(*Account) (Receipt, error)) (Account, Receipt, bool, error)
	ActivityProofs(context.Context, string, string, string, []string) (map[string]SavedAction, int, error)
	Health(context.Context) error
	Kind() string
	Close()
}

// DiskState is the JSON development store's saved document.
type DiskState struct {
	Analytics map[string]AnalyticsEvent `json:"analytics,omitempty"`
	// WorldContent is the world document saved before the world tables; it is
	// converted on load.
	WorldContent json.RawMessage       `json:"worldContent,omitempty"`
	WorldTables  *DiskWorld            `json:"worldTables,omitempty"`
	AdminTokens  map[string]AdminToken `json:"adminTokens,omitempty"`
	World        *world.Identity       `json:"world,omitempty"`
	Version      int                   `json:"version"`
	Accounts     map[string]Account    `json:"accounts"`
	Sessions     map[string]string     `json:"sessions"`
	// Last use per session hash, refreshed at most hourly. Missing entries
	// predate tracking and count as used when next seen.
	SessionUse map[string]time.Time              `json:"sessionUse,omitempty"`
	Actions    map[string]map[string]SavedAction `json:"actions"`
}

// JSONStore is a single-process development fallback, not shared production storage.
type JSONStore struct {
	sessionIdlePolicy
	hooks Hooks
	mu    sync.Mutex
	path  string
	state DiskState
}

// NewJSONStore opens the single-process development store at path ("" keeps
// it in memory only).
func NewJSONStore(path string, hooks Hooks) (*JSONStore, error) {
	if err := hooks.validate(); err != nil {
		return nil, err
	}
	s := &JSONStore{sessionIdlePolicy: newSessionIdlePolicy(), hooks: hooks, path: path, state: DiskState{Version: 1, Accounts: map[string]Account{}, Sessions: map[string]string{}, Actions: map[string]map[string]SavedAction{}}}
	if path == "" {
		return s, s.initializeWorld()
	}
	b, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return s, s.initializeWorld()
	}
	if err != nil {
		return nil, err
	}
	if err = json.Unmarshal(b, &s.state); err != nil {
		return nil, fmt.Errorf("read development state: %w", err)
	}
	if s.state.Version != 1 || s.state.Accounts == nil || s.state.Sessions == nil || s.state.Actions == nil {
		return nil, errors.New("unsupported development state file")
	}
	if s.state.WorldContent != nil && s.state.WorldTables == nil {
		if s.state.WorldTables, err = convertWorldContent(s.state.WorldContent); err != nil {
			return nil, fmt.Errorf("convert development world: %w", err)
		}
	}
	s.state.WorldContent = nil
	return s, s.initializeWorld()
}

func (s *JSONStore) save() error {
	if s.path == "" {
		return nil
	}
	if err := os.MkdirAll(filepath.Dir(s.path), 0700); err != nil {
		return err
	}
	b, err := json.Marshal(s.state)
	if err != nil {
		return err
	}
	f, err := os.CreateTemp(filepath.Dir(s.path), ".state-*")
	if err != nil {
		return err
	}
	name := f.Name()
	defer os.Remove(name)
	if err = f.Chmod(0600); err == nil {
		_, err = f.Write(b)
	}
	if err == nil {
		err = f.Sync()
	}
	closeErr := f.Close()
	if err == nil {
		err = closeErr
	}
	if err != nil {
		return err
	}
	return os.Rename(name, s.path)
}

func (s *JSONStore) Create(_ context.Context, hash string, a Account) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.state.Accounts[a.Player.ID] = s.hooks.clone(a)
	s.state.Sessions[hash] = a.Player.ID
	s.touchSessionLocked(hash, s.sessionNow())
	if err := s.save(); err != nil {
		delete(s.state.Accounts, a.Player.ID)
		s.dropSessionLocked(hash)
		return err
	}
	return nil
}

func (s *JSONStore) Get(_ context.Context, hash string) (Account, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	id, ok := s.sessionLocked(hash)
	if !ok {
		return Account{}, ErrUnauthorized
	}
	return s.hooks.clone(s.state.Accounts[id]), nil
}

// ActivityProofs reads immutable attempt receipts, rather than the bounded recent
// attempts shown in progress. Pausing a mission never expires its saved rounds.
func (s *JSONStore) ActivityProofs(_ context.Context, hash, activityID, runID string, attemptIDs []string) (map[string]SavedAction, int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	id, ok := s.sessionLocked(hash)
	if !ok {
		return nil, 0, ErrUnauthorized
	}
	proofs := map[string]SavedAction{}
	for _, attemptID := range attemptIDs {
		if action, exists := s.state.Actions[id]["attempt:"+attemptID]; exists {
			action.Request = append(json.RawMessage(nil), action.Request...)
			proofs[attemptID] = action
		}
	}
	corrected := 0
	for key, action := range s.state.Actions[id] {
		if !strings.HasPrefix(key, "attempt:") || action.Receipt.Correct == nil || *action.Receipt.Correct {
			continue
		}
		var input attemptRequest
		if err := json.Unmarshal(action.Request, &input); err != nil {
			return nil, 0, err
		}
		if input.ActivityID == activityID && input.RunID == runID {
			corrected++
		}
	}
	return proofs, corrected, nil
}

func (s *JSONStore) Mutate(_ context.Context, hash, key string, request json.RawMessage, fn func(*Account) (Receipt, error)) (Account, Receipt, bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	id, ok := s.sessionLocked(hash)
	if !ok {
		return Account{}, Receipt{}, false, ErrUnauthorized
	}
	account := s.hooks.clone(s.state.Accounts[id])
	if previous, ok := s.state.Actions[id][key]; ok {
		if !bytes.Equal(previous.Request, request) {
			return Account{}, Receipt{}, false, ErrConflict
		}
		return account, previous.Receipt, true, nil
	}
	receipt, err := fn(&account)
	if err != nil {
		return Account{}, Receipt{}, false, err
	}
	account.Progress.Revision++
	previous := s.state.Accounts[id]
	s.state.Accounts[id] = account
	if s.state.Actions[id] == nil {
		s.state.Actions[id] = map[string]SavedAction{}
	}
	s.state.Actions[id][key] = SavedAction{Request: request, Receipt: receipt, At: time.Now().UTC()}
	if err := s.save(); err != nil {
		s.state.Accounts[id] = previous
		delete(s.state.Actions[id], key)
		return Account{}, Receipt{}, false, err
	}
	return s.hooks.clone(account), receipt, false, nil
}

func (s *JSONStore) UpdateProfile(_ context.Context, hash, name string, recipe avatar.Avatar) (Account, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	id, ok := s.sessionLocked(hash)
	if !ok {
		return Account{}, ErrUnauthorized
	}
	previous := s.state.Accounts[id]
	account := s.hooks.clone(previous)
	account.Player.Name, account.Player.Avatar = name, avatar.Normalize(recipe)
	account.Progress.Revision++
	s.state.Accounts[id] = account
	if err := s.save(); err != nil {
		s.state.Accounts[id] = previous
		return Account{}, err
	}
	return s.hooks.clone(account), nil
}

func (s *JSONStore) UpdatePreferences(_ context.Context, hash string, preferences Preferences) (Account, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	id, ok := s.sessionLocked(hash)
	if !ok {
		return Account{}, ErrUnauthorized
	}
	previous := s.state.Accounts[id]
	account := s.hooks.clone(previous)
	account.Preferences = NormalizePreferences(preferences)
	s.state.Accounts[id] = account
	if err := s.save(); err != nil {
		s.state.Accounts[id] = previous
		return Account{}, err
	}
	return s.hooks.clone(account), nil
}

func (s *JSONStore) Health(context.Context) error { return nil }
func (s *JSONStore) Kind() string                 { return "json-development" }
func (s *JSONStore) Close()                       {}

type PGStore struct {
	sessionIdlePolicy
	hooks         Hooks
	pool          *pgxpool.Pool
	worldIdentity world.Identity
}

// NewPGStore connects to PostgreSQL and applies pending schema migrations.
func NewPGStore(ctx context.Context, url string, hooks Hooks) (*PGStore, error) {
	if err := hooks.validate(); err != nil {
		return nil, err
	}
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		return nil, err
	}
	s := &PGStore{sessionIdlePolicy: newSessionIdlePolicy(), hooks: hooks, pool: pool}
	if err = pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, err
	}
	if err = MigrateSchema(ctx, pool); err != nil {
		pool.Close()
		return nil, err
	}
	if err = s.initializeWorld(ctx); err != nil {
		pool.Close()
		return nil, err
	}
	return s, nil
}

func (s *PGStore) Create(ctx context.Context, hash string, a Account) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if err = s.insertAccount(ctx, tx, a); err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, "INSERT INTO sessions(token_hash,account_id) VALUES($1,$2)", hash, a.Player.ID); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (s *PGStore) Get(ctx context.Context, hash string) (Account, error) {
	var lastUsed time.Time
	now := s.sessionNow()
	_, a, err := s.scanAccount(s.pool.QueryRow(ctx, "SELECT "+pgAccountColumns+",s.last_used_at FROM accounts a JOIN sessions s ON s.account_id=a.id WHERE s.token_hash=$1"+pgLiveSession, hash, s.sessionCutoff(now)), &lastUsed)
	if errors.Is(err, pgx.ErrNoRows) {
		return Account{}, ErrUnauthorized
	}
	if err != nil {
		return Account{}, err
	}
	// Recording use is best effort on reads; a failed touch never fails a request.
	if err := s.touchSession(ctx, s.pool, hash, lastUsed, now); err != nil {
		slog.Warn("session use was not recorded", "error", err)
	}
	return a, nil
}

func (s *PGStore) ActivityProofs(ctx context.Context, hash, activityID, runID string, attemptIDs []string) (map[string]SavedAction, int, error) {
	var accountID string
	err := s.pool.QueryRow(ctx, "SELECT s.account_id FROM sessions s JOIN accounts a ON a.id=s.account_id WHERE s.token_hash=$1"+pgLiveSession, hash, s.sessionCutoff(s.sessionNow())).Scan(&accountID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, 0, ErrUnauthorized
	}
	if err != nil {
		return nil, 0, err
	}
	keys := make([]string, len(attemptIDs))
	for i, id := range attemptIDs {
		keys[i] = "attempt:" + id
	}
	rows, err := s.pool.Query(ctx, "SELECT event_key,request,receipt,created_at FROM learning_events WHERE account_id=$1 AND event_key=ANY($2::text[])", accountID, keys)
	if err != nil {
		return nil, 0, err
	}
	proofs := map[string]SavedAction{}
	for rows.Next() {
		var key string
		var action SavedAction
		var receipt []byte
		if err = rows.Scan(&key, &action.Request, &receipt, &action.At); err != nil {
			rows.Close()
			return nil, 0, err
		}
		if err = json.Unmarshal(receipt, &action.Receipt); err != nil {
			rows.Close()
			return nil, 0, err
		}
		proofs[strings.TrimPrefix(key, "attempt:")] = action
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return nil, 0, err
	}
	var corrected int
	err = s.pool.QueryRow(ctx, `SELECT COUNT(*) FROM learning_events WHERE account_id=$1 AND event_key LIKE 'attempt:%' AND activity_id=$2 AND run_id=$3 AND correct=false`, accountID, activityID, runID).Scan(&corrected)
	return proofs, corrected, err
}

func (s *PGStore) Mutate(ctx context.Context, hash, key string, request json.RawMessage, fn func(*Account) (Receipt, error)) (Account, Receipt, bool, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Account{}, Receipt{}, false, err
	}
	defer tx.Rollback(ctx)
	id, a, err := s.lockSessionAccount(ctx, tx, hash)
	if errors.Is(err, pgx.ErrNoRows) {
		return Account{}, Receipt{}, false, ErrUnauthorized
	}
	if err != nil {
		return Account{}, Receipt{}, false, err
	}
	purchases := clonePurchases(a.Billing.Purchases)
	var previousRequest, previousReceipt []byte
	err = tx.QueryRow(ctx, "SELECT request,receipt FROM learning_events WHERE account_id=$1 AND event_key=$2", id, key).Scan(&previousRequest, &previousReceipt)
	if err == nil {
		// JSONB reorders object keys, so compare the decoded request semantically.
		var left, right any
		_ = json.Unmarshal(previousRequest, &left)
		_ = json.Unmarshal(request, &right)
		l, _ := json.Marshal(left)
		r, _ := json.Marshal(right)
		if !bytes.Equal(l, r) {
			return Account{}, Receipt{}, false, ErrConflict
		}
		var receipt Receipt
		if err = json.Unmarshal(previousReceipt, &receipt); err != nil {
			return Account{}, Receipt{}, false, err
		}
		return a, receipt, true, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return Account{}, Receipt{}, false, err
	}
	receipt, err := fn(&a)
	if err != nil {
		return Account{}, Receipt{}, false, err
	}
	a.Progress.Revision++
	receiptData, err := json.Marshal(receipt)
	if err != nil {
		return Account{}, Receipt{}, false, err
	}
	if err = s.writeAccount(ctx, tx, id, purchases, a); err != nil {
		return Account{}, Receipt{}, false, err
	}
	if _, err = tx.Exec(ctx, "INSERT INTO learning_events(account_id,event_key,request,receipt) VALUES($1,$2,$3,$4)", id, key, []byte(request), receiptData); err != nil {
		return Account{}, Receipt{}, false, err
	}
	if err = tx.Commit(ctx); err != nil {
		return Account{}, Receipt{}, false, err
	}
	return a, receipt, false, nil
}

func (s *PGStore) UpdateProfile(ctx context.Context, hash, name string, recipe avatar.Avatar) (Account, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Account{}, err
	}
	defer tx.Rollback(ctx)
	id, account, err := s.lockSessionAccount(ctx, tx, hash)
	if errors.Is(err, pgx.ErrNoRows) {
		return Account{}, ErrUnauthorized
	}
	if err != nil {
		return Account{}, err
	}
	purchases := clonePurchases(account.Billing.Purchases)
	account.Player.Name, account.Player.Avatar = name, avatar.Normalize(recipe)
	account.Progress.Revision++
	if err = s.writeAccount(ctx, tx, id, purchases, account); err != nil {
		return Account{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return Account{}, err
	}
	return account, nil
}

// UpdatePreferences stores preferences inside the account data document, so old
// rows need no schema migration: a missing field decodes to English support.
func (s *PGStore) UpdatePreferences(ctx context.Context, hash string, preferences Preferences) (Account, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Account{}, err
	}
	defer tx.Rollback(ctx)
	id, account, err := s.lockSessionAccount(ctx, tx, hash)
	if errors.Is(err, pgx.ErrNoRows) {
		return Account{}, ErrUnauthorized
	}
	if err != nil {
		return Account{}, err
	}
	purchases := clonePurchases(account.Billing.Purchases)
	account.Preferences = NormalizePreferences(preferences)
	if err = s.writeAccount(ctx, tx, id, purchases, account); err != nil {
		return Account{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return Account{}, err
	}
	return account, nil
}

func (s *PGStore) Health(ctx context.Context) error { return s.pool.Ping(ctx) }
func (s *PGStore) Kind() string                     { return "postgres" }
func (s *PGStore) Close()                           { s.pool.Close() }

// PoolStat exposes connection pool statistics for /metrics.
func (s *PGStore) PoolStat() *pgxpool.Stat { return s.pool.Stat() }

// ContentImportInfo reads the last import recorded by cmd/import-content.
func (s *PGStore) ContentImportInfo(ctx context.Context) (ContentImportInfo, error) {
	var info ContentImportInfo
	var durationMS *int64
	err := s.pool.QueryRow(ctx, `SELECT imported_at,duration_ms FROM content_imports WHERE id='main'`).Scan(&info.At, &durationMS)
	if errors.Is(err, pgx.ErrNoRows) {
		return info, nil
	}
	if err != nil || durationMS == nil {
		return info, err
	}
	info.Duration, info.Known = time.Duration(*durationMS)*time.Millisecond, true
	return info, nil
}
