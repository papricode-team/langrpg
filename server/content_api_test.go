package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"glotworld/server/internal/contentstore"
)

func contentTestApp(t *testing.T) (*App, map[string]string) {
	t.Helper()
	curriculum := testCurriculum()
	curriculum.Quests = map[string]Quest{"a1-arrival": {ID: "a1-arrival", RequiredItemIDs: []string{"item-one"}}, "a1-cafe": {ID: "a1-cafe", RequiredItemIDs: []string{"item-two"}}}
	curriculum.Exercises["exercise-two"] = Exercise{ID: "exercise-two", ItemID: "item-two", Mode: "production", Answer: "Ich bin hier"}
	curriculum.Exercises["exercise-public"] = Exercise{ID: "exercise-public", ItemID: "item-one", Mode: "production", Answer: "Ich komme aus England."}
	curriculum.Exercises["exercise-station"] = Exercise{ID: "exercise-station", ItemID: "item-two", Mode: "recognition", Answer: "Ein Geheimnis", TargetWordID: "secret"}
	curriculum.Exercises["exercise-activity"] = Exercise{ID: "exercise-activity", ItemID: "item-two", Mode: "recognition", Answer: "Mit Milch, bitte."}
	curriculum.ContextWordIDs = map[string][]string{"exercise-station": {"secret"}}
	curriculum.Exercises["exercise-off-route"] = Exercise{ID: "exercise-off-route", ItemID: "item-two", Mode: "recognition", Answer: "Im Wald"}
	curriculum.Lexicon = map[string]Lexeme{"ticket": {ID: "ticket", Level: "A1", Lemma: "Fahrkarte"}, "secret": {ID: "secret", Level: "A1", Lemma: "Geheimnis"}}
	curriculum.Units = map[string]CourseUnit{"unit-one": {ID: "unit-one", Level: "A1", RequiredWordIDs: []string{"secret"}, RequiredExerciseIDs: []string{"exercise-two"}}}
	curriculum.Syllabus = &Syllabus{WordsPerHour: 10, OpeningWords: 0, WordIDs: []string{"ticket", "secret"}, position: map[string]int{"ticket": 0, "secret": 1}}
	store, err := NewJSONStore("")
	if err != nil {
		t.Fatal(err)
	}
	app := NewApp(store, curriculum, nil, 10)
	t.Cleanup(app.Close)
	records := map[string][]contentstore.Record{}
	ids := map[string]string{}
	index := 0
	add := func(kind, slug string, body map[string]any) string {
		index++
		id := fmt.Sprintf("00000000-0000-4000-8000-%012d", index)
		data, _ := json.Marshal(body)
		records[kind] = append(records[kind], contentstore.Record{ID: id, Slug: slug, Version: 1, Body: data})
		ids[kind+":"+slug] = id
		return id
	}
	quest := add("quests", "a1-arrival", map[string]any{"title": "Arrival", "level": "A1"})
	lockedQuest := add("quests", "a1-cafe", map[string]any{"title": "Cafe", "level": "A1"})
	word := add("lexemes", "ticket", map[string]any{"lemma": "Fahrkarte", "meaning": map[string]string{"en": "ticket", "tr": "bilet"}})
	add("lexemes", "secret", map[string]any{"lemma": "Geheimnis", "meaning": map[string]string{"en": "secret", "tr": "sır"}})
	unit := add("units", "unit-one", map[string]any{"title": "Unit", "level": "A1"})
	add("exercises", "exercise-one", map[string]any{"itemId": "item-one", "questId": quest, "mode": "recognition", "prompt": "Choose the greeting", "answer": "Guten Tag", "acceptedAnswers": []string{"Hallo"}, "explanation": "The correct greeting."})
	add("exercises", "exercise-two", map[string]any{"itemId": "item-two", "questId": lockedQuest, "unitId": unit, "mode": "production", "answer": "Ich bin hier"})
	exercisePublic := add("exercises", "exercise-public", map[string]any{"itemId": "item-one", "questId": quest, "mode": "type", "german": "Ich komme aus England.", "answer": "Ich komme aus England.", "prompt": "Write: I come from England."})
	station := add("exercises", "exercise-station", map[string]any{"itemId": "item-two", "questId": lockedQuest, "mode": "recognition", "answer": "Ein Geheimnis"})
	activity := add("exercises", "exercise-activity", map[string]any{"itemId": "item-two", "questId": lockedQuest, "mode": "recognition", "answer": "Mit Milch, bitte."})
	offRoute := add("exercises", "exercise-off-route", map[string]any{"itemId": "item-two", "questId": lockedQuest, "mode": "recognition", "answer": "Im Wald"})
	add("narratives", "interior:interior:cafe:coffee", map[string]any{"kind": "interior", "mapId": "lindenhafen", "interiorId": "cafe", "activityId": "cafe", "exerciseIds": []string{station}})
	add("narratives", "interior:waldruh:counter", map[string]any{"kind": "interior", "mapId": "waldruh", "interiorId": "cafe", "exerciseIds": []string{offRoute}})
	add("minigames", "activity:cafe:A1", map[string]any{"kind": "activity", "activityId": "cafe", "mapId": "lindenhafen", "level": "A1", "scenarios": []any{map[string]any{"id": "scenario-one", "activityId": "cafe", "level": "A1", "exerciseId": activity}}})
	add("lines", "exercise:exercise-public", map[string]any{"exerciseId": exercisePublic, "questId": quest, "de": map[string]any{"text": "Ich komme aus England."}})
	line := add("lines", "ticket-line", map[string]any{"questId": quest, "stage": "intro", "de": map[string]any{"text": "Ihre Fahrkarte", "tokens": [][2]int{{0, 4}, {5, 14}}}, "support": map[string]any{"en": map[string]any{"text": "Your ticket", "tokens": [][2]int{{0, 4}, {5, 11}}, "align": [][2]int{{0, 0}, {1, 1}}}, "tr": map[string]any{"text": "Biletiniz", "tokens": [][2]int{{0, 9}}, "align": [][2]int{{0, 0}, {1, 0}}}}, "glosses": map[string]string{"1": word}})
	add("lines", "hidden-line", map[string]any{"questId": lockedQuest, "stage": "intro", "de": map[string]any{"text": "Secret"}})
	add("lines", "choice-line", map[string]any{"questId": quest, "stage": "choice", "de": map[string]any{"text": "Late choice"}})
	add("graphs", "a1-arrival", map[string]any{"questId": quest, "nodes": []any{map[string]any{"stage": "intro", "lineIds": []string{line}}}})
	add("graphs", "a1-cafe", map[string]any{"questId": lockedQuest})
	add("narratives", "arrival-note", map[string]any{"questId": quest, "lineIds": []string{line}})
	add("expeditions", "locked-expedition", map[string]any{"mapId": "saffroncourt", "correct": true, "answer": "hidden"})
	add("minigames", "locked-minigame", map[string]any{"mapId": "saffroncourt", "validValues": [][]int{{1}}})
	add("nodes", "a1-arrival:intro", map[string]any{"questId": quest, "stage": "intro", "localId": "intro"})
	add("choices", "a1-arrival:protect", map[string]any{"questId": quest, "localId": "protect", "text": "protect"})
	ids["items:item-one"] = "00000000-0000-4000-8000-000000000101"
	ids["items:item-two"] = "00000000-0000-4000-8000-000000000102"
	data, _ := json.Marshal(map[string]any{"version": 1, "ids": ids, "records": records})
	catalogue, err := contentstore.Parse(data)
	if err != nil {
		t.Fatal(err)
	}
	app.installContent(catalogue, false)
	return app, ids
}

