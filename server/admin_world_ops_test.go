package main

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"testing"
	"time"
)

type editScenery struct {
	ID       string                     `json:"id"`
	Asset    string                     `json:"asset"`
	X        float64                    `json:"x"`
	Y        float64                    `json:"y"`
	Interior *struct{ Kind string }     `json:"interior"`
	Extra    map[string]json.RawMessage `json:"-"`
}

func editSceneScenery(t *testing.T, app *App, mapID string) []editScenery {
	t.Helper()
	var document struct {
		Maps map[string]struct {
			Scenery []editScenery `json:"scenery"`
		} `json:"maps"`
	}
	if err := json.Unmarshal(app.editing.current.Document, &document); err != nil {
		t.Fatal(err)
	}
	return document.Maps[mapID].Scenery
}

func secondAdmin(t *testing.T, app *App) string {
	t.Helper()
	token, _ := createSession(t, app, "Ayşe")
	if err := app.store.SetCredentials(context.Background(), tokenHash(token), "second@example.com", "stored-password-hash"); err != nil {
		t.Fatal(err)
	}
	app.adminEmails["second@example.com"] = true
	return token
}

func postOps(app *App, token string, ops any) (int, map[string]any) {
	body, _ := json.Marshal(map[string]any{"ops": ops})
	w := adminWorldRequest(app, "POST", "/api/admin/world/ops", token, "", "application/json", body)
	var value map[string]any
	_ = json.Unmarshal(w.Body.Bytes(), &value)
	return w.Code, value
}

func postLock(app *App, token, mapID, id, action string) (int, map[string]any) {
	body, _ := json.Marshal(map[string]any{"map": mapID, "id": id, "action": action})
	w := adminWorldRequest(app, "POST", "/api/admin/world/locks", token, "", "application/json", body)
	var value map[string]any
	_ = json.Unmarshal(w.Body.Bytes(), &value)
	return w.Code, value
}

func TestWorldLeasesBelongToOneAdminAndExpire(t *testing.T) {
	now := time.Unix(1_800_000_000, 0)
	leases := newWorldLeases(func() time.Time { return now })
	if _, granted := leases.acquire("waldruh", "bench", "a", "Otto"); !granted {
		t.Fatal("first admin should get the lease")
	}
	if holder, granted := leases.acquire("waldruh", "bench", "b", "Ayşe"); granted || holder.AdminName != "Otto" {
		t.Fatalf("second admin took a held lease: %+v", holder)
	}
	if _, granted := leases.acquire("waldruh", "bench", "a", "Otto"); !granted {
		t.Fatal("holder should renew")
	}
	now = now.Add(worldLeaseTTL + time.Second)
	if _, granted := leases.acquire("waldruh", "bench", "b", "Ayşe"); !granted {
		t.Fatal("expired lease should be free")
	}
	if leases.release("waldruh", "bench", "a") {
		t.Fatal("only the holder can release")
	}
	if !leases.release("waldruh", "bench", "b") || len(leases.list("")) != 0 {
		t.Fatal("holder release should clear the lease")
	}
}

