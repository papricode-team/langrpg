package main

import (
	"context"
	"encoding/json"
	"glotworld/server/internal/billing"
	"glotworld/server/internal/billing/billingtest"
	"reflect"
	"testing"
	"time"
)

func TestContentPlacementGrantsOnlyEligibleDiagnosticReadsAndReadOnlyChecks(t *testing.T) {
	app := contentTestApp(t)
	app.billing = billingtest.NewClient(nil)
	token, _ := createSession(t, app, "Paid diagnostic")
	other, _ := createSession(t, app, "Other diagnostic")
	hash := tokenHash(token)
	if _, err := app.store.UpdateAccount(context.Background(), hash, func(account *Account) error {
		account.Email = "placement@example.com"
		account.Billing = billing.State{Plan: "lifetime", CustomerID: "customer", LifetimeOrderID: "order", VerifiedAt: app.now()}
		account.Progress.Intake.ActiveSeconds = placementActiveSeconds - 1
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	contextID := testContentID(t, app, "context", "placement:german")
	var authored struct {
		Data struct {
			ExerciseIDs []string `json:"exerciseIds"`
			Questions   []struct {
				ExerciseID string `json:"exerciseId"`
				Level      string `json:"level"`
				Turn       struct {
					SentenceID string `json:"sentenceId"`
				} `json:"turn"`
			} `json:"questions"`
		} `json:"data"`
	}
	if err := json.Unmarshal(app.content.ByID[contextID].Body, &authored); err != nil || len(authored.Data.ExerciseIDs) != 8 || len(authored.Data.Questions) != 8 {
		t.Fatal("diagnostic must contain exactly eight authored questions")
	}
	late := authored.Data.Questions[len(authored.Data.Questions)-1]
	check := func(questionID, level, id string) *AttemptInput {
		t.Helper()
		exercise := app.curriculum.Exercises[app.canonical.Translate(questionID, false)]
		if exercise.ID == "" {
			t.Fatal("diagnostic exercise is outside the private grading curriculum")
		}
		return &AttemptInput{ID: id, ExerciseID: questionID, ItemID: app.canonical.Translate(exercise.ItemID, true), Mode: exercise.Mode, Level: level, Answer: exercise.Answer, Preview: true}
	}
	if response := request(app, "GET", "/api/content/contexts/"+contextID, token, nil); response.Code != 404 {
		t.Fatal("placement context opened before ten active minutes")
	}
	if response := request(app, "GET", "/api/content/exercises/"+late.ExerciseID, token, nil); response.Code != 404 {
		t.Fatal("diagnostic exercise bypassed the opening play threshold")
	}
	if response := request(app, "POST", "/api/attempt", token, check(late.ExerciseID, late.Level, "early-placement")); response.Code != 404 {
		t.Fatal("diagnostic preview bypassed the opening play threshold")
	}
	assertCue := func(session string, want int) {
		t.Helper()
		response := request(app, "GET", "/api/content/sentences?ids="+late.Turn.SentenceID, session, nil)
		var batch struct {
			Records []json.RawMessage `json:"records"`
		}
		if response.Code != 200 || json.Unmarshal(response.Body.Bytes(), &batch) != nil || len(batch.Records) != want {
			t.Fatalf("placement cue access %d %s", response.Code, response.Body.String())
		}
	}
	assertCue(token, 0)
	if _, err := app.store.UpdateAccount(context.Background(), hash, func(account *Account) error {
		account.Progress.Intake.ActiveSeconds = placementActiveSeconds
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	response := request(app, "GET", "/api/content/contexts/"+contextID, token, nil)
	if response.Code != 200 {
		t.Fatalf("paid active-play diagnostic remained locked: %d %s", response.Code, response.Body.String())
	}
	assertNoContentSecrets(t, response.Body.Bytes())
	assertCue(token, 1)
	unrelated := testContentID(t, app, "exercise", "b1-council-exercise-6")
	if response := request(app, "GET", "/api/content/exercises/"+unrelated, token, nil); response.Code != 404 {
		t.Fatal("diagnostic eligibility opened an unrelated locked exercise")
	}
	for i, question := range authored.Data.Questions {
		response := request(app, "GET", "/api/content/exercises/"+question.ExerciseID, token, nil)
		if response.Code != 200 {
			t.Fatalf("diagnostic exercise %d remained locked: %d %s", i, response.Code, response.Body.String())
		}
		assertNoContentSecrets(t, response.Body.Bytes())
		var record struct {
			Body struct {
				SentenceID      string `json:"sentenceId"`
				AnswerAvailable bool   `json:"answerAvailable"`
			} `json:"body"`
		}
		if json.Unmarshal(response.Body.Bytes(), &record) != nil || record.Body.AnswerAvailable {
			t.Fatal("diagnostic eligibility supplied an unearned model answer")
		}
		exercise := app.curriculum.Exercises[app.canonical.Translate(question.ExerciseID, false)]
		if record.Body.SentenceID != "" {
			stem := request(app, "GET", "/api/content/sentences?ids="+record.Body.SentenceID, token, nil)
			var batch struct {
				Records []json.RawMessage `json:"records"`
			}
			if exercise.Mode == "production" || stem.Code != 200 || json.Unmarshal(stem.Body.Bytes(), &batch) != nil || len(batch.Records) != 1 {
				t.Fatal("diagnostic prompt stem was hidden or a production model was disclosed")
			}
		}
	}
	before, err := app.store.Get(context.Background(), hash)
	if err != nil {
		t.Fatal(err)
	}
	for i, question := range authored.Data.Questions {
		input := check(question.ExerciseID, question.Level, "placement-check-"+question.Level+"-"+string(rune('a'+i)))
		response := request(app, "POST", "/api/attempt", token, input)
		var result map[string]any
		if response.Code != 200 || json.Unmarshal(response.Body.Bytes(), &result) != nil || result["correct"] != true || result["preview"] != true || len(result) != 3 {
			t.Fatalf("diagnostic check changed grading or disclosed feedback: %d %s", response.Code, response.Body.String())
		}
	}
	after, err := app.store.Get(context.Background(), hash)
	if err != nil || !reflect.DeepEqual(before, after) {
		t.Fatal("diagnostic previews changed learning progress, story, billing, or receipts")
	}
	rated := check(late.ExerciseID, late.Level, "placement-rated-bypass")
	rated.Preview = false
	if response := request(app, "POST", "/api/attempt", token, rated); response.Code != 404 {
		t.Fatal("diagnostic eligibility minted rated evidence for a locked story exercise")
	}
	if response := request(app, "POST", "/api/attempt", token, map[string]any{"exerciseId": late.ExerciseID, "recover": true}); response.Code != 409 {
		t.Fatal("read-only diagnostic checks unlocked the model answer")
	}
	if response := request(app, "GET", "/api/content/contexts/"+contextID, other, nil); response.Code != 404 {
		t.Fatal("another account inherited diagnostic eligibility")
	}
	assertCue(other, 0)
	if _, err := app.store.UpdateAccount(context.Background(), tokenHash(other), func(account *Account) error {
		account.Email = "legacy-placement@example.com"
		account.Access.PlayedNanoseconds = int64(placementActiveSeconds) * int64(time.Second)
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	if response := request(app, "GET", "/api/content/contexts/"+contextID, other, nil); response.Code != 200 {
		t.Fatal("legacy active-play evidence lost diagnostic eligibility")
	}
	if response := request(app, "POST", "/api/course/activate", token, map[string]any{"courseId": testContentID(t, app, "course", "english"), "supportLanguage": "de"}); response.Code != 200 {
		t.Fatal(response.Body.String())
	}
	if response := request(app, "GET", "/api/content/contexts/"+contextID, token, nil); response.Code != 404 {
		t.Fatal("another active course exposed the German diagnostic")
	}
	assertCue(token, 0)
}
