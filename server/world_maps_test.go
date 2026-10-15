package main

import (
	"context"
	"encoding/json"
	"glotworld/server/internal/avatar"
	"glotworld/server/internal/world"
	"math"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
)

func dialMap(t *testing.T, ctx context.Context, server *httptest.Server, token, mapID string) *websocket.Conn {
	t.Helper()
	conn, _, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(server.URL, "http")+"/api/world?token="+token+"&mapId="+mapID, nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = conn.CloseNow() })
	return conn
}

func mapValue(t *testing.T, packet map[string]json.RawMessage) (string, MapSpawn, []Player) {
	t.Helper()
	var id string
	var spawn MapSpawn
	var players []Player
	for _, field := range []struct {
		key         string
		destination any
	}{{"mapId", &id}, {"spawn", &spawn}, {"players", &players}} {
		if err := json.Unmarshal(packet[field.key], field.destination); err != nil {
			t.Fatalf("invalid %s: %v", field.key, err)
		}
	}
	for _, player := range players {
		if player.MapID != id {
			t.Fatalf("foreign player %s in %s snapshot", player.MapID, id)
		}
	}
	if _, exists := packet["messages"]; exists {
		t.Fatal("map snapshot includes retired chat history")
	}
	return id, spawn, players
}

// An invalid move gives us an ordered reply without changing world state.
// Inspect every queued snapshot before that reply so filtering cannot hide
// presence leaked from a different map or a retired chat broadcast.
func worldBarrier(t *testing.T, ctx context.Context, conn *websocket.Conn, mapID string) {
	t.Helper()
	writeWorld(t, ctx, conn, map[string]any{"type": "move", "x": -1, "y": 0})
	for {
		_, raw, err := conn.Read(ctx)
		if err != nil {
			t.Fatal(err)
		}
		var packet struct {
			Type    string   `json:"type"`
			MapID   string   `json:"mapId"`
			Players []Player `json:"players"`
			Error   string   `json:"error"`
		}
		if err = json.Unmarshal(raw, &packet); err != nil {
			t.Fatal(err)
		}
		if packet.Type == "error" {
			if packet.Error != "coordinates must be between 0 and 1" {
				t.Fatalf("unexpected barrier response: %s", packet.Error)
			}
			return
		}
		if packet.Type == "chat" {
			t.Fatal("retired chat broadcast was delivered")
		}
		if packet.MapID != mapID {
			t.Fatalf("%s packet leaked from %s into %s", packet.Type, packet.MapID, mapID)
		}
		for _, player := range packet.Players {
			if player.MapID != mapID {
				t.Fatalf("foreign presence %+v", player)
			}
		}
	}
}

func TestMapPresenceIsIsolated(t *testing.T) {
	app := testApp(t)
	tokenA, playerA := createSession(t, app, "Ada")
	tokenB, playerB := createSession(t, app, "Mira")
	server := httptest.NewServer(app.Handler())
	defer server.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	one := dialMap(t, ctx, server, tokenA, "lindenhafen")
	mapA, spawnA, playersA := mapValue(t, readWorld(t, ctx, one, "welcome"))
	if mapA != "lindenhafen" || spawnA != mapSpawns[mapA] || len(playersA) != 1 || playersA[0].ID != playerA.ID {
		t.Fatalf("first map welcome %s %+v %+v", mapA, spawnA, playersA)
	}
	two := dialMap(t, ctx, server, tokenB, "waldruh")
	mapB, spawnB, playersB := mapValue(t, readWorld(t, ctx, two, "welcome"))
	if mapB != "waldruh" || spawnB != mapSpawns[mapB] || len(playersB) != 1 || playersB[0].ID != playerB.ID {
		t.Fatalf("second map welcome %s %+v %+v", mapB, spawnB, playersB)
	}
	worldBarrier(t, ctx, one, mapA)
	worldBarrier(t, ctx, two, mapB)
	worldBarrier(t, ctx, one, mapA)
	writeWorld(t, ctx, one, map[string]any{"type": "joinMap", "mapId": "waldruh"})
	joined, _, players := mapValue(t, readWorld(t, ctx, one, "map"))
	if joined != "waldruh" || len(players) != 2 {
		t.Fatalf("new map state %s %+v", joined, players)
	}
	writeWorld(t, ctx, one, map[string]any{"type": "joinMap", "mapId": "lindenhafen"})
	joined, _, players = mapValue(t, readWorld(t, ctx, one, "map"))
	if joined != "lindenhafen" || len(players) != 1 {
		t.Fatalf("returning map state %s %+v", joined, players)
	}
}

