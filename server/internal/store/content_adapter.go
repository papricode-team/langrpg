package store

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"glotworld/server/internal/avatar"
	"glotworld/server/internal/contentstore"
	"sort"
	"strings"
)

// Canonical is a persistence boundary for the established German engine.
// Its grading/story code may use fixture slugs internally; every stored account,
// course snapshot, immutable request, and response uses the stable UUID catalog.
type Canonical struct {
	Store
	hooks          Hooks
	forward        map[string]string
	reverse        map[string]string
	nodes          map[string]string
	choices        map[string]string
	published      map[string]string
	defaultCourse  string
	expectedCourse string
}

func NewCanonical(base Store, b *contentstore.Bundle, hooks Hooks) (*Canonical, error) {
	if err := hooks.validate(); err != nil {
		return nil, err
	}
	s := &Canonical{Store: base, hooks: hooks, forward: map[string]string{}, reverse: map[string]string{}, nodes: map[string]string{}, choices: map[string]string{}, published: map[string]string{}}
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
	kinds := map[string]string{"quests": "quest", "exercises": "exercise", "items": "item", "lexemes": "lexeme", "units": "unit", "graphs": "graph", "nodes": "node", "choices": "choice", "expeditions": "expedition", "minigames": "minigame", "lines": "sentence"}
	for key, oldID := range b.PublishedIDs {
		kind, slug, _ := strings.Cut(key, ":")
		if normalized := kinds[kind]; normalized != "" {
			if currentID := b.IDs[normalized+":"+slug]; currentID != "" {
				s.published[oldID] = currentID
				s.reverse[oldID] = slug
			}
		}
	}
	return s, nil
}

// DefaultCourse is the course legacy saves and new accounts start in.
func (s *Canonical) DefaultCourse() string { return s.defaultCourse }

// ExpectedCourse is the course this view's writes are bound to ("" for any).
func (s *Canonical) ExpectedCourse() string { return s.expectedCourse }

// WithCourse returns a view whose account writes fail with ErrCourseChanged
// unless the account's active course is courseID ("" accepts any course).
func (s *Canonical) WithCourse(courseID string) *Canonical {
	view := *s
	view.expectedCourse = courseID
	return &view
}

// WithStore returns a view over a different base store with the same
// identifier tables, for example a store wrapped with instrumentation.
func (s *Canonical) WithStore(base Store) *Canonical {
	view := *s
	view.Store = base
	return &view
}

// ForwardSlugs lists every legacy slug that has a stable UUID.
func (s *Canonical) ForwardSlugs() []string {
	slugs := make([]string, 0, len(s.forward))
	for slug := range s.forward {
		slugs = append(slugs, slug)
	}
	return slugs
}

// ForwardID maps a legacy slug to its stable content UUID.
func (s *Canonical) ForwardID(slug string) (string, bool) {
	id, ok := s.forward[slug]
	return id, ok
}

// ReverseID maps a content UUID back to its legacy slug.
func (s *Canonical) ReverseID(id string) (string, bool) {
	slug, ok := s.reverse[id]
	return slug, ok
}

