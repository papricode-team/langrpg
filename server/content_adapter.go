package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"lernen01/server/internal/contentstore"
	"sort"
	"strings"
)

// canonicalStore is a persistence boundary for the established German engine.
// Its grading/story code may use fixture slugs internally; every stored account,
// course snapshot, immutable request, and response uses the stable UUID catalog.
type canonicalStore struct {
	Store
	forward        map[string]string
	reverse        map[string]string
	nodes          map[string]string
	choices        map[string]string
	defaultCourse  string
	expectedCourse string
}

func newCanonicalStore(base Store, b *contentstore.Bundle) (*canonicalStore, error) {
	s := &canonicalStore{Store: base, forward: map[string]string{}, reverse: map[string]string{}, nodes: map[string]string{}, choices: map[string]string{}}
	for _, c := range b.Courses {
		if s.defaultCourse == "" || c.Target == "de" {
			s.defaultCourse = c.ID
		}
	}
	// Prefer grading/item IDs when the same legacy identifier also identifies a
	// scene record; graph IDs are resolved separately by the content API.
	priorities := map[string]int{"item": 100, "exercise": 90, "lexeme": 80, "quest": 70, "unit": 60, "choice": 50, "object": 40, "expedition": 30, "minigame": 20, "content": 25}
	type entry struct{ kind, slug, id string }
	var entries []entry
	for key, id := range b.IDs {
		kind, slug, ok := strings.Cut(key, ":")
		if !ok {
			continue
		}
		if kind == "choice" && strings.Contains(slug, ":") {
			s.choices[slug] = id
			s.reverse[id] = slug
			continue
		}
		if kind == "node" {
			s.nodes[slug] = id
			s.reverse[id] = slug
			continue
		}
		if _, ok := priorities[kind]; ok {
			entries = append(entries, entry{kind, slug, id})
		}
	}
	sort.Slice(entries, func(i, j int) bool { return priorities[entries[i].kind] < priorities[entries[j].kind] })
	for _, e := range entries {
		s.forward[e.slug] = e.id
		s.reverse[e.id] = e.slug
	}
	return s, nil
}
func (s *canonicalStore) translate(value string, forward bool) string {
	table := s.reverse
	if forward {
		table = s.forward
	}
	if v, ok := table[value]; ok {
		return v
	}
	// Evidence flags and modality keys embed references. UUID migration preserves
	// their meaning and all existing FSRS cards rather than dropping these keys.
	for _, prefix := range []string{"reply:", "reply-help:", "answer-help:", "hint:", "exercise:", "word:", "quest:", "unit:", "answer-reveal:", "attempt:"} {
		if strings.HasPrefix(value, prefix) {
			tail := strings.TrimPrefix(value, prefix)
			if v, ok := table[tail]; ok {
				return prefix + v
			}
		}
	}
	for _, mode := range []string{":production", ":recognition", ":listening"} {
		if strings.HasSuffix(value, mode) {
			head := strings.TrimSuffix(value, mode)
			if v, ok := table[head]; ok {
				return v + mode
			}
		}
	}
	return value
}

var identityReferenceMaps = map[string]bool{
	"items": true, "words": true, "exerciseStats": true, "nodes": true, "choices": true,
	"gateFailures": true, "inspections": true, "gateAttempts": true, "flags": true,
	"formStats": true, "miniGameStats": true, "answerHelpAt": true,
	"contextWordIds": true, "activityWordIds": true, "npcWordIds": true,
}

