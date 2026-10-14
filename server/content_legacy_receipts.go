package main

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/jackc/pgx/v5"
	"strings"
)

// The eager UUID migration is opt-in. Existing German receipts remain safely
// replayable before that flag is enabled; they never become new graded attempts.
type legacyReceiptReader interface {
	legacyReceipt(context.Context, string, string) (SavedAction, bool, error)
}

func (s *JSONStore) legacyReceipt(_ context.Context, hash, key string) (SavedAction, bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	id, ok := s.state.Sessions[hash]
	if !ok {
		return SavedAction{}, false, ErrUnauthorized
	}
	action, exists := s.state.Actions[id][key]
	if exists {
		data, _ := json.Marshal(action)
		_ = json.Unmarshal(data, &action)
	}
	return action, exists, nil
}
func (s *PGStore) legacyReceipt(ctx context.Context, hash, key string) (SavedAction, bool, error) {
	var action SavedAction
	var receipt []byte
	err := s.pool.QueryRow(ctx, `SELECT e.request,e.receipt,e.created_at FROM learning_events e JOIN sessions s ON s.account_id=e.account_id WHERE s.token_hash=$1 AND e.event_key=$2`, hash, key).Scan(&action.Request, &receipt, &action.At)
	if errors.Is(err, pgx.ErrNoRows) {
		return SavedAction{}, false, nil
	}
	if err != nil {
		return action, false, err
	}
	if err = json.Unmarshal(receipt, &action.Receipt); err != nil {
		return action, false, err
	}
	return action, true, nil
}

// Exercise stats are a compact index; immutable receipts remain authoritative
// for accounts created before that index existed.
type exerciseReceiptReader interface {
	exerciseReceiptExists(context.Context, string, string, string, string, bool) (bool, error)
}

func receiptInCourse(key, course string, legacy bool) bool {
	if strings.HasPrefix(key, "attempt:"+course+":") {
		return true
	}
	if !legacy || !strings.HasPrefix(key, "attempt:") {
		return false
	}
	return !strings.Contains(strings.TrimPrefix(key, "attempt:"), ":")
}
func (s *JSONStore) exerciseReceiptExists(_ context.Context, hash, course, slug, uuid string, legacy bool) (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	id, ok := s.state.Sessions[hash]
	if !ok {
		return false, ErrUnauthorized
	}
	for key, action := range s.state.Actions[id] {
		if !receiptInCourse(key, course, legacy) || action.Receipt.Correct == nil {
			continue
		}
		var input AttemptInput
		if json.Unmarshal(action.Request, &input) == nil && !input.Preview && strings.TrimSpace(input.Answer) != "" && (input.ExerciseID == slug || input.ExerciseID == uuid) {
			return true, nil
		}
	}
	return false, nil
}
func (s *PGStore) exerciseReceiptExists(ctx context.Context, hash, course, slug, uuid string, legacy bool) (bool, error) {
	var exists bool
	err := s.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM learning_events e JOIN sessions s ON s.account_id=e.account_id WHERE s.token_hash=$1 AND (e.event_key LIKE $2 OR ($5 AND e.event_key LIKE 'attempt:%' AND split_part(e.event_key,':',3)='')) AND e.request->>'exerciseId' IN($3,$4) AND COALESCE(e.request->>'answer','')<>'' AND COALESCE(e.request->>'preview','false')<>'true' AND e.receipt->>'correct' IS NOT NULL)`, hash, "attempt:"+course+":%", slug, uuid, legacy).Scan(&exists)
	return exists, err
}
func (a *App) hasRecordedExercise(ctx context.Context, hash string, account Account, exerciseID string) (bool, error) {
	if account.Progress.ExerciseStats[exerciseID].Attempts > 0 {
		return true, nil
	}
	if a.canonical == nil {
		return false, nil
	}
	reader, ok := a.canonical.Store.(exerciseReceiptReader)
	if !ok {
		return false, nil
	}
	return reader.exerciseReceiptExists(ctx, hash, account.ActiveCourseID, exerciseID, a.canonical.forward[exerciseID], account.ActiveCourseID == a.canonical.defaultCourse)
}
