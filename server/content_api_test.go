package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"glotworld/server/internal/billing/billingtest"
	"glotworld/server/internal/contentstore"
	"glotworld/server/internal/store"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"
)

var contentFixture struct {
	once            sync.Once
	bundle          *contentstore.Bundle
	curricula       map[string]Curriculum
	lexemeSentences map[string][]string
	stationRooms    map[string][]stationRoom
	err             error
}

func contentTestApp(t *testing.T) *App {
	t.Helper()
	// Catalogs and grading indexes are immutable after boot. Parse the production
	// fixture once; each test still receives independent state, sessions and limits.
	contentFixture.once.Do(func() {
		contentFixture.bundle, contentFixture.err = contentstore.LoadJSON("content.json")
		if contentFixture.err != nil {
			return
		}
		store, err := NewJSONStore("")
		if err != nil {
			contentFixture.err = err
			return
		}
		cached := NewApp(store, Curriculum{}, nil, 128)
		defer cached.Close()
		if err = cached.InstallContent(contentFixture.bundle); err != nil {
			contentFixture.err = err
			return
		}
		contentFixture.curricula = cached.courseCurricula
		contentFixture.lexemeSentences = cached.lexemeSentences
		contentFixture.stationRooms = cached.stationRooms
	})
	if contentFixture.err != nil {
		t.Fatal(contentFixture.err)
	}
	storage, err := NewJSONStore("")
	if err != nil {
		t.Fatal(err)
	}
	app := NewApp(storage, Curriculum{}, nil, 128)
	t.Cleanup(app.Close)
	app.content = contentFixture.bundle
	app.courseCurricula = contentFixture.curricula
	app.lexemeSentences = contentFixture.lexemeSentences
	app.stationRooms = contentFixture.stationRooms
	app.canonical, err = store.NewCanonical(storage, app.content, storeHooks())
	if err != nil {
		t.Fatal(err)
	}
	app.store = app.canonical
	app.curriculum = app.courseCurricula[app.canonical.DefaultCourse()]
	return app
}
func testContentID(t *testing.T, app *App, kind, slug string) string {
	t.Helper()
	id := app.content.IDs[kind+":"+slug]
	if id == "" {
		t.Fatalf("missing %s:%s", kind, slug)
	}
	return id
}
func assertNoContentSecrets(t *testing.T, data []byte) {
	t.Helper()
	var value any
	if err := json.Unmarshal(data, &value); err != nil {
		t.Fatal(err)
	}
	var visit func(any)
	visit = func(v any) {
		switch obj := v.(type) {
		case map[string]any:
			for key, item := range obj {
				if secretContentKeys[key] {
					t.Errorf("public content leaked %s", key)
				}
				visit(item)
			}
		case []any:
			for _, item := range obj {
				visit(item)
			}
		}
	}
	visit(value)
}
func TestContentCatalogBootAndAuthorizedSlices(t *testing.T) {
	app := contentTestApp(t)
	token, _ := createSession(t, app, "Ada")
	if res := request(app, "GET", "/api/content/bootstrap", "", nil); res.Code != 401 {
		t.Fatalf("anonymous bootstrap %d", res.Code)
	}
	boot := request(app, "GET", "/api/content/bootstrap", token, nil)
	if boot.Code != 200 {
		t.Fatalf("bootstrap %d %s", boot.Code, boot.Body.String())
	}
	assertNoContentSecrets(t, boot.Body.Bytes())
	first := testContentID(t, app, "graph", "a1-arrival")
	later := testContentID(t, app, "graph", "a1-cafe")
	if res := request(app, "GET", "/api/content/graphs/"+first, token, nil); res.Code != 200 {
		t.Fatalf("first graph %d %s", res.Code, res.Body.String())
	}
	for _, id := range []string{later, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"} {
		if res := request(app, "GET", "/api/content/graphs/"+id, token, nil); res.Code != 404 {
			t.Fatalf("locked/unknown %d %s", res.Code, res.Body.String())
		}
	}
	exercise := testContentID(t, app, "exercise", "a1-arrival-exercise-3")
	res := request(app, "GET", "/api/content/exercises/"+exercise, token, nil)
	if res.Code != 200 {
		t.Fatalf("exercise %d %s", res.Code, res.Body.String())
	}
	assertNoContentSecrets(t, res.Body.Bytes())
	var record struct {
		Body struct {
			SentenceID string `json:"sentenceId"`
		}
	}
	_ = json.Unmarshal(res.Body.Bytes(), &record)
	if record.Body.SentenceID != "" {
		sentence := request(app, "GET", "/api/content/sentences?ids="+record.Body.SentenceID, token, nil)
		if strings.Contains(sentence.Body.String(), `"text":"`+app.curriculum.Exercises["a1-arrival-exercise-3"].Answer+`"`) {
			t.Fatal("production sentence disclosed answer before attempt")
		}
	}
	if res := request(app, "GET", "/api/content/sentences?ids=slug", token, nil); res.Code != 400 {
		t.Fatalf("slug batch %d", res.Code)
	}
	ids := strings.Repeat(first+",", 12) + first
	if res := request(app, "GET", "/api/content/sentences?ids="+ids, token, nil); res.Code != 400 {
		t.Fatalf("oversized batch %d", res.Code)
	}
}

