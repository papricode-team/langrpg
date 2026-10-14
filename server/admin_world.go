package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

const maxWorldBytes = 2 * 1024 * 1024

type WorldContent struct {
	Document       json.RawMessage  `json:"document"`
	Revision       string           `json:"revision"`
	ContentVersion string           `json:"contentVersion"`
	WorldMaps      WorldMapRegistry `json:"worldMaps"`
	Investigations struct {
		Rules []StoryRule `json:"rules"`
	} `json:"investigations"`
	Diagnostics []string `json:"diagnostics"`
}

type worldEditing struct {
	mu      sync.RWMutex
	writes  sync.Mutex
	current *WorldContent
	compile func(context.Context, json.RawMessage) (*WorldContent, error)
	store   worldContentStore
	cancel  context.CancelFunc
	done    chan struct{}
}

func worldRevision(document json.RawMessage) string {
	// PostgreSQL JSONB changes key order. Hash the semantic document so a stored
	// revision survives JSONB round trips.
	var value any
	if json.Unmarshal(document, &value) != nil {
		return ""
	}
	var encoded bytes.Buffer
	encoder := json.NewEncoder(&encoded)
	encoder.SetEscapeHTML(false)
	if encoder.Encode(value) != nil {
		return ""
	}
	sum := sha256.Sum256(bytes.TrimSuffix(encoded.Bytes(), []byte("\n")))
	return hex.EncodeToString(sum[:])
}

func worldSourceVersion(document json.RawMessage) (string, error) {
	revision := worldRevision(document)
	if revision == "" {
		return "", errors.New("invalid scene JSON")
	}
	return revision[:16], nil
}

func (a *App) initWorldEditing(ctx context.Context, source, compiler string) error {
	storage, ok := a.store.(worldContentStore)
	if !ok {
		return errors.New("world editing storage is unavailable")
	}
	saved, err := storage.LoadWorldContent(ctx)
	if err != nil {
		return err
	}
	if saved == nil {
		document, err := os.ReadFile(source)
		if err != nil {
			return fmt.Errorf("read editable world: %w", err)
		}
		version, err := worldSourceVersion(document)
		if err != nil {
			return err
		}
		if version != compiledWorldMaps.ContentVersion {
			return errors.New("editable world and compiled authority differ; run node scripts/scene-compiler.mjs compile and rebuild the server")
		}
		saved = &WorldContent{Document: document, Revision: worldRevision(document), ContentVersion: compiledWorldMaps.ContentVersion, WorldMaps: compiledWorldMaps, Diagnostics: []string{}}
		rules, err := curriculumFiles.ReadFile("story_rules.json")
		if err != nil {
			return err
		}
		if err = json.Unmarshal(rules, &saved.Investigations); err != nil {
			return err
		}
	}
	if err := validateWorldContent(saved); err != nil {
		return err
	}
	absolute, err := filepath.Abs(compiler)
	if err != nil {
		return err
	}
	root := filepath.Dir(filepath.Dir(absolute))
	a.editing = &worldEditing{current: saved, store: storage, compile: func(ctx context.Context, document json.RawMessage) (*WorldContent, error) {
		command := exec.CommandContext(ctx, "node", absolute, "--root", root)
		command.Stdin = bytes.NewReader(document)
		var output, diagnostics bytes.Buffer
		command.Stdout = &output
		command.Stderr = &diagnostics
		if err := command.Run(); err != nil {
			if ctx.Err() != nil {
				return nil, &APIError{503, "world validation timed out; your draft has been retained"}
			}
			if errors.Is(err, exec.ErrNotFound) {
				return nil, &APIError{503, "the world compiler is unavailable"}
			}
			message := strings.TrimSpace(diagnostics.String())
			if message == "" {
				message = "world validation failed"
			}
			var failure struct {
				Error string `json:"error"`
			}
			if json.Unmarshal(diagnostics.Bytes(), &failure) == nil && failure.Error != "" {
				message = failure.Error
			}
			return nil, &APIError{422, message}
		}
		var next WorldContent
		if err := json.Unmarshal(output.Bytes(), &next); err != nil {
			return nil, fmt.Errorf("decode compiled world: %w", err)
		}
		next.Revision = worldRevision(next.Document)
		if err := validateWorldContent(&next); err != nil {
			return nil, err
		}
		return &next, nil
	}}
	a.world.publishContent(saved.WorldMaps)
	// PostgreSQL publication is shared across processes; synchronize revisions
	// without reloading the full scene document when nothing changed.
	pollCtx, cancel := context.WithCancel(context.Background())
	a.editing.cancel = cancel
	a.editing.done = make(chan struct{})
	go func() {
		defer close(a.editing.done)
		ticker := time.NewTicker(5 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-pollCtx.Done():
				return
			case <-ticker.C:
				ctx, stop := context.WithTimeout(pollCtx, 3*time.Second)
				if err := a.refreshWorldContent(ctx); err != nil && pollCtx.Err() == nil {
					slog.Warn("world publication refresh failed", "error", err)
				}
				stop()
			}
		}
	}()
	return nil
}

