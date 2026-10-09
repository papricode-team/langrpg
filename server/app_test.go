package main

import (
	"bytes"
	"context"
	"encoding/json"
	"math"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/coder/websocket"
)

func testCurriculum() Curriculum {
	return Curriculum{
		Quests: map[string]Quest{"quest": {ID: "quest", Reward: 40, RequiredItemIDs: []string{"item-one", "item-two"}}},
		Items:  map[string]Item{"item-one": {ID: "item-one"}, "item-two": {ID: "item-two"}},
		Exercises: map[string]Exercise{
			"exercise-one":   {ID: "exercise-one", ItemID: "item-one", Mode: "recognition", Answer: "Guten Tag"},
			"exercise-two":   {ID: "exercise-two", ItemID: "item-two", Mode: "production", Answer: "Ich bin hier"},
			"exercise-audio": {ID: "exercise-audio", ItemID: "item-two", Mode: "listening", Answer: "der Bahnhof"},
		},
	}
}

func testApp(t *testing.T) *App {
	t.Helper()
	store, err := NewJSONStore("")
	if err != nil {
		t.Fatal(err)
	}
	app := NewApp(store, testCurriculum(), []string{"http://localhost:5173"}, 10)
	t.Cleanup(app.Close)
	return app
}

func request(app *App, method, path, token string, value any) *httptest.ResponseRecorder {
	var body bytes.Buffer
	if value != nil {
		_ = json.NewEncoder(&body).Encode(value)
	}
	r := httptest.NewRequest(method, path, &body)
	if value != nil {
		r.Header.Set("Content-Type", "application/json")
	}
	if token != "" {
		r.Header.Set("Authorization", "Bearer "+token)
	}
	w := httptest.NewRecorder()
	app.Handler().ServeHTTP(w, r)
	return w
}

