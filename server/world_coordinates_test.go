package main

import (
	"context"
	"encoding/json"
	"glotworld/server/internal/world"
	"net/http/httptest"
	"testing"
	"time"
)

func TestExpandedReconnectIncludesFrameAndRejectsStaleMoves(t *testing.T) {
	app := testApp(t)
	token, player := createSession(t, app, "Ada")
	definition := app.world.Maps()[DefaultMapID]
	definition.Width, definition.Height, definition.CoordinateVersion = 3072, 2048, 2
	definition.Spawn = MapSpawn{X: .26, Y: .305}
	app.world.SetDefinitionForTest(DefaultMapID, definition)
	app.world.RememberForTest(player.ID, DefaultMapID, "", map[string]MapSpawn{DefaultMapID: {X: .5, Y: .5}})
	server := httptest.NewServer(app.Handler())
	defer server.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	conn := dialMap(t, ctx, server, token, DefaultMapID)
	packet := readWorld(t, ctx, conn, "welcome")
	_, position, _ := mapValue(t, packet)
	if position != (MapSpawn{X: .25, Y: .25}) {
		t.Fatalf("reconnect stretched legacy position: %+v", position)
	}
	var scene struct {
		ContentVersion    string  `json:"contentVersion"`
		CoordinateVersion int     `json:"coordinateVersion"`
		Width             float64 `json:"width"`
		Height            float64 `json:"height"`
	}
	if err := json.Unmarshal(packet["scene"], &scene); err != nil || scene.CoordinateVersion != 2 || scene.Width != 3072 || scene.Height != 2048 || scene.ContentVersion == "" {
		t.Fatalf("missing reconnect coordinate contract: %+v, %v", scene, err)
	}
	for _, version := range []any{nil, 1, 3} {
		message := map[string]any{"type": "move", "mapId": DefaultMapID, "x": .3, "y": .25}
		if version != nil {
			message["coordinateVersion"] = version
		}
		writeWorld(t, ctx, conn, message)
		readWorld(t, ctx, conn, "error")
	}
	if client, _ := app.world.ClientPlayer(player.ID); client.X != position.X || client.Y != position.Y {
		t.Error("stale coordinate messages moved the player")
	}
}

func TestCompiledWorldMapRegistryValidation(t *testing.T) {
	if len(compiledWorldMaps.Maps) != 3 {
		t.Fatalf("compiled registry has %d maps", len(compiledWorldMaps.Maps))
	}
	for _, mutate := range []func(*WorldMapRegistry){
		func(registry *WorldMapRegistry) { registry.SchemaVersion = 9 },
		func(registry *WorldMapRegistry) { registry.Maps["saffroncourt"] = registry.Maps[DefaultMapID] },
		func(registry *WorldMapRegistry) { registry.ContentVersion = "" },
		func(registry *WorldMapRegistry) { delete(registry.Maps, DefaultMapID) },
		func(registry *WorldMapRegistry) {
			definition := registry.Maps[DefaultMapID]
			definition.Width = -1
			registry.Maps[DefaultMapID] = definition
		},
		func(registry *WorldMapRegistry) {
			definition := registry.Maps[DefaultMapID]
			definition.Spawn.X = 1.1
			registry.Maps[DefaultMapID] = definition
		},
	} {
		data, _ := json.Marshal(compiledWorldMaps)
		registry, err := world.ParseRegistry(data)
		if err != nil {
			t.Fatal(err)
		}
		mutate(&registry)
		data, _ = json.Marshal(registry)
		if _, err := world.ParseRegistry(data); err == nil {
			t.Fatal("accepted invalid compiled authority registry")
		}
	}
}
