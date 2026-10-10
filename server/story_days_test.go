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
	now := time.Date(2026, 10, 10, 12, 0, 0, 0, time.UTC)
	app.now = func() time.Time { return now }
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
	if r := request(app, "POST", "/api/story/save", token, map[string]string{"slot": "1", "name": "Before today's recall"}); r.Code != 200 {
		t.Fatal(r.Body.String())
	}
	for _, exerciseID := range []string{"a1-arrival-exercise-6", "a1-cafe-exercise-6", "a1-lost-parcel-exercise-2"} {
		ex := app.curriculum.Exercises[exerciseID]
		input := AttemptInput{ID: exerciseID, ExerciseID: ex.ID, ItemID: ex.ItemID, Answer: ex.Answer, Mode: ex.Mode}
		if r := request(app, "POST", "/api/attempt", token, input); r.Code != 200 {
			t.Fatal(r.Body.String())
		}
		request(app, "POST", "/api/attempt", token, input)
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
	if !result.Duplicate || result.Progress.Story.Day != 3 || result.Progress.Story.LanternStreak != 1 || result.Progress.Story.Promise.CorrectAnswers != 3 || result.Progress.Story.Promise.Date != "2026-10-10" {
		t.Fatalf("rest duplicated a day or promise %+v", result)
	}
	if result.Progress.XP != before.XP || result.Progress.Attempts != before.Attempts {
		t.Fatal("rest changed language evidence")
	}
	for _, id := range []string{"farm-sleep-1", "farm-sleep-2"} {
		request(app, "POST", "/api/story/sleep", token, map[string]string{"id": id})
	}
	p = storyProgress(t, app, token)
	if p.Story.LanternStreak != 1 || !p.Story.Promise.Completed || len(p.DailyPromises) != 1 {
		t.Fatal("virtual sleep created calendar learning evidence")
	}
	if r := request(app, "POST", "/api/story/load", token, map[string]string{"id": "rewind-before-recall", "slot": "1"}); r.Code != 200 {
		t.Fatal(r.Body.String())
	} else {
		var loaded struct {
			Progress Progress `json:"progress"`
		}
		if err := json.Unmarshal(r.Body.Bytes(), &loaded); err != nil {
			t.Fatal(err)
		}
		if loaded.Progress.Story.LanternStreak != 1 || !loaded.Progress.Story.Promise.Completed || loaded.Progress.Story.Promise.CorrectAnswers != 3 {
			t.Fatal("save-load response rewound calendar learning evidence")
		}
	}
	now = now.AddDate(0, 0, 1)
	p = storyProgress(t, app, token)
	if p.Story.Promise.Date != "2026-10-11" || p.Story.Promise.CorrectAnswers != 0 || p.Story.Promise.Completed || p.Story.LanternStreak != 1 {
		t.Fatalf("calendar rollover did not start a new promise: %+v", p.Story)
	}
}

func TestAssistedHTTPAttemptsNeverCompleteCalendarPromise(t *testing.T) {
	app := storyTestApp(t)
	app.now = func() time.Time { return time.Date(2026, 10, 10, 12, 0, 0, 0, time.UTC) }
	token, _ := createSession(t, app, "Ada")
	for _, exerciseID := range []string{"a1-arrival-exercise-6", "a1-cafe-exercise-6", "a1-lost-parcel-exercise-2"} {
		ex := app.curriculum.Exercises[exerciseID]
		input := AttemptInput{ID: exerciseID, ExerciseID: ex.ID, ItemID: ex.ItemID, Answer: ex.Answer, Mode: ex.Mode, Hinted: true}
		if r := request(app, "POST", "/api/attempt", token, input); r.Code != 200 {
			t.Fatal(r.Body.String())
		}
	}
	p := storyProgress(t, app, token)
	if p.Story.Promise.Completed || p.Story.Promise.CorrectAnswers != 0 || p.Story.LanternStreak != 0 || len(p.DailyPromises) != 0 {
		t.Fatal("assisted answers invented independent calendar evidence")
	}
}

func TestDailyPromiseRequiresDistinctUnaidedRecallAndConsecutiveCalendarDays(t *testing.T) {
	p := newProgress()
	now := time.Date(2026, 10, 10, 23, 59, 0, 0, time.UTC)
	recordPromiseAttempt(&p, true, true, now, "helped:production")
	recordPromiseAttempt(&p, false, false, now, "wrong:production")
	for i := 0; i < 5; i++ {
		recordPromiseAttempt(&p, true, false, now, "same:production")
	}
	if p.Story.Promise.CorrectAnswers != 1 || p.Story.LanternStreak != 0 {
		t.Fatal("hints, errors or repeated recall advanced the daily promise")
	}
	recordPromiseAttempt(&p, true, false, now, "second:recognition")
	recordPromiseAttempt(&p, true, false, now, "third:listening")
	if !p.Story.Promise.Completed || p.Story.LanternStreak != 1 {
		t.Fatal("three unaided connections did not light the calendar lantern")
	}
	now = now.Add(2 * time.Minute)
	for _, item := range []string{"same:production", "second:recognition", "third:listening"} {
		recordPromiseAttempt(&p, true, false, now, item)
	}
	if p.Story.LanternStreak != 2 || p.Story.Promise.Date != "2026-10-11" {
		t.Fatal("consecutive real calendar days did not extend the streak")
	}
	refreshDailyPromise(&p, now.AddDate(0, 0, 2))
	if p.Story.LanternStreak != 0 {
		t.Fatal("missed calendar day retained a consecutive streak")
	}
	for _, item := range []string{"same:production", "second:recognition", "third:listening"} {
		recordPromiseAttempt(&p, true, false, now.AddDate(0, 0, 2), item)
	}
	if p.Story.LanternStreak != 1 {
		t.Fatal("a fresh completion did not relight the lantern")
	}
}

func TestDailyPromiseLedgerSurvivesNarrativeRewindAndPersistence(t *testing.T) {
	p := newProgress()
	now := time.Date(2026, 10, 10, 12, 0, 0, 0, time.UTC)
	for _, item := range []string{"first", "second", "third"} {
		recordPromiseAttempt(&p, true, false, now, item)
	}
	data, err := json.Marshal(p)
	if err != nil {
		t.Fatal(err)
	}
	var loaded Progress
	if err := json.Unmarshal(data, &loaded); err != nil {
		t.Fatal(err)
	}
	// A story save can rewind fiction, never the account's dated evidence.
	loaded.Story = StoryState{Day: 1, LanternStreak: 999, Promise: DailyPromise{Completed: true, CorrectAnswers: 999}}
	ensureProgress(&loaded)
	refreshDailyPromise(&loaded, now)
	if loaded.Story.LanternStreak != 1 || loaded.Story.Promise.CorrectAnswers != 3 || !loaded.Story.Promise.Completed {
		t.Fatal("narrative rewind changed persisted daily evidence")
	}
	legacy := newProgress()
	legacy.Story.LanternStreak = 999
	legacy.Story.Promise.Completed = true
	refreshDailyPromise(&legacy, now)
	if legacy.Story.LanternStreak != 0 || legacy.Story.Promise.Completed {
		t.Fatal("undated legacy progress invented calendar evidence")
	}
}
