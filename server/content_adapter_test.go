package main

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"
)

func TestContentUUIDMigrationPreservesReceiptsEvidenceRewardsAndSlots(t *testing.T) {
	app := contentTestApp(t)
	base := app.canonical.Store.(*JSONStore)
	token, player := createSession(t, app, "Ada")
	hash := tokenHash(token)
	quest := "a1-arrival"
	exercise := app.curriculum.Exercises["a1-arrival-exercise-1"]
	word := "ich-pron"
	item := "word-" + word
	rule, _ := app.storyRule(quest)
	choice := rule.ChoiceIDs[0]
	base.mu.Lock()
	account := base.state.Accounts[player.ID]
	account.ActiveCourseID = ""
	account.CourseStates = nil
	account.Progress = newProgress()
	account.Progress.CompletedQuestIDs = []string{quest}
	account.Progress.CompletedUnitIDs = []string{"course-a1-food-1"}
	account.Progress.Intake.WordIDs = []string{word}
	account.Progress.Items[item] = Memory{ItemID: item, StabilityDays: 12, Repetitions: 5}
	account.Progress.Words[word] = WordMemory{WordID: word, Exposures: 11, DirectAttempts: 5}
	account.Progress.ExerciseStats[exercise.ID] = ExerciseEvidence{ModeStats: ModeStats{Attempts: 2, Correct: 1}}
	ensureStory(&account.Progress)
	account.Progress.Story.Nodes[quest] = "gate"
	account.Progress.Story.Choices[quest] = choice
	account.Progress.Story.Flags["reply:"+exercise.ID] = true
	account.RewardedQuestIDs = []string{quest}
	account.RewardedExpeditionIDs = []string{"saffroncourt-encounter-salma"}
	account.StorySaves = map[string]StorySave{"one": {Slot: "one", Story: account.Progress.Story, CompletedQuestIDs: []string{quest}}}
	base.state.Accounts[player.ID] = account
	input := AttemptInput{ID: "old-proof", ExerciseID: exercise.ID, ItemID: exercise.ItemID, Mode: exercise.Mode, Answer: exercise.Answer}
	request, _ := json.Marshal(input)
	correct := true
	base.state.Actions[player.ID] = map[string]SavedAction{"attempt:old-proof": {Request: request, Receipt: Receipt{Correct: &correct, XPAdded: 7}, At: time.Now()}}
	base.mu.Unlock()
	if err := app.canonical.Migrate(context.Background()); err != nil {
		t.Fatal(err)
	}
	raw, err := base.Get(context.Background(), hash)
	if err != nil {
		t.Fatal(err)
	}
	questUUID := testContentID(t, app, "quest", quest)
	wordUUID := testContentID(t, app, "lexeme", word)
	itemUUID := testContentID(t, app, "item", item)
	exerciseUUID := testContentID(t, app, "exercise", exercise.ID)
	if raw.Progress.CompletedQuestIDs[0] != questUUID || raw.Progress.Intake.WordIDs[0] != wordUUID || raw.Progress.Items[itemUUID].StabilityDays != 12 || raw.Progress.Words[wordUUID].Exposures != 11 || raw.Progress.ExerciseStats[exerciseUUID].Attempts != 2 {
		t.Fatalf("evidence migration lost references %+v", raw.Progress)
	}
	if raw.Progress.Story.Nodes[questUUID] != testContentID(t, app, "node", quest+":complete") || !raw.Progress.Story.Flags["reply:"+exerciseUUID] || raw.RewardedQuestIDs[0] != questUUID || raw.StorySaves["one"].CompletedQuestIDs[0] != questUUID {
		t.Fatalf("story/reward/save UUID migration failed nodes=%v flags=%v rewards=%v saves=%v", raw.Progress.Story.Nodes, raw.Progress.Story.Flags, raw.RewardedQuestIDs, raw.StorySaves)
	}
	restored, err := app.store.Get(context.Background(), hash)
	if err != nil {
		t.Fatal(err)
	}
	if restored.Progress.Story.Nodes[quest] != "complete" || restored.Progress.Story.Choices[quest] != choice || restored.Progress.Items[item].Repetitions != 5 {
		t.Fatal("migration adapter did not restore legacy engine values")
	}
	_, receipt, duplicate, err := app.store.Mutate(context.Background(), hash, "attempt:old-proof", request, func(*Account) (Receipt, error) { t.Fatal("migration replay reran mutation"); return Receipt{}, nil })
	if err != nil || !duplicate || receipt.XPAdded != 7 {
		t.Fatalf("saved receipt retry %v %v %+v", err, duplicate, receipt)
	}
	// Re-running the opt-in migration is idempotent, including event namespaces.
	if err = app.canonical.Migrate(context.Background()); err != nil {
		t.Fatal(err)
	}
	_, _, duplicate, err = app.store.Mutate(context.Background(), hash, "attempt:old-proof", request, func(*Account) (Receipt, error) { t.Fatal("second migration lost receipt"); return Receipt{}, nil })
	if err != nil || !duplicate {
		t.Fatalf("second migration retry %v %v", err, duplicate)
	}
}
func TestContentGermanConfiguredGradingMatchesLegacyFixtures(t *testing.T) {
	app := contentTestApp(t)
	data, err := curriculumFiles.ReadFile("grading-fixtures.json")
	if err != nil {
		t.Fatal(err)
	}
	var fixtures []map[string]any
	if err = json.Unmarshal(data, &fixtures); err != nil {
		t.Fatal(err)
	}
	for _, fixture := range fixtures {
		expected, _ := fixture["expected"].(string)
		answer, _ := fixture["answer"].(string)
		mode, _ := fixture["mode"].(string)
		sensitive, _ := fixture["sensitive"].(bool)
		old := Exercise{Answer: expected, Mode: mode, CaseSensitive: sensitive, AcceptedAnswers: stringValues(fixture["acceptedAnswers"])}
		configured := old
		configured.Grading = &app.curriculum.Grading
		if old.Grade(answer) != configured.Grade(answer) {
			t.Errorf("configured grading differs for %v: %q vs %q", fixture["name"], answer, expected)
		}
	}
	if len(fixtures) == 0 {
		t.Fatal("grading fixtures were not read")
	}
}