func createSession(t *testing.T, app *App, name string) (string, Player) {
	t.Helper()
	w := request(app, "POST", "/api/session", "", map[string]any{"name": name, "avatar": Avatar{Hair: "#302020", Skin: "#edcaaa", Outfit: "#456789"}})
	if w.Code != 201 {
		t.Fatalf("create session: %d %s", w.Code, w.Body.String())
	}
	var value struct {
		Token  string `json:"token"`
		Player Player `json:"player"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &value); err != nil {
		t.Fatal(err)
	}
	return value.Token, value.Player
}

func attemptFor(id string) AttemptInput {
	return AttemptInput{ID: id, ItemID: "item-one", ExerciseID: "exercise-one", Answer: "Guten Tag", Mode: "recognition", QuestID: "quest"}
}

type attemptResponse struct {
	Correct   bool     `json:"correct"`
	XPAdded   int      `json:"xpAdded"`
	Duplicate bool     `json:"duplicate"`
	Progress  Progress `json:"progress"`
}

func decodeAttempt(t *testing.T, w *httptest.ResponseRecorder) attemptResponse {
	t.Helper()
	if w.Code != 200 {
		t.Fatalf("attempt: %d %s", w.Code, w.Body.String())
	}
	var response attemptResponse
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	return response
}

func TestAuthenticationAndOrigins(t *testing.T) {
	app := testApp(t)
	if got := request(app, "GET", "/api/progress", "", nil).Code; got != 401 {
		t.Fatalf("unauthenticated progress status %d", got)
	}
	if got := request(app, "GET", "/api/progress", strings.Repeat("a", 43), nil).Code; got != 401 {
		t.Fatalf("invented token status %d", got)
	}
	r := httptest.NewRequest("GET", "/api/health", nil)
	r.Header.Set("Origin", "https://evil.example")
	w := httptest.NewRecorder()
	app.Handler().ServeHTTP(w, r)
	if w.Code != 403 {
		t.Fatalf("cross-site origin status %d", w.Code)
	}
	token, _ := createSession(t, app, "Ada")
	if got := request(app, "GET", "/api/progress", token, nil).Code; got != 200 {
		t.Fatalf("authenticated progress status %d", got)
	}
	if got := request(app, "POST", "/api/session", "", map[string]any{"name": "<script>", "avatar": Avatar{Hair: "dark", Skin: "light", Outfit: "blue"}}).Code; got != 400 {
		t.Fatalf("invalid name status %d", got)
	}
}

func TestGradingDoesNotTrustClientCorrectness(t *testing.T) {
	app := testApp(t)
	token, _ := createSession(t, app, "Ada")
	input := map[string]any{"id": "wrong", "itemId": "item-one", "exerciseId": "exercise-one", "answer": "incorrect", "mode": "recognition", "correct": true}
	response := decodeAttempt(t, request(app, "POST", "/api/attempt", token, input))
	if response.Correct || response.XPAdded != 0 || response.Progress.CorrectAttempts != 0 {
		t.Fatalf("client supplied correctness awarded progress: %+v", response)
	}
	input["itemId"] = "invented"
	if got := request(app, "POST", "/api/attempt", token, input).Code; got != 400 {
		t.Fatalf("invented item status %d", got)
	}
	input["itemId"] = "item-one"
	input["mode"] = "production"
	if got := request(app, "POST", "/api/attempt", token, input).Code; got != 400 {
		t.Fatalf("wrong mode status %d", got)
	}
}

func TestAttemptIdempotencyAndConflict(t *testing.T) {
	app := testApp(t)
	token, _ := createSession(t, app, "Ada")
	input := attemptFor("once")
	first := decodeAttempt(t, request(app, "POST", "/api/attempt", token, input))
	second := decodeAttempt(t, request(app, "POST", "/api/attempt", token, input))
	if first.XPAdded != 6 || second.XPAdded != 0 || !second.Duplicate || second.Progress.Attempts != 1 {
		t.Fatalf("attempt not idempotent: %+v %+v", first, second)
	}
	input.Answer = "different"
	if got := request(app, "POST", "/api/attempt", token, input).Code; got != 409 {
		t.Fatalf("conflicting ID status %d", got)
	}
}

func TestConcurrentDuplicateAttemptsAwardOnce(t *testing.T) {
	app := testApp(t)
	token, _ := createSession(t, app, "Ada")
	var wg sync.WaitGroup
	for range 20 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			w := request(app, "POST", "/api/attempt", token, attemptFor("concurrent"))
			if w.Code != 200 {
				t.Errorf("concurrent request: %d %s", w.Code, w.Body.String())
			}
		}()
	}
	wg.Wait()
	var progress Progress
	w := request(app, "GET", "/api/progress", token, nil)
	if err := json.Unmarshal(w.Body.Bytes(), &progress); err != nil {
		t.Fatal(err)
	}
	if progress.XP != 6 || progress.Attempts != 1 {
		t.Fatalf("duplicate concurrency awarded %+v", progress)
	}
}

func TestQuestCompletionRequiresLearningAndAwardsOnce(t *testing.T) {
	app := testApp(t)
	token, _ := createSession(t, app, "Ada")
	if got := request(app, "POST", "/api/quest/complete", token, map[string]string{"questId": "quest"}).Code; got != 409 {
		t.Fatalf("unearned quest status %d", got)
	}
	if got := request(app, "POST", "/api/quest/complete", token, map[string]string{"questId": "invented"}).Code; got != 400 {
		t.Fatalf("invented quest status %d", got)
	}
	decodeAttempt(t, request(app, "POST", "/api/attempt", token, attemptFor("one")))
	if got := request(app, "POST", "/api/quest/complete", token, map[string]any{"questId": "quest", "silentMode": true}).Code; got != 409 {
		t.Fatalf("silent mode skipped a target with both production and listening exercises: %d", got)
	}
	input := AttemptInput{ID: "two", ItemID: "item-two", ExerciseID: "exercise-two", Answer: "ICH   BIN HIER!", Mode: "production", QuestID: "quest"}
	decodeAttempt(t, request(app, "POST", "/api/attempt", token, input))
	first := request(app, "POST", "/api/quest/complete", token, map[string]string{"questId": "quest"})
	second := request(app, "POST", "/api/quest/complete", token, map[string]string{"questId": "quest"})
	if first.Code != 200 || second.Code != 200 {
		t.Fatalf("quest completion %d %d", first.Code, second.Code)
	}
	var result struct {
		XPAdded   int      `json:"xpAdded"`
		Duplicate bool     `json:"duplicate"`
		Progress  Progress `json:"progress"`
	}
	_ = json.Unmarshal(second.Body.Bytes(), &result)
	if result.XPAdded != 0 || !result.Duplicate || result.Progress.XP != 54 || len(result.Progress.CompletedQuestIDs) != 1 {
		t.Fatalf("quest reward duplication %+v", result)
	}
}

func TestTranscriptFallbackDoesNotEstablishListeningMastery(t *testing.T) {
	app := testApp(t)
	token, _ := createSession(t, app, "Ada")
	input := AttemptInput{ID: "transcript", ItemID: "item-two", ExerciseID: "exercise-audio", Answer: "der Bahnhof", Mode: "recognition", Hinted: true}
	response := decodeAttempt(t, request(app, "POST", "/api/attempt", token, input))
	if !response.Correct || response.XPAdded != 0 || response.Progress.Items["item-two"].ModeStats["recognition"].UnaidedSuccesses != 0 {
		t.Fatalf("transcript fallback awarded mastery %+v", response)
	}
	input.ID = "invalid-fallback"
	input.Hinted = false
	if got := request(app, "POST", "/api/attempt", token, input).Code; got != 400 {
		t.Fatalf("unmarked fallback status %d", got)
	}
}

func TestSessionProfileUpdatePreservesLearning(t *testing.T) {
	app := testApp(t)
	token, player := createSession(t, app, "Ada")
	decodeAttempt(t, request(app, "POST", "/api/attempt", token, attemptFor("before-edit")))
	avatar := Avatar{Hair: "#001122", Skin: "#ccbbaa", Outfit: "#998877"}
	w := request(app, "POST", "/api/session", token, map[string]any{"name": "Mira", "avatar": avatar})
	if w.Code != 200 {
		t.Fatalf("profile edit %d %s", w.Code, w.Body.String())
	}
	var response struct {
		Token    string   `json:"token"`
		Player   Player   `json:"player"`
		Progress Progress `json:"progress"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &response)
	if response.Token != token || response.Player.ID != player.ID || response.Player.Avatar != avatar || response.Player.Name != "Mira" || response.Progress.XP != 6 {
		t.Fatalf("profile update replaced progress %+v", response)
	}
}

