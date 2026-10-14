package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"math"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func adminWorldTestApp(t *testing.T, path string) (*App, string) {
	t.Helper()
	store, err := NewJSONStore(path)
	if err != nil {
		t.Fatal(err)
	}
	app := NewApp(store, testCurriculum(), []string{"http://localhost:5173"}, 10)
	t.Cleanup(app.Close)
	if err := app.initWorldEditing(context.Background(), "../web/src/data/world-scenes.json", "../scripts/admin-world-compiler.mjs"); err != nil {
		t.Fatal(err)
	}
	app.adminEmails = map[string]bool{"admin@example.com": true}
	token, _ := createSession(t, app, "World Editor")
	if err := app.store.SetCredentials(context.Background(), tokenHash(token), "admin@example.com", "stored-password-hash"); err != nil {
		t.Fatal(err)
	}
	baseline := cloneAdminWorld(t, app.editing.current)
	app.editing.compile = func(_ context.Context, document json.RawMessage) (*WorldContent, error) {
		return adminWorldCompiledDraft(t, baseline, document), nil
	}
	return app, token
}

func cloneAdminWorld(t *testing.T, content *WorldContent) *WorldContent {
	t.Helper()
	data, err := json.Marshal(content)
	if err != nil {
		t.Fatal(err)
	}
	var copy WorldContent
	if err := json.Unmarshal(data, &copy); err != nil {
		t.Fatal(err)
	}
	// json.Marshal compacts RawMessage values; preserve snapshot bytes when
	// asserting that a validation or failed save leaves the current draft alone.
	copy.Document = append(json.RawMessage(nil), content.Document...)
	return &copy
}

// The Node bridge has real-asset tests. Endpoint tests substitute only its
// expensive validation while still deriving authority from submitted anchors.
func adminWorldCompiledDraft(t *testing.T, baseline *WorldContent, document json.RawMessage) *WorldContent {
	t.Helper()
	result := cloneAdminWorld(t, baseline)
	result.Document = append(json.RawMessage(nil), document...)
	result.Revision = worldRevision(document)
	result.ContentVersion = result.Revision[:16]
	result.WorldMaps.ContentVersion = result.ContentVersion
	var draft struct {
		Maps map[string]struct {
			WorldCoordinateFrame
			Spawn   MapSpawn      `json:"spawn"`
			NPCs    []StoryObject `json:"npcs"`
			Objects []StoryObject `json:"objects"`
		} `json:"maps"`
	}
	if err := json.Unmarshal(document, &draft); err != nil {
		t.Fatal(err)
	}
	for id, definition := range result.WorldMaps.Maps {
		scene := draft.Maps[id]
		definition.WorldCoordinateFrame = scene.WorldCoordinateFrame
		definition.Spawn = MapSpawn{X: scene.Spawn.X / scene.Width, Y: scene.Spawn.Y / scene.Height}
		result.WorldMaps.Maps[id] = definition
	}
	for i, rule := range result.Investigations.Rules {
		scene := draft.Maps[rule.MapID]
		for _, npc := range scene.NPCs {
			if npc.ID == rule.NPCID {
				result.Investigations.Rules[i].NPC = MapSpawn{X: npc.X / scene.Width, Y: npc.Y / scene.Height}
			}
		}
		for index, target := range rule.Objects {
			for _, object := range scene.Objects {
				if object.ID == target.ID {
					result.Investigations.Rules[i].Objects[index] = StoryObject{ID: object.ID, X: object.X / scene.Width, Y: object.Y / scene.Height}
				}
			}
		}
	}
	return result
}

func adminWorldDraft(t *testing.T, document json.RawMessage, edit func(map[string]any)) json.RawMessage {
	t.Helper()
	var draft map[string]any
	if err := json.Unmarshal(document, &draft); err != nil {
		t.Fatal(err)
	}
	edit(draft["maps"].(map[string]any))
	data, err := json.Marshal(draft)
	if err != nil {
		t.Fatal(err)
	}
	return data
}

