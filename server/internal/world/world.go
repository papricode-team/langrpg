// Package world is the shared multiplayer presence: who is connected, where
// each player stands in which town or building, and the socket protocol that
// moves them. It owns transient location only; accounts, progress and story
// rules belong to its callers, which inject route and access policy.
package world

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"glotworld/server/internal/avatar"
	"math"
	"net/http"
	"regexp"
	"slices"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/coder/websocket"
)

var safeID = regexp.MustCompile(`^[A-Za-z0-9_-]{1,100}$`)

// EditableObjectID is the form of scene object IDs that admins may edit.
var EditableObjectID = regexp.MustCompile(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)

type Player struct {
	InteriorID string        `json:"interiorId,omitempty"`
	MapID      string        `json:"mapId"`
	ID         string        `json:"id"`
	Name       string        `json:"name"`
	X          float64       `json:"x"`
	Y          float64       `json:"y"`
	Avatar     avatar.Avatar `json:"avatar"`
}

const DefaultMapID = "lindenhafen"

// A replaced tab must not reconnect and evict the tab that took over.
const sessionReplacedStatus websocket.StatusCode = 4001
const accessRequiredStatus websocket.StatusCode = 4002

// The playable world is the three authored story towns. ParseRegistry
// rejects any other map set, so this list is the registry's key set.
var mapIDs = []string{DefaultMapID, "waldruh", "nebelstadt"}

type MapSpawn struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

// ValidMapID reports one of the story towns.
func ValidMapID(id string) bool { return slices.Contains(mapIDs, id) }

type worldMemory struct {
	accessGeneration int64
	mapID            string
	interiorID       string
	interiorPosition MapSpawn
	interiorFrame    CoordinateFrame
	positions        map[string]MapSpawn
	positionFrames   map[string]CoordinateFrame
	joinTimes        []time.Time
	lastSeen         time.Time
	lastMove         time.Time
	movementCredit   float64
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
	admin         bool
	// moved marks a position others have not seen yet; corrected marks a
	// move the server shortened, which the mover must hear about too.
	moved, corrected bool
}

type World struct {
	mu             sync.Mutex
	clients        map[string]*worldClient
	memories       map[string]*worldMemory
	cancel         context.CancelFunc
	done           chan struct{}
	maxPlayers     int
	originPatterns []string
	clockIdentity  Identity
	maps           map[string]MapDefinition
	contentVersion string
}

// Access is the outcome of an access check for an open socket. Status is
// sent to the client unchanged as {"type":"access","access":Status}.
type Access struct {
	Blocked bool
	Phase   string
	Status  any
}

// New starts a world for up to maxPlayers per map with an initial map
// registry; the server publishes the stored world's registry once loaded.
func New(maxPlayers int, origins []string, identity Identity, compiled MapRegistry) *World {
	ctx, cancel := context.WithCancel(context.Background())
	w := &World{clients: map[string]*worldClient{}, memories: map[string]*worldMemory{}, cancel: cancel, done: make(chan struct{}), maxPlayers: maxPlayers, originPatterns: origins, clockIdentity: identity, maps: make(map[string]MapDefinition, len(compiled.Maps)), contentVersion: compiled.ContentVersion}
	for id, definition := range compiled.Maps {
		w.maps[id] = definition
	}
	go w.run(ctx)
	return w
}

// The tick batches movement into one small delta per room. Rosters go out only
// when someone arrives, leaves or changes; clients extrapolate the shared clock
// and only need an occasional resync.
const (
	moveTick      = 100 * time.Millisecond
	clockInterval = 30 * time.Second
)

func (w *World) run(ctx context.Context) {
	defer close(w.done)
	ticker := time.NewTicker(moveTick)
	defer ticker.Stop()
	lastClock := time.Now()
	for {
		select {
		case <-ctx.Done():
			return
		case now := <-ticker.C:
			w.mu.Lock()
			w.flushMovesLocked()
			if now.Sub(lastClock) >= clockInterval {
				lastClock = now
				w.broadcastClockLocked()
			}
			w.mu.Unlock()
		}
	}
}

type locationKey struct{ mapID, interiorID string }

