package main

import (
	"context"
	"encoding/json"
	"fmt"
	"reflect"
	"slices"
	"sort"
	"testing"
)

const storyLearningFixture = `{"version":1,"exercises":[
 {"id":"story-lost-slot","itemId":"word-bahnhof","mode":"recognition","answer":"23:15","wordIds":["bahnhof","kaffee"],"targetWordId":"bahnhof","miniGameId":"lost-hour","level":"A2","contentId":"clockmill-before-midnight-v1"},
 {"id":"story-seed-address","itemId":"word-bahnhof","mode":"production","answer":"Waldstraße 12","acceptedAnswers":["Waldstr. 12"],"wordIds":["bahnhof"],"targetWordId":"bahnhof","miniGameId":"seed-packets","level":"A2","contentId":"old-address-v1"},
 {"id":"story-connection","itemId":"word-kaffee","mode":"listening","answer":"17:59|2|Waldruh","wordIds":["kaffee"],"targetWordId":"kaffee","miniGameId":"17-59","level":"A2","contentId":"waldruh-connection-1759-v1"}
]}`

func contentAttempt(c Curriculum, id, exerciseID, answer string) AttemptInput {
	exercise := c.Exercises[exerciseID]
	binding := c.MiniGameContent[exerciseID]
	return AttemptInput{ID: id, ItemID: exercise.ItemID, ExerciseID: exercise.ID, Mode: exercise.Mode, Answer: answer, MiniGameID: binding.MiniGameID, Level: binding.Level, RegionID: binding.RegionID, ContentID: binding.ContentID, ResponseTimeMs: 1800}
}

func storyLearningTestApp(t *testing.T) (*App, string) {
	t.Helper()
	app, token := miniGameTestApp(t)
	if err := loadMiniGameExercises(&app.curriculum, []byte(storyLearningFixture), "story"); err != nil {
		t.Fatal(err)
	}
	return app, token
}

func TestAuthoredStoryAttemptsGradeActualPuzzleAnswersAndRetainLexicalCards(t *testing.T) {
	app, token := storyLearningTestApp(t)
	restoreVocabulary(t, app, token, "bahnhof", "kaffee")
	for _, test := range []struct {
		id, exercise, answer string
		correct              bool
	}{
		{"wrong-slot", "story-lost-slot", "23:20", false},
		{"right-slot", "story-lost-slot", "23:15", true},
		{"wrong-address-number", "story-seed-address", "Waldstraße 21", false},
		{"right-address", "story-seed-address", "Waldstraße 12", true},
		{"right-address-abbreviation", "story-seed-address", "Waldstr. 12", true},
		{"wrong-announced-platform", "story-connection", "17:59|3|Waldruh", false},
		{"wrong-announced-time", "story-connection", "17:58|2|Waldruh", false},
		{"right-announcement", "story-connection", "17:59|2|Waldruh", true},
	} {
		result := decodeAttempt(t, request(app, "POST", "/api/attempt", token, contentAttempt(app.curriculum, test.id, test.exercise, test.answer)))
		if result.Correct != test.correct {
			t.Fatalf("%s graded %t", test.id, result.Correct)
		}
	}
	account, _ := app.store.Get(context.Background(), tokenHash(token))
	p := account.Progress
	if len(p.Items) != 2 || p.Words["bahnhof"].DirectAttempts != 5 || p.Words["kaffee"].DirectAttempts != 3 || p.Words["kaffee"].ContextExposures != 2 {
		t.Fatal("script answers created puzzle cards or transferred mastery to contextual words")
	}
	if p.Items["word-bahnhof"].Cards["recognition"].Due.IsZero() || p.Items["word-bahnhof"].Cards["production"].Due.IsZero() || p.Items["word-kaffee"].Cards["listening"].Due.IsZero() {
		t.Fatal("story recognition, address production and timetable listening did not retain per-lexeme cards")
	}
	if evidence := p.RecentAttempts["right-slot"]; evidence.ContentID != "clockmill-before-midnight-v1" || evidence.Level != "A2" || app.curriculum.Items[evidence.ItemID].Level != "A1" {
		t.Fatal("authored scaffold replaced the lexical CEFR or lost its context evidence")
	}
	input := contentAttempt(app.curriculum, "right-slot", "story-lost-slot", "23:15")
	duplicate := decodeAttempt(t, request(app, "POST", "/api/attempt", token, input))
	if !duplicate.Duplicate || duplicate.Progress.Attempts != 8 {
		t.Fatal("a replay duplicated story retrieval evidence")
	}
	input.Answer = "23:20"
	if response := request(app, "POST", "/api/attempt", token, input); response.Code != 409 {
		t.Fatal("the immutable puzzle receipt changed its chosen answer")
	}
}