func TestJSONPersistenceAndTokenHashing(t *testing.T) {
	path := filepath.Join(t.TempDir(), "state.json")
	store, err := NewJSONStore(path)
	if err != nil {
		t.Fatal(err)
	}
	app := NewApp(store, testCurriculum(), nil, 10)
	token, _ := createSession(t, app, "Ada")
	decodeAttempt(t, request(app, "POST", "/api/attempt", token, attemptFor("saved")))
	app.Close()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(data, []byte(token)) {
		t.Fatal("raw session token was saved to disk")
	}
	restored, err := NewJSONStore(path)
	if err != nil {
		t.Fatal(err)
	}
	app = NewApp(restored, testCurriculum(), nil, 10)
	defer app.Close()
	result := decodeAttempt(t, request(app, "POST", "/api/attempt", token, attemptFor("saved")))
	if !result.Duplicate || result.Progress.XP != 6 || result.Progress.Attempts != 1 {
		t.Fatalf("persisted idempotency lost %+v", result)
	}
}

func TestCurriculumAndAnswerNormalization(t *testing.T) {
	legacyJSON, err := curriculumFiles.ReadFile("curriculum.json")
	if err != nil {
		t.Fatal(err)
	}
	legacy, err := parseCurriculum(legacyJSON)
	if err != nil {
		t.Fatal(err)
	}
	if len(legacy.Quests) != 18 || len(legacy.Items) != 126 || len(legacy.Exercises) != 126 {
		t.Fatalf("incomplete legacy curriculum %d %d %d", len(legacy.Quests), len(legacy.Items), len(legacy.Exercises))
	}
	curriculum, err := loadCurriculum()
	if err != nil {
		t.Fatal(err)
	}
	for id, exercise := range legacy.Exercises {
		if curriculum.Exercises[id].Answer != exercise.Answer {
			t.Fatalf("course changed legacy exercise %s", id)
		}
	}
	exercise := Exercise{Answer: "schön"}
	if !exercise.Grade("  SCHO\u0308N!  ") || exercise.Grade("schon") {
		t.Fatal("NFC normalization damaged umlaut distinction")
	}
	if (Exercise{Answer: "Straße"}).Grade("strasse") {
		t.Fatal("ß should require an explicit accepted answer")
	}
	if (Exercise{Answer: "der Bahnhof", CaseSensitive: true}).Grade("Der Bahnhof") {
		t.Fatal("case-sensitive grading ignored")
	}
}

