package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"glotworld/server/internal/world"
	"io"
	"net/http"
	"sort"
	"strings"
	"sync"
	"time"
)

const (
	maxWorldOpsBytes = 256 * 1024
	maxWorkerWait    = 45 * time.Second
	worldLeaseTTL    = 30 * time.Second
)

// WorldLease marks an object one admin is editing. Leases live in memory: the
// game runs as a single server instance.
type WorldLease struct {
	MapID     string    `json:"map"`
	ObjectID  string    `json:"id"`
	AdminID   string    `json:"adminId"`
	AdminName string    `json:"adminName"`
	Expires   time.Time `json:"expires"`
}

type worldLeases struct {
	mu    sync.Mutex
	items map[string]WorldLease
	now   func() time.Time
}

func newWorldLeases(now func() time.Time) *worldLeases {
	return &worldLeases{items: map[string]WorldLease{}, now: now}
}

func leaseKey(mapID, objectID string) string { return mapID + "/" + objectID }

func (l *worldLeases) pruneLocked(now time.Time) {
	for key, lease := range l.items {
		if !now.Before(lease.Expires) {
			delete(l.items, key)
		}
	}
}

// acquire takes or renews a lease. It returns the current holder when another admin has it.
func (l *worldLeases) acquire(mapID, objectID, adminID, adminName string) (WorldLease, bool) {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := l.now()
	l.pruneLocked(now)
	key := leaseKey(mapID, objectID)
	if current, held := l.items[key]; held && current.AdminID != adminID {
		return current, false
	}
	lease := WorldLease{MapID: mapID, ObjectID: objectID, AdminID: adminID, AdminName: adminName, Expires: now.Add(worldLeaseTTL)}
	l.items[key] = lease
	return lease, true
}

func (l *worldLeases) release(mapID, objectID, adminID string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	key := leaseKey(mapID, objectID)
	if current, held := l.items[key]; held && current.AdminID == adminID {
		delete(l.items, key)
		return true
	}
	return false
}

// releaseAdmin drops every lease an admin holds, for example on disconnect.
func (l *worldLeases) releaseAdmin(adminID string) []string {
	l.mu.Lock()
	defer l.mu.Unlock()
	maps := map[string]bool{}
	for key, lease := range l.items {
		if lease.AdminID == adminID {
			delete(l.items, key)
			maps[lease.MapID] = true
		}
	}
	result := make([]string, 0, len(maps))
	for mapID := range maps {
		result = append(result, mapID)
	}
	sort.Strings(result)
	return result
}

// holder reports another admin's lease on an object.
func (l *worldLeases) holder(mapID, objectID, adminID string) (WorldLease, bool) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.pruneLocked(l.now())
	lease, held := l.items[leaseKey(mapID, objectID)]
	return lease, held && lease.AdminID != adminID
}

func (l *worldLeases) list(mapID string) []WorldLease {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.pruneLocked(l.now())
	result := []WorldLease{}
	for _, lease := range l.items {
		if mapID == "" || lease.MapID == mapID {
			result = append(result, lease)
		}
	}
	sort.Slice(result, func(i, j int) bool {
		return leaseKey(result[i].MapID, result[i].ObjectID) < leaseKey(result[j].MapID, result[j].ObjectID)
	})
	return result
}

func adminDisplayName(account Account) string {
	if name := strings.TrimSpace(account.Player.Name); name != "" {
		return name
	}
	if at := strings.IndexByte(account.Email, '@'); at > 0 {
		return account.Email[:at]
	}
	return "Another admin"
}

func (a *App) editorReady(w http.ResponseWriter) bool {
	if !a.editorAvailable(w) {
		return false
	}
	if a.editing.worker == nil {
		writeError(w, 503, "the world editor is unavailable on this server")
		return false
	}
	return true
}

type worldOpTarget struct {
	Kind string `json:"kind"`
	Map  string `json:"map"`
	ID   string `json:"id"`
	Item struct {
		ID string `json:"id"`
	} `json:"item"`
}

func (t worldOpTarget) objectID() string {
	if t.Kind == "terrain" {
		return "terrain"
	}
	if t.Kind == "place" || t.Kind == "placeAnimal" {
		return t.Item.ID
	}
	return t.ID
}

