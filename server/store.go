package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Store interface {
	Create(context.Context, string, Account) error
	Get(context.Context, string) (Account, error)
	UpdateProfile(context.Context, string, string, Avatar) (Account, error)
	SetCredentials(context.Context, string, string, string) error
	GetByEmail(context.Context, string) (Account, error)
	AddSession(context.Context, string, string) error
	Mutate(context.Context, string, string, json.RawMessage, func(*Account) (Receipt, error)) (Account, Receipt, bool, error)
	ActivityProofs(context.Context, string, string, string, []string) (map[string]SavedAction, int, error)
	Health(context.Context) error
	Kind() string
	Close()
}

type diskState struct {
	Version  int                               `json:"version"`
	Accounts map[string]Account                `json:"accounts"`
	Sessions map[string]string                 `json:"sessions"`
	Actions  map[string]map[string]SavedAction `json:"actions"`
}

// JSONStore is a single-process development fallback, not shared production storage.
type JSONStore struct {
	mu    sync.Mutex
	path  string
	state diskState
}

func NewJSONStore(path string) (*JSONStore, error) {
	s := &JSONStore{path: path, state: diskState{Version: 1, Accounts: map[string]Account{}, Sessions: map[string]string{}, Actions: map[string]map[string]SavedAction{}}}
	if path == "" {
		return s, nil
	}
	b, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return s, nil
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
	return s, nil
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
	s.state.Accounts[a.Player.ID] = cloneAccount(a)
	s.state.Sessions[hash] = a.Player.ID
	if err := s.save(); err != nil {
		delete(s.state.Accounts, a.Player.ID)
		delete(s.state.Sessions, hash)
		return err
	}
	return nil
}

func (s *JSONStore) Get(_ context.Context, hash string) (Account, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	id, ok := s.state.Sessions[hash]
	if !ok {
		return Account{}, ErrUnauthorized
	}
	return cloneAccount(s.state.Accounts[id]), nil
}

// ActivityProofs reads immutable attempt receipts, rather than the bounded recent
// attempts shown in progress. Pausing a mission never expires its saved rounds.
func (s *JSONStore) ActivityProofs(_ context.Context, hash, activityID, runID string, attemptIDs []string) (map[string]SavedAction, int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	id, ok := s.state.Sessions[hash]
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
		var input AttemptInput
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
	id, ok := s.state.Sessions[hash]
	if !ok {
		return Account{}, Receipt{}, false, ErrUnauthorized
	}
	account := cloneAccount(s.state.Accounts[id])
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
	return cloneAccount(account), receipt, false, nil
}

func (s *JSONStore) UpdateProfile(_ context.Context, hash, name string, avatar Avatar) (Account, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	id, ok := s.state.Sessions[hash]
	if !ok {
		return Account{}, ErrUnauthorized
	}
	previous := s.state.Accounts[id]
	account := cloneAccount(previous)
	account.Player.Name, account.Player.Avatar = name, avatar
	account.Progress.Revision++
	s.state.Accounts[id] = account
	if err := s.save(); err != nil {
		s.state.Accounts[id] = previous
		return Account{}, err
	}
	return cloneAccount(account), nil
}

func (s *JSONStore) Health(context.Context) error { return nil }
func (s *JSONStore) Kind() string                 { return "json-development" }
func (s *JSONStore) Close()                       {}

type PGStore struct{ pool *pgxpool.Pool }

