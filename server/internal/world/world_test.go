package world

import (
	"encoding/json"
	"maps"
	"math"
	"os"
	"testing"
	"time"
)

// compiledRegistry is a registry compiled from the seed world.
func compiledRegistry(t *testing.T) MapRegistry {
	t.Helper()
	data, err := os.ReadFile("testdata/world_maps.json")
	if err != nil {
		t.Fatal(err)
	}
	registry, err := ParseRegistry(data)
	if err != nil {
		t.Fatal(err)
	}
	return registry
}

func coordinateTestWorld(width, height float64) (*World, *worldClient, MapDefinition) {
	definition := MapDefinition{CoordinateFrame: CoordinateFrame{CoordinateVersion: 2, Width: width, Height: height}, Spawn: MapSpawn{.25, .25}}
	client := &worldClient{player: Player{ID: "walker", MapID: DefaultMapID, X: 400 / width, Y: 300 / height},
		memory: &worldMemory{lastMove: time.Unix(100, 0)}}
	world := &World{maps: map[string]MapDefinition{DefaultMapID: definition}, clients: map[string]*worldClient{"walker": client}}
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
			dx, dy := definition.Delta(start, MapSpawn{client.player.X, client.player.Y})
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
			dx, dy := definition.Delta(start, MapSpawn{client.player.X, client.player.Y})
			legacyFraction := .024 / math.Hypot(delta.X/LegacyWidth, delta.Y/LegacyHeight)
			if math.Abs(dx-delta.X*legacyFraction) > .000001 || math.Abs(dy-delta.Y*legacyFraction) > .000001 {
				t.Fatalf("bounds %v delta %+v changed legacy allowance to (%v,%v)", bounds, delta, dx, dy)
			}
			if math.Abs(MovementDistance(dx, dy)-worldMoveUnitsPerSecond*.1) > .000001 {
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
			world  Range
		}{{.15, Range{.15 * LegacyWidth, .15 * LegacyHeight}}, {.12, Range{.12 * LegacyWidth, .12 * LegacyHeight}}} {
			for _, delta := range []MapSpawn{{150, 0}, {0, 150}, {220, 0}, {150, 100}, {230.5, 0}, {0, 154}, {185, 0}, {0, 123}} {
				client.player.X, client.player.Y = target.X+delta.X/definition.Width, target.Y+delta.Y/definition.Height
				want := math.Hypot(delta.X/LegacyWidth, delta.Y/LegacyHeight) <= radius.legacy
				if got := world.NearTarget(client.player.ID, DefaultMapID, target, radius.world); got != want {
					t.Fatalf("bounds %v delta %+v radius %v: got %v want legacy %v", bounds, delta, radius.legacy, got, want)
				}
			}
		}
		client.player.InteriorID = "cafe"
		if world.NearTarget(client.player.ID, DefaultMapID, target, Range{.15 * LegacyWidth, .15 * LegacyHeight}) {
			t.Fatal("indoor presence satisfied outdoor story proximity")
		}
	}
}

func TestInteriorMovementUsesIndependentBounds(t *testing.T) {
	world, client, _ := coordinateTestWorld(3072, 2048)
	client.player.InteriorID = "cafe"
	client.player.X, client.player.Y = .5, .5
	version := 1
	if err := world.moveInLocationVersioned(client, DefaultMapID, "cafe", .5+20/LegacyWidth, .5, time.Unix(101, 0), &version); err != "" {
		t.Fatal(err)
	}
	if math.Abs((client.player.X-.5)*LegacyWidth-20) > .000001 || client.memory.interiorFrame.Width != LegacyWidth {
		t.Fatal("outdoor expansion changed indoor movement")
	}
}

func TestReconnectPositionMigrationPreservesCoreAndOrigin(t *testing.T) {
	destination := MapDefinition{CoordinateFrame: CoordinateFrame{CoordinateVersion: 2, Width: 3072, Height: 2048, LegacyOffset: MapSpawn{768, 512}}, Spawn: MapSpawn{.1, .1}}
	for _, frame := range []CoordinateFrame{{}, LegacyFrame()} {
		memory := &worldMemory{positions: map[string]MapSpawn{DefaultMapID: {.5, .5}}, positionFrames: map[string]CoordinateFrame{DefaultMapID: frame}}
		position := memory.restorePosition(DefaultMapID, destination)
		if position != (MapSpawn{.5, .5}) {
			t.Fatalf("restored core point %+v instead of world point (1536,1024)", position)
		}
		if again := memory.restorePosition(DefaultMapID, destination); again != position {
			t.Fatalf("second restore reapplied the migration: %+v", again)
		}
		if memory.positionFrames[DefaultMapID] != destination.CoordinateFrame {
			t.Fatal("migrated position did not record its new frame")
		}
	}
	withoutOffset := destination
	withoutOffset.LegacyOffset = MapSpawn{}
	if got := RestorePosition(MapSpawn{.5, .5}, CoordinateFrame{}, withoutOffset); got != (MapSpawn{.25, .25}) {
		t.Fatalf("2× dimensions stretched old coordinates: %+v", got)
	}
}