func (a *App) refreshWorldContent(ctx context.Context) error {
	editing := a.editing
	// Never wait behind a long compiler: the previous publication stays playable.
	if !editing.writes.TryLock() {
		return nil
	}
	defer editing.writes.Unlock()
	if source, ok := editing.store.(interface {
		WorldContentRevision(context.Context) (string, error)
	}); ok {
		revision, err := source.WorldContentRevision(ctx)
		if err != nil {
			return err
		}
		editing.mu.RLock()
		unchanged := revision == "" || revision == editing.current.Revision
		editing.mu.RUnlock()
		if unchanged {
			return nil
		}
	}
	saved, err := editing.store.LoadWorldContent(ctx)
	if err != nil {
		return err
	}
	if saved == nil {
		return nil
	}
	if err = validateWorldContent(saved); err != nil {
		return err
	}
	editing.mu.Lock()
	defer editing.mu.Unlock()
	if saved.Revision != editing.current.Revision {
		editing.current = saved
		a.world.publishContent(saved.WorldMaps)
	}
	return nil
}

func validateWorldContent(content *WorldContent) error {
	if content == nil || !json.Valid(content.Document) || content.Revision != worldRevision(content.Document) || content.ContentVersion != content.WorldMaps.ContentVersion {
		return errors.New("invalid saved world content")
	}
	data, err := json.Marshal(content.WorldMaps)
	if err != nil {
		return err
	}
	if _, err = parseWorldMapRegistry(data); err != nil {
		return err
	}
	if len(content.Investigations.Rules) == 0 {
		return errors.New("world content is missing story authority")
	}
	return nil
}

func (a *App) editorAvailable(w http.ResponseWriter) bool {
	if a.editing == nil {
		writeError(w, 503, "world editing is unavailable")
		return false
	}
	return true
}

func (a *App) readAdminWorld(w http.ResponseWriter, r *http.Request) {
	if _, ok := a.requireAdmin(w, r); !ok {
		return
	}
	if !a.editorAvailable(w) {
		return
	}
	if err := a.refreshWorldContent(r.Context()); err != nil {
		apiFailure(w, err)
		return
	}
	a.editing.mu.RLock()
	defer a.editing.mu.RUnlock()
	current := a.editing.current
	w.Header().Set("ETag", `"`+current.Revision+`"`)
	writeJSON(w, 200, map[string]any{"document": current.Document, "revision": current.Revision, "diagnostics": current.Diagnostics})
}

func (a *App) worldContent(w http.ResponseWriter, r *http.Request) {
	if a.editing == nil {
		writeError(w, 404, "published world is bundled with the game")
		return
	}
	if err := a.refreshWorldContent(r.Context()); err != nil {
		apiFailure(w, err)
		return
	}
	a.editing.mu.RLock()
	defer a.editing.mu.RUnlock()
	writeJSON(w, 200, map[string]any{"document": a.editing.current.Document, "contentVersion": a.editing.current.ContentVersion})
}

func readWorldDocument(w http.ResponseWriter, r *http.Request) (json.RawMessage, error) {
	if !strings.HasPrefix(strings.ToLower(r.Header.Get("Content-Type")), "application/json") {
		return nil, &APIError{415, "use Content-Type: application/json"}
	}
	data, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxWorldBytes))
	if err != nil {
		var limit *http.MaxBytesError
		if errors.As(err, &limit) {
			return nil, &APIError{413, "world document exceeds 2 MiB"}
		}
		return nil, &APIError{400, "unable to read world document"}
	}
	if !json.Valid(data) {
		return nil, &APIError{400, "invalid world JSON"}
	}
	return data, nil
}

