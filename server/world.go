package main

import (
	"context"
	"encoding/json"
	"math"
	"net/http"
	"sort"
	"strings"
	"sync"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/coder/websocket"
)

const DefaultMapID = "lindenhafen"

// A replaced tab must not reconnect and evict the tab that took over.
const sessionReplacedStatus websocket.StatusCode = 4001
const accessRequiredStatus websocket.StatusCode = 4002

var mapIDs = worldMapIDs(compiledWorldMaps)

type MapSpawn struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

var mapSpawns = worldMapSpawns(compiledWorldMaps)

func validMapID(id string) bool { _, ok := mapSpawns[id]; return ok }

type worldMemory struct {
	accessGeneration int64
	mapID            string
	interiorID       string
	interiorPosition MapSpawn
	interiorFrame    WorldCoordinateFrame
	positions        map[string]MapSpawn
	positionFrames   map[string]WorldCoordinateFrame
	chatTimes        []time.Time
	joinTimes        []time.Time
	lastSeen         time.Time
	lastMove         time.Time
	movementCredit   float64
}

type ChatMessage struct {
	MapID    string    `json:"mapId"`
	ID       string    `json:"id"`
	PlayerID string    `json:"playerId"`
	Name     string    `json:"name"`
	Text     string    `json:"text"`
	At       time.Time `json:"at"`
}

type worldClient struct {
	sessionHash   string
	player        Player
	conn          *websocket.Conn
	send          chan []byte
	cancel        context.CancelFunc
	memory        *worldMemory
	messageWindow time.Time
	messageCount  int
	authorizeMap  func(context.Context, string) error
}

type World struct {
	mu             sync.Mutex
	clients        map[string]*worldClient
	messages       map[string][]ChatMessage
	memories       map[string]*worldMemory
	cancel         context.CancelFunc
	done           chan struct{}
	maxPlayers     int
	originPatterns []string
	clockIdentity  WorldIdentity
	maps           map[string]WorldMapDefinition
	contentVersion string
}

func NewWorld(maxPlayers int, origins []string) *World {
	identity, err := newWorldIdentity()
	if err != nil {
		panic(err)
	}
	return newWorldWithIdentity(maxPlayers, origins, identity)
}

func newWorldWithIdentity(maxPlayers int, origins []string, identity WorldIdentity) *World {
	ctx, cancel := context.WithCancel(context.Background())
	w := &World{clients: map[string]*worldClient{}, messages: map[string][]ChatMessage{}, memories: map[string]*worldMemory{}, cancel: cancel, done: make(chan struct{}), maxPlayers: maxPlayers, originPatterns: origins, clockIdentity: identity, maps: make(map[string]WorldMapDefinition, len(compiledWorldMaps.Maps)), contentVersion: compiledWorldMaps.ContentVersion}
	for id, definition := range compiledWorldMaps.Maps {
		w.maps[id] = definition
	}
	for _, mapID := range mapIDs {
		w.messages[mapID] = []ChatMessage{}
	}
	go w.run(ctx)
	return w
}

func (w *World) run(ctx context.Context) {
	defer close(w.done)
	ticker := time.NewTicker(100 * time.Millisecond)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			w.mu.Lock()
			for _, mapID := range mapIDs {
				if w.mapCountLocked(mapID) > 0 {
					w.broadcastPlayersLocked(mapID)
				}
			}
			w.mu.Unlock()
		}
	}
}

func (w *World) playersLocked(mapID string) []Player {
	players := make([]Player, 0, len(w.clients))
	for _, client := range w.clients {
		if client.player.MapID == mapID {
			players = append(players, client.player)
		}
	}
	sort.Slice(players, func(i, j int) bool { return players[i].ID < players[j].ID })
	return players
}

func (w *World) broadcastLocked(mapID string, message any) {
	b, err := json.Marshal(message)
	if err != nil {
		return
	}
	for _, client := range w.clients {
		if client.player.MapID == mapID {
			w.enqueueLocked(client, b)
		}
	}
}