// flushMovesLocked sends each room the positions that changed since the last
// tick as [id, x, y] entries. Movers do not hear their own position back
// unless the server shortened their move.
func (w *World) flushMovesLocked() {
	var moved map[locationKey][]any
	for _, client := range w.clients {
		if client.moved {
			key := locationKey{client.player.MapID, client.player.InteriorID}
			if moved == nil {
				moved = map[locationKey][]any{}
			}
			moved[key] = append(moved[key], moveEntry(client.player))
		}
	}
	shared := map[locationKey][]byte{}
	for _, client := range w.clients {
		key := locationKey{client.player.MapID, client.player.InteriorID}
		entries := moved[key]
		if !client.moved && !client.corrected {
			if len(entries) == 0 {
				continue
			}
			b, ok := shared[key]
			if !ok {
				b = movesMessage(key, entries)
				shared[key] = b
			}
			w.enqueueLocked(client, b)
			continue
		}
		own := moveEntry(client.player)
		filtered := make([]any, 0, len(entries)+1)
		for _, entry := range entries {
			if entry.([]any)[0] != client.player.ID {
				filtered = append(filtered, entry)
			}
		}
		if client.corrected {
			filtered = append(filtered, own)
		}
		if len(filtered) > 0 {
			w.enqueueLocked(client, movesMessage(key, filtered))
		}
	}
	for _, client := range w.clients {
		client.moved, client.corrected = false, false
	}
}

func moveEntry(player Player) any { return []any{player.ID, player.X, player.Y} }

func movesMessage(key locationKey, entries []any) []byte {
	b, _ := json.Marshal(map[string]any{"type": "moves", "mapId": key.mapID, "interiorId": key.interiorID, "moves": entries})
	return b
}

