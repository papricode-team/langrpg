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
			// transmitted at 15 Hz (faster than today's 10 Hz), must survive authority in every direction.
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

func TestBuildingInstancesUseTheirOwnEntranceAndSharedLayout(t *testing.T) {
	registry := compiledRegistry(t)
	definition := registry.Maps[DefaultMapID]
	first, second := "home--west-house", "home--east-house"
	definition.Entrances[first] = Entrance{ID: "west-house", OwnerID: "west-house", Approach: MapSpawn{.2, .3}, Return: MapSpawn{.2, .4}}
	definition.Entrances[second] = Entrance{ID: "east-house", OwnerID: "east-house", Approach: MapSpawn{.6, .3}, Return: MapSpawn{.6, .4}}
	registry.Maps[DefaultMapID] = definition
	w := newTestWorld(t, 10, registry)
	client := &worldClient{player: Player{ID: "visitor", MapID: DefaultMapID}, memory: &worldMemory{}, send: make(chan []byte, 256), cancel: func() {}}
	w.clients[client.player.ID] = client
	for _, id := range []string{first, second} {
		if err := w.joinInterior(client, DefaultMapID, id, time.Now()); err != "" {
			t.Fatal(err)
		}
		if client.player.InteriorID != id || (MapSpawn{client.player.X, client.player.Y}) != InteriorSpawn("home") {
			t.Fatal("room identity or spawn was lost")
		}
		if err := w.joinInterior(client, DefaultMapID, "", time.Now()); err != "" {
			t.Fatal(err)
		}
		if (MapSpawn{client.player.X, client.player.Y}) != definition.Entrances[id].Return {
			t.Fatal("returned to a different building")
		}
	}
	if err := w.joinInterior(client, DefaultMapID, "home--missing", time.Now()); err == "" {
		t.Fatal("accepted an unpublished building")
	}
	for _, id := range []string{"home--", "unknown--house", "home--bad/house"} {
		if KnownInterior(id) {
			t.Fatalf("accepted malformed room %q", id)
		}
	}
}

func TestCustomRoomEntrancesControlArrivalAndRestoreFallback(t *testing.T) {
	registry := compiledRegistry(t)
	definition := registry.Maps[DefaultMapID]
	first, second := "home--custom-west", "home--custom-east"
	west, east := MapSpawn{.25, .7}, MapSpawn{.75, .6}
	definition.Entrances[first] = Entrance{ID: "custom-west", OwnerID: "custom-west", Approach: MapSpawn{.2, .3}, Return: MapSpawn{.2, .4}, Spawn: &west}
	definition.Entrances[second] = Entrance{ID: "custom-east", OwnerID: "custom-east", Approach: MapSpawn{.6, .3}, Return: MapSpawn{.6, .4}, Spawn: &east}
	registry.Maps[DefaultMapID] = definition
	data, err := json.Marshal(registry)
	if err != nil {
		t.Fatal(err)
	}
	parsed, err := ParseRegistry(data)
	if err != nil {
		t.Fatal(err)
	}
	w := newTestWorld(t, 10, parsed)
	client := &worldClient{player: Player{ID: "custom-visitor", MapID: DefaultMapID}, memory: &worldMemory{}, send: make(chan []byte, 256), cancel: func() {}}
	w.clients[client.player.ID] = client
	for _, id := range []string{first, second} {
		expected := *definition.Entrances[id].Spawn
		if err := w.joinInterior(client, DefaultMapID, id, time.Now()); err != "" {
			t.Fatal(err)
		}
		if (MapSpawn{client.player.X, client.player.Y}) != expected {
			t.Fatalf("wrong room entrance: %+v", client.player)
		}
		room := w.LocationDefinition(DefaultMapID, id)
		if restored := RestorePosition(MapSpawn{-1, -1}, LegacyFrame(), room); restored != expected {
			t.Fatalf("restore used template spawn: %+v", restored)
		}
		if err := w.joinInterior(client, DefaultMapID, "", time.Now()); err != "" {
			t.Fatal(err)
		}
		if (MapSpawn{client.player.X, client.player.Y}) != definition.Entrances[id].Return {
			t.Fatal("custom entrance changed outdoor return")
		}
	}
	moved := MapSpawn{.4, .5}
	changed := definition.Entrances[first]
	changed.Spawn = &moved
	definition.Entrances[first] = changed
	registry.ContentVersion = "custom-entrance-moved"
	w.PublishContent(registry)
	if err := w.joinInterior(client, DefaultMapID, first, time.Now()); err != "" {
		t.Fatal(err)
	}
	if (MapSpawn{client.player.X, client.player.Y}) != moved {
		t.Fatal("published entrance did not move")
	}
	invalid := MapSpawn{1.1, .5}
	changed.Spawn = &invalid
	definition.Entrances[first] = changed
	data, err = json.Marshal(registry)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = ParseRegistry(data); err == nil {
		t.Fatal("accepted an entrance outside the room")
	}
}