func (w *World) enqueueLocked(client *worldClient, b []byte) {
	select {
	case client.send <- b:
	default:
		client.cancel()
	}
}

func (w *World) clientError(client *worldClient, message string) {
	b, _ := json.Marshal(map[string]string{"type": "error", "error": message})
	w.mu.Lock()
	defer w.mu.Unlock()
	w.enqueueLocked(client, b)
}

func (w *World) ServeHTTP(rw http.ResponseWriter, r *http.Request, player Player, progress Progress, generation int64, authorize func(context.Context, string) error, accessGuard func(context.Context, bool) (AccessStatus, error), stopped func()) {
	// App checks exact scheme/origin; the library repeats origin verification.
	conn, err := websocket.Accept(rw, r, &websocket.AcceptOptions{OriginPatterns: w.originPatterns, CompressionMode: websocket.CompressionDisabled})
	if err != nil {
		return
	}
	conn.SetReadLimit(4096)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	defer conn.CloseNow()
	client := &worldClient{sessionHash: tokenHash(r.URL.Query().Get("token")), player: player, conn: conn, send: make(chan []byte, 32), cancel: cancel, authorizeMap: authorize}
	w.mu.Lock()
	now := time.Now()
	w.pruneMemoriesLocked(now)
	previous := w.clients[player.ID]
	memory := w.memories[player.ID]
	if memory != nil && memory.accessGeneration != generation {
		delete(w.memories, player.ID)
		memory = nil
	}
	mapID := r.URL.Query().Get("mapId")
	if mapID == "" {
		mapID = DefaultMapID
		if memory != nil {
			mapID = memory.mapID
		}
		if authorize != nil && !routeUnlocked(mapID, progress.CompletedQuestIDs) {
			mapID = DefaultMapID
		}
	}
	if !validMapID(mapID) {
		w.mu.Unlock()
		_ = conn.Close(websocket.StatusPolicyViolation, "unknown map")
		return
	}
	if w.mapCountLocked(mapID) >= w.maxPlayers && (previous == nil || previous.player.MapID != mapID) {
		w.mu.Unlock()
		_ = conn.Close(websocket.StatusTryAgainLater, "this map is full")
		return
	}
	changingMap := memory != nil && memory.mapID != mapID
	if memory == nil {
		memory = &worldMemory{accessGeneration: generation, mapID: mapID, positions: map[string]MapSpawn{}, lastSeen: now, lastMove: now, movementCredit: worldMoveInitialCredit}
		w.memories[player.ID] = memory
	} else if memory.mapID != mapID && !memory.allowJoin(now) {
		w.mu.Unlock()
		_ = conn.Close(websocket.StatusPolicyViolation, "please wait before changing maps again")
		return
	}
	if changingMap {
		memory.lastMove, memory.movementCredit = now, 0
		memory.interiorID = ""
	}
	client.memory = memory
	position := memory.restorePosition(mapID, w.mapDefinition(mapID))
	client.player.MapID, client.player.X, client.player.Y = mapID, position.X, position.Y
	if !validInterior(mapID, memory.interiorID) {
		memory.interiorID = ""
	}
	client.player.InteriorID = memory.interiorID
	if memory.interiorID != "" {
		definition := w.locationDefinition(mapID, memory.interiorID)
		memory.interiorPosition = restoreWorldPosition(memory.interiorPosition, memory.interiorFrame, definition)
		memory.interiorFrame = definition.WorldCoordinateFrame
		client.player.X, client.player.Y = memory.interiorPosition.X, memory.interiorPosition.Y
	}
	memory.mapID, memory.lastSeen = mapID, now
	w.clients[player.ID] = client
	w.enqueueMapLocked(client, "welcome")
	if previous != nil && previous.player.MapID != mapID {
		w.broadcastPlayersLocked(previous.player.MapID)
	}
	w.broadcastPlayersLocked(mapID)
	w.mu.Unlock()
	if previous != nil {
		// Send a close frame before cancelling: cancellation alone aborts the
		// transport, which browsers treat as a retryable network failure.
		go func() {
			_ = previous.conn.Close(sessionReplacedStatus, "character active in another tab")
			previous.cancel()
		}()
	}
	defer func() {
		w.mu.Lock()
		if w.clients[player.ID] == client {
			client.memory.lastSeen = time.Now()
			delete(w.clients, player.ID)
			w.broadcastPlayersLocked(client.player.MapID)
		}
		w.mu.Unlock()
		if stopped != nil {
			stopped()
		}
	}()
	writerDone := make(chan struct{})
	go func() {
		defer close(writerDone)
		defer cancel()
		ping := time.NewTicker(25 * time.Second)
		defer ping.Stop()
		accessTick := time.NewTicker(5 * time.Second)
		defer accessTick.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case b := <-client.send:
				writeCtx, done := context.WithTimeout(ctx, 5*time.Second)
				err := conn.Write(writeCtx, websocket.MessageText, b)
				done()
				if err != nil {
					return
				}
			case <-ping.C:
				pingCtx, done := context.WithTimeout(ctx, 8*time.Second)
				err := conn.Ping(pingCtx)
				done()
				if err != nil {
					return
				}
			case <-accessTick.C:
				if accessGuard != nil {
					guardCtx, done := context.WithTimeout(ctx, 3*time.Second)
					status, err := accessGuard(guardCtx, true)
					done()
					if err != nil || accessBlocked(status) {
						if err == nil {
							b, _ := json.Marshal(map[string]any{"type": "access", "access": status})
							writeCtx, finish := context.WithTimeout(ctx, time.Second)
							_ = conn.Write(writeCtx, websocket.MessageText, b)
							finish()
						}
						_ = conn.Close(accessRequiredStatus, status.Phase)
						return
					}
				}
			}
		}
	}()
	for {
		kind, b, err := conn.Read(ctx)
		if err != nil {
			break
		}
		if kind != websocket.MessageText {
			w.clientError(client, "only JSON text messages are supported")
			continue
		}
		if accessGuard != nil {
			guardCtx, done := context.WithTimeout(ctx, 3*time.Second)
			status, guardErr := accessGuard(guardCtx, false)
			done()
			if guardErr != nil || accessBlocked(status) {
				b, _ := json.Marshal(map[string]any{"type": "access", "access": status})
				w.mu.Lock()
				w.enqueueLocked(client, b)
				w.mu.Unlock()
				_ = conn.Close(accessRequiredStatus, status.Phase)
				break
			}
		}
		now := time.Now()
		if now.Sub(client.messageWindow) > time.Second {
			client.messageWindow = now
			client.messageCount = 0
		}
		client.messageCount++
		if client.messageCount > 40 {
			_ = conn.Close(websocket.StatusPolicyViolation, "too many messages")
			break
		}
		var message struct {
			Type              string   `json:"type"`
			X                 *float64 `json:"x"`
			Y                 *float64 `json:"y"`
			Message           string   `json:"message"`
			MapID             string   `json:"mapId"`
			InteriorID        string   `json:"interiorId"`
			CoordinateVersion *int     `json:"coordinateVersion"`
		}
		if err := json.Unmarshal(b, &message); err != nil {
			w.clientError(client, "invalid JSON message")
			continue
		}
		switch message.Type {
		case "move":
			if message.X == nil || message.Y == nil || !validCoordinate(*message.X) || !validCoordinate(*message.Y) {
				w.clientError(client, "coordinates must be between 0 and 1")
				continue
			}
			if err := w.moveInLocationVersioned(client, message.MapID, message.InteriorID, *message.X, *message.Y, now, message.CoordinateVersion); err != "" {
				w.clientError(client, err)
			}
		case "joinInterior":
			if err := w.joinInterior(client, message.MapID, message.InteriorID, now); err != "" {
				w.clientError(client, err)
			}
		case "joinMap":
			if err := w.joinMap(client, message.MapID, now); err != "" {
				w.clientError(client, err)
			}
		case "chat":
			if err := w.chatInMap(client, message.MapID, message.Message, now); err != "" {
				w.clientError(client, err)
			}
		default:
			w.clientError(client, "unknown message type")
		}
	}
	cancel()
	_ = conn.CloseNow()
	<-writerDone
}