func TestAuthoredStoryContextAndEveryRestoredWordAreRequired(t *testing.T) {
	app, token := storyLearningTestApp(t)
	input := contentAttempt(app.curriculum, "unrestored-target", "story-lost-slot", "23:15")
	if response := request(app, "POST", "/api/attempt", token, input); response.Code != 409 {
		t.Fatal("story target bypassed intake")
	}
	restoreVocabulary(t, app, token, "bahnhof")
	input.ID = "unrestored-context"
	input.Preview = true
	if response := request(app, "POST", "/api/attempt", token, input); response.Code != 409 {
		t.Fatal("puzzle preview revealed an unrestored contextual word")
	}
	restoreVocabulary(t, app, token, "kaffee")
	mutations := []func(*AttemptInput){
		func(i *AttemptInput) { i.MiniGameID = "" },
		func(i *AttemptInput) { i.MiniGameID = "lantern-lighting" },
		func(i *AttemptInput) { i.MiniGameID = "seed-packets" },
		func(i *AttemptInput) { i.ContentID = "a-different-clock" },
		func(i *AttemptInput) { i.ContentID = "" },
		func(i *AttemptInput) { i.RegionID = "saffroncourt" },
		func(i *AttemptInput) { i.Level = "A1" },
		func(i *AttemptInput) { i.Level = "" },
		func(i *AttemptInput) { i.ItemID = "word-kaffee" },
		func(i *AttemptInput) { i.Mode = "production" },
		func(i *AttemptInput) { i.AnswerKind = "lexeme" },
		func(i *AttemptInput) { value := 15; i.SelectedValue = &value },
		func(i *AttemptInput) { i.ContextExerciseID = "b1-witness-exercise-3" },
	}
	for index, mutate := range mutations {
		input = contentAttempt(app.curriculum, fmt.Sprintf("spoof-%d", index), "story-lost-slot", "23:15")
		mutate(&input)
		if response := request(app, "POST", "/api/attempt", token, input); response.Code != 400 {
			t.Fatalf("spoofed context %d accepted: %d %s", index, response.Code, response.Body.String())
		}
	}
	input = miniGameAttempt("generic-story-spoof", "recognition", "", "station")
	input.MiniGameID = "lost-hour"
	if response := request(app, "POST", "/api/attempt", token, input); response.Code != 400 {
		t.Fatal("generic lexical drill substituted for an installed story puzzle")
	}
	account, _ := app.store.Get(context.Background(), tokenHash(token))
	if account.Progress.Attempts != 0 || len(account.Progress.Items) != 0 {
		t.Fatal("invalid story contexts added evidence")
	}
}

func TestAuthoredListeningReplayAndTranscriptFallbackDoNotInventUnaidedListening(t *testing.T) {
	app, token := storyLearningTestApp(t)
	restoreVocabulary(t, app, token, "kaffee")
	input := contentAttempt(app.curriculum, "replayed-audio", "story-connection", "17:59|2|Waldruh")
	input.Hinted = true
	replayed := decodeAttempt(t, request(app, "POST", "/api/attempt", token, input))
	if !replayed.Correct || replayed.XPAdded != 0 || len(replayed.Progress.Items["word-kaffee"].Cards) != 0 {
		t.Fatal("replayed story audio claimed independent listening")
	}
	input.ID, input.Mode = "transcript-fallback", "recognition"
	fallback := decodeAttempt(t, request(app, "POST", "/api/attempt", token, input))
	if !fallback.Correct || fallback.Progress.Words["kaffee"].ModeStats["listening"].UnaidedSuccesses != 0 || len(fallback.Progress.Words["kaffee"].Cards) != 0 || fallback.Progress.Items["word-kaffee"].PracticeDueAt["listening"].IsZero() {
		t.Fatal("visible announcement transcript created listening mastery")
	}
	input.ID, input.Hinted = "unhinted-transcript-mode", false
	if response := request(app, "POST", "/api/attempt", token, input); response.Code != 400 {
		t.Fatal("a transcript switched to unaided listening evidence")
	}
}

