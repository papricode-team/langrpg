package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"regexp"
	"strings"
	"sync"
	"time"
	"unicode"
	"unicode/utf8"

	"glotworld/server/internal/contentstore"
)

type APIError struct {
	Status  int
	Message string
}

func (e *APIError) Error() string { return e.Message }

type App struct {
	editing             *worldEditing
	billing             *CreemBilling
	leaseOwner          string
	store               Store
	world               *World
	curriculum          Curriculum
	content             *contentstore.Catalog
	contentLexemeLines  map[string][]string
	contentObjectQuests map[string][]string
	contentCounts       map[string]int
	contentGrammarUnits map[string][]string
	// Exercise UUID -> rooms ("mapId/interiorId") whose stations offer it.
	contentStationRooms map[string][]string
	origins             map[string]bool
	adminEmails         map[string]bool
	frontend            http.Handler
	version             string
	now                 func() time.Time
	rateMu              sync.Mutex
	limits              map[string]rateWindow
}
type rateWindow struct {
	At    time.Time
	Count int
}

func NewApp(store Store, curriculum Curriculum, origins []string, maxPlayers int) *App {
	a := &App{store: store, curriculum: curriculum, origins: map[string]bool{}, now: time.Now, limits: map[string]rateWindow{}}
	a.leaseOwner, _ = randomID(16)
	if a.leaseOwner == "" {
		a.leaseOwner = fmt.Sprintf("%p-%d", a, time.Now().UnixNano())
	}
	var allowed []string
	for _, origin := range origins {
		origin = strings.TrimRight(strings.TrimSpace(origin), "/")
		if origin != "" {
			a.origins[origin] = true
			allowed = append(allowed, origin)
		}
	}
	a.world = newWorldWithIdentity(maxPlayers, allowed, store.WorldIdentity())
	return a
}

func (a *App) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", a.health)
	mux.HandleFunc("GET /api/version", a.deploymentVersion)
	mux.HandleFunc("POST /api/session", a.session)
	mux.HandleFunc("POST /api/account/register", a.registerAccount)
	mux.HandleFunc("POST /api/referral/link", a.referralLink)
	mux.HandleFunc("POST /api/account/login", a.loginAccount)
	mux.HandleFunc("POST /api/account/logout", a.logoutAccount)
	mux.HandleFunc("GET /api/access", a.access)
	mux.HandleFunc("POST /api/access/heartbeat", a.accessHeartbeat)
	mux.HandleFunc("POST /api/access/reset", a.resetAccess)
	mux.HandleFunc("POST /api/billing/checkout", a.billingCheckout)
	mux.HandleFunc("POST /api/billing/portal", a.billingPortal)
	mux.HandleFunc("POST /api/billing/sync", a.billingSync)
	mux.HandleFunc("POST /api/billing/webhook", a.billingWebhook)
	mux.HandleFunc("POST /api/preferences", a.updatePreferences)
	mux.HandleFunc("GET /api/progress", a.progress)
	mux.HandleFunc("POST /api/attempt", a.attempt)
	mux.HandleFunc("GET /api/retrievals", a.retrievals)
	mux.HandleFunc("POST /api/exposure", a.exposure)
	mux.HandleFunc("POST /api/intake/heartbeat", a.heartbeat)
	mux.HandleFunc("POST /api/quest/complete", a.completeQuest)
	mux.HandleFunc("POST /api/course/complete", a.completeUnit)
	mux.HandleFunc("POST /api/activity/complete", a.completeActivity)
	mux.HandleFunc("GET /api/story", a.story)
	mux.HandleFunc("POST /api/story/transition", a.transitionStory)
	mux.HandleFunc("POST /api/story/inspect", a.inspectStory)
	mux.HandleFunc("POST /api/story/save", a.saveStory)
	mux.HandleFunc("POST /api/story/load", a.loadStory)
	mux.HandleFunc("POST /api/story/sleep", a.sleepStory)
	mux.HandleFunc("POST /api/story/cinematic", a.storyCinematic)
	mux.HandleFunc("GET /api/world-clock", a.worldClock)
	mux.HandleFunc("POST /api/expedition/answer", a.answerExpedition)
	mux.HandleFunc("POST /api/expedition/plan", a.planExpedition)
	mux.HandleFunc("GET /api/content/bootstrap", a.contentBootstrap)
	mux.HandleFunc("GET /api/content/graphs/{id}", a.contentGraph)
	mux.HandleFunc("GET /api/content/lines", a.contentLines)
	mux.HandleFunc("GET /api/content/exercises/{id}", a.contentExercise)
	mux.HandleFunc("GET /api/content/lexemes", a.contentLexemes)
	mux.HandleFunc("GET /api/content/units/{id}", a.contentUnit)
	mux.HandleFunc("GET /api/content/expeditions/{id}", a.contentExpedition)
	mux.HandleFunc("GET /api/content/minigames/{id}", a.contentMinigame)
	mux.HandleFunc("GET /api/content/narratives/{id}", a.contentNarrative)
	mux.HandleFunc("GET /api/world", a.connect)
	mux.HandleFunc("GET /api/world-content", a.worldContent)
	mux.HandleFunc("GET /api/admin/world", a.readAdminWorld)
	mux.HandleFunc("POST /api/admin/world/validate", a.compileAdminWorld)
	mux.HandleFunc("PUT /api/admin/world", a.compileAdminWorld)
	missing := func(w http.ResponseWriter, r *http.Request) { writeError(w, 404, "endpoint not found") }
	mux.HandleFunc("/api/", missing)
	mux.HandleFunc("/api", missing)
	if a.frontend != nil {
		mux.Handle("/", a.frontend)
	} else {
		mux.HandleFunc("/", missing)
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Cache-Control", "no-store")
		origin := r.Header.Get("Origin")
		if origin != "" {
			if !a.origins[origin] {
				writeError(w, 403, "origin is not allowed")
				return
			}
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Add("Vary", "Origin")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type, If-Match, If-None-Match")
			w.Header().Set("Access-Control-Expose-Headers", "ETag, Retry-After")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		if !a.enforceGameAccess(w, r) {
			return
		}
		a.serveContentIDs(mux, w, r)
	})
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(value); err != nil {
		slog.Debug("response write failed", "error", err)
	}
}
func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}