func validCoordinate(v float64) bool { return !math.IsNaN(v) && !math.IsInf(v, 0) && v >= 0 && v <= 1 }

func (w *World) nearStoryTarget(playerID, mapID string, target MapSpawn, radius WorldRange) bool {
	w.mu.Lock()
	defer w.mu.Unlock()
	client := w.clients[playerID]
	return client != nil && client.player.MapID == mapID && client.player.InteriorID == "" &&
		w.mapDefinition(mapID).WorldCoordinateFrame.within(MapSpawn{client.player.X, client.player.Y}, target, radius)
}

// Loading an earlier narrative slot can withdraw an earned route. Apply that
// change to the active world membership as well as future travel requests.
func (w *World) reconcileStoryLocation(playerID string, completed []string) {
	w.mu.Lock()
	defer w.mu.Unlock()
	client := w.clients[playerID]
	if client == nil || routeUnlocked(client.player.MapID, completed) {
		return
	}
	oldMap := client.player.MapID
	definition := w.mapDefinition(DefaultMapID)
	position := definition.Spawn
	if client.memory != nil {
		position = client.memory.restorePosition(DefaultMapID, definition)
		client.memory.mapID, client.memory.interiorID = DefaultMapID, ""
		client.memory.lastMove, client.memory.lastSeen = time.Now(), time.Now()
		client.memory.movementCredit = 0
	}
	if w.mapCountLocked(DefaultMapID) >= w.maxPlayers {
		// Restoring a save cannot bypass the destination's population limit.
		// Normal reconnect will retry the unlocked town once a space is free.
		delete(w.clients, playerID)
		w.broadcastPlayersLocked(oldMap)
		go func() {
			if client.conn != nil {
				_ = client.conn.Close(websocket.StatusTryAgainLater, "restored town is full")
			}
			if client.cancel != nil {
				client.cancel()
			}
		}()
		return
	}
	client.player.MapID, client.player.InteriorID = DefaultMapID, ""
	client.player.X, client.player.Y = position.X, position.Y
	w.enqueueMapLocked(client, "map")
	w.broadcastPlayersLocked(oldMap)
	w.broadcastPlayersLocked(DefaultMapID)
}

