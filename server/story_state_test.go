package main

import (
	"context"
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
)

func storyTestApp(t *testing.T) *App {
	t.Helper()
	curriculum, err := loadCurriculum()
	if err != nil {
		t.Fatal(err)
	}
	store, err := NewJSONStore("")
	if err != nil {
		t.Fatal(err)
	}
	app := NewApp(store, curriculum, []string{"http://localhost:5173"}, 10)
	t.Cleanup(app.Close)
	return app
}

func storyProgress(t *testing.T, app *App, token string) Progress {
	t.Helper()
	var p Progress
	r := request(app, "GET", "/api/progress", token, nil)
	if r.Code != 200 || json.Unmarshal(r.Body.Bytes(), &p) != nil {
		t.Fatalf("progress: %d %s", r.Code, r.Body.String())
	}
	return p
}

func placeStoryPlayer(app *App, player Player, mapID string, target MapSpawn) {
	app.world.mu.Lock()
	defer app.world.mu.Unlock()
	player.MapID, player.X, player.Y = mapID, target.X, target.Y
	app.world.clients[player.ID] = &worldClient{player: player, send: make(chan []byte, 256), cancel: func() {}}
}

func seedStoryProgress(t *testing.T, app *App, token string, ids []string) {
	t.Helper()
	_, _, _, err := app.store.Mutate(context.Background(), tokenHash(token), "test-story-seed", json.RawMessage(`{}`), func(a *Account) (Receipt, error) {
		a.Progress.CompletedQuestIDs = append([]string{}, ids...)
		return Receipt{}, nil
	})
	if err != nil {
		t.Fatal(err)
	}
}

func investigateStory(t *testing.T, app *App, token string, player Player, questID, prefix string) {
	t.Helper()
	rule, ok := storyRule(questID)
	if !ok {
		t.Fatal("missing rule", questID)
	}
	placeStoryPlayer(app, player, rule.MapID, rule.NPC)
	for _, id := range rule.ReplyExerciseIDs {
		ex := app.curriculum.Exercises[id]
		body := AttemptInput{ID: prefix + "greeting", QuestID: questID, ItemID: ex.ItemID, ExerciseID: ex.ID, Answer: ex.Answer, Mode: "recognition", SceneAttempt: true}
		if r := request(app, "POST", "/api/attempt", token, body); r.Code != 200 {
			t.Fatalf("greeting: %d %s", r.Code, r.Body.String())
		}
	}
	for _, object := range rule.Objects {
		placeStoryPlayer(app, player, rule.MapID, MapSpawn{object.X, object.Y})
		r := request(app, "POST", "/api/story/inspect", token, map[string]string{"id": prefix + object.ID, "questId": questID, "objectId": object.ID})
		if r.Code != 200 {
			t.Fatalf("inspection: %d %s", r.Code, r.Body.String())
		}
	}
	placeStoryPlayer(app, player, rule.MapID, rule.NPC)
}

func finishStoryQuest(t *testing.T, app *App, token string, player Player, questID, prefix, choice string) *httptest.ResponseRecorder {
	t.Helper()
	investigateStory(t, app, token, player, questID, prefix)
	for _, node := range []string{"intro", "gate", "choice"} {
		input := StoryTransitionInput{ID: prefix + node, QuestID: questID, NodeID: node}
		if node == "gate" {
			rule, _ := storyRule(questID)
			ex := app.curriculum.Exercises[rule.GateExerciseID]
			input.AttemptID = prefix + "answer"
			answer := AttemptInput{ID: input.AttemptID, QuestID: questID, ItemID: ex.ItemID, ExerciseID: ex.ID, Answer: ex.Answer, Mode: "production", SceneAttempt: true}
			if r := request(app, "POST", "/api/attempt", token, answer); r.Code != 200 {
				t.Fatalf("gate attempt: %d %s", r.Code, r.Body.String())
			}
		}
		if node == "choice" {
			input.ChoiceID = choice
		}
		r := request(app, "POST", "/api/story/transition", token, input)
		if r.Code != 200 {
			t.Fatalf("%s: %d %s", node, r.Code, r.Body.String())
		}
		if node == "choice" {
			return r
		}
	}
	t.Fatal("unreachable")
	return nil
}

