package main

import (
	"context"
	"encoding/json"
	"os"
	"testing"
)

func mechanicsEntry(t *testing.T, id string) InkEntry {
	t.Helper()
	entry, ok := inkEntryByID(currentStoryMechanics().Ink, id)
	if !ok {
		t.Fatalf("missing ink entry %s", id)
	}
	return entry
}

func advancePlay(t *testing.T, app *App, token string, seconds int) {
	t.Helper()
	_, _, _, err := app.store.Mutate(context.Background(), tokenHash(token), "test-play", json.RawMessage(`{}`), func(a *Account) (Receipt, error) {
		a.Progress.Intake.ActiveSeconds += seconds
		ensureStory(&a.Progress)
		return Receipt{}, nil
	})
	if err != nil {
		t.Fatal(err)
	}
}

func TestInkFadesWithVisiblePlayAndCracksTheBellUntilSpoken(t *testing.T) {
	registry := currentStoryMechanics().Ink
	p := newProgress()
	p.CompletedQuestIDs = append([]string{}, storyQuestsThrough("a1-market")...)
	p.Intake.ActiveSeconds = 100
	ensureStory(&p)
	plate := mechanicsEntry(t, "berg-plate")
	if !inkActive(plate, &p) || inkLevel(plate, &p, registry.DecaySeconds) != 1 {
		t.Fatal("a newly started name is not fresh")
	}
	before := p.Story.Bell
	p.Intake.ActiveSeconds += registry.DecaySeconds / 2
	ensureStory(&p)
	if level := inkLevel(plate, &p, registry.DecaySeconds); level >= registry.PaleBelow+.01 || level <= 0 {
		t.Fatalf("half a fade left %.2f ink", level)
	}
	if p.Story.Bell != before {
		t.Fatal("a pale name already cracked the bell")
	}
	p.Intake.ActiveSeconds += registry.DecaySeconds
	ensureStory(&p)
	// Three names faded; cracks stop at two so the finale keeps its bell.
	if p.Story.InkLost != 3 || p.Story.Bell != before+2 || p.Story.InkWarnings != 2 {
		t.Fatalf("a lost name did not crack the bell: bell %d→%d lost %d", before, p.Story.Bell, p.Story.InkLost)
	}
	// Saying both of Frau Berg's names heals the crack without touching the story's own bells.
	for _, id := range []string{"berg-plate", "fritz-list", "ticket-name"} {
		record := p.Story.Ink[id]
		record.SpokenAt = p.Intake.ActiveSeconds
		p.Story.Ink[id] = record
	}
	ensureStory(&p)
	if p.Story.Bell != before || p.Story.InkWarnings != 0 || p.Story.InkLost != 0 {
		t.Fatalf("restored names left the bell cracked: %d (was %d)", p.Story.Bell, before)
	}
}

func TestInkNeverOutrunsTheFinaleBell(t *testing.T) {
	p := newProgress()
	p.CompletedQuestIDs = append([]string{}, storyQuestsThrough("a1-lost-found")...)
	p.Story.BellWarnings = 1
	p.Intake.ActiveSeconds = 50
	ensureStory(&p)
	p.Intake.ActiveSeconds += 10 * currentStoryMechanics().Ink.DecaySeconds
	ensureStory(&p)
	if p.Story.Bell > 6 || p.Story.InkWarnings > 1 {
		t.Fatalf("ink cracks exceeded the two warnings: bell %d ink %d", p.Story.Bell, p.Story.InkWarnings)
	}
}

func TestFinishingAScenesSaysItsNamesAloud(t *testing.T) {
	registry := currentStoryMechanics().Ink
	p := newProgress()
	p.CompletedQuestIDs = append([]string{}, storyQuestsThrough("a1-market")...)
	ensureStory(&p)
	p.Intake.ActiveSeconds = registry.DecaySeconds * 2
	p.CompletedQuestIDs = append(p.CompletedQuestIDs, "a1-neighbour")
	refreshInk(&p, registry, "a1-neighbour")
	if inkLevel(mechanicsEntry(t, "berg-plate"), &p, registry.DecaySeconds) != 1 {
		t.Fatal("Marta said Frau Berg's name, but the plate stayed pale")
	}
	if inkLevel(mechanicsEntry(t, "fritz-list"), &p, registry.DecaySeconds) != 0 {
		t.Fatal("a name nobody said came back")
	}
}

