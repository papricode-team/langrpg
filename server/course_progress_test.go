package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

const tinyCourseJSON = `{
"lexicon":[{"id":"bahnhof","level":"A1"},{"id":"kaffee","level":"A1"}],
"items":[{"id":"word-bahnhof","level":"A1"},{"id":"word-kaffee","level":"A1"},{"id":"context","level":"A1"}],
"exercises":[
 {"id":"word-bahnhof-recognition","itemId":"word-bahnhof","mode":"recognition","answer":"station","targetWordId":"bahnhof","wordIds":["bahnhof"]},
 {"id":"word-bahnhof-production","itemId":"word-bahnhof","mode":"production","answer":"der Bahnhof","targetWordId":"bahnhof"},
 {"id":"word-bahnhof-listening","itemId":"word-bahnhof","mode":"listening","answer":"der Bahnhof","targetWordId":"bahnhof"},
 {"id":"word-kaffee-recognition","itemId":"word-kaffee","mode":"recognition","answer":"coffee","targetWordId":"kaffee"},
 {"id":"context-recognition","itemId":"context","mode":"recognition","answer":"Am Bahnhof trinke ich Kaffee.","wordIds":["bahnhof","kaffee"]}
],
"units":[{"id":"unit-station","level":"A1","reward":20,"requiredItemIds":["word-bahnhof"],"requiredWordIds":["bahnhof"],"requiredExerciseIds":["word-bahnhof-recognition","word-bahnhof-production"]}]
}`

func courseTestApp(t *testing.T) *App {
	t.Helper()
	course, err := parseCurriculum([]byte(tinyCourseJSON))
	if err != nil {
		t.Fatal(err)
	}
	store, err := NewJSONStore("")
	if err != nil {
		t.Fatal(err)
	}
	app := NewApp(store, course, nil, 10)
	app.now = func() time.Time { return time.Date(2026, 10, 8, 12, 0, 0, 0, time.UTC) }
	t.Cleanup(app.Close)
	return app
}

func courseAttempt(t *testing.T, app *App, token, id, exerciseID string, hinted bool) attemptResponse {
	t.Helper()
	exercise := app.curriculum.Exercises[exerciseID]
	return decodeAttempt(t, request(app, "POST", "/api/attempt", token, AttemptInput{ID: id, ItemID: exercise.ItemID, ExerciseID: exercise.ID, Mode: exercise.Mode, Answer: exercise.Answer, Hinted: hinted}))
}

func TestContextExposesWordsWithoutTransferringPhraseMastery(t *testing.T) {
	app := courseTestApp(t)
	token, _ := createSession(t, app, "Ada")
	result := courseAttempt(t, app, token, "context-once", "context-recognition", false)
	for _, id := range []string{"bahnhof", "kaffee"} {
		word := result.Progress.Words[id]
		if word.Exposures != 1 || word.ContextExposures != 1 || word.DirectAttempts != 0 || word.Mastery != "exposed" || len(word.Cards) != 0 || len(word.ModeStats) != 0 {
			t.Fatalf("context invented word mastery: %+v", word)
		}
		if !word.DueAt.IsZero() {
			t.Fatalf("context exposure invented a recall deadline: %+v", word)
		}
	}
	duplicate := courseAttempt(t, app, token, "context-once", "context-recognition", false)
	if !duplicate.Duplicate || duplicate.Progress.Words["bahnhof"].Exposures != 1 {
		t.Fatal("duplicate added exposure")
	}
	if got := request(app, "POST", "/api/course/complete", token, map[string]string{"unitId": "unit-station"}).Code; got != 409 {
		t.Fatalf("context completed lexical unit: %d", got)
	}
}

func TestDirectWordRecognitionCannotTransferToAnotherModeOrWord(t *testing.T) {
	app := courseTestApp(t)
	token, _ := createSession(t, app, "Ada")
	result := courseAttempt(t, app, token, "recognized", "word-bahnhof-recognition", false)
	word := result.Progress.Words["bahnhof"]
	if word.Exposures != 1 || word.ContextExposures != 0 || word.DirectAttempts != 1 || word.Evidence["recognition"].UnaidedSuccesses != 1 || word.Mastery != "learning" {
		t.Fatalf("missing direct evidence %+v", word)
	}
	if word.Evidence["production"].Attempts != 0 || word.Evidence["listening"].Attempts != 0 || len(result.Progress.Items["word-bahnhof"].Cards) != 1 {
		t.Fatalf("recognition claimed other modalities %+v", word)
	}
	if _, exists := result.Progress.Words["kaffee"]; exists {
		t.Fatal("direct drill exposed unrelated word")
	}
	if got := request(app, "POST", "/api/course/complete", token, map[string]string{"unitId": "unit-station"}).Code; got != 409 {
		t.Fatalf("recognition substituted for required production: %d", got)
	}
}

