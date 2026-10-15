package main

import (
	"context"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/coder/websocket"
)

// countingStore counts session reads so tests can bound per-message storage work.
type countingStore struct {
	Store
	gets atomic.Int64
}

func (s *countingStore) Get(ctx context.Context, hash string) (Account, error) {
	s.gets.Add(1)
	return s.Store.Get(ctx, hash)
}

func TestWorldMovesReuseTheAccessTickInsteadOfReadingStorage(t *testing.T) {
	base, err := NewJSONStore("")
	if err != nil {
		t.Fatal(err)
	}
	store := &countingStore{Store: base}
	app := NewApp(store, testCurriculum(), nil, 10)
	app.billing = testCreem(nil)
	t.Cleanup(app.Close)
	clock := trialTestClock(app)
	token, _ := createSession(t, app, "Cached Ada")
	// Leave one second of guest allowance; play is credited only under a lease.
	if _, err := base.UpdateAccount(context.Background(), tokenHash(token), func(account *Account) error {
		account.Access.PlayedNanoseconds = int64(guestPlayLimit - time.Second)
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(app.Handler())
	t.Cleanup(server.Close)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	conn, _, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(server.URL, "http")+"/api/world?token="+token, nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = conn.CloseNow() })
	readWorld(t, ctx, conn, "welcome")
	before := store.gets.Load()
	for i := 0; i < 30; i++ {
		writeWorld(t, ctx, conn, map[string]any{"type": "move", "x": 0.5, "y": 0.5})
	}
	// Movement is accepted asynchronously; a later error reply proves every
	// earlier message was processed.
	writeWorld(t, ctx, conn, map[string]any{"type": "move", "x": -1, "y": 0})
	readWorld(t, ctx, conn, "error")
	if reads := store.gets.Load() - before; reads > 1 {
		t.Fatalf("31 movement messages caused %d storage reads; want at most one per access tick", reads)
	}

	// Time-based limits are still checked on every message: an ended guest
	// allowance closes the socket immediately, without waiting for a tick.
	clock.Add(int64(2 * time.Second))
	writeWorld(t, ctx, conn, map[string]any{"type": "move", "x": 0.5, "y": 0.5})
	for {
		if _, _, err = conn.Read(ctx); err != nil {
			break
		}
	}
	if websocket.CloseStatus(err) != accessRequiredStatus {
		t.Fatalf("an ended allowance must close the socket on the next message: %v", err)
	}
}

func TestWorldSocketClosesWithinOneTickAfterSessionDeletion(t *testing.T) {
	app := testApp(t)
	token, _ := createSession(t, app, "Deleted Ada")
	server := httptest.NewServer(app.Handler())
	t.Cleanup(server.Close)
	ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
	defer cancel()
	conn, _, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(server.URL, "http")+"/api/world?token="+token, nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = conn.CloseNow() })
	readWorld(t, ctx, conn, "welcome")
	// Delete the session in storage only, as another server instance would.
	if err := app.store.DeleteSession(ctx, tokenHash(token)); err != nil {
		t.Fatal(err)
	}
	started := time.Now()
	for {
		if _, _, err = conn.Read(ctx); err != nil {
			break
		}
	}
	if websocket.CloseStatus(err) != accessRequiredStatus || time.Since(started) > 7*time.Second {
		t.Fatalf("a revoked session must be closed within one access tick: %v after %s", err, time.Since(started))
	}
}