func (w *World) move(client *worldClient, x, y float64, now time.Time) {
	_ = w.moveInMap(client, "", x, y, now)
}

func (w *World) moveInMap(client *worldClient, mapID string, x, y float64, now time.Time) string {
	return w.moveInLocation(client, mapID, "", x, y, now)
}

func (w *World) moveInLocation(client *worldClient, mapID, interiorID string, x, y float64, now time.Time) string {
	return w.moveInLocationVersioned(client, mapID, interiorID, x, y, now, nil)
}

func (w *World) moveInLocationVersioned(client *worldClient, mapID, interiorID string, x, y float64, now time.Time, coordinateVersion *int) string {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.clients[client.player.ID] != client {
		return "session was replaced"
	}
	if mapID != "" && mapID != client.player.MapID {
		return "movement belongs to another map"
	}
	if interiorID != client.player.InteriorID {
		return "movement belongs to another building"
	}
	if !validCoordinate(x) || !validCoordinate(y) {
		return "coordinates must be between 0 and 1"
	}
	if err := w.coordinateVersionError(client.player.MapID, client.player.InteriorID, coordinateVersion); err != "" {
		return err
	}
	memory := client.memory
	memory.movementCredit = math.Min(worldMoveCreditLimit, memory.movementCredit+math.Max(0, now.Sub(memory.lastMove).Seconds())*worldMoveUnitsPerSecond)
	memory.lastMove = now
	definition := w.locationDefinition(client.player.MapID, interiorID)
	dx, dy := definition.WorldCoordinateFrame.delta(MapSpawn{client.player.X, client.player.Y}, MapSpawn{x, y})
	distance := worldMovementDistance(dx, dy)
	if distance == 0 {
		return ""
	}
	step := math.Min(distance, memory.movementCredit)
	client.player.X += dx / distance * step / definition.Width
	client.player.Y += dy / distance * step / definition.Height
	memory.movementCredit -= step
	position := MapSpawn{X: client.player.X, Y: client.player.Y}
	if interiorID == "" {
		memory.rememberPosition(client.player.MapID, position, definition.WorldCoordinateFrame)
	} else {
		memory.interiorPosition = position
		memory.interiorFrame = definition.WorldCoordinateFrame
	}
	return ""
}