func TestAssistedWordPracticeAndTranscriptFallbackDoNotCreateIndependentEvidence(t *testing.T) {
	app := courseTestApp(t)
	token, _ := createSession(t, app, "Ada")
	result := courseAttempt(t, app, token, "helped", "word-bahnhof-production", true)
	word := result.Progress.Words["bahnhof"]
	if result.XPAdded != 0 || word.ModeStats["production"].UnaidedSuccesses != 0 || len(word.Cards) != 0 {
		t.Fatalf("hint created mastery %+v", word)
	}
	if got := request(app, "POST", "/api/course/complete", token, map[string]string{"unitId": "unit-station"}).Code; got != 409 {
		t.Fatalf("assistance completed independent unit: %d", got)
	}
	ex := app.curriculum.Exercises["word-bahnhof-listening"]
	result = decodeAttempt(t, request(app, "POST", "/api/attempt", token, AttemptInput{ID: "transcript", ItemID: ex.ItemID, ExerciseID: ex.ID, Mode: "recognition", Hinted: true, Answer: ex.Answer}))
	word = result.Progress.Words["bahnhof"]
	if len(result.Progress.Items["word-bahnhof"].Cards) != 0 || word.Evidence["listening"].UnaidedSuccesses != 0 || result.Progress.Items["word-bahnhof"].PracticeDueAt["listening"].IsZero() {
		t.Fatalf("transcript created listening mastery %+v", word)
	}
}

func TestWordFSRSIgnoresEarlyRepetitionAndRetainsModalitiesSeparately(t *testing.T) {
	app := courseTestApp(t)
	token, _ := createSession(t, app, "Ada")
	first := courseAttempt(t, app, token, "first", "word-bahnhof-recognition", false)
	initial := first.Progress.Words["bahnhof"]
	early := courseAttempt(t, app, token, "early", "word-bahnhof-recognition", false)
	if early.XPAdded != 0 || early.Progress.Words["bahnhof"].StabilityDays != initial.StabilityDays || early.Progress.Words["bahnhof"].DueAt != initial.DueAt || early.Progress.Words["bahnhof"].Evidence["recognition"].Status == "retained" {
		t.Fatal("early known answer inflated retention")
	}
	result := early
	for i := 0; i < 5 && result.Progress.Words["bahnhof"].Evidence["recognition"].Status != "retained"; i++ {
		next := result.Progress.Items["word-bahnhof"].Cards["recognition"].Due.Add(12 * time.Hour)
		app.now = func() time.Time { return next }
		result = courseAttempt(t, app, token, "spaced-"+strings.Repeat("x", i+1), "word-bahnhof-recognition", false)
	}
	word := result.Progress.Words["bahnhof"]
	if word.Evidence["recognition"].Status != "retained" || word.Mastery != "learning" || word.Evidence["production"].Status != "unseen" || word.Evidence["listening"].Status != "unseen" {
		t.Fatalf("bad modality retention %+v", word)
	}
	wrong := AttemptInput{ID: "lapse", ItemID: "word-bahnhof", ExerciseID: "word-bahnhof-recognition", Mode: "recognition", Answer: "airport"}
	result = decodeAttempt(t, request(app, "POST", "/api/attempt", token, wrong))
	if result.Correct || result.XPAdded != 0 || result.Progress.Words["bahnhof"].Evidence["recognition"].Status == "retained" || result.Progress.Words["bahnhof"].DueAt.After(app.now().Add(11*time.Minute)) {
		t.Fatalf("lapse failed to reset retention %+v", result)
	}
}

func TestCourseCompletionExactEvidenceAndConcurrentRewards(t *testing.T) {
	app := courseTestApp(t)
	token, _ := createSession(t, app, "Ada")
	if got := request(app, "POST", "/api/course/complete", token, map[string]string{"unitId": "invented"}).Code; got != 400 {
		t.Fatalf("unknown unit: %d", got)
	}
	courseAttempt(t, app, token, "r", "word-bahnhof-recognition", false)
	courseAttempt(t, app, token, "p-help", "word-bahnhof-production", true)
	if got := request(app, "POST", "/api/course/complete", token, map[string]string{"unitId": "unit-station"}).Code; got != 409 {
		t.Fatalf("hinted target accepted: %d", got)
	}
	courseAttempt(t, app, token, "p", "word-bahnhof-production", false)
	var wg sync.WaitGroup
	for range 12 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			w := request(app, "POST", "/api/course/complete", token, map[string]string{"unitId": "unit-station"})
			if w.Code != 200 {
				t.Errorf("completion %d %s", w.Code, w.Body.String())
			}
		}()
	}
	wg.Wait()
	w := request(app, "GET", "/api/progress", token, nil)
	var progress Progress
	_ = json.Unmarshal(w.Body.Bytes(), &progress)
	if progress.XP != 34 || len(progress.CompletedUnitIDs) != 1 || progress.CompletedUnitIDs[0] != "unit-station" {
		t.Fatalf("course reward farmed %+v", progress)
	}
}