func (w *World) broadcastClockLocked() {
	b, err := json.Marshal(map[string]any{"type": "clock", "clock": w.Clock()})
	if err != nil {
		return
	}
	for _, client := range w.clients {
		w.enqueueLocked(client, b)
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

// ServeHTTP runs one player's socket until it closes. sessionHash identifies
// the session for revocation. routeAllowed, when set, keeps a reconnect out of
// towns the player has not unlocked; authorize re-checks explicit travel.
// accessGuard is consulted per message (renew=false) and on the 5 s tick
// (renew=true); a blocked or failed check closes the socket.
func (w *World) ServeHTTP(rw http.ResponseWriter, r *http.Request, player Player, sessionHash string, generation int64, admin bool, routeAllowed func(mapID string) bool, authorize func(context.Context, string) error, accessGuard func(context.Context, bool) (Access, error), stopped func()) {
	// App checks exact scheme/origin; the library repeats origin verification.
	conn, err := websocket.Accept(rw, r, &websocket.AcceptOptions{OriginPatterns: w.originPatterns, CompressionMode: websocket.CompressionDisabled})
	if err != nil {
		return
	}
	conn.SetReadLimit(4096)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	defer conn.CloseNow()
	client := &worldClient{sessionHash: sessionHash, player: player, conn: conn, send: make(chan []byte, 32), cancel: cancel, authorizeMap: authorize, admin: admin}
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
		if routeAllowed != nil && !routeAllowed(mapID) {
			mapID = DefaultMapID
		}
	}
	if !ValidMapID(mapID) {
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
	position := memory.restorePosition(mapID, w.Definition(mapID))
	client.player.MapID, client.player.X, client.player.Y = mapID, position.X, position.Y
	if !w.validInteriorLocked(mapID, memory.interiorID) {
		memory.interiorID = ""
	}
	client.player.InteriorID = memory.interiorID
	if memory.interiorID != "" {
		definition := w.LocationDefinition(mapID, memory.interiorID)
		memory.interiorPosition = RestorePosition(memory.interiorPosition, memory.interiorFrame, definition)
		memory.interiorFrame = definition.CoordinateFrame
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
					if err != nil || status.Blocked {
						if err == nil {
							b, _ := json.Marshal(map[string]any{"type": "access", "access": status.Status})
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
			if guardErr != nil || status.Blocked {
				b, _ := json.Marshal(map[string]any{"type": "access", "access": status.Status})
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
			MapID             string   `json:"mapId"`
			InteriorID        string   `json:"interiorId"`
			DoorID            string   `json:"doorId"`
			CoordinateVersion *int     `json:"coordinateVersion"`
			ObjectID          string   `json:"objectId"`
		}
		if err := json.Unmarshal(b, &message); err != nil {
			w.clientError(client, "invalid JSON message")
			continue
		}
		switch message.Type {
		case "move":
			if message.X == nil || message.Y == nil || !ValidCoordinate(*message.X) || !ValidCoordinate(*message.Y) {
				w.clientError(client, "coordinates must be between 0 and 1")
				continue
			}
			if err := w.moveInLocationVersioned(client, message.MapID, message.InteriorID, *message.X, *message.Y, now, message.CoordinateVersion); err != "" {
				w.clientError(client, err)
			}
		case "joinInterior":
			if err := w.joinInterior(client, message.MapID, message.InteriorID, now, message.DoorID); err != "" {
				w.clientError(client, err)
			}
		case "joinMap":
			if err := w.joinMap(client, message.MapID, now); err != "" {
				w.clientError(client, err)
			}
		case "edit.preview":
			// Admins see each other's drags live; nobody else receives them.
			if client.admin && message.X != nil && message.Y != nil && EditableObjectID.MatchString(message.ObjectID) && !math.IsNaN(*message.X) && !math.IsNaN(*message.Y) {
				w.publishPreview(client, message.ObjectID, *message.X, *message.Y)
			}
		default:
			w.clientError(client, "unknown message type")
		}
	}
	cancel()
	_ = conn.CloseNow()
	<-writerDone
}

func ValidCoordinate(v float64) bool { return !math.IsNaN(v) && !math.IsInf(v, 0) && v >= 0 && v <= 1 }

// InInterior checks authoritative connected presence, never a stale saved position.
func (w *World) InInterior(playerID, mapID, interiorID string) bool {
	w.mu.Lock()
	defer w.mu.Unlock()
	client := w.clients[playerID]
	return client != nil && client.player.MapID == mapID && client.player.InteriorID == interiorID
}

func (w *World) NearTarget(playerID, mapID string, target MapSpawn, radius Range) bool {
	w.mu.Lock()
	defer w.mu.Unlock()
	client := w.clients[playerID]
	return client != nil && client.player.MapID == mapID && client.player.InteriorID == "" &&
		w.Definition(mapID).CoordinateFrame.Within(MapSpawn{client.player.X, client.player.Y}, target, radius)
}

// Loading an earlier narrative slot can withdraw an earned route. Apply that
// change to the active world membership as well as future travel requests.
func (w *World) ReconcileStoryLocation(playerID string, routeAllowed func(mapID string) bool) {
	w.mu.Lock()
	defer w.mu.Unlock()
	client := w.clients[playerID]
	if client == nil || routeAllowed(client.player.MapID) {
		return
	}
	oldMap := client.player.MapID
	definition := w.Definition(DefaultMapID)
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
	if !ValidCoordinate(x) || !ValidCoordinate(y) {
		return "coordinates must be between 0 and 1"
	}
	if err := w.coordinateVersionError(client.player.MapID, client.player.InteriorID, coordinateVersion); err != "" {
		return err
	}
	memory := client.memory
	memory.movementCredit = math.Min(worldMoveCreditLimit, memory.movementCredit+math.Max(0, now.Sub(memory.lastMove).Seconds())*worldMoveUnitsPerSecond)
	memory.lastMove = now
	definition := w.LocationDefinition(client.player.MapID, interiorID)
	dx, dy := definition.CoordinateFrame.Delta(MapSpawn{client.player.X, client.player.Y}, MapSpawn{x, y})
	distance := MovementDistance(dx, dy)
	if distance == 0 {
		return ""
	}
	step := math.Min(distance, memory.movementCredit)
	client.player.X += dx / distance * step / definition.Width
	client.player.Y += dy / distance * step / definition.Height
	memory.movementCredit -= step
	client.moved = client.moved || step > 0
	client.corrected = client.corrected || step < distance
	position := MapSpawn{X: client.player.X, Y: client.player.Y}
	if interiorID == "" {
		memory.rememberPosition(client.player.MapID, position, definition.CoordinateFrame)
	} else {
		memory.interiorPosition = position
		memory.interiorFrame = definition.CoordinateFrame
	}
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

// broadcastPlayersLocked sends the full roster, which also carries every
// pending position on the map, so those moves need no separate delta.
func (w *World) broadcastPlayersLocked(mapID string) {
	w.broadcastLocked(mapID, map[string]any{"type": "players", "mapId": mapID, "players": w.playersLocked(mapID), "clock": w.Clock()})
	for _, client := range w.clients {
		if client.player.MapID == mapID {
			client.moved, client.corrected = false, false
		}
	}
}

func (w *World) enqueueMapLocked(client *worldClient, kind string) {
	mapID := client.player.MapID
	message, _ := json.Marshal(map[string]any{"type": kind, "selfId": client.player.ID, "mapId": mapID, "interiorId": client.player.InteriorID, "spawn": MapSpawn{X: client.player.X, Y: client.player.Y}, "players": w.playersLocked(mapID), "clock": w.Clock(), "scene": w.sceneMetadata(mapID, client.player.InteriorID)})
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
	if !ValidMapID(mapID) {
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
	position := client.memory.restorePosition(mapID, w.Definition(mapID))
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

// MapCounts reports connected sockets for every published map, including empty ones.
func (w *World) MapCounts() map[string]int {
	w.mu.Lock()
	defer w.mu.Unlock()
	counts := make(map[string]int, len(w.maps))
	for mapID := range w.maps {
		counts[mapID] = 0
	}
	for _, client := range w.clients {
		counts[client.player.MapID]++
	}
	return counts
}

func (w *World) Count() int { w.mu.Lock(); defer w.mu.Unlock(); return len(w.clients) }
func (w *World) UpdateProfile(player Player) Player {
	w.mu.Lock()
	defer w.mu.Unlock()
	if client := w.clients[player.ID]; client != nil {
		client.player.Name, client.player.Avatar = player.Name, player.Avatar
		w.broadcastPlayersLocked(client.player.MapID)
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

// RevokeOtherSessions disconnects a player's socket unless it belongs to the
// kept session, for example after a credential change revoked the others.
func (w *World) RevokeOtherSessions(playerID, keepHash string) {
	w.mu.Lock()
	client := w.clients[playerID]
	w.mu.Unlock()
	if client != nil && client.sessionHash != keepHash {
		w.RevokeSession(client.sessionHash)
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

// SavedPlayer takes a snapshot at course switches and periodic access renewals.
// Course snapshots preserve the current town/interior and actual world position.
func (w *World) SavedPlayer(fallback Player) Player {
	player, _ := w.SavedCourseLocation(fallback, CoordinateFrame{})
	return player
}

func (w *World) SavedCourseLocation(fallback Player, source CoordinateFrame) (Player, CoordinateFrame) {
	w.mu.Lock()
	defer w.mu.Unlock()
	if client := w.clients[fallback.ID]; client != nil {
		return client.player, w.LocationDefinition(client.player.MapID, client.player.InteriorID).CoordinateFrame
	}
	if memory := w.memories[fallback.ID]; memory != nil {
		fallback.MapID = memory.mapID
		fallback.InteriorID = memory.interiorID
		position := memory.restorePosition(memory.mapID, w.Definition(memory.mapID))
		if memory.interiorID != "" {
			position = RestorePosition(memory.interiorPosition, memory.interiorFrame, w.LocationDefinition(memory.mapID, memory.interiorID))
		}
		fallback.X = position.X
		fallback.Y = position.Y
	} else if source.Valid() {
		position := RestorePosition(MapSpawn{fallback.X, fallback.Y}, source, w.LocationDefinition(fallback.MapID, fallback.InteriorID))
		fallback.X, fallback.Y = position.X, position.Y
	}
	return fallback, w.LocationDefinition(fallback.MapID, fallback.InteriorID).CoordinateFrame
}

// Restoring an inactive course must ignore the currently active course's memory.
func (w *World) RestoreSavedCourseLocation(player Player, source CoordinateFrame) (Player, CoordinateFrame) {
	w.mu.Lock()
	defer w.mu.Unlock()
	if !ValidMapID(player.MapID) {
		player.MapID, player.InteriorID = DefaultMapID, ""
		spawn := w.Definition(DefaultMapID).Spawn
		player.X, player.Y = spawn.X, spawn.Y
		return player, w.Definition(DefaultMapID).CoordinateFrame
	}
	definition := w.LocationDefinition(player.MapID, player.InteriorID)
	if !source.Valid() {
		if player.InteriorID != "" {
			source = LegacyFrame()
		} else {
			source = w.maps[player.MapID].CoordinateFrame
		}
	}
	position := RestorePosition(MapSpawn{player.X, player.Y}, source, definition)
	player.X, player.Y = position.X, position.Y
	return player, definition.CoordinateFrame
}

func (w *World) RestoreCoursePlayer(player Player, generation int64) {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.memories[player.ID] != nil || !ValidMapID(player.MapID) {
		return
	}
	now := time.Now()
	memory := &worldMemory{accessGeneration: generation, mapID: player.MapID, positions: map[string]MapSpawn{}, lastSeen: now, lastMove: now, movementCredit: worldMoveInitialCredit}
	memory.rememberPosition(player.MapID, MapSpawn{player.X, player.Y}, w.Definition(player.MapID).CoordinateFrame)
	if player.InteriorID != "" && w.knownInterior(player.MapID, player.InteriorID) {
		memory.interiorID = player.InteriorID
		memory.interiorPosition = MapSpawn{player.X, player.Y}
		memory.interiorFrame = w.LocationDefinition(player.MapID, player.InteriorID).CoordinateFrame
	}
	w.memories[player.ID] = memory
}

const (
	LegacyWidth  = 1536.0
	LegacyHeight = 1024.0
	// The old normalized movement envelope allowed more horizontal than vertical
	// distance. Express that same allowance in world units during migration so
	// neither enlargement nor this refactor changes accepted legacy movement.
	worldMoveUnitsPerSecond = .24 * LegacyWidth
	worldMoveCreditLimit    = .08 * LegacyWidth
	worldMoveInitialCredit  = .025 * LegacyWidth
)

// Range preserves the existing elliptical authority tolerances in physical
// world units. New circular interactions can supply equal X and Y radii.
type Range struct{ X, Y float64 }

// CoordinateFrame records how a normalized position maps to the original
// district. LegacyOffset is the original district's current world-unit offset.
// A zero version on old reconnect memory means the original 1536 × 1024 frame.
type CoordinateFrame struct {
	CoordinateVersion int      `json:"coordinateVersion"`
	Width             float64  `json:"width"`
	Height            float64  `json:"height"`
	LegacyOffset      MapSpawn `json:"legacyOffset,omitempty"`
}

type MapDefinition struct {
	CoordinateFrame
	Spawn     MapSpawn            `json:"spawn"`
	Entrances map[string]Entrance `json:"entrances,omitempty"`
}

type RoomDoor struct {
	Kind    string   `json:"kind,omitempty"`
	Target  string   `json:"target"`
	Arrival MapSpawn `json:"arrival"`
}

type Entrance struct {
	Level    int                 `json:"level,omitempty"`
	Building string              `json:"building,omitempty"`
	Doors    map[string]RoomDoor `json:"doors,omitempty"`
	// Spawn is optional for legacy room layouts. Published custom rooms own their arrival point.
	Spawn    *MapSpawn `json:"spawn,omitempty"`
	ID       string    `json:"id"`
	OwnerID  string    `json:"ownerId"`
	Approach MapSpawn  `json:"approach"`
	Return   MapSpawn  `json:"return"`
}

type MapRegistry struct {
	SchemaVersion  int                      `json:"schemaVersion"`
	ContentVersion string                   `json:"contentVersion"`
	Maps           map[string]MapDefinition `json:"maps"`
}

func ParseRegistry(data []byte) (MapRegistry, error) {
	var registry MapRegistry
	if err := json.Unmarshal(data, &registry); err != nil {
		return registry, fmt.Errorf("world map registry: %w", err)
	}
	if registry.SchemaVersion != 1 || registry.ContentVersion == "" || len(registry.Maps) == 0 {
		return registry, fmt.Errorf("world map registry: invalid version or empty maps")
	}
	for id, definition := range registry.Maps {
		if !slices.Contains(mapIDs, id) || !definition.CoordinateFrame.Valid() ||
			!ValidCoordinate(definition.Spawn.X) || !ValidCoordinate(definition.Spawn.Y) {
			return registry, fmt.Errorf("world map registry: invalid definition for %q", id)
		}
		for interior, entrance := range definition.Entrances {
			if entrance.Level < -15 || entrance.Level > 15 || entrance.Building == "" && entrance.Level != 0 {
				return registry, fmt.Errorf("world map registry: invalid floor for %q", interior)
			}
			if entrance.Building != "" {
				root, ok := definition.Entrances[entrance.Building]
				if !ok || root.Building != "" || root.OwnerID != entrance.OwnerID || !strings.HasPrefix(interior, entrance.Building+"::") {
					return registry, fmt.Errorf("world map registry: invalid room owner %q", interior)
				}
			} else if strings.Contains(interior, "::") {
				return registry, fmt.Errorf("world map registry: missing room owner %q", interior)
			}
			for id, door := range entrance.Doors {
				target, ok := definition.Entrances[door.Target]
				if door.Kind != "" && door.Kind != "door" && door.Kind != "stairs" || (door.Kind == "stairs") != (entrance.Level != target.Level) {
					return registry, fmt.Errorf("world map registry: invalid stairs or floor connection %q", id)
				}
				root := entrance.Building
				if root == "" {
					root = interior
				}
				targetRoot := target.Building
				if targetRoot == "" {
					targetRoot = door.Target
				}
				if !safeID.MatchString(id) || !ok || root != targetRoot || door.Target == interior || !ValidCoordinate(door.Arrival.X) || !ValidCoordinate(door.Arrival.Y) {
					return registry, fmt.Errorf("world map registry: invalid room door %q", id)
				}
			}
			if !KnownInterior(interior) || !safeID.MatchString(entrance.ID) || !safeID.MatchString(entrance.OwnerID) ||
				!ValidCoordinate(entrance.Approach.X) || !ValidCoordinate(entrance.Approach.Y) ||
				!ValidCoordinate(entrance.Return.X) || !ValidCoordinate(entrance.Return.Y) ||
				(entrance.Spawn != nil && (!ValidCoordinate(entrance.Spawn.X) || !ValidCoordinate(entrance.Spawn.Y))) {
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

func Spawns(registry MapRegistry) map[string]MapSpawn {
	spawns := make(map[string]MapSpawn, len(registry.Maps))
	for id, definition := range registry.Maps {
		spawns[id] = definition.Spawn
	}
	return spawns
}

func (frame CoordinateFrame) Valid() bool {
	return frame.CoordinateVersion >= 1 && finite(frame.Width) && frame.Width > 0 &&
		finite(frame.Height) && frame.Height > 0 && finite(frame.LegacyOffset.X) && finite(frame.LegacyOffset.Y)
}

func finite(value float64) bool { return !math.IsNaN(value) && !math.IsInf(value, 0) }

func LegacyFrame() CoordinateFrame {
	return CoordinateFrame{CoordinateVersion: 1, Width: LegacyWidth, Height: LegacyHeight}
}

func (w *World) Definition(mapID string) MapDefinition { return w.maps[mapID] }

func (w *World) LocationDefinition(mapID, interiorID string) MapDefinition {
	if interiorID != "" {
		spawn := InteriorSpawn(interiorID)
		if entrance, exists := w.Definition(mapID).Entrances[interiorID]; exists && entrance.Spawn != nil {
			spawn = *entrance.Spawn
		}
		return MapDefinition{CoordinateFrame: LegacyFrame(), Spawn: spawn}
	}
	return w.Definition(mapID)
}

func (frame CoordinateFrame) Delta(from, to MapSpawn) (float64, float64) {
	return (to.X - from.X) * frame.Width, (to.Y - from.Y) * frame.Height
}

func (frame CoordinateFrame) Within(from, to MapSpawn, radius Range) bool {
	if radius.X <= 0 || radius.Y <= 0 {
		return false
	}
	dx, dy := frame.Delta(from, to)
	return math.Hypot(dx/radius.X, dy/radius.Y) <= 1
}

func MovementDistance(dx, dy float64) float64 {
	return math.Hypot(dx, dy*LegacyWidth/LegacyHeight)
}

// Reconnect positions are transient, not narrative saves. Store their frame so
// resizing or shifting a map cannot stretch them. Invalid or future frames use
// the compiled safe spawn; no server-side navigation projection is implied.
func RestorePosition(position MapSpawn, source CoordinateFrame, destination MapDefinition) MapSpawn {
	if !ValidCoordinate(position.X) || !ValidCoordinate(position.Y) || !destination.CoordinateFrame.Valid() {
		return destination.Spawn
	}
	if source.CoordinateVersion == 0 {
		source = LegacyFrame()
	}
	if !source.Valid() || source.CoordinateVersion > destination.CoordinateVersion {
		return destination.Spawn
	}
	if source == destination.CoordinateFrame {
		return position
	}
	x := (position.X*source.Width - source.LegacyOffset.X + destination.LegacyOffset.X) / destination.Width
	y := (position.Y*source.Height - source.LegacyOffset.Y + destination.LegacyOffset.Y) / destination.Height
	if !ValidCoordinate(x) || !ValidCoordinate(y) {
		return destination.Spawn
	}
	return MapSpawn{X: x, Y: y}
}

func (memory *worldMemory) rememberPosition(mapID string, position MapSpawn, frame CoordinateFrame) {
	if memory.positions == nil {
		memory.positions = make(map[string]MapSpawn)
	}
	if memory.positionFrames == nil {
		memory.positionFrames = make(map[string]CoordinateFrame)
	}
	memory.positions[mapID], memory.positionFrames[mapID] = position, frame
}

func (memory *worldMemory) restorePosition(mapID string, definition MapDefinition) MapSpawn {
	position := definition.Spawn
	if saved, exists := memory.positions[mapID]; exists {
		position = RestorePosition(saved, memory.positionFrames[mapID], definition)
	}
	memory.rememberPosition(mapID, position, definition.CoordinateFrame)
	return position
}

func (w *World) sceneMetadata(mapID, interiorID string) map[string]any {
	definition := w.LocationDefinition(mapID, interiorID)
	return map[string]any{"contentVersion": w.contentVersion, "coordinateVersion": definition.CoordinateVersion,
		"width": definition.Width, "height": definition.Height}
}

func (w *World) coordinateVersionError(mapID, interiorID string, version *int) string {
	current := w.LocationDefinition(mapID, interiorID).CoordinateVersion
	if (version == nil && current != 1) || (version != nil && *version != current) {
		return "world coordinates changed; reload the map before moving"
	}
	return ""
}

// Room coordinates match the authored 1536 × 1024 interiors. Each region
// has its own copy of these buildings; outdoor return positions stay separate.
var interiorSpawns = map[string]MapSpawn{
	"train-compartment": {X: 330.0 / 1536, Y: 600.0 / 1024},
	"cafe":              {X: 548.0 / 1536, Y: 800.0 / 1024},
	"bakery":            {X: 1000.0 / 1536, Y: 800.0 / 1024},
	"supermarket":       {X: 1230.0 / 1536, Y: 790.0 / 1024},
	"inn":               {X: .50, Y: .75},
	"library":           {X: .5, Y: 790.0 / 1024},
	"workshop":          {X: .5, Y: 790.0 / 1024},
	"station":           {X: .5, Y: 790.0 / 1024},
	"greenhouse":        {X: .5, Y: 790.0 / 1024},
	"home":              {X: .5, Y: 790.0 / 1024},
}

func KnownInterior(id string) bool {
	// Keep this independent of the registry's package initialization.
	root, room, child := strings.Cut(id, "::")
	if child && !safeID.MatchString(room) {
		return false
	}
	kind, instance, scoped := strings.Cut(root, "--")
	if scoped && !safeID.MatchString(instance) {
		return false
	}
	_, known := interiorSpawns[kind]
	return known
}

// knownInterior checks a room against the published registry.
func (w *World) knownInterior(mapID, interiorID string) bool {
	if interiorID == "" {
		return true
	}
	_, exists := w.maps[mapID].Entrances[interiorID]
	return exists && KnownInterior(interiorID)
}

// validInteriorLocked follows rooms added or removed by world edits.
func (w *World) validInteriorLocked(mapID, interiorID string) bool {
	if interiorID == "" {
		return true
	}
	_, exists := w.Definition(mapID).Entrances[interiorID]
	return exists && KnownInterior(interiorID)
}

func (w *World) joinInterior(client *worldClient, mapID, interiorID string, now time.Time, doorIDs ...string) string {
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.clients[client.player.ID] != client {
		return "session was replaced"
	}
	if mapID != client.player.MapID {
		return "building belongs to another map"
	}
	_, entranceExists := w.Definition(mapID).Entrances[interiorID]
	if interiorID != "" && (!entranceExists || !KnownInterior(interiorID)) {
		return "unknown building in this region"
	}
	var arrival *MapSpawn
	if len(doorIDs) > 0 && doorIDs[0] != "" {
		source := w.Definition(mapID).Entrances[client.player.InteriorID]
		door, exists := source.Doors[doorIDs[0]]
		if !exists || door.Target != interiorID {
			return "unknown room door"
		}
		arrival = &door.Arrival
	} else if interiorID != "" && w.Definition(mapID).Entrances[interiorID].Building != "" && client.player.InteriorID != interiorID {
		return "enter this room through a connecting door"
	}
	if client.player.InteriorID != interiorID {
		position := client.memory.restorePosition(mapID, w.Definition(mapID))
		if interiorID != "" {
			definition := w.LocationDefinition(mapID, interiorID)
			position = definition.Spawn
			if arrival != nil {
				position = *arrival
			}
			client.memory.interiorFrame = definition.CoordinateFrame
		} else if entrance, exists := w.Definition(mapID).Entrances[client.player.InteriorID]; exists {
			position = entrance.Return
			client.memory.rememberPosition(mapID, position, w.Definition(mapID).CoordinateFrame)
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

// Identity belongs to the shared world, never to an account or story save.
// An immutable epoch lets restarted servers reconstruct time without tick writes.
type Identity struct {
	Version int       `json:"version"`
	Epoch   time.Time `json:"epoch"`
	Seed    string    `json:"seed"`
}

func NewIdentity() (Identity, error) {
	var seed [16]byte
	if _, err := rand.Read(seed[:]); err != nil {
		return Identity{}, err
	}
	return Identity{Version: 1, Epoch: time.Now().UTC(), Seed: hex.EncodeToString(seed[:])}, nil
}

func (identity Identity) Validate() error {
	seed, err := hex.DecodeString(identity.Seed)
	if identity.Version != 1 || identity.Epoch.IsZero() || err != nil || len(seed) != 16 || identity.Seed != hex.EncodeToString(seed) {
		return errors.New("invalid persisted world identity; restore the saved epoch and seed")
	}
	return nil
}

type SharedClock struct {
	Epoch            time.Time `json:"epoch"`
	Seed             string    `json:"seed"`
	ElapsedSeconds   float64   `json:"elapsedSeconds"`
	DayLengthSeconds int       `json:"dayLengthSeconds"`
	Hour             float64   `json:"hour"`
	Label            string    `json:"label"`
	Period           string    `json:"period"`
	Day              int       `json:"day"`
	ServerTime       time.Time `json:"serverTime"`
}

func ClockAt(epoch, now time.Time) SharedClock {
	elapsed := math.Max(0, now.Sub(epoch).Seconds())
	hour := math.Mod(7+elapsed*24/DaySeconds, 24)
	minute := int(math.Floor(hour * 60))
	period := "night"
	if hour >= 7 && hour < 19 {
		period = "day"
	}
	return SharedClock{Hour: hour, Label: fmt.Sprintf("%02d:%02d", minute/60, minute%60), Period: period, Day: 1 + int(elapsed/DaySeconds), ServerTime: now.UTC(), Epoch: epoch.UTC(), ElapsedSeconds: elapsed, DayLengthSeconds: DaySeconds}
}

func (w *World) Clock() SharedClock {
	clock := ClockAt(w.clockIdentity.Epoch, time.Now())
	clock.Seed = w.clockIdentity.Seed
	return clock
}

func (w *World) AtInn(playerID string) bool {
	w.mu.Lock()
	defer w.mu.Unlock()
	client := w.clients[playerID]
	return client != nil && strings.SplitN(strings.SplitN(client.player.InteriorID, "::", 2)[0], "--", 2)[0] == "inn"
}

// DaySeconds is the real-time length of one world day.
const DaySeconds = 720

// PublishPatch streams edit operations to every player instead of reloading
// their scenes. Clients that missed a patch fall back to a full reload.
func (w *World) PublishPatch(registry MapRegistry, ops json.RawMessage, revision string) {
	w.mu.Lock()
	defer w.mu.Unlock()
	from := w.contentVersion
	if registry.ContentVersion == from {
		return
	}
	w.maps = registry.Maps
	w.contentVersion = registry.ContentVersion
	message, err := json.Marshal(map[string]any{"type": "world.patch", "from": from, "contentVersion": registry.ContentVersion, "revision": revision, "ops": ops})
	if err != nil {
		return
	}
	for _, client := range w.clients {
		w.enqueueLocked(client, message)
	}
}

// PublishLocks tells admins in a town which objects others are editing.
func (w *World) PublishLocks(mapID string, locks any) {
	w.mu.Lock()
	defer w.mu.Unlock()
	message, err := json.Marshal(map[string]any{"type": "edit.locks", "mapId": mapID, "locks": locks})
	if err != nil {
		return
	}
	for _, client := range w.clients {
		if client.admin && client.player.MapID == mapID {
			w.enqueueLocked(client, message)
		}
	}
}

func (w *World) InteriorOccupancy(mapID, interiorID string) int {
	w.mu.Lock()
	defer w.mu.Unlock()
	count := 0
	for _, client := range w.clients {
		if client.player.MapID == mapID && client.player.InteriorID == interiorID {
			count++
		}
	}
	return count
}

func (w *World) publishPreview(from *worldClient, objectID string, x, y float64) {
	message, err := json.Marshal(map[string]any{"type": "edit.preview", "mapId": from.player.MapID, "objectId": objectID, "x": x, "y": y, "adminName": from.player.Name})
	if err != nil {
		return
	}
	w.mu.Lock()
	defer w.mu.Unlock()
	for _, client := range w.clients {
		if client != from && client.admin && client.player.MapID == from.player.MapID {
			w.enqueueLocked(client, message)
		}
	}
}

func (w *World) PublishContent(registry MapRegistry) {
	w.mu.Lock()
	defer w.mu.Unlock()
	if registry.ContentVersion == w.contentVersion {
		return
	}
	for _, memory := range w.memories {
		for mapID, position := range memory.positions {
			if next, ok := registry.Maps[mapID]; ok {
				memory.rememberPosition(mapID, RestorePosition(position, memory.positionFrames[mapID], next), next.CoordinateFrame)
			}
		}
	}
	for _, client := range w.clients {
		if id := client.player.InteriorID; id != "" {
			next := registry.Maps[client.player.MapID]
			if _, exists := next.Entrances[id]; !exists {
				old := w.maps[client.player.MapID].Entrances[id]
				target := ""
				position := next.Spawn
				frame := next.CoordinateFrame
				if root, exists := next.Entrances[old.Building]; old.Building != "" && exists {
					target = old.Building
					position = InteriorSpawn(target)
					frame = LegacyFrame()
					if root.Spawn != nil {
						position = *root.Spawn
					}
				}
				client.player.InteriorID = target
				client.player.X = position.X
				client.player.Y = position.Y
				if client.memory != nil {
					client.memory.interiorID = target
					client.memory.interiorPosition = position
					client.memory.interiorFrame = frame
				}
				continue
			}
		}
		if client.player.InteriorID == "" {
			before := w.maps[client.player.MapID]
			next := registry.Maps[client.player.MapID]
			position := RestorePosition(MapSpawn{client.player.X, client.player.Y}, before.CoordinateFrame, next)
			client.player.X, client.player.Y = position.X, position.Y
			if client.memory != nil {
				client.memory.rememberPosition(client.player.MapID, position, next.CoordinateFrame)
			}
		}
	}
	w.maps = registry.Maps
	w.contentVersion = registry.ContentVersion
	// Version metadata makes connected clients refresh their scene before playing.
	for _, client := range w.clients {
		w.enqueueMapLocked(client, "map")
	}
}

// PublishStoryChange tells players to fetch a scene's dialogue again.
func (w *World) PublishStoryChange(graphID, questID string) {
	message, err := json.Marshal(map[string]any{"type": "story.changed", "graphId": graphID, "questId": questID})
	if err != nil {
		return
	}
	w.mu.Lock()
	defer w.mu.Unlock()
	for _, client := range w.clients {
		w.enqueueLocked(client, message)
	}
}