func TestContentProductionTargetsRequireAttemptAndTrialWallApplies(t *testing.T) {
	app, ids := contentTestApp(t)
	token, _ := createSession(t, app, "Ada")
	response := request(app, "GET", "/api/content/exercises/"+ids["exercises:exercise-public"], token, nil)
	if response.Code != 200 || strings.Contains(response.Body.String(), "Ich komme aus England.") || strings.Contains(response.Body.String(), "exampleLineId") {
		t.Fatalf("model target disclosed before answering: %d %s", response.Code, response.Body.String())
	}
	linePath := "/api/content/lines?ids=" + ids["lines:exercise:exercise-public"]
	if response := request(app, "GET", linePath, token, nil); response.Body.String() != "{\"lines\":[]}" {
		t.Fatalf("model example disclosed before answering: %s", response.Body.String())
	}
	input := AttemptInput{ID: "public-wrong", ExerciseID: ids["exercises:exercise-public"], ItemID: ids["items:item-one"], QuestID: ids["quests:a1-arrival"], Mode: "production", Answer: "wrong"}
	if response := request(app, "POST", "/api/attempt", token, input); response.Code != 200 {
		t.Fatalf("record answer: %d %s", response.Code, response.Body.String())
	}
	if response := request(app, "GET", linePath, token, nil); !strings.Contains(response.Body.String(), "Ich komme aus England.") {
		t.Fatalf("model example unavailable after answering: %s", response.Body.String())
	}
	_, err := app.store.UpdateAccount(context.Background(), tokenHash(token), func(account *Account) error { account.Access.PlayedNanoseconds = int64(guestPlayLimit); return nil })
	if err != nil {
		t.Fatal(err)
	}
	for _, path := range []string{"/api/content/bootstrap", linePath, "/api/content/exercises/" + ids["exercises:exercise-public"], "/api/content/lexemes?ids=" + ids["lexemes:ticket"]} {
		response := request(app, "GET", path, token, nil)
		if response.Code != 403 || !strings.Contains(response.Body.String(), "login_required") {
			t.Errorf("content trial wall %s: %d %s", path, response.Code, response.Body.String())
		}
	}
}