func adminWorldRequest(app *App, method, path, token, revision, contentType string, body []byte) *httptest.ResponseRecorder {
	r := httptest.NewRequest(method, path, bytes.NewReader(body))
	if token != "" {
		r.Header.Set("Authorization", "Bearer "+token)
	}
	if revision != "" {
		r.Header.Set("If-Match", `"`+revision+`"`)
	}
	if contentType != "" {
		r.Header.Set("Content-Type", contentType)
	}
	w := httptest.NewRecorder()
	app.Handler().ServeHTTP(w, r)
	return w
}

func adminWorldResponseBody(w *httptest.ResponseRecorder) string {
	value := w.Body.String()
	if len(value) > 1024 {
		return value[:1024] + "… [truncated]"
	}
	return value
}

func assertAdminWorldUnchanged(t *testing.T, app *App, before *WorldContent) {
	t.Helper()
	if !reflect.DeepEqual(app.editing.current, before) {
		t.Fatal("failed or validation-only request changed the published bundle")
	}
	if app.world.contentVersion != before.ContentVersion {
		t.Fatal("failed or validation-only request changed live authority")
	}
}

func TestAdminWorldEndpointsAuthenticateBeforeReadingOrCompiling(t *testing.T) {
	app, admin := adminWorldTestApp(t, "")
	guest, _ := createSession(t, app, "Guest")
	calls := 0
	app.editing.compile = func(context.Context, json.RawMessage) (*WorldContent, error) {
		calls++
		return nil, errors.New("must not compile")
	}
	for _, token := range []string{"", guest} {
		expected := http.StatusUnauthorized
		if token != "" {
			expected = http.StatusForbidden
		}
		for _, route := range []struct{ method, path string }{
			{"GET", "/api/admin/world"}, {"POST", "/api/admin/world/validate"}, {"PUT", "/api/admin/world"},
		} {
			w := adminWorldRequest(app, route.method, route.path, token, app.editing.current.Revision, "application/json", app.editing.current.Document)
			if w.Code != expected {
				t.Fatalf("%s %s: %d %s", route.method, route.path, w.Code, adminWorldResponseBody(w))
			}
		}
	}
	if calls != 0 {
		t.Fatal("unauthorized request invoked the world compiler")
	}
	w := adminWorldRequest(app, "GET", "/api/admin/world", admin, "", "", nil)
	if w.Code != 200 || w.Header().Get("ETag") != `"`+app.editing.current.Revision+`"` {
		t.Fatalf("admin snapshot: %d %s", w.Code, adminWorldResponseBody(w))
	}
	var snapshot struct {
		Document json.RawMessage
		Revision string
	}
	if err := json.Unmarshal(w.Body.Bytes(), &snapshot); err != nil || snapshot.Revision != app.editing.current.Revision || !json.Valid(snapshot.Document) {
		t.Fatalf("invalid editable snapshot: %s", adminWorldResponseBody(w))
	}
	if got := request(app, "GET", "/api/world-content", "", nil); got.Code != 200 {
		t.Fatalf("published scenes must load before login: %d %s", got.Code, adminWorldResponseBody(got))
	}
}

func TestAdminWorldRevisionSurvivesJSONBKeyAndNumberNormalization(t *testing.T) {
	// JSONB returns object keys in its own order and can normalize numeric
	// spellings. Neither change represents an edit to a published scene.
	first := json.RawMessage(`{"version":2,"maps":{"lindenhafen":{"width":1536,"height":1024,"spawn":{"x":0.40,"y":0.6}}}}`)
	reordered := json.RawMessage(`{ "maps": { "lindenhafen": { "spawn": { "y": 0.600, "x": 0.4 }, "height": 1024.0, "width": 1536.0 } }, "version": 2.0 }`)
	if worldRevision(first) != worldRevision(reordered) {
		t.Fatal("JSONB reserialization changed the published revision")
	}
	changed := json.RawMessage(`{"version":2,"maps":{"lindenhafen":{"width":1536,"height":1024,"spawn":{"x":0.41,"y":0.6}}}}`)
	if worldRevision(first) == worldRevision(changed) {
		t.Fatal("a moved scene anchor must change the published revision")
	}
	document, err := os.ReadFile("../web/src/data/world-scenes.json")
	if err != nil {
		t.Fatal(err)
	}
	if actual := worldRevision(document)[:16]; actual != compiledWorldMaps.ContentVersion {
		t.Fatalf("Go and Node canonical world fingerprints disagree: %s != %s", actual, compiledWorldMaps.ContentVersion)
	}
}

