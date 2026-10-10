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