func TestAdaptiveIntervalsAndHints(t *testing.T) {
	now := time.Date(2026, 10, 8, 12, 0, 0, 0, time.UTC)
	progress := newProgress()
	receipt := applyReview(t, &progress, "word", "recognition", true, false, now)
	first := progress.Items["word"]
	if receipt.XPAdded != 6 || first.DueAt.Before(now.Add(12*time.Hour)) {
		t.Fatalf("first recall has no usable interval %+v", first)
	}
	applyReview(t, &progress, "word", "recognition", true, false, now.Add(time.Minute))
	if repeated := progress.Items["word"]; repeated.StabilityDays != first.StabilityDays || repeated.DueAt != first.DueAt || progress.XP != 6 {
		t.Fatalf("early repetition inflated memory %+v", repeated)
	}
	later := first.DueAt.Add(12 * time.Hour)
	applyReview(t, &progress, "word", "recognition", true, false, later)
	if progress.Items["word"].StabilityDays <= first.StabilityDays {
		t.Fatal("delayed recall did not expand interval")
	}
	applyReview(t, &progress, "word", "recognition", false, false, later.Add(time.Minute))
	failed := progress.Items["word"]
	if failed.Lapses != 1 || failed.DueAt != later.Add(11*time.Minute) {
		t.Fatalf("lapse did not schedule revisit %+v", failed)
	}
	applyReview(t, &progress, "hinted", "production", true, true, now)
	if hinted := progress.Items["hinted"]; hinted.Repetitions != 0 || hinted.ModeStats["production"].UnaidedSuccesses != 0 {
		t.Fatalf("hint established mastery %+v", hinted)
	}
}

func TestSupportedPracticeDoesNotStayOverdueOrCreateFallbackCards(t *testing.T) {
	now := time.Date(2026, 10, 8, 12, 0, 0, 0, time.UTC)
	progress := newProgress()
	_, err := recordAttempt(&progress, "listening-word", "recognition", true, true, now, "listening")
	if err != nil {
		t.Fatal(err)
	}
	later := now.Add(2 * time.Hour)
	_, err = recordAttempt(&progress, "listening-word", "recognition", false, true, later, "listening")
	if err != nil {
		t.Fatal(err)
	}
	memory := progress.Items["listening-word"]
	if !memory.DueAt.After(later) || len(memory.Cards) != 0 || progress.XP != 0 {
		t.Fatalf("supported fallback became permanently due/mastered: %+v", memory)
	}
	_, err = recordAttempt(&progress, "listening-word", "listening", true, false, later.Add(time.Minute), "listening")
	if err != nil {
		t.Fatal(err)
	}
	memory = progress.Items["listening-word"]
	if _, ok := memory.Cards["listening"]; !ok || len(memory.Cards) != 1 || len(memory.PracticeDueAt) != 0 {
		t.Fatalf("independent retrieval did not graduate supported practice: %+v", memory)
	}
}

func readWorld(t *testing.T, ctx context.Context, conn *websocket.Conn, kind string) map[string]json.RawMessage {
	t.Helper()
	for {
		_, b, err := conn.Read(ctx)
		if err != nil {
			t.Fatal(err)
		}
		var message map[string]json.RawMessage
		if err = json.Unmarshal(b, &message); err != nil {
			t.Fatal(err)
		}
		var actual string
		_ = json.Unmarshal(message["type"], &actual)
		if actual == kind {
			return message
		}
	}
}