func TestChatIsRejectedAndNeverReplayed(t *testing.T) {
	app := testApp(t)
	tokenA, _ := createSession(t, app, "Ada")
	tokenB, _ := createSession(t, app, "Mira")
	server := httptest.NewServer(app.Handler())
	defer server.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	one := dialMap(t, ctx, server, tokenA, "lindenhafen")
	mapValue(t, readWorld(t, ctx, one, "welcome"))
	two := dialMap(t, ctx, server, tokenB, "lindenhafen")
	mapValue(t, readWorld(t, ctx, two, "welcome"))
	writeWorld(t, ctx, one, map[string]any{"type": "chat", "mapId": "lindenhafen", "message": "Retired chat"})
	packet := readWorld(t, ctx, one, "error")
	var message string
	if err := json.Unmarshal(packet["error"], &message); err != nil || message != "unknown message type" {
		t.Fatalf("legacy chat was accepted: %s", packet["error"])
	}
	worldBarrier(t, ctx, two, "lindenhafen")
	writeWorld(t, ctx, one, map[string]any{"type": "joinMap", "mapId": "waldruh"})
	mapValue(t, readWorld(t, ctx, one, "map"))
	_ = one.CloseNow()
	reconnected := dialMap(t, ctx, server, tokenA, "waldruh")
	mapValue(t, readWorld(t, ctx, reconnected, "welcome"))
}

func TestWorldMessageRateLimit(t *testing.T) {
	app := testApp(t)
	token, _ := createSession(t, app, "Ada")
	server := httptest.NewServer(app.Handler())
	defer server.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	conn := dialMap(t, ctx, server, token, "lindenhafen")
	readWorld(t, ctx, conn, "welcome")
	for range 40 {
		worldBarrier(t, ctx, conn, "lindenhafen")
	}
	writeWorld(t, ctx, conn, map[string]any{"type": "move", "x": -1, "y": 0})
	for {
		_, _, err := conn.Read(ctx)
		if err == nil {
			continue
		}
		if websocket.CloseStatus(err) != websocket.StatusPolicyViolation {
			t.Fatalf("message flood was not rejected: %v", err)
		}
		break
	}
}

func TestMapSwitchRejectsInvalidAndStaleMovement(t *testing.T) {
	app := testApp(t)
	token, _ := createSession(t, app, "Ada")
	server := httptest.NewServer(app.Handler())
	defer server.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	conn := dialMap(t, ctx, server, token, "lindenhafen")
	readWorld(t, ctx, conn, "welcome")
	writeWorld(t, ctx, conn, map[string]any{"type": "joinMap", "mapId": "unknown"})
	readWorld(t, ctx, conn, "error")
	writeWorld(t, ctx, conn, map[string]any{"type": "joinMap", "mapId": "nebelstadt", "x": 1, "y": 1})
	id, spawn, players := mapValue(t, readWorld(t, ctx, conn, "map"))
	if id != "nebelstadt" || spawn != mapSpawns[id] || len(players) != 1 {
		t.Fatalf("server accepted client spawn %+v", spawn)
	}
	writeWorld(t, ctx, conn, map[string]any{"type": "move", "mapId": "lindenhafen", "x": 1, "y": 1})
	readWorld(t, ctx, conn, "error")
	for _, client := range app.world.Players() {
		if client.X != spawn.X || client.Y != spawn.Y || client.MapID != id {
			t.Errorf("stale movement changed world %+v", client)
		}
	}
	writeWorld(t, ctx, conn, map[string]any{"type": "move", "mapId": id, "coordinateVersion": compiledWorldMaps.Maps[id].CoordinateVersion, "x": 1, "y": 1})
	for {
		packet := readWorld(t, ctx, conn, "players")
		var moved []Player
		_ = json.Unmarshal(packet["players"], &moved)
		if len(moved) != 1 {
			t.Fatalf("presence %+v", moved)
		}
		distance := math.Hypot(moved[0].X-spawn.X, moved[0].Y-spawn.Y)
		if distance > 0 {
			if distance > .081 {
				t.Fatalf("map switch allowed teleport %.4f", distance)
			}
			break
		}
		// Allow the zero-credit arrival to earn movement normally.
		writeWorld(t, ctx, conn, map[string]any{"type": "move", "mapId": id, "coordinateVersion": compiledWorldMaps.Maps[id].CoordinateVersion, "x": 1, "y": 1})
	}
}

