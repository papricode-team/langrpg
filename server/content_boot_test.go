package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"glotworld/server/internal/contentstore"
)

func TestBuiltContentCatalogueBootsAndMatchesGrading(t *testing.T) {
	data, err := curriculumFiles.ReadFile("content.json")
	if err != nil {
		t.Fatal(err)
	}
	catalogue, err := contentstore.Parse(data)
	if err != nil {
		t.Fatal(err)
	}
	curriculum, err := curriculumFromContent(catalogue)
	if err != nil {
		t.Fatal(err)
	}
	if len(curriculum.Exercises) != len(catalogue.Records["exercises"]) {
		t.Fatalf("grading/exercise count mismatch: %d / %d", len(curriculum.Exercises), len(catalogue.Records["exercises"]))
	}
	for _, record := range catalogue.Records["exercises"] {
		if _, ok := curriculum.Exercises[record.Slug]; !ok {
			t.Fatalf("exercise has no authoritative grading row: %s", record.Slug)
		}
	}
	path := filepath.Join(t.TempDir(), "content.json")
	if err := catalogue.Save(path); err != nil {
		t.Fatal(err)
	}
	reloaded, err := contentstore.Load(path)
	if err != nil {
		t.Fatal(err)
	}
	if len(reloaded.Records["lines"]) != len(catalogue.Records["lines"]) {
		t.Fatal("JSON import dropped records")
	}
}

func TestCatalogueMinigameReadsRedactEveryMatchingAnswerKey(t *testing.T) {
	data, err := curriculumFiles.ReadFile("content.json")
	if err != nil {
		t.Fatal(err)
	}
	catalogue, err := contentstore.Parse(data)
	if err != nil {
		t.Fatal(err)
	}
	matchingBoards := 0
	for _, record := range catalogue.Records["minigames"] {
		if strings.Contains(string(record.Body), `"expected"`) {
			matchingBoards++
		}
		for _, language := range []string{"en", "tr"} {
			response, err := json.Marshal(safeContent(contentBody(record), language))
			if err != nil {
				t.Fatal(err)
			}
			assertNoContentAnswers(t, response)
		}
	}
	if matchingBoards == 0 {
		t.Fatal("regression catalogue lacks matching-board answer keys")
	}
	app, ids := contentTestApp(t)
	token, _ := createSession(t, app, "Ada")
	privateBody := map[string]any{"kind": "activity-scenario", "level": "A1", "exerciseId": ids["exercises:exercise-public"], "board": map[string]any{"kind": "detective", "slots": []any{map[string]any{"id": "table", "german": "Auf dem Tisch", "expected": "key"}}}}
	body, _ := json.Marshal(privateBody)
	record := contentstore.Record{ID: "11111111-1111-4111-8111-111111111111", Slug: "test-matching-board", Version: 1, Body: body}
	dump, _ := json.Marshal(map[string]any{"version": 1, "records": map[string][]contentstore.Record{"minigames": {record}, "exercises": app.content.Records["exercises"], "quests": app.content.Records["quests"]}})
	fixture, err := contentstore.Parse(dump)
	if err != nil {
		t.Fatal(err)
	}
	app.installContent(fixture, false)
	response := request(app, "GET", "/api/content/minigames/"+record.ID, token, nil)
	if response.Code != 200 {
		t.Fatalf("matching-board read: %d %s", response.Code, response.Body.String())
	}
	assertNoContentAnswers(t, response.Body.Bytes())
	if !strings.Contains(response.Body.String(), "Auf dem Tisch") || !strings.Contains(response.Body.String(), `"id":"table"`) {
		t.Fatal("redaction removed the visible matching task")
	}
}