var contentReferenceFields = map[string]bool{
	"referenceIds": true, "id": true, "itemId": true, "itemIds": true, "wordId": true, "wordIds": true, "targetWordId": true,
	"requiredWordIds": true, "exerciseId": true, "exerciseIds": true, "gateExerciseId": true, "replyExerciseIds": true,
	"contextExerciseId": true, "questId": true, "questIds": true, "completedQuestIds": true, "rewardedQuestIds": true,
	"unitId": true, "unitIds": true, "completedUnitIds": true, "requiredItemIds": true, "requiredExerciseIds": true,
	"miniGameId": true, "minigameId": true, "contentId": true, "encounterId": true, "expeditionId": true,
	"expeditionIds": true, "rewardedExpeditionIds": true, "choiceId": true, "choiceIds": true, "nodeId": true,
	"objectId": true, "objectIds": true, "investigationObjectIds": true, "inventory": true, "flag": true,
	"withoutFlag": true, "item": true, "missingItem": true, "evidenceItem": true, "next": true, "start": true,
	"sentenceId": true, "sentenceIds": true, "graphId": true, "scenarioId": true, "activityId": true,
	"retrievedItems": true,
}
var referenceValueMaps = map[string]bool{"contextWordIds": true, "activityWordIds": true, "npcWordIds": true, "inspections": true, "exerciseIds": true, "wordIds": true, "itemIds": true}

