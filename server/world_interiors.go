package main

import "time"

// Room coordinates match the authored 1536 × 1024 interiors. Each region
// has its own copy of these buildings; outdoor return positions stay separate.
var interiorSpawns = map[string]MapSpawn{
	"cafe":        {X: 548.0 / 1536, Y: 800.0 / 1024},
	"bakery":      {X: 1000.0 / 1536, Y: 800.0 / 1024},
	"supermarket": {X: 1230.0 / 1536, Y: 790.0 / 1024},
	"inn":         {X: .50, Y: .75},
}

func knownInterior(id string) bool {
	// Keep this independent of the registry's package initialization.
	return id == "cafe" || id == "bakery" || id == "supermarket" || id == "inn"
}

func validInterior(mapID, interiorID string) bool {
	if interiorID == "" {
		return true
	}
	_, exists := compiledWorldMaps.Maps[mapID].Entrances[interiorID]
	return exists && knownInterior(interiorID)
}

// validInteriorLocked follows rooms added or removed by world edits.
func (w *World) validInteriorLocked(mapID, interiorID string) bool {
	if interiorID == "" {
		return true
	}
	_, exists := w.mapDefinition(mapID).Entrances[interiorID]
	return exists && knownInterior(interiorID)
}

func (w *World) joinInterior(client *worldClient, mapID, interiorID string, now time.Time) string {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.clients[client.player.ID] != client {
		return "session was replaced"
	}
	if mapID != client.player.MapID {
		return "building belongs to another map"
	}
	_, entranceExists := w.mapDefinition(mapID).Entrances[interiorID]
	if interiorID != "" && (!entranceExists || !knownInterior(interiorID)) {
		return "unknown building in this region"
	}
	if client.player.InteriorID != interiorID {
		position := client.memory.restorePosition(mapID, w.mapDefinition(mapID))
		if interiorID != "" {
			definition := w.locationDefinition(mapID, interiorID)
			position = definition.Spawn
			client.memory.interiorFrame = definition.WorldCoordinateFrame
		} else if entrance, exists := w.mapDefinition(mapID).Entrances[client.player.InteriorID]; exists {
			position = entrance.Return
			client.memory.rememberPosition(mapID, position, w.mapDefinition(mapID).WorldCoordinateFrame)
		}
		client.player.InteriorID, client.memory.interiorID = interiorID, interiorID
		client.player.X, client.player.Y = position.X, position.Y
		client.memory.interiorPosition = position
		client.memory.lastMove, client.memory.movementCredit = now, 0
	}
	w.enqueueMapLocked(client, "interior")
	w.broadcastPlayersLocked(mapID)
	return ""
}