// applyWorldOps validates, stores and streams a batch of edit operations.
func (a *App) applyWorldOps(w http.ResponseWriter, r *http.Request) {
	account, ok := a.requireAdmin(w, r)
	if !ok || !a.editorReady(w) {
		return
	}
	if !strings.HasPrefix(strings.ToLower(r.Header.Get("Content-Type")), "application/json") {
		apiFailure(w, &APIError{415, "use Content-Type: application/json"})
		return
	}
	data, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxWorldOpsBytes))
	if err != nil {
		apiFailure(w, &APIError{413, "send fewer edits at a time"})
		return
	}
	var body struct {
		Ops json.RawMessage `json:"ops"`
	}
	var targets []worldOpTarget
	if json.Unmarshal(data, &body) != nil || json.Unmarshal(body.Ops, &targets) != nil || len(targets) == 0 {
		apiFailure(w, worldProblems(400, "invalid", "Send a list of edits."))
		return
	}
	for _, target := range targets {
		if holder, held := a.editLeases.holder(target.Map, target.objectID(), account.Player.ID); held {
			apiFailure(w, worldProblems(409, "locked", holder.AdminName+" is editing this object right now. Try again when they are done.", target.objectID()))
			return
		}
	}
	editing := a.editing
	// Edits are quick. Wait briefly for another admin's edit instead of failing.
	deadline := time.Now().Add(5 * time.Second)
	for !editing.writes.TryLock() {
		if time.Now().After(deadline) {
			apiFailure(w, worldProblems(409, "stale", "Another change is still being saved. Try again in a moment."))
			return
		}
		select {
		case <-r.Context().Done():
			return
		case <-time.After(25 * time.Millisecond):
		}
	}
	defer editing.writes.Unlock()
	ctx, cancel := context.WithTimeout(r.Context(), maxWorkerWait)
	defer cancel()
	var previous, next *WorldContent
	var result *workerResponse
	for attempt := 0; ; attempt++ {
		editing.mu.RLock()
		previous = editing.current
		editing.mu.RUnlock()
		var err error
		result, err = editing.worker.apply(ctx, previous, body.Ops)
		if err != nil {
			apiFailure(w, err)
			return
		}
		if !result.OK {
			status := 422
			if len(result.Problems) > 0 && (result.Problems[0].Code == "missing" || result.Problems[0].Code == "locked") {
				status = 409
			}
			apiFailure(w, &WorldProblemError{status, result.Problems})
			return
		}
		next = result.Bundle
		if next == nil {
			apiFailure(w, errors.New("world edit worker returned no publication"))
			return
		}
		if next.Diagnostics == nil {
			next.Diagnostics = []string{}
		}
		if err := validateWorldContent(next); err != nil {
			apiFailure(w, err)
			return
		}
		// A room cannot disappear while players are inside it.
		for mapID, before := range previous.WorldMaps.Maps {
			after := next.WorldMaps.Maps[mapID]
			for room := range before.Entrances {
				if _, kept := after.Entrances[room]; kept {
					continue
				}
				if count := a.world.InteriorOccupancy(mapID, room); count > 0 {
					people := "1 player is"
					if count > 1 {
						people = fmt.Sprintf("%d players are", count)
					}
					apiFailure(w, worldProblems(409, "occupied", fmt.Sprintf("%s inside the %s. Wait until they leave.", people, roomLabel(room)), before.Entrances[room].OwnerID))
					return
				}
			}
		}
		if _, ok := a.requireAdmin(w, r); !ok {
			return
		}
		if err := editing.publish(ctx, previous, next, worldChange{actor: account.Email, source: adminSource(r), ops: body.Ops}); err != nil {
			if errors.Is(err, ErrConflict) {
				// Memory fell behind the stored publication. Edits are absolute, so
				// adopt the stored world and apply them again once.
				if attempt == 0 && a.refreshWorldContentLocked(ctx) == nil {
					continue
				}
				apiFailure(w, worldProblems(409, "stale", "The world changed while saving. Reload and try again."))
				return
			}
			apiFailure(w, err)
			return
		}
		break
	}
	next.Story = previous.Story
	editing.mu.Lock()
	editing.current = next
	editing.mu.Unlock()
	editing.worker.committed(result.Key, next.Revision)
	a.publishRegistry(next.WorldMaps, result.Applied, next.Revision)
	w.Header().Set("ETag", `"`+next.Revision+`"`)
	warnings := result.Warnings
	if warnings == nil {
		warnings = []WorldProblem{}
	}
	writeJSON(w, 200, map[string]any{"revision": next.Revision, "from": previous.ContentVersion, "contentVersion": next.ContentVersion, "applied": result.Applied, "warnings": warnings})
}

func roomLabel(kind string) string {
	if kind == "cafe" {
		return "café"
	}
	return kind
}

// editWorldLock takes, renews or releases an object lease.
func (a *App) editWorldLock(w http.ResponseWriter, r *http.Request) {
	account, ok := a.requireAdmin(w, r)
	if !ok || !a.editorAvailable(w) {
		return
	}
	var body struct {
		Map    string `json:"map"`
		ID     string `json:"id"`
		Action string `json:"action"`
	}
	if err := decodeJSON(w, r, &body); err != nil {
		apiFailure(w, err)
		return
	}
	if !validMapID(body.Map) || !world.EditableObjectID.MatchString(body.ID) {
		apiFailure(w, worldProblems(400, "invalid", "Choose an object in one of the towns."))
		return
	}
	switch body.Action {
	case "acquire":
		if holder, granted := a.editLeases.acquire(body.Map, body.ID, account.Player.ID, adminDisplayName(account)); !granted {
			apiFailure(w, worldProblems(409, "locked", holder.AdminName+" is editing this object right now.", body.ID))
			return
		}
	case "release":
		a.editLeases.release(body.Map, body.ID, account.Player.ID)
	default:
		apiFailure(w, worldProblems(400, "invalid", "Choose acquire or release."))
		return
	}
	locks := a.editLeases.list(body.Map)
	a.world.PublishLocks(body.Map, locks)
	writeJSON(w, 200, map[string]any{"locks": locks})
}

// worldEditStatus lets the admin area follow publications and locks.
func (a *App) worldEditStatus(w http.ResponseWriter, r *http.Request) {
	if _, ok := a.requireAdmin(w, r); !ok || !a.editorAvailable(w) {
		return
	}
	a.editing.mu.RLock()
	current := a.editing.current
	a.editing.mu.RUnlock()
	if a.editing.worker != nil {
		a.editing.worker.warmSoon(current)
	}
	writeJSON(w, 200, map[string]any{"revision": current.Revision, "contentVersion": current.ContentVersion, "locks": a.editLeases.list(r.URL.Query().Get("map"))})
}
