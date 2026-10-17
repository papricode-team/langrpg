package main

import (
	"context"
	"strings"
	"testing"
)

func TestPrologueSupportedReplyVisibleAtItsGate(t *testing.T) {
	app := contentTestApp(t)
	token, _ := createSession(t, app, "Ada")
	id := testContentID(t, app, "sentence", "context:beginner:a0-ticket-exercise-1:0")
	if r := request(app, "GET", "/api/content/sentences?ids="+id, token, nil); r.Code != 200 || strings.Contains(r.Body.String(), "Bitte.") {
		t.Fatalf("premature answer: %d %s", r.Code, r.Body.String())
	}
	_, err := app.store.UpdateAccount(context.Background(), tokenHash(token), func(account *Account) error {
		account.Progress.Story.Nodes["a0-ticket"] = "gate"
		account.Progress.Revision++
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if r := request(app, "GET", "/api/content/sentences?ids="+id, token, nil); r.Code != 200 || !strings.Contains(r.Body.String(), "Bitte.") {
		t.Fatalf("supported reply: %d %s", r.Code, r.Body.String())
	}
}

func TestPrologueOptionalChain(t *testing.T) {
	if err := requireQuestOrder("a1-arrival", nil); err != nil {
		t.Fatal(err)
	}
	if err := requireQuestOrder("a0-ticket", nil); err != nil {
		t.Fatal(err)
	}
	if err := requireQuestOrder("a0-name", nil); err == nil {
		t.Fatal("name scene skipped the ticket")
	}
	if err := requireQuestOrder("a0-name", []string{"a0-ticket"}); err != nil {
		t.Fatal(err)
	}
}

func TestPrologueNamePracticeIsLocalSupportedAndIdempotent(t *testing.T) {
	app := storyTestApp(t)
	token, player := createSession(t, app, "Ada")
	seedStoryProgress(t, app, token, []string{"a0-ticket"})
	rule, ok := storyRule("a0-name")
	if !ok {
		t.Fatal("missing name scene")
	}
	inspect := map[string]string{"id": "name-evidence", "questId": "a0-name", "objectId": rule.Objects[0].ID}
	placeStoryPlayer(app, player, rule.MapID, rule.NPC)
	if r := request(app, "POST", "/api/story/inspect", token, inspect); r.Code != 409 {
		t.Fatalf("outside train: %d %s", r.Code, r.Body.String())
	}
	player.InteriorID = rule.InteriorID
	placeStoryPlayer(app, player, rule.MapID, rule.NPC)
	if r := request(app, "POST", "/api/story/inspect", token, inspect); r.Code != 200 {
		t.Fatalf("inspect: %d %s", r.Code, r.Body.String())
	}
	for _, input := range []StoryTransitionInput{
		{ID: "name-intro", QuestID: "a0-name", NodeID: "intro"},
		{ID: "name-practice", QuestID: "a0-name", NodeID: "gate", NamePractice: true},
		{ID: "name-choice", QuestID: "a0-name", NodeID: "choice", ChoiceID: "continue"},
	} {
		r := request(app, "POST", "/api/story/transition", token, input)
		if r.Code != 200 {
			t.Fatalf("%s: %d %s", input.NodeID, r.Code, r.Body.String())
		}
	}
	before := storyProgress(t, app, token)
	if before.XP != 20 || len(before.RecentAttempts) != 0 || !before.Story.Flags["prologue-name-practice"] {
		t.Fatalf("name practice changed learning evidence: %+v", before)
	}
	r := request(app, "POST", "/api/story/transition", token, StoryTransitionInput{ID: "name-choice", QuestID: "a0-name", NodeID: "choice", ChoiceID: "continue"})
	if r.Code != 200 || storyProgress(t, app, token).XP != before.XP {
		t.Fatal("duplicate name reward", r.Body.String())
	}
}

func TestProloguePhrasePairsKeepIntakeAndSupportedEvidence(t *testing.T) {
	app := storyTestApp(t)
	token, _ := createSession(t, app, "Ada")
	restoreVocabulary(t, app, token) // Initialize new-account intake before seeding story completion.
	seedStoryProgress(t, app, token, []string{"a0-ticket", "a0-name", "a0-wagen", "a0-tee", "a0-wo", "a0-langsam"})
	exercise := app.curriculum.Exercises["a0-langsam-exercise-2"]
	if exercise.Mode != "recognition" || len(exerciseWords(exercise)) < 2 {
		t.Fatal("phrase must remain an authored recognition exercise", exercise)
	}
	input := AttemptInput{ID: "phrase-locked", MiniGameID: "lantern-pairs", ExerciseID: exercise.ID, ItemID: exercise.ItemID, Mode: "recognition", Answer: exercise.Answer, Hinted: true}
	if result := request(app, "POST", "/api/attempt", token, input); result.Code != 409 {
		t.Fatalf("phrase bypassed intake: %d %s", result.Code, result.Body.String())
	}
	restoreVocabulary(t, app, token, exerciseWords(exercise)...)
	input.ID, input.Answer = "phrase-wrong", "Einen Tee, bitte."
	wrong := decodeAttempt(t, request(app, "POST", "/api/attempt", token, input))
	if wrong.Correct {
		t.Fatal("mismatched meaning counted as correct")
	}
	input.ID, input.Answer = "phrase-right", exercise.Answer
	right := decodeAttempt(t, request(app, "POST", "/api/attempt", token, input))
	if !right.Correct {
		t.Fatal("authored phrase did not grade", right)
	}
	for _, word := range right.Progress.Words {
		for _, stats := range word.ModeStats {
			if stats.UnaidedSuccesses != 0 {
				t.Fatal("supported phrase matching invented unaided vocabulary recall")
			}
		}
	}
}

func TestPrologueFindingDoorRequiresReplyAndInspection(t *testing.T) {
	app := storyTestApp(t)
	token, player := createSession(t, app, "Ada")
	seedStoryProgress(t, app, token, []string{"a0-ticket", "a0-name", "a0-wagen", "a0-tee"})
	rule, _ := storyRule("a0-wo")
	player.InteriorID = rule.InteriorID
	placeStoryPlayer(app, player, rule.MapID, rule.NPC)
	inspect := map[string]string{"id": "wc-too-early", "questId": "a0-wo", "objectId": "prologue-wo"}
	if r := request(app, "POST", "/api/story/inspect", token, inspect); r.Code != 409 {
		t.Fatalf("door found before asking: %d %s", r.Code, r.Body.String())
	}
	if r := request(app, "POST", "/api/story/transition", token, StoryTransitionInput{ID: "wc-intro", QuestID: "a0-wo", NodeID: "intro"}); r.Code != 200 {
		t.Fatalf("intro required future evidence: %d %s", r.Code, r.Body.String())
	}
	// Isolate the finding step; graded-gate proofs are tested by the shared story tests.
	_, err := app.store.UpdateAccount(context.Background(), tokenHash(token), func(account *Account) error {
		account.Progress.Story.Nodes["a0-wo"] = "choice"
		account.Progress.Revision++
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	finish := StoryTransitionInput{ID: "wc-missing", QuestID: "a0-wo", NodeID: "choice", ChoiceID: "continue"}
	if r := request(app, "POST", "/api/story/transition", token, finish); r.Code != 409 {
		t.Fatalf("completed without finding door: %d %s", r.Code, r.Body.String())
	}
	inspect["id"] = "wc-found"
	if r := request(app, "POST", "/api/story/inspect", token, inspect); r.Code != 200 {
		t.Fatalf("door inspection: %d %s", r.Code, r.Body.String())
	}
	finish.ID = "wc-finish"
	if r := request(app, "POST", "/api/story/transition", token, finish); r.Code != 200 {
		t.Fatalf("found door did not finish: %d %s", r.Code, r.Body.String())
	}
}

func TestPrologueGraphPreservesAuthoredInteriorHotspot(t *testing.T) {
	app := contentTestApp(t)
	token, _ := createSession(t, app, "Ada")
	id := testContentID(t, app, "graph", "a0-ticket")
	r := request(app, "GET", "/api/content/graphs/"+id, token, nil)
	if r.Code != 200 || !strings.Contains(r.Body.String(), `"worldId":"interior:prologue-ticket"`) {
		t.Fatalf("interior hotspot lost in public graph: %d %s", r.Code, r.Body.String())
	}
}