func expeditionLearningFixture(t *testing.T) ([]byte, expeditionGameRule, int, []int) {
	t.Helper()
	rules, err := expeditionContent()
	if err != nil {
		t.Fatal(err)
	}
	var game expeditionGameRule
	fieldIndex := -1
	for _, row := range rules.Games {
		if row.ID != "saffroncourt" {
			continue
		}
		game = row
		for i, field := range row.Fields {
			if field.ID == "arrival" {
				fieldIndex = i
			}
		}
	}
	if fieldIndex < 0 {
		t.Fatal("missing authored arrival slot")
	}
	field := game.Fields[fieldIndex]
	allowed := []int{}
	answers := []string{}
	for _, allocation := range game.ValidValues {
		value := allocation[fieldIndex]
		if !slices.Contains(allowed, value) {
			allowed = append(allowed, value)
			answers = append(answers, fmt.Sprintf("%d Uhr", value))
		}
	}
	labels := []map[string]any{}
	for _, value := range field.Values {
		labels = append(labels, map[string]any{"value": value, "label": fmt.Sprintf("%d Uhr", value)})
	}
	words := []string{"bahnhof", "kaffee"}
	exercises := []map[string]any{
		{"id": "expedition-arrival-b1", "itemId": "word-bahnhof", "mode": "recognition", "answer": answers[0], "acceptedAnswers": answers[1:], "wordIds": words, "targetWordId": "bahnhof", "level": "B1"},
		{"id": "expedition-encounter-recognition", "itemId": "word-bahnhof", "mode": "recognition", "answer": "Werkstatt", "wordIds": words, "targetWordId": "bahnhof", "level": "A2"},
		{"id": "expedition-encounter-listening", "itemId": "word-bahnhof", "mode": "listening", "answer": "Werkstatt", "wordIds": words, "targetWordId": "bahnhof", "level": "A2"},
	}
	manifest := map[string]any{"version": 1, "exercises": exercises,
		"encounters": []map[string]any{{"encounterId": "saffroncourt-encounter-salma", "mapId": "saffroncourt", "level": "A2", "wordIds": words, "targetWordId": "bahnhof", "exerciseIds": map[string]string{"recognition": "expedition-encounter-recognition", "listening": "expedition-encounter-listening"}}},
		"placements": []map[string]any{{"mapId": "saffroncourt", "level": "B1", "fieldId": "arrival", "exerciseId": "expedition-arrival-b1", "wordIds": words, "targetWordId": "bahnhof", "allowedValues": allowed, "labels": labels, "supported": true}},
	}
	data, err := json.Marshal(manifest)
	if err != nil {
		t.Fatal(err)
	}
	return data, game, fieldIndex, allowed
}

