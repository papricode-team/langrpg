package main

import (
	"context"
	"encoding/json"
	"math"
	"net/http/httptest"
	"testing"
	"time"
)

func coordinateTestWorld(width, height float64) (*World, *worldClient, WorldMapDefinition) {
	definition := WorldMapDefinition{WorldCoordinateFrame: WorldCoordinateFrame{CoordinateVersion: 2, Width: width, Height: height}, Spawn: MapSpawn{.25, .25}}
	client := &worldClient{player: Player{ID: "walker", MapID: DefaultMapID, X: 400 / width, Y: 300 / height},
		memory: &worldMemory{lastMove: time.Unix(100, 0)}}
	world := &World{maps: map[string]WorldMapDefinition{DefaultMapID: definition}, clients: map[string]*worldClient{"walker": client}}
	return world, client, definition
}

func TestWorldMovementPreservesPhysicalSpeedAcrossMapSizes(t *testing.T) {
	for _, bounds := range [][2]float64{{1536, 1024}, {3072, 2048}, {3072, 1024}} {
		for _, angle := range []float64{0, math.Pi / 4, math.Pi / 2, math.Pi} {
			world, client, definition := coordinateTestWorld(bounds[0], bounds[1])
			version := definition.CoordinateVersion
			start := MapSpawn{client.player.X, client.player.Y}
			// A full second of actual client movement at its current 225 units/s,
			// transmitted at 15 Hz, must survive authority in every direction.
			for tick := 1; tick <= 15; tick++ {
				distance := float64(tick) * 15
				if err := world.moveInLocationVersioned(client, DefaultMapID, "", start.X+math.Cos(angle)*distance/bounds[0], start.Y+math.Sin(angle)*distance/bounds[1],
					time.Unix(100, 0).Add(time.Duration(tick)*time.Second/15), &version); err != "" {
					t.Fatal(err)
				}
			}
			dx, dy := definition.delta(start, MapSpawn{client.player.X, client.player.Y})
			if distance := math.Hypot(dx, dy); math.Abs(distance-225) > .000001 {
				t.Fatalf("bounds %v angle %v moved %v world units instead of 225", bounds, angle, distance)
			}
		}
	}
}

func TestWorldMovementPreservesLegacyAuthorityEnvelope(t *testing.T) {
	for _, bounds := range [][2]float64{{1536, 1024}, {3072, 2048}} {
		for _, delta := range []MapSpawn{{400, 0}, {0, 400}, {400, 400}, {-300, -200}} {
			world, client, definition := coordinateTestWorld(bounds[0], bounds[1])
			version, start := definition.CoordinateVersion, MapSpawn{client.player.X, client.player.Y}
			if err := world.moveInLocationVersioned(client, DefaultMapID, "", start.X+delta.X/bounds[0], start.Y+delta.Y/bounds[1], time.Unix(100, 0).Add(100*time.Millisecond), &version); err != "" {
				t.Fatal(err)
			}
			dx, dy := definition.delta(start, MapSpawn{client.player.X, client.player.Y})
			legacyFraction := .024 / math.Hypot(delta.X/legacyWorldWidth, delta.Y/legacyWorldHeight)
			if math.Abs(dx-delta.X*legacyFraction) > .000001 || math.Abs(dy-delta.Y*legacyFraction) > .000001 {
				t.Fatalf("bounds %v delta %+v changed legacy allowance to (%v,%v)", bounds, delta, dx, dy)
			}
			if math.Abs(worldMovementDistance(dx, dy)-worldMoveUnitsPerSecond*.1) > .000001 {
				t.Fatal("movement credit no longer measures the same physical envelope")
			}
		}
	}
}

func TestStoryProximityPreservesPhysicalLegacyEllipse(t *testing.T) {
	for _, bounds := range [][2]float64{{1536, 1024}, {3072, 2048}, {3072, 1024}} {
		world, client, definition := coordinateTestWorld(bounds[0], bounds[1])
		target := MapSpawn{client.player.X, client.player.Y}
		for _, radius := range []struct {
			legacy float64
			world  WorldRange
		}{{.15, storyNPCRange}, {.12, storyEvidenceRange}} {
			for _, delta := range []MapSpawn{{150, 0}, {0, 150}, {220, 0}, {150, 100}, {230.5, 0}, {0, 154}, {185, 0}, {0, 123}} {
				client.player.X, client.player.Y = target.X+delta.X/definition.Width, target.Y+delta.Y/definition.Height
				want := math.Hypot(delta.X/legacyWorldWidth, delta.Y/legacyWorldHeight) <= radius.legacy
				if got := world.nearStoryTarget(client.player.ID, DefaultMapID, target, radius.world); got != want {
					t.Fatalf("bounds %v delta %+v radius %v: got %v want legacy %v", bounds, delta, radius.legacy, got, want)
				}
			}
		}
		client.player.InteriorID = "cafe"
		if world.nearStoryTarget(client.player.ID, DefaultMapID, target, storyNPCRange) {
			t.Fatal("indoor presence satisfied outdoor story proximity")
		}
	}
}