func (w *World) chat(client *worldClient, text string, now time.Time) string {
	return w.chatInMap(client, "", text, now)
}

func (w *World) chatInMap(client *worldClient, mapID string, text string, now time.Time) string {
	text = strings.TrimSpace(text)
	if text == "" || utf8.RuneCountInString(text) > 280 || len(text) > 1120 {
		return "chat messages must contain 1–280 characters"
	}
	for _, r := range text {
		if unicode.IsControl(r) {
			return "chat messages cannot contain control characters"
		}
	}
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.clients[client.player.ID] != client {
		return "session was replaced"
	}
	if mapID != "" && mapID != client.player.MapID {
		return "chat belongs to another map"
	}
	fresh := client.memory.chatTimes[:0]
	for _, at := range client.memory.chatTimes {
		if now.Sub(at) < 10*time.Second {
			fresh = append(fresh, at)
		}
	}
	client.memory.chatTimes = fresh
	if len(fresh) >= 3 {
		return "please wait before sending another message"
	}
	id, err := randomID(12)
	if err != nil {
		return "could not send message"
	}
	message := ChatMessage{MapID: client.player.MapID, ID: id, PlayerID: client.player.ID, Name: client.player.Name, Text: text, At: now.UTC()}
	client.memory.chatTimes = append(client.memory.chatTimes, now)
	zone := client.player.MapID
	w.messages[zone] = append(w.messages[zone], message)
	if len(w.messages[zone]) > 50 {
		w.messages[zone] = w.messages[zone][len(w.messages[zone])-50:]
	}
	w.broadcastLocked(zone, map[string]any{"type": "chat", "mapId": zone, "message": message})
	return ""
}

func (w *World) mapCountLocked(mapID string) int {
	count := 0
	for _, client := range w.clients {
		if client.player.MapID == mapID {
			count++
		}
	}
	return count
}

func (w *World) broadcastPlayersLocked(mapID string) {
	w.broadcastLocked(mapID, map[string]any{"type": "players", "mapId": mapID, "players": w.playersLocked(mapID), "clock": w.Clock()})
}

func (w *World) enqueueMapLocked(client *worldClient, kind string) {
	mapID := client.player.MapID
	message, _ := json.Marshal(map[string]any{"type": kind, "selfId": client.player.ID, "mapId": mapID, "interiorId": client.player.InteriorID, "spawn": MapSpawn{X: client.player.X, Y: client.player.Y}, "players": w.playersLocked(mapID), "messages": w.messages[mapID], "clock": w.Clock(), "scene": w.sceneMetadata(mapID, client.player.InteriorID)})
	w.enqueueLocked(client, message)
}

func (memory *worldMemory) allowJoin(now time.Time) bool {
	fresh := memory.joinTimes[:0]
	for _, at := range memory.joinTimes {
		if now.Sub(at) < 10*time.Second {
			fresh = append(fresh, at)
		}
	}
	memory.joinTimes = fresh
	if len(fresh) >= 4 {
		return false
	}
	memory.joinTimes = append(memory.joinTimes, now)
	return true
}

