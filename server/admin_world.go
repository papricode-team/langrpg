package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"glotworld/server/internal/store"
	"glotworld/server/internal/world"
	"io"
	"log/slog"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"sort"
	"strconv"
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
	Investigations storyAuthority   `json:"investigations"`
	Diagnostics    []string         `json:"diagnostics"`
	// ChangedMaps names the towns an edit changed; nil means any may have.
	ChangedMaps []string `json:"changedMaps,omitempty"`
	// Admin story overrides are stored per line, beside the world.
	Story StoryOverrides `json:"-"`
	// The store's publication counter behind Revision.
	revision int64
}

type storyAuthority struct {
	Rules      []StoryRule `json:"rules"`
	Ink        InkRegistry `json:"ink"`
	SideQuests []SideQuest `json:"sideQuests"`
}

type worldEditing struct {
	mu      sync.RWMutex
	writes  sync.Mutex
	current *WorldContent
	compile func(context.Context, json.RawMessage) (*WorldContent, error)
	worker  *worldWorker
	store   store.WorldStore
	// The seed world: it fills an empty database and brings new story anchors.
	seed   string
	cancel context.CancelFunc
	done   chan struct{}
}

// A world change and who made it, for the edit log.
type worldChange struct {
	actor  string
	source string
	ops    json.RawMessage
}

func revisionText(revision int64) string { return strconv.FormatInt(revision, 10) }

// splitWorldDocument separates the towns from the fields they share.
func splitWorldDocument(document json.RawMessage) (json.RawMessage, map[string]json.RawMessage, error) {
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(document, &fields); err != nil {
		return nil, nil, err
	}
	var maps map[string]json.RawMessage
	if err := json.Unmarshal(fields["maps"], &maps); err != nil || len(maps) == 0 {
		return nil, nil, errors.New("the world has no towns")
	}
	delete(fields, "maps")
	shared, err := json.Marshal(fields)
	return shared, maps, err
}

func joinWorldDocument(shared json.RawMessage, maps map[string]json.RawMessage) (json.RawMessage, error) {
	fields := map[string]json.RawMessage{}
	if err := json.Unmarshal(shared, &fields); err != nil {
		return nil, err
	}
	encoded, err := json.Marshal(maps)
	if err != nil {
		return nil, err
	}
	fields["maps"] = encoded
	return json.Marshal(fields)
}

func (c *WorldContent) publication() (json.RawMessage, error) {
	return json.Marshal(map[string]any{"contentVersion": c.ContentVersion, "worldMaps": c.WorldMaps, "investigations": c.Investigations, "diagnostics": c.Diagnostics})
}

// worldFromStore assembles the stored rows into a publication.
func worldFromStore(saved *store.World, lines []store.StoryLine) (*WorldContent, error) {
	document, err := joinWorldDocument(saved.Shared, saved.Maps)
	if err != nil {
		return nil, err
	}
	content := &WorldContent{Document: document, Revision: revisionText(saved.Revision), revision: saved.Revision}
	if err := json.Unmarshal(saved.Publication, content); err != nil {
		return nil, err
	}
	content.Document, content.Revision, content.ChangedMaps = document, revisionText(saved.Revision), nil
	if content.Diagnostics == nil {
		content.Diagnostics = []string{}
	}
	content.Story = StoryOverrides{HiddenLines: map[string]HiddenLine{}, EditedLines: map[string]EditedLine{}}
	for _, line := range lines {
		if line.Hidden != nil {
			var hidden HiddenLine
			if err := json.Unmarshal(line.Hidden, &hidden); err != nil {
				return nil, err
			}
			content.Story.HiddenLines[line.Key] = hidden
		}
		if line.Edited != nil {
			var edited EditedLine
			if err := json.Unmarshal(line.Edited, &edited); err != nil {
				return nil, err
			}
			content.Story.EditedLines[line.Key] = edited
		}
	}
	return content, nil
}