func TestExpeditionPlacementsGradeActualValuesAndForceSupportedEvidence(t *testing.T) {
	app, token := miniGameTestApp(t)
	data, game, fieldIndex, allowed := expeditionLearningFixture(t)
	if err := loadMiniGameExercises(&app.curriculum, data, "expedition"); err != nil {
		t.Fatal(err)
	}
	restoreVocabulary(t, app, token, "bahnhof", "kaffee")
	input := contentAttempt(app.curriculum, "locked-region", "expedition-arrival-b1", fmt.Sprintf("%d Uhr", allowed[0]))
	input.SelectedValue = &allowed[0]
	if response := request(app, "POST", "/api/attempt", token, input); response.Code != 403 {
		t.Fatal("planning retrieval bypassed its region unlock")
	}
	seedStoryProgress(t, app, token, storyQuestOrder)
	for i, value := range allowed {
		input = contentAttempt(app.curriculum, fmt.Sprintf("placement-%d", i), "expedition-arrival-b1", fmt.Sprintf("%d Uhr", value))
		input.SelectedValue = &value
		result := decodeAttempt(t, request(app, "POST", "/api/attempt", token, input))
		if !result.Correct || result.XPAdded != 0 || len(result.Progress.Items["word-bahnhof"].Cards) != 0 || !result.Progress.RecentAttempts[input.ID].Hinted {
			t.Fatal("valid alternative placement rejected or supported resource selection claimed independent mastery")
		}
		duplicate := decodeAttempt(t, request(app, "POST", "/api/attempt", token, input))
		if !duplicate.Duplicate || duplicate.Progress.Attempts != i+1 {
			t.Fatal("placement retry counted twice")
		}
	}
	wrong := -1
	for _, value := range game.Fields[fieldIndex].Values {
		if !slices.Contains(allowed, value) {
			wrong = value
			break
		}
	}
	if wrong < 0 {
		t.Fatal("test needs a genuine wrong planning value")
	}
	input = contentAttempt(app.curriculum, "wrong-placement", "expedition-arrival-b1", fmt.Sprintf("%d Uhr", wrong))
	input.SelectedValue = &wrong
	result := decodeAttempt(t, request(app, "POST", "/api/attempt", token, input))
	if result.Correct || result.Progress.Words["bahnhof"].DirectAttempts != len(allowed)+1 || result.Progress.Words["kaffee"].DirectAttempts != 0 {
		t.Fatal("wrong resource placement gained correctness or contextual word mastery")
	}
	if len(result.Progress.Story.ExpeditionPlans) != 0 {
		t.Fatal("local placement independently completed a global neighborhood allocation")
	}
	input.ID, input.Answer = "fake-canonical-substitution", fmt.Sprintf("%d Uhr", allowed[0])
	if response := request(app, "POST", "/api/attempt", token, input); response.Code != 400 {
		t.Fatal("wrong selected resource submitted a fake correct answer")
	}
	input = contentAttempt(app.curriculum, "missing-selected-value", "expedition-arrival-b1", fmt.Sprintf("%d Uhr", allowed[0]))
	if response := request(app, "POST", "/api/attempt", token, input); response.Code != 400 {
		t.Fatal("planning omitted its actual selected value")
	}
	input.SelectedValue = &allowed[0]
	input.ContentID = "recipient"
	if response := request(app, "POST", "/api/attempt", token, input); response.Code != 400 {
		t.Fatal("a placement graded against another slot")
	}
	input.ContentID, input.RegionID = "arrival", "rainmarket"
	if response := request(app, "POST", "/api/attempt", token, input); response.Code != 400 {
		t.Fatal("a placement graded against another region")
	}
}

func TestExpeditionRecognitionAndListeningRemainSeparateAndIntakeGated(t *testing.T) {
	app, token := miniGameTestApp(t)
	data, _, _, _ := expeditionLearningFixture(t)
	if err := loadMiniGameExercises(&app.curriculum, data, "expedition"); err != nil {
		t.Fatal(err)
	}
	seedStoryProgress(t, app, token, storyQuestOrder)
	restoreVocabulary(t, app, token, "bahnhof")
	input := contentAttempt(app.curriculum, "encounter-unrestored-context", "expedition-encounter-recognition", "Werkstatt")
	if response := request(app, "POST", "/api/attempt", token, input); response.Code != 409 {
		t.Fatal("expedition context word bypassed restored-only rules")
	}
	restoreVocabulary(t, app, token, "kaffee")
	inputs := []AttemptInput{
		contentAttempt(app.curriculum, "encounter-wrong", "expedition-encounter-recognition", "Brunnen"),
		contentAttempt(app.curriculum, "encounter-right", "expedition-encounter-recognition", "Werkstatt"),
		contentAttempt(app.curriculum, "encounter-heard", "expedition-encounter-listening", "Werkstatt"),
	}
	batch := decodeBatch(t, request(app, "POST", "/api/attempt", token, inputs))
	if batch.Results[0].Correct || !batch.Results[1].Correct || !batch.Results[2].Correct {
		t.Fatal("expedition response choices were not graded authoritatively")
	}
	word := batch.Progress.Words["bahnhof"]
	if word.ModeStats["recognition"].Attempts != 2 || word.ModeStats["listening"].Attempts != 1 || word.ModeStats["production"].Attempts != 0 || len(batch.Progress.Items["word-bahnhof"].Cards) != 2 || batch.Progress.Words["kaffee"].DirectAttempts != 0 {
		t.Fatal("expedition modalities transferred or omitted lexical recall evidence")
	}
	input = inputs[2]
	input.ID, input.Mode, input.Hinted = "encounter-transcript", "recognition", true
	transcript := decodeAttempt(t, request(app, "POST", "/api/attempt", token, input))
	if transcript.Progress.Words["bahnhof"].ModeStats["listening"].UnaidedSuccesses != 1 {
		t.Fatal("expedition transcript inflated independent listening evidence")
	}
	input.ID, input.MiniGameID = "encounter-game-spoof", "neighborhood-boards"
	if response := request(app, "POST", "/api/attempt", token, input); response.Code != 400 {
		t.Fatal("encounter exercise reused as a resource placement")
	}
}

