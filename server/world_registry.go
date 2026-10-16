package main

import (
	"encoding/json"
	"sync/atomic"

	"glotworld/server/internal/world"
)

// initialWorldMaps serves until the stored world is loaded. It is empty in
// production; tests that never load a world start from a fixture.
var initialWorldMaps WorldMapRegistry

// publishedSpawns holds the published world's spawn points for store hooks,
// which run without the App.
var publishedSpawns atomic.Pointer[map[string]MapSpawn]

// publishRegistry makes a published world's registry live: connected players
// receive the edit ops when given, or reload their scene otherwise.
func (a *App) publishRegistry(registry WorldMapRegistry, ops json.RawMessage, revision string) {
	spawns := world.Spawns(registry)
	publishedSpawns.Store(&spawns)
	if ops != nil {
		a.world.PublishPatch(registry, ops, revision)
	} else {
		a.world.PublishContent(registry)
	}
}

func publishedSpawn(mapID string) MapSpawn {
	if spawns := publishedSpawns.Load(); spawns != nil {
		return (*spawns)[mapID]
	}
	return MapSpawn{}
}

// worldSeedPath is the seed world relative to the server directory. It fills
// an empty database and introduces the story anchors a release adds; the
// database owns the world after that.
const worldSeedPath = "../content/world-seed.json"

const DefaultMapID = world.DefaultMapID

func validMapID(id string) bool { return world.ValidMapID(id) }

// Story interactions keep their elliptical tolerances in physical world units.
var (
	storyNPCRange      = WorldRange{X: .15 * world.LegacyWidth, Y: .15 * world.LegacyHeight}
	storyEvidenceRange = WorldRange{X: .12 * world.LegacyWidth, Y: .12 * world.LegacyHeight}
)

// validInterior checks a saved room against the published registry.
func (a *App) validInterior(mapID, interiorID string) bool {
	if interiorID == "" {
		return true
	}
	_, exists := a.world.Maps()[mapID].Entrances[interiorID]
	return exists && world.KnownInterior(interiorID)
}