func (s *canonicalStore) transform(value any, forward bool, parent string) any {
	switch v := value.(type) {
	case string:
		if contentReferenceFields[parent] {
			return s.translate(v, forward)
		}
		return v
	case []any:
		for i, item := range v {
			v[i] = s.transform(item, forward, parent)
		}
		return v
	case map[string]any:
		out := map[string]any{}
		for key, item := range v {
			next := key
			if identityReferenceMaps[parent] {
				next = s.translate(key, forward)
			}
			if parent == "objects" {
				next = key
			}
			if parent == "recentAttempts" {
				next = key
			}
			if parent == "gateAttempts" {
				out[next] = item
				continue
			}
			if parent == "courseStates" {
				next = key
			}
			if key == "id" {
				_, attempt := v["exerciseId"]
				_, transition := v["nodeId"]
				if attempt || transition {
					out[next] = item
					continue
				}
			}
			if parent == "nodes" || parent == "choices" {
				if node, ok := item.(string); ok {
					quest := key
					if !forward {
						quest = s.translate(key, false)
					}
					if forward {
						scoped := s.nodes
						if parent == "choices" {
							scoped = s.choices
						}
						if id, ok := scoped[quest+":"+node]; ok {
							item = id
						}
					} else if slug, ok := s.reverse[node]; ok {
						if _, stage, found := strings.Cut(slug, ":"); found {
							item = stage
						}
					}
				}
			}
			if (key == "nodeId" || key == "choiceId") && forward {
				if node, ok := item.(string); ok {
					quest, _ := v["questId"].(string)
					quest = s.translate(quest, false)
					scoped := s.nodes
					if key == "choiceId" {
						scoped = s.choices
					}
					if id, ok := scoped[quest+":"+node]; ok {
						item = id
					}
				}
			}
			if (key == "nodeId" || key == "choiceId") && !forward {
				if node, ok := item.(string); ok {
					if slug, found := s.reverse[node]; found {
						if owner, stage, has := strings.Cut(slug, ":"); has {
							quest, _ := v["questId"].(string)
							quest = s.translate(quest, false)
							if quest == "" || quest == owner {
								item = stage
							}
						}
					}
				}
			}

			if quest, ok := v["questId"].(string); ok {
				quest = s.translate(quest, false)
				if key == "choiceIds" {
					if values, ok := item.([]any); ok {
						for i, value := range values {
							if choice, ok := value.(string); ok {
								values[i] = s.scopedChoice(quest, choice, forward)
							}
						}
					}
				}
				if key == "choices" {
					if values, ok := item.([]any); ok {
						for _, value := range values {
							if choice, ok := value.(map[string]any); ok {
								if id, ok := choice["id"].(string); ok {
									choice["id"] = s.scopedChoice(quest, id, forward)
								}
							}
						}
					}
				}
			}
			childParent := key
			if referenceValueMaps[parent] {
				childParent = "referenceIds"
			}
			out[next] = s.transform(item, forward, childParent)
		}
		return out
	default:
		return v
	}
}
func (s *canonicalStore) raw(data []byte, forward bool) []byte {
	var value any
	if json.Unmarshal(data, &value) != nil {
		return data
	}
	out, err := json.Marshal(s.transform(value, forward, ""))
	if err != nil {
		return data
	}
	return out
}
func (s *canonicalStore) account(account Account, forward bool) Account {
	data, _ := json.Marshal(account)
	var out Account
	_ = json.Unmarshal(s.raw(data, forward), &out)
	ensureProgress(&out.Progress)
	if out.ActiveCourseID == "" {
		out.ActiveCourseID = s.defaultCourse
	}
	if out.CourseStates == nil {
		out.CourseStates = map[string]CourseState{}
	}
	return out
}
func snapshotCourse(a *Account) {
	if a.ActiveCourseID == "" {
		return
	}
	if a.CourseStates == nil {
		a.CourseStates = map[string]CourseState{}
	}
	a.CourseStates[a.ActiveCourseID] = CourseState{Progress: a.Progress, Player: a.Player, StorySaves: a.StorySaves, RewardedQuestIDs: a.RewardedQuestIDs, RewardedExpeditionIDs: a.RewardedExpeditionIDs, SupportLanguage: a.Preferences.BaseLanguage}
}
func (s *canonicalStore) check(a Account) error {
	if s.expectedCourse != "" && a.ActiveCourseID != "" && a.ActiveCourseID != s.expectedCourse {
		return &APIError{409, "the active course changed; reload its saved state"}
	}
	return nil
}
func (s *canonicalStore) Get(ctx context.Context, hash string) (Account, error) {
	a, err := s.Store.Get(ctx, hash)
	if err != nil {
		return a, err
	}
	a = s.account(a, false)
	return a, s.check(a)
}
func (s *canonicalStore) GetByEmail(ctx context.Context, email string) (Account, error) {
	a, err := s.Store.GetByEmail(ctx, email)
	if err == nil {
		a = s.account(a, false)
	}
	return a, err
}
func (s *canonicalStore) GetAccountByID(ctx context.Context, id string) (Account, error) {
	a, err := s.Store.GetAccountByID(ctx, id)
	if err == nil {
		a = s.account(a, false)
	}
	return a, err
}
func (s *canonicalStore) Create(ctx context.Context, hash string, a Account) error {
	if a.ActiveCourseID == "" {
		a.ActiveCourseID = s.defaultCourse
	}
	snapshotCourse(&a)
	return s.Store.Create(ctx, hash, s.account(a, true))
}
func (s *canonicalStore) callback(fn func(*Account) error) func(*Account) error {
	return func(raw *Account) error {
		a := s.account(*raw, false)
		if err := s.check(a); err != nil {
			return err
		}
		if err := fn(&a); err != nil {
			return err
		}
		snapshotCourse(&a)
		*raw = s.account(a, true)
		return nil
	}
}
func (s *canonicalStore) UpdateAccount(ctx context.Context, hash string, fn func(*Account) error) (Account, error) {
	a, err := s.Store.UpdateAccount(ctx, hash, s.callback(fn))
	if err == nil {
		a = s.account(a, false)
	}
	return a, err
}
func (s *canonicalStore) UpdateAccountByID(ctx context.Context, id string, fn func(*Account) error) (Account, error) {
	a, err := s.Store.UpdateAccountByID(ctx, id, s.callback(fn))
	if err == nil {
		a = s.account(a, false)
	}
	return a, err
}
func (s *canonicalStore) UpdateProfile(ctx context.Context, hash, name string, avatar Avatar) (Account, error) {
	return s.UpdateAccount(ctx, hash, func(a *Account) error {
		a.Player.Name = name
		a.Player.Avatar = normalizeAvatar(avatar)
		a.Progress.Revision++
		return nil
	})
}
func (s *canonicalStore) UpdatePreferences(ctx context.Context, hash string, p Preferences) (Account, error) {
	return s.UpdateAccount(ctx, hash, func(a *Account) error { a.Preferences = normalizedPreferences(p); return nil })
}
func (s *canonicalStore) ResetGuest(ctx context.Context, hash string) (Account, error) {
	a, err := s.Store.ResetGuest(ctx, hash)
	if err != nil {
		return a, err
	}
	return s.UpdateAccount(ctx, hash, func(a *Account) error { a.CourseStates = map[string]CourseState{}; return nil })
}
func (s *canonicalStore) actionKey(key string) string {
	course := s.expectedCourse
	if course == "" {
		course = s.defaultCourse
	}
	if strings.HasPrefix(key, "attempt:") {
		return "attempt:" + course + ":" + strings.TrimPrefix(key, "attempt:")
	}
	return "course:" + course + ":" + s.translate(key, true)
}
func (s *canonicalStore) Mutate(ctx context.Context, hash, key string, request json.RawMessage, fn func(*Account) (Receipt, error)) (Account, Receipt, bool, error) {
	request = s.raw(request, true)
	if s.expectedCourse == "" || s.expectedCourse == s.defaultCourse {
		if reader, ok := s.Store.(legacyReceiptReader); ok {
			old, exists, err := reader.legacyReceipt(ctx, hash, key)
			if err != nil {
				return Account{}, Receipt{}, false, err
			}
			if exists {
				if !bytes.Equal(s.raw(old.Request, true), request) {
					return Account{}, Receipt{}, false, ErrConflict
				}
				account, err := s.Get(ctx, hash)
				if err != nil {
					return account, Receipt{}, false, err
				}
				if account.ActiveCourseID != s.defaultCourse {
					return Account{}, Receipt{}, false, &APIError{409, "the active course changed; reload its saved state"}
				}
				data, _ := json.Marshal(old.Receipt)
				_ = json.Unmarshal(s.raw(data, false), &old.Receipt)
				return account, old.Receipt, true, nil
			}
		}
	}
	a, receipt, duplicate, err := s.Store.Mutate(ctx, hash, s.actionKey(key), request, func(raw *Account) (Receipt, error) {
		a := s.account(*raw, false)
		if err := s.check(a); err != nil {
			return Receipt{}, err
		}
		receipt, err := fn(&a)
		if err != nil {
			return receipt, err
		}
		snapshotCourse(&a)
		*raw = s.account(a, true)
		data, _ := json.Marshal(receipt)
		_ = json.Unmarshal(s.raw(data, true), &receipt)
		return receipt, nil
	})
	if err != nil {
		return a, receipt, duplicate, err
	}
	a = s.account(a, false)
	data, _ := json.Marshal(receipt)
	_ = json.Unmarshal(s.raw(data, false), &receipt)
	return a, receipt, duplicate, s.check(a)
}
func (s *canonicalStore) ActivityProofs(ctx context.Context, hash, activityID, runID string, attemptIDs []string) (map[string]SavedAction, int, error) {
	course := s.expectedCourse
	if course == "" {
		course = s.defaultCourse
	}
	ids := make([]string, len(attemptIDs))
	for i, id := range attemptIDs {
		ids[i] = course + ":" + id
	}
	proofs, count, err := s.Store.ActivityProofs(ctx, hash, s.translate(activityID, true), runID, ids)
	if err != nil {
		return nil, 0, err
	}
	out := map[string]SavedAction{}
	if course == s.defaultCourse {
		if reader, ok := s.Store.(legacyReceiptReader); ok {
			for _, id := range attemptIDs {
				if _, exists := proofs[course+":"+id]; exists {
					continue
				}
				proof, exists, err := reader.legacyReceipt(ctx, hash, "attempt:"+id)
				if err != nil {
					return nil, 0, err
				}
				if exists {
					proof.Request = s.raw(proof.Request, false)
					data, _ := json.Marshal(proof.Receipt)
					_ = json.Unmarshal(s.raw(data, false), &proof.Receipt)
					out[id] = proof
				}
			}
		}
	}
	for id, proof := range proofs {
		proof.Request = s.raw(proof.Request, false)
		data, _ := json.Marshal(proof.Receipt)
		_ = json.Unmarshal(s.raw(data, false), &proof.Receipt)
		out[strings.TrimPrefix(id, course+":")] = proof
	}
	return out, count, nil
}