func (e *worldEditing) load(ctx context.Context) (*WorldContent, error) {
	saved, err := e.store.LoadWorld(ctx)
	if err != nil || saved == nil {
		return nil, err
	}
	lines, err := e.store.StoryLines(ctx)
	if err != nil {
		return nil, err
	}
	return worldFromStore(saved, lines)
}

// publish stores next on top of previous (nil for the first publication) and
// sets its revision. Only the towns that changed are written.
func (e *worldEditing) publish(ctx context.Context, previous, next *WorldContent, change worldChange) error {
	shared, maps, err := splitWorldDocument(next.Document)
	if err != nil {
		return err
	}
	publication, err := next.publication()
	if err != nil {
		return err
	}
	stored := store.WorldChange{Shared: shared, Maps: maps, Publication: publication, Actor: change.actor, Source: change.source, Ops: change.ops}
	expected := int64(0)
	if previous != nil {
		expected = previous.revision
		oldShared, oldMaps, err := splitWorldDocument(previous.Document)
		if err != nil {
			return err
		}
		if sameJSON(oldShared, shared) {
			stored.Shared = nil
		}
		stored.Maps = map[string]json.RawMessage{}
		changed := map[string]bool{}
		for _, id := range next.ChangedMaps {
			changed[id] = true
		}
		for id, scene := range maps {
			if next.ChangedMaps == nil && !sameJSON(oldMaps[id], scene) || changed[id] {
				stored.Maps[id] = scene
			}
		}
		for id := range oldMaps {
			if _, kept := maps[id]; !kept {
				stored.Removed = append(stored.Removed, id)
			}
		}
		sort.Strings(stored.Removed)
	}
	revision, err := e.store.SaveWorld(ctx, expected, stored)
	if err != nil {
		return err
	}
	next.revision, next.Revision, next.ChangedMaps = revision, revisionText(revision), nil
	if next.Diagnostics == nil {
		next.Diagnostics = []string{}
	}
	return nil
}

// sameJSON compares two JSON values regardless of key order and spacing.
func sameJSON(a, b json.RawMessage) bool {
	if bytes.Equal(a, b) {
		return true
	}
	var left, right any
	if json.Unmarshal(a, &left) != nil || json.Unmarshal(b, &right) != nil {
		return false
	}
	return reflect.DeepEqual(left, right)
}

