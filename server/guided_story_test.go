package main

import "testing"

func guidedGateAttempt(app *App, questID, attemptID string) AttemptInput {
	rule, _ := storyRule(questID)
	exercise := app.curriculum.Exercises[rule.GateExerciseID]
	return AttemptInput{ID: attemptID, QuestID: questID, ItemID: exercise.ItemID, ExerciseID: exercise.ID,
		Answer: exercise.Answer, Mode: "recognition", Hinted: true, SceneAttempt: true, GuidedChoice: true}
}

func TestGuidedOpeningReplyCompletesStoryWithoutProductionEvidence(t *testing.T) {
	app := storyTestApp(t)
	token, player := createSession(t, app, "Ada")
	rule, _ := storyRule("a1-arrival")
	investigateStory(t, app, token, player, rule.QuestID, "opening-")
	if r := request(app, "POST", "/api/story/transition", token, StoryTransitionInput{ID: "opening-intro", QuestID: rule.QuestID, NodeID: "intro"}); r.Code != 200 {
		t.Fatal(r.Body.String())
	}
	before := storyProgress(t, app, token)
	answer := guidedGateAttempt(app, rule.QuestID, "opening-wrong")
	answer.Answer = "Gute Nacht!"
	wrong := decodeAttempt(t, request(app, "POST", "/api/attempt", token, answer))
	if wrong.Correct || wrong.XPAdded != 0 || len(wrong.Progress.Story.GateAttempts[rule.QuestID]) != 0 {
		t.Fatal("wrong guided reply supplied story proof or XP")
	}
	gate := StoryTransitionInput{ID: "opening-gate", QuestID: rule.QuestID, NodeID: "gate", AttemptID: answer.ID}
	if r := request(app, "POST", "/api/story/transition", token, gate); r.Code != 409 {
		t.Fatalf("wrong guided proof advanced story: %d %s", r.Code, r.Body.String())
	}
	answer = guidedGateAttempt(app, rule.QuestID, "opening-correct")
	correct := decodeAttempt(t, request(app, "POST", "/api/attempt", token, answer))
	duplicate := decodeAttempt(t, request(app, "POST", "/api/attempt", token, answer))
	if !correct.Correct || !duplicate.Duplicate || correct.XPAdded != 0 || duplicate.Progress.Attempts != correct.Progress.Attempts {
		t.Fatalf("guided reply was ungraded, rewarded as recall or repeated: %+v", correct)
	}
	p := duplicate.Progress
	memory := p.Items[answer.ItemID]
	stats := memory.ModeStats["recognition"]
	if stats.Attempts != 2 || stats.Correct != 1 || stats.UnaidedSuccesses != 0 || memory.ModeStats["production"].Attempts != 0 || len(memory.Cards) != 0 {
		t.Fatalf("guided replies invented independent German evidence: %+v", memory)
	}
	if memory.PracticeDueAt["recognition"].IsZero() || !memory.PracticeDueAt["production"].IsZero() {
		t.Fatalf("guided replies scheduled production practice: %+v", memory.PracticeDueAt)
	}
	if evidence := p.RecentAttempts[answer.ID]; evidence.Mode != "recognition" || !evidence.Hinted {
		t.Fatalf("guided reply saved incorrect modality: %+v", evidence)
	}
	if p.Story.GateFailures[rule.QuestID] != 0 || p.Story.Bell != before.Story.Bell || p.Story.Flags["reply:"+answer.ExerciseID] {
		t.Fatal("guided reply added writing pressure or greeting evidence")
	}
	gate.AttemptID = answer.ID
	if r := request(app, "POST", "/api/story/transition", token, gate); r.Code != 200 {
		t.Fatalf("correct guided proof did not advance story: %d %s", r.Code, r.Body.String())
	}
	choice := StoryTransitionInput{ID: "opening-choice", QuestID: rule.QuestID, NodeID: "choice", ChoiceID: "protect"}
	if r := request(app, "POST", "/api/story/transition", token, choice); r.Code != 200 {
		t.Fatal(r.Body.String())
	}
	if p := storyProgress(t, app, token); !contains(p.CompletedQuestIDs, rule.QuestID) || p.XP != before.XP+app.curriculum.Quests[rule.QuestID].Reward {
		t.Fatal("choice-based opening did not complete and reward its quest")
	}
}

