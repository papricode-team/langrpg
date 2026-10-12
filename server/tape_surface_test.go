package main

import (
	"encoding/json"
	"testing"
)

func tapeSurface(id, target, context, answer string) AttemptInput {
	return AttemptInput{ID: id, ItemID: "word-" + target, ExerciseID: "lex-" + target + "-production", MiniGameID: "looping-tape", AnswerKind: "surface", ContextExerciseID: context, Mode: "production", Answer: answer, ResponseTimeMs: 3500}
}

func restoredTapeApp(t *testing.T, context string) (*App, string) {
	t.Helper()
	app, _ := pacedStoryTestApp(t)
	token, _ := createSession(t, app, "Ada")
	restoreVocabulary(t, app, token, exerciseWords(app.curriculum.Exercises[context])...)
	return app, token
}

func TestTapeSurfaceGradesActualInflectedTokensWithoutCanonicalSubstitutions(t *testing.T) {
	const context = "b1-witness-exercise-7"
	app, token := restoredTapeApp(t, context)
	inputs := []AttemptInput{
		tapeSurface("participle", "nehmen-verb", context, "genommen"),
		tapeSurface("canonical-substitution", "nehmen-verb", context, "nehmen"),
		tapeSurface("other-attested-form", "nehmen-verb", context, "nimmt"),
		tapeSurface("adjective", "falsch-adj", context, "falschen"),
		tapeSurface("noun", "zug-noun", context, "Zug"),
		tapeSurface("noun-case", "zug-noun", context, "zug"),
		tapeSurface("mechanical-slip", "nehmen-verb", context, "genomemn"),
	}
	response := decodeBatch(t, request(app, "POST", "/api/attempt", token, inputs))
	want := []bool{true, false, false, true, true, false, true}
	for i, result := range response.Results {
		if result.Status != 200 || result.Correct != want[i] {
			t.Fatalf("%s: expected correct=%v, got %+v", inputs[i].Answer, want[i], result)
		}
	}
	if response.Results[0].CorrectedAnswer != "genommen" || response.Results[3].CorrectedAnswer != "falschen" {
		t.Fatal("feedback substituted a lemma for the actual recording's form")
	}
	if word := response.Progress.Words["nehmen-verb"]; word.DirectAttempts != 4 || word.Evidence["production"].UnaidedSuccesses != 2 || word.Evidence["recognition"].Attempts != 0 {
		t.Fatal("surface transcription lost independent per-word production evidence")
	}
	if response.Progress.RecentAttempts["participle"].ContextExerciseID != context || response.Progress.FormStats["nehmen-verb"]["surface"].Attempts != 4 {
		t.Fatal("surface production lost its source or form audit evidence")
	}
	duplicate := decodeAttempt(t, request(app, "POST", "/api/attempt", token, inputs[0]))
	if !duplicate.Duplicate || duplicate.Progress.Words["nehmen-verb"].DirectAttempts != 4 {
		t.Fatal("surface receipt retry duplicated per-word evidence")
	}
}

func TestTapeSurfacePreservesFormalAddressAndHonestAssistance(t *testing.T) {
	const context = "b1-witness-exercise-6"
	app, token := restoredTapeApp(t, context)
	wrong := decodeAttempt(t, request(app, "POST", "/api/attempt", token, tapeSurface("informal-sie", "sie-formal-pron", context, "sie")))
	if wrong.Correct {
		t.Fatal("ordinary sie substituted for formal Sie in the recording")
	}
	formal := tapeSurface("formal-sie", "sie-formal-pron", context, "Sie")
	formal.Hinted = true
	correct := decodeAttempt(t, request(app, "POST", "/api/attempt", token, formal))
	if !correct.Correct || correct.XPAdded != 0 || correct.Progress.Words["sie-formal-pron"].Evidence["production"].UnaidedSuccesses != 0 {
		t.Fatal("hinted formal transcription invented independent mastery")
	}
	seen := tapeSurface("seen-participle", "sehen-verb", context, "gesehen")
	seen.Hinted = true
	if result := decodeAttempt(t, request(app, "POST", "/api/attempt", token, seen)); !result.Correct || result.Progress.Words["sehen-verb"].Evidence["production"].UnaidedSuccesses != 0 {
		t.Fatal("attested supported participle was not graded separately")
	}
	if result := decodeAttempt(t, request(app, "POST", "/api/attempt", token, tapeSurface("sentence-initial-modal", "koennen-verb", context, "Könnten"))); !result.Correct {
		t.Fatal("sentence-initial capitalization was excluded from an attested inflection")
	}
}

func TestTapeSurfaceRejectsContextSpoofingAndOtherGamesOrModes(t *testing.T) {
	const context = "b1-witness-exercise-7"
	app, token := restoredTapeApp(t, context)
	valid := tapeSurface("spoof", "nehmen-verb", context, "genommen")
	for _, mutate := range []func(*AttemptInput){
		func(input *AttemptInput) { input.MiniGameID = "re-ink" },
		func(input *AttemptInput) { input.MiniGameID = "" },
		func(input *AttemptInput) {
			input.Mode = "recognition"
			input.ExerciseID = "lex-nehmen-verb-recognition"
		},
		func(input *AttemptInput) { input.ContextExerciseID = "b1-council-exercise-1" },
		func(input *AttemptInput) { input.ContextExerciseID = "b1-witness-exercise-2" },
		func(input *AttemptInput) { input.ContextExerciseID = "b1-witness-exercise-3" },
		func(input *AttemptInput) { input.ContextExerciseID = "missing-recording" },
		func(input *AttemptInput) { input.ContextExerciseID = "" },
		func(input *AttemptInput) { input.AnswerKind = "lexeme" },
	} {
		input := valid
		mutate(&input)
		if r := request(app, "POST", "/api/attempt", token, input); r.Code != 400 {
			t.Fatalf("surface override accepted: %d %s", r.Code, r.Body.String())
		}
	}
	if p := storyProgress(t, app, token); p.Attempts != 0 {
		t.Fatal("spoofed contexts created word evidence")
	}
}

func TestTapeSurfaceWaitsForEveryRecordingWordAndPreviewRemainsReadOnly(t *testing.T) {
	app, _ := pacedStoryTestApp(t)
	token, _ := createSession(t, app, "Ada")
	const context = "b1-witness-exercise-7"
	input := tapeSurface("restored-part-only", "nehmen-verb", context, "genommen")
	restoreVocabulary(t, app, token, "nehmen-verb")
	for _, preview := range []bool{false, true} {
		input.Preview = preview
		if r := request(app, "POST", "/api/attempt", token, input); r.Code != 409 {
			t.Fatalf("recording exposed unrestored vocabulary: %d %s", r.Code, r.Body.String())
		}
	}
	restoreVocabulary(t, app, token, exerciseWords(app.curriculum.Exercises[context])...)
	r := request(app, "POST", "/api/attempt", token, input)
	var preview map[string]any
	if r.Code != 200 || json.Unmarshal(r.Body.Bytes(), &preview) != nil || preview["correct"] != true || len(preview) != 3 || storyProgress(t, app, token).Attempts != 0 {
		t.Fatal("surface preview revealed corrections or changed evidence")
	}
}