type pendingContentStore struct {
	Store
	entered chan struct{}
	release chan struct{}
}

func (s pendingContentStore) Mutate(ctx context.Context, hash, key string, request json.RawMessage, fn func(*Account) (Receipt, error)) (Account, Receipt, bool, error) {
	close(s.entered)
	select {
	case <-s.release:
	case <-ctx.Done():
		return Account{}, Receipt{}, false, ctx.Err()
	}
	return s.Store.Mutate(ctx, hash, key, request, fn)
}
func TestContentPendingOldCourseAttemptCannotMutateActivatedCourse(t *testing.T) {
	app := contentTestApp(t)
	token, player := createSession(t, app, "Ada")
	// Capture the old request's course before allowing it to reach the store lock.
	captured := *app
	bound := *app.canonical
	bound.expectedCourse = app.canonical.defaultCourse
	pending := pendingContentStore{Store: app.canonical.Store, entered: make(chan struct{}), release: make(chan struct{})}
	bound.Store = pending
	captured.store = &bound
	exercise := app.curriculum.Exercises["a1-arrival-exercise-1"]
	input := AttemptInput{ID: "pending-old-course", ExerciseID: exercise.ID, ItemID: exercise.ItemID, Mode: exercise.Mode, Answer: exercise.Answer}
	outcome := make(chan error, 1)
	go func() { _, err := captured.applyAttempt(context.Background(), tokenHash(token), input); outcome <- err }()
	<-pending.entered
	res := request(app, "POST", "/api/course/activate", token, map[string]any{"courseId": testContentID(t, app, "course", "english"), "supportLanguage": "tr"})
	if res.Code != 200 {
		close(pending.release)
		t.Fatal(res.Body.String())
	}
	close(pending.release)
	if err := <-outcome; err == nil {
		t.Fatal("old-course request was accepted after switching")
	}
	account, err := app.store.GetAccountByID(context.Background(), player.ID)
	if err != nil {
		t.Fatal(err)
	}
	if account.Progress.Attempts != 0 || account.Progress.XP != 0 || account.CourseStates[app.canonical.defaultCourse].Progress.Attempts != 0 {
		t.Fatal("pending attempt changed either course")
	}
	base := app.canonical.Store.(*JSONStore)
	base.mu.Lock()
	defer base.mu.Unlock()
	if len(base.state.Actions[player.ID]) != 0 {
		t.Fatal("rejected old-course attempt stored a receipt")
	}
}

