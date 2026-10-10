package main

import (
	"encoding/json"
	"testing"
	"time"
)

func TestSharedWorldClockAdvancesAtOneRateForEveryPlayer(t *testing.T) {
	epoch := time.Date(2026, 10, 10, 0, 0, 0, 0, time.UTC)
	for _, test := range []struct {
		seconds int
		hour    float64
		day     int
		period  string
	}{{0, 7, 1, "day"}, {360, 19, 1, "night"}, {720, 7, 2, "day"}, {1080, 19, 2, "night"}} {
		clock := sharedClockAt(epoch, epoch.Add(time.Duration(test.seconds)*time.Second))
		if clock.Hour != test.hour || clock.Day != test.day || clock.Period != test.period {
			t.Fatalf("clock after %ds: %+v", test.seconds, clock)
		}
	}
}

func TestInnSleepKeepsLearningAndLightsOnlyCompletedPromises(t *testing.T) {
	app := storyTestApp(t)
	token, player := createSession(t, app, "Ada")
	placeStoryPlayer(app, player, DefaultMapID, mapSpawns[DefaultMapID])
	if r := request(app, "POST", "/api/story/sleep", token, map[string]string{"id": "outdoors"}); r.Code != 409 {
		t.Fatalf("rest outside owned room: %d", r.Code)
	}
	app.world.mu.Lock()
	app.world.clients[player.ID].player.InteriorID = "inn"
	app.world.mu.Unlock()
	if r := request(app, "POST", "/api/story/sleep", token, map[string]string{"id": "rest-without-promise"}); r.Code != 200 {
		t.Fatal(r.Body.String())
	}
	p := storyProgress(t, app, token)
	if p.Story.Day != 2 || p.Story.LanternStreak != 0 || p.Story.Promise.Day != 2 {
		t.Fatal("an unfinished promise should allow a fresh day without penalty")
	}
	ex := app.curriculum.Exercises["a1-arrival-exercise-6"]
	for _, id := range []string{"first", "first", "second", "third"} {
		input := AttemptInput{ID: id, ExerciseID: ex.ID, ItemID: ex.ItemID, Answer: ex.Answer, Mode: ex.Mode}
		if r := request(app, "POST", "/api/attempt", token, input); r.Code != 200 {
			t.Fatal(r.Body.String())
		}
	}
	before := storyProgress(t, app, token)
	if before.Story.Promise.CorrectAnswers != 3 || !before.Story.Promise.Completed {
		t.Fatalf("promise receipts duplicated or missing %+v", before.Story.Promise)
	}
	body := map[string]string{"id": "rest-after-promise"}
	request(app, "POST", "/api/story/sleep", token, body)
	second := request(app, "POST", "/api/story/sleep", token, body)
	var result struct {
		Progress  Progress `json:"progress"`
		Duplicate bool     `json:"duplicate"`
	}
	_ = json.Unmarshal(second.Body.Bytes(), &result)
	if !result.Duplicate || result.Progress.Story.Day != 3 || result.Progress.Story.LanternStreak != 1 || result.Progress.Story.Promise.CorrectAnswers != 0 {
		t.Fatalf("rest duplicated a day or promise %+v", result)
	}
	if result.Progress.XP != before.XP || result.Progress.Attempts != before.Attempts {
		t.Fatal("rest changed language evidence")
	}
}