func TestMapReconnectRestoresPosition(t *testing.T) {
	app := testApp(t)
	token, _ := createSession(t, app, "Ada")
	server := httptest.NewServer(app.Handler())
	defer server.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	one := dialMap(t, ctx, server, token, "waldruh")
	_, spawn, _ := mapValue(t, readWorld(t, ctx, one, "welcome"))
	writeWorld(t, ctx, one, map[string]any{"type": "move", "mapId": "waldruh", "coordinateVersion": compiledWorldMaps.Maps["waldruh"].CoordinateVersion, "x": 1, "y": 1})
	var expected MapSpawn
	for {
		packet := readWorld(t, ctx, one, "players")
		var players []Player
		_ = json.Unmarshal(packet["players"], &players)
		expected = MapSpawn{X: players[0].X, Y: players[0].Y}
		if expected != spawn {
			break
		}
	}
	worldBarrier(t, ctx, one, "waldruh")
	_ = one.CloseNow()
	two := dialMap(t, ctx, server, token, "waldruh")
	id, resumed, players := mapValue(t, readWorld(t, ctx, two, "welcome"))
	if id != "waldruh" || resumed != expected || len(players) != 1 {
		t.Fatalf("reconnect lost map state %s %+v %+v", id, resumed, players)
	}
	worldBarrier(t, ctx, two, "waldruh")
}

func TestNewTabReplacesSessionWithoutRetryableDisconnect(t *testing.T) {
	app := testApp(t)
	token, _ := createSession(t, app, "Ada")
	server := httptest.NewServer(app.Handler())
	defer server.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	one := dialMap(t, ctx, server, token, "waldruh")
	defer one.CloseNow()
	readWorld(t, ctx, one, "welcome")

	two := dialMap(t, ctx, server, token, "waldruh")
	defer two.CloseNow()
	readWorld(t, ctx, two, "welcome")
	for {
		_, _, err := one.Read(ctx)
		if err == nil {
			continue // Drain any presence snapshots queued before takeover.
		}
		if websocket.CloseStatus(err) != world.SessionReplacedStatus {
			t.Fatalf("replaced tab received a retryable disconnect: %v", err)
		}
		break
	}
	// Cleanup from the old handler must leave the new connection registered.
	worldBarrier(t, ctx, two, "waldruh")
}

func TestMapJoinRateLimitSurvivesReconnect(t *testing.T) {
	app := testApp(t)
	token, _ := createSession(t, app, "Ada")
	server := httptest.NewServer(app.Handler())
	defer server.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	one := dialMap(t, ctx, server, token, "lindenhafen")
	readWorld(t, ctx, one, "welcome")
	for _, id := range []string{"waldruh", "nebelstadt", "lindenhafen", "waldruh"} {
		writeWorld(t, ctx, one, map[string]any{"type": "joinMap", "mapId": id})
		actual, _, _ := mapValue(t, readWorld(t, ctx, one, "map"))
		if actual != id {
			t.Fatalf("joined %s", actual)
		}
	}
	_ = one.CloseNow()
	two := dialMap(t, ctx, server, token, "waldruh")
	readWorld(t, ctx, two, "welcome")
	writeWorld(t, ctx, two, map[string]any{"type": "joinMap", "mapId": "nebelstadt"})
	readWorld(t, ctx, two, "error")
	for _, client := range app.world.Players() {
		if client.MapID != "waldruh" {
			t.Fatalf("rate-limited join changed map %+v", client)
		}
	}
}

func TestMapCapacityIsPerMapAndJoinFailureKeepsCurrentMap(t *testing.T) {
	app := testApp(t)
	app.world.SetMaxPlayersForTest(1)
	tokenA, playerA := createSession(t, app, "Ada")
	tokenB, _ := createSession(t, app, "Mira")
	tokenC, _ := createSession(t, app, "Otto")
	server := httptest.NewServer(app.Handler())
	defer server.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	one := dialMap(t, ctx, server, tokenA, "lindenhafen")
	readWorld(t, ctx, one, "welcome")
	two := dialMap(t, ctx, server, tokenB, "waldruh")
	readWorld(t, ctx, two, "welcome")
	three := dialMap(t, ctx, server, tokenC, "nebelstadt")
	readWorld(t, ctx, three, "welcome")
	if app.world.Count() != 3 {
		t.Fatalf("capacity was global: %d", app.world.Count())
	}
	writeWorld(t, ctx, one, map[string]any{"type": "joinMap", "mapId": "waldruh"})
	readWorld(t, ctx, one, "error")
	for _, client := range app.world.Players() {
		if client.ID == playerA.ID && client.MapID != "lindenhafen" {
			t.Error("full target map changed source map")
		}
	}
}