func TestStoryRulesShareTheCanonicalQuestAndProductionGates(t *testing.T) {
	app := storyTestApp(t)
	for _, id := range storyQuestOrder {
		rule, ok := storyRule(id)
		if !ok || len(rule.Objects) < 1 || len(rule.ChoiceIDs) < 2 || !validMapID(rule.MapID) {
			t.Fatalf("incomplete graph rule %+v", rule)
		}
		ex, ok := app.curriculum.Exercises[rule.GateExerciseID]
		if !ok || ex.Mode != "production" || !contains(app.curriculum.Quests[id].RequiredItemIDs, ex.ItemID) {
			t.Fatalf("ungraded scene gate %+v", rule)
		}
	}
}

func TestSevenCorrectDrillsCannotBypassTheStoryInvestigation(t *testing.T) {
	app := storyTestApp(t)
	token, _ := createSession(t, app, "Ada")
	quest := app.curriculum.Quests["a1-arrival"]
	for _, ex := range app.curriculum.Exercises {
		if contains(quest.RequiredItemIDs, ex.ItemID) {
			input := AttemptInput{ID: ex.ID, QuestID: quest.ID, ItemID: ex.ItemID, ExerciseID: ex.ID, Answer: ex.Answer, Mode: ex.Mode}
			if r := request(app, "POST", "/api/attempt", token, input); r.Code != 200 {
				t.Fatal(r.Body.String())
			}
		}
	}
	before := storyProgress(t, app, token)
	for _, silent := range []bool{false, true} {
		if r := request(app, "POST", "/api/quest/complete", token, map[string]any{"questId": quest.ID, "silentMode": silent}); r.Code != 409 {
			t.Fatalf("drills bypassed world: %d %s", r.Code, r.Body.String())
		}
	}
	after := storyProgress(t, app, token)
	if after.XP != before.XP || len(after.CompletedQuestIDs) != 0 || after.Story.Nodes[quest.ID] == "complete" {
		t.Fatal("practice advanced the investigation")
	}
}

func TestStoryInvestigationRejectsRemoteObjectsAndSkippedClues(t *testing.T) {
	app := storyTestApp(t)
	token, player := createSession(t, app, "Ada")
	rule, _ := storyRule("a1-arrival")
	placeStoryPlayer(app, player, rule.MapID, mapSpawns[rule.MapID])
	body := map[string]string{"id": "remote", "questId": "a1-arrival", "objectId": rule.Objects[0].ID}
	if r := request(app, "POST", "/api/story/inspect", token, body); r.Code != 409 {
		t.Fatalf("remote proof accepted: %d %s", r.Code, r.Body.String())
	}
	placeStoryPlayer(app, player, rule.MapID, rule.NPC)
	if r := request(app, "POST", "/api/story/transition", token, StoryTransitionInput{ID: "skip", QuestID: "a1-arrival", NodeID: "intro"}); r.Code != 409 {
		t.Fatalf("evidence skipped: %d", r.Code)
	}
	if r := request(app, "POST", "/api/story/transition", token, StoryTransitionInput{ID: "future", QuestID: "a1-cafe", NodeID: "intro"}); r.Code != 409 {
		t.Fatalf("quest order skipped: %d", r.Code)
	}
	if len(storyProgress(t, app, token).CompletedQuestIDs) != 0 {
		t.Fatal("rejected actions advanced the story")
	}
}