func TestBroadExpeditionMessagesForceSupportedEvidenceDespiteClientClaims(t *testing.T) {
	app, token := miniGameTestApp(t)
	data, _, _, _ := expeditionLearningFixture(t)
	var manifest map[string]any
	if err := json.Unmarshal(data, &manifest); err != nil {
		t.Fatal(err)
	}
	manifest["encounters"].([]any)[0].(map[string]any)["supported"] = true
	changed, _ := json.Marshal(manifest)
	if err := loadMiniGameExercises(&app.curriculum, changed, "expedition"); err != nil {
		t.Fatal(err)
	}
	seedStoryProgress(t, app, token, storyQuestOrder)
	restoreVocabulary(t, app, token, "bahnhof", "kaffee")
	for _, mode := range []string{"recognition", "listening"} {
		input := contentAttempt(app.curriculum, "supported-encounter-"+mode, "expedition-encounter-"+mode, "Werkstatt")
		result := decodeAttempt(t, request(app, "POST", "/api/attempt", token, input))
		if !result.Correct || result.XPAdded != 0 || !result.Progress.RecentAttempts[input.ID].Hinted || len(result.Progress.Items["word-bahnhof"].Cards) != 0 || result.Progress.Words["bahnhof"].ModeStats[mode].UnaidedSuccesses != 0 {
			t.Fatal("a broad contextual inference masqueraded as independent word retrieval")
		}
	}
}

func TestContentManifestValidationIsAtomicAndRejectsUnknownOrDuplicateTargets(t *testing.T) {
	for _, test := range []struct {
		name   string
		mutate func(map[string]any)
	}{
		{"duplicate core exercise", func(m map[string]any) { m["exercises"].([]any)[0].(map[string]any)["id"] = "lex-bahnhof-recognition" }},
		{"duplicate row", func(m map[string]any) { rows := m["exercises"].([]any); m["exercises"] = append(rows, rows[0]) }},
		{"unknown target", func(m map[string]any) { m["exercises"].([]any)[2].(map[string]any)["targetWordId"] = "invented" }},
		{"wrong lexical item", func(m map[string]any) { m["exercises"].([]any)[0].(map[string]any)["itemId"] = "word-kaffee" }},
		{"unknown contextword", func(m map[string]any) {
			m["exercises"].([]any)[2].(map[string]any)["wordIds"] = []string{"kaffee", "invented"}
		}},
		{"repeated contextword", func(m map[string]any) {
			m["exercises"].([]any)[0].(map[string]any)["wordIds"] = []string{"bahnhof", "bahnhof"}
		}},
		{"target absent mapping", func(m map[string]any) { m["exercises"].([]any)[0].(map[string]any)["wordIds"] = []string{"kaffee"} }},
		{"unknown sourcegame", func(m map[string]any) { m["exercises"].([]any)[0].(map[string]any)["miniGameId"] = "re-ink" }},
		{"invalid scaffold", func(m map[string]any) { m["exercises"].([]any)[0].(map[string]any)["level"] = "C2" }},
		{"missing context", func(m map[string]any) { m["exercises"].([]any)[0].(map[string]any)["contentId"] = "" }},
	} {
		t.Run(test.name, func(t *testing.T) {
			c, err := parseCurriculum([]byte(miniGameCourseJSON))
			if err != nil {
				t.Fatal(err)
			}
			beforeItems, beforeExercises := len(c.Items), len(c.Exercises)
			var manifest map[string]any
			if json.Unmarshal([]byte(storyLearningFixture), &manifest) != nil {
				t.Fatal("fixture decode")
			}
			test.mutate(manifest)
			data, _ := json.Marshal(manifest)
			if err := loadMiniGameExercises(&c, data, "story"); err == nil {
				t.Fatal("malformed canonical manifest accepted")
			}
			if len(c.Items) != beforeItems || len(c.Exercises) != beforeExercises || len(c.MiniGameContent) != 0 {
				t.Fatal("failed content installation partially mutated curriculum")
			}
		})
	}
}