func TestContentCanonicalReferencesPreserveNamesAndIdempotencyIDs(t *testing.T) {
	app := contentTestApp(t)
	token, player := createSession(t, app, "report")
	if player.Name != "report" {
		t.Fatalf("content migration rewrote player name %q", player.Name)
	}
	exercise := app.curriculum.Exercises["a1-arrival-exercise-1"]
	input := AttemptInput{ID: "a1-arrival", ExerciseID: testContentID(t, app, "exercise", exercise.ID), ItemID: testContentID(t, app, "item", exercise.ItemID), Answer: exercise.Answer, Mode: exercise.Mode}
	first := request(app, "POST", "/api/attempt", token, input)
	if first.Code != 200 {
		t.Fatal(first.Body.String())
	}
	var response struct {
		AttemptID string   `json:"attemptId"`
		Progress  Progress `json:"progress"`
	}
	if err := json.Unmarshal(first.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	if response.AttemptID != input.ID || response.Progress.RecentAttempts[input.ID].ID != input.ID {
		t.Fatal("content reference adapter rewrote an idempotency ID")
	}
	retry := decodeAttempt(t, request(app, "POST", "/api/attempt", token, input))
	if !retry.Duplicate || retry.Progress.Attempts != 1 {
		t.Fatal("content-like idempotency ID lost its immutable receipt")
	}
}

func TestContentInstalledGermanCurriculumPreservesLearningIndexes(t *testing.T) {
	app := contentTestApp(t)
	legacy, err := loadCurriculum()
	if err != nil {
		t.Fatal(err)
	}
	if len(legacy.Exercises) != len(app.curriculum.Exercises) || len(legacy.Lexicon) != len(app.curriculum.Lexicon) || len(legacy.Units) != len(app.curriculum.Units) || len(legacy.MiniGameContent) != len(app.curriculum.MiniGameContent) {
		t.Fatal("content catalog lost legacy learning records")
	}
	for id, exercise := range legacy.Exercises {
		installed, ok := app.curriculum.Exercises[id]
		if !ok || installed.Answer != exercise.Answer || installed.ItemID != exercise.ItemID || installed.Mode != exercise.Mode || installed.TargetWordID != exercise.TargetWordID {
			t.Fatalf("exercise %s changed authoritative identity/grading", id)
		}
		if strings.Join(installed.WordIDs, ",") != strings.Join(exercise.WordIDs, ",") {
			t.Fatalf("exercise %s lost word exposure context: %v vs %v", id, installed.WordIDs, exercise.WordIDs)
		}
	}
	if strings.Join(legacy.Syllabus.WordIDs, ",") != strings.Join(app.curriculum.Syllabus.WordIDs, ",") {
		t.Fatal("course installation changed intake order")
	}
}

func TestContentOldReceiptReplayIsSafeBeforeMigrationFlag(t *testing.T) {
	app := contentTestApp(t)
	token, player := createSession(t, app, "Ada")
	base := app.canonical.Store.(*JSONStore)
	exercise := app.curriculum.Exercises["a1-arrival-exercise-1"]
	input := AttemptInput{ID: "before-migration", ExerciseID: exercise.ID, ItemID: exercise.ItemID, Answer: exercise.Answer, Mode: exercise.Mode}
	raw, _ := json.Marshal(input)
	correct := true
	base.mu.Lock()
	base.state.Actions[player.ID] = map[string]SavedAction{"attempt:" + input.ID: {Request: raw, Receipt: Receipt{Correct: &correct, XPAdded: 7}}}
	base.mu.Unlock()
	_, receipt, duplicate, err := app.store.Mutate(context.Background(), tokenHash(token), "attempt:"+input.ID, raw, func(*Account) (Receipt, error) {
		t.Fatal("legacy receipt was regraded before migration flag")
		return Receipt{}, nil
	})
	if err != nil || !duplicate || receipt.XPAdded != 7 {
		t.Fatalf("old receipt replay %v %v %+v", err, duplicate, receipt)
	}
	proofs, _, err := app.store.ActivityProofs(context.Background(), tokenHash(token), "", "", []string{input.ID})
	if err != nil || proofs[input.ID].Receipt.Correct == nil {
		t.Fatal("legacy receipt lost activity/story proof before migration")
	}
	if res := request(app, "POST", "/api/course/activate", token, map[string]any{"courseId": testContentID(t, app, "course", "english"), "supportLanguage": "tr"}); res.Code != 200 {
		t.Fatal(res.Body.String())
	}
	bound := *app.canonical
	bound.expectedCourse = testContentID(t, app, "course", "english")
	ran := false
	_, _, duplicate, err = bound.Mutate(context.Background(), tokenHash(token), "attempt:"+input.ID, raw, func(*Account) (Receipt, error) { ran = true; return Receipt{}, nil })
	if err != nil || duplicate || !ran {
		t.Fatal("English reused German legacy receipt")
	}
}

func TestContentStructuralJSONKeysAreNeverContentIdentifiers(t *testing.T) {
	app := contentTestApp(t)
	token, _ := createSession(t, app, "Ada")
	resumed := request(app, "POST", "/api/session", token, map[string]any{})
	var session map[string]json.RawMessage
	if err := json.Unmarshal(resumed.Body.Bytes(), &session); err != nil {
		t.Fatal(err)
	}
	var access AccessStatus
	if err := json.Unmarshal(session["access"], &access); err != nil {
		t.Fatalf("session access structure missing: %s", resumed.Body.String())
	}
	if access.Phase != "guest" {
		t.Fatalf("session access phase changed: %+v", access)
	}
	// Every known legacy slug could collide with a structural field. Only
	// explicitly declared reference dictionaries may remap their member keys.
	object := map[string]any{}
	for slug := range app.canonical.forward {
		object[slug] = map[string]any{"value": 1}
	}
	raw, _ := json.Marshal(object)
	var result map[string]any
	_ = json.Unmarshal(app.canonical.raw(raw, true), &result)
	for key := range object {
		if _, ok := result[key]; !ok {
			t.Fatalf("structural JSON key %q was rewritten", key)
		}
	}
	raw = []byte(`{"words":{"ich-pron":{"wordId":"ich-pron"}}}`)
	_ = json.Unmarshal(app.canonical.raw(raw, true), &result)
	words := result["words"].(map[string]any)
	if words[testContentID(t, app, "lexeme", "ich-pron")] == nil {
		t.Fatal("reference dictionary was not canonicalized")
	}
}
