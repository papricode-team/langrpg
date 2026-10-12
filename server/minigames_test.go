package main

import (
	"context"
	"encoding/json"
	"fmt"
	"reflect"
	"testing"
)

const miniGameCourseJSON = `{
"lexicon":[
 {"id":"bahnhof","level":"A1","lemma":"Bahnhof","article":"der","plural":"Bahnhöfe","topic":"station","pos":"noun"},
 {"id":"kaffee","level":"A1","lemma":"Kaffee","article":"der","plural":"Kaffees","topic":"food","pos":"noun"}
],
"items":[{"id":"word-bahnhof","level":"A1"},{"id":"word-kaffee","level":"A1"}],
"exercises":[
 {"id":"lex-bahnhof-recognition","itemId":"word-bahnhof","mode":"recognition","answer":"station","targetWordId":"bahnhof","wordIds":["bahnhof"]},
 {"id":"lex-bahnhof-listening","itemId":"word-bahnhof","mode":"listening","answer":"der Bahnhof","targetWordId":"bahnhof"},
 {"id":"lex-bahnhof-production","itemId":"word-bahnhof","mode":"production","answer":"Bahnhof","targetWordId":"bahnhof"}
]}`

func miniGameTestApp(t *testing.T) (*App, string) {
	t.Helper()
	course, err := parseCurriculum([]byte(miniGameCourseJSON))
	if err != nil {
		t.Fatal(err)
	}
	store, err := NewJSONStore("")
	if err != nil {
		t.Fatal(err)
	}
	app := NewApp(store, course, nil, 10)
	t.Cleanup(app.Close)
	token, _ := createSession(t, app, "Ada")
	return app, token
}

func miniGameAttempt(id, mode, kind, answer string) AttemptInput {
	return AttemptInput{ID: id, MiniGameID: "lantern-lighting", AnswerKind: kind, ItemID: "word-bahnhof", ExerciseID: "lex-bahnhof-" + mode, Mode: mode, Answer: answer, ResponseTimeMs: 1700}
}

func TestMiniGamesGradeCanonicalPicturesAndFormsOnlyForRestoredWords(t *testing.T) {
	app, token := miniGameTestApp(t)
	input := miniGameAttempt("locked-target", "recognition", "lexeme", "Bahnhof")
	if result := request(app, "POST", "/api/attempt", token, input); result.Code != 409 {
		t.Fatal("mini-game target bypassed intake without an installed syllabus")
	}
	restoreVocabulary(t, app, token, "bahnhof")
	input = miniGameAttempt("locked-option", "recognition", "lexeme", "Kaffee")
	if result := request(app, "POST", "/api/attempt", token, input); result.Code != 409 {
		t.Fatal("unrestored distractor added a retrieval")
	}
	restoreVocabulary(t, app, token, "kaffee")
	wrong := decodeAttempt(t, request(app, "POST", "/api/attempt", token, input))
	if wrong.Correct || wrong.Progress.Attempts != 1 || wrong.Progress.Words["kaffee"].DirectAttempts != 0 {
		t.Fatal("wrong picture invented target or distractor mastery")
	}
	for i, test := range []struct{ kind, answer, correction string }{
		{"lexeme", "bahnhof", "Bahnhof"},
		{"lexeme", "der Bahnhof", "Bahnhof"},
		{"article", "der", "der"},
		{"plural", "Bahnhöfe", "Bahnhöfe"},
		{"initial", "B", "B"},
		{"topic", "station", "station"},
	} {
		result := request(app, "POST", "/api/attempt", token, miniGameAttempt(fmt.Sprintf("form-%d", i), "recognition", test.kind, test.answer))
		var response struct {
			Correct         bool   `json:"correct"`
			CorrectedAnswer string `json:"correctedAnswer"`
		}
		if result.Code != 200 || json.Unmarshal(result.Body.Bytes(), &response) != nil || !response.Correct || response.CorrectedAnswer != test.correction {
			t.Fatalf("%s was not canonically graded: %d %s", test.kind, result.Code, result.Body.String())
		}
	}
	timeout := decodeAttempt(t, request(app, "POST", "/api/attempt", token, miniGameAttempt("timeout", "listening", "lexeme", "__timeout__")))
	if timeout.Correct || timeout.Progress.Items["word-bahnhof"].ModeStats["listening"].Attempts != 1 {
		t.Fatal("timeout failed to record the missed listening retrieval")
	}
	forms := timeout.Progress.FormStats["bahnhof"]
	if forms["article"].Correct != 1 || forms["plural"].Correct != 1 || forms["topic"].Correct != 1 {
		t.Fatal("per-form evidence missing")
	}
}

func TestMiniGameAnswerKindsCannotOverrideOtherExercisesOrInventOptions(t *testing.T) {
	app, token := miniGameTestApp(t)
	restoreVocabulary(t, app, token, "bahnhof", "kaffee")
	invalid := []AttemptInput{
		miniGameAttempt("invented-picture", "recognition", "lexeme", "not-in-lexicon"),
		miniGameAttempt("translation-leak", "recognition", "lexeme", "station"),
		miniGameAttempt("production-override", "production", "article", "der"),
		miniGameAttempt("unknown-kind", "recognition", "client-correct", "Bahnhof"),
	}
	unknownGame := miniGameAttempt("unknown-game", "production", "", "Bahnhof")
	unknownGame.MiniGameID = "fake-game"
	invalid = append(invalid, unknownGame)
	for _, input := range invalid {
		if result := request(app, "POST", "/api/attempt", token, input); result.Code != 400 {
			t.Fatalf("invalid override accepted: %d %s", result.Code, result.Body.String())
		}
	}
	conventional := miniGameAttempt("conventional", "recognition", "", "station")
	conventional.MiniGameID = ""
	result := decodeAttempt(t, request(app, "POST", "/api/attempt", token, conventional))
	if !result.Correct || result.Progress.Attempts != 1 {
		t.Fatal("lexical answer kinds changed conventional translation grading")
	}
}