func TestOldJSONProgressMigratesWithoutResettingOrInventingWords(t *testing.T) {
	path := filepath.Join(t.TempDir(), "old-state.json")
	token := strings.Repeat("a", 43)
	old := `{"version":1,"accounts":{"old":{"player":{"id":"old","name":"Ada"},"progress":{"xp":91,"completedQuestIds":["quest"],"attempts":8,"correctAttempts":6,"items":{"old-item":{"itemId":"old-item","repetitions":2}}},"createdAt":"2026-01-01T00:00:00Z"}},"sessions":{"` + tokenHash(token) + `":"old"},"actions":{}}`
	if err := os.WriteFile(path, []byte(old), 0600); err != nil {
		t.Fatal(err)
	}
	store, err := NewJSONStore(path)
	if err != nil {
		t.Fatal(err)
	}
	account, err := store.Get(context.Background(), tokenHash(token))
	if err != nil {
		t.Fatal(err)
	}
	p := account.Progress
	if p.XP != 91 || p.Attempts != 8 || p.Items["old-item"].Repetitions != 2 || len(p.CompletedQuestIDs) != 1 || p.Words == nil || len(p.Words) != 0 || p.ExerciseStats == nil || p.CompletedUnitIDs == nil || p.Activities == nil {
		t.Fatalf("migration damaged old progress %+v", p)
	}
	before, _ := os.ReadFile(path)
	course, err := parseCurriculum([]byte(tinyCourseJSON))
	if err != nil {
		t.Fatal(err)
	}
	app := NewApp(store, course, nil, 10)
	app.now = func() time.Time { return time.Now().UTC() }
	defer app.Close()
	courseAttempt(t, app, token, "new-evidence", "word-bahnhof-recognition", false)
	after, _ := os.ReadFile(path)
	if string(after) == string(before) {
		t.Fatal("new progress was not persisted")
	}
	store2, err := NewJSONStore(path)
	if err != nil {
		t.Fatal(err)
	}
	restored, err := store2.Get(context.Background(), tokenHash(token))
	if err != nil {
		t.Fatal(err)
	}
	if restored.Progress.XP != 97 || restored.Progress.Words["bahnhof"].DirectAttempts != 1 || restored.Progress.Items["old-item"].Repetitions != 2 {
		t.Fatalf("persisted migration lost state %+v", restored.Progress)
	}
}

func TestCourseManifestRejectsInvalidWordLinksAndMergeDuplicates(t *testing.T) {
	for _, altered := range []string{
		strings.Replace(tinyCourseJSON, `"wordIds":["bahnhof","kaffee"]`, `"wordIds":["invented"]`, 1),
		strings.Replace(tinyCourseJSON, `"targetWordId":"bahnhof"`, `"targetWordId":"kaffee"`, 1),
		strings.Replace(tinyCourseJSON, `"requiredExerciseIds":["word-bahnhof-recognition","word-bahnhof-production"]`, `"requiredExerciseIds":["invented"]`, 1),
	} {
		if _, err := parseCurriculum([]byte(altered)); err == nil {
			t.Fatal("invalid course link accepted")
		}
	}
	course, err := parseCurriculum([]byte(tinyCourseJSON))
	if err != nil {
		t.Fatal(err)
	}
	if _, err = mergeCurriculum(course, course); err == nil {
		t.Fatal("merge overwrote canonical IDs")
	}
}