func TestConnectedRoomsTravelThroughPairedDoors(t *testing.T) {
	registry := compiledRegistry(t)
	definition := registry.Maps[DefaultMapID]
	root, child := "home--connected", "home--connected::study"
	a, b := MapSpawn{.4, .7}, MapSpawn{.6, .7}
	definition.Entrances[root] = Entrance{ID: "connected", OwnerID: "connected", Spawn: &a, Return: MapSpawn{.2, .3}, Doors: map[string]RoomDoor{"study-door": {Target: child, Arrival: b}}}
	definition.Entrances[child] = Entrance{ID: "connected", OwnerID: "connected", Building: root, Spawn: &a, Return: MapSpawn{.2, .3}, Doors: map[string]RoomDoor{"main-door": {Target: root, Arrival: a}}}
	registry.Maps[DefaultMapID] = definition
	data, _ := json.Marshal(registry)
	parsed, err := ParseRegistry(data)
	if err != nil {
		t.Fatal(err)
	}
	w := newTestWorld(t, 10, parsed)
	client := &worldClient{player: Player{ID: "room-visitor", MapID: DefaultMapID}, memory: &worldMemory{}, send: make(chan []byte, 256), cancel: func() {}}
	w.clients[client.player.ID] = client
	if err := w.joinInterior(client, DefaultMapID, child, time.Now()); err == "" {
		t.Fatal("entered child directly from town")
	}
	if err := w.joinInterior(client, DefaultMapID, root, time.Now()); err != "" {
		t.Fatal(err)
	}
	if err := w.joinInterior(client, DefaultMapID, child, time.Now(), "missing"); err == "" {
		t.Fatal("accepted missing door")
	}
	if err := w.joinInterior(client, DefaultMapID, child, time.Now(), "study-door"); err != "" {
		t.Fatal(err)
	}
	if client.player.InteriorID != child || (MapSpawn{client.player.X, client.player.Y}) != b {
		t.Fatalf("wrong door arrival: %+v", client.player)
	}
	if !w.validInteriorLocked(DefaultMapID, child) {
		t.Fatal("child cannot reconnect")
	}
	if err := w.joinInterior(client, DefaultMapID, root, time.Now(), "main-door"); err != "" {
		t.Fatal(err)
	}
	if (MapSpawn{client.player.X, client.player.Y}) != a {
		t.Fatal("wrong return door arrival")
	}
	if err := w.joinInterior(client, DefaultMapID, child, time.Now(), "study-door"); err != "" {
		t.Fatal(err)
	}
	if err := w.joinInterior(client, DefaultMapID, "", time.Now()); err != "" {
		t.Fatal(err)
	}
	if (MapSpawn{client.player.X, client.player.Y}) != definition.Entrances[root].Return {
		t.Fatal("child exit lost building return")
	}
	if err := w.joinInterior(client, DefaultMapID, root, time.Now()); err != "" {
		t.Fatal(err)
	}
	if err := w.joinInterior(client, DefaultMapID, child, time.Now(), "study-door"); err != "" {
		t.Fatal(err)
	}
	// Publishing a deleted room returns its occupants to the surviving main room.
	removed := registry
	removed.ContentVersion = "removed-study"
	removed.Maps = maps.Clone(registry.Maps)
	updated := definition
	updated.Entrances = maps.Clone(definition.Entrances)
	delete(updated.Entrances, child)
	rootEntry := updated.Entrances[root]
	rootEntry.Doors = nil
	updated.Entrances[root] = rootEntry
	removed.Maps[DefaultMapID] = updated
	w.PublishContent(removed)
	if client.player.InteriorID != root || client.memory.interiorID != root || (MapSpawn{client.player.X, client.player.Y}) != a {
		t.Fatal("deleted room left its occupant stranded")
	}
	broken := definition.Entrances[child]
	broken.Building = "home--missing"
	definition.Entrances[child] = broken
	data, _ = json.Marshal(registry)
	if _, err := ParseRegistry(data); err == nil {
		t.Fatal("accepted orphan room")
	}
}

