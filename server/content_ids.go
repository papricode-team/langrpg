package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"

	"lernen01/server/internal/contentstore"
)

// Grading and story rules keep their private authored identifiers. Translation
// at the persistence and HTTP boundaries lets existing saves and receipts stay
// usable while the public protocol exposes only opaque catalogue identities.
func (a *App) contentID(slug string) string {
	if a.content == nil {
		return slug
	}
	for _, kind := range []string{"quests", "exercises", "items", "lexemes", "units", "graphs", "expeditions", "minigames", "narratives", "lines"} {
		if id := a.content.Resolve(kind, slug); id != "" {
			return id
		}
	}
	return slug
}

func identifierField(key string) bool {
	return key == "id" || key == "ids" || strings.HasSuffix(key, "Id") || strings.HasSuffix(key, "Ids") || key == "inventory" || key == "order"
}

func identifierMap(key string) bool {
	switch key {
	case "items", "words", "exerciseStats", "formStats", "nodes", "choices", "inspections", "gateAttempts", "gateFailures", "expeditions", "expeditionPlans", "activities":
		return true
	}
	return false
}

func presentationField(key string) bool {
	switch key {
	case "mapId", "npcId", "speakerId", "portraitId", "characterId", "interiorId", "activityId", "miniGameId", "regionId":
		return true
	}
	return false
}

func (a *App) translateContentIDs(value any, key string, outward bool) any {
	switch typed := value.(type) {
	case map[string]any:
		out := make(map[string]any, len(typed))
		for childKey, child := range typed {
			newKey := childKey
			if identifierMap(key) {
				if outward {
					newKey = a.contentID(childKey)
				} else {
					newKey = a.content.Slug(childKey)
				}
			}
			if key == "flags" {
				for _, prefix := range []string{"reply:", "reply-help:", "quest:"} {
					if strings.HasPrefix(childKey, prefix) {
						suffix := strings.TrimPrefix(childKey, prefix)
						if outward {
							newKey = prefix + a.contentID(suffix)
						} else {
							newKey = prefix + a.content.Slug(suffix)
						}
						break
					}
				}
			}
			effectiveKey := childKey
			if _, scalar := child.(string); scalar && identifierField(key) {
				effectiveKey = key
			}
			out[newKey] = a.translateContentIDs(child, effectiveKey, outward)
		}
		// Scope stage/choice identities to their owner instead of guessing from
		// a shared local label such as "intro" or "protect".
		if !outward {
			for _, field := range []string{"nodeId", "choiceId"} {
				id, _ := typed[field].(string)
				kind := "nodes"
				if field == "choiceId" {
					kind = "choices"
				}
				if record, ok := a.content.Get(kind, id); ok {
					body := contentBody(record)
					local := contentString(body, "stage")
					if field == "choiceId" {
						local = contentString(body, "localId")
						if local == "" {
							local = contentString(body, "legacyId")
						}
					}
					if local != "" {
						out[field] = local
					}
				}
			}
		}
		return out
	case []any:
		out := make([]any, len(typed))
		for i, child := range typed {
			out[i] = a.translateContentIDs(child, key, outward)
		}
		return out
	case string:
		if !presentationField(key) && identifierField(key) {
			if outward {
				return a.contentID(typed)
			}
			return a.content.Slug(typed)
		}
		return typed
	default:
		return value
	}
}

func (a *App) serveContentIDs(handler http.Handler, w http.ResponseWriter, r *http.Request) {
	if a.content == nil || !strings.HasPrefix(r.URL.Path, "/api/") || strings.HasPrefix(r.URL.Path, "/api/content/") || strings.HasPrefix(r.URL.Path, "/api/billing/") || strings.HasPrefix(r.URL.Path, "/api/admin/") || r.URL.Path == "/api/world" {
		handler.ServeHTTP(w, r)
		return
	}
	if r.Body != nil && r.Method == http.MethodPost && strings.HasPrefix(strings.ToLower(r.Header.Get("Content-Type")), "application/json") {
		data, err := io.ReadAll(io.LimitReader(r.Body, 65537))
		if err != nil || len(data) > 65536 {
			writeError(w, 400, "invalid JSON body (maximum 64 KiB)")
			return
		}
		var value any
		if json.Unmarshal(data, &value) == nil {
			data, _ = json.Marshal(a.translateContentIDs(value, "", false))
		}
		r.Body = io.NopCloser(bytes.NewReader(data))
		r.ContentLength = int64(len(data))
	}
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, r)
	for key, values := range response.Header() {
		w.Header()[key] = values
	}
	data := response.Body.Bytes()
	if strings.HasPrefix(response.Header().Get("Content-Type"), "application/json") {
		var value any
		if json.Unmarshal(data, &value) == nil {
			data, _ = json.Marshal(a.translateContentIDs(value, "", true))
		}
	}
	w.WriteHeader(response.Code)
	_, _ = w.Write(data)
}