func TestLegacyContextLinksMergeAndMigrateExposureOnlyOnce(t *testing.T) {
	manifest := strings.Replace(tinyCourseJSON, `"lexicon":`, `"contextWordIds":{"exercise-one":["bahnhof","kaffee"]},"lexicon":`, 1)
	course, err := parseCurriculum([]byte(manifest))
	if err != nil {
		t.Fatal(err)
	}
	merged, err := mergeCurriculum(testCurriculum(), course)
	if err != nil {
		t.Fatal(err)
	}
	if merged.Exercises["exercise-one"].Answer != "Guten Tag" || len(merged.Exercises["exercise-one"].WordIDs) != 2 {
		t.Fatal("context merge changed grading or lost exposure")
	}
	store, err := NewJSONStore(filepath.Join(t.TempDir(), "state.json"))
	if err != nil {
		t.Fatal(err)
	}
	app := NewApp(store, merged, nil, 10)
	defer app.Close()
	token := strings.Repeat("b", 43)
	seen := time.Date(2026, 10, 1, 12, 0, 0, 0, time.UTC)
	old := Account{Player: Player{ID: "old-context", Name: "Ada"}, Progress: Progress{XP: 24, Items: map[string]Memory{"item-one": {ItemID: "item-one", StabilityDays: 15, Repetitions: 4, LastSeenAt: seen, ModeStats: map[string]ModeStats{"recognition": {Attempts: 4, Correct: 4, UnaidedSuccesses: 4}}}}}}
	if err = store.Create(context.Background(), tokenHash(token), old); err != nil {
		t.Fatal(err)
	}
	for range 2 {
		w := request(app, "GET", "/api/progress", token, nil)
		if w.Code != 200 {
			t.Fatalf("migration read %d %s", w.Code, w.Body.String())
		}
		var p Progress
		_ = json.Unmarshal(w.Body.Bytes(), &p)
		for _, id := range []string{"bahnhof", "kaffee"} {
			word := p.Words[id]
			if word.Exposures != 4 || word.ContextExposures != 4 || word.DirectAttempts != 0 || len(word.Cards) != 0 || len(word.ModeStats) != 0 || word.Mastery != "exposed" || word.LastSeenAt != seen {
				t.Fatalf("legacy phrase invented independent mastery %+v", word)
			}
		}
		if p.XP != 24 || p.Items["item-one"].StabilityDays != 15 || p.WordExposureVersion != 2 {
			t.Fatal("migration changed existing learning")
		}
	}
	if len(store.state.Actions["old-context"]) != 1 {
		t.Fatal("migration repeatedly wrote receipts")
	}
	if _, err := mergeCurriculum(testCurriculum(), func() Curriculum {
		bad, _ := parseCurriculum([]byte(strings.Replace(manifest, `"exercise-one":[`, `"unknown-exercise":[`, 1)))
		return bad
	}()); err == nil {
		t.Fatal("unknown legacy context exercise accepted")
	}
}

func missionTestApp(t *testing.T) *App {
	t.Helper()
	b, err := curriculumFiles.ReadFile("curriculum.json")
	if err != nil {
		t.Fatal(err)
	}
	c, err := parseCurriculum(b)
	if err != nil {
		t.Fatal(err)
	}
	store, err := NewJSONStore("")
	if err != nil {
		t.Fatal(err)
	}
	app := NewApp(store, c, nil, 10)
	t.Cleanup(app.Close)
	return app
}

func missionSuccesses(t *testing.T, app *App, token, runID string) ActivityCompletionInput {
	t.Helper()
	ids := append([]string{}, activityPools["cafe"]["A1"][:3]...)
	proofs := []string{}
	for i, id := range ids {
		ex := app.curriculum.Exercises[id]
		attemptID := runID + "-" + strings.Repeat("x", i+1)
		decodeAttempt(t, request(app, "POST", "/api/attempt", token, AttemptInput{ID: attemptID, ItemID: ex.ItemID, ExerciseID: ex.ID, Mode: ex.Mode, Answer: ex.Answer, ActivityID: "cafe", RunID: runID, Level: "A1"}))
		proofs = append(proofs, attemptID)
	}
	return ActivityCompletionInput{ID: runID, ActivityID: "cafe", Level: "A1", ExerciseIDs: ids, AttemptIDs: proofs}
}

func TestActivityUsesCurrentRunProofAndCannotFarmRewards(t *testing.T) {
	app := missionTestApp(t)
	token, _ := createSession(t, app, "Ada")
	ids := activityPools["cafe"]["A1"][:3]
	fake := ActivityCompletionInput{ID: "fake", ActivityID: "cafe", Level: "A1", ExerciseIDs: ids, AttemptIDs: []string{"fake-one", "fake-two", "fake-three"}}
	if got := request(app, "POST", "/api/activity/complete", token, fake).Code; got != 409 {
		t.Fatalf("invented proof accepted %d", got)
	}
	proof := missionSuccesses(t, app, token, "run-one")
	wrongEx := app.curriculum.Exercises[ids[0]]
	decodeAttempt(t, request(app, "POST", "/api/attempt", token, AttemptInput{ID: "wrong-before-finish", ItemID: wrongEx.ItemID, ExerciseID: wrongEx.ID, Mode: wrongEx.Mode, Answer: "wrong", ActivityID: "cafe", RunID: "run-one"}))
	var result struct {
		XPAdded   int              `json:"xpAdded"`
		Duplicate bool             `json:"duplicate"`
		Activity  ActivityProgress `json:"activity"`
		Progress  Progress         `json:"progress"`
	}
	w := request(app, "POST", "/api/activity/complete", token, proof)
	if w.Code != 200 {
		t.Fatalf("valid completion %d %s", w.Code, w.Body.String())
	}
	_ = json.Unmarshal(w.Body.Bytes(), &result)
	if result.XPAdded != 20 || result.Activity.CorrectedAnswers != 1 || result.Activity.Completions != 1 {
		t.Fatalf("incorrect server outcome %+v", result)
	}
	proof.ExerciseIDs = []string{proof.ExerciseIDs[2], proof.ExerciseIDs[0], proof.ExerciseIDs[1]}
	w = request(app, "POST", "/api/activity/complete", token, proof)
	_ = json.Unmarshal(w.Body.Bytes(), &result)
	if w.Code != 200 || !result.Duplicate || result.XPAdded != 0 || result.Activity.Completions != 1 {
		t.Fatal("reordered retry farmed reward")
	}
	proof.ID = "run-forged"
	if got := request(app, "POST", "/api/activity/complete", token, proof).Code; got != 409 {
		t.Fatalf("old proof completed new run %d", got)
	}
	second := missionSuccesses(t, app, token, "run-two")
	w = request(app, "POST", "/api/activity/complete", token, second)
	_ = json.Unmarshal(w.Body.Bytes(), &result)
	if w.Code != 200 || result.XPAdded != 0 || result.Activity.Completions != 2 {
		t.Fatal("repeat real run did not track without farming")
	}
}