func TestExpeditionManifestCannotChangePlanAllocationsOrBindings(t *testing.T) {
	data, _, _, _ := expeditionLearningFixture(t)
	for _, test := range []struct {
		name   string
		mutate func(map[string]any)
	}{
		{"fake allowedvalues", func(m map[string]any) { m["placements"].([]any)[0].(map[string]any)["allowedValues"] = []int{999} }},
		{"fake answer", func(m map[string]any) { m["exercises"].([]any)[0].(map[string]any)["answer"] = "999 Uhr" }},
		{"missing option", func(m map[string]any) {
			r := m["placements"].([]any)[0].(map[string]any)
			r["labels"] = r["labels"].([]any)[1:]
		}},
		{"wrong region", func(m map[string]any) { m["encounters"].([]any)[0].(map[string]any)["mapId"] = "rainmarket" }},
		{"wrong target", func(m map[string]any) { m["encounters"].([]any)[0].(map[string]any)["targetWordId"] = "kaffee" }},
		{"missing level", func(m map[string]any) { m["placements"].([]any)[0].(map[string]any)["level"] = "" }},
		{"wrong exercise mode", func(m map[string]any) { m["exercises"].([]any)[2].(map[string]any)["mode"] = "recognition" }},
		{"unbound extra exercise", func(m map[string]any) {
			rows := m["exercises"].([]any)
			extra := map[string]any{}
			for k, v := range rows[2].(map[string]any) {
				extra[k] = v
			}
			extra["id"] = "unbound"
			m["exercises"] = append(rows, extra)
		}},
	} {
		t.Run(test.name, func(t *testing.T) {
			c, err := parseCurriculum([]byte(miniGameCourseJSON))
			if err != nil {
				t.Fatal(err)
			}
			var manifest map[string]any
			if json.Unmarshal(data, &manifest) != nil {
				t.Fatal("fixture decode")
			}
			test.mutate(manifest)
			changed, _ := json.Marshal(manifest)
			if err := loadMiniGameExercises(&c, changed, "expedition"); err == nil {
				t.Fatal("contradictory expedition learning manifest accepted")
			}
			if len(c.Exercises) != 3 || len(c.MiniGameContent) != 0 {
				t.Fatal("invalid bindings partially installed")
			}
		})
	}
}

func TestContentPreviewIsReadOnlyAndBatchReceiptsStayIndependent(t *testing.T) {
	app, token := storyLearningTestApp(t)
	restoreVocabulary(t, app, token, "bahnhof", "kaffee")
	preview := contentAttempt(app.curriculum, "preview-slot", "story-lost-slot", "23:15")
	preview.Preview = true
	before, _ := app.store.Get(context.Background(), tokenHash(token))
	if response := request(app, "POST", "/api/attempt", token, preview); response.Code != 200 {
		t.Fatal(response.Body.String())
	}
	after, _ := app.store.Get(context.Background(), tokenHash(token))
	if !reflect.DeepEqual(before, after) {
		t.Fatal("canonical content preview changed memory or receipts")
	}
	first := contentAttempt(app.curriculum, "batch-slot", "story-lost-slot", "23:15")
	invalid := contentAttempt(app.curriculum, "batch-spoof", "story-seed-address", "Waldstraße 12")
	invalid.ContentID = "clockmill-before-midnight-v1"
	last := contentAttempt(app.curriculum, "batch-address", "story-seed-address", "Waldstraße 12")
	response := decodeBatch(t, request(app, "POST", "/api/attempt", token, []AttemptInput{first, invalid, last}))
	if response.Results[0].Status != 200 || response.Results[1].Status != 400 || response.Results[2].Status != 200 || response.Progress.Attempts != 2 {
		t.Fatal("invalid sibling erased or granted a canonical attempt")
	}
	replayed := decodeBatch(t, request(app, "POST", "/api/attempt", token, []AttemptInput{first, last}))
	if !replayed.Results[0].Duplicate || !replayed.Results[1].Duplicate || replayed.Progress.Attempts != 2 {
		t.Fatal("batched content retries duplicated lexical evidence")
	}
}