func NewPGStore(ctx context.Context, url string) (*PGStore, error) {
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		return nil, err
	}
	s := &PGStore{pool: pool}
	if err = pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, err
	}
	_, err = pool.Exec(ctx, `CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, data JSONB NOT NULL);
	CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
	CREATE TABLE IF NOT EXISTS learning_events (account_id TEXT NOT NULL REFERENCES accounts(id), event_key TEXT NOT NULL, request JSONB NOT NULL, receipt JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (account_id,event_key));`)
	if err != nil {
		pool.Close()
		return nil, err
	}
	_, err = pool.Exec(ctx, `CREATE UNIQUE INDEX IF NOT EXISTS accounts_email_unique ON accounts ((data->>'email')) WHERE data->>'email' IS NOT NULL`)
	if err != nil {
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
	b, err := json.Marshal(a)
	if err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, "INSERT INTO accounts(id,data) VALUES($1,$2)", a.Player.ID, b); err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, "INSERT INTO sessions(token_hash,account_id) VALUES($1,$2)", hash, a.Player.ID); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (s *PGStore) Get(ctx context.Context, hash string) (Account, error) {
	var b []byte
	err := s.pool.QueryRow(ctx, "SELECT a.data FROM accounts a JOIN sessions s ON s.account_id=a.id WHERE s.token_hash=$1", hash).Scan(&b)
	if errors.Is(err, pgx.ErrNoRows) {
		return Account{}, ErrUnauthorized
	}
	if err != nil {
		return Account{}, err
	}
	var a Account
	err = json.Unmarshal(b, &a)
	ensureProgress(&a.Progress)
	return a, err
}

func (s *PGStore) ActivityProofs(ctx context.Context, hash, activityID, runID string, attemptIDs []string) (map[string]SavedAction, int, error) {
	var accountID string
	err := s.pool.QueryRow(ctx, "SELECT account_id FROM sessions WHERE token_hash=$1", hash).Scan(&accountID)
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
	err = s.pool.QueryRow(ctx, `SELECT COUNT(*) FROM learning_events WHERE account_id=$1 AND event_key LIKE 'attempt:%' AND request->>'activityId'=$2 AND request->>'runId'=$3 AND receipt->>'correct'='false'`, accountID, activityID, runID).Scan(&corrected)
	return proofs, corrected, err
}

func (s *PGStore) Mutate(ctx context.Context, hash, key string, request json.RawMessage, fn func(*Account) (Receipt, error)) (Account, Receipt, bool, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Account{}, Receipt{}, false, err
	}
	defer tx.Rollback(ctx)
	var data []byte
	var id string
	err = tx.QueryRow(ctx, "SELECT a.id,a.data FROM accounts a JOIN sessions s ON s.account_id=a.id WHERE s.token_hash=$1 FOR UPDATE OF a", hash).Scan(&id, &data)
	if errors.Is(err, pgx.ErrNoRows) {
		return Account{}, Receipt{}, false, ErrUnauthorized
	}
	if err != nil {
		return Account{}, Receipt{}, false, err
	}
	var a Account
	if err = json.Unmarshal(data, &a); err != nil {
		return Account{}, Receipt{}, false, err
	}
	ensureProgress(&a.Progress)
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
	data, err = json.Marshal(a)
	if err != nil {
		return Account{}, Receipt{}, false, err
	}
	receiptData, err := json.Marshal(receipt)
	if err != nil {
		return Account{}, Receipt{}, false, err
	}
	if _, err = tx.Exec(ctx, "UPDATE accounts SET data=$2 WHERE id=$1", id, data); err != nil {
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

func (s *PGStore) UpdateProfile(ctx context.Context, hash, name string, avatar Avatar) (Account, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Account{}, err
	}
	defer tx.Rollback(ctx)
	var data []byte
	var id string
	err = tx.QueryRow(ctx, "SELECT a.id,a.data FROM accounts a JOIN sessions s ON s.account_id=a.id WHERE s.token_hash=$1 FOR UPDATE OF a", hash).Scan(&id, &data)
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
	account.Player.Name, account.Player.Avatar = name, avatar
	account.Progress.Revision++
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

func (s *PGStore) Health(ctx context.Context) error { return s.pool.Ping(ctx) }
func (s *PGStore) Kind() string                     { return "postgres" }
func (s *PGStore) Close()                           { s.pool.Close() }
