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

var mapIDs = []string{
	DefaultMapID, "waldruh", "nebelstadt",
	"saffroncourt", "rainmarket", "windplain", "riverweave", "terracielo",
	"sunpatch", "kigalights", "cedarbay", "seoulsteps", "dunegarden",
}

type MapSpawn struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

var mapSpawns = map[string]MapSpawn{
	DefaultMapID:   {X: .52, Y: .61},
	"waldruh":      {X: .52, Y: .54},
	"nebelstadt":   {X: .50, Y: .55},
	"saffroncourt": {X: .50, Y: .72},
	"rainmarket":   {X: .12, Y: .58},
	"windplain":    {X: .50, Y: .76},
	"riverweave":   {X: .15, Y: .77},
	"terracielo":   {X: .16, Y: .83},
	"sunpatch":     {X: .50, Y: .83},
	"kigalights":   {X: .13, Y: .80},
	"cedarbay":     {X: .16, Y: .81},
	"seoulsteps":   {X: .17, Y: .84},
	"dunegarden":   {X: .50, Y: .83},
}

func validMapID(id string) bool { _, ok := mapSpawns[id]; return ok }

type worldMemory struct {
	mapID            string
	interiorID       string
	interiorPosition MapSpawn
	positions        map[string]MapSpawn
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
	player        Player
	conn          *websocket.Conn
	send          chan []byte
	cancel        context.CancelFunc
	memory        *worldMemory
	messageWindow time.Time
	messageCount  int
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
}

func NewWorld(maxPlayers int, origins []string) *World {
	ctx, cancel := context.WithCancel(context.Background())
	w := &World{clients: map[string]*worldClient{}, messages: map[string][]ChatMessage{}, memories: map[string]*worldMemory{}, cancel: cancel, done: make(chan struct{}), maxPlayers: maxPlayers, originPatterns: origins}
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

func (w *World) ServeHTTP(rw http.ResponseWriter, r *http.Request, player Player) {
	// App checks exact scheme/origin; the library repeats origin verification.
	conn, err := websocket.Accept(rw, r, &websocket.AcceptOptions{OriginPatterns: w.originPatterns, CompressionMode: websocket.CompressionDisabled})
	if err != nil {
		return
	}
	conn.SetReadLimit(4096)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	defer conn.CloseNow()
	client := &worldClient{player: player, conn: conn, send: make(chan []byte, 32), cancel: cancel}
	w.mu.Lock()
	now := time.Now()
	w.pruneMemoriesLocked(now)
	previous := w.clients[player.ID]
	memory := w.memories[player.ID]
	mapID := r.URL.Query().Get("mapId")
	if mapID == "" {
		mapID = DefaultMapID
		if memory != nil {
			mapID = memory.mapID
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
		memory = &worldMemory{mapID: mapID, positions: map[string]MapSpawn{}, lastSeen: now, lastMove: now, movementCredit: .025}
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
	position, exists := memory.positions[mapID]
	if !exists {
		position = mapSpawns[mapID]
	}
	client.player.MapID, client.player.X, client.player.Y = mapID, position.X, position.Y
	client.player.InteriorID = memory.interiorID
	if memory.interiorID != "" {
		client.player.X, client.player.Y = memory.interiorPosition.X, memory.interiorPosition.Y
	}
	memory.mapID, memory.lastSeen = mapID, now
	memory.positions[mapID] = position
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
	}()
	writerDone := make(chan struct{})
	go func() {
		defer close(writerDone)
		defer cancel()
		ping := time.NewTicker(25 * time.Second)
		defer ping.Stop()
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
			Type       string   `json:"type"`
			X          *float64 `json:"x"`
			Y          *float64 `json:"y"`
			Message    string   `json:"message"`
			MapID      string   `json:"mapId"`
			InteriorID string   `json:"interiorId"`
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
			if err := w.moveInLocation(client, message.MapID, message.InteriorID, *message.X, *message.Y, now); err != "" {
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

func (w *World) move(client *worldClient, x, y float64, now time.Time) {
	_ = w.moveInMap(client, "", x, y, now)
}

func (w *World) moveInMap(client *worldClient, mapID string, x, y float64, now time.Time) string {
	return w.moveInLocation(client, mapID, "", x, y, now)
}

func (w *World) moveInLocation(client *worldClient, mapID, interiorID string, x, y float64, now time.Time) string {
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
	memory := client.memory
	memory.movementCredit = math.Min(.08, memory.movementCredit+math.Max(0, now.Sub(memory.lastMove).Seconds())*.24)
	memory.lastMove = now
	dx, dy := x-client.player.X, y-client.player.Y
	distance := math.Hypot(dx, dy)
	if distance == 0 {
		return ""
	}
	step := math.Min(distance, memory.movementCredit)
	client.player.X += dx / distance * step
	client.player.Y += dy / distance * step
	memory.movementCredit -= step
	position := MapSpawn{X: client.player.X, Y: client.player.Y}
	if interiorID == "" {
		memory.positions[client.player.MapID] = position
	} else {
		memory.interiorPosition = position
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
	w.broadcastLocked(mapID, map[string]any{"type": "players", "mapId": mapID, "players": w.playersLocked(mapID)})
}

func (w *World) enqueueMapLocked(client *worldClient, kind string) {
	mapID := client.player.MapID
	message, _ := json.Marshal(map[string]any{"type": kind, "selfId": client.player.ID, "mapId": mapID, "interiorId": client.player.InteriorID, "spawn": MapSpawn{X: client.player.X, Y: client.player.Y}, "players": w.playersLocked(mapID), "messages": w.messages[mapID]})
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
	position, exists := client.memory.positions[mapID]
	if !exists {
		position = mapSpawns[mapID]
	}
	client.player.MapID, client.player.X, client.player.Y = mapID, position.X, position.Y
	client.player.InteriorID, client.memory.interiorID = "", ""
	client.memory.mapID, client.memory.lastSeen = mapID, now
	client.memory.positions[mapID] = position
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