func TestStoryGateNeedsCorrectOwnedSceneProofAndCompletionRewardsOnce(t *testing.T) {
	app := storyTestApp(t)
	token, player := createSession(t, app, "Ada")
	investigateStory(t, app, token, player, "a1-arrival", "proof-")
	if r := request(app, "POST", "/api/story/transition", token, StoryTransitionInput{ID: "intro", QuestID: "a1-arrival", NodeID: "intro"}); r.Code != 200 {
		t.Fatal(r.Body.String())
	}
	gate := StoryTransitionInput{ID: "gate", QuestID: "a1-arrival", NodeID: "gate", AttemptID: "invented"}
	if r := request(app, "POST", "/api/story/transition", token, gate); r.Code != 409 {
		t.Fatalf("invented proof status %d", r.Code)
	}
	rule, _ := storyRule("a1-arrival")
	ex := app.curriculum.Exercises[rule.GateExerciseID]
	wrong := AttemptInput{ID: "wrong", QuestID: "a1-arrival", ItemID: ex.ItemID, ExerciseID: ex.ID, Answer: "wrong", Mode: "production", SceneAttempt: true}
	request(app, "POST", "/api/attempt", token, wrong)
	gate.AttemptID = "wrong"
	if r := request(app, "POST", "/api/story/transition", token, gate); r.Code != 409 {
		t.Fatalf("incorrect proof status %d", r.Code)
	}
	other, otherPlayer := createSession(t, app, "Mira")
	investigateStory(t, app, other, otherPlayer, "a1-arrival", "other-")
	if r := request(app, "POST", "/api/story/transition", other, StoryTransitionInput{ID: "other-intro", QuestID: "a1-arrival", NodeID: "intro"}); r.Code != 200 {
		t.Fatal(r.Body.String())
	}
	wrong.ID, wrong.Answer = "owned-elsewhere", ex.Answer
	if r := request(app, "POST", "/api/attempt", other, wrong); r.Code != 200 {
		t.Fatal(r.Body.String())
	}
	gate.AttemptID = "owned-elsewhere"
	if r := request(app, "POST", "/api/story/transition", token, gate); r.Code != 409 {
		t.Fatalf("foreign proof status %d", r.Code)
	}
	wrong.ID = "correct"
	request(app, "POST", "/api/attempt", token, wrong)
	gate.AttemptID = "correct"
	if r := request(app, "POST", "/api/story/transition", token, gate); r.Code != 200 {
		t.Fatal(r.Body.String())
	}
	choice := StoryTransitionInput{ID: "choice", QuestID: "a1-arrival", NodeID: "choice", ChoiceID: "protect"}
	first := request(app, "POST", "/api/story/transition", token, choice)
	second := request(app, "POST", "/api/story/transition", token, choice)
	if first.Code != 200 || second.Code != 200 {
		t.Fatalf("completion %d %d", first.Code, second.Code)
	}
	p := storyProgress(t, app, token)
	if !contains(p.CompletedQuestIDs, "a1-arrival") || !contains(p.Story.Inventory, "lamplighter-key") || p.Story.Reputation["lamplighters"] != 1 {
		t.Fatalf("story effects %+v", p.Story)
	}
	// The narrative gate replaces the mandatory seven-card queue.
	if p.Items["a1-arrival-item-1"].ModeStats["recognition"].Attempts != 1 {
		t.Fatal("story invented drill evidence")
	}
	var result struct {
		XPAdded   int  `json:"xpAdded"`
		Duplicate bool `json:"duplicate"`
	}
	_ = json.Unmarshal(second.Body.Bytes(), &result)
	if !result.Duplicate || result.XPAdded != 0 {
		t.Fatalf("duplicate reward %+v", result)
	}
}

func TestStorySaveRestoresGraphWithoutLosingLearningOrFarmingRewards(t *testing.T) {
	app := storyTestApp(t)
	token, player := createSession(t, app, "Ada")
	if r := request(app, "POST", "/api/story/save", token, map[string]string{"slot": "1", "name": "Before the platform"}); r.Code != 200 {
		t.Fatal(r.Body.String())
	}
	finishStoryQuest(t, app, token, player, "a1-arrival", "first-", "protect")
	before := storyProgress(t, app, token)
	if r := request(app, "POST", "/api/story/load", token, map[string]string{"slot": "1"}); r.Code != 200 {
		t.Fatal(r.Body.String())
	}
	loaded := storyProgress(t, app, token)
	if loaded.XP != before.XP || loaded.Attempts != before.Attempts || len(loaded.CompletedQuestIDs) != 0 || contains(loaded.Story.Inventory, "lamplighter-key") {
		t.Fatalf("save restore corrupted learning or snapshot %+v", loaded)
	}
	last := finishStoryQuest(t, app, token, player, "a1-arrival", "second-", "report")
	var result struct {
		XPAdded int `json:"xpAdded"`
	}
	_ = json.Unmarshal(last.Body.Bytes(), &result)
	if result.XPAdded != 0 {
		t.Fatalf("restored quest farmed %d XP", result.XPAdded)
	}
	if r := request(app, "POST", "/api/story/load", token, map[string]string{"slot": "1"}); r.Code != 200 {
		t.Fatal(r.Body.String())
	}
	if p := storyProgress(t, app, token); len(p.Story.Choices) != 0 || len(p.Story.Inspections) != 0 {
		t.Fatal("active graph mutated the saved snapshot")
	}
}