func TestContentNewSessionIncludesPersistedDefaultCourse(t *testing.T) {
	app := contentTestApp(t)
	res := request(app, "POST", "/api/session", "", map[string]any{"name": "Ada", "avatar": Avatar{Hair: "#302020", Skin: "#edcaaa", Outfit: "#456789"}})
	if res.Code != 201 {
		t.Fatal(res.Body.String())
	}
	var response struct {
		Token          string `json:"token"`
		ActiveCourseID string `json:"activeCourseId"`
		Course         struct {
			ID     string `json:"id"`
			Target string `json:"target"`
		} `json:"course"`
	}
	if err := json.Unmarshal(res.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	account, err := app.store.Get(context.Background(), tokenHash(response.Token))
	if err != nil || response.ActiveCourseID != app.canonical.DefaultCourse() || response.ActiveCourseID != account.ActiveCourseID || response.Course.ID != account.ActiveCourseID || response.Course.Target != "de" {
		t.Fatalf("new session omitted its persisted default course: %v %+v", err, response)
	}
}
func TestContentETagChecksAccessAndSupportLanguageBefore304(t *testing.T) {
	app := contentTestApp(t)
	app.billing = billingtest.NewClient(nil)
	token, player := createSession(t, app, "Ada")
	id := testContentID(t, app, "graph", "a1-arrival")
	first := request(app, "GET", "/api/content/graphs/"+id, token, nil)
	etag := first.Header().Get("ETag")
	if etag == "" {
		t.Fatal("missing etag")
	}
	conditional := func() *httptest.ResponseRecorder {
		r := httptest.NewRequest("GET", "/api/content/graphs/"+id, nil)
		r.Header.Set("Authorization", "Bearer "+token)
		r.Header.Set("If-None-Match", etag)
		w := httptest.NewRecorder()
		app.Handler().ServeHTTP(w, r)
		return w
	}
	if res := conditional(); res.Code != 304 {
		t.Fatalf("authorized 304 %d %s", res.Code, res.Body.String())
	}
	if res := request(app, "POST", "/api/preferences", token, Preferences{BaseLanguage: "tr"}); res.Code != 200 {
		t.Fatal(res.Body.String())
	}
	if res := conditional(); res.Code != 200 || res.Header().Get("ETag") == etag {
		t.Fatalf("language cache identity %d %s", res.Code, res.Body.String())
	}
	_, err := app.store.UpdateAccountByID(context.Background(), player.ID, func(account *Account) error {
		account.Access.PlayedNanoseconds = int64(guestPlayLimit)
		account.Access.ActiveSince = time.Time{}
		account.Access.ActiveUntil = time.Time{}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if res := conditional(); res.Code == 304 || res.Code != 403 {
		t.Fatalf("expired access must not receive 304: %d %s", res.Code, res.Body.String())
	}
	app.billing = nil
	if res := conditional(); res.Code != 200 {
		t.Fatalf("disabling billing must reopen content: %d %s", res.Code, res.Body.String())
	}
}
func TestContentEnglishBothSupportsAttemptRevealAndIndependentProgress(t *testing.T) {
	app := contentTestApp(t)
	token, player := createSession(t, app, "Ada")
	english := testContentID(t, app, "course", "english")
	german := testContentID(t, app, "course", "german")
	exerciseID := testContentID(t, app, "exercise", "en-first-request")
	itemID := testContentID(t, app, "item", "en-first-request-item")
	questID := testContentID(t, app, "quest", "en-first-conversation")
	for _, lang := range []string{"tr", "de"} {
		res := request(app, "POST", "/api/course/activate", token, map[string]any{"courseId": english, "supportLanguage": lang})
		if res.Code != 200 {
			t.Fatalf("activate %s %d %s", lang, res.Code, res.Body.String())
		}
		if res = request(app, "GET", "/api/content/graphs/"+testContentID(t, app, "graph", "en-first-conversation"), token, nil); res.Code != 200 {
			t.Fatalf("English graph %d %s", res.Code, res.Body.String())
		}
		assertNoContentSecrets(t, res.Body.Bytes())
		if lang == "tr" {
			if res = request(app, "POST", "/api/attempt", token, map[string]any{"recover": true, "exerciseId": exerciseID}); res.Code != 409 {
				t.Fatalf("premature reveal %d %s", res.Code, res.Body.String())
			}
			input := AttemptInput{ID: "english-first-attempt", ExerciseID: exerciseID, ItemID: itemID, QuestID: questID, Mode: "production", Answer: "wrong"}
			res = request(app, "POST", "/api/attempt", token, input)
			if res.Code != 200 {
				t.Fatalf("English attempt %d %s", res.Code, res.Body.String())
			}
		}
		if res = request(app, "POST", "/api/attempt", token, map[string]any{"recover": true, "exerciseId": exerciseID}); res.Code != 200 || !strings.Contains(res.Body.String(), "Please say it again.") {
			t.Fatalf("eligible reveal %d %s", res.Code, res.Body.String())
		}
		ticket := testContentID(t, app, "lexeme", "en-ticket-word")
		if res = request(app, "GET", "/api/content/lexemes?ids="+ticket, token, nil); res.Code != 200 || !strings.Contains(res.Body.String(), ticket) {
			t.Fatalf("restored English word %d %s", res.Code, res.Body.String())
		}
	}
	if res := request(app, "POST", "/api/course/activate", token, map[string]any{"courseId": german, "supportLanguage": "en"}); res.Code != 200 {
		t.Fatal(res.Body.String())
	}
	account, err := app.store.GetAccountByID(context.Background(), player.ID)
	if err != nil {
		t.Fatal(err)
	}
	if account.Progress.Attempts != 0 {
		t.Fatal("German inherited English attempts")
	}
	_, err = app.store.UpdateAccountByID(context.Background(), player.ID, func(a *Account) error {
		a.Progress.XP = 99
		a.Player.X = .31
		a.Player.Y = .42
		ensureStory(&a.Progress)
		a.Progress.Story.Flags["german-only"] = true
		a.StorySaves = map[string]StorySave{"one": {Slot: "one", Story: a.Progress.Story}}
		a.RewardedQuestIDs = []string{"a1-arrival"}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if res := request(app, "POST", "/api/course/activate", token, map[string]any{"courseId": english, "supportLanguage": "de"}); res.Code != 200 {
		t.Fatal(res.Body.String())
	}
	account, _ = app.store.GetAccountByID(context.Background(), player.ID)
	if account.Progress.Attempts != 1 || account.Progress.XP == 99 || account.Progress.Story.Flags["german-only"] {
		t.Fatal("course progress isolation failed")
	}
	if res := request(app, "POST", "/api/course/activate", token, map[string]any{"courseId": german, "supportLanguage": "en"}); res.Code != 200 {
		t.Fatal(res.Body.String())
	}
	account, _ = app.store.GetAccountByID(context.Background(), player.ID)
	if account.Progress.XP != 99 || account.Player.X != .31 || !account.Progress.Story.Flags["german-only"] || len(account.StorySaves) != 1 || !contains(account.RewardedQuestIDs, "a1-arrival") {
		t.Fatalf("German snapshot failed %+v", account)
	}
}
func TestContentLimitsCountRecordsAndShareAcrossSessions(t *testing.T) {
	app := contentTestApp(t)
	token, player := createSession(t, app, "Ada")
	secondToken, err := randomID(32)
	if err != nil {
		t.Fatal(err)
	}
	if err = app.store.AddSession(context.Background(), tokenHash(secondToken), player.ID); err != nil {
		t.Fatal(err)
	}
	account, err := app.getAccount(context.Background(), tokenHash(token))
	if err != nil {
		t.Fatal(err)
	}
	var ids []string
	for _, record := range app.content.Records {
		if record.Kind == "sentence" && app.recordVisible(record, account) {
			ids = append(ids, record.ID)
			if len(ids) == 12 {
				break
			}
		}
	}
	path := "/api/content/sentences?ids=" + strings.Join(ids, ",")
	if len(ids) != 12 {
		t.Fatalf("need a full sentence batch, got %d records", len(ids))
	}
	for i := 0; i < 30; i++ {
		if res := request(app, "GET", path, token, nil); res.Code != 200 {
			t.Fatalf("batch %d %d", i, res.Code)
		}
	}
	if res := request(app, "GET", path, secondToken, nil); res.Code != 429 {
		t.Fatalf("record-count/account limit %d", res.Code)
	} else if res.Header().Get("Retry-After") != "60" {
		t.Fatalf("missing retry delay: %v", res.Header())
	}
}

func TestContentEnglishRecordedFeedbackUsesSelectedSupport(t *testing.T) {
	for _, lang := range []string{"tr", "de"} {
		t.Run(lang, func(t *testing.T) {
			app := contentTestApp(t)
			token, _ := createSession(t, app, "Ada")
			course := testContentID(t, app, "course", "english")
			if res := request(app, "POST", "/api/course/activate", token, map[string]any{"courseId": course, "supportLanguage": lang}); res.Code != 200 {
				t.Fatal(res.Body.String())
			}
			exercise := testContentID(t, app, "exercise", "en-first-request")
			var body struct {
				Support map[string]struct {
					Explanation string `json:"explanation"`
				} `json:"support"`
			}
			if err := json.Unmarshal(app.content.ByID[exercise].Body, &body); err != nil {
				t.Fatal(err)
			}
			expected := body.Support[lang].Explanation
			if expected == "" {
				t.Fatalf("proof exercise lacks %s authored explanation", lang)
			}
			input := AttemptInput{ID: "localized-correct-feedback", ExerciseID: exercise, ItemID: testContentID(t, app, "item", "en-first-request-item"), QuestID: testContentID(t, app, "quest", "en-first-conversation"), Mode: "production", Answer: "Please say it again."}
			for _, payload := range []any{input, input, map[string]any{"recover": true, "exerciseId": exercise}} {
				res := request(app, "POST", "/api/attempt", token, payload)
				if res.Code != 200 {
					t.Fatalf("feedback %d %s", res.Code, res.Body.String())
				}
				var result struct {
					Reason string `json:"reason"`
				}
				if err := json.Unmarshal(res.Body.Bytes(), &result); err != nil {
					t.Fatal(err)
				}
				if result.Reason != expected {
					t.Fatalf("%s feedback %q; want %q", lang, result.Reason, expected)
				}
			}
		})
	}
}

func TestContentEnglishClassroomStoryAndRestoredWordFlow(t *testing.T) {
	app := contentTestApp(t)
	token, player := createSession(t, app, "Ada")
	course := testContentID(t, app, "course", "english")
	quest := testContentID(t, app, "quest", "en-first-conversation")
	activate := request(app, "POST", "/api/course/activate", token, map[string]any{"courseId": course, "supportLanguage": "de"})
	if activate.Code != 200 {
		t.Fatal(activate.Body.String())
	}
	intro := testContentID(t, app, "node", "en-first-conversation:intro")
	gate := testContentID(t, app, "node", "en-first-conversation:gate")
	choiceNode := testContentID(t, app, "node", "en-first-conversation:choice")
	choice := testContentID(t, app, "choice", "en-first-conversation:en-first-continue")
	res := request(app, "POST", "/api/story/transition", token, StoryTransitionInput{ID: "english-intro", QuestID: quest, NodeID: intro})
	if res.Code != 200 {
		t.Fatalf("English intro %d %s", res.Code, res.Body.String())
	}
	input := AttemptInput{ID: "english-gate", QuestID: quest, ExerciseID: testContentID(t, app, "exercise", "en-first-request"), ItemID: testContentID(t, app, "item", "en-first-request-item"), Mode: "production", Answer: "Please say it again.", SceneAttempt: true}
	result := decodeAttempt(t, request(app, "POST", "/api/attempt", token, input))
	if !result.Correct {
		t.Fatal("English classroom grade incorrect")
	}
	res = request(app, "POST", "/api/story/transition", token, StoryTransitionInput{ID: "english-gate-transition", QuestID: quest, NodeID: gate, AttemptID: input.ID})
	if res.Code != 200 {
		t.Fatalf("English gate %d %s", res.Code, res.Body.String())
	}
	res = request(app, "POST", "/api/story/transition", token, StoryTransitionInput{ID: "english-choice", QuestID: quest, NodeID: choiceNode, ChoiceID: choice})
	if res.Code != 200 {
		t.Fatalf("English choice %d %s", res.Code, res.Body.String())
	}
	wordInput := AttemptInput{ID: "english-restored-ticket", ExerciseID: testContentID(t, app, "exercise", "lex-en-ticket-word-production"), ItemID: testContentID(t, app, "item", "word-en-ticket-word"), Mode: "production", Answer: "ticket"}
	if !decodeAttempt(t, request(app, "POST", "/api/attempt", token, wordInput)).Correct {
		t.Fatal("English restored word did not grade")
	}
	account, err := app.store.GetAccountByID(context.Background(), player.ID)
	if err != nil {
		t.Fatal(err)
	}
	if !contains(account.Progress.CompletedQuestIDs, "en-first-conversation") || account.Progress.Words["en-ticket-word"].DirectAttempts != 1 || account.Progress.Story.Nodes["en-first-conversation"] != "complete" {
		t.Fatal("English course did not preserve story and word evidence")
	}
}

func TestContentEnglishLoginRestoresSelectedCourse(t *testing.T) {
	app := contentTestApp(t)
	token, player := createSession(t, app, "Ada")
	encoded, err := hashPassword("secure-content-login")
	if err != nil {
		t.Fatal(err)
	}
	if err = app.store.SetCredentials(context.Background(), tokenHash(token), "content-login@example.com", encoded); err != nil {
		t.Fatal(err)
	}
	english := testContentID(t, app, "course", "english")
	if res := request(app, "POST", "/api/course/activate", token, map[string]any{"courseId": english, "supportLanguage": "de"}); res.Code != 200 {
		t.Fatal(res.Body.String())
	}
	res := request(app, "POST", "/api/account/login", "", credentialInput{Email: "content-login@example.com", Password: "secure-content-login"})
	if res.Code != 200 {
		t.Fatalf("English login %d %s", res.Code, res.Body.String())
	}
	var session struct {
		ActiveCourseID string      `json:"activeCourseId"`
		Player         Player      `json:"player"`
		Preferences    Preferences `json:"preferences"`
	}
	_ = json.Unmarshal(res.Body.Bytes(), &session)
	if session.ActiveCourseID != english || session.Player.ID != player.ID || session.Preferences.BaseLanguage != "de" {
		t.Fatal("login did not restore the selected English course")
	}
}
func TestContentBillingWebhookRemainsAccountScopedWhileEnglishActive(t *testing.T) {
	app := contentTestApp(t)
	token, player, fixture := setupCreemAccount(t, app, "lifetime")
	english := testContentID(t, app, "course", "english")
	if res := request(app, "POST", "/api/course/activate", token, map[string]any{"courseId": english, "supportLanguage": "tr"}); res.Code != 200 {
		t.Fatal(res.Body.String())
	}
	before, err := app.store.GetAccountByID(context.Background(), player.ID)
	if err != nil {
		t.Fatal(err)
	}
	beforeProgress, _ := json.Marshal(before.Progress)
	body := creemEvent("content-English-paid", "checkout.completed", app.now(), map[string]string{"id": "checkout"})
	r := signedCreemEvent(app.billing.WebhookSecret, body)
	w := httptest.NewRecorder()
	app.Handler().ServeHTTP(w, r)
	if w.Code != 200 {
		t.Fatalf("English webhook %d %s", w.Code, w.Body.String())
	}
	after, err := app.store.GetAccountByID(context.Background(), player.ID)
	if err != nil {
		t.Fatal(err)
	}
	afterProgress, _ := json.Marshal(after.Progress)
	if after.ActiveCourseID != english || after.Billing.Plan != "lifetime" || !strings.Contains(string(afterProgress), string(beforeProgress)) || fixture.Calls == 0 {
		t.Fatal("account billing reconciled against or mutated the wrong course")
	}
	if res := request(app, "POST", "/api/billing/sync", token, map[string]any{}); res.Code != 200 {
		t.Fatalf("English billing sync %d %s", res.Code, res.Body.String())
	}
}

func TestContentAllDeclaredLanguageMapsContainOnlySelectedSupport(t *testing.T) {
	data := map[string]any{"gatePromptTranslations": map[string]any{"tr": "Tekrar sor", "de": "Bitte erneut"}, "titleTranslations": map[string]any{"en": "Food", "tr": "Yemek"}, "optionTranslations": map[string]any{"tr": map[string]any{"apple": "elma", "coffee": "kahve"}, "en": map[string]any{"apple": "apple"}}}
	cleaned := stripContent(data, "tr", "").(map[string]any)
	for _, key := range []string{"gatePromptTranslations", "titleTranslations", "optionTranslations"} {
		languageMap := cleaned[key].(map[string]any)
		if len(languageMap) != 1 || languageMap["tr"] == nil {
			t.Fatalf("%s leaked another support language: %v", key, languageMap)
		}
	}
	options := cleaned["optionTranslations"].(map[string]any)["tr"].(map[string]any)
	if len(options) != 2 {
		t.Fatal("support filter damaged option keys")
	}
}

func TestContentExpeditionChoiceFeedbackRequiresRecordedAnswer(t *testing.T) {
	app := contentTestApp(t)
	token, player := createSession(t, app, "Ada")
	_, err := app.store.UpdateAccountByID(context.Background(), player.ID, func(a *Account) error {
		a.Progress.CompletedQuestIDs = append([]string{}, storyQuestOrder...)
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	id := testContentID(t, app, "expedition", "saffroncourt-encounter-salma")
	read := request(app, "GET", "/api/content/expeditions/"+id, token, nil)
	if read.Code != 200 {
		t.Fatal(read.Body.String())
	}
	assertNoContentSecrets(t, read.Body.Bytes())
	if strings.Contains(read.Body.String(), "blue gate is the right landmark") {
		t.Fatal("expedition disclosed choice rationale before answering")
	}
	res := request(app, "POST", "/api/expedition/answer", token, map[string]any{"id": "expedition-salma-answer", "encounterId": id, "selected": 0})
	if res.Code != 200 || !strings.Contains(res.Body.String(), "blue gate is the right landmark") {
		t.Fatalf("recorded expedition feedback %d %s", res.Code, res.Body.String())
	}
}

func TestContentExpeditionSelectedFeedbackAndImmutableRetries(t *testing.T) {
	for _, language := range []string{"en", "tr"} {
		t.Run(language, func(t *testing.T) {
			app := contentTestApp(t)
			token, _ := createSession(t, app, "Expedition Ada")
			if res := request(app, "POST", "/api/preferences", token, map[string]any{"baseLanguage": language}); res.Code != 200 {
				t.Fatal(res.Body.String())
			}
			slug := "saffroncourt-encounter-salma"
			id := testContentID(t, app, "expedition", slug)
			var body map[string]any
			_ = json.Unmarshal(app.content.ByID[id].Body, &body)
			choices := anyValues(body["choices"])
			if len(choices) != 2 {
				t.Fatal("feedback fixture lacks two replies")
			}
			expected := app.contentExpeditionFeedback(slug, 1, language)
			other := app.contentExpeditionFeedback(slug, 0, language)
			if expected == "" || other == "" || expected == other {
				t.Fatal("selected feedback fixture is missing")
			}
			input := map[string]any{"id": "selected-expedition-feedback", "encounterId": id, "selected": 1}
			if res := request(app, "POST", "/api/expedition/answer", token, input); res.Code != 403 || strings.Contains(res.Body.String(), expected) {
				t.Fatal("locked reply disclosed feedback")
			}
			if _, err := app.store.UpdateAccount(context.Background(), tokenHash(token), func(a *Account) error {
				a.Progress.CompletedQuestIDs = append([]string{}, storyQuestOrder...)
				return nil
			}); err != nil {
				t.Fatal(err)
			}
			res := request(app, "GET", "/api/content/expeditions/"+id, token, nil)
			if res.Code != 200 {
				t.Fatal(res.Body.String())
			}
			assertNoContentSecrets(t, res.Body.Bytes())
			if strings.Contains(res.Body.String(), expected) || strings.Contains(res.Body.String(), other) {
				t.Fatal("encounter read disclosed candidate feedback")
			}
			choice, _ := choices[0].(map[string]any)
			if sentenceID := stringValue(choice["sentenceId"]); sentenceID != "" {
				line := request(app, "GET", "/api/content/sentences?ids="+sentenceID, token, nil)
				if line.Code != 200 || !strings.Contains(line.Body.String(), "Ich bringe es hinter das blaue Tor.") {
					t.Fatal("redaction removed the selectable reply sentence")
				}
				published := app.content.PublishedIDs["lines:expedition:"+slug+":choice:0"]
				if published == "" {
					t.Fatal("new expedition reply lacks its published UUID bridge")
				}
				line = request(app, "GET", "/api/content/sentences?ids="+published, token, nil)
				if line.Code != 200 || !strings.Contains(line.Body.String(), sentenceID) {
					t.Fatal("published expedition choice UUID did not resolve to current sentence")
				}
			}
			res = request(app, "POST", "/api/expedition/answer", token, map[string]any{"id": "missing-selected", "encounterId": id})
			if res.Code != 400 || strings.Contains(res.Body.String(), expected) {
				t.Fatal("missing selection returned feedback")
			}
			for _, duplicate := range []bool{false, true} {
				res = request(app, "POST", "/api/expedition/answer", token, input)
				if res.Code != 200 {
					t.Fatal(res.Body.String())
				}
				var result struct {
					Feedback    string           `json:"feedback"`
					Explanation string           `json:"explanation"`
					Record      ExpeditionRecord `json:"record"`
					Duplicate   bool             `json:"duplicate"`
					Correct     bool             `json:"correct"`
				}
				if err := json.Unmarshal(res.Body.Bytes(), &result); err != nil {
					t.Fatal(err)
				}
				if result.Feedback != expected || result.Explanation != expected || result.Record.Selected != 1 || result.Record.Attempts != 1 || result.Duplicate != duplicate || result.Correct != result.Record.Correct {
					t.Fatalf("selected receipt mismatch %+v", result)
				}
				if strings.Contains(res.Body.String(), other) {
					t.Fatal("reply disclosed unselected feedback")
				}
			}
			conflict := map[string]any{"id": input["id"], "encounterId": id, "selected": 0}
			if res = request(app, "POST", "/api/expedition/answer", token, conflict); res.Code != 409 || strings.Contains(res.Body.String(), other) {
				t.Fatal("conflicting retry returned unrecorded feedback")
			}
			later := map[string]any{"id": "later-expedition-reply", "encounterId": id, "selected": 0}
			if res = request(app, "POST", "/api/expedition/answer", token, later); res.Code != 200 {
				t.Fatal(res.Body.String())
			}
			res = request(app, "POST", "/api/expedition/answer", token, input)
			var replay struct {
				Record   ExpeditionRecord `json:"record"`
				Feedback string           `json:"feedback"`
			}
			if res.Code != 200 || json.Unmarshal(res.Body.Bytes(), &replay) != nil || replay.Record.Selected != 1 || replay.Record.Correct || replay.Feedback != expected {
				t.Fatal("later answer changed earlier retry correctness or feedback")
			}
		})
	}
}

func TestContentMiniGameReadsKeepFeedbackAndAnswerKeysPrivate(t *testing.T) {
	app := contentTestApp(t)
	count := 0
	for _, record := range app.content.Records {
		if record.Kind != "minigame" {
			continue
		}
		count++
		for _, lang := range []string{"en", "tr"} {
			data, err := json.Marshal(app.publicRecord(record, lang))
			if err != nil {
				t.Fatal(err)
			}
			assertNoContentSecrets(t, data)
		}
	}
	if count == 0 {
		t.Fatal("minigame fixture missing")
	}
	fixture := map[string]any{"prompt": "visible task", "board": map[string]any{"expected": "key", "response": "private feedback", "orderExplanation": "private sequence", "modelAnswer": "private target"}}
	data, _ := json.Marshal(stripContent(fixture, "en", ""))
	assertNoContentSecrets(t, data)
	if !strings.Contains(string(data), "visible task") {
		t.Fatal("redaction removed the visible task")
	}
}

func TestContentAnswerAssistanceExpiresForLaterScheduledReview(t *testing.T) {
	app := contentTestApp(t)
	now := time.Date(2026, 10, 14, 12, 0, 0, 0, time.UTC)
	app.now = func() time.Time { return now }
	token, player := createSession(t, app, "Ada")
	course := testContentID(t, app, "course", "english")
	if res := request(app, "POST", "/api/course/activate", token, map[string]any{"courseId": course, "supportLanguage": "tr"}); res.Code != 200 {
		t.Fatal(res.Body.String())
	}
	exercise := testContentID(t, app, "exercise", "lex-en-ticket-word-production")
	item := testContentID(t, app, "item", "word-en-ticket-word")
	first := AttemptInput{ID: "help-original", ExerciseID: exercise, ItemID: item, Mode: "production", Answer: "wrong"}
	decodeAttempt(t, request(app, "POST", "/api/attempt", token, first))
	if res := request(app, "POST", "/api/attempt", token, map[string]any{"recover": true, "exerciseId": exercise}); res.Code != 200 {
		t.Fatal(res.Body.String())
	}
	assisted := first
	assisted.ID = "help-assisted"
	assisted.Answer = "ticket"
	decodeAttempt(t, request(app, "POST", "/api/attempt", token, assisted))
	account, _ := app.store.GetAccountByID(context.Background(), player.ID)
	if account.Progress.Words["en-ticket-word"].ModeStats["production"].UnaidedSuccesses != 0 {
		t.Fatal("model answer generated unaided evidence")
	}
	now = now.Add(2 * time.Hour)
	review := assisted
	review.ID = "help-next-review"
	decodeAttempt(t, request(app, "POST", "/api/attempt", token, review))
	account, _ = app.store.GetAccountByID(context.Background(), player.ID)
	if account.Progress.Words["en-ticket-word"].ModeStats["production"].UnaidedSuccesses != 1 {
		t.Fatal("answer reveal permanently disabled later recall evidence")
	}
}

func TestContentETagHashesCanonicalWireAndVersion(t *testing.T) {
	app := contentTestApp(t)
	token, _ := createSession(t, app, "Ada")
	account, err := app.store.Get(context.Background(), tokenHash(token))
	if err != nil {
		t.Fatal(err)
	}
	payload := map[string]any{"words": map[string]any{"ich-pron": map[string]any{"wordId": "ich-pron"}}, "stage": "gate", "access": map[string]any{"phase": "guest"}}
	r := httptest.NewRequest("GET", "/api/content/test", nil)
	w := httptest.NewRecorder()
	app.writeContent(&canonicalWriter{ResponseWriter: w, adapter: app.canonical}, r, account, payload)
	identity := contentWireVersion + ":" + account.Player.ID + ":" + account.ActiveCourseID + ":" + account.Preferences.BaseLanguage + ":" + strconv.FormatInt(account.Progress.Revision, 10)
	hash := sha256.Sum256(append([]byte(identity), w.Body.Bytes()...))
	expected := `"` + hex.EncodeToString(hash[:]) + `"`
	if w.Header().Get("ETag") != expected {
		t.Fatalf("ETag did not describe canonical wire bytes: %s vs %s", w.Header().Get("ETag"), expected)
	}
	oldData, _ := json.Marshal(payload)
	oldIdentity := account.Player.ID + ":" + account.ActiveCourseID + ":" + account.Preferences.BaseLanguage + ":" + strconv.FormatInt(account.Progress.Revision, 10)
	oldHash := sha256.Sum256(append([]byte(oldIdentity), oldData...))
	oldTag := `"` + hex.EncodeToString(oldHash[:]) + `"`
	r.Header.Set("If-None-Match", oldTag)
	fresh := httptest.NewRecorder()
	app.writeContent(&canonicalWriter{ResponseWriter: fresh, adapter: app.canonical}, r, account, payload)
	if fresh.Code == 304 {
		t.Fatal("old serializer cache survived wire-format migration")
	}
}