func TestAdminWorldValidateThenSavePublishesDocumentAndStoryAuthority(t *testing.T) {
	app, token := adminWorldTestApp(t, "")
	before := cloneAdminWorld(t, app.editing.current)
	sourceBefore, err := os.ReadFile("../web/src/data/world-scenes.json")
	if err != nil {
		t.Fatal(err)
	}
	draft := adminWorldDraft(t, before.Document, func(maps map[string]any) {
		scene := maps[DefaultMapID].(map[string]any)
		npcs := scene["npcs"].([]any)
		for _, value := range npcs {
			npc := value.(map[string]any)
			if npc["id"] == before.Investigations.Rules[0].NPCID {
				npc["x"] = npc["x"].(float64) + 3
			}
		}
	})
	validated := adminWorldRequest(app, "POST", "/api/admin/world/validate", token, "", "application/json", draft)
	if validated.Code != 200 || !strings.Contains(adminWorldResponseBody(validated), `"valid":true`) {
		t.Fatalf("validate: %d %s", validated.Code, adminWorldResponseBody(validated))
	}
	assertAdminWorldUnchanged(t, app, before)
	stored, err := app.editing.store.LoadWorldContent(context.Background())
	if err != nil || stored != nil {
		t.Fatalf("validation must not persist: %v %v", stored, err)
	}
	saved := adminWorldRequest(app, "PUT", "/api/admin/world", token, before.Revision, "application/json", draft)
	if saved.Code != 200 {
		t.Fatalf("save: %d %s", saved.Code, adminWorldResponseBody(saved))
	}
	current := app.editing.current
	if current.Revision == before.Revision || saved.Header().Get("ETag") != `"`+current.Revision+`"` {
		t.Fatal("save did not return the new revision")
	}
	if current.ContentVersion != app.world.contentVersion || !reflect.DeepEqual(current.WorldMaps.Maps, app.world.maps) {
		t.Fatal("live map authority did not follow publication")
	}
	rule, ok := app.currentStoryRule(before.Investigations.Rules[0].QuestID)
	if !ok || rule.NPC == before.Investigations.Rules[0].NPC {
		t.Fatal("published story evidence still uses bundled NPC positions")
	}
	stored, err = app.editing.store.LoadWorldContent(context.Background())
	if err != nil || !reflect.DeepEqual(stored, current) {
		t.Fatalf("persisted bundle differs from published bundle: %v", err)
	}
	public := request(app, "GET", "/api/world-content", "", nil)
	var content struct {
		Document       json.RawMessage
		ContentVersion string
	}
	if public.Code != 200 || json.Unmarshal(public.Body.Bytes(), &content) != nil || content.ContentVersion != current.ContentVersion || worldRevision(content.Document) != current.Revision {
		t.Fatalf("public world did not refresh: %d %s", public.Code, adminWorldResponseBody(public))
	}
	sourceAfter, err := os.ReadFile("../web/src/data/world-scenes.json")
	if err != nil || !bytes.Equal(sourceBefore, sourceAfter) {
		t.Fatal("production publication wrote to the canonical repository source")
	}
}

func TestAdminWorldSaveRequiresCurrentRevisionBeforeCompilation(t *testing.T) {
	app, token := adminWorldTestApp(t, "")
	before := cloneAdminWorld(t, app.editing.current)
	calls := 0
	compiler := app.editing.compile
	app.editing.compile = func(ctx context.Context, document json.RawMessage) (*WorldContent, error) {
		calls++
		return compiler(ctx, document)
	}
	for _, revision := range []string{"", "stale-revision"} {
		w := adminWorldRequest(app, "PUT", "/api/admin/world", token, revision, "application/json", before.Document)
		if w.Code != 409 {
			t.Fatalf("stale or missing revision accepted: %d %s", w.Code, adminWorldResponseBody(w))
		}
	}
	if calls != 0 {
		t.Fatal("stale revision incurred compilation")
	}
	draft := adminWorldDraft(t, before.Document, func(maps map[string]any) {
		spawn := maps[DefaultMapID].(map[string]any)["spawn"].(map[string]any)
		spawn["x"] = spawn["x"].(float64) + 1
	})
	if w := adminWorldRequest(app, "PUT", "/api/admin/world", token, before.Revision, "application/json", draft); w.Code != 200 {
		t.Fatalf("first save: %d %s", w.Code, adminWorldResponseBody(w))
	}
	published := cloneAdminWorld(t, app.editing.current)
	if w := adminWorldRequest(app, "PUT", "/api/admin/world", token, before.Revision, "application/json", before.Document); w.Code != 409 {
		t.Fatalf("stale tab overwrote saved world: %d %s", w.Code, adminWorldResponseBody(w))
	}
	if calls != 1 {
		t.Fatalf("expected one compilation, got %d", calls)
	}
	assertAdminWorldUnchanged(t, app, published)
}