func apiFailure(w http.ResponseWriter, err error) {
	var apiError *APIError
	var accessError *AccessDeniedError
	switch {
	case errors.As(err, &accessError):
		writeAccessBlocked(w, accessError.Access)
	case errors.As(err, &apiError):
		writeError(w, apiError.Status, apiError.Message)
	case errors.Is(err, ErrUnauthorized):
		writeError(w, 401, "session is invalid; create or restore a session")
	case errors.Is(err, ErrConflict):
		writeError(w, 409, ErrConflict.Error())
	default:
		slog.Error("API operation failed", "error", err)
		writeError(w, 503, "storage is temporarily unavailable")
	}
}

func decodeJSON(w http.ResponseWriter, r *http.Request, value any) error {
	if !strings.HasPrefix(strings.ToLower(r.Header.Get("Content-Type")), "application/json") {
		return &APIError{415, "use Content-Type: application/json"}
	}
	r.Body = http.MaxBytesReader(w, r.Body, 8192)
	d := json.NewDecoder(r.Body)
	if err := d.Decode(value); err != nil {
		return &APIError{400, "invalid JSON body (maximum 8 KiB)"}
	}
	var extra any
	if err := d.Decode(&extra); err != io.EOF {
		return &APIError{400, "send exactly one JSON object"}
	}
	return nil
}

func bearer(r *http.Request) (string, error) {
	value := r.Header.Get("Authorization")
	if !strings.HasPrefix(value, "Bearer ") {
		return "", ErrUnauthorized
	}
	token := strings.TrimPrefix(value, "Bearer ")
	if len(token) < 32 || len(token) > 128 || strings.ContainsAny(token, " \r\n\t") {
		return "", ErrUnauthorized
	}
	return tokenHash(token), nil
}

func (a *App) health(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()
	if err := a.store.Health(ctx); err != nil {
		writeError(w, 503, "storage is unavailable")
		return
	}
	writeJSON(w, 200, map[string]any{"status": "ok", "storage": a.store.Kind(), "players": a.world.Count()})
}