func TestContentRateBudgetIsSharedByAccountSessions(t *testing.T) {
	app, _ := contentTestApp(t)
	token, player := createSession(t, app, "Ada")
	other, err := randomID(32)
	if err != nil {
		t.Fatal(err)
	}
	if err := app.store.AddSession(context.Background(), tokenHash(other), player.ID); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 6; i++ {
		chosen := token
		if i%2 == 0 {
			chosen = other
		}
		if response := request(app, "GET", "/api/content/bootstrap", chosen, nil); response.Code != 200 {
			t.Fatalf("budget early: %d", response.Code)
		}
	}
	if response := request(app, "GET", "/api/content/bootstrap", other, nil); response.Code != 429 {
		t.Fatalf("session rotation bypassed account budget: %d", response.Code)
	}
	app.rateMu.Lock()
	for key, window := range app.limits {
		window.At = time.Now().Add(-2 * time.Minute)
		app.limits[key] = window
	}
	app.rateMu.Unlock()
	if response := request(app, "GET", "/api/content/bootstrap", token, nil); response.Code != 200 {
		t.Fatalf("minute expiry didn't reset: %d", response.Code)
	}
}

func assertNoContentAnswers(t *testing.T, data []byte) {
	t.Helper()
	var value any
	if err := json.Unmarshal(data, &value); err != nil {
		t.Fatal(err)
	}
	var visit func(any)
	visit = func(value any) {
		switch typed := value.(type) {
		case map[string]any:
			for key, child := range typed {
				switch strings.ToLower(key) {
				case "answer", "acceptedanswers", "explanation", "response", "expected", "modelanswer", "correct", "validvalues", "slug", "localid":
					t.Errorf("private field %q disclosed: %s", key, data)
				}
				visit(child)
			}
		case []any:
			for _, child := range typed {
				visit(child)
			}
		}
	}
	visit(value)
}

func TestContentReadsAuthenticateGateAndHideAnswers(t *testing.T) {
	app, ids := contentTestApp(t)
	token, _ := createSession(t, app, "Ada")
	visible := []string{"/api/content/bootstrap", "/api/content/graphs/" + ids["graphs:a1-arrival"], "/api/content/exercises/" + ids["exercises:exercise-one"], "/api/content/lines?ids=" + ids["lines:ticket-line"], "/api/content/lexemes?ids=" + ids["lexemes:ticket"], "/api/content/narratives/" + ids["narratives:arrival-note"]}
	for _, path := range visible {
		if response := request(app, "GET", path, "", nil); response.Code != 401 {
			t.Errorf("unauthenticated %s: %d", path, response.Code)
		}
		response := request(app, "GET", path, token, nil)
		if response.Code != 200 {
			t.Fatalf("visible %s: %d %s", path, response.Code, response.Body.String())
		}
		assertNoContentAnswers(t, response.Body.Bytes())
		if response.Header().Get("ETag") == "" || response.Header().Get("Cache-Control") != "private, max-age=60" {
			t.Errorf("missing private conditional cache: %s", path)
		}
	}
	for _, path := range []string{"/api/content/graphs/" + ids["graphs:a1-cafe"], "/api/content/exercises/" + ids["exercises:exercise-two"], "/api/content/units/" + ids["units:unit-one"], "/api/content/expeditions/" + ids["expeditions:locked-expedition"], "/api/content/minigames/" + ids["minigames:locked-minigame"], "/api/content/exercises/00000000-0000-4000-8000-000000000999"} {
		response := request(app, "GET", path, token, nil)
		if response.Code != 404 || response.Body.String() != "{\"error\":\"content not found\"}\n" {
			t.Errorf("locked/unknown %s: %d %s", path, response.Code, response.Body.String())
		}
	}
	response := request(app, "GET", "/api/content/lines?ids="+strings.Join([]string{ids["lines:hidden-line"], ids["lines:choice-line"], "00000000-0000-4000-8000-000000000999"}, ","), token, nil)
	if response.Code != 200 || response.Body.String() != "{\"lines\":[]}" {
		t.Errorf("hidden batch: %d %s", response.Code, response.Body.String())
	}
	response = request(app, "GET", "/api/content/lexemes?ids="+ids["lexemes:secret"], token, nil)
	if response.Body.String() != "{\"lexemes\":[]}" {
		t.Errorf("unintroduced lexeme: %s", response.Body.String())
	}
}