func TestSayingANameRestoresItOnlyBesideTheWriting(t *testing.T) {
	app := storyTestApp(t)
	token, player := createSession(t, app, "Mira")
	seedStoryProgress(t, app, token, storyQuestsThrough("a1-market"))
	advancePlay(t, app, token, 10)
	advancePlay(t, app, token, 2*currentStoryMechanics().Ink.DecaySeconds)
	plate := mechanicsEntry(t, "berg-plate")
	placeStoryPlayer(app, player, plate.MapID, mapSpawns[plate.MapID])
	if r := request(app, "POST", "/api/story/ink", token, map[string]string{"id": "far", "entry": plate.ID, "answer": "Frau Berg"}); r.Code != 409 {
		t.Fatalf("a name was restored from across town: %d %s", r.Code, r.Body.String())
	}
	placeStoryPlayer(app, player, plate.MapID, MapSpawn{X: plate.X, Y: plate.Y})
	var wrong struct {
		Correct bool `json:"correct"`
	}
	r := request(app, "POST", "/api/story/ink", token, map[string]string{"id": "wrong", "entry": plate.ID, "answer": "Frau Burg"})
	if r.Code != 200 || json.Unmarshal(r.Body.Bytes(), &wrong) != nil || wrong.Correct {
		t.Fatalf("a wrong name restored the ink: %d %s", r.Code, r.Body.String())
	}
	var right struct {
		Correct  bool     `json:"correct"`
		Progress Progress `json:"progress"`
	}
	r = request(app, "POST", "/api/story/ink", token, map[string]string{"id": "right", "entry": plate.ID, "answer": "frau berg"})
	if r.Code != 200 || json.Unmarshal(r.Body.Bytes(), &right) != nil || !right.Correct {
		t.Fatalf("the spoken name did not hold: %d %s", r.Code, r.Body.String())
	}
	if inkLevel(plate, &right.Progress, currentStoryMechanics().Ink.DecaySeconds) != 1 || right.Progress.Story.Ink[plate.ID].Spoken != 1 {
		t.Fatal("the plate stayed pale after the name was said")
	}
	board := mechanicsEntry(t, "board-w")
	placeStoryPlayer(app, player, board.MapID, MapSpawn{X: board.X, Y: board.Y})
	if r := request(app, "POST", "/api/story/ink", token, map[string]string{"id": "silent", "entry": board.ID, "answer": "Waldruh"}); r.Code != 409 {
		t.Fatalf("an unspoken name was said before the story revealed it: %d", r.Code)
	}
}

func TestTheOwnNameOnTheTicketCanBeSaidAnywhere(t *testing.T) {
	app := storyTestApp(t)
	token, player := createSession(t, app, "Mira")
	seedStoryProgress(t, app, token, storyQuestsThrough("a1-arrival"))
	advancePlay(t, app, token, 5)
	placeStoryPlayer(app, player, DefaultMapID, mapSpawns[DefaultMapID])
	var result struct {
		Correct bool `json:"correct"`
	}
	r := request(app, "POST", "/api/story/ink", token, map[string]string{"id": "own", "entry": "ticket-name", "answer": "Mira"})
	if r.Code != 200 || json.Unmarshal(r.Body.Bytes(), &result) != nil || !result.Correct {
		t.Fatalf("the player could not keep their own name: %d %s", r.Code, r.Body.String())
	}
}

func TestTicketsReturnAForgottenNameOnceAtItsAddress(t *testing.T) {
	app := storyTestApp(t)
	token, player := createSession(t, app, "Mira")
	side, ok := sideQuestByID(currentStoryMechanics(), "ticket-anna-kuehn")
	if !ok {
		t.Fatal("missing ticket")
	}
	placeStoryPlayer(app, player, side.MapID, MapSpawn{X: side.X, Y: side.Y})
	if r := request(app, "POST", "/api/story/side", token, map[string]string{"id": "early", "entry": side.ID, "answer": side.German}); r.Code != 409 {
		t.Fatalf("a ticket opened before Otto's office: %d", r.Code)
	}
	seedStoryProgress(t, app, token, storyQuestsThrough(side.Quest))
	placeStoryPlayer(app, player, side.MapID, mapSpawns[side.MapID])
	if r := request(app, "POST", "/api/story/side", token, map[string]string{"id": "far", "entry": side.ID, "answer": side.German}); r.Code != 409 {
		t.Fatalf("a ticket was returned from the wrong street: %d", r.Code)
	}
	placeStoryPlayer(app, player, side.MapID, MapSpawn{X: side.X, Y: side.Y})
	before := storyProgress(t, app, token).XP
	var result struct {
		Correct  bool     `json:"correct"`
		XPAdded  int      `json:"xpAdded"`
		Progress Progress `json:"progress"`
	}
	r := request(app, "POST", "/api/story/side", token, map[string]string{"id": "home", "entry": side.ID, "answer": "Anna Kuehn"})
	if r.Code != 200 || json.Unmarshal(r.Body.Bytes(), &result) != nil || !result.Correct || result.XPAdded != side.XP || result.Progress.XP != before+side.XP {
		t.Fatalf("the ticket did not return its name: %d %s", r.Code, r.Body.String())
	}
	if !result.Progress.Story.Flags["side:"+side.ID] {
		t.Fatal("the returned name was not remembered")
	}
	if r := request(app, "POST", "/api/story/side", token, map[string]string{"id": "again", "entry": side.ID, "answer": side.German}); r.Code != 409 {
		t.Fatalf("a ticket paid out twice: %d", r.Code)
	}
}