func TestActivityRejectsCrossLevelUnrelatedAndDuplicateTargets(t *testing.T) {
	app := missionTestApp(t)
	token, _ := createSession(t, app, "Ada")
	proof := missionSuccesses(t, app, token, "run-valid")
	cross := proof
	cross.Level = "A2"
	if got := request(app, "POST", "/api/activity/complete", token, cross).Code; got != 400 {
		t.Fatalf("cross-level mission accepted %d", got)
	}
	cross = proof
	cross.ActivityID = "unknown"
	if got := request(app, "POST", "/api/activity/complete", token, cross).Code; got != 400 {
		t.Fatalf("unknown mission accepted %d", got)
	}
	cross = proof
	cross.ExerciseIDs = []string{proof.ExerciseIDs[0], proof.ExerciseIDs[0], proof.ExerciseIDs[2]}
	if got := request(app, "POST", "/api/activity/complete", token, cross).Code; got != 400 {
		t.Fatalf("duplicate targets accepted %d", got)
	}
	ex := app.curriculum.Exercises["a1-arrival-exercise-1"]
	if got := request(app, "POST", "/api/attempt", token, AttemptInput{ID: "unrelated", ItemID: ex.ItemID, ExerciseID: ex.ID, Mode: ex.Mode, Answer: ex.Answer, ActivityID: "cafe", RunID: "run-valid"}).Code; got != 400 {
		t.Fatalf("unrelated mission attempt accepted %d", got)
	}
}

func TestPausedActivityUsesDurableProofAfterHistoryEvictionAndRestart(t *testing.T) {
	app := missionTestApp(t)
	store := app.store.(*JSONStore)
	store.path = filepath.Join(t.TempDir(), "state.json")
	started := time.Date(2026, 10, 8, 12, 0, 0, 0, time.UTC)
	app.now = func() time.Time { return started }
	token, _ := createSession(t, app, "Ada")
	proof := missionSuccesses(t, app, token, "paused-run")
	ex := app.curriculum.Exercises[proof.ExerciseIDs[0]]
	decodeAttempt(t, request(app, "POST", "/api/attempt", token, AttemptInput{ID: "paused-wrong", ItemID: ex.ItemID, ExerciseID: ex.ID, Mode: ex.Mode, Answer: "wrong", ActivityID: "cafe", RunID: proof.ID}))
	_, _, _, err := store.Mutate(context.Background(), tokenHash(token), "test-history-eviction", json.RawMessage(`{}`), func(account *Account) (Receipt, error) {
		// Exercise the actual bounded-history eviction routine without issuing
		// hundreds of HTTP requests through the normal per-minute rate guard.
		for i := range 300 {
			id := fmt.Sprintf("later-%03d", i)
			recordWordEvidence(&account.Progress, ex, AttemptInput{ID: id}, true, started.Add(time.Duration(i+1)*time.Minute))
		}
		return Receipt{}, nil
	})
	if err != nil {
		t.Fatal(err)
	}
	restored, err := NewJSONStore(store.path)
	if err != nil {
		t.Fatal(err)
	}
	app.store = restored
	account, err := restored.Get(context.Background(), tokenHash(token))
	if err != nil || len(account.Progress.RecentAttempts) != 256 {
		t.Fatalf("bounded recent history not preserved: %v", err)
	}
	if _, exists := account.Progress.RecentAttempts[proof.AttemptIDs[0]]; exists {
		t.Fatal("mission proof was not actually evicted")
	}
	app.now = func() time.Time { return started.Add(30 * 24 * time.Hour) }
	otherToken, _ := createSession(t, app, "Mira")
	if got := request(app, "POST", "/api/activity/complete", otherToken, proof).Code; got != 409 {
		t.Fatalf("another account reused persisted receipts: %d", got)
	}
	w := request(app, "POST", "/api/activity/complete", token, proof)
	var result struct {
		XPAdded  int              `json:"xpAdded"`
		Activity ActivityProgress `json:"activity"`
	}
	if w.Code != 200 {
		t.Fatalf("paused mission failed after restart: %d %s", w.Code, w.Body.String())
	}
	_ = json.Unmarshal(w.Body.Bytes(), &result)
	if result.XPAdded != 20 || result.Activity.CorrectedAnswers != 1 || result.Activity.Completions != 1 {
		t.Fatalf("durable receipt outcome changed: %+v", result)
	}
	proof.ID = "different-run"
	if got := request(app, "POST", "/api/activity/complete", token, proof).Code; got != 409 {
		t.Fatalf("paused proof reused in another run: %d", got)
	}
}