var paletteValue = regexp.MustCompile(`^[A-Za-z0-9_#-]{1,32}$`)
var safeID = regexp.MustCompile(`^[A-Za-z0-9_-]{1,100}$`)

func validName(name string) bool {
	if utf8.RuneCountInString(name) < 2 || utf8.RuneCountInString(name) > 24 {
		return false
	}
	for _, r := range name {
		if !unicode.IsLetter(r) && !unicode.IsNumber(r) && !unicode.IsMark(r) && r != ' ' && r != '-' && r != '_' && r != '\'' {
			return false
		}
	}
	return true
}

func (a *App) allow(key string, limit int) bool {
	return a.allowCount(key, limit, 1)
}

func (a *App) allowCount(key string, limit, count int) bool {
	a.rateMu.Lock()
	defer a.rateMu.Unlock()
	now := time.Now()
	// Expire old entries instead of retaining every remote address forever.
	if len(a.limits) > 2048 {
		for k, v := range a.limits {
			if now.Sub(v.At) > time.Minute {
				delete(a.limits, k)
			}
		}
		if len(a.limits) > 4096 {
			return false
		}
	}
	window := a.limits[key]
	if now.Sub(window.At) > time.Minute {
		window = rateWindow{At: now}
	}
	window.Count += count
	a.limits[key] = window
	return window.Count <= limit
}

