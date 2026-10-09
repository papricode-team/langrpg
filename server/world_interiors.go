package main

import "time"

// Room coordinates match the authored 1536 × 1024 interiors. Each region
// has its own copy of these buildings; outdoor return positions stay separate.
var interiorSpawns = map[string]MapSpawn{
	"cafe":        {X: 548.0 / 1536, Y: 800.0 / 1024},
	"bakery":      {X: 1000.0 / 1536, Y: 800.0 / 1024},
	"supermarket": {X: 1230.0 / 1536, Y: 790.0 / 1024},
}

func validInterior(mapID, interiorID string) bool {
	if interiorID == "" {
		return true
	}
	_, exists := interiorSpawns[interiorID]
	return exists && (mapID == DefaultMapID || mapID == "waldruh" || mapID == "nebelstadt")
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
	if !validInterior(mapID, interiorID) {
		return "unknown building in this region"
	}
	if client.player.InteriorID != interiorID {
		position := client.memory.positions[mapID]
		if interiorID != "" {
			position = interiorSpawns[interiorID]
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