func (a *App) translateAccount(account Account, outward bool) Account {
	if outward && account.Progress.ContentIDVersion < 1 {
		account.Progress.ContentIDVersion = 1
		account.Progress.Revision++
	}
	data, _ := json.Marshal(account)
	var value any
	_ = json.Unmarshal(data, &value)
	data, _ = json.Marshal(a.translateContentIDs(value, "", outward))
	var translated Account
	_ = json.Unmarshal(data, &translated)
	convertStory := func(story *StoryState, original StoryState) {
		for quest, value := range original.Nodes {
			if outward {
				if id := a.content.Resolve("nodes", quest+":"+value); id != "" {
					story.Nodes[a.contentID(quest)] = id
				}
			} else {
				if record, ok := a.content.Get("nodes", value); ok {
					story.Nodes[a.content.Slug(quest)] = contentString(contentBody(record), "stage")
				}
			}
		}
		for quest, value := range original.Choices {
			if outward {
				if id := a.content.Resolve("choices", quest+":"+value); id != "" {
					story.Choices[a.contentID(quest)] = id
				}
			} else {
				if record, ok := a.content.Get("choices", value); ok {
					story.Choices[a.content.Slug(quest)] = contentString(contentBody(record), "localId")
				}
			}
		}
	}
	convertStory(&translated.Progress.Story, account.Progress.Story)
	for slot, save := range translated.StorySaves {
		original := account.StorySaves[slot]
		convertStory(&save.Story, original.Story)
		translated.StorySaves[slot] = save
	}
	if !outward {
		ensureProgress(&translated.Progress)
	}
	return translated
}

type contentAccountStore struct {
	Store
	app *App
}

func (s *contentAccountStore) Create(ctx context.Context, hash string, a Account) error {
	return s.Store.Create(ctx, hash, s.app.translateAccount(a, true))
}
func (s *contentAccountStore) Get(ctx context.Context, hash string) (Account, error) {
	a, e := s.Store.Get(ctx, hash)
	return s.app.translateAccount(a, false), e
}
func (s *contentAccountStore) GetByEmail(ctx context.Context, email string) (Account, error) {
	a, e := s.Store.GetByEmail(ctx, email)
	return s.app.translateAccount(a, false), e
}
func (s *contentAccountStore) GetAccountByID(ctx context.Context, id string) (Account, error) {
	a, e := s.Store.GetAccountByID(ctx, id)
	return s.app.translateAccount(a, false), e
}
func (s *contentAccountStore) UpdateProfile(ctx context.Context, hash, name string, avatar Avatar) (Account, error) {
	a, e := s.Store.UpdateProfile(ctx, hash, name, avatar)
	return s.app.translateAccount(a, false), e
}
func (s *contentAccountStore) UpdatePreferences(ctx context.Context, hash string, p Preferences) (Account, error) {
	a, e := s.Store.UpdatePreferences(ctx, hash, p)
	return s.app.translateAccount(a, false), e
}
func (s *contentAccountStore) ResetGame(ctx context.Context, hash string) (Account, error) {
	a, e := s.Store.ResetGame(ctx, hash)
	return s.app.translateAccount(a, false), e
}