func writeWorld(t *testing.T, ctx context.Context, conn *websocket.Conn, message any) {
	t.Helper()
	b, _ := json.Marshal(message)
	if err := conn.Write(ctx, websocket.MessageText, b); err != nil {
		t.Fatal(err)
	}
}

func TestConcurrentPlayersChatAndAuthoritativeMovement(t *testing.T) {
	app := testApp(t)
	tokenOne, playerOne := createSession(t, app, "Ada")
	tokenTwo, _ := createSession(t, app, "Mira")
	server := httptest.NewServer(app.Handler())
	defer server.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	url := "ws" + strings.TrimPrefix(server.URL, "http") + "/api/world?token="
	one, _, err := websocket.Dial(ctx, url+tokenOne, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer one.CloseNow()
	readWorld(t, ctx, one, "welcome")
	two, _, err := websocket.Dial(ctx, url+tokenTwo, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer two.CloseNow()
	welcome := readWorld(t, ctx, two, "welcome")
	var players []Player
	_ = json.Unmarshal(welcome["players"], &players)
	if len(players) != 2 {
		t.Fatalf("second welcome sees %d players", len(players))
	}
	writeWorld(t, ctx, one, map[string]any{"type": "chat", "message": "Guten Tag, Mira!"})
	message := readWorld(t, ctx, two, "chat")
	var chat ChatMessage
	_ = json.Unmarshal(message["message"], &chat)
	if chat.PlayerID != playerOne.ID || chat.Text != "Guten Tag, Mira!" {
		t.Fatalf("chat delivery %+v", chat)
	}
	writeWorld(t, ctx, one, map[string]any{"type": "move", "x": 1, "y": 1})
	for {
		message = readWorld(t, ctx, two, "players")
		_ = json.Unmarshal(message["players"], &players)
		moved := false
		for _, player := range players {
			if player.ID == playerOne.ID {
				distance := math.Hypot(player.X-playerOne.X, player.Y-playerOne.Y)
				if distance > 0 {
					moved = true
					if distance > .081 {
						t.Fatalf("server accepted teleport: distance %.3f", distance)
					}
				}
			}
		}
		if moved {
			break
		}
	}
	writeWorld(t, ctx, one, map[string]any{"type": "move", "x": -1, "y": 1})
	readWorld(t, ctx, one, "error")
}

func TestWebSocketAuthAndOriginRejection(t *testing.T) {
	app := testApp(t)
	token, _ := createSession(t, app, "Ada")
	server := httptest.NewServer(app.Handler())
	defer server.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	url := "ws" + strings.TrimPrefix(server.URL, "http") + "/api/world?token="
	_, response, err := websocket.Dial(ctx, url+strings.Repeat("a", 43), nil)
	if err == nil || response == nil || response.StatusCode != 401 {
		t.Fatalf("unknown token upgrade: %v %+v", err, response)
	}
	_, response, err = websocket.Dial(ctx, url+token, &websocket.DialOptions{HTTPHeader: http.Header{"Origin": []string{"https://evil.example"}}})
	if err == nil || response == nil || response.StatusCode != 403 {
		t.Fatalf("untrusted origin upgrade: %v %+v", err, response)
	}
	conn, _, err := websocket.Dial(ctx, url+token, &websocket.DialOptions{HTTPHeader: http.Header{"Origin": []string{"http://localhost:5173"}}})
	if err != nil {
		t.Fatalf("allowed cross-origin browser failed: %v", err)
	}
	defer conn.CloseNow()
	readWorld(t, ctx, conn, "welcome")
}

func applyReview(t *testing.T, progress *Progress, item, mode string, correct, hinted bool, now time.Time) Receipt {
	t.Helper()
	receipt, err := recordAttempt(progress, item, mode, correct, hinted, now)
	if err != nil {
		t.Fatal(err)
	}
	return receipt
}
