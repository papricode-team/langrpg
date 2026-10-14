package main

import (
	"bytes"
	"context"
	"encoding/json"
	"math"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestContentPublishedUUIDsPreserveProgressReceiptsAndWorld(t *testing.T) {
	app := contentTestApp(t)
	base := app.canonical.Store.(*JSONStore)
	token, player := createSession(t, app, "Published Ada")
	old := app.content.PublishedIDs
	quest, word := old["quests:a1-arrival"], old["lexemes:ich-pron"]
	exercise, item := old["exercises:a1-arrival-exercise-1"], old["items:a1-arrival-item-1"]
	if quest == "" || word == "" || exercise == "" || item == "" {
		t.Fatal("published UUID bridge is missing")
	}
	input := AttemptInput{ID: "published-proof", ExerciseID: exercise, ItemID: item, Mode: "recognition", Answer: app.curriculum.Exercises["a1-arrival-exercise-1"].Answer}
	body, _ := json.Marshal(input)
	base.mu.Lock()
	a := base.state.Accounts[player.ID]
	a.ActiveCourseID = ""
	a.CourseStates = nil
	a.Progress.CompletedQuestIDs = []string{quest}
	a.Progress.Words = map[string]WordMemory{word: {WordID: word, Exposures: 9}}
	a.Progress.Story.Nodes = map[string]string{quest: old["nodes:a1-arrival:complete"]}
	a.Progress.Story.Flags = map[string]bool{"reply:" + exercise: true}
	a.RewardedQuestIDs = []string{quest}
	a.StorySaves = map[string]StorySave{"one": {Slot: "one", Story: a.Progress.Story, CompletedQuestIDs: []string{quest}}}
	base.state.Accounts[player.ID] = a
	correct := true
	base.state.Actions[player.ID] = map[string]SavedAction{"attempt:published-proof": {Request: body, Receipt: Receipt{Correct: &correct, XPAdded: 7}}}
	base.state.WorldContent = &WorldContent{Revision: "published-world", Document: json.RawMessage(`{"id":"access","start":"gate"}`)}
	base.mu.Unlock()
	legacyAccount, err := app.store.Get(context.Background(), tokenHash(token))
	if err != nil {
		t.Fatal(err)
	}
	eligible, err := app.hasRecordedExercise(context.Background(), tokenHash(token), legacyAccount, "a1-arrival-exercise-1")
	if err != nil || !eligible {
		t.Fatal("published immutable receipt lost pre-migration recovery eligibility")
	}
	for range 2 {
		if err := app.canonical.Migrate(context.Background()); err != nil {
			t.Fatal(err)
		}
	}
	raw, err := base.Get(context.Background(), tokenHash(token))
	if err != nil {
		t.Fatal(err)
	}
	newQuest, newWord := testContentID(t, app, "quest", "a1-arrival"), testContentID(t, app, "lexeme", "ich-pron")
	if raw.Progress.Words[newWord].Exposures != 9 || raw.Progress.Story.Nodes[newQuest] != testContentID(t, app, "node", "a1-arrival:complete") || raw.RewardedQuestIDs[0] != newQuest || raw.StorySaves["one"].CompletedQuestIDs[0] != newQuest {
		t.Fatal("published progress or story refs were lost")
	}
	world, err := app.canonical.LoadWorldContent(context.Background())
	if err != nil || world.Revision != "published-world" || string(world.Document) != `{"id":"access","start":"gate"}` {
		t.Fatal("UUID migration lost the independently published world")
	}
	_, receipt, duplicate, err := app.store.Mutate(context.Background(), tokenHash(token), "attempt:published-proof", body, func(*Account) (Receipt, error) { t.Fatal("published receipt reran"); return Receipt{}, nil })
	if err != nil || !duplicate || receipt.XPAdded != 7 {
		t.Fatalf("published receipt replay failed: %v %v %+v", err, duplicate, receipt)
	}
	res := request(app, "GET", "/api/content/graphs/"+old["graphs:a1-arrival"], token, nil)
	if res.Code != 200 || !strings.Contains(res.Body.String(), testContentID(t, app, "graph", "a1-arrival")) {
		t.Fatalf("published graph alias %d %s", res.Code, res.Body.String())
	}
}

func TestContentCourseSwitchAndResetKeepTrialAndCourseBoundaries(t *testing.T) {
	app := contentTestApp(t)
	token, player := createSession(t, app, "Reset Ada")
	hash := tokenHash(token)
	english, german := testContentID(t, app, "course", "english"), testContentID(t, app, "course", "german")
	if _, err := app.store.UpdateAccount(context.Background(), hash, func(a *Account) error { a.Progress.XP = 21; return nil }); err != nil {
		t.Fatal(err)
	}
	if res := request(app, "POST", "/api/course/activate", token, map[string]any{"courseId": english, "supportLanguage": "de"}); res.Code != 200 {
		t.Fatal(res.Body.String())
	}
	account, err := app.store.Get(context.Background(), hash)
	if err != nil || playLimit(account) != guestPlayLimit {
		t.Fatal("switching courses extended a fresh guest trial")
	}
	if err := app.store.SetCredentials(context.Background(), hash, "reset@example.com", "preserved-hash"); err != nil {
		t.Fatal(err)
	}
	if res := request(app, "POST", "/api/access/reset", token, map[string]any{}); res.Code != 200 {
		t.Fatal(res.Body.String())
	}
	account, err = app.store.GetAccountByID(context.Background(), player.ID)
	spawn := courseStartingPlayer(account.Player, app.content.ByCourse[english])
	if err != nil || !account.Access.ResetTrial || playLimit(account) != trialPlayLimit || account.Email != "reset@example.com" || account.PasswordHash != "preserved-hash" || account.Player.X != spawn.X || account.Player.Y != spawn.Y {
		t.Fatal("reset lost credentials, trial grant or English classroom spawn")
	}
	if res := request(app, "POST", "/api/course/activate", token, map[string]any{"courseId": german, "supportLanguage": "en"}); res.Code != 200 {
		t.Fatal(res.Body.String())
	}
	account, err = app.store.Get(context.Background(), hash)
	if err != nil || account.Progress.XP != 0 {
		t.Fatal("reset retained another course's progress")
	}
}

func TestContentAdminWorldBypassesLearningDocumentAdapter(t *testing.T) {
	app := contentTestApp(t)
	if err := app.initWorldEditing(context.Background(), "../web/src/data/world-scenes.json", "../scripts/admin-world-compiler.mjs"); err != nil {
		t.Fatal(err)
	}
	app.adminEmails = map[string]bool{"admin@example.com": true}
	token, _ := createSession(t, app, "Admin Ada")
	if err := app.store.SetCredentials(context.Background(), tokenHash(token), "admin@example.com", "stored-hash"); err != nil {
		t.Fatal(err)
	}
	if res := request(app, "POST", "/api/course/activate", token, map[string]any{"courseId": testContentID(t, app, "course", "english"), "supportLanguage": "de"}); res.Code != 200 {
		t.Fatal(res.Body.String())
	}
	baseline := cloneAdminWorld(t, app.editing.current)
	app.editing.compile = func(_ context.Context, document json.RawMessage) (*WorldContent, error) {
		var value map[string]any
		if json.Unmarshal(document, &value) != nil || value["id"] != "access" || value["start"] != "gate" {
			t.Fatal("admin document presentation identities were transformed")
		}
		return adminWorldCompiledDraft(t, baseline, document), nil
	}
	var document map[string]any
	_ = json.Unmarshal(baseline.Document, &document)
	document["id"], document["start"] = "access", "gate"
	body, _ := json.Marshal(document)
	body = append(body, bytes.Repeat([]byte(" "), 128*1024)...)
	r := httptest.NewRequest("POST", "/api/admin/world/validate", bytes.NewReader(body))
	r.Header.Set("Content-Type", "application/json")
	r.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	app.Handler().ServeHTTP(w, r)
	if w.Code != 200 {
		t.Fatalf("admin large document %d %s", w.Code, w.Body.String())
	}
	scoped := *app
	scoped.curriculum = app.courseCurricula[testContentID(t, app, "course", "english")]
	if _, ok := scoped.storyRule("en-first-conversation"); !ok {
		t.Fatal("world editing hid the English course rules")
	}
}

func TestContentScenarioExpectedSolutionsArePrivate(t *testing.T) {
	app := contentTestApp(t)
	token, _ := createSession(t, app, "Detective Ada")
	id := testContentID(t, app, "context", "scenario:detective-a1-the-workshop-key")
	res := request(app, "GET", "/api/content/contexts/"+id, token, nil)
	if res.Code != 200 {
		t.Fatalf("scenario %d %s", res.Code, res.Body.String())
	}
	assertNoContentSecrets(t, res.Body.Bytes())
	if !bytes.Contains(app.content.ByID[id].Body, []byte(`"expected"`)) {
		t.Fatal("fixture lost private solution metadata")
	}
	var body map[string]any
	if json.Unmarshal(app.content.ByID[id].Body, &body) != nil {
		t.Fatal("bad fixture")
	}
	if len(stripContent(body, "en", "").(map[string]any)) == 0 {
		t.Fatal("redaction removed usable scenario metadata")
	}
}

func TestContentInteriorFactsUseOnlySelectedSupportLanguage(t *testing.T) {
	app := contentTestApp(t)
	token, _ := createSession(t, app, "Cafe Ada")
	id := testContentID(t, app, "context", "interior-word-facts:cafe")
	for _, lang := range []string{"tr", "en"} {
		if res := request(app, "POST", "/api/preferences", token, map[string]any{"baseLanguage": lang}); res.Code != 200 {
			t.Fatal(res.Body.String())
		}
		res := request(app, "GET", "/api/content/contexts/"+id, token, nil)
		if res.Code != 200 {
			t.Fatalf("cafe context %d %s", res.Code, res.Body.String())
		}
		var response struct {
			Body struct {
				Data struct {
					Meanings map[string]map[string]string `json:"meanings"`
				} `json:"data"`
			} `json:"body"`
		}
		if err := json.Unmarshal(res.Body.Bytes(), &response); err != nil {
			t.Fatal(err)
		}
		if lang == "tr" && (response.Body.Data.Meanings["tr"]["Kaffee"] != "kahve" || response.Body.Data.Meanings["tr"]["Milch"] != "süt") {
			t.Fatal("Turkish interior meanings were stripped")
		}
		if lang == "en" && len(response.Body.Data.Meanings["tr"]) != 0 {
			t.Fatal("English context leaked Turkish meanings")
		}
	}
}

func TestContentInactiveCourseLocationMigratesEditedWorldBounds(t *testing.T) {
	app := contentTestApp(t)
	token, _ := createSession(t, app, "Bounds Ada")
	hash := tokenHash(token)
	german, english := testContentID(t, app, "course", "german"), testContentID(t, app, "course", "english")
	if _, err := app.store.UpdateAccount(context.Background(), hash, func(a *Account) error { a.Player.X, a.Player.Y = .31, .42; return nil }); err != nil {
		t.Fatal(err)
	}
	if res := request(app, "POST", "/api/course/activate", token, map[string]any{"courseId": english, "supportLanguage": "de"}); res.Code != 200 {
		t.Fatal(res.Body.String())
	}
	before, err := app.store.Get(context.Background(), hash)
	if err != nil {
		t.Fatal(err)
	}
	teacher := before.Player
	app.world.mu.Lock()
	oldDefinition := app.world.maps[DefaultMapID]
	registry := compiledWorldMaps
	registry.Maps = map[string]WorldMapDefinition{}
	for id, definition := range app.world.maps {
		registry.Maps[id] = definition
	}
	app.world.mu.Unlock()
	changed := oldDefinition
	changed.CoordinateVersion++
	changed.Width += 400
	changed.LegacyOffset.X += 40
	changed.Spawn = restoreWorldPosition(oldDefinition.Spawn, oldDefinition.WorldCoordinateFrame, changed)
	registry.Maps[DefaultMapID] = changed
	registry.ContentVersion = "saved-course-bounds-fixture"
	app.world.publishContent(registry)
	// Access renewals must preserve the classroom's own authored coordinates.
	if res := request(app, "GET", "/api/access", token, nil); res.Code != 200 {
		t.Fatal(res.Body.String())
	}
	if res := request(app, "POST", "/api/course/activate", token, map[string]any{"courseId": german, "supportLanguage": "en"}); res.Code != 200 {
		t.Fatal(res.Body.String())
	}
	after, err := app.store.Get(context.Background(), hash)
	expected := restoreWorldPosition(MapSpawn{.31, .42}, oldDefinition.WorldCoordinateFrame, changed)
	if err != nil || math.Abs(after.Player.X-expected.X) > 1e-9 || math.Abs(after.Player.Y-expected.Y) > 1e-9 || after.CourseStates[german].LocationFrame != changed.WorldCoordinateFrame {
		t.Fatalf("inactive location was not migrated: %v %+v want %+v", err, after.Player, expected)
	}
	if res := request(app, "POST", "/api/course/activate", token, map[string]any{"courseId": english, "supportLanguage": "de"}); res.Code != 200 {
		t.Fatal(res.Body.String())
	}
	after, err = app.store.Get(context.Background(), hash)
	if err != nil || after.Player.X != teacher.X || after.Player.Y != teacher.Y || after.CourseStates[english].LocationFrame.CoordinateVersion != 0 {
		t.Fatal("German world editing shifted the English classroom away from its teacher")
	}
}
