package world

import (
	"maps"
	"slices"
	"sort"
)

// SessionReplacedStatus closes a tab whose character connected elsewhere; the
// client must not reconnect and evict the tab that took over.
const SessionReplacedStatus = sessionReplacedStatus

// AccessRequiredStatus closes a socket whose access check failed or blocked.
const AccessRequiredStatus = accessRequiredStatus

// MapIDs lists the story towns in atlas order.
func MapIDs() []string { return slices.Clone(mapIDs) }

// InteriorSpawn is where a player appears on entering a known building.
func InteriorSpawn(interiorID string) MapSpawn { return interiorSpawns[interiorID] }

// ContentVersion is the version of the map registry currently published.
func (w *World) ContentVersion() string {
	w.mu.Lock()
	defer w.mu.Unlock()
	return w.contentVersion
}

// Maps returns a copy of the published map definitions.
func (w *World) Maps() map[string]MapDefinition {
	w.mu.Lock()
	defer w.mu.Unlock()
	return maps.Clone(w.maps)
}

// ClientPlayer reports a connected player's live presence.
func (w *World) ClientPlayer(playerID string) (Player, bool) {
	w.mu.Lock()
	defer w.mu.Unlock()
	if client := w.clients[playerID]; client != nil {
		return client.player, true
	}
	return Player{}, false
}

// Players lists every connected player, ordered by ID.
func (w *World) Players() []Player {
	w.mu.Lock()
	defer w.mu.Unlock()
	players := make([]Player, 0, len(w.clients))
	for _, client := range w.clients {
		players = append(players, client.player)
	}
	sort.Slice(players, func(i, j int) bool { return players[i].ID < players[j].ID })
	return players
}

// RememberedLocation reports a player's reconnect memory, if any.
func (w *World) RememberedLocation(playerID string) (mapID, interiorID string, ok bool) {
	w.mu.Lock()
	defer w.mu.Unlock()
	if memory := w.memories[playerID]; memory != nil {
		return memory.mapID, memory.interiorID, true
	}
	return "", "", false
}
