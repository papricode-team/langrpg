package main

import (
	"context"
	"encoding/json"
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

func mapValue(t *testing.T, packet map[string]json.RawMessage) (string, MapSpawn, []Player, []ChatMessage) {
	t.Helper()
	var id string
	var spawn MapSpawn
	var players []Player
	var messages []ChatMessage
	for _, field := range []struct {
		key         string
		destination any
	}{{"mapId", &id}, {"spawn", &spawn}, {"players", &players}, {"messages", &messages}} {
		if err := json.Unmarshal(packet[field.key], field.destination); err != nil {
			t.Fatalf("invalid %s: %v", field.key, err)
		}
	}
	for _, player := range players {
		if player.MapID != id {
			t.Fatalf("foreign player %s in %s snapshot", player.MapID, id)
		}
	}
	for _, message := range messages {
		if message.MapID != id {
			t.Fatalf("foreign chat %s in %s history", message.MapID, id)
		}
	}
	return id, spawn, players, messages
}

// Inspect every frame up to an own-chat barrier. A foreign chat cannot be hidden
// by readWorld's filtering or by an earlier queued players snapshot.
func readIsolatedChat(t *testing.T, ctx context.Context, conn *websocket.Conn, mapID, expected string) ChatMessage {
	t.Helper()
	for {
		_, raw, err := conn.Read(ctx)
		if err != nil {
			t.Fatal(err)
		}
		var packet struct {
			Type    string      `json:"type"`
			MapID   string      `json:"mapId"`
			Players []Player    `json:"players"`
			Message ChatMessage `json:"message"`
		}
		if err = json.Unmarshal(raw, &packet); err != nil {
			t.Fatal(err)
		}
		if packet.MapID != mapID {
			t.Fatalf("%s packet leaked from %s into %s", packet.Type, packet.MapID, mapID)
		}
		for _, player := range packet.Players {
			if player.MapID != mapID {
				t.Fatalf("foreign presence %+v", player)
			}
		}
		if packet.Type == "chat" {
			if packet.Message.Text != expected || packet.Message.MapID != mapID {
				t.Fatalf("foreign chat delivered %+v", packet.Message)
			}
			return packet.Message
		}
	}
}

func TestMapPresenceChatAndHistoryAreIsolated(t *testing.T) {
	app := testApp(t)
	tokenA, playerA := createSession(t, app, "Ada")
	tokenB, playerB := createSession(t, app, "Mira")
	server := httptest.NewServer(app.Handler())
	defer server.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	one := dialMap(t, ctx, server, tokenA, "lindenhafen")
	mapA, spawnA, playersA, _ := mapValue(t, readWorld(t, ctx, one, "welcome"))
	if mapA != "lindenhafen" || spawnA != mapSpawns[mapA] || len(playersA) != 1 || playersA[0].ID != playerA.ID {
		t.Fatalf("first map welcome %s %+v %+v", mapA, spawnA, playersA)
	}
	two := dialMap(t, ctx, server, tokenB, "waldruh")
	mapB, spawnB, playersB, _ := mapValue(t, readWorld(t, ctx, two, "welcome"))
	if mapB != "waldruh" || spawnB != mapSpawns[mapB] || len(playersB) != 1 || playersB[0].ID != playerB.ID {
		t.Fatalf("second map welcome %s %+v %+v", mapB, spawnB, playersB)
	}
	writeWorld(t, ctx, one, map[string]any{"type": "chat", "mapId": mapA, "message": "Linden only"})
	readIsolatedChat(t, ctx, one, mapA, "Linden only")
	writeWorld(t, ctx, two, map[string]any{"type": "chat", "mapId": mapB, "message": "Wald only"})
	readIsolatedChat(t, ctx, two, mapB, "Wald only")
	writeWorld(t, ctx, one, map[string]any{"type": "chat", "mapId": mapA, "message": "Linden barrier"})
	readIsolatedChat(t, ctx, one, mapA, "Linden barrier")
	writeWorld(t, ctx, one, map[string]any{"type": "joinMap", "mapId": "waldruh"})
	joined, _, players, history := mapValue(t, readWorld(t, ctx, one, "map"))
	if joined != "waldruh" || len(players) != 2 || len(history) != 1 || history[0].Text != "Wald only" {
		t.Fatalf("new map state %s %+v %+v", joined, players, history)
	}
	writeWorld(t, ctx, one, map[string]any{"type": "joinMap", "mapId": "lindenhafen"})
	joined, _, players, history = mapValue(t, readWorld(t, ctx, one, "map"))
	if joined != "lindenhafen" || len(players) != 1 || len(history) != 2 {
		t.Fatalf("returning map state %s %+v %+v", joined, players, history)
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
	id, spawn, players, _ := mapValue(t, readWorld(t, ctx, conn, "map"))
	if id != "nebelstadt" || spawn != mapSpawns[id] || len(players) != 1 {
		t.Fatalf("server accepted client spawn %+v", spawn)
	}
	writeWorld(t, ctx, conn, map[string]any{"type": "move", "mapId": "lindenhafen", "x": 1, "y": 1})
	readWorld(t, ctx, conn, "error")
	writeWorld(t, ctx, conn, map[string]any{"type": "chat", "mapId": "lindenhafen", "message": "Stale map"})
	readWorld(t, ctx, conn, "error")
	app.world.mu.Lock()
	for _, client := range app.world.clients {
		if client.player.X != spawn.X || client.player.Y != spawn.Y || client.player.MapID != id {
			t.Errorf("stale movement changed world %+v", client.player)
		}
	}
	app.world.mu.Unlock()
	writeWorld(t, ctx, conn, map[string]any{"type": "move", "mapId": id, "x": 1, "y": 1})
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
		writeWorld(t, ctx, conn, map[string]any{"type": "move", "mapId": id, "x": 1, "y": 1})
	}
}

func TestMapReconnectRestoresPositionAndChatLimits(t *testing.T) {
	app := testApp(t)
	token, _ := createSession(t, app, "Ada")
	server := httptest.NewServer(app.Handler())
	defer server.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	one := dialMap(t, ctx, server, token, "waldruh")
	_, spawn, _, _ := mapValue(t, readWorld(t, ctx, one, "welcome"))
	writeWorld(t, ctx, one, map[string]any{"type": "move", "mapId": "waldruh", "x": 1, "y": 1})
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
	for _, text := range []string{"one", "two", "three"} {
		writeWorld(t, ctx, one, map[string]any{"type": "chat", "message": text})
		readIsolatedChat(t, ctx, one, "waldruh", text)
	}
	_ = one.CloseNow()
	two := dialMap(t, ctx, server, token, "waldruh")
	id, resumed, players, history := mapValue(t, readWorld(t, ctx, two, "welcome"))
	if id != "waldruh" || resumed != expected || len(players) != 1 || len(history) != 3 {
		t.Fatalf("reconnect lost map state %s %+v %+v %+v", id, resumed, players, history)
	}
	writeWorld(t, ctx, two, map[string]any{"type": "chat", "message": "fourth"})
	readWorld(t, ctx, two, "error")
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
		actual, _, _, _ := mapValue(t, readWorld(t, ctx, one, "map"))
		if actual != id {
			t.Fatalf("joined %s", actual)
		}
	}
	_ = one.CloseNow()
	two := dialMap(t, ctx, server, token, "waldruh")
	readWorld(t, ctx, two, "welcome")
	writeWorld(t, ctx, two, map[string]any{"type": "joinMap", "mapId": "nebelstadt"})
	readWorld(t, ctx, two, "error")
	app.world.mu.Lock()
	defer app.world.mu.Unlock()
	for _, client := range app.world.clients {
		if client.player.MapID != "waldruh" {
			t.Fatalf("rate-limited join changed map %+v", client.player)
		}
	}
}