func TestMiniGameLexicalPicturesKeepFormalAddressDistinct(t *testing.T) {
	app, token := miniGameTestApp(t)
	app.curriculum.Lexicon["sie-formal"] = Lexeme{ID: "sie-formal", Level: "A1", Lemma: "Sie"}
	app.curriculum.Lexicon["sie"] = Lexeme{ID: "sie", Level: "A1", Lemma: "sie"}
	app.curriculum.Items["word-sie-formal"] = Item{ID: "word-sie-formal", Level: "A1"}
	app.curriculum.Exercises["lex-sie-formal-recognition"] = Exercise{ID: "lex-sie-formal-recognition", ItemID: "word-sie-formal", Mode: "recognition", Answer: "you (formal)", TargetWordID: "sie-formal"}
	restoreVocabulary(t, app, token, "sie-formal", "sie")
	input := AttemptInput{ID: "formal-picture", MiniGameID: "lantern-lighting", AnswerKind: "lexeme", ItemID: "word-sie-formal", ExerciseID: "lex-sie-formal-recognition", Mode: "recognition", Answer: "sie"}
	if result := decodeAttempt(t, request(app, "POST", "/api/attempt", token, input)); result.Correct {
		t.Fatal("ordinary sie identified the formal Sie picture")
	}
	input.ID, input.Answer = "formal-picture-id", "sie-formal"
	if result := decodeAttempt(t, request(app, "POST", "/api/attempt", token, input)); !result.Correct {
		t.Fatal("canonical formal lexeme ID was rejected")
	}
}

func TestMiniGameProductionAndPreviewRequireRestoredVocabulary(t *testing.T) {
	app, token := miniGameTestApp(t)
	input := miniGameAttempt("locked-production", "production", "", "Bahnhof")
	if result := request(app, "POST", "/api/attempt", token, input); result.Code != 409 {
		t.Fatal("production mini-game bypassed intake")
	}
	input.Preview = true
	if result := request(app, "POST", "/api/attempt", token, input); result.Code != 409 {
		t.Fatal("mini-game preview revealed unrestored words")
	}
	restoreVocabulary(t, app, token, "bahnhof")
	before, _ := app.store.Get(context.Background(), tokenHash(token))
	if result := request(app, "POST", "/api/attempt", token, input); result.Code != 200 {
		t.Fatal(result.Body.String())
	}
	after, _ := app.store.Get(context.Background(), tokenHash(token))
	if !reflect.DeepEqual(before, after) {
		t.Fatal("mini-game preview added evidence")
	}
	input.Preview = false
	input.Hinted = true
	result := decodeAttempt(t, request(app, "POST", "/api/attempt", token, input))
	if !result.Correct || result.XPAdded != 0 || result.Progress.MiniGameStats["lantern-lighting"].UnaidedSuccesses != 0 || len(result.Progress.Items["word-bahnhof"].Cards) != 0 {
		t.Fatal("hinted mini-game production invented independent evidence")
	}
	duplicate := decodeAttempt(t, request(app, "POST", "/api/attempt", token, input))
	if !duplicate.Duplicate || duplicate.Progress.MiniGameStats["lantern-lighting"].Attempts != 1 {
		t.Fatal("duplicate inflated mini-game telemetry")
	}
}

func TestRetrievalMetricsUseCreditedSecondsAndExcludeRetriesAndPreviews(t *testing.T) {
	app := testApp(t)
	token, _ := createSession(t, app, "Ada")
	if r := request(app, "GET", "/api/retrievals", "", nil); r.Code != 401 {
		t.Fatal("unauthenticated metrics accepted")
	}
	var empty RetrievalMetrics
	if r := request(app, "GET", "/api/retrievals", token, nil); json.Unmarshal(r.Body.Bytes(), &empty) != nil || empty.PerCreditedHour != nil {
		t.Fatal("zero credited hours produced an invented rate")
	}
	beat(t, app, token, "credited", 120)
	input := attemptFor("retrieval-counted")
	decodeAttempt(t, request(app, "POST", "/api/attempt", token, input))
	decodeAttempt(t, request(app, "POST", "/api/attempt", token, input))
	input.Preview = true
	request(app, "POST", "/api/attempt", token, input)
	var metrics RetrievalMetrics
	r := request(app, "GET", "/api/retrievals", token, nil)
	if r.Code != 200 || json.Unmarshal(r.Body.Bytes(), &metrics) != nil || metrics.Graded != 1 || metrics.CreditedSeconds != 120 || metrics.Unaided != 1 || metrics.PerCreditedHour == nil || *metrics.PerCreditedHour != 30 {
		t.Fatalf("wrong retrieval denominator or count: %s", r.Body.String())
	}
}