func TestAdminWorldInputAndCompilerFailuresLeaveDiskUnchanged(t *testing.T) {
	path := filepath.Join(t.TempDir(), "state.json")
	app, token := adminWorldTestApp(t, path)
	before := cloneAdminWorld(t, app.editing.current)
	diskBefore, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	calls := 0
	app.editing.compile = func(context.Context, json.RawMessage) (*WorldContent, error) {
		calls++
		return nil, &APIError{422, "spawn is outside walkable ground"}
	}
	for _, test := range []struct {
		name, contentType string
		body              []byte
		status            int
	}{
		{"missing content type", "", before.Document, 415},
		{"invalid JSON", "application/json", []byte("{"), 400},
		{"oversized JSON", "application/json", []byte(`"` + strings.Repeat("x", maxWorldBytes) + `"`), 413},
		{"compiler failure", "application/json", before.Document, 422},
	} {
		t.Run(test.name, func(t *testing.T) {
			w := adminWorldRequest(app, "PUT", "/api/admin/world", token, before.Revision, test.contentType, test.body)
			if w.Code != test.status {
				t.Fatalf("status: %d %s", w.Code, adminWorldResponseBody(w))
			}
			assertAdminWorldUnchanged(t, app, before)
			current, err := os.ReadFile(path)
			if err != nil || !bytes.Equal(current, diskBefore) {
				t.Fatal("invalid draft changed persisted state")
			}
		})
	}
	if calls != 1 {
		t.Fatalf("only valid-sized JSON should reach compiler: %d calls", calls)
	}
}

func TestAdminWorldRejectsSessionRevokedDuringCompilation(t *testing.T) {
	app, token := adminWorldTestApp(t, "")
	before := cloneAdminWorld(t, app.editing.current)
	compiler := app.editing.compile
	app.editing.compile = func(ctx context.Context, document json.RawMessage) (*WorldContent, error) {
		next, err := compiler(ctx, document)
		if err == nil {
			err = app.store.DeleteSession(context.Background(), tokenHash(token))
		}
		return next, err
	}
	w := adminWorldRequest(app, "PUT", "/api/admin/world", token, before.Revision, "application/json", before.Document)
	if w.Code != 401 {
		t.Fatalf("revoked session published: %d %s", w.Code, adminWorldResponseBody(w))
	}
	assertAdminWorldUnchanged(t, app, before)
	stored, err := app.editing.store.LoadWorldContent(context.Background())
	if err != nil || stored != nil {
		t.Fatal("revoked session persisted compiled world")
	}
}

type failingAdminWorldStore struct {
	worldContentStore
	err error
}

func (s failingAdminWorldStore) SaveWorldContent(context.Context, string, *WorldContent) error {
	return s.err
}

func TestAdminWorldStorageFailureDoesNotPublish(t *testing.T) {
	for _, test := range []struct {
		name   string
		err    error
		status int
	}{
		{"storage conflict", ErrConflict, 409}, {"storage unavailable", errors.New("disk unavailable"), 503},
	} {
		t.Run(test.name, func(t *testing.T) {
			app, token := adminWorldTestApp(t, "")
			before := cloneAdminWorld(t, app.editing.current)
			app.editing.store = failingAdminWorldStore{worldContentStore: app.editing.store, err: test.err}
			w := adminWorldRequest(app, "PUT", "/api/admin/world", token, before.Revision, "application/json", before.Document)
			if w.Code != test.status {
				t.Fatalf("failed publication: %d %s", w.Code, adminWorldResponseBody(w))
			}
			assertAdminWorldUnchanged(t, app, before)
		})
	}
}

