package world

import "time"

// Test support: HTTP-level tests in the server package arrange presence with
// these instead of opening sockets. Production code does not call them.

// AttachForTest connects a socket-less client for player and returns a
// channel that receives every message the world sends it.
func (w *World) AttachForTest(player Player, sessionHash string) <-chan []byte {
	w.mu.Lock()
	defer w.mu.Unlock()
	client := &worldClient{player: player, sessionHash: sessionHash, send: make(chan []byte, 512), cancel: func() {}}
	w.clients[player.ID] = client
	return client.send
}

// DetachForTest removes a client attached with AttachForTest.
func (w *World) DetachForTest(playerID string) {
	w.mu.Lock()
	defer w.mu.Unlock()
	delete(w.clients, playerID)
}

// PlaceForTest moves a connected player under the world lock.
func (w *World) PlaceForTest(playerID, mapID, interiorID string, position MapSpawn) {
	w.mu.Lock()
	defer w.mu.Unlock()
	if client := w.clients[playerID]; client != nil {
		client.player.MapID, client.player.InteriorID = mapID, interiorID
		client.player.X, client.player.Y = position.X, position.Y
	}
}

// RememberForTest replaces a player's reconnect memory, as if they had just
// disconnected (access generation 0).
func (w *World) RememberForTest(playerID, mapID, interiorID string, positions map[string]MapSpawn) {
	w.mu.Lock()
	defer w.mu.Unlock()
	now := time.Now()
	memory := &worldMemory{mapID: mapID, interiorID: interiorID, positions: map[string]MapSpawn{}, lastSeen: now, lastMove: now}
	for id, position := range positions {
		memory.positions[id] = position
	}
	w.memories[playerID] = memory
}

// SetDefinitionForTest replaces one published map definition.
func (w *World) SetDefinitionForTest(mapID string, definition MapDefinition) {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.maps[mapID] = definition
}

// SetMaxPlayersForTest changes the per-map capacity.
func (w *World) SetMaxPlayersForTest(maxPlayers int) {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.maxPlayers = maxPlayers
}
