package main

import (
	"encoding/json"
	"fmt"
	"math"
	"sort"
)

const (
	legacyWorldWidth  = 1536.0
	legacyWorldHeight = 1024.0
	// The old normalized movement envelope allowed more horizontal than vertical
	// distance. Express that same allowance in world units during migration so
	// neither enlargement nor this refactor changes accepted legacy movement.
	worldMoveUnitsPerSecond = .24 * legacyWorldWidth
	worldMoveCreditLimit    = .08 * legacyWorldWidth
	worldMoveInitialCredit  = .025 * legacyWorldWidth
)

// WorldRange preserves the existing elliptical authority tolerances in physical
// world units. New circular interactions can supply equal X and Y radii.
type WorldRange struct{ X, Y float64 }

var (
	storyNPCRange      = WorldRange{.15 * legacyWorldWidth, .15 * legacyWorldHeight}
	storyEvidenceRange = WorldRange{.12 * legacyWorldWidth, .12 * legacyWorldHeight}
)

// WorldCoordinateFrame records how a normalized position maps to the original
// district. LegacyOffset is the original district's current world-unit offset.
// A zero version on old reconnect memory means the original 1536 × 1024 frame.
type WorldCoordinateFrame struct {
	CoordinateVersion int      `json:"coordinateVersion"`
	Width             float64  `json:"width"`
	Height            float64  `json:"height"`
	LegacyOffset      MapSpawn `json:"legacyOffset,omitempty"`
}

type WorldMapDefinition struct {
	WorldCoordinateFrame
	Spawn     MapSpawn                 `json:"spawn"`
	Entrances map[string]WorldEntrance `json:"entrances,omitempty"`
}

type WorldEntrance struct {
	ID       string   `json:"id"`
	OwnerID  string   `json:"ownerId"`
	Approach MapSpawn `json:"approach"`
	Return   MapSpawn `json:"return"`
}

type WorldMapRegistry struct {
	SchemaVersion  int                           `json:"schemaVersion"`
	ContentVersion string                        `json:"contentVersion"`
	Maps           map[string]WorldMapDefinition `json:"maps"`
}

func parseWorldMapRegistry(data []byte) (WorldMapRegistry, error) {
	var registry WorldMapRegistry
	if err := json.Unmarshal(data, &registry); err != nil {
		return registry, fmt.Errorf("world map registry: %w", err)
	}
	if registry.SchemaVersion != 1 || registry.ContentVersion == "" || len(registry.Maps) == 0 {
		return registry, fmt.Errorf("world map registry: invalid version or empty maps")
	}
	for id, definition := range registry.Maps {
		if !safeID.MatchString(id) || !definition.WorldCoordinateFrame.valid() ||
			!validCoordinate(definition.Spawn.X) || !validCoordinate(definition.Spawn.Y) {
			return registry, fmt.Errorf("world map registry: invalid definition for %q", id)
		}
		for interior, entrance := range definition.Entrances {
			if !knownInterior(interior) || !safeID.MatchString(entrance.ID) || !safeID.MatchString(entrance.OwnerID) ||
				!validCoordinate(entrance.Approach.X) || !validCoordinate(entrance.Approach.Y) ||
				!validCoordinate(entrance.Return.X) || !validCoordinate(entrance.Return.Y) {
				return registry, fmt.Errorf("world map registry: invalid entrance %q in %q", interior, id)
			}
		}
	}
	for _, id := range []string{DefaultMapID, "waldruh", "nebelstadt"} {
		if _, ok := registry.Maps[id]; !ok {
			return registry, fmt.Errorf("world map registry: missing story town %q", id)
		}
	}
	return registry, nil
}

func mustWorldMapRegistry() WorldMapRegistry {
	data, err := curriculumFiles.ReadFile("world_maps.json")
	if err != nil {
		panic(fmt.Errorf("load compiled world maps: %w", err))
	}
	registry, err := parseWorldMapRegistry(data)
	if err != nil {
		panic(err)
	}
	return registry
}

var compiledWorldMaps = mustWorldMapRegistry()

// Keep the narrative route first; the rest of the registry has stable ordering.
func worldMapIDs(registry WorldMapRegistry) []string {
	ids := []string{DefaultMapID, "waldruh", "nebelstadt"}
	var expeditions []string
	for id := range registry.Maps {
		if id != DefaultMapID && id != "waldruh" && id != "nebelstadt" {
			expeditions = append(expeditions, id)
		}
	}
	sort.Strings(expeditions)
	return append(ids, expeditions...)
}