func (a *App) initWorldEditing(ctx context.Context, seed, compiler string) error {
	storage, ok := store.Base(a.store).(store.WorldStore)
	if !ok {
		return errors.New("world editing storage is unavailable")
	}
	absolute, err := filepath.Abs(compiler)
	if err != nil {
		return err
	}
	root := filepath.Dir(filepath.Dir(absolute))
	editing := &worldEditing{store: storage, seed: seed, compile: func(ctx context.Context, document json.RawMessage) (*WorldContent, error) {
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
				Error    string         `json:"error"`
				Problems []WorldProblem `json:"problems"`
			}
			if json.Unmarshal(diagnostics.Bytes(), &failure) == nil && len(failure.Problems) > 0 {
				return nil, &WorldProblemError{422, failure.Problems}
			}
			if failure.Error != "" {
				message = failure.Error
			}
			return nil, worldProblems(422, "invalid", message)
		}
		var next WorldContent
		if err := json.Unmarshal(output.Bytes(), &next); err != nil {
			return nil, fmt.Errorf("decode compiled world: %w", err)
		}
		next.ChangedMaps = nil
		if err := validateWorldContent(&next); err != nil {
			return nil, err
		}
		return &next, nil
	}}
	editing.worker = newWorldWorker(filepath.Join(filepath.Dir(absolute), "admin-world-worker.mjs"), root)
	if _, err := os.Stat(editing.worker.script); err != nil {
		editing.worker = nil
	}
	saved, err := editing.load(ctx)
	if err != nil {
		return err
	}
	if saved == nil {
		if saved, err = editing.seedWorld(ctx); err != nil {
			return err
		}
	} else {
		saved = editing.reconcile(ctx, saved)
	}
	if err := validateWorldContent(saved); err != nil {
		return err
	}
	editing.current = saved
	a.editing = editing
	a.publishRegistry(saved.WorldMaps, nil, "")
	// Another process may publish (a seed or a second server); follow its
	// revision without reloading the full world when nothing changed.
	pollCtx, cancel := context.WithCancel(context.Background())
	editing.cancel = cancel
	editing.done = make(chan struct{})
	go func() {
		defer close(editing.done)
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

// seedWorld fills an empty database from the seed world.
func (e *worldEditing) seedWorld(ctx context.Context) (*WorldContent, error) {
	document, err := os.ReadFile(e.seed)
	if err != nil {
		return nil, fmt.Errorf("the database holds no world and the seed is unreadable: %w", err)
	}
	ctx, cancel := context.WithTimeout(ctx, 2*time.Minute)
	defer cancel()
	// The seed is an earlier publication: deriving its authority is enough.
	var seeded *WorldContent
	if e.worker != nil {
		seeded, err = e.worker.reconcile(ctx, document, nil)
		if err == nil {
			seeded.ChangedMaps = nil
			err = validateWorldContent(seeded)
		}
	} else {
		seeded, err = e.compile(ctx, document)
	}
	if err != nil {
		return nil, fmt.Errorf("compile the seed world: %w", err)
	}
	if err := e.publish(ctx, nil, seeded, worldChange{actor: "server", source: "seed"}); err != nil {
		if errors.Is(err, ErrConflict) {
			// Another process seeded first.
			return e.load(ctx)
		}
		return nil, err
	}
	seeded.Story = StoryOverrides{HiddenLines: map[string]HiddenLine{}, EditedLines: map[string]EditedLine{}}
	return seeded, nil
}

// reconcile adds story anchors a release introduced and recompiles story
// authority. The stored world is returned unchanged when nothing is new or the
// reconciled copy could not be stored.
func (e *worldEditing) reconcile(ctx context.Context, saved *WorldContent) *WorldContent {
	if e.worker == nil {
		return saved
	}
	var seed json.RawMessage
	if data, err := os.ReadFile(e.seed); err == nil && json.Valid(data) {
		seed = data
	}
	ctx, cancel := context.WithTimeout(ctx, maxWorkerWait)
	defer cancel()
	next, err := e.worker.reconcile(ctx, saved.Document, seed)
	if err != nil {
		slog.Warn("world reconciliation failed", "error", err)
		return saved
	}
	before, _ := json.Marshal(saved.Investigations)
	after, _ := json.Marshal(next.Investigations)
	beforeMaps, _ := json.Marshal(saved.WorldMaps)
	afterMaps, _ := json.Marshal(next.WorldMaps)
	if len(next.ChangedMaps) == 0 && next.ContentVersion == saved.ContentVersion && sameJSON(before, after) && sameJSON(beforeMaps, afterMaps) {
		return saved
	}
	if validateWorldContent(next) != nil {
		return saved
	}
	if err := e.publish(ctx, saved, next, worldChange{actor: "server", source: "release"}); err != nil {
		// Another process may have reconciled first; the next refresh reads its revision.
		slog.Warn("world reconciliation was not stored", "error", err)
		return saved
	}
	next.Story = saved.Story
	return next
}

func (a *App) refreshWorldContent(ctx context.Context) error {
	editing := a.editing
	// Never wait behind a long compiler: the previous publication stays playable.
	if !editing.writes.TryLock() {
		return nil
	}
	defer editing.writes.Unlock()
	return a.refreshWorldContentLocked(ctx)
}

// refreshWorldContentLocked adopts the stored publication when it differs from
// memory. The caller holds editing.writes.
func (a *App) refreshWorldContentLocked(ctx context.Context) error {
	editing := a.editing
	revision, err := editing.store.WorldRevision(ctx)
	if err != nil {
		return err
	}
	editing.mu.RLock()
	unchanged := revision == 0 || revision == editing.current.revision
	editing.mu.RUnlock()
	if unchanged {
		return nil
	}
	saved, err := editing.load(ctx)
	if err != nil || saved == nil {
		return err
	}
	if err = validateWorldContent(saved); err != nil {
		return err
	}
	editing.mu.Lock()
	defer editing.mu.Unlock()
	if saved.revision != editing.current.revision {
		editing.current = saved
		a.publishRegistry(saved.WorldMaps, nil, "")
	}
	return nil
}

func validateWorldContent(content *WorldContent) error {
	if content == nil || !json.Valid(content.Document) || content.ContentVersion == "" || content.ContentVersion != content.WorldMaps.ContentVersion {
		return errors.New("invalid saved world content")
	}
	data, err := json.Marshal(content.WorldMaps)
	if err != nil {
		return err
	}
	if _, err = world.ParseRegistry(data); err != nil {
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

// worldContentPerMinute bounds anonymous document reads per client address.
// Revalidation keeps normal reloads to a 304 without the 2 MiB body.
const worldContentPerMinute = 60

func (a *App) worldContent(w http.ResponseWriter, r *http.Request) {
	if a.editing == nil {
		writeError(w, 404, "published world is bundled with the game")
		return
	}
	if !a.allow("world-content:"+a.clientIP(r), worldContentPerMinute) {
		w.Header().Set("Retry-After", "60")
		writeError(w, 429, "too many world downloads; try again in a minute")
		return
	}
	if err := a.refreshWorldContent(r.Context()); err != nil {
		apiFailure(w, err)
		return
	}
	a.editing.mu.RLock()
	defer a.editing.mu.RUnlock()
	current := a.editing.current
	etag := `"world-` + current.Revision + "-" + current.ContentVersion + `"`
	w.Header().Set("ETag", etag)
	// Published worlds are public; caches must revalidate before reuse.
	w.Header().Set("Cache-Control", "no-cache")
	if etagMatches(r.Header.Get("If-None-Match"), etag) {
		w.WriteHeader(http.StatusNotModified)
		return
	}
	writeJSON(w, 200, map[string]any{"document": current.Document, "contentVersion": current.ContentVersion})
}

// etagMatches implements If-None-Match's weak comparison for a list of tags.
func etagMatches(header, etag string) bool {
	for _, candidate := range strings.Split(header, ",") {
		candidate = strings.TrimPrefix(strings.TrimSpace(candidate), "W/")
		if candidate == "*" || candidate == etag {
			return true
		}
	}
	return false
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
	account, ok := a.requireAdmin(w, r)
	if !ok || !a.editorAvailable(w) {
		return
	}
	document, err := readWorldDocument(w, r)
	if err != nil {
		apiFailure(w, err)
		return
	}
	a.publishWorldDocument(w, r, account, document, nil)
}

// worldExportFormat names the bundle that world:pull writes and world:push reads.
const worldExportFormat = "glotworld-world/1"

// exportWorld returns the whole editable world: towns, shared fields and admin story line changes.
func (a *App) exportWorld(w http.ResponseWriter, r *http.Request) {
	if _, ok := a.requireAdmin(w, r); !ok || !a.editorAvailable(w) {
		return
	}
	if err := a.refreshWorldContent(r.Context()); err != nil {
		apiFailure(w, err)
		return
	}
	a.editing.mu.RLock()
	current := a.editing.current
	a.editing.mu.RUnlock()
	w.Header().Set("ETag", `"`+current.Revision+`"`)
	writeJSON(w, 200, map[string]any{"format": worldExportFormat, "revision": current.Revision, "contentVersion": current.ContentVersion, "exportedAt": a.now().UTC(), "document": current.Document, "story": current.Story})
}

// importWorld replaces the world and its story line changes with an exported bundle.
func (a *App) importWorld(w http.ResponseWriter, r *http.Request) {
	account, ok := a.requireAdmin(w, r)
	if !ok || !a.editorAvailable(w) {
		return
	}
	data, err := readWorldDocument(w, r)
	if err != nil {
		apiFailure(w, err)
		return
	}
	var bundle struct {
		Format   string          `json:"format"`
		Document json.RawMessage `json:"document"`
		Story    *StoryOverrides `json:"story"`
	}
	if json.Unmarshal(data, &bundle) != nil || bundle.Format != worldExportFormat || !json.Valid(bundle.Document) {
		apiFailure(w, worldProblems(400, "invalid", "Send a world exported by this server ("+worldExportFormat+")."))
		return
	}
	a.publishWorldDocument(w, r, account, bundle.Document, bundle.Story)
}

// publishWorldDocument validates a whole world and, for PUT, publishes it when
// If-Match names the current revision. story, when set, replaces every admin
// story line change.
func (a *App) publishWorldDocument(w http.ResponseWriter, r *http.Request, account Account, document json.RawMessage, story *StoryOverrides) {
	editing := a.editing
	// Bound concurrent compilers and keep the revision check and publication together.
	if !editing.writes.TryLock() {
		apiFailure(w, worldProblems(409, "stale", "Another change is still being saved. Try again in a moment."))
		return
	}
	defer editing.writes.Unlock()
	editing.mu.RLock()
	previous := editing.current
	editing.mu.RUnlock()
	saving := r.Method == http.MethodPut
	if saving && r.Header.Get("If-Match") != `"`+previous.Revision+`"` {
		apiFailure(w, worldProblems(409, "stale", "The world changed since you opened it. Reload and try again."))
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
	if err = editing.publish(ctx, previous, next, worldChange{actor: account.Email, source: adminSource(r), ops: json.RawMessage(`{"kind":"import"}`)}); err != nil {
		if errors.Is(err, ErrConflict) {
			apiFailure(w, worldProblems(409, "stale", "The world changed while saving. Reload and try again."))
			return
		}
		apiFailure(w, err)
		return
	}
	next.Story = previous.Story
	if story != nil {
		if err := editing.replaceStoryLines(ctx, previous.Story, *story); err != nil {
			apiFailure(w, err)
			return
		}
		next.Story = *story
	}
	editing.mu.Lock()
	defer editing.mu.Unlock()
	editing.current = next
	a.publishRegistry(next.WorldMaps, nil, "")
	w.Header().Set("ETag", `"`+next.Revision+`"`)
	writeJSON(w, 200, map[string]any{"document": next.Document, "revision": next.Revision, "contentVersion": next.ContentVersion, "diagnostics": next.Diagnostics})
}

// replaceStoryLines writes the line changes that differ between before and after.
func (e *worldEditing) replaceStoryLines(ctx context.Context, before, after StoryOverrides) error {
	keys := map[string]bool{}
	for _, lines := range []map[string]HiddenLine{before.HiddenLines, after.HiddenLines} {
		for key := range lines {
			keys[key] = true
		}
	}
	for _, lines := range []map[string]EditedLine{before.EditedLines, after.EditedLines} {
		for key := range lines {
			keys[key] = true
		}
	}
	for key := range keys {
		line := store.StoryLine{Key: key}
		hidden, isHidden := after.HiddenLines[key]
		edited, isEdited := after.EditedLines[key]
		if isHidden {
			line.GraphID = hidden.GraphID
			line.Hidden, _ = json.Marshal(hidden)
		}
		if isEdited {
			line.GraphID = edited.GraphID
			line.Edited, _ = json.Marshal(edited)
		}
		previous, _ := json.Marshal([]any{before.HiddenLines[key], before.EditedLines[key]})
		next, _ := json.Marshal([]any{hidden, edited})
		if bytes.Equal(previous, next) {
			continue
		}
		if err := e.store.SaveStoryLine(ctx, line); err != nil {
			return err
		}
	}
	return nil
}

// listWorldEdits pages through the edit log, newest first.
func (a *App) listWorldEdits(w http.ResponseWriter, r *http.Request) {
	if _, ok := a.requireAdmin(w, r); !ok || !a.editorAvailable(w) {
		return
	}
	before, _ := strconv.ParseInt(r.URL.Query().Get("before"), 10, 64)
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	edits, err := a.editing.store.WorldEdits(r.Context(), before, limit)
	if err != nil {
		apiFailure(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"edits": edits})
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
	return a.storyRule(id)
}