func (a *App) compileAdminWorld(w http.ResponseWriter, r *http.Request) {
	if _, ok := a.requireAdmin(w, r); !ok {
		return
	}
	if !a.editorAvailable(w) {
		return
	}
	document, err := readWorldDocument(w, r)
	if err != nil {
		apiFailure(w, err)
		return
	}
	editing := a.editing
	// Bound concurrent compilers and keep the revision check and publication together.
	if !editing.writes.TryLock() {
		writeError(w, 409, "another world operation is in progress; try again when it finishes")
		return
	}
	defer editing.writes.Unlock()
	editing.mu.RLock()
	previous := editing.current
	editing.mu.RUnlock()
	saving := r.Method == http.MethodPut
	if saving && r.Header.Get("If-Match") != `"`+previous.Revision+`"` {
		writeError(w, 409, "this world changed; reopen the editor before saving your draft")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 55*time.Second)
	defer cancel()
	next, err := editing.compile(ctx, document)
	if err == nil {
		err = validateWorldMigration(previous.Document, next.Document)
	}
	if err != nil {
		apiFailure(w, err)
		return
	}
	if !saving {
		writeJSON(w, 200, map[string]any{"valid": true, "contentVersion": next.ContentVersion, "diagnostics": next.Diagnostics})
		return
	}
	// Authenticate again after expensive validation in case the session was revoked.
	if _, ok := a.requireAdmin(w, r); !ok {
		return
	}
	if err = editing.store.SaveWorldContent(ctx, previous.Revision, next); err != nil {
		apiFailure(w, err)
		return
	}
	editing.mu.Lock()
	defer editing.mu.Unlock()
	editing.current = next
	a.world.publishContent(next.WorldMaps)
	w.Header().Set("ETag", `"`+next.Revision+`"`)
	writeJSON(w, 200, map[string]any{"document": next.Document, "revision": next.Revision, "contentVersion": next.ContentVersion, "diagnostics": next.Diagnostics})
}

func validateWorldMigration(before, after json.RawMessage) error {
	type frame struct {
		CoordinateVersion int      `json:"coordinateVersion"`
		Width             float64  `json:"width"`
		Height            float64  `json:"height"`
		LegacyOffset      MapSpawn `json:"legacyOffset"`
	}
	var old, next struct {
		Maps map[string]frame `json:"maps"`
	}
	if json.Unmarshal(before, &old) != nil || json.Unmarshal(after, &next) != nil || len(next.Maps) == 0 {
		return &APIError{422, "invalid scene registry"}
	}
	for id := range next.Maps {
		if _, ok := old.Maps[id]; !ok {
			return &APIError{422, "unregistered world scene " + id}
		}
	}
	for id, previous := range old.Maps {
		current, ok := next.Maps[id]
		if !ok {
			return &APIError{422, "missing required scene " + id}
		}
		changed := current.Width != previous.Width || current.Height != previous.Height || current.LegacyOffset != previous.LegacyOffset
		if current.CoordinateVersion < previous.CoordinateVersion || changed && current.CoordinateVersion <= previous.CoordinateVersion {
			return &APIError{422, id + ": changed bounds/origin require a higher coordinateVersion"}
		}
	}
	return nil
}

func (a *App) currentStoryRule(id string) (StoryRule, bool) {
	if a.editing != nil {
		a.editing.mu.RLock()
		defer a.editing.mu.RUnlock()
		for _, rule := range a.editing.current.Investigations.Rules {
			if rule.QuestID == id {
				return rule, true
			}
		}
		return StoryRule{}, false
	}
	return storyRule(id)
}

func (w *World) publishContent(registry WorldMapRegistry) {
	w.mu.Lock()
	defer w.mu.Unlock()
	if registry.ContentVersion == w.contentVersion {
		return
	}
	for _, memory := range w.memories {
		for mapID, position := range memory.positions {
			if next, ok := registry.Maps[mapID]; ok {
				memory.rememberPosition(mapID, restoreWorldPosition(position, memory.positionFrames[mapID], next), next.WorldCoordinateFrame)
			}
		}
	}
	for _, client := range w.clients {
		if client.player.InteriorID == "" {
			before := w.maps[client.player.MapID]
			next := registry.Maps[client.player.MapID]
			position := restoreWorldPosition(MapSpawn{client.player.X, client.player.Y}, before.WorldCoordinateFrame, next)
			client.player.X, client.player.Y = position.X, position.Y
			if client.memory != nil {
				client.memory.rememberPosition(client.player.MapID, position, next.WorldCoordinateFrame)
			}
		}
	}
	w.maps = registry.Maps
	w.contentVersion = registry.ContentVersion
	// Version metadata makes connected clients refresh their scene before playing.
	for _, client := range w.clients {
		w.enqueueMapLocked(client, "map")
	}
}