// Translate maps one identifier between legacy slugs (forward=false) and
// stable UUIDs (forward=true), including prefixed evidence keys.
func (s *Canonical) Translate(value string, forward bool) string {
	if forward {
		if current, ok := s.published[value]; ok {
			return current
		}
	}
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
			if forward {
				if current, ok := s.published[tail]; ok {
					return prefix + current
				}
			}
			if v, ok := table[tail]; ok {
				return prefix + v
			}
		}
	}
	for _, mode := range []string{":production", ":recognition", ":listening"} {
		if strings.HasSuffix(value, mode) {
			head := strings.TrimSuffix(value, mode)
			if forward {
				if current, ok := s.published[head]; ok {
					return current + mode
				}
			}
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

func (s *Canonical) transform(value any, forward bool, parent string) any {
	switch v := value.(type) {
	case string:
		if contentReferenceFields[parent] {
			return s.Translate(v, forward)
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
				next = s.Translate(key, forward)
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
						quest = s.Translate(key, false)
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
					quest = s.Translate(quest, false)
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
							quest = s.Translate(quest, false)
							if quest == "" || quest == owner {
								item = stage
							}
						}
					}
				}
			}

			if quest, ok := v["questId"].(string); ok {
				quest = s.Translate(quest, false)
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

// Raw rewrites every content reference inside a JSON document.
func (s *Canonical) Raw(data []byte, forward bool) []byte {
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
func (s *Canonical) account(account Account, forward bool) Account {
	data, _ := json.Marshal(account)
	var out Account
	_ = json.Unmarshal(s.Raw(data, forward), &out)
	s.hooks.NormalizeProgress(&out.Progress)
	if out.ActiveCourseID == "" {
		// Before courses existed, a nonzero generation meant an explicit restart.
		// Course switching now advances it solely to revoke old play leases.
		if out.Access.Generation > 0 {
			out.Access.ResetTrial = true
		}
		out.ActiveCourseID = s.defaultCourse
	}
	if out.CourseStates == nil {
		out.CourseStates = map[string]CourseState{}
	}
	return out
}
func SnapshotCourse(a *Account) {
	if a.ActiveCourseID == "" {
		return
	}
	if a.CourseStates == nil {
		a.CourseStates = map[string]CourseState{}
	}
	a.CourseStates[a.ActiveCourseID] = CourseState{Progress: a.Progress, Player: a.Player, LocationFrame: a.CourseStates[a.ActiveCourseID].LocationFrame, StorySaves: a.StorySaves, RewardedQuestIDs: a.RewardedQuestIDs, RewardedExpeditionIDs: a.RewardedExpeditionIDs, SupportLanguage: a.Preferences.BaseLanguage}
}
func (s *Canonical) check(a Account) error {
	if s.expectedCourse != "" && a.ActiveCourseID != "" && a.ActiveCourseID != s.expectedCourse {
		return ErrCourseChanged
	}
	return nil
}
func (s *Canonical) Get(ctx context.Context, hash string) (Account, error) {
	a, err := s.Store.Get(ctx, hash)
	if err != nil {
		return a, err
	}
	a = s.account(a, false)
	return a, s.check(a)
}
func (s *Canonical) GetByEmail(ctx context.Context, email string) (Account, error) {
	a, err := s.Store.GetByEmail(ctx, email)
	if err == nil {
		a = s.account(a, false)
	}
	return a, err
}
func (s *Canonical) GetAccountByID(ctx context.Context, id string) (Account, error) {
	a, err := s.Store.GetAccountByID(ctx, id)
	if err == nil {
		a = s.account(a, false)
	}
	return a, err
}
func (s *Canonical) Create(ctx context.Context, hash string, a Account) error {
	if a.ActiveCourseID == "" {
		a.ActiveCourseID = s.defaultCourse
	}
	SnapshotCourse(&a)
	return s.Store.Create(ctx, hash, s.account(a, true))
}

func (s *Canonical) tokens() (AdminTokens, error) {
	tokens, ok := s.Store.(AdminTokens)
	if !ok {
		return nil, fmt.Errorf("API tokens are unavailable")
	}
	return tokens, nil
}
func (s *Canonical) CreateAdminToken(ctx context.Context, token AdminToken) error {
	tokens, err := s.tokens()
	if err != nil {
		return err
	}
	return tokens.CreateAdminToken(ctx, token)
}
func (s *Canonical) ListAdminTokens(ctx context.Context) ([]AdminToken, error) {
	tokens, err := s.tokens()
	if err != nil {
		return nil, err
	}
	return tokens.ListAdminTokens(ctx)
}
func (s *Canonical) RevokeAdminToken(ctx context.Context, id string) error {
	tokens, err := s.tokens()
	if err != nil {
		return err
	}
	return tokens.RevokeAdminToken(ctx, id)
}

// AdminTokenAccount resolves an admin API token like a session.
func (s *Canonical) AdminTokenAccount(ctx context.Context, hash string) (Account, error) {
	tokens, ok := s.Store.(AdminTokens)
	if !ok {
		return Account{}, ErrUnauthorized
	}
	a, err := tokens.AdminTokenAccount(ctx, hash)
	if err == nil {
		a = s.account(a, false)
	}
	return a, err
}
func (s *Canonical) callback(fn func(*Account) error) func(*Account) error {
	return func(raw *Account) error {
		a := s.account(*raw, false)
		if err := s.check(a); err != nil {
			return err
		}
		if err := fn(&a); err != nil {
			return err
		}
		SnapshotCourse(&a)
		*raw = s.account(a, true)
		return nil
	}
}
func (s *Canonical) UpdateAccount(ctx context.Context, hash string, fn func(*Account) error) (Account, error) {
	a, err := s.Store.UpdateAccount(ctx, hash, s.callback(fn))
	if err == nil {
		a = s.account(a, false)
	}
	return a, err
}
func (s *Canonical) UpdateAccountByID(ctx context.Context, id string, fn func(*Account) error) (Account, error) {
	a, err := s.Store.UpdateAccountByID(ctx, id, s.callback(fn))
	if err == nil {
		a = s.account(a, false)
	}
	return a, err
}
func (s *Canonical) UpdateProfile(ctx context.Context, hash, name string, recipe avatar.Avatar) (Account, error) {
	return s.UpdateAccount(ctx, hash, func(a *Account) error {
		a.Player.Name = name
		a.Player.Avatar = avatar.Normalize(recipe)
		a.Progress.Revision++
		return nil
	})
}
func (s *Canonical) UpdatePreferences(ctx context.Context, hash string, p Preferences) (Account, error) {
	return s.UpdateAccount(ctx, hash, func(a *Account) error { a.Preferences = NormalizePreferences(p); return nil })
}
func (s *Canonical) ResetGame(ctx context.Context, hash string) (Account, error) {
	a, err := s.Store.ResetGame(ctx, hash)
	if err != nil {
		return a, err
	}
	return s.account(a, false), nil
}
func (s *Canonical) actionKey(key string) string {
	course := s.expectedCourse
	if course == "" {
		course = s.defaultCourse
	}
	if strings.HasPrefix(key, "attempt:") {
		return "attempt:" + course + ":" + strings.TrimPrefix(key, "attempt:")
	}
	return "course:" + course + ":" + s.Translate(key, true)
}
func (s *Canonical) Mutate(ctx context.Context, hash, key string, request json.RawMessage, fn func(*Account) (Receipt, error)) (Account, Receipt, bool, error) {
	request = s.Raw(request, true)
	if s.expectedCourse == "" || s.expectedCourse == s.defaultCourse {
		if reader, ok := s.Store.(LegacyReceiptReader); ok {
			old, exists, err := reader.LegacyReceipt(ctx, hash, key)
			if err != nil {
				return Account{}, Receipt{}, false, err
			}
			if exists {
				if !bytes.Equal(s.Raw(old.Request, true), request) {
					return Account{}, Receipt{}, false, ErrConflict
				}
				account, err := s.Get(ctx, hash)
				if err != nil {
					return account, Receipt{}, false, err
				}
				if account.ActiveCourseID != s.defaultCourse {
					return Account{}, Receipt{}, false, ErrCourseChanged
				}
				data, _ := json.Marshal(old.Receipt)
				_ = json.Unmarshal(s.Raw(data, false), &old.Receipt)
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
		SnapshotCourse(&a)
		*raw = s.account(a, true)
		data, _ := json.Marshal(receipt)
		_ = json.Unmarshal(s.Raw(data, true), &receipt)
		return receipt, nil
	})
	if err != nil {
		return a, receipt, duplicate, err
	}
	a = s.account(a, false)
	data, _ := json.Marshal(receipt)
	_ = json.Unmarshal(s.Raw(data, false), &receipt)
	return a, receipt, duplicate, s.check(a)
}
func (s *Canonical) ActivityProofs(ctx context.Context, hash, activityID, runID string, attemptIDs []string) (map[string]SavedAction, int, error) {
	course := s.expectedCourse
	if course == "" {
		course = s.defaultCourse
	}
	ids := make([]string, len(attemptIDs))
	for i, id := range attemptIDs {
		ids[i] = course + ":" + id
	}
	proofs, count, err := s.Store.ActivityProofs(ctx, hash, s.Translate(activityID, true), runID, ids)
	if err != nil {
		return nil, 0, err
	}
	out := map[string]SavedAction{}
	if course == s.defaultCourse {
		if reader, ok := s.Store.(LegacyReceiptReader); ok {
			for _, id := range attemptIDs {
				if _, exists := proofs[course+":"+id]; exists {
					continue
				}
				proof, exists, err := reader.LegacyReceipt(ctx, hash, "attempt:"+id)
				if err != nil {
					return nil, 0, err
				}
				if exists {
					proof.Request = s.Raw(proof.Request, false)
					data, _ := json.Marshal(proof.Receipt)
					_ = json.Unmarshal(s.Raw(data, false), &proof.Receipt)
					out[id] = proof
				}
			}
		}
	}
	for id, proof := range proofs {
		proof.Request = s.Raw(proof.Request, false)
		data, _ := json.Marshal(proof.Receipt)
		_ = json.Unmarshal(s.Raw(data, false), &proof.Receipt)
		out[strings.TrimPrefix(id, course+":")] = proof
	}
	return out, count, nil
}

// Migration is deliberately opt-in. All saved references and immutable receipts
// change in one transaction/save; retries still locate the original attempt.
func (s *Canonical) Migrate(ctx context.Context) error {
	migrate := func(a Account) Account { a = s.account(a, false); SnapshotCourse(&a); return s.account(a, true) }
	event := func(key string, action SavedAction) (string, SavedAction) {
		action.Request = s.Raw(action.Request, true)
		data, _ := json.Marshal(action.Receipt)
		_ = json.Unmarshal(s.Raw(data, true), &action.Receipt)
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
	migrator, ok := s.Store.(ReferenceMigrator)
	if !ok {
		return fmt.Errorf("content migration unsupported for %s", s.Store.Kind())
	}
	return migrator.MigrateReferences(ctx, migrate, event)
}

func (s *Canonical) scopedChoice(quest, choice string, forward bool) string {
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
