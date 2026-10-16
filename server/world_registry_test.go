package main

import (
	"os"

	"glotworld/server/internal/world"
)

// compiledWorldMaps is the registry compiled from the seed world. Apps that
// never load a world start from it.
var compiledWorldMaps = func() WorldMapRegistry {
	data, err := os.ReadFile("internal/world/testdata/world_maps.json")
	if err != nil {
		panic(err)
	}
	registry, err := world.ParseRegistry(data)
	if err != nil {
		panic(err)
	}
	return registry
}()

var mapSpawns = world.Spawns(compiledWorldMaps)

func init() {
	initialWorldMaps = compiledWorldMaps
	publishedSpawns.Store(&mapSpawns)
}

func validInterior(mapID, interiorID string) bool {
	if interiorID == "" {
		return true
	}
	_, exists := compiledWorldMaps.Maps[mapID].Entrances[interiorID]
	return exists && world.KnownInterior(interiorID)
}