func TestOnlyTheCurrentOnsiteSceneAnswerCanAdvanceItsGate(t *testing.T) {
	app := storyTestApp(t)
	token, player := createSession(t, app, "Ada")
	rule, _ := storyRule("a1-arrival")
	ex := app.curriculum.Exercises[rule.GateExerciseID]
	answer := AttemptInput{ID: "practice-proof", QuestID: rule.QuestID, ItemID: ex.ItemID, ExerciseID: ex.ID, Answer: ex.Answer, Mode: "production"}
	if r := request(app, "POST", "/api/attempt", token, answer); r.Code != 200 {
		t.Fatal(r.Body.String())
	}
	answer.ID, answer.SceneAttempt = "pre-scene-proof", true
	if r := request(app, "POST", "/api/attempt", token, answer); r.Code != 409 {
		t.Fatalf("answer before current scene: %d", r.Code)
	}
	investigateStory(t, app, token, player, rule.QuestID, "current-")
	if r := request(app, "POST", "/api/story/save", token, map[string]string{"slot": "1", "name": "Before asking"}); r.Code != 200 {
		t.Fatal(r.Body.String())
	}
	intro := StoryTransitionInput{ID: "open-request", QuestID: rule.QuestID, NodeID: "intro"}
	if r := request(app, "POST", "/api/story/transition", token, intro); r.Code != 200 {
		t.Fatal(r.Body.String())
	}
	gate := StoryTransitionInput{ID: "gate", QuestID: rule.QuestID, NodeID: "gate", AttemptID: "practice-proof"}
	if r := request(app, "POST", "/api/story/transition", token, gate); r.Code != 409 {
		t.Fatalf("practice receipt gained story authority: %d", r.Code)
	}
	placeStoryPlayer(app, player, rule.MapID, MapSpawn{X: 0, Y: 0})
	answer.ID = "remote-proof"
	if r := request(app, "POST", "/api/attempt", token, answer); r.Code != 409 {
		t.Fatalf("remote scene answer: %d", r.Code)
	}
	placeStoryPlayer(app, player, rule.MapID, rule.NPC)
	answer.ID = "old-scene-proof"
	if r := request(app, "POST", "/api/attempt", token, answer); r.Code != 200 {
		t.Fatal(r.Body.String())
	}
	if r := request(app, "POST", "/api/story/load", token, map[string]string{"slot": "1"}); r.Code != 200 {
		t.Fatal(r.Body.String())
	}
	intro.ID = "reopen-request"
	if r := request(app, "POST", "/api/story/transition", token, intro); r.Code != 200 {
		t.Fatal(r.Body.String())
	}
	gate.AttemptID = answer.ID
	if r := request(app, "POST", "/api/story/transition", token, gate); r.Code != 409 {
		t.Fatalf("rewound scene reused an old proof: %d", r.Code)
	}
	answer.ID = "current-scene-proof"
	if r := request(app, "POST", "/api/attempt", token, answer); r.Code != 200 {
		t.Fatal(r.Body.String())
	}
	gate.AttemptID = answer.ID
	if r := request(app, "POST", "/api/story/transition", token, gate); r.Code != 200 {
		t.Fatal(r.Body.String())
	}
}

func TestStoryRouteMilestonesAndLegacyDiscoveries(t *testing.T) {
	if routeUnlocked("waldruh", nil) || routeUnlocked("nebelstadt", []string{"a1-lost-parcel"}) || routeUnlocked("rainmarket", []string{"b1-storm"}) {
		t.Fatal("locked route exposed")
	}
	if !routeUnlocked("waldruh", []string{"a1-lost-parcel"}) || !routeUnlocked("nebelstadt", []string{"a2-archive"}) || !routeUnlocked("rainmarket", []string{"b1-atlas"}) {
		t.Fatal("milestone failed to unlock route")
	}
	if !routeUnlocked("nebelstadt", []string{"b1-witness"}) {
		t.Fatal("legacy save lost its discovered town")
	}
	app := storyTestApp(t)
	token, _ := createSession(t, app, "Ada")
	if r := request(app, "GET", "/api/world?token="+token+"&mapId=waldruh", "", nil); r.Code != 403 {
		t.Fatalf("direct locked map status %d", r.Code)
	}
	if r := request(app, "POST", "/api/quest/complete", token, map[string]string{"questId": "a1-market"}); r.Code != 409 {
		t.Fatalf("out-of-order completion status %d", r.Code)
	}
}

