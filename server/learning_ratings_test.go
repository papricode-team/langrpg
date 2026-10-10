package main

import (
	"testing"
	"time"
)

func TestRecallRatingsAndResponseTimePreserveLearningAuthority(t *testing.T) {
	now := time.Date(2026, 10, 10, 12, 0, 0, 0, time.UTC)
	progress := newProgress()
	for _, rating := range []string{"hard", "good", "easy"} {
		if _, err := recordRatedAttempt(&progress, rating, "production", true, false, now, "production", rating, 2500); err != nil {
			t.Fatal(err)
		}
	}
	if !progress.Items["hard"].DueAt.Before(progress.Items["good"].DueAt) || !progress.Items["good"].DueAt.Before(progress.Items["easy"].DueAt) {
		t.Fatal("Hard/Good/Easy did not affect recall intervals")
	}
	if progress.Items["easy"].ModeStats["production"].TimedAttempts != 1 || progress.Items["easy"].ModeStats["production"].ResponseTimeMs != 2500 {
		t.Fatal("response time not recorded")
	}
	if _, err := recordRatedAttempt(&progress, "wrong", "production", false, false, now, "production", "easy", 1500); err != nil {
		t.Fatal(err)
	}
	if !progress.Items["wrong"].DueAt.Before(now.Add(11*time.Minute)) || progress.Items["wrong"].ModeStats["production"].UnaidedSuccesses != 0 {
		t.Fatal("client rating overrode an incorrect answer")
	}
	if _, err := recordRatedAttempt(&progress, "hinted", "production", true, true, now, "production", "easy", 1500); err != nil {
		t.Fatal(err)
	}
	if len(progress.Items["hinted"].Cards) != 0 || progress.Items["hinted"].ModeStats["production"].TimedAttempts != 0 {
		t.Fatal("supported practice invented independent performance")
	}
}

func TestSlowEstablishedRecallConservativelyCapsEasyAndLeavesOtherRatingsAlone(t *testing.T) {
	now := time.Date(2026, 10, 10, 12, 0, 0, 0, time.UTC)
	p := newProgress()
	baseline := ModeStats{TimedAttempts: 3, ResponseTimeMs: 15000}
	for _, id := range []string{"slow", "good", "fast", "interrupted", "hard", "unestablished"} {
		stats := baseline
		if id == "unestablished" {
			stats.TimedAttempts = 2
		}
		p.Items[id] = Memory{ModeStats: map[string]ModeStats{"production": stats}}
	}
	for _, test := range []struct {
		id, rating string
		ms         int
	}{{"slow", "easy", 45000}, {"good", "good", 45000}, {"fast", "easy", 4000}, {"interrupted", "easy", 120000}, {"hard", "hard", 45000}, {"unestablished", "easy", 45000}} {
		if _, err := recordRatedAttempt(&p, test.id, "production", true, false, now, "production", test.rating, test.ms); err != nil {
			t.Fatal(err)
		}
	}
	if p.Items["slow"].DueAt != p.Items["good"].DueAt {
		t.Fatal("slow established Easy was not capped to Good")
	}
	for _, id := range []string{"fast", "interrupted", "unestablished"} {
		if !p.Items["slow"].DueAt.Before(p.Items[id].DueAt) {
			t.Fatalf("timing changed %s without reliable slowing evidence", id)
		}
	}
	if !p.Items["hard"].DueAt.Before(p.Items["slow"].DueAt) {
		t.Fatal("timing promoted a self-reported Hard")
	}
}