func TestCatalogueExpeditionFeedbackRequiresRecordedSelection(t *testing.T) {
	data, err := curriculumFiles.ReadFile("content.json")
	if err != nil {
		t.Fatal(err)
	}
	catalogue, err := contentstore.Parse(data)
	if err != nil {
		t.Fatal(err)
	}
	curriculum, err := curriculumFromContent(catalogue)
	if err != nil {
		t.Fatal(err)
	}
	privateFeedback := 0
	for _, record := range catalogue.Records["expeditions"] {
		if strings.Contains(string(record.Body), `"response"`) {
			privateFeedback++
		}
		for _, language := range []string{"en", "tr"} {
			response, err := json.Marshal(safeContent(contentBody(record), language))
			if err != nil {
				t.Fatal(err)
			}
			assertNoContentAnswers(t, response)
		}
	}
	if privateFeedback == 0 {
		t.Fatal("regression catalogue lacks private expedition choice feedback")
	}
	store, err := NewJSONStore("")
	if err != nil {
		t.Fatal(err)
	}
	app := NewApp(store, curriculum, nil, 10)
	t.Cleanup(app.Close)
	app.installContent(catalogue, true)
	token, _ := createSession(t, app, "Ada")
	encounterID := catalogue.Resolve("expeditions", "saffroncourt-encounter-salma")
	regionID := catalogue.Resolve("expeditions", "saffroncourt")
	encounter, ok := catalogue.Get("expeditions", encounterID)
	if !ok {
		t.Fatal("regression encounter missing")
	}
	choices, _ := contentBody(encounter)["choices"].([]any)
	if len(choices) != 2 {
		t.Fatal("regression encounter must have two choices")
	}
	selected := 1
	selectedFeedback := contentString(choices[selected].(map[string]any), "response")
	otherFeedback := contentString(choices[0].(map[string]any), "response")
	input := map[string]any{"id": "private-feedback", "encounterId": encounterID, "selected": selected}
	response := request(app, "POST", "/api/expedition/answer", token, input)
	if response.Code != 403 || strings.Contains(response.Body.String(), selectedFeedback) {
		t.Fatalf("locked encounter disclosed feedback: %d %s", response.Code, response.Body.String())
	}
	if _, err := app.store.UpdateAccount(context.Background(), tokenHash(token), func(account *Account) error {
		account.Progress.CompletedQuestIDs = []string{"b1-atlas"}
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	for _, id := range []string{regionID, encounterID} {
		response = request(app, "GET", "/api/content/expeditions/"+id, token, nil)
		if response.Code != 200 {
			t.Fatalf("expedition read: %d %s", response.Code, response.Body.String())
		}
		assertNoContentAnswers(t, response.Body.Bytes())
		if strings.Contains(response.Body.String(), selectedFeedback) || strings.Contains(response.Body.String(), otherFeedback) {
			t.Fatal("expedition read disclosed private choice feedback")
		}
		if !strings.Contains(response.Body.String(), "Ich bringe es hinter das blaue Tor.") {
			t.Fatal("redaction removed the selectable reply text")
		}
	}
	for _, duplicate := range []bool{false, true} {
		response = request(app, "POST", "/api/expedition/answer", token, input)
		if response.Code != 200 {
			t.Fatalf("answer: %d %s", response.Code, response.Body.String())
		}
		var result struct {
			Feedback  string           `json:"feedback"`
			Record    ExpeditionRecord `json:"record"`
			Duplicate bool             `json:"duplicate"`
		}
		if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil {
			t.Fatal(err)
		}
		if result.Feedback != selectedFeedback || result.Record.Selected != selected || result.Record.Attempts != 1 || result.Duplicate != duplicate {
			t.Fatalf("selected feedback or receipt mismatch: %+v", result)
		}
		if strings.Contains(response.Body.String(), otherFeedback) {
			t.Fatal("answer disclosed feedback for an unselected choice")
		}
	}
	input["selected"] = 0
	response = request(app, "POST", "/api/expedition/answer", token, input)
	if response.Code != 409 || strings.Contains(response.Body.String(), otherFeedback) {
		t.Fatalf("conflicting retry disclosed unrecorded feedback: %d %s", response.Code, response.Body.String())
	}
}

func TestContentAdapterPreservesAdminWorldStorageAndDocuments(t *testing.T) {
	app, ids := contentTestApp(t)
	app.installContent(app.content, true)
	if err := app.initWorldEditing(context.Background(), "../web/src/data/world-scenes.json", "../scripts/admin-world-compiler.mjs"); err != nil {
		t.Fatal(err)
	}
	app.adminEmails = map[string]bool{"admin@example.com": true}
	token, _ := createSession(t, app, "World Editor")
	if err := app.store.SetCredentials(context.Background(), tokenHash(token), "admin@example.com", "stored-password-hash"); err != nil {
		t.Fatal(err)
	}
	baseline := cloneAdminWorld(t, app.editing.current)
	app.editing.compile = func(_ context.Context, document json.RawMessage) (*WorldContent, error) {
		return adminWorldCompiledDraft(t, baseline, document), nil
	}
	response := request(app, "GET", "/api/admin/world", token, nil)
	if response.Code != 200 {
		t.Fatalf("content adapter blocked admin read: %d %s", response.Code, response.Body.String())
	}
	var read struct {
		Document json.RawMessage `json:"document"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &read); err != nil {
		t.Fatal(err)
	}
	if worldRevision(read.Document) != baseline.Revision {
		t.Fatal("UUID protocol rewrote the editable world document")
	}
	public := request(app, "GET", "/api/world-content", "", nil)
	if public.Code != 200 || !strings.Contains(public.Body.String(), `"id":"marta"`) {
		t.Fatalf("published world presentation identity changed: %d", public.Code)
	}
	projection := httptest.NewRecorder()
	app.serveContentIDs(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, 200, map[string]any{"document": map[string]any{"questId": "a1-arrival", "questIds": []string{"a1-cafe"}, "npcId": "marta", "mapId": "lindenhafen"}, "contentVersion": baseline.ContentVersion})
	}), projection, httptest.NewRequest("GET", "/api/world-content", nil))
	if !strings.Contains(projection.Body.String(), ids["quests:a1-arrival"]) || !strings.Contains(projection.Body.String(), ids["quests:a1-cafe"]) || !strings.Contains(projection.Body.String(), `"npcId":"marta"`) || !strings.Contains(projection.Body.String(), baseline.ContentVersion) {
		t.Fatal("published world did not preserve the learning/presentation identity boundary")
	}
	r := httptest.NewRequest("POST", "/api/admin/world/validate", strings.NewReader(string(baseline.Document)))
	r.Header.Set("Authorization", "Bearer "+token)
	r.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	app.Handler().ServeHTTP(w, r)
	if w.Code != 200 {
		t.Fatalf("content request limits interfered with world compiler: %d %s", w.Code, w.Body.String())
	}
	storage, ok := app.store.(worldContentStore)
	if !ok {
		t.Fatal("content adapter dropped optional world storage")
	}
	if err := storage.SaveWorldContent(context.Background(), "", baseline); err != nil {
		t.Fatal(err)
	}
	loaded, err := storage.LoadWorldContent(context.Background())
	if err != nil || loaded == nil || loaded.Revision != baseline.Revision {
		t.Fatalf("world persistence through adapter: %v", err)
	}
}

func TestCataloguePlacementSampleIsReadOnlyAcrossLockedLevels(t *testing.T) {
	data, err := curriculumFiles.ReadFile("content.json")
	if err != nil {
		t.Fatal(err)
	}
	catalogue, err := contentstore.Parse(data)
	if err != nil {
		t.Fatal(err)
	}
	curriculum, err := curriculumFromContent(catalogue)
	if err != nil {
		t.Fatal(err)
	}
	store, err := NewJSONStore("")
	if err != nil {
		t.Fatal(err)
	}
	app := NewApp(store, curriculum, nil, 10)
	t.Cleanup(app.Close)
	app.installContent(catalogue, true)
	token, _ := createSession(t, app, "Ada")
	response := request(app, "GET", "/api/content/bootstrap", token, nil)
	if response.Code != 200 {
		t.Fatal(response.Body.String())
	}
	var bootstrap struct {
		PlacementExerciseIDs []string `json:"placementExerciseIds"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &bootstrap); err != nil {
		t.Fatal(err)
	}
	if len(bootstrap.PlacementExerciseIDs) != 8 {
		t.Fatalf("diagnostic catalogue widened/shrank: %d", len(bootstrap.PlacementExerciseIDs))
	}
	exerciseID := catalogue.Resolve("exercises", "b1-witness-exercise-3")
	response = request(app, "GET", "/api/content/exercises/"+exerciseID, token, nil)
	if response.Code != 200 {
		t.Fatalf("diagnostic read blocked: %d %s", response.Code, response.Body.String())
	}
	assertNoContentAnswers(t, response.Body.Bytes())
	var exerciseBody map[string]any
	_ = json.Unmarshal(response.Body.Bytes(), &exerciseBody)
	lineID := contentString(exerciseBody, "placementLineId")
	if lineID == "" {
		t.Fatal("missing diagnostic context line")
	}
	if response := request(app, "GET", "/api/content/lines?ids="+lineID, token, nil); response.Code != 200 || !strings.Contains(response.Body.String(), lineID) {
		t.Fatalf("diagnostic context blocked: %d %s", response.Code, response.Body.String())
	}
	before, err := app.getAccount(context.Background(), tokenHash(token))
	if err != nil {
		t.Fatal(err)
	}
	exercise := curriculum.Exercises["b1-witness-exercise-3"]
	input := AttemptInput{ID: "diagnostic-preview", ExerciseID: exerciseID, ItemID: catalogue.Resolve("items", exercise.ItemID), Mode: exercise.Mode, Answer: exercise.Answer, Preview: true}
	response = request(app, "POST", "/api/attempt", token, input)
	if response.Code != 200 || strings.Contains(response.Body.String(), "correctedAnswer") || strings.Contains(response.Body.String(), "explanation") {
		t.Fatalf("read-only diagnostic preview: %d %s", response.Code, response.Body.String())
	}
	after, err := app.getAccount(context.Background(), tokenHash(token))
	if err != nil {
		t.Fatal(err)
	}
	old, _ := json.Marshal(before.Progress)
	fresh, _ := json.Marshal(after.Progress)
	if string(old) != string(fresh) {
		t.Fatal("diagnostic preview recorded learning evidence")
	}
	input.ID = "diagnostic-graded"
	input.Preview = false
	if response := request(app, "POST", "/api/attempt", token, input); response.Code != 404 {
		t.Fatalf("diagnostic exception admitted graded locked lesson: %d %s", response.Code, response.Body.String())
	}
	input.ID = "diagnostic-reveal"
	input.Reveal = true
	if response := request(app, "POST", "/api/attempt", token, input); response.Code != 404 || strings.Contains(response.Body.String(), "modelAnswer") {
		t.Fatalf("diagnostic reveal leaked locked target: %d %s", response.Code, response.Body.String())
	}
}

func TestContentAccountMigrationPreservesProgress(t *testing.T) {
	app, ids := contentTestApp(t)
	token, player := createSession(t, app, "Ada")
	rawStore := app.store
	_, err := rawStore.UpdateAccount(context.Background(), tokenHash(token), func(account *Account) error {
		account.Progress.CompletedQuestIDs = []string{"a1-arrival"}
		account.Progress.Intake.WordIDs = []string{"ticket"}
		account.Progress.ExerciseStats["exercise-one"] = ExerciseEvidence{ModeStats: ModeStats{Attempts: 3, Correct: 2, UnaidedSuccesses: 1}}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	app.installContent(app.content, true)
	_, err = app.store.UpdateAccount(context.Background(), tokenHash(token), func(account *Account) error {
		if account.Progress.ExerciseStats["exercise-one"].Correct != 2 {
			t.Fatal("internal grading lost progress")
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	stored, err := rawStore.GetAccountByID(context.Background(), player.ID)
	if err != nil {
		t.Fatal(err)
	}
	if stored.Progress.CompletedQuestIDs[0] != ids["quests:a1-arrival"] || stored.Progress.Intake.WordIDs[0] != ids["lexemes:ticket"] || stored.Progress.ExerciseStats[ids["exercises:exercise-one"]].Correct != 2 {
		data, _ := json.Marshal(stored.Progress)
		t.Fatalf("persisted content references did not migrate: %s", data)
	}
	internal, err := app.store.Get(context.Background(), tokenHash(token))
	if err != nil {
		t.Fatal(err)
	}
	if internal.Progress.CompletedQuestIDs[0] != "a1-arrival" || internal.Progress.Intake.WordIDs[0] != "ticket" {
		t.Fatal("internal compatibility conversion failed")
	}
}