func TestLegacyNarrativeMigrationPreservesDiscoveriesWithoutInventingAnswers(t *testing.T) {
	legacy := Progress{XP: 840, Attempts: 12, CorrectAttempts: 7, CompletedQuestIDs: []string{"a2-archive"}}
	ensureProgress(&legacy)
	ensureProgress(&legacy)
	if legacy.XP != 840 || legacy.Attempts != 12 || legacy.CorrectAttempts != 7 || len(legacy.CompletedQuestIDs) != 1 {
		t.Fatal("additive story normalization changed earned language progress")
	}
	if legacy.Story.Nodes["a2-archive"] != "complete" || !legacy.Story.Flags["quest:a2-archive"] || !contains(legacy.Story.Inventory, "a2-archive-evidence") || !routeUnlocked("nebelstadt", legacy.CompletedQuestIDs) {
		t.Fatal("a migrated discovery lost its evidence or accessible town")
	}
	if len(legacy.Story.Choices) != 0 || len(legacy.Story.Inspections) != 0 || len(legacy.Story.GateAttempts) != 0 || len(legacy.Items) != 0 || len(legacy.Words) != 0 || legacy.Story.Nodes["a1-arrival"] == "complete" {
		t.Fatal("migration invented clues, graph answers or memory evidence")
	}
	if err := requireQuestOrder("b1-witness", legacy.CompletedQuestIDs); err == nil {
		t.Fatal("new discoveries skipped missing historical prerequisites")
	}
}

func TestExpeditionAnswersAndPlansAreGradedByTheServer(t *testing.T) {
	app := storyTestApp(t)
	token, _ := createSession(t, app, "Ada")
	manifest, err := expeditionContent()
	if err != nil {
		t.Fatal(err)
	}
	encounter := manifest.Encounters[0]
	input := map[string]any{"id": "locked", "encounterId": encounter.ID, "selected": 0}
	if r := request(app, "POST", "/api/expedition/answer", token, input); r.Code != 403 {
		t.Fatalf("locked coastline answer %d", r.Code)
	}
	seedStoryProgress(t, app, token, storyQuestOrder)
	correct, incorrect := 0, 0
	for i, value := range encounter.Choices {
		if value {
			correct = i
		} else {
			incorrect = i
		}
	}
	input["id"], input["selected"] = "wrong", incorrect
	if r := request(app, "POST", "/api/expedition/answer", token, input); r.Code != 200 {
		t.Fatal(r.Body.String())
	}
	if p := storyProgress(t, app, token); p.Story.Expeditions[encounter.ID].Correct {
		t.Fatal("wrong answer accepted")
	}
	input["id"], input["selected"] = "right", correct
	request(app, "POST", "/api/expedition/answer", token, input)
	request(app, "POST", "/api/expedition/answer", token, input)
	if p := storyProgress(t, app, token); !p.Story.Expeditions[encounter.ID].Correct || p.Story.Expeditions[encounter.ID].Attempts != 2 {
		t.Fatal("encounter receipt duplicated attempts")
	}
	game := manifest.Games[0]
	values := map[string]int{}
	for i, field := range game.Fields {
		values[field.ID] = game.ValidValues[0][i]
	}
	plan := map[string]any{"id": "plan", "mapId": game.ID, "level": "A1", "values": values, "order": game.Order}
	if r := request(app, "POST", "/api/expedition/plan", token, plan); r.Code != 200 {
		t.Fatal(r.Body.String())
	}
	if p := storyProgress(t, app, token); !p.Story.ExpeditionPlans[game.ID+":A1"].Completed || p.XP != 30 {
		t.Fatalf("server plan did not award once %+v", p.Story)
	}
	plan["id"] = "repeat-plan"
	request(app, "POST", "/api/expedition/plan", token, plan)
	if p := storyProgress(t, app, token); p.XP != 30 {
		t.Fatal("repeat plan farmed XP")
	}
	plan["id"], plan["order"] = "practice-another-plan", []string{}
	r := request(app, "POST", "/api/expedition/plan", token, plan)
	var draftResult struct {
		Correct bool                `json:"correct"`
		Plan    ExpeditionPlanState `json:"plan"`
	}
	if r.Code != 200 || json.Unmarshal(r.Body.Bytes(), &draftResult) != nil || draftResult.Correct || draftResult.Plan.Completed {
		t.Fatal("an incomplete practice draft was reported correct")
	}
	if p := storyProgress(t, app, token); !p.Story.ExpeditionPlans[game.ID+":A1"].Completed || p.Story.ExpeditionPlans[game.ID+":A1"].Attempts != 3 || !p.Story.Flags["expedition:"+game.ID+":A1"] || p.XP != 30 {
		t.Fatal("practice erased or re-awarded an earned agreement")
	}
	values[game.Fields[0].ID] = 999
	plan["id"] = "invented-field"
	if r := request(app, "POST", "/api/expedition/plan", token, plan); r.Code != 400 {
		t.Fatalf("invented board field accepted %d", r.Code)
	}
}