func (a *App) session(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Name   string `json:"name"`
		Avatar Avatar `json:"avatar"`
		Level  string `json:"level"`
		// Optional on a new session; resuming never changes saved preferences.
		BaseLanguage string `json:"baseLanguage"`
	}
	if err := decodeJSON(w, r, &input); err != nil {
		apiFailure(w, err)
		return
	}
	if r.Header.Get("Authorization") != "" {
		hash, err := bearer(r)
		if err != nil {
			apiFailure(w, err)
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
		defer cancel()
		account, err := a.getAccount(ctx, hash)
		if err != nil {
			apiFailure(w, err)
			return
		}
		// An empty profile resumes; a supplied profile updates this same account.
		if input.Name != "" || !input.Avatar.empty() {
			input.Name = strings.TrimSpace(input.Name)
			if !validName(input.Name) || !validAvatar(input.Avatar) {
				writeError(w, 400, "provide a valid name and complete avatar")
				return
			}
			account, err = a.store.UpdateProfile(ctx, hash, input.Name, input.Avatar)
			if err != nil {
				apiFailure(w, err)
				return
			}
			account.Player = a.world.UpdateProfile(account.Player)
		}
		writeJSON(w, 200, a.sessionResponse(strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer "), account))
		return
	}
	input.Name = strings.TrimSpace(input.Name)
	if !validName(input.Name) {
		writeError(w, 400, "name must contain 2–24 letters, numbers, spaces, apostrophes, dashes or underscores")
		return
	}
	if !validAvatar(input.Avatar) {
		writeError(w, 400, "choose valid hair, skin and outfit values")
		return
	}
	if input.Level != "" && input.Level != "A1" && input.Level != "A2" && input.Level != "B1" {
		writeError(w, 400, "level must be A1, A2 or B1")
		return
	}
	if input.BaseLanguage != "" && !validBaseLanguage(input.BaseLanguage) {
		writeError(w, 400, "baseLanguage must be en or tr")
		return
	}
	remote, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		remote = r.RemoteAddr
	}
	if !a.allow("session:"+remote, 60) {
		writeError(w, 429, "too many new sessions; try again in a minute")
		return
	}
	token, err := randomID(32)
	if err != nil {
		apiFailure(w, err)
		return
	}
	id, err := randomID(16)
	if err != nil {
		apiFailure(w, err)
		return
	}
	account := Account{Player: Player{ID: id, Name: input.Name, X: .52, Y: .61, Avatar: input.Avatar, MapID: DefaultMapID}, Progress: newProgress(), CreatedAt: a.now().UTC(), Preferences: normalizedPreferences(Preferences{BaseLanguage: input.BaseLanguage})}
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()
	if err = a.store.Create(ctx, tokenHash(token), account); err != nil {
		apiFailure(w, err)
		return
	}
	writeJSON(w, 201, a.sessionResponse(token, account))
}

func (a *App) progress(w http.ResponseWriter, r *http.Request) {
	hash, err := bearer(r)
	if err != nil {
		apiFailure(w, err)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()
	account, err := a.getAccount(ctx, hash)
	if err != nil {
		apiFailure(w, err)
		return
	}
	writeJSON(w, 200, account.Progress)
}

type AttemptInput struct {
	ID                string          `json:"id"`
	MiniGameID        string          `json:"miniGameId,omitempty"`
	AnswerKind        string          `json:"answerKind,omitempty"`
	ContextExerciseID string          `json:"contextExerciseId,omitempty"`
	RegionID          string          `json:"regionId,omitempty"`
	ContentID         string          `json:"contentId,omitempty"`
	SelectedValue     *int            `json:"selectedValue,omitempty"`
	ItemID            string          `json:"itemId"`
	ExerciseID        string          `json:"exerciseId"`
	Answer            string          `json:"answer"`
	Hinted            bool            `json:"hinted"`
	Mode              string          `json:"mode"`
	QuestID           string          `json:"questId,omitempty"`
	ActivityID        string          `json:"activityId,omitempty"`
	RunID             string          `json:"runId,omitempty"`
	Level             string          `json:"level,omitempty"`
	Rating            string          `json:"rating,omitempty"`
	ResponseTimeMs    int             `json:"responseTimeMs,omitempty"`
	ScenarioID        string          `json:"scenarioId,omitempty"`
	BoardState        json.RawMessage `json:"boardState,omitempty"`
	SceneAttempt      bool            `json:"sceneAttempt,omitempty"`
	GuidedChoice      bool            `json:"guidedChoice,omitempty"`
	Preview           bool            `json:"preview,omitempty"`
	Reveal            bool            `json:"reveal,omitempty"`
}

// Opening A1 conversations offer authored replies to tap. They prove supported
// comprehension of this scene, never independently producing the German phrase.
func (a *App) isGuidedStoryGate(input AttemptInput) bool {
	rule, known := a.currentStoryRule(input.QuestID)
	exercise, installed := a.curriculum.Exercises[input.ExerciseID]
	return input.GuidedChoice && input.SceneAttempt && input.Mode == "recognition" && input.Hinted &&
		known && installed && exercise.Mode == "production" && input.ExerciseID == rule.GateExerciseID &&
		a.curriculum.Items[exercise.ItemID].Level == "A1" && input.ActivityID == "" && input.RunID == ""
}

func contains(values []string, value string) bool {
	for _, v := range values {
		if v == value {
			return true
		}
	}
	return false
}

func (a *App) completeQuest(w http.ResponseWriter, r *http.Request) {
	hash, err := bearer(r)
	if err != nil {
		apiFailure(w, err)
		return
	}
	var input struct {
		QuestID    string `json:"questId"`
		SilentMode bool   `json:"silentMode,omitempty"`
	}
	if err = decodeJSON(w, r, &input); err != nil {
		apiFailure(w, err)
		return
	}
	quest, ok := a.curriculum.Quests[input.QuestID]
	if !ok {
		writeError(w, 400, "unknown quest")
		return
	}
	request, _ := json.Marshal(input)
	key := "quest:" + quest.ID
	if input.SilentMode {
		key += ":silent"
	}
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()
	account, receipt, duplicate, err := a.mutate(ctx, hash, key, request, func(account *Account) (Receipt, error) {
		if contains(account.Progress.CompletedQuestIDs, quest.ID) {
			return Receipt{}, nil
		}
		if contains(storyQuestOrder, quest.ID) {
			return Receipt{}, &APIError{409, "continue this investigation in the world; practice exercises do not complete the story"}
		}
		if err := requireQuestOrder(quest.ID, account.Progress.CompletedQuestIDs); err != nil {
			return Receipt{}, err
		}
		for _, id := range quest.RequiredItemIDs {
			if input.SilentMode && a.curriculum.listeningOnlyItem(id) {
				continue
			}
			memory, ok := account.Progress.Items[id]
			correct := 0
			if ok {
				for _, stats := range memory.ModeStats {
					correct += stats.Correct
				}
			}
			if correct == 0 {
				return Receipt{}, &APIError{409, fmt.Sprintf("complete every exercise in this quest first (missing %s)", id)}
			}
		}
		account.Progress.CompletedQuestIDs = append(account.Progress.CompletedQuestIDs, quest.ID)
		ensureStory(&account.Progress)
		reward := 0
		if !contains(account.RewardedQuestIDs, quest.ID) {
			reward = quest.Reward
			account.RewardedQuestIDs = append(account.RewardedQuestIDs, quest.ID)
			account.Progress.XP += reward
		}
		return Receipt{XPAdded: reward}, nil
	})
	if err != nil {
		apiFailure(w, err)
		return
	}
	added := receipt.XPAdded
	if duplicate {
		added = 0
	}
	writeJSON(w, 200, map[string]any{"xpAdded": added, "duplicate": duplicate, "progress": account.Progress})
}

func (a *App) connect(w http.ResponseWriter, r *http.Request) {
	// Browser websocket constructors cannot set Authorization headers.
	// Requiring an explicitly allowed browser Origin prevents cross-site token use.
	if origin := r.Header.Get("Origin"); origin != "" && !a.origins[origin] {
		writeError(w, 403, "origin is not allowed")
		return
	}
	token := r.URL.Query().Get("token")
	if len(token) < 32 || len(token) > 128 {
		writeError(w, 401, "a valid session token is required")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	hash := tokenHash(token)
	account, err := a.getAccount(ctx, hash)
	if err == nil {
		ctx = context.WithValue(ctx, accessGenerationKey{}, account.Access.Generation)
		playing := true
		account, err = a.touchAccess(ctx, hash, &playing)
	}
	if err == nil && account.Billing.Plan != "" && !a.hasPaidAccess(account, a.now().UTC()) {
		account = a.refreshAccessBilling(ctx, account)
	}
	cancel()
	if err != nil {
		apiFailure(w, err)
		return
	}
	if access := a.accessState(account, a.now().UTC()); accessBlocked(access) {
		writeAccessBlocked(w, access)
		return
	}
	if mapID := r.URL.Query().Get("mapId"); mapID != "" && !validMapID(mapID) {
		writeError(w, 400, "unknown map; choose a destination from the atlas")
		return
	}
	var authorize func(context.Context, string) error
	if _, installed := a.curriculum.Quests["a1-arrival"]; installed {
		authorize = func(ctx context.Context, mapID string) error {
			current, err := a.store.Get(ctx, tokenHash(token))
			if err != nil {
				return err
			}
			if !routeUnlocked(mapID, current.Progress.CompletedQuestIDs) {
				return routeLockedError(mapID)
			}
			return nil
		}
		if mapID := r.URL.Query().Get("mapId"); mapID != "" && !routeUnlocked(mapID, account.Progress.CompletedQuestIDs) {
			apiFailure(w, routeLockedError(mapID))
			return
		}
	}
	guard := func(ctx context.Context, renew bool) (AccessStatus, error) {
		ctx = context.WithValue(ctx, accessGenerationKey{}, account.Access.Generation)
		// Movement messages check authoritative time without writing account JSON
		// for every frame. The socket ticker persists and renews the same lease.
		var current Account
		var err error
		if renew {
			current, err = a.touchAccess(ctx, hash, nil)
		} else {
			current, err = a.store.Get(ctx, hash)
		}
		if err != nil {
			return AccessStatus{}, err
		}
		if err := checkAccessGeneration(ctx, current); err != nil {
			return AccessStatus{}, err
		}
		if current.Billing.Plan != "" && !a.hasPaidAccess(current, a.now().UTC()) {
			current = a.refreshAccessBilling(ctx, current)
		}
		return a.accessState(current, a.now().UTC()), nil
	}
	stopped := func() {
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		ctx = context.WithValue(ctx, accessGenerationKey{}, account.Access.Generation)
		playing := false
		_, _ = a.touchAccess(ctx, hash, &playing)
	}
	a.world.ServeHTTP(w, r, account.Player, account.Progress, account.Access.Generation, authorize, guard, stopped)
}

func (a *App) Close() {
	if a.editing != nil && a.editing.cancel != nil {
		a.editing.cancel()
		<-a.editing.done
	}
	a.world.Close()
	a.store.Close()
}