func TestTownResizePreservesRetainedPositionsAndReturnsRemovedLandToSpawn(t *testing.T) {
	destination := compiledRegistry(t).Maps[DefaultMapID]
	for _, previous := range []CoordinateFrame{{CoordinateVersion: 2, Width: 3072, Height: 1024}, {CoordinateVersion: 3, Width: 3072, Height: 1536}} {
		for _, saved := range []MapSpawn{{.25, .5}, {.875, .875}} {
			memory := &worldMemory{positions: map[string]MapSpawn{DefaultMapID: saved}, positionFrames: map[string]CoordinateFrame{DefaultMapID: previous}}
			position := memory.restorePosition(DefaultMapID, destination)
			x, y := saved.X*previous.Width, saved.Y*previous.Height
			if x > destination.Width || y > destination.Height {
				if position != destination.Spawn {
					t.Fatalf("removed land restored to %+v instead of safe spawn %+v", position, destination.Spawn)
				}
			} else if math.Abs(position.X*destination.Width-x) > .000001 || math.Abs(position.Y*destination.Height-y) > .000001 {
				t.Fatalf("town resize moved retained saved position %+v to %+v", saved, position)
			}
			if again := memory.restorePosition(DefaultMapID, destination); again != position {
				t.Fatalf("reconnect applied the resize twice: %+v", again)
			}
			if memory.positionFrames[DefaultMapID] != destination.CoordinateFrame {
				t.Fatal("town resize did not record the current coordinate frame")
			}
		}
	}
}

func TestReconnectInvalidOrFuturePositionFallsBackToSpawn(t *testing.T) {
	destination := MapDefinition{CoordinateFrame: LegacyFrame(), Spawn: MapSpawn{.52, .61}}
	future := LegacyFrame()
	future.CoordinateVersion = 2
	invalid := LegacyFrame()
	invalid.Width = 0
	for _, test := range []struct {
		position MapSpawn
		frame    CoordinateFrame
	}{{MapSpawn{math.NaN(), .5}, CoordinateFrame{}}, {MapSpawn{2, .5}, CoordinateFrame{}}, {MapSpawn{.5, .5}, future}, {MapSpawn{.5, .5}, invalid}} {
		if got := RestorePosition(test.position, test.frame, destination); got != destination.Spawn {
			t.Fatalf("invalid restore accepted %+v", got)
		}
	}
	small := destination
	small.Width = 100
	small.CoordinateVersion = 2
	if got := RestorePosition(MapSpawn{.9, .5}, LegacyFrame(), small); got != small.Spawn {
		t.Fatal("out-of-bounds migrated position did not use spawn")
	}
}

// newTestWorld starts a world on the compiled registry and stops it after the test.
func newTestWorld(t *testing.T, maxPlayers int, registry MapRegistry) *World {
	t.Helper()
	identity, err := NewIdentity()
	if err != nil {
		t.Fatal(err)
	}
	w := New(maxPlayers, nil, identity, registry)
	t.Cleanup(w.Close)
	return w
}

func TestPublishedWorldMigratesConnectedAndRememberedCoordinates(t *testing.T) {
	registry := compiledRegistry(t)
	w := newTestWorld(t, 10, registry)
	registry.Maps = maps.Clone(registry.Maps)
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
	memory.rememberPosition(DefaultMapID, position, before.CoordinateFrame)
	client := &worldClient{player: Player{ID: "connected-editor", MapID: DefaultMapID, X: position.X, Y: position.Y}, memory: memory, send: make(chan []byte, 32), cancel: func() {}}
	disconnected := &worldMemory{}
	disconnected.rememberPosition(DefaultMapID, position, before.CoordinateFrame)
	w.mu.Lock()
	w.clients[client.player.ID] = client
	w.memories["connected-session"] = memory
	w.memories["disconnected-session"] = disconnected
	w.mu.Unlock()
	w.PublishContent(registry)
	expected := MapSpawn{X: (position.X*before.Width + 32) / next.Width, Y: (position.Y*before.Height + 16) / next.Height}
	w.mu.Lock()
	actual := MapSpawn{X: client.player.X, Y: client.player.Y}
	connectedPosition := memory.positions[DefaultMapID]
	disconnectedPosition := disconnected.positions[DefaultMapID]
	connectedFrame := memory.positionFrames[DefaultMapID]
	disconnectedFrame := disconnected.positionFrames[DefaultMapID]
	w.mu.Unlock()
	for _, value := range []MapSpawn{actual, connectedPosition, disconnectedPosition} {
		if math.Abs(value.X-expected.X) > 1e-12 || math.Abs(value.Y-expected.Y) > 1e-12 {
			t.Fatalf("map publication stretched remembered position: actual=%+v expected=%+v", value, expected)
		}
	}
	if connectedFrame != next.CoordinateFrame || disconnectedFrame != next.CoordinateFrame {
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

func TestRestoringARouteCannotOverfillTheUnlockedTown(t *testing.T) {
	w := newTestWorld(t, 1, compiledRegistry(t))
	w.mu.Lock()
	w.clients["resident"] = &worldClient{player: Player{ID: "resident", MapID: DefaultMapID}, send: make(chan []byte, 256), cancel: func() {}}
	memory := &worldMemory{mapID: "waldruh", positions: map[string]MapSpawn{}, interiorID: "inn"}
	w.clients["returning"] = &worldClient{player: Player{ID: "returning", MapID: "waldruh", InteriorID: "inn"}, memory: memory, send: make(chan []byte, 256), cancel: func() {}}
	w.mu.Unlock()
	w.ReconcileStoryLocation("returning", func(mapID string) bool { return mapID == DefaultMapID })
	w.mu.Lock()
	_, retained := w.clients["returning"]
	count, reconnectMap, reconnectInterior := w.mapCountLocked(DefaultMapID), memory.mapID, memory.interiorID
	w.mu.Unlock()
	if retained || count != 1 || reconnectMap != DefaultMapID || reconnectInterior != "" {
		t.Fatal("restore bypassed town capacity or retained the locked room")
	}
}