func TestStoryRoutesCannotBeBypassedThroughWebSocketOrReconnect(t *testing.T) {
	app := storyTestApp(t)
	token, player := createSession(t, app, "Ada")
	server := httptest.NewServer(app.Handler())
	defer server.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	conn := dialMap(t, ctx, server, token, DefaultMapID)
	readWorld(t, ctx, conn, "welcome")
	writeWorld(t, ctx, conn, map[string]any{"type": "joinMap", "mapId": "waldruh"})
	readWorld(t, ctx, conn, "error")
	app.world.mu.Lock()
	current := app.world.clients[player.ID].player.MapID
	app.world.mu.Unlock()
	if current != DefaultMapID {
		t.Fatal("locked travel changed membership")
	}
	seedStoryProgress(t, app, token, storyQuestOrder[:6])
	writeWorld(t, ctx, conn, map[string]any{"type": "joinMap", "mapId": "waldruh"})
	if mapID, _, _, _ := mapValue(t, readWorld(t, ctx, conn, "map")); mapID != "waldruh" {
		t.Fatal("live quest progression was not read")
	}
	writeWorld(t, ctx, conn, map[string]any{"type": "joinMap", "mapId": "nebelstadt"})
	readWorld(t, ctx, conn, "error")
	other, _ := createSession(t, app, "Mira")
	blocked, response, err := websocket.Dial(ctx, "ws"+strings.TrimPrefix(server.URL, "http")+"/api/world?token="+other+"&mapId=nebelstadt", nil)
	if blocked != nil {
		blocked.CloseNow()
	}
	if err == nil || response == nil || response.StatusCode != 403 {
		t.Fatal("reconnect map query bypassed the route gate")
	}
}

func TestLoadingAnEarlierStorySlotWithdrawsTheLiveLockedRoute(t *testing.T) {
	app := storyTestApp(t)
	token, player := createSession(t, app, "Ada")
	if r := request(app, "POST", "/api/story/save", token, map[string]string{"slot": "1", "name": "Before Waldruh"}); r.Code != 200 {
		t.Fatal(r.Body.String())
	}
	server := httptest.NewServer(app.Handler())
	defer server.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	conn := dialMap(t, ctx, server, token, DefaultMapID)
	readWorld(t, ctx, conn, "welcome")
	seedStoryProgress(t, app, token, storyQuestOrder[:6])
	writeWorld(t, ctx, conn, map[string]any{"type": "joinMap", "mapId": "waldruh"})
	readWorld(t, ctx, conn, "map")
	if r := request(app, "POST", "/api/story/load", token, map[string]string{"slot": "1"}); r.Code != 200 {
		t.Fatal(r.Body.String())
	}
	if mapID, _, _, _ := mapValue(t, readWorld(t, ctx, conn, "map")); mapID != DefaultMapID {
		t.Fatal("rewound save retained its withdrawn route")
	}
	app.world.mu.Lock()
	client := app.world.clients[player.ID]
	mapID, rememberedMap, interiorID := client.player.MapID, client.memory.mapID, client.player.InteriorID
	app.world.mu.Unlock()
	if mapID != DefaultMapID || rememberedMap != DefaultMapID || interiorID != "" {
		t.Fatal("world membership and reconnect memory disagree after restore")
	}
	writeWorld(t, ctx, conn, map[string]any{"type": "joinMap", "mapId": "waldruh"})
	readWorld(t, ctx, conn, "error")
}