func TestLockedEvidenceOpensOnlyWithItsKey(t *testing.T) {
	rule := StoryRule{Locks: []StoryLock{{ObjectID: "door", Condition: StoryCondition{Item: "keeper-key"}, Reason: map[string]string{"en": "The door needs the keeper's key."}}}}
	lock, ok := rule.lockFor("door")
	s := StoryState{Flags: map[string]bool{}, Inventory: []string{}}
	if !ok || lock.Condition.met(&s) {
		t.Fatal("a locked door opened without its key")
	}
	s.Inventory = append(s.Inventory, "keeper-key")
	if !lock.Condition.met(&s) {
		t.Fatal("the key did not open its door")
	}
}

func TestSavedWorldsGainNewStoryAnchorsAndRules(t *testing.T) {
	if testing.Short() {
		t.Skip("starts the Node edit worker")
	}
	canonical, err := os.ReadFile(worldSeedPath)
	if err != nil {
		t.Fatal(err)
	}
	var doc map[string]any
	if err = json.Unmarshal(canonical, &doc); err != nil {
		t.Fatal(err)
	}
	// An older publication: one object missing.
	lindenhafen := doc["maps"].(map[string]any)["lindenhafen"].(map[string]any)
	objects := lindenhafen["objects"].([]any)
	removed := objects[len(objects)-1].(map[string]any)["id"].(string)
	lindenhafen["objects"] = objects[:len(objects)-1]
	old, _ := json.Marshal(doc)
	worker := newWorldWorker("../scripts/admin-world-worker.mjs", "..")
	t.Cleanup(worker.stop)
	next, err := worker.reconcile(context.Background(), old, canonical)
	if err != nil || len(next.ChangedMaps) != 1 || next.ChangedMaps[0] != "lindenhafen" {
		t.Fatalf("reconciliation skipped: %v %v", next, err)
	}
	if validateWorldContent(next) != nil {
		t.Fatal("the reconciled publication is inconsistent")
	}
	var merged struct {
		Maps map[string]struct {
			Objects []StoryObject `json:"objects"`
		} `json:"maps"`
	}
	_ = json.Unmarshal(next.Document, &merged)
	found := false
	for _, object := range merged.Maps["lindenhafen"].Objects {
		found = found || object.ID == removed
	}
	if !found || len(next.Investigations.Rules) != len(storyQuestOrder)+len(prologueQuestOrder) || len(next.Investigations.Ink.Entries) == 0 || len(next.Investigations.SideQuests) == 0 {
		t.Fatal("new anchors or story authority were not added to the saved world")
	}
	again, err := worker.reconcile(context.Background(), next.Document, canonical)
	if err != nil || len(again.ChangedMaps) != 0 || again.ContentVersion != next.ContentVersion {
		t.Fatal("reconciliation is not a fixed point")
	}
}

func TestFindingEveryPupilGivesFrauBergHerGlassesBack(t *testing.T) {
	app := storyTestApp(t)
	token, player := createSession(t, app, "Mira")
	pupils := []SideQuest{}
	for _, side := range currentStoryMechanics().SideQuests {
		if side.Group == "pupils-remembered" {
			pupils = append(pupils, side)
		}
	}
	if len(pupils) != 4 {
		t.Fatalf("Frau Berg has %d pupils, want 4", len(pupils))
	}
	seedStoryProgress(t, app, token, storyQuestsThrough(pupils[0].Quest))
	for i, pupil := range pupils {
		placeStoryPlayer(app, player, pupil.MapID, MapSpawn{X: pupil.X, Y: pupil.Y})
		var result struct {
			Correct  bool     `json:"correct"`
			Progress Progress `json:"progress"`
		}
		r := request(app, "POST", "/api/story/side", token, map[string]string{"id": "pupil-" + pupil.ID, "entry": pupil.ID, "answer": pupil.German})
		if r.Code != 200 || json.Unmarshal(r.Body.Bytes(), &result) != nil || !result.Correct {
			t.Fatalf("pupil %s was not remembered: %d %s", pupil.ID, r.Code, r.Body.String())
		}
		if done := result.Progress.Story.Flags["pupils-remembered"]; done != (i == len(pupils)-1) {
			t.Fatalf("after %d pupils the group flag is %v", i+1, done)
		}
	}
}

func TestEveryTownHostsEightTickets(t *testing.T) {
	towns := map[string]int{}
	for _, side := range currentStoryMechanics().SideQuests {
		if side.Kind == "ticket" {
			towns[side.MapID]++
			if side.X <= 0 || side.Y <= 0 || side.X >= 1 || side.Y >= 1 {
				t.Fatalf("ticket %s has no address on the map", side.ID)
			}
		}
	}
	for _, town := range []string{"lindenhafen", "waldruh", "nebelstadt"} {
		if towns[town] != 8 {
			t.Fatalf("%s hosts %d tickets, want 8", town, towns[town])
		}
	}
}