// Migration is deliberately opt-in. All saved references and immutable receipts
// change in one transaction/save; retries still locate the original attempt.
func (s *canonicalStore) Migrate(ctx context.Context) error {
	migrate := func(a Account) Account { a = s.account(a, false); snapshotCourse(&a); return s.account(a, true) }
	event := func(key string, action SavedAction) (string, SavedAction) {
		action.Request = s.raw(action.Request, true)
		data, _ := json.Marshal(action.Receipt)
		_ = json.Unmarshal(s.raw(data, true), &action.Receipt)
		alreadyNamespaced := false
		if strings.HasPrefix(key, "attempt:") {
			prefix, _, scoped := strings.Cut(strings.TrimPrefix(key, "attempt:"), ":")
			alreadyNamespaced = scoped && contentstore.UUID.MatchString(prefix)
		}
		if strings.HasPrefix(key, "course:") || alreadyNamespaced {
			return key, action
		}
		return s.actionKey(key), action
	}
	switch base := s.Store.(type) {
	case *JSONStore:
		base.mu.Lock()
		defer base.mu.Unlock()
		old := base.state
		next := diskState{Version: old.Version, World: old.World, Sessions: old.Sessions, Accounts: map[string]Account{}, Actions: map[string]map[string]SavedAction{}}
		for id, a := range old.Accounts {
			next.Accounts[id] = migrate(a)
		}
		for id, actions := range old.Actions {
			mapped := map[string]SavedAction{}
			for key, action := range actions {
				k, v := event(key, action)
				mapped[k] = v
			}
			next.Actions[id] = mapped
		}
		base.state = next
		if err := base.save(); err != nil {
			base.state = old
			return err
		}
		return nil
	case *PGStore:
		tx, err := base.pool.Begin(ctx)
		if err != nil {
			return err
		}
		defer tx.Rollback(ctx)
		rows, err := tx.Query(ctx, `SELECT id,data FROM accounts FOR UPDATE`)
		if err != nil {
			return err
		}
		accounts := map[string][]byte{}
		for rows.Next() {
			var id string
			var data []byte
			if err = rows.Scan(&id, &data); err != nil {
				rows.Close()
				return err
			}
			var a Account
			if err = json.Unmarshal(data, &a); err != nil {
				rows.Close()
				return err
			}
			accounts[id], _ = json.Marshal(migrate(a))
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			return err
		}
		for id, data := range accounts {
			if _, err = tx.Exec(ctx, `UPDATE accounts SET data=$2 WHERE id=$1`, id, data); err != nil {
				return err
			}
		}
		rows, err = tx.Query(ctx, `SELECT account_id,event_key,request,receipt FROM learning_events FOR UPDATE`)
		if err != nil {
			return err
		}
		type update struct {
			id, old, key     string
			request, receipt []byte
		}
		var updates []update
		for rows.Next() {
			var id, key string
			var action SavedAction
			var receipt []byte
			if err = rows.Scan(&id, &key, &action.Request, &receipt); err != nil {
				rows.Close()
				return err
			}
			if err = json.Unmarshal(receipt, &action.Receipt); err != nil {
				rows.Close()
				return err
			}
			k, v := event(key, action)
			data, _ := json.Marshal(v.Receipt)
			updates = append(updates, update{id, key, k, v.Request, data})
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			return err
		}
		for _, u := range updates {
			if _, err = tx.Exec(ctx, `UPDATE learning_events SET event_key=$3,request=$4,receipt=$5 WHERE account_id=$1 AND event_key=$2`, u.id, u.old, u.key, u.request, u.receipt); err != nil {
				return err
			}
		}
		return tx.Commit(ctx)
	default:
		return fmt.Errorf("content migration unsupported for %s", s.Store.Kind())
	}
}

func (s *canonicalStore) scopedChoice(quest, choice string, forward bool) string {
	if forward {
		if id, ok := s.choices[quest+":"+choice]; ok {
			return id
		}
	} else {
		if slug, ok := s.reverse[choice]; ok {
			if _, value, found := strings.Cut(slug, ":"); found {
				return value
			}
			return slug
		}
	}
	return choice
}