func TestContentLanguageETagAndBudgets(t *testing.T) {
	app, ids := contentTestApp(t)
	token, _ := createSession(t, app, "Ada")
	path := "/api/content/lines?ids=" + ids["lines:ticket-line"]
	response := request(app, "GET", path, token, nil)
	if !strings.Contains(response.Body.String(), "Your ticket") || strings.Contains(response.Body.String(), "Biletiniz") {
		t.Fatalf("English slice: %s", response.Body.String())
	}
	etag := response.Header().Get("ETag")
	r := httptest.NewRequest("GET", path, nil)
	r.Header.Set("Authorization", "Bearer "+token)
	r.Header.Set("If-None-Match", etag)
	w := httptest.NewRecorder()
	app.Handler().ServeHTTP(w, r)
	if w.Code != 304 || w.Body.Len() != 0 {
		t.Errorf("conditional read: %d %s", w.Code, w.Body.String())
	}
	if response := request(app, "POST", "/api/preferences", token, Preferences{BaseLanguage: "tr"}); response.Code != 200 {
		t.Fatal(response.Body.String())
	}
	response = request(app, "GET", path, token, nil)
	if strings.Contains(response.Body.String(), "Your ticket") || !strings.Contains(response.Body.String(), "Biletiniz") || response.Header().Get("ETag") == etag {
		t.Errorf("Turkish slice/cache: %s", response.Body.String())
	}
	for i := 0; i < 6; i++ {
		if response := request(app, "GET", "/api/content/bootstrap", token, nil); response.Code != 200 {
			t.Fatalf("budget early: %d", response.Code)
		}
	}
	if response := request(app, "GET", "/api/content/bootstrap", token, nil); response.Code != 429 || response.Header().Get("Retry-After") == "" {
		t.Fatalf("bootstrap budget: %d %s", response.Code, response.Body.String())
	}
	other, _ := createSession(t, app, "Mira")
	if response := request(app, "GET", "/api/content/bootstrap", other, nil); response.Code != 200 {
		t.Fatalf("account isolation: %d", response.Code)
	}
}

func TestContentBatchCapsAndRecordRateLimit(t *testing.T) {
	app, ids := contentTestApp(t)
	token, _ := createSession(t, app, "Ada")
	for _, path := range []string{"/api/content/lines?ids=readable-slug", "/api/content/lines?ids=" + strings.Repeat(ids["lines:ticket-line"]+",", 12) + ids["lines:ticket-line"], "/api/content/lexemes?ids=" + strings.Repeat(ids["lexemes:ticket"]+",", 24) + ids["lexemes:ticket"]} {
		if response := request(app, "GET", path, token, nil); response.Code != 400 {
			t.Errorf("invalid batch: %d", response.Code)
		}
	}
	batch := strings.TrimSuffix(strings.Repeat(ids["lines:ticket-line"]+",", 12), ",")
	for i := 0; i < 10; i++ {
		if response := request(app, "GET", "/api/content/lines?ids="+batch, token, nil); response.Code != 200 {
			t.Fatalf("line budget early %d: %d", i, response.Code)
		}
	}
	if response := request(app, "GET", "/api/content/lines?ids="+ids["lines:ticket-line"], token, nil); response.Code != 429 {
		t.Errorf("record budget: %d", response.Code)
	}
}