func TestAdminWorldPersistsAndRestartsWithoutRepositorySource(t *testing.T) {
	path := filepath.Join(t.TempDir(), "state.json")
	app, token := adminWorldTestApp(t, path)
	before := cloneAdminWorld(t, app.editing.current)
	draft := adminWorldDraft(t, before.Document, func(maps map[string]any) {
		spawn := maps[DefaultMapID].(map[string]any)["spawn"].(map[string]any)
		spawn["x"] = spawn["x"].(float64) + 3
	})
	w := adminWorldRequest(app, "PUT", "/api/admin/world", token, before.Revision, "application/json", draft)
	if w.Code != 200 {
		t.Fatalf("save: %d %s", w.Code, adminWorldResponseBody(w))
	}
	published := cloneAdminWorld(t, app.editing.current)
	store, err := NewJSONStore(path)
	if err != nil {
		t.Fatal(err)
	}
	restarted := NewApp(store, testCurriculum(), nil, 10)
	t.Cleanup(restarted.Close)
	if err := restarted.initWorldEditing(context.Background(), filepath.Join(t.TempDir(), "missing-source.json"), "../scripts/admin-world-compiler.mjs"); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(restarted.editing.current, published) || restarted.world.contentVersion != published.ContentVersion {
		t.Fatal("restart did not recover the saved document and authority")
	}
	if err := store.SaveWorldContent(context.Background(), "stale", before); !errors.Is(err, ErrConflict) {
		t.Fatalf("storage accepted stale revision: %v", err)
	}
}

func TestAdminWorldCoordinateMigrationsRequireVersionIncrement(t *testing.T) {
	for _, test := range []struct {
		name   string
		edit   func(map[string]any)
		status int
	}{
		{"wider same version", func(scene map[string]any) { scene["width"] = scene["width"].(float64) + 10 }, 422},
		{"shifted same version", func(scene map[string]any) { scene["legacyOffset"] = map[string]any{"x": 10, "y": 0} }, 422},
		{"regressed version", func(scene map[string]any) { scene["coordinateVersion"] = scene["coordinateVersion"].(float64) - 1 }, 422},
		{"wider new version", func(scene map[string]any) {
			scene["width"] = scene["width"].(float64) + 10
			scene["coordinateVersion"] = scene["coordinateVersion"].(float64) + 1
		}, 200},
	} {
		t.Run(test.name, func(t *testing.T) {
			app, token := adminWorldTestApp(t, "")
			before := cloneAdminWorld(t, app.editing.current)
			draft := adminWorldDraft(t, before.Document, func(maps map[string]any) { test.edit(maps[DefaultMapID].(map[string]any)) })
			w := adminWorldRequest(app, "PUT", "/api/admin/world", token, before.Revision, "application/json", draft)
			if w.Code != test.status {
				t.Fatalf("migration status: %d %s", w.Code, adminWorldResponseBody(w))
			}
			if test.status != 200 {
				assertAdminWorldUnchanged(t, app, before)
			}
		})
	}
}

func TestAdminWorldMigrationRejectsMissingAndUnregisteredScenes(t *testing.T) {
	for _, test := range []struct {
		name string
		edit func(map[string]any)
	}{
		{"removed required map", func(maps map[string]any) { delete(maps, "waldruh") }},
		{"added scene", func(maps map[string]any) { maps["extra-scene"] = maps[DefaultMapID] }},
	} {
		t.Run(test.name, func(t *testing.T) {
			app, token := adminWorldTestApp(t, "")
			before := cloneAdminWorld(t, app.editing.current)
			draft := adminWorldDraft(t, before.Document, test.edit)
			w := adminWorldRequest(app, "PUT", "/api/admin/world", token, before.Revision, "application/json", draft)
			if w.Code != 422 {
				t.Fatalf("scene registry mutation accepted: %d %s", w.Code, adminWorldResponseBody(w))
			}
			assertAdminWorldUnchanged(t, app, before)
		})
	}
}

