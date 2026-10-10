package main

import (
	"context"
	"encoding/json"
	"testing"
)

func TestGreetingRepliesAreGradedNearOttoAndPracticeCannotSkipThem(t *testing.T) {
	app := storyTestApp(t)
	token, player := createSession(t, app, "Ada")
	rule, _ := storyRule("a1-arrival")
	ex := app.curriculum.Exercises[rule.ReplyExerciseIDs[0]]
	body := AttemptInput{ID: "remote-greeting", QuestID: rule.QuestID, ItemID: ex.ItemID, ExerciseID: ex.ID, Answer: ex.Answer, Mode: "recognition", SceneAttempt: true}
	if r := request(app, "POST", "/api/attempt", token, body); r.Code != 409 {
		t.Fatalf("remote greeting: %d %s", r.Code, r.Body.String())
	}
	placeStoryPlayer(app, player, rule.MapID, rule.NPC)
	body.ID = "practice-greeting"
	body.SceneAttempt = false
	if r := request(app, "POST", "/api/attempt", token, body); r.Code != 200 {
		t.Fatal(r.Body.String())
	}
	if storyProgress(t, app, token).Story.Flags["reply:"+ex.ID] {
		t.Fatal("practice bypassed the scene reply")
	}
	body.ID = "wrong-greeting"
	body.SceneAttempt = true
	body.Answer = "Gute Nacht!"
	wrong := request(app, "POST", "/api/attempt", token, body)
	if wrong.Code != 200 {
		t.Fatal(wrong.Body.String())
	}
	var result struct{ Correct bool }
	_ = json.Unmarshal(wrong.Body.Bytes(), &result)
	if result.Correct {
		t.Fatal("wrong greeting accepted")
	}
	before := storyProgress(t, app, token)
	if !before.Story.Flags["reply-help:"+ex.ID] || before.Story.Flags["reply:"+ex.ID] {
		t.Fatal("greeting correction did not persist assistance")
	}
	body.ID = "corrected-greeting"
	body.Answer = ex.Answer
	for i := 0; i < 2; i++ {
		if r := request(app, "POST", "/api/attempt", token, body); r.Code != 200 {
			t.Fatal(r.Body.String())
		}
	}
	after := storyProgress(t, app, token)
	if !after.Story.Flags["reply:"+ex.ID] || after.Story.Nodes[rule.QuestID] == "gate" {
		t.Fatal("reply either failed or bypassed physical investigation")
	}
	stats := after.Items[ex.ItemID].ModeStats["recognition"]
	if stats.Attempts != 3 || stats.UnaidedSuccesses != 1 {
		t.Fatalf("assisted/idempotent reply stats %+v", stats)
	}
}

func TestArchiveItemRequirementsAndLedgerPublicationAreServerChecked(t *testing.T) {
	for _, test := range []struct {
		quest, choice, item string
		allowed             bool
	}{
		{"a1-station", "protect", "", false}, {"a1-station", "protect", "lamplighter-key", true},
		{"a1-station", "show-ledger", "", false}, {"a1-station", "show-ledger", "inspector-ledger", true},
		{"b1-council", "publish-ledger", "", false}, {"b1-council", "publish-ledger", "inspector-ledger", true},
	} {
		t.Run(test.quest+"/"+test.choice+"/"+test.item, func(t *testing.T) {
			app := storyTestApp(t)
			token, player := createSession(t, app, "Ada")
			rule, _ := storyRule(test.quest)
			_, _, _, err := app.store.Mutate(context.Background(), tokenHash(token), "seed-choice", json.RawMessage(`{}`), func(a *Account) (Receipt, error) {
				for _, id := range storyQuestOrder {
					if id == test.quest {
						break
					}
					a.Progress.CompletedQuestIDs = append(a.Progress.CompletedQuestIDs, id)
				}
				a.Progress.Story.Nodes[test.quest] = "choice"
				if test.item != "" {
					giveStoryItem(&a.Progress.Story, test.item)
				}
				return Receipt{}, nil
			})
			if err != nil {
				t.Fatal(err)
			}
			placeStoryPlayer(app, player, rule.MapID, rule.NPC)
			r := request(app, "POST", "/api/story/transition", token, StoryTransitionInput{ID: "item-choice", QuestID: test.quest, NodeID: "choice", ChoiceID: test.choice})
			want := 409
			if test.allowed {
				want = 200
			}
			if r.Code != want {
				t.Fatalf("choice: %d want %d %s", r.Code, want, r.Body.String())
			}
			p := storyProgress(t, app, token)
			if test.allowed && test.quest == "a1-station" && !contains(p.Story.Inventory, "station-register") {
				t.Fatal("archive did not yield its register")
			}
			if test.allowed && test.quest == "b1-council" && !p.Story.Flags["ledger-published"] {
				t.Fatal("ledger was not published")
			}
			if !test.allowed && contains(p.CompletedQuestIDs, test.quest) {
				t.Fatal("rejected item choice completed quest")
			}
		})
	}
}

func TestActMilestonesSurviveAndLanguageMistakesNeverAdvanceTheBell(t *testing.T) {
	quiet, loud := newProgress(), newProgress()
	for _, id := range storyQuestOrder[:6] {
		applyStoryChoice(&quiet.Story, id, "protect")
		quiet.CompletedQuestIDs = append(quiet.CompletedQuestIDs, id)
		ensureStory(&quiet)
		applyStoryChoice(&loud.Story, id, "report")
		loud.CompletedQuestIDs = append(loud.CompletedQuestIDs, id)
		ensureStory(&loud)
	}
	if quiet.Story.Bell != 2 || loud.Story.Bell != 3 {
		t.Fatalf("Act I choice washed out: quiet %d reported %d", quiet.Story.Bell, loud.Story.Bell)
	}
	for i := 0; i < 10; i++ {
		recordStoryGateFailure(&quiet.Story, "a2-broken-clock")
	}
	if quiet.Story.BellWarnings != 0 || quiet.Story.GateFailures["a2-broken-clock"] != 3 {
		t.Fatal("language mistakes must be bounded practice evidence, never story pressure")
	}
	for _, id := range storyQuestOrder[6:17] {
		applyStoryChoice(&quiet.Story, id, "restore")
		quiet.CompletedQuestIDs = append(quiet.CompletedQuestIDs, id)
		ensureStory(&quiet)
		if quiet.Story.Bell > 6 {
			t.Fatal("early final bell")
		}
	}
}
