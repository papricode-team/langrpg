package main

import (
	"encoding/json"
	"reflect"
	"sync"
	"testing"
)

func TestSilentQuestsFinishWithoutListeningEvidence(t *testing.T) {
	curriculum, err := loadCurriculum()
	if err != nil {
		t.Fatal(err)
	}
	for _, quest := range curriculum.Quests {
		t.Run(quest.ID, func(t *testing.T) {
			app := testApp(t)
			app.curriculum = curriculum
			// Silent-mode practice keeps its learning semantics. Story discoveries
			// now require the physical investigation and conversation graph.
			quest.ID = "practice-" + quest.ID
			app.curriculum.Quests = map[string]Quest{quest.ID: quest}
			token, _ := createSession(t, app, "Ada")
			silent := map[string]any{"questId": quest.ID, "silentMode": true}
			if w := request(app, "POST", "/api/quest/complete", token, silent); w.Code != 409 {
				t.Fatalf("unanswered silent quest: %d %s", w.Code, w.Body.String())
			}
			var before Progress
			for _, exercise := range curriculum.Exercises {
				if !contains(quest.RequiredItemIDs, exercise.ItemID) || exercise.Mode == "listening" {
					continue
				}
				before = courseAttempt(t, app, token, exercise.ID, exercise.ID, true).Progress
			}
			if w := request(app, "POST", "/api/quest/complete", token, map[string]string{"questId": quest.ID}); w.Code != 409 {
				t.Fatalf("normal mode no longer requires listening: %d %s", w.Code, w.Body.String())
			}
			for index, body := range []any{silent, silent, map[string]string{"questId": quest.ID}, silent} {
				w := request(app, "POST", "/api/quest/complete", token, body)
				if w.Code != 200 {
					t.Fatalf("completion %d: %d %s", index, w.Code, w.Body.String())
				}
				var result struct {
					XPAdded  int      `json:"xpAdded"`
					Progress Progress `json:"progress"`
				}
				if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
					t.Fatal(err)
				}
				expectedReward := 0
				if index == 0 {
					expectedReward = quest.Reward
				}
				expectedCompleted := []string{quest.ID}
				if result.XPAdded != expectedReward || result.Progress.XP != before.XP+quest.Reward || !reflect.DeepEqual(result.Progress.CompletedQuestIDs, expectedCompleted) {
					t.Fatalf("quest did not finish with one reward: %+v", result)
				}
				if result.Progress.Attempts != before.Attempts || !reflect.DeepEqual(result.Progress.Items, before.Items) || !reflect.DeepEqual(result.Progress.ExerciseStats, before.ExerciseStats) {
					t.Fatal("completion invented exercise or listening evidence")
				}
			}
		})
	}
}

func TestQuestRewardOnceAcrossConcurrentModes(t *testing.T) {
	app := testApp(t)
	token, _ := createSession(t, app, "Ada")
	decodeAttempt(t, request(app, "POST", "/api/attempt", token, attemptFor("one")))
	before := courseAttempt(t, app, token, "two", "exercise-two", true).Progress
	var wg sync.WaitGroup
	for index := range 12 {
		wg.Go(func() {
			w := request(app, "POST", "/api/quest/complete", token, map[string]any{"questId": "quest", "silentMode": index%2 == 0})
			if w.Code != 200 {
				t.Errorf("concurrent completion: %d %s", w.Code, w.Body.String())
			}
		})
	}
	wg.Wait()
	w := request(app, "GET", "/api/progress", token, nil)
	var progress Progress
	if err := json.Unmarshal(w.Body.Bytes(), &progress); err != nil {
		t.Fatal(err)
	}
	if progress.XP != before.XP+40 || !reflect.DeepEqual(progress.CompletedQuestIDs, []string{"quest"}) {
		t.Fatalf("concurrent modes awarded more than once: %+v", progress)
	}
}
