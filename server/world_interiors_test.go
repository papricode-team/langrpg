package main

import (
	"context"
	"encoding/json"
	"glotworld/server/internal/world"
	"math"
	"net/http/httptest"
	"testing"
	"time"
)

func interiorValue(t *testing.T, packet map[string]json.RawMessage) (string, MapSpawn, []Player) {
	t.Helper()
	_, spawn, players := mapValue(t, packet)
	var id string
	if err := json.Unmarshal(packet["interiorId"], &id); err != nil {
		t.Fatal(err)
	}
	return id, spawn, players
}

func TestSharedInteriorPresenceMovementExitAndReconnect(t *testing.T) {
	for _, room := range []string{"cafe", "bakery", "supermarket"} {
		t.Run(room, func(t *testing.T) {
			app := testApp(t)
			tokenA, playerA := createSession(t, app, "Ada")
			tokenB, playerB := createSession(t, app, "Mira")
			server := httptest.NewServer(app.Handler())
			defer server.Close()
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			one := dialMap(t, ctx, server, tokenA, DefaultMapID)
			readWorld(t, ctx, one, "welcome")
			two := dialMap(t, ctx, server, tokenB, DefaultMapID)
			readWorld(t, ctx, two, "welcome")
			returnPoint := compiledWorldMaps.Maps[DefaultMapID].Entrances[room].Return
			writeWorld(t, ctx, one, map[string]any{"type": "joinInterior", "mapId": DefaultMapID, "interiorId": room})
			id, spawn, players := interiorValue(t, readWorld(t, ctx, one, "interior"))
			if id != room || spawn != world.InteriorSpawn(room) || len(players) != 2 {
				t.Fatalf("entry lost presence: %s %+v %+v", id, spawn, players)
			}
			writeWorld(t, ctx, two, map[string]any{"type": "joinInterior", "mapId": DefaultMapID, "interiorId": room})
			_, _, players = interiorValue(t, readWorld(t, ctx, two, "interior"))
			for _, p := range players {
				if p.InteriorID != room {
					t.Fatalf("shared room missing player: %+v", p)
				}
			}
			// No stale outdoor move may overwrite the room position.
			writeWorld(t, ctx, two, map[string]any{"type": "move", "mapId": DefaultMapID, "x": 1, "y": 1})
			readWorld(t, ctx, two, "error")
			writeWorld(t, ctx, two, map[string]any{"type": "move", "mapId": DefaultMapID, "interiorId": room, "x": spawn.X - .02, "y": spawn.Y})
			var moved MapSpawn
			for moved == (MapSpawn{}) {
				players = readMoves(t, ctx, one)
				for _, p := range players {
					if p.ID == playerB.ID && p.InteriorID == room && p.X < spawn.X {
						if p.InteriorID != room || math.Hypot(p.X-spawn.X, p.Y-spawn.Y) > .021 {
							t.Fatalf("bad indoor movement: %+v", p)
						}
						moved = MapSpawn{X: p.X, Y: p.Y}
					}
				}
			}
			writeWorld(t, ctx, one, map[string]any{"type": "joinInterior", "mapId": DefaultMapID, "interiorId": ""})
			id, returned, players := interiorValue(t, readWorld(t, ctx, one, "interior"))
			if id != "" || returned != returnPoint {
				t.Fatalf("exit missed the authored storefront return: %s %+v", id, returned)
			}
			for _, p := range players {
				if p.ID == playerA.ID && p.InteriorID != "" {
					t.Fatalf("exit kept indoor presence: %+v", p)
				}
				if p.ID == playerB.ID && p.InteriorID != room {
					t.Fatalf("exit moved another player: %+v", p)
				}
			}
			_ = two.CloseNow()
			reconnected := dialMap(t, ctx, server, tokenB, DefaultMapID)
			id, resumed, _ := interiorValue(t, readWorld(t, ctx, reconnected, "welcome"))
			if id != room || resumed != moved {
				t.Fatalf("reconnect lost room: %s %+v; want %+v", id, resumed, moved)
			}
			writeWorld(t, ctx, reconnected, map[string]any{"type": "joinInterior", "mapId": DefaultMapID, "interiorId": ""})
			id, returned, _ = interiorValue(t, readWorld(t, ctx, reconnected, "interior"))
			if id != "" || returned != returnPoint {
				t.Fatalf("reconnect lost outdoor return: %s %+v", id, returned)
			}
		})
	}
}

func TestInteriorValidationAndMapTravel(t *testing.T) {
	app := testApp(t)
	token, _ := createSession(t, app, "Ada")
	server := httptest.NewServer(app.Handler())
	defer server.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	conn := dialMap(t, ctx, server, token, DefaultMapID)
	readWorld(t, ctx, conn, "welcome")
	for _, request := range []map[string]any{
		{"type": "joinInterior", "mapId": "waldruh", "interiorId": "cafe"},
		{"type": "joinInterior", "mapId": DefaultMapID, "interiorId": "unknown"},
	} {
		writeWorld(t, ctx, conn, request)
		readWorld(t, ctx, conn, "error")
	}
	writeWorld(t, ctx, conn, map[string]any{"type": "joinInterior", "mapId": DefaultMapID, "interiorId": "cafe"})
	readWorld(t, ctx, conn, "interior")
	writeWorld(t, ctx, conn, map[string]any{"type": "joinMap", "mapId": "waldruh"})
	id, spawn, _ := interiorValue(t, readWorld(t, ctx, conn, "map"))
	if id != "" || spawn != mapSpawns["waldruh"] {
		t.Fatalf("travel kept indoor coordinates: %s %+v", id, spawn)
	}
	writeWorld(t, ctx, conn, map[string]any{"type": "joinInterior", "mapId": "waldruh", "interiorId": "unknown"})
	readWorld(t, ctx, conn, "error")
	writeWorld(t, ctx, conn, map[string]any{"type": "joinMap", "mapId": DefaultMapID})
	id, spawn, _ = interiorValue(t, readWorld(t, ctx, conn, "map"))
	if id != "" || spawn != mapSpawns[DefaultMapID] {
		t.Fatalf("return restored obsolete room: %s %+v", id, spawn)
	}
}