func (w *World) joinMap(client *worldClient, mapID string, now time.Time) string {
	if !validMapID(mapID) {
		return "unknown map; choose a destination from the atlas"
	}
	if client.authorizeMap != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		err := client.authorizeMap(ctx, mapID)
		cancel()
		if err != nil {
			return err.Error()
		}
	}
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.clients[client.player.ID] != client {
		return "session was replaced"
	}
	oldMap := client.player.MapID
	if oldMap == mapID {
		w.enqueueMapLocked(client, "map")
		return ""
	}
	if w.mapCountLocked(mapID) >= w.maxPlayers {
		return "this map is full"
	}
	if !client.memory.allowJoin(now) {
		return "please wait before changing maps again"
	}
	position := client.memory.restorePosition(mapID, w.mapDefinition(mapID))
	client.player.MapID, client.player.X, client.player.Y = mapID, position.X, position.Y
	client.player.InteriorID, client.memory.interiorID = "", ""
	client.memory.mapID, client.memory.lastSeen = mapID, now
	client.memory.lastMove, client.memory.movementCredit = now, 0
	w.enqueueMapLocked(client, "map")
	w.broadcastPlayersLocked(oldMap)
	w.broadcastPlayersLocked(mapID)
	return ""
}

// Keep reconnect positions and rate limits for ten minutes, bounded to 4096
// accounts. Map position is transient world state, not learner persistence.
func (w *World) pruneMemoriesLocked(now time.Time) {
	for id, memory := range w.memories {
		if w.clients[id] == nil && now.Sub(memory.lastSeen) > 10*time.Minute {
			delete(w.memories, id)
		}
	}
	if len(w.memories) < 4096 {
		return
	}
	oldestID := ""
	var oldest time.Time
	for id, memory := range w.memories {
		if w.clients[id] == nil && (oldestID == "" || memory.lastSeen.Before(oldest)) {
			oldestID, oldest = id, memory.lastSeen
		}
	}
	if oldestID != "" {
		delete(w.memories, oldestID)
	}
}

func (w *World) Count() int { w.mu.Lock(); defer w.mu.Unlock(); return len(w.clients) }
func (w *World) UpdateProfile(player Player) Player {
	w.mu.Lock()
	defer w.mu.Unlock()
	if client := w.clients[player.ID]; client != nil {
		client.player.Name, client.player.Avatar = player.Name, player.Avatar
		return client.player
	}
	return player
}
func (w *World) Close() {
	w.cancel()
	<-w.done
	w.mu.Lock()
	defer w.mu.Unlock()
	for _, c := range w.clients {
		c.cancel()
	}
}

func (w *World) RevokeSession(hash string) {
	w.mu.Lock()
	var revoked []*worldClient
	for id, client := range w.clients {
		if client.sessionHash == hash {
			if client.memory != nil {
				client.memory.lastSeen = time.Now()
			}
			delete(w.clients, id)
			revoked = append(revoked, client)
			w.broadcastPlayersLocked(client.player.MapID)
		}
	}
	w.mu.Unlock()
	for _, client := range revoked {
		if client.cancel != nil {
			client.cancel()
		}
		if client.conn != nil {
			_ = client.conn.CloseNow()
		}
	}
}

func (w *World) IsSessionConnected(playerID, sessionHash string) bool {
	w.mu.Lock()
	defer w.mu.Unlock()
	client := w.clients[playerID]
	return client != nil && client.sessionHash == sessionHash
}

// A restart withdraws every transient location, including remembered interior
// positions, and disconnects old tabs before they can move the reset character.
func (w *World) ResetPlayer(playerID string) {
	w.mu.Lock()
	client := w.clients[playerID]
	delete(w.memories, playerID)
	if client != nil {
		delete(w.clients, playerID)
		w.broadcastPlayersLocked(client.player.MapID)
	}
	w.mu.Unlock()
	if client != nil {
		if client.conn != nil {
			_ = client.conn.CloseNow()
		}
		if client.cancel != nil {
			client.cancel()
		}
	}
}