func TestInvalidInitialMapRejectedBeforeUpgrade(t *testing.T) {
	app := testApp(t)
	token, _ := createSession(t, app, "Ada")
	response := request(app, "GET", "/api/world?token="+token+"&mapId=elsewhere", "", nil)
	if response.Code != 400 {
		t.Fatalf("invalid map status %d: %s", response.Code, response.Body.String())
	}
}

func TestProfileUpdatePreservesCurrentMapAndPosition(t *testing.T) {
	app := testApp(t)
	token, player := createSession(t, app, "Ada")
	server := httptest.NewServer(app.Handler())
	defer server.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	conn := dialMap(t, ctx, server, token, "nebelstadt")
	_, spawn, _ := mapValue(t, readWorld(t, ctx, conn, "welcome"))
	recipe := Avatar{Hair: "#d9bc75", Skin: "#533728", Outfit: "#6c7894"}
	response := request(app, "POST", "/api/session", token, map[string]any{"name": "New Ada", "avatar": recipe})
	if response.Code != 200 {
		t.Fatalf("update status %d: %s", response.Code, response.Body.String())
	}
	var updated struct {
		Player Player `json:"player"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &updated); err != nil {
		t.Fatal(err)
	}
	if updated.Player.ID != player.ID || updated.Player.MapID != "nebelstadt" || updated.Player.X != spawn.X || updated.Player.Y != spawn.Y || !sameAvatar(updated.Player.Avatar, avatar.Normalize(recipe)) {
		t.Fatalf("profile update changed map position %+v", updated.Player)
	}
}

func TestReconnectCannotBypassMapJoinRateLimit(t *testing.T) {
	app := testApp(t)
	token, _ := createSession(t, app, "Ada")
	server := httptest.NewServer(app.Handler())
	defer server.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	conn := dialMap(t, ctx, server, token, "lindenhafen")
	readWorld(t, ctx, conn, "welcome")
	for _, id := range []string{"waldruh", "nebelstadt", "lindenhafen", "waldruh"} {
		writeWorld(t, ctx, conn, map[string]any{"type": "joinMap", "mapId": id})
		readWorld(t, ctx, conn, "map")
	}
	replacement := dialMap(t, ctx, server, token, "nebelstadt")
	_, _, err := replacement.Read(ctx)
	if websocket.CloseStatus(err) != websocket.StatusPolicyViolation {
		t.Fatalf("query map bypassed join limit: %v", err)
	}
	// A rejected replacement must not cancel the original authenticated socket.
	worldBarrier(t, ctx, conn, "waldruh")
}

func TestRetiredExpeditionTravelIsRejected(t *testing.T) {
	app := testApp(t)
	token, _ := createSession(t, app, "Explorer")
	manifest, err := expeditionContent()
	if err != nil {
		t.Fatal(err)
	}
	for _, game := range manifest.Games {
		t.Run(game.ID, func(t *testing.T) {
			if validMapID(game.ID) {
				t.Fatalf("retired map %s is playable", game.ID)
			}
			response := request(app, "GET", "/api/world?token="+token+"&mapId="+game.ID, "", nil)
			if response.Code != 400 {
				t.Fatalf("retired map status %d", response.Code)
			}
			if !routeUnlocked(game.ID, []string{"b1-atlas"}) {
				t.Fatal("retirement also locked its learning game")
			}
		})
	}
}

func TestMapRegistryContainsThreeUniqueDestinations(t *testing.T) {
	mapIDs := world.MapIDs()
	if len(mapIDs) != 3 || len(mapSpawns) != 3 {
		t.Fatalf("atlas registry mismatch: %d IDs, %d spawns", len(mapIDs), len(mapSpawns))
	}
	seen := make(map[string]bool)
	for _, id := range mapIDs {
		if seen[id] || !validMapID(id) {
			t.Fatalf("duplicate or unknown atlas destination %q", id)
		}
		seen[id] = true
		spawn := mapSpawns[id]
		if !world.ValidCoordinate(spawn.X) || !world.ValidCoordinate(spawn.Y) {
			t.Fatalf("invalid spawn for %s: %+v", id, spawn)
		}
	}
}