func TestContentOpaqueAttemptsAndAssistedReveal(t *testing.T) {
	app, ids := contentTestApp(t)
	token, _ := createSession(t, app, "Ada")
	input := AttemptInput{ID: "reveal-one", ExerciseID: ids["exercises:exercise-one"], ItemID: ids["items:item-one"], QuestID: ids["quests:a1-arrival"], Mode: "recognition", Reveal: true}
	response := request(app, "POST", "/api/attempt", token, input)
	if response.Code != 200 {
		t.Fatalf("reveal: %d %s", response.Code, response.Body.String())
	}
	var result struct {
		Correct     bool     `json:"correct"`
		Assisted    bool     `json:"assisted"`
		ModelAnswer string   `json:"modelAnswer"`
		Progress    Progress `json:"progress"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if result.Correct || !result.Assisted || result.ModelAnswer != "Guten Tag" || result.Progress.ExerciseStats[ids["exercises:exercise-one"]].UnaidedSuccesses != 0 || result.Progress.Attempts != 1 {
		t.Errorf("reveal evidence: %s", response.Body.String())
	}
	input.ID = "locked-reveal"
	input.ExerciseID = ids["exercises:exercise-two"]
	input.ItemID = ids["items:item-two"]
	input.QuestID = ids["quests:a1-cafe"]
	input.Mode = "production"
	if response := request(app, "POST", "/api/attempt", token, input); response.Code != 404 || strings.Contains(response.Body.String(), "Ich bin hier") {
		t.Errorf("hidden answer oracle: %d %s", response.Code, response.Body.String())
	}
	input.ID = "preview-reveal"
	input.Preview = true
	if response := request(app, "POST", "/api/attempt", token, input); response.Code != 400 {
		t.Errorf("preview reveal: %d", response.Code)
	}
}

// A fresh guest can walk into Marta's café on the opening map, so the station's
// practice and its linked activity must load before the café quest opens.
func TestContentInteriorStationExercisesFollowTheRoom(t *testing.T) {
	app, ids := contentTestApp(t)
	token, _ := createSession(t, app, "Ada")
	for slug, want := range map[string]int{"exercise-station": 200, "exercise-activity": 200, "exercise-off-route": 404, "exercise-two": 404} {
		if response := request(app, "GET", "/api/content/exercises/"+ids["exercises:"+slug], token, nil); response.Code != want {
			t.Errorf("%s: %d, want %d: %s", slug, response.Code, want, response.Body.String())
		}
	}
	// The client holds station practice back until its context words are restored.
	if response := request(app, "GET", "/api/content/exercises/"+ids["exercises:exercise-station"], token, nil); !strings.Contains(response.Body.String(), `"wordIds":["`+ids["lexemes:secret"]+`"]`) {
		t.Errorf("station context words: %s", response.Body.String())
	}
	response := request(app, "GET", "/api/content/minigames/"+ids["minigames:activity:cafe:A1"], token, nil)
	if response.Code != 200 || !strings.Contains(response.Body.String(), ids["exercises:exercise-activity"]) {
		t.Fatalf("station activity: %d %s", response.Code, response.Body.String())
	}
	// Opening the room does not restore its words: pacing still guards grading.
	input := AttemptInput{ID: "station-word", ExerciseID: ids["exercises:exercise-station"], ItemID: ids["items:item-two"], Mode: "recognition", Answer: "Ein Geheimnis"}
	if response := request(app, "POST", "/api/attempt", token, input); response.Code != 409 {
		t.Errorf("unintroduced station word: %d %s", response.Code, response.Body.String())
	}
	input = AttemptInput{ID: "station-phrase", ExerciseID: ids["exercises:exercise-activity"], ItemID: ids["items:item-two"], Mode: "recognition", Answer: "Mit Milch, bitte."}
	if response := request(app, "POST", "/api/attempt", token, input); response.Code != 200 || !strings.Contains(response.Body.String(), `"correct":true`) {
		t.Errorf("station phrase: %d %s", response.Code, response.Body.String())
	}
}

// German-only narrative lines still need the support dictionary expected by
// the client, even when there is no translation in the requested language.
func TestSafeContentPreservesEmptyLineSupport(t *testing.T) {
	for _, support := range []map[string]any{{}, {"fr": map[string]any{"text": "French only"}}} {
		line := safeContent(map[string]any{"de": map[string]any{"text": "Hallo"}, "support": support}, "en").(map[string]any)
		translations, ok := line["support"].(map[string]any)
		if !ok || len(translations) != 0 {
			t.Fatal("missing translations must remain an empty support dictionary")
		}
	}
}