func TestAdminWorldExternalPublicationRefreshesLiveAndPublicAuthority(t *testing.T) {
	app, _ := adminWorldTestApp(t, "")
	before := cloneAdminWorld(t, app.editing.current)
	draft := adminWorldDraft(t, before.Document, func(maps map[string]any) {
		spawn := maps[DefaultMapID].(map[string]any)["spawn"].(map[string]any)
		spawn["x"] = spawn["x"].(float64) + 4
	})
	next := adminWorldCompiledDraft(t, before, draft)
	// Simulate another server publishing into the shared store.
	if err := app.editing.store.SaveWorldContent(context.Background(), before.Revision, next); err != nil {
		t.Fatal(err)
	}
	if app.editing.current.Revision != before.Revision {
		t.Fatal("external storage write unexpectedly mutated local memory")
	}
	w := request(app, "GET", "/api/world-content", "", nil)
	if w.Code != 200 || !strings.Contains(adminWorldResponseBody(w), next.ContentVersion) {
		t.Fatalf("published read did not refresh external revision: %d %s", w.Code, adminWorldResponseBody(w))
	}
	if app.editing.current.Revision != next.Revision || app.world.contentVersion != next.ContentVersion {
		t.Fatal("external revision did not refresh live authority")
	}
}

func TestPublishedWorldMigratesConnectedAndRememberedCoordinates(t *testing.T) {
	app, _ := adminWorldTestApp(t, "")
	registry := cloneAdminWorld(t, app.editing.current).WorldMaps
	before := registry.Maps[DefaultMapID]
	next := before
	next.Width += 128
	next.Height += 64
	next.LegacyOffset = MapSpawn{X: before.LegacyOffset.X + 32, Y: before.LegacyOffset.Y + 16}
	next.CoordinateVersion++
	registry.Maps[DefaultMapID] = next
	registry.ContentVersion = "published-migration"
	position := MapSpawn{X: .4, Y: .6}
	memory := &worldMemory{}
	memory.rememberPosition(DefaultMapID, position, before.WorldCoordinateFrame)
	client := &worldClient{player: Player{ID: "connected-editor", MapID: DefaultMapID, X: position.X, Y: position.Y}, memory: memory, send: make(chan []byte, 32), cancel: func() {}}
	disconnected := &worldMemory{}
	disconnected.rememberPosition(DefaultMapID, position, before.WorldCoordinateFrame)
	app.world.mu.Lock()
	app.world.clients[client.player.ID] = client
	app.world.memories["connected-session"] = memory
	app.world.memories["disconnected-session"] = disconnected
	app.world.mu.Unlock()
	app.world.publishContent(registry)
	expected := MapSpawn{X: (position.X*before.Width + 32) / next.Width, Y: (position.Y*before.Height + 16) / next.Height}
	app.world.mu.Lock()
	actual := MapSpawn{X: client.player.X, Y: client.player.Y}
	connectedPosition := memory.positions[DefaultMapID]
	disconnectedPosition := disconnected.positions[DefaultMapID]
	connectedFrame := memory.positionFrames[DefaultMapID]
	disconnectedFrame := disconnected.positionFrames[DefaultMapID]
	app.world.mu.Unlock()
	for _, value := range []MapSpawn{actual, connectedPosition, disconnectedPosition} {
		if math.Abs(value.X-expected.X) > 1e-12 || math.Abs(value.Y-expected.Y) > 1e-12 {
			t.Fatalf("map publication stretched remembered position: actual=%+v expected=%+v", value, expected)
		}
	}
	if connectedFrame != next.WorldCoordinateFrame || disconnectedFrame != next.WorldCoordinateFrame {
		t.Fatal("map publication did not advance remembered coordinate frames")
	}
	select {
	case message := <-client.send:
		var packet struct {
			Type  string
			Spawn MapSpawn
			Scene struct {
				ContentVersion    string
				CoordinateVersion int
			}
		}
		if json.Unmarshal(message, &packet) != nil || packet.Type != "map" || packet.Scene.ContentVersion != registry.ContentVersion || packet.Scene.CoordinateVersion != next.CoordinateVersion || packet.Spawn != actual {
			t.Fatalf("connected client did not receive new world metadata and migrated position: %s", message)
		}
	default:
		t.Fatal("publication did not notify the connected client")
	}
}