func TestContentTargetAndCorrectnessCannotBeChosenByTheClient(t *testing.T) {
	app, token := storyLearningTestApp(t)
	restoreVocabulary(t, app, token, "bahnhof", "kaffee")
	input := contentAttempt(app.curriculum, "claimed-correct-slot", "story-lost-slot", "23:20")
	data, _ := json.Marshal(input)
	var claimed map[string]any
	_ = json.Unmarshal(data, &claimed)
	claimed["correct"], claimed["targetWordId"] = true, "kaffee"
	result := decodeAttempt(t, request(app, "POST", "/api/attempt", token, claimed))
	if result.Correct || result.Progress.Words["bahnhof"].DirectAttempts != 1 || result.Progress.Words["kaffee"].DirectAttempts != 0 {
		t.Fatal("client correctness or target claims overrode the installed content")
	}
}

func TestSelectedResourceValueZeroIsAnActualWrongOptionRatherThanMissingContext(t *testing.T) {
	app, token := miniGameTestApp(t)
	data, _, _, _ := expeditionLearningFixture(t)
	var manifest map[string]any
	if err := json.Unmarshal(data, &manifest); err != nil {
		t.Fatal(err)
	}
	rows := manifest["exercises"].([]any)
	rows[0].(map[string]any)["answer"] = "der Haussprecherin"
	rows[0].(map[string]any)["acceptedAnswers"] = []string{}
	row := manifest["placements"].([]any)[0].(map[string]any)
	row["fieldId"], row["allowedValues"] = "permission", []int{1}
	row["labels"] = []map[string]any{{"value": 0, "label": "der Werkstatt"}, {"value": 1, "label": "der Haussprecherin"}, {"value": 2, "label": "dem Besucher"}}
	changed, _ := json.Marshal(manifest)
	if err := loadMiniGameExercises(&app.curriculum, changed, "expedition"); err != nil {
		t.Fatal(err)
	}
	seedStoryProgress(t, app, token, storyQuestOrder)
	restoreVocabulary(t, app, token, "bahnhof", "kaffee")
	input := contentAttempt(app.curriculum, "zero-value-choice", "expedition-arrival-b1", "der Werkstatt")
	zero := 0
	input.SelectedValue = &zero
	result := decodeAttempt(t, request(app, "POST", "/api/attempt", token, input))
	if result.Correct || result.Progress.Attempts != 1 || result.Progress.RecentAttempts[input.ID].SelectedValue == nil || *result.Progress.RecentAttempts[input.ID].SelectedValue != 0 {
		t.Fatal("a zero resource value was lost, treated as missing or replaced with the correct option")
	}
	input.Answer = "der Haussprecherin"
	if response := request(app, "POST", "/api/attempt", token, input); response.Code != 400 {
		t.Fatal("the actual zero-valued choice submitted a different canonical answer")
	}
}