func TestMapCapacityIsPerMapAndJoinFailureKeepsCurrentMap(t *testing.T) {
	app := testApp(t)
	app.world.maxPlayers = 1
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
	app.world.mu.Lock()
	for _, client := range app.world.clients {
		if client.player.ID == playerA.ID && client.player.MapID != "lindenhafen" {
			t.Error("full target map changed source map")
		}
	}
	app.world.mu.Unlock()
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
	_, spawn, _, _ := mapValue(t, readWorld(t, ctx, conn, "welcome"))
	avatar := Avatar{Hair: "#d9bc75", Skin: "#533728", Outfit: "#6c7894"}
	response := request(app, "POST", "/api/session", token, map[string]any{"name": "New Ada", "avatar": avatar})
	if response.Code != 200 {
		t.Fatalf("update status %d: %s", response.Code, response.Body.String())
	}
	var updated struct {
		Player Player `json:"player"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &updated); err != nil {
		t.Fatal(err)
	}
	if updated.Player.ID != player.ID || updated.Player.MapID != "nebelstadt" || updated.Player.X != spawn.X || updated.Player.Y != spawn.Y || updated.Player.Avatar != avatar {
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
	writeWorld(t, ctx, conn, map[string]any{"type": "chat", "mapId": "waldruh", "message": "Still here"})
	readIsolatedChat(t, ctx, conn, "waldruh", "Still here")
}