func TestActivityDoesNotTrustForgedRecentProgress(t *testing.T) {
	app := missionTestApp(t)
	token, _ := createSession(t, app, "Ada")
	proof := ActivityCompletionInput{ID: "forged-run", ActivityID: "cafe", Level: "A1", ExerciseIDs: append([]string{}, activityPools["cafe"]["A1"][:3]...), AttemptIDs: []string{"fake-one", "fake-two", "fake-three"}}
	_, _, _, err := app.store.Mutate(context.Background(), tokenHash(token), "test-forged-cache", json.RawMessage(`{}`), func(account *Account) (Receipt, error) {
		for i, id := range proof.AttemptIDs {
			account.Progress.RecentAttempts[id] = AttemptEvidence{ID: id, ExerciseID: proof.ExerciseIDs[i], Correct: true, ActivityID: proof.ActivityID, RunID: proof.ID, At: app.now()}
		}
		return Receipt{}, nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if got := request(app, "POST", "/api/activity/complete", token, proof).Code; got != 409 {
		t.Fatalf("forged progress cache substituted for immutable receipts: %d", got)
	}
}

func TestActivityAndCourseEndpointsRequireAuthAndOrigins(t *testing.T) {
	app := courseTestApp(t)
	token, _ := createSession(t, app, "Ada")
	for _, path := range []string{"/api/activity/complete", "/api/course/complete", "/api/exposure"} {
		if got := request(app, "POST", path, "", map[string]string{}).Code; got != 401 {
			t.Fatalf("unauthenticated %s: %d", path, got)
		}
		r := httptest.NewRequest("POST", path, strings.NewReader(`{}`))
		r.Header.Set("Content-Type", "application/json")
		r.Header.Set("Authorization", "Bearer "+token)
		r.Header.Set("Origin", "https://untrusted.example")
		w := httptest.NewRecorder()
		app.Handler().ServeHTTP(w, r)
		if w.Code != 403 {
			t.Fatalf("cross-site %s: %d", path, w.Code)
		}
	}
}

func TestMissionBoardOutputIsAlwaysSupportedProduction(t *testing.T) {
	app := missionTestApp(t)
	token, _ := createSession(t, app, "Ada")
	id := "a1-cafe-exercise-1"
	ex := app.curriculum.Exercises[id]
	if ex.Mode != "production" {
		t.Fatal("test target changed mode")
	}
	result := decodeAttempt(t, request(app, "POST", "/api/attempt", token, AttemptInput{ID: "board-output", ItemID: ex.ItemID, ExerciseID: ex.ID, Mode: ex.Mode, Answer: ex.Answer, ActivityID: "cafe", RunID: "run-output", Hinted: false}))
	if !result.Correct || result.XPAdded != 0 || result.Progress.ExerciseStats[id].UnaidedSuccesses != 0 || !result.Progress.RecentAttempts["board-output"].Hinted || len(result.Progress.Items[ex.ItemID].Cards) != 0 {
		t.Fatalf("canonical board output claimed independent production %+v", result)
	}
}

func TestMissionBoardCanRecordSupportedRecognitionWithoutOpeningWordModeOverrides(t *testing.T) {
	app := missionTestApp(t)
	token, _ := createSession(t, app, "Ada")
	ex := app.curriculum.Exercises["a1-cafe-exercise-1"]
	input := AttemptInput{ID: "board-recognition", ItemID: ex.ItemID, ExerciseID: ex.ID, Mode: "recognition", Answer: ex.Answer, Hinted: true, ActivityID: "cafe", RunID: "run-recognition"}
	result := decodeAttempt(t, request(app, "POST", "/api/attempt", token, input))
	if !result.Correct || result.XPAdded != 0 || result.Progress.Items[ex.ItemID].ModeStats["recognition"].Correct != 1 || result.Progress.Items[ex.ItemID].ModeStats["production"].Attempts != 0 || len(result.Progress.Items[ex.ItemID].Cards) != 0 {
		t.Fatal("mission did not record supported comprehension")
	}
	input.ID = "unsupported"
	input.Hinted = false
	if got := request(app, "POST", "/api/attempt", token, input).Code; got != 400 {
		t.Fatalf("unassisted mode override accepted %d", got)
	}
	wordApp := courseTestApp(t)
	wordToken, _ := createSession(t, wordApp, "Mira")
	word := wordApp.curriculum.Exercises["word-bahnhof-production"]
	if got := request(wordApp, "POST", "/api/attempt", wordToken, AttemptInput{ID: "word-override", ItemID: word.ItemID, ExerciseID: word.ID, Mode: "recognition", Answer: word.Answer, Hinted: true}).Code; got != 400 {
		t.Fatalf("mission opened global word mode override %d", got)
	}
}

func TestVisibleExposurePersistsWithoutAnswerXPOrFSRSAndRetriesAreIdempotent(t *testing.T) {
	app := courseTestApp(t)
	token, _ := createSession(t, app, "Ada")
	var result struct {
		XPAdded   int      `json:"xpAdded"`
		Duplicate bool     `json:"duplicate"`
		Progress  Progress `json:"progress"`
	}
	w := request(app, "POST", "/api/exposure", token, ExposureInput{ExerciseID: "context-recognition"})
	if w.Code != 200 {
		t.Fatalf("exposure %d %s", w.Code, w.Body.String())
	}
	_ = json.Unmarshal(w.Body.Bytes(), &result)
	for _, id := range []string{"bahnhof", "kaffee"} {
		word := result.Progress.Words[id]
		if word.Exposures != 1 || word.DirectAttempts != 0 || word.Mastery != "exposed" || len(word.ModeStats) != 0 {
			t.Fatalf("reading invented mastery %+v", word)
		}
	}
	if result.XPAdded != 0 || result.Progress.XP != 0 || result.Progress.Attempts != 0 || len(result.Progress.Items) != 0 || len(result.Progress.ExerciseStats) != 0 {
		t.Fatal("exposure graded or rewarded an answer")
	}
	firstRevision := result.Progress.Revision
	if firstRevision != 1 {
		t.Fatalf("first mutation revision %d", firstRevision)
	}
	w = request(app, "POST", "/api/exposure", token, ExposureInput{ExerciseID: "context-recognition", Level: "A1"})
	_ = json.Unmarshal(w.Body.Bytes(), &result)
	if w.Code != 200 || !result.Duplicate || result.Progress.Words["bahnhof"].Exposures != 1 {
		t.Fatal("context rerender inflated exposure")
	}
	if result.Progress.Revision != firstRevision {
		t.Fatal("duplicate advanced revision")
	}
	w = request(app, "POST", "/api/exposure", token, ExposureInput{WordIDs: []string{"kaffee", "bahnhof"}})
	_ = json.Unmarshal(w.Body.Bytes(), &result)
	if w.Code != 200 || result.Progress.Words["bahnhof"].Exposures != 2 {
		t.Fatal("visible word list not recorded")
	}
	if result.Progress.Revision != firstRevision+1 {
		t.Fatal("new mutation did not advance revision")
	}
	w = request(app, "POST", "/api/exposure", token, ExposureInput{WordIDs: []string{"bahnhof", "kaffee", "bahnhof"}, Level: "A1"})
	_ = json.Unmarshal(w.Body.Bytes(), &result)
	if w.Code != 200 || !result.Duplicate || result.Progress.Words["bahnhof"].Exposures != 2 {
		t.Fatal("sorted visible-word retry was not idempotent")
	}
	account, err := app.store.Get(context.Background(), tokenHash(token))
	if err != nil {
		t.Fatal(err)
	}
	if account.Progress.Words["bahnhof"].ContextExposures != 2 || account.Progress.Words["bahnhof"].LastSeenAt.IsZero() {
		t.Fatal("reading-only exposure did not persist")
	}
}

func TestVisibleExposureCannotAlterEstablishedWordRecall(t *testing.T) {
	app := courseTestApp(t)
	token, _ := createSession(t, app, "Ada")
	before := courseAttempt(t, app, token, "direct-first", "word-bahnhof-recognition", false)
	word := before.Progress.Words["bahnhof"]
	w := request(app, "POST", "/api/exposure", token, ExposureInput{WordIDs: []string{"bahnhof"}})
	if w.Code != 200 {
		t.Fatalf("visible known word %d", w.Code)
	}
	var response struct {
		Progress Progress `json:"progress"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &response)
	after := response.Progress.Words["bahnhof"]
	if after.DueAt != word.DueAt || after.StabilityDays != word.StabilityDays || after.ModeStats["recognition"].UnaidedSuccesses != 1 || after.Evidence["recognition"].StabilityDays != word.Evidence["recognition"].StabilityDays || response.Progress.XP != before.Progress.XP {
		t.Fatalf("exposure rescheduled a known word %+v", after)
	}
	if strings.Contains(w.Body.String(), `"wordId":"bahnhof","cards"`) || len(after.Cards) != 0 {
		t.Fatal("word response duplicates canonical FSRS cards")
	}
	if len(response.Progress.Items["word-bahnhof"].Cards) != 1 {
		t.Fatal("canonical word card was lost")
	}
}

func TestExposureRejectsUnknownMixedOversizedAndCrossLevelContexts(t *testing.T) {
	app := courseTestApp(t)
	token, _ := createSession(t, app, "Ada")
	for _, input := range []ExposureInput{
		{}, {WordIDs: []string{"invented"}}, {ExerciseID: "invented"}, {UnitID: "invented"},
		{ExerciseID: "context-recognition", WordIDs: []string{"bahnhof"}}, {ExerciseID: "context-recognition", Level: "B1"},
		{ActivityID: "unknown", Level: "A1"}, {ActivityID: "cafe"}, {WordIDs: []string{"bahnhof"}, Level: "C2"},
		{WordIDs: func() []string {
			ids := []string{}
			for range 37 {
				ids = append(ids, "bahnhof")
			}
			return ids
		}()},
	} {
		if got := request(app, "POST", "/api/exposure", token, input).Code; got != 400 {
			t.Fatalf("invalid exposure accepted %d %+v", got, input)
		}
	}
	account, err := app.store.Get(context.Background(), tokenHash(token))
	if err != nil {
		t.Fatal(err)
	}
	if len(account.Progress.Words) != 0 || account.Progress.XP != 0 {
		t.Fatal("invalid exposure wrote progress")
	}
}

func TestSceneExposureUsesOnlyTheDisplayedCanonicalScenario(t *testing.T) {
	app := courseTestApp(t)
	token, _ := createSession(t, app, "Ada")
	app.curriculum.ActivityWordIDs = map[string][]string{"cafe-a1-visible": {"bahnhof"}, "cafe-a1-future": {"kaffee"}, "cafe-a2-other": {"kaffee"}}
	app.curriculum.NPCWordIDs = map[string][]string{"mara": {"kaffee"}}
	w := request(app, "POST", "/api/exposure", token, ExposureInput{ActivityID: "cafe", Level: "A1", ScenarioID: "cafe-a1-visible"})
	if w.Code != 200 {
		t.Fatalf("scene exposure %d %s", w.Code, w.Body.String())
	}
	var result struct {
		Progress Progress `json:"progress"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &result)
	if result.Progress.Words["bahnhof"].Exposures != 1 {
		t.Fatal("shown scene was not exposed")
	}
	if _, exists := result.Progress.Words["kaffee"]; exists {
		t.Fatal("unseen future scene was exposed")
	}
	for _, input := range []ExposureInput{
		{ActivityID: "cafe", Level: "A1", ScenarioID: "cafe-a2-other"},
		{ActivityID: "cafe", Level: "A1", ScenarioID: "invented"},
		{ExerciseID: "context-recognition", ScenarioID: "cafe-a1-visible"},
		{NPCID: "unknown"},
	} {
		if got := request(app, "POST", "/api/exposure", token, input).Code; got != 400 {
			t.Fatalf("invalid scene exposure accepted %d %+v", got, input)
		}
	}
	w = request(app, "POST", "/api/exposure", token, ExposureInput{NPCID: "mara"})
	if w.Code != 200 {
		t.Fatalf("NPC exposure %d %s", w.Code, w.Body.String())
	}
	_ = json.Unmarshal(w.Body.Bytes(), &result)
	if result.Progress.Words["kaffee"].Mastery != "exposed" || result.Progress.XP != 0 {
		t.Fatal("NPC context claimed independent recall")
	}
}

func TestEmbeddedCourseMergesAllCanonicalTargetsAndExposureLinks(t *testing.T) {
	b, err := curriculumFiles.ReadFile("course.json")
	if err != nil {
		t.Skip("additional course manifest not available")
	}
	course, err := parseCurriculum(b)
	if err != nil {
		t.Fatal(err)
	}
	merged, err := loadCurriculum()
	if err != nil {
		t.Fatal(err)
	}
	if len(course.Lexicon) < 2400 || len(merged.Exercises) != len(course.Exercises)+126 || len(merged.Items) != len(course.Items)+126 || len(merged.ContextWordIDs) != 126 || len(merged.ActivityWordIDs) == 0 {
		t.Fatalf("incomplete embedded course: %d words/%d exercises/%d contexts", len(merged.Lexicon), len(merged.Exercises), len(merged.ContextWordIDs))
	}
	wordModes := map[string]map[string]bool{}
	for _, ex := range course.Exercises {
		if ex.TargetWordID != "" {
			if wordModes[ex.TargetWordID] == nil {
				wordModes[ex.TargetWordID] = map[string]bool{}
			}
			wordModes[ex.TargetWordID][ex.Mode] = true
		}
	}
	for id := range course.Lexicon {
		modes := wordModes[id]
		if !modes["recognition"] || !modes["production"] || !modes["listening"] {
			t.Fatalf("word %s lacks independent modality targets", id)
		}
	}
	for id, words := range course.ContextWordIDs {
		for _, word := range words {
			if !contains(merged.Exercises[id].WordIDs, word) {
				t.Fatalf("legacy mapping %s lost %s", id, word)
			}
		}
	}
}