func TestInteriorMovementUsesIndependentBounds(t *testing.T) {
	world, client, _ := coordinateTestWorld(3072, 2048)
	client.player.InteriorID = "cafe"
	client.player.X, client.player.Y = .5, .5
	version := 1
	if err := world.moveInLocationVersioned(client, DefaultMapID, "cafe", .5+20/legacyWorldWidth, .5, time.Unix(101, 0), &version); err != "" {
		t.Fatal(err)
	}
	if math.Abs((client.player.X-.5)*legacyWorldWidth-20) > .000001 || client.memory.interiorFrame.Width != legacyWorldWidth {
		t.Fatal("outdoor expansion changed indoor movement")
	}
}

func TestReconnectPositionMigrationPreservesCoreAndOrigin(t *testing.T) {
	destination := WorldMapDefinition{WorldCoordinateFrame: WorldCoordinateFrame{CoordinateVersion: 2, Width: 3072, Height: 2048, LegacyOffset: MapSpawn{768, 512}}, Spawn: MapSpawn{.1, .1}}
	for _, frame := range []WorldCoordinateFrame{{}, legacyCoordinateFrame()} {
		memory := &worldMemory{positions: map[string]MapSpawn{DefaultMapID: {.5, .5}}, positionFrames: map[string]WorldCoordinateFrame{DefaultMapID: frame}}
		position := memory.restorePosition(DefaultMapID, destination)
		if position != (MapSpawn{.5, .5}) {
			t.Fatalf("restored core point %+v instead of world point (1536,1024)", position)
		}
		if again := memory.restorePosition(DefaultMapID, destination); again != position {
			t.Fatalf("second restore reapplied the migration: %+v", again)
		}
		if memory.positionFrames[DefaultMapID] != destination.WorldCoordinateFrame {
			t.Fatal("migrated position did not record its new frame")
		}
	}
	withoutOffset := destination
	withoutOffset.LegacyOffset = MapSpawn{}
	if got := restoreWorldPosition(MapSpawn{.5, .5}, WorldCoordinateFrame{}, withoutOffset); got != (MapSpawn{.25, .25}) {
		t.Fatalf("2× dimensions stretched old coordinates: %+v", got)
	}
}

func TestReconnectInvalidOrFuturePositionFallsBackToSpawn(t *testing.T) {
	destination := WorldMapDefinition{WorldCoordinateFrame: legacyCoordinateFrame(), Spawn: MapSpawn{.52, .61}}
	future := legacyCoordinateFrame()
	future.CoordinateVersion = 2
	invalid := legacyCoordinateFrame()
	invalid.Width = 0
	for _, test := range []struct {
		position MapSpawn
		frame    WorldCoordinateFrame
	}{{MapSpawn{math.NaN(), .5}, WorldCoordinateFrame{}}, {MapSpawn{2, .5}, WorldCoordinateFrame{}}, {MapSpawn{.5, .5}, future}, {MapSpawn{.5, .5}, invalid}} {
		if got := restoreWorldPosition(test.position, test.frame, destination); got != destination.Spawn {
			t.Fatalf("invalid restore accepted %+v", got)
		}
	}
	small := destination
	small.Width = 100
	small.CoordinateVersion = 2
	if got := restoreWorldPosition(MapSpawn{.9, .5}, legacyCoordinateFrame(), small); got != small.Spawn {
		t.Fatal("out-of-bounds migrated position did not use spawn")
	}
}

func TestExpandedReconnectIncludesFrameAndRejectsStaleMoves(t *testing.T) {
	app := testApp(t)
	token, player := createSession(t, app, "Ada")
	app.world.mu.Lock()
	definition := app.world.maps[DefaultMapID]
	definition.Width, definition.Height, definition.CoordinateVersion = 3072, 2048, 2
	definition.Spawn = MapSpawn{.26, .305}
	app.world.maps[DefaultMapID] = definition
	app.world.memories[player.ID] = &worldMemory{mapID: DefaultMapID, positions: map[string]MapSpawn{DefaultMapID: {.5, .5}}, lastSeen: time.Now(), lastMove: time.Now()}
	app.world.mu.Unlock()
	server := httptest.NewServer(app.Handler())
	defer server.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	conn := dialMap(t, ctx, server, token, DefaultMapID)
	packet := readWorld(t, ctx, conn, "welcome")
	_, position, _, _ := mapValue(t, packet)
	if position != (MapSpawn{.25, .25}) {
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
	app.world.mu.Lock()
	client := app.world.clients[player.ID]
	if client.player.X != position.X || client.player.Y != position.Y {
		t.Error("stale coordinate messages moved the player")
	}
	app.world.mu.Unlock()
}

func TestCompiledWorldMapRegistryValidation(t *testing.T) {
	if len(compiledWorldMaps.Maps) != 13 {
		t.Fatalf("compiled registry has %d maps", len(compiledWorldMaps.Maps))
	}
	for _, mutate := range []func(*WorldMapRegistry){
		func(registry *WorldMapRegistry) { registry.SchemaVersion = 9 },
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
		registry, err := parseWorldMapRegistry(data)
		if err != nil {
			t.Fatal(err)
		}
		mutate(&registry)
		data, _ = json.Marshal(registry)
		if _, err := parseWorldMapRegistry(data); err == nil {
			t.Fatal("accepted invalid compiled authority registry")
		}
	}
}