func TestInstalledStoryAndExpeditionManifestsRetainCanonicalWordTargets(t *testing.T) {
	c, err := loadCurriculum()
	if err != nil {
		t.Fatal(err)
	}
	counts := map[string]int{}
	for id, binding := range c.MiniGameContent {
		exercise := c.Exercises[id]
		word, exists := c.Lexicon[exercise.TargetWordID]
		if !exists || exercise.ItemID != "word-"+word.ID || c.Items[exercise.ItemID].Level != word.Level || !contains(exercise.WordIDs, word.ID) {
			t.Fatalf("installed exercise %s has no canonical per-word card", id)
		}
		for _, wordID := range exercise.WordIDs {
			if _, scheduled := c.Syllabus.position[wordID]; !scheduled {
				t.Fatalf("installed exercise %s cannot restore required word %s", id, wordID)
			}
		}
		if binding.MiniGameID == "neighborhood-boards" && (!binding.ForceHinted || binding.Labels == nil) {
			t.Fatalf("visible planning resources for %s claim independent recall", id)
		}
		counts[binding.MiniGameID]++
	}
	rules, err := expeditionContent()
	if err != nil {
		t.Fatal(err)
	}
	placements := 0
	for _, game := range rules.Games {
		placements += len(game.Fields) * 3
	}
	for game, count := range map[string]int{"lost-hour": 12, "seed-packets": 15, "17-59": 5, "expedition-encounters": len(rules.Encounters) * 2, "neighborhood-boards": placements} {
		if counts[game] != count {
			t.Fatalf("installed %s requires %d authored targets, got %d", game, count, counts[game])
		}
	}
}

func TestEveryInstalledStoryPuzzleGradesItsAuthoredAnswerIntoTheTargetWord(t *testing.T) {
	app := storyTestApp(t)
	token, _ := createSession(t, app, "Ada")
	words := []string{}
	ids := []string{}
	expectedAttempts := map[string]int{}
	for id, binding := range app.curriculum.MiniGameContent {
		if !contains(authoredStoryGames, binding.MiniGameID) {
			continue
		}
		exercise := app.curriculum.Exercises[id]
		ids = append(ids, id)
		expectedAttempts[exercise.TargetWordID]++
		for _, wordID := range exercise.WordIDs {
			if !contains(words, wordID) {
				words = append(words, wordID)
			}
		}
	}
	restoreVocabulary(t, app, token, words...)
	sort.Strings(ids)
	for start := 0; start < len(ids); start += maxAttemptBatch {
		inputs := []AttemptInput{}
		for _, id := range ids[start:min(start+maxAttemptBatch, len(ids))] {
			exercise := app.curriculum.Exercises[id]
			inputs = append(inputs, contentAttempt(app.curriculum, "installed-"+id, id, exercise.Answer))
		}
		batch := decodeBatch(t, request(app, "POST", "/api/attempt", token, inputs))
		for _, result := range batch.Results {
			if result.Status != 200 || !result.Correct {
				t.Fatalf("installed puzzle %s failed: %+v", result.AttemptID, result)
			}
		}
	}
	p := storyProgress(t, app, token)
	if p.Attempts != 32 {
		t.Fatal("an installed puzzle omitted or duplicated retrievals")
	}
	for wordID, attempts := range expectedAttempts {
		if p.Words[wordID].DirectAttempts != attempts {
			t.Fatalf("target %s received incorrect independent evidence", wordID)
		}
	}
	for _, wordID := range words {
		if expectedAttempts[wordID] == 0 && p.Words[wordID].DirectAttempts != 0 {
			t.Fatalf("context word %s inherited puzzle mastery", wordID)
		}
	}
	for _, test := range []struct{ id, answer string }{
		{"story-lost-hour-event-01", "23:05"},
		{"story-seed-packet-01", "packet-12"},
		{"story-seed-address-01", "Am Bahnhof 17"},
		{"story-seed-address-02", "Vor der Mühle 3"},
		{"story-seed-address-03", "An der alten Linie 21"},
		{"story-17-59-announcement-01", "17:59|7|Waldruh|fährt"},
		{"story-17-59-announcement-02", "18:05|1|Waldruh|fährt"},
		{"story-17-59-ticket", "ticket-bus"},
	} {
		if _, exists := app.curriculum.Exercises[test.id]; !exists {
			t.Fatalf("missing named story requirement %s", test.id)
		}
		input := contentAttempt(app.curriculum, "wrong-installed-"+test.id, test.id, test.answer)
		if result := decodeAttempt(t, request(app, "POST", "/api/attempt", token, input)); result.Correct {
			t.Fatalf("incorrect puzzle value was accepted for %s", test.id)
		}
	}
}