func TestRestoringARouteCannotOverfillTheUnlockedTown(t *testing.T) {
	w := NewWorld(1, nil)
	defer w.Close()
	w.mu.Lock()
	w.clients["resident"] = &worldClient{player: Player{ID: "resident", MapID: DefaultMapID}, send: make(chan []byte, 256), cancel: func() {}}
	memory := &worldMemory{mapID: "waldruh", positions: map[string]MapSpawn{}, interiorID: "inn"}
	w.clients["returning"] = &worldClient{player: Player{ID: "returning", MapID: "waldruh", InteriorID: "inn"}, memory: memory, send: make(chan []byte, 256), cancel: func() {}}
	w.mu.Unlock()
	w.reconcileStoryLocation("returning", nil)
	w.mu.Lock()
	_, retained := w.clients["returning"]
	count, reconnectMap, reconnectInterior := w.mapCountLocked(DefaultMapID), memory.mapID, memory.interiorID
	w.mu.Unlock()
	if retained || count != 1 || reconnectMap != DefaultMapID || reconnectInterior != "" {
		t.Fatal("restore bypassed town capacity or retained the locked room")
	}
}

func TestAllThreeFactionEndingsRemainReachable(t *testing.T) {
	for _, test := range []struct {
		reputation map[string]int
		want       string
	}{
		{map[string]int{"brassOffice": 0, "lamplighters": 18, "unwritten": 0}, "routes-reopened"},
		{map[string]int{"brassOffice": 0, "lamplighters": 0, "unwritten": 18}, "towns-consent"},
		{map[string]int{"brassOffice": 6, "lamplighters": 6, "unwritten": 5}, "brass-reformed"},
	} {
		s := StoryState{Flags: map[string]bool{}, Reputation: test.reputation}
		applyStoryChoice(&s, "b1-atlas", "remember")
		if s.Ending != test.want {
			t.Fatalf("ending %s, want %s", s.Ending, test.want)
		}
	}
}

func TestBellPacingLeavesTheFinalBellForTheFinale(t *testing.T) {
	for _, report := range []bool{false, true} {
		p := newProgress()
		for _, id := range storyQuestOrder {
			rule, _ := storyRule(id)
			choice := rule.ChoiceIDs[1]
			if report {
				choice = rule.ChoiceIDs[0]
			}
			applyStoryChoice(&p.Story, id, choice)
			p.CompletedQuestIDs = append(p.CompletedQuestIDs, id)
			ensureStory(&p)
			if p.Story.Bell > bellCeilingForQuest(id) {
				t.Fatalf("%s reached bell %d before its act allowed it", id, p.Story.Bell)
			}
			if milestone := storyBellMilestones[id]; milestone > 0 && p.Story.Bell < milestone {
				t.Fatalf("%s lost its earned bell milestone", id)
			}
		}
		if p.Story.Bell != 7 {
			t.Fatal("the finale did not ring the final bell")
		}
	}
	legacy := Progress{CompletedQuestIDs: append([]string{}, storyQuestOrder[:6]...), Story: StoryState{Bell: 7}}
	ensureProgress(&legacy)
	if legacy.Story.Bell != 2 || len(legacy.CompletedQuestIDs) != 6 {
		t.Fatal("old Act I warnings exhausted the later bells or lost discoveries")
	}
}

func TestCinematicsRememberOnlyEarnedStoryMoments(t *testing.T) {
	app := storyTestApp(t)
	token, _ := createSession(t, app, "Ada")
	if r := request(app, "POST", "/api/story/cinematic", token, map[string]string{"id": "future", "kind": "storm"}); r.Code != 409 {
		t.Fatalf("unearned cinematic flag %d", r.Code)
	}
	body := map[string]string{"id": "arrival", "kind": "arrival"}
	if r := request(app, "POST", "/api/story/cinematic", token, body); r.Code != 200 {
		t.Fatal(r.Body.String())
	}
	request(app, "POST", "/api/story/cinematic", token, body)
	p := storyProgress(t, app, token)
	if !p.Story.Flags["cinematic:arrival"] || p.Story.Flags["cinematic:storm"] || p.XP != 0 {
		t.Fatal("cinematic flags advanced unearned progress")
	}
}