func worldMapSpawns(registry WorldMapRegistry) map[string]MapSpawn {
	spawns := make(map[string]MapSpawn, len(registry.Maps))
	for id, definition := range registry.Maps {
		spawns[id] = definition.Spawn
	}
	return spawns
}

func (frame WorldCoordinateFrame) valid() bool {
	return frame.CoordinateVersion >= 1 && finite(frame.Width) && frame.Width > 0 &&
		finite(frame.Height) && frame.Height > 0 && finite(frame.LegacyOffset.X) && finite(frame.LegacyOffset.Y)
}

func finite(value float64) bool { return !math.IsNaN(value) && !math.IsInf(value, 0) }

func legacyCoordinateFrame() WorldCoordinateFrame {
	return WorldCoordinateFrame{CoordinateVersion: 1, Width: legacyWorldWidth, Height: legacyWorldHeight}
}

func (w *World) mapDefinition(mapID string) WorldMapDefinition { return w.maps[mapID] }

func (w *World) locationDefinition(mapID, interiorID string) WorldMapDefinition {
	if interiorID != "" {
		return WorldMapDefinition{WorldCoordinateFrame: legacyCoordinateFrame(), Spawn: interiorSpawns[interiorID]}
	}
	return w.mapDefinition(mapID)
}

func (frame WorldCoordinateFrame) delta(from, to MapSpawn) (float64, float64) {
	return (to.X - from.X) * frame.Width, (to.Y - from.Y) * frame.Height
}

func (frame WorldCoordinateFrame) within(from, to MapSpawn, radius WorldRange) bool {
	if radius.X <= 0 || radius.Y <= 0 {
		return false
	}
	dx, dy := frame.delta(from, to)
	return math.Hypot(dx/radius.X, dy/radius.Y) <= 1
}

func worldMovementDistance(dx, dy float64) float64 {
	return math.Hypot(dx, dy*legacyWorldWidth/legacyWorldHeight)
}

// Reconnect positions are transient, not narrative saves. Store their frame so
// resizing or shifting a map cannot stretch them. Invalid or future frames use
// the compiled safe spawn; no server-side navigation projection is implied.
func restoreWorldPosition(position MapSpawn, source WorldCoordinateFrame, destination WorldMapDefinition) MapSpawn {
	if !validCoordinate(position.X) || !validCoordinate(position.Y) || !destination.WorldCoordinateFrame.valid() {
		return destination.Spawn
	}
	if source.CoordinateVersion == 0 {
		source = legacyCoordinateFrame()
	}
	if !source.valid() || source.CoordinateVersion > destination.CoordinateVersion {
		return destination.Spawn
	}
	if source == destination.WorldCoordinateFrame {
		return position
	}
	x := (position.X*source.Width - source.LegacyOffset.X + destination.LegacyOffset.X) / destination.Width
	y := (position.Y*source.Height - source.LegacyOffset.Y + destination.LegacyOffset.Y) / destination.Height
	if !validCoordinate(x) || !validCoordinate(y) {
		return destination.Spawn
	}
	return MapSpawn{X: x, Y: y}
}

func (memory *worldMemory) rememberPosition(mapID string, position MapSpawn, frame WorldCoordinateFrame) {
	if memory.positions == nil {
		memory.positions = make(map[string]MapSpawn)
	}
	if memory.positionFrames == nil {
		memory.positionFrames = make(map[string]WorldCoordinateFrame)
	}
	memory.positions[mapID], memory.positionFrames[mapID] = position, frame
}

func (memory *worldMemory) restorePosition(mapID string, definition WorldMapDefinition) MapSpawn {
	position := definition.Spawn
	if saved, exists := memory.positions[mapID]; exists {
		position = restoreWorldPosition(saved, memory.positionFrames[mapID], definition)
	}
	memory.rememberPosition(mapID, position, definition.WorldCoordinateFrame)
	return position
}

func (w *World) sceneMetadata(mapID, interiorID string) map[string]any {
	definition := w.locationDefinition(mapID, interiorID)
	return map[string]any{"contentVersion": w.contentVersion, "coordinateVersion": definition.CoordinateVersion,
		"width": definition.Width, "height": definition.Height}
}

func (w *World) coordinateVersionError(mapID, interiorID string, version *int) string {
	current := w.locationDefinition(mapID, interiorID).CoordinateVersion
	if (version == nil && current != 1) || (version != nil && *version != current) {
		return "world coordinates changed; reload the map before moving"
	}
	return ""
}