func TestWorldOpsPublishCheckedEditsAndStreamPatches(t *testing.T) {
	if testing.Short() {
		t.Skip("starts the Node edit worker")
	}
	app, token := adminWorldTestApp(t, t.TempDir()+"/state.json")
	if app.editing.worker == nil {
		t.Fatal("edit worker should be configured beside the compiler")
	}
	scenery := editSceneScenery(t, app, "waldruh")
	var lamp editScenery
	for _, item := range scenery {
		if item.Asset == "lamp" {
			lamp = item
			break
		}
	}
	listener := app.world.AttachForTest(Player{ID: "listener", MapID: "nebelstadt"}, "")
	before := app.editing.current.Revision

	code, body := postOps(app, token, []map[string]any{{"kind": "move", "map": "waldruh", "id": lamp.ID, "x": lamp.X + 4, "y": lamp.Y}})
	if code != 200 {
		t.Fatalf("move: %d %v", code, body)
	}
	if app.editing.current.Revision == before || body["revision"] != app.editing.current.Revision {
		t.Fatalf("move did not publish a new revision: %v", body)
	}
	found, deadline := false, time.After(3*time.Second)
	for !found {
		select {
		case raw := <-listener:
			var patch struct {
				Type, From, ContentVersion string
				Ops                        []map[string]any
			}
			if err := json.Unmarshal(raw, &patch); err != nil || patch.Type != "world.patch" {
				continue
			}
			if len(patch.Ops) != 1 || patch.ContentVersion != app.editing.current.ContentVersion || patch.From == patch.ContentVersion {
				t.Fatalf("unexpected patch %s", raw)
			}
			found = true
		case <-deadline:
			t.Fatal("players should receive the edit as a patch")
		}
	}
	for _, item := range editSceneScenery(t, app, "waldruh") {
		if item.ID == lamp.ID && item.X != lamp.X+4 {
			t.Fatalf("stored lamp at %v", item.X)
		}
	}

	// Layout is the admin's call: an oversized lamp publishes with a warning.
	code, body = postOps(app, token, []map[string]any{{"kind": "update", "map": "waldruh", "id": lamp.ID, "width": 4000}})
	warnings, _ := body["warnings"].([]any)
	if code != 200 || len(warnings) == 0 || !strings.Contains(fmt.Sprint(warnings), "lamp") {
		t.Fatalf("oversized lamp: %d %v", code, body)
	}

	// Edits that break the world are refused, name the object and leave the publication alone.
	published := app.editing.current.Revision
	code, body = postOps(app, token, []map[string]any{{"kind": "move", "map": "waldruh", "id": lamp.ID, "x": -500, "y": lamp.Y}})
	problems, _ := body["problems"].([]any)
	if code != 422 || len(problems) == 0 || !strings.Contains(body["error"].(string), "lamp") || app.editing.current.Revision != published {
		t.Fatalf("lamp outside the town: %d %v", code, body)
	}

	// Another admin's lock blocks edits to that object only.
	other := secondAdmin(t, app)
	if code, body := postLock(app, other, "waldruh", lamp.ID, "acquire"); code != 200 {
		t.Fatalf("lock: %d %v", code, body)
	}
	if code, body := postLock(app, token, "waldruh", lamp.ID, "acquire"); code != 409 || !strings.Contains(body["error"].(string), "Ayşe") {
		t.Fatalf("second lock: %d %v", code, body)
	}
	if code, body := postOps(app, token, []map[string]any{{"kind": "move", "map": "waldruh", "id": lamp.ID, "x": lamp.X, "y": lamp.Y}}); code != 409 || !strings.Contains(body["error"].(string), "Ayşe") {
		t.Fatalf("locked move: %d %v", code, body)
	}
	if code, _ := postLock(app, other, "waldruh", lamp.ID, "release"); code != 200 {
		t.Fatal("release")
	}

	// A room cannot be removed while players are inside it.
	var bakery editScenery
	for _, item := range editSceneScenery(t, app, "waldruh") {
		if item.Interior != nil && item.Interior.Kind == "bakery" {
			bakery = item
		}
	}
	app.world.PlaceForTest("listener", "waldruh", "bakery", MapSpawn{})
	if code, body := postOps(app, token, []map[string]any{{"kind": "update", "map": "waldruh", "id": bakery.ID, "interior": nil}}); code != 409 || !strings.Contains(body["error"].(string), "inside the bakery") {
		t.Fatalf("occupied room: %d %v", code, body)
	}
	app.world.PlaceForTest("listener", "waldruh", "", MapSpawn{})
	if code, body := postOps(app, token, []map[string]any{{"kind": "update", "map": "waldruh", "id": bakery.ID, "interior": nil}}); code != 200 {
		t.Fatalf("empty room: %d %v", code, body)
	} else if warnings, _ := body["warnings"].([]any); len(warnings) == 0 {
		t.Fatalf("removing a town's bakery should warn: %v", body)
	}
	if _, exists := app.world.Definition("waldruh").Entrances["bakery"]; exists {
		t.Fatal("server authority should drop the removed doorway")
	}
}

func TestWorldEditStatusRequiresAdmin(t *testing.T) {
	app, token := adminWorldTestApp(t, t.TempDir()+"/state.json")
	player, _ := createSession(t, app, "Player")
	if w := adminWorldRequest(app, "GET", "/api/admin/world/status?map=waldruh", player, "", "", nil); w.Code != 403 {
		t.Fatalf("player status: %d", w.Code)
	}
	w := adminWorldRequest(app, "GET", "/api/admin/world/status?map=waldruh", token, "", "", nil)
	var value struct {
		Revision string       `json:"revision"`
		Locks    []WorldLease `json:"locks"`
	}
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &value) != nil || value.Revision != app.editing.current.Revision || value.Locks == nil {
		t.Fatalf("status: %d %s", w.Code, w.Body.String())
	}
}

// A brush stroke travels as its path; the server paints the weights and keeps
// the town walkable where the stroke left no water.
func TestWorldOpsPaintGroundAndRefuseUnknownMaterials(t *testing.T) {
	if testing.Short() {
		t.Skip("starts the Node edit worker")
	}
	app, token := adminWorldTestApp(t, "")
	ground := func() struct {
		Layers  []string `json:"layers"`
		Weights []string `json:"weights"`
	} {
		var document struct {
			Maps map[string]struct {
				Ground struct {
					Layers  []string `json:"layers"`
					Weights []string `json:"weights"`
				} `json:"ground"`
			} `json:"maps"`
		}
		if err := json.Unmarshal(app.editing.current.Document, &document); err != nil {
			t.Fatal(err)
		}
		return document.Maps["nebelstadt"].Ground
	}
	before := ground()
	code, body := postOps(app, token, []map[string]any{{"kind": "paint", "map": "nebelstadt", "material": "sand", "radius": 48, "strength": 1, "points": [][]float64{{1800, 300}, {2000, 300}}}})
	if code != 200 {
		t.Fatalf("paint: %d %v", code, body)
	}
	after := ground()
	if fmt.Sprint(after.Layers) == fmt.Sprint(before.Layers) && fmt.Sprint(after.Weights) == fmt.Sprint(before.Weights) {
		t.Fatal("the stroke did not change the ground")
	}
	if !strings.Contains(fmt.Sprint(after.Layers), "sand") && len(before.Layers) < 6 {
		t.Fatalf("sand did not join the ground layers: %v", after.Layers)
	}
	code, body = postOps(app, token, []map[string]any{{"kind": "paint", "map": "nebelstadt", "material": "lava", "radius": 48, "strength": 1, "points": [][]float64{{1800, 300}}}})
	if code != 422 {
		t.Fatalf("unknown material: %d %v", code, body)
	}
}