// The account adapter must preserve the independent world-authoring storage
// interface used by admin initialization and multi-process publication refresh.
func (s *contentAccountStore) LoadWorldContent(ctx context.Context) (*WorldContent, error) {
	if source, ok := s.Store.(worldContentStore); ok {
		return source.LoadWorldContent(ctx)
	}
	return nil, fmt.Errorf("world editing storage is unavailable")
}
func (s *contentAccountStore) SaveWorldContent(ctx context.Context, expected string, next *WorldContent) error {
	if source, ok := s.Store.(worldContentStore); ok {
		return source.SaveWorldContent(ctx, expected, next)
	}
	return fmt.Errorf("world editing storage is unavailable")
}
func (s *contentAccountStore) WorldContentRevision(ctx context.Context) (string, error) {
	if source, ok := s.Store.(interface {
		WorldContentRevision(context.Context) (string, error)
	}); ok {
		return source.WorldContentRevision(ctx)
	}
	return "", nil
}
func (s *contentAccountStore) UpdateAccount(ctx context.Context, hash string, fn func(*Account) error) (Account, error) {
	a, e := s.Store.UpdateAccount(ctx, hash, func(raw *Account) error {
		internal := s.app.translateAccount(*raw, false)
		if err := fn(&internal); err != nil {
			return err
		}
		*raw = s.app.translateAccount(internal, true)
		return nil
	})
	return s.app.translateAccount(a, false), e
}
func (s *contentAccountStore) UpdateAccountByID(ctx context.Context, id string, fn func(*Account) error) (Account, error) {
	a, e := s.Store.UpdateAccountByID(ctx, id, func(raw *Account) error {
		internal := s.app.translateAccount(*raw, false)
		if err := fn(&internal); err != nil {
			return err
		}
		*raw = s.app.translateAccount(internal, true)
		return nil
	})
	return s.app.translateAccount(a, false), e
}
func (s *contentAccountStore) Mutate(ctx context.Context, hash, key string, request json.RawMessage, fn func(*Account) (Receipt, error)) (Account, Receipt, bool, error) {
	a, receipt, duplicate, e := s.Store.Mutate(ctx, hash, key, request, func(raw *Account) (Receipt, error) {
		internal := s.app.translateAccount(*raw, false)
		receipt, err := fn(&internal)
		if err == nil {
			*raw = s.app.translateAccount(internal, true)
		}
		return receipt, err
	})
	return s.app.translateAccount(a, false), receipt, duplicate, e
}

func (a *App) installContent(catalogue *contentstore.Catalog, migrate bool) {
	a.content = catalogue
	a.contentLexemeLines = map[string][]string{}
	a.contentObjectQuests = map[string][]string{}
	a.contentCounts = map[string]int{}
	a.contentGrammarUnits = map[string][]string{}
	a.contentStationRooms = map[string][]string{}
	for kind, records := range catalogue.Records {
		a.contentCounts[kind] = len(records)
		for _, record := range records {
			body := contentBody(record)
			level := contentString(body, "level")
			if validLevel(level) {
				a.contentCounts[kind+":"+level]++
			}
			if kind == "units" {
				for _, id := range contentStrings(body, "grammarIds") {
					a.contentGrammarUnits[id] = append(a.contentGrammarUnits[id], record.ID)
				}
			}
		}
	}
	for _, quest := range storyQuestOrder {
		if rule, ok := storyRule(quest); ok {
			for _, object := range rule.InvestigationObjectIDs {
				a.contentObjectQuests[object] = append(a.contentObjectQuests[object], quest)
			}
		}
	}
	for _, record := range catalogue.Records["lines"] {
		if glosses, ok := contentBody(record)["glosses"].(map[string]any); ok {
			seen := map[string]bool{}
			for _, value := range glosses {
				if id, ok := value.(string); ok {
					id = strings.TrimPrefix(id, "lex:")
					if !seen[id] {
						a.contentLexemeLines[id] = append(a.contentLexemeLines[id], record.ID)
						seen[id] = true
					}
				}
			}
		}
	}
	a.indexStationExercises(catalogue)
	if migrate {
		a.store = &contentAccountStore{Store: a.store, app: a}
	}
}

// Interior stations are open to everyone who can reach their room, so their
// practice and linked activity scenarios share the room's entitlement. Word
// pacing is still enforced when an attempt is graded and in the practice queue.
func (a *App) indexStationExercises(catalogue *contentstore.Catalog) {
	add := func(exercise, room string) {
		if exercise != "" && !contains(a.contentStationRooms[exercise], room) {
			a.contentStationRooms[exercise] = append(a.contentStationRooms[exercise], room)
		}
	}
	for _, record := range catalogue.Records["narratives"] {
		body := contentBody(record)
		route, interior := contentString(body, "mapId"), contentString(body, "interiorId")
		if contentString(body, "kind") != "interior" || route == "" || interior == "" {
			continue
		}
		room := route + "/" + interior
		for _, exercise := range contentStrings(body, "exerciseIds") {
			add(exercise, room)
		}
		activity := contentString(body, "activityId")
		if activity == "" {
			continue
		}
		for _, game := range catalogue.Records["minigames"] {
			board := contentBody(game)
			if contentString(board, "kind") != "activity" || contentString(board, "activityId") != activity || contentString(board, "mapId") != route {
				continue
			}
			if scenarios, ok := board["scenarios"].([]any); ok {
				for _, value := range scenarios {
					if scenario, ok := value.(map[string]any); ok {
						add(contentString(scenario, "exerciseId"), room)
					}
				}
			}
		}
	}
}
