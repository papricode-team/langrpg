package main

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"
)

func TestWorldIdentitySurvivesJSONAndApplicationRestart(t *testing.T) {
	path := filepath.Join(t.TempDir(), "state.json")
	store, err := NewJSONStore(path)
	if err != nil {
		t.Fatal(err)
	}
	app := NewApp(store, testCurriculum(), nil, 10)
	token, _ := createSession(t, app, "Clock Ada")
	identity := store.WorldIdentity()
	account, err := store.Get(context.Background(), tokenHash(token))
	if err != nil {
		t.Fatal(err)
	}
	before := app.world.Clock()
	app.Close()
	restored, err := NewJSONStore(path)
	if err != nil {
		t.Fatal(err)
	}
	second := NewApp(restored, testCurriculum(), nil, 10)
	defer second.Close()
	if restored.WorldIdentity() != identity {
		t.Fatal("restart changed epoch or seed")
	}
	after := second.world.Clock()
	if after.Seed != before.Seed || after.Epoch != before.Epoch || after.ElapsedSeconds < before.ElapsedSeconds {
		t.Fatalf("restart rewound the world: %+v -> %+v", before, after)
	}
	loaded, err := restored.Get(context.Background(), tokenHash(token))
	if err != nil {
		t.Fatal(err)
	}
	a, _ := json.Marshal(account)
	b, _ := json.Marshal(loaded)
	if string(a) != string(b) {
		t.Fatal("clock initialization changed account progress")
	}
	var response SharedWorldClock
	r := request(second, "GET", "/api/world-clock", "", nil)
	if r.Code != 200 || json.Unmarshal(r.Body.Bytes(), &response) != nil || response.Seed != identity.Seed || response.DayLengthSeconds != worldDaySeconds {
		t.Fatal("HTTP clock omitted the durable simulation contract")
	}
}

func TestLegacyWorldIdentityMigrationAndCorruption(t *testing.T) {
	path := filepath.Join(t.TempDir(), "state.json")
	legacy := `{"version":1,"accounts":{},"sessions":{},"actions":{}}`
	if err := os.WriteFile(path, []byte(legacy), 0600); err != nil {
		t.Fatal(err)
	}
	store, err := NewJSONStore(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := store.WorldIdentity().validate(); err != nil {
		t.Fatal(err)
	}
	first := store.WorldIdentity()
	reopened, err := NewJSONStore(path)
	if err != nil || reopened.WorldIdentity() != first {
		t.Fatal("migration did not persist exactly once", err)
	}
	store.state.World.Seed = "broken"
	if err := store.save(); err != nil {
		t.Fatal(err)
	}
	if _, err := NewJSONStore(path); err == nil {
		t.Fatal("corrupt world was silently replaced with a fresh timeline")
	}
}

func TestWorldClockReconstructsAfterDowntimeAndClampsFutureEpoch(t *testing.T) {
	epoch := time.Date(2026, 10, 11, 7, 0, 0, 0, time.UTC)
	clock := sharedClockAt(epoch, epoch.Add(37*worldDaySeconds*time.Second+90*time.Second))
	if clock.Day != 38 || clock.Hour != 10 || clock.ElapsedSeconds != 37*worldDaySeconds+90 {
		t.Fatalf("lost downtime: %+v", clock)
	}
	future := sharedClockAt(epoch, epoch.Add(-time.Hour))
	if future.Day != 1 || future.Hour != 7 || future.ElapsedSeconds != 0 {
		t.Fatalf("negative simulation time: %+v", future)
	}
}

func TestPostgresServersShareOneDurableWorldIdentity(t *testing.T) {
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("set TEST_DATABASE_URL to a disposable PostgreSQL database")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	var stores [3]*PGStore
	var failures [3]error
	var group sync.WaitGroup
	// Initialize schema once; concurrent identity INSERTs exercise the unique key.
	first, err := NewPGStore(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	identity := first.WorldIdentity()
	first.Close()
	for index := range stores {
		group.Add(1)
		go func(index int) { defer group.Done(); stores[index], failures[index] = NewPGStore(ctx, url) }(index)
	}
	group.Wait()
	for index, store := range stores {
		if failures[index] != nil {
			t.Error(failures[index])
			continue
		}
		defer store.Close()
		if store.WorldIdentity() != identity {
			t.Error("servers disagree about world identity")
		}
	}
}
