package main

import (
	"context"
	"encoding/json"
	"glotworld/server/internal/world"
	"path/filepath"
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
	if r.Code != 200 || json.Unmarshal(r.Body.Bytes(), &response) != nil || response.Seed != identity.Seed || response.DayLengthSeconds != world.DaySeconds {
		t.Fatal("HTTP clock omitted the durable simulation contract")
	}
}

func TestWorldClockReconstructsAfterDowntimeAndClampsFutureEpoch(t *testing.T) {
	epoch := time.Date(2026, 10, 11, 7, 0, 0, 0, time.UTC)
	clock := world.ClockAt(epoch, epoch.Add(37*world.DaySeconds*time.Second+90*time.Second))
	if clock.Day != 38 || clock.Hour != 10 || clock.ElapsedSeconds != 37*world.DaySeconds+90 {
		t.Fatalf("lost downtime: %+v", clock)
	}
	future := world.ClockAt(epoch, epoch.Add(-time.Hour))
	if future.Day != 1 || future.Hour != 7 || future.ElapsedSeconds != 0 {
		t.Fatalf("negative simulation time: %+v", future)
	}
}