func TestGuidedStoryGateRequiresTheCurrentNearbySceneAndFreshProof(t *testing.T) {
	app := storyTestApp(t)
	token, player := createSession(t, app, "Ada")
	rule, _ := storyRule("a1-arrival")
	answer := guidedGateAttempt(app, rule.QuestID, "before-scene")
	if r := request(app, "POST", "/api/attempt", token, answer); r.Code != 409 {
		t.Fatalf("guided reply before opening request: %d %s", r.Code, r.Body.String())
	}
	investigateStory(t, app, token, player, rule.QuestID, "guided-current-")
	if r := request(app, "POST", "/api/story/save", token, map[string]string{"slot": "1", "name": "Before asking"}); r.Code != 200 {
		t.Fatal(r.Body.String())
	}
	intro := StoryTransitionInput{ID: "guided-open", QuestID: rule.QuestID, NodeID: "intro"}
	if r := request(app, "POST", "/api/story/transition", token, intro); r.Code != 200 {
		t.Fatal(r.Body.String())
	}
	placeStoryPlayer(app, player, rule.MapID, MapSpawn{X: 0, Y: 0})
	answer.ID = "guided-remote"
	if r := request(app, "POST", "/api/attempt", token, answer); r.Code != 409 {
		t.Fatalf("guided reply away from character: %d %s", r.Code, r.Body.String())
	}
	placeStoryPlayer(app, player, rule.MapID, rule.NPC)
	answer.ID = "guided-old"
	decodeAttempt(t, request(app, "POST", "/api/attempt", token, answer))
	if r := request(app, "POST", "/api/story/load", token, map[string]string{"slot": "1"}); r.Code != 200 {
		t.Fatal(r.Body.String())
	}
	intro.ID = "guided-reopen"
	if r := request(app, "POST", "/api/story/transition", token, intro); r.Code != 200 {
		t.Fatal(r.Body.String())
	}
	gate := StoryTransitionInput{ID: "guided-gate", QuestID: rule.QuestID, NodeID: "gate", AttemptID: answer.ID}
	if r := request(app, "POST", "/api/story/transition", token, gate); r.Code != 409 {
		t.Fatalf("rewound scene reused a guided proof: %d %s", r.Code, r.Body.String())
	}
	answer.ID = "guided-fresh"
	decodeAttempt(t, request(app, "POST", "/api/attempt", token, answer))
	gate.AttemptID = answer.ID
	if r := request(app, "POST", "/api/story/transition", token, gate); r.Code != 200 {
		t.Fatalf("fresh guided scene proof: %d %s", r.Code, r.Body.String())
	}
}

func TestGuidedChoiceOnlyAdaptsSupportedA1StoryGates(t *testing.T) {
	app := storyTestApp(t)
	token, _ := createSession(t, app, "Ada")
	for _, test := range []struct {
		name string
		edit func(*AttemptInput)
	}{
		{"no assistance", func(input *AttemptInput) { input.Hinted = false }},
		{"production mode", func(input *AttemptInput) { input.Mode = "production" }},
		{"ordinary practice", func(input *AttemptInput) { input.SceneAttempt = false }},
		{"missing marker", func(input *AttemptInput) { input.GuidedChoice = false }},
		{"different item", func(input *AttemptInput) { input.ItemID = "invented" }},
		{"greeting", func(input *AttemptInput) {
			rule, _ := storyRule(input.QuestID)
			exercise := app.curriculum.Exercises[rule.ReplyExerciseIDs[0]]
			input.ExerciseID, input.ItemID, input.Answer = exercise.ID, exercise.ItemID, exercise.Answer
		}},
		{"later level", func(input *AttemptInput) { *input = guidedGateAttempt(app, "a2-apartment", input.ID) }},
		{"activity context", func(input *AttemptInput) { input.ActivityID, input.RunID = "cafe", "guided-run" }},
	} {
		t.Run(test.name, func(t *testing.T) {
			input := guidedGateAttempt(app, "a1-arrival", "guided-invalid")
			test.edit(&input)
			if r := request(app, "POST", "/api/attempt", token, input); r.Code != 400 {
				t.Fatalf("invalid guided choice: %d %s", r.Code, r.Body.String())
			}
		})
	}
	for _, questID := range storyQuestOrder[:6] {
		if !app.isGuidedStoryGate(guidedGateAttempt(app, questID, "guided-valid")) {
			t.Errorf("A1 scene cannot offer its guided reply: %s", questID)
		}
	}
	if p := storyProgress(t, app, token); p.Attempts != 0 || len(p.Story.GateAttempts) != 0 {
		t.Fatal("rejected guided choices recorded progress")
	}
}
