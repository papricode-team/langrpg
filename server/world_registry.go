package main

import (
	"fmt"

	"glotworld/server/internal/world"
)

// compiledWorldMaps is server/world_maps.json, written by
// scripts/scene-compiler.mjs and embedded in the binary.
var compiledWorldMaps = mustWorldMapRegistry()

func mustWorldMapRegistry() WorldMapRegistry {
	data, err := presentationFiles.ReadFile("world_maps.json")
	if err != nil {
		panic(fmt.Errorf("load compiled world maps: %w", err))
	}
	registry, err := world.ParseRegistry(data)
	if err != nil {
		panic(err)
	}
	return registry
}

var mapSpawns = world.Spawns(compiledWorldMaps)

const DefaultMapID = world.DefaultMapID

func validMapID(id string) bool { return world.ValidMapID(id) }

// Story interactions keep their elliptical tolerances in physical world units.
var (
	storyNPCRange      = WorldRange{X: .15 * world.LegacyWidth, Y: .15 * world.LegacyHeight}
	storyEvidenceRange = WorldRange{X: .12 * world.LegacyWidth, Y: .12 * world.LegacyHeight}
)

// validInterior checks a saved room against the compiled registry.
func validInterior(mapID, interiorID string) bool {
	if interiorID == "" {
		return true
	}
	_, exists := compiledWorldMaps.Maps[mapID].Entrances[interiorID]
	return exists && world.KnownInterior(interiorID)
}