func TestStairsConnectBuildingFloors(t *testing.T) {
	registry := compiledRegistry(t)
	definition := registry.Maps[DefaultMapID]
	root := "home--floors"
	spawn := MapSpawn{.5, .75}
	main := Entrance{ID: "floors", OwnerID: "floors", Spawn: &spawn, Return: MapSpawn{.2, .3}, Doors: map[string]RoomDoor{}}
	for _, floor := range []struct {
		id    string
		level int
		x     float64
	}{{"up", 1, .3}, {"down", -1, .7}} {
		child := root + "::" + floor.id
		main.Doors[floor.id] = RoomDoor{Kind: "stairs", Target: child, Arrival: MapSpawn{floor.x, .7}}
		definition.Entrances[child] = Entrance{ID: "floors", OwnerID: "floors", Building: root, Level: floor.level, Spawn: &spawn, Return: main.Return, Doors: map[string]RoomDoor{"landing": {Kind: "stairs", Target: root, Arrival: spawn}}}
	}
	definition.Entrances[root] = main
	registry.Maps[DefaultMapID] = definition
	data, _ := json.Marshal(registry)
	parsed, err := ParseRegistry(data)
	if err != nil {
		t.Fatal(err)
	}
	w := newTestWorld(t, 10, parsed)
	client := &worldClient{player: Player{ID: "stair-visitor", MapID: DefaultMapID}, memory: &worldMemory{}, send: make(chan []byte, 256), cancel: func() {}}
	w.clients[client.player.ID] = client
	if err := w.joinInterior(client, DefaultMapID, root, time.Now()); err != "" {
		t.Fatal(err)
	}
	for _, id := range []string{"up", "down"} {
		child := root + "::" + id
		if err := w.joinInterior(client, DefaultMapID, child, time.Now(), id); err != "" {
			t.Fatal(err)
		}
		if (MapSpawn{client.player.X, client.player.Y}) != main.Doors[id].Arrival || !w.validInteriorLocked(DefaultMapID, child) {
			t.Fatal("wrong stair landing or invalid reconnect room")
		}
		if err := w.joinInterior(client, DefaultMapID, root, time.Now(), "landing"); err != "" {
			t.Fatal(err)
		}
		if (MapSpawn{client.player.X, client.player.Y}) != spawn {
			t.Fatal("wrong return landing")
		}
	}
	original := definition.Entrances[root+"::up"]
	for _, level := range []int{0, 16, -16} {
		invalid := original
		invalid.Level = level
		definition.Entrances[root+"::up"] = invalid
		data, _ = json.Marshal(registry)
		if _, err := ParseRegistry(data); err == nil {
			t.Fatalf("accepted invalid stair floor %d", level)
		}
	}
	definition.Entrances[root+"::up"] = original
	broken := main.Doors["up"]
	broken.Kind = "door"
	main.Doors["up"] = broken
	data, _ = json.Marshal(registry)
	if _, err := ParseRegistry(data); err == nil {
		t.Fatal("accepted door between floors")
	}
}

func drainMessages(t *testing.T, client *worldClient) []map[string]json.RawMessage {
	t.Helper()
	var messages []map[string]json.RawMessage
	for {
		select {
		case b := <-client.send:
			var message map[string]json.RawMessage
			if err := json.Unmarshal(b, &message); err != nil {
				t.Fatal(err)
			}
			messages = append(messages, message)
		default:
			return messages
		}
	}
}

func TestMovementTickSendsOnlyChangedPositionsToTheSameRoom(t *testing.T) {
	world, walker, definition := coordinateTestWorld(1536, 1024)
	walker.send = make(chan []byte, 8)
	watcher := &worldClient{player: Player{ID: "watcher", MapID: DefaultMapID}, send: make(chan []byte, 8), memory: &worldMemory{}}
	indoors := &worldClient{player: Player{ID: "indoors", MapID: DefaultMapID, InteriorID: "cafe"}, send: make(chan []byte, 8), memory: &worldMemory{}}
	world.clients["watcher"], world.clients["indoors"] = watcher, indoors

	// An idle world sends nothing at all.
	world.flushMovesLocked()
	for _, client := range []*worldClient{walker, watcher, indoors} {
		if messages := drainMessages(t, client); len(messages) != 0 {
			t.Fatalf("idle tick sent %s %d messages", client.player.ID, len(messages))
		}
	}

	version := definition.CoordinateVersion
	walker.memory.movementCredit = worldMoveCreditLimit
	if err := world.moveInLocationVersioned(walker, DefaultMapID, "", walker.player.X+10/1536.0, walker.player.Y, walker.memory.lastMove, &version); err != "" {
		t.Fatal(err)
	}
	world.flushMovesLocked()
	if messages := drainMessages(t, walker); len(messages) != 0 {
		t.Fatalf("an accepted move was echoed to its sender: %v", messages)
	}
	if messages := drainMessages(t, indoors); len(messages) != 0 {
		t.Fatalf("an outdoor move reached a room: %v", messages)
	}
	messages := drainMessages(t, watcher)
	if len(messages) != 1 || string(messages[0]["type"]) != `"moves"` {
		t.Fatalf("watcher received %v", messages)
	}
	var entries [][3]any
	if err := json.Unmarshal(messages[0]["moves"], &entries); err != nil || len(entries) != 1 || entries[0][0] != "walker" || entries[0][1] != walker.player.X {
		t.Fatalf("moves %s, %v", messages[0]["moves"], err)
	}
	world.flushMovesLocked()
	if messages := drainMessages(t, watcher); len(messages) != 0 {
		t.Fatalf("an unchanged position was sent again: %v", messages)
	}

	// A move the server shortens is corrected back to the sender.
	walker.memory.movementCredit = 0
	if err := world.moveInLocationVersioned(walker, DefaultMapID, "", 1, 1, walker.memory.lastMove, &version); err != "" {
		t.Fatal(err)
	}
	world.flushMovesLocked()
	if messages := drainMessages(t, walker); len(messages) != 1 || string(messages[0]["type"]) != `"moves"` {
		t.Fatalf("shortened move was not corrected: %v", messages)
	}
	if messages := drainMessages(t, watcher); len(messages) != 0 {
		t.Fatalf("a move without progress reached others: %v", messages)
	}
}
