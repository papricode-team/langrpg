package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http/httptest"
	"reflect"
	"strings"
	"sync"
	"testing"
)

type batchResult struct {
	AttemptID       string `json:"attemptId"`
	Status          int    `json:"status"`
	Correct         bool   `json:"correct"`
	CorrectedAnswer string `json:"correctedAnswer"`
	XPAdded         int    `json:"xpAdded"`
	Duplicate       bool   `json:"duplicate"`
	Error           string `json:"error"`
}

type batchResponse struct {
	Results    []batchResult    `json:"results"`
	Progress   Progress         `json:"progress"`
	Retrievals RetrievalMetrics `json:"retrievals"`
}

func decodeBatch(t *testing.T, w *httptest.ResponseRecorder) batchResponse {
	t.Helper()
	var result batchResponse
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &result) != nil {
		t.Fatalf("batch: %d %s", w.Code, w.Body.String())
	}
	return result
}

func TestAttemptBatchGradesEveryModalityAndSharesIndividualReceipts(t *testing.T) {
	app := testApp(t)
	token, _ := createSession(t, app, "Ada")
	inputs := []AttemptInput{
		attemptFor("batch-recognition"),
		{ID: "batch-listening", ItemID: "item-two", ExerciseID: "exercise-audio", Mode: "listening", Answer: "wrong", ResponseTimeMs: 2000},
		{ID: "batch-production", ItemID: "item-two", ExerciseID: "exercise-two", Mode: "production", Answer: "Ich bin hier", Hinted: true},
	}
	first := decodeBatch(t, request(app, "POST", "/api/attempt", token, inputs))
	if len(first.Results) != 3 || !first.Results[0].Correct || first.Results[1].Correct || !first.Results[2].Correct || first.Progress.Attempts != 3 || first.Progress.CorrectAttempts != 2 {
		t.Fatalf("incorrect batch grading: %+v", first)
	}
	if len(first.Progress.Items["item-two"].Cards) != 1 || first.Progress.Items["item-two"].ModeStats["production"].UnaidedSuccesses != 0 || first.Retrievals.Modalities["listening"].ResponseTimeMs != 2000 {
		t.Fatal("batch changed separate cards, hinted evidence, or response timing")
	}
	for i, result := range first.Results {
		if result.AttemptID != inputs[i].ID || result.Status != 200 || result.Duplicate {
			t.Fatalf("lost per-attempt result: %+v", result)
		}
	}
	retry := decodeBatch(t, request(app, "POST", "/api/attempt", token, inputs))
	for _, result := range retry.Results {
		if !result.Duplicate || result.XPAdded != 0 {
			t.Fatalf("batch retry duplicated XP: %+v", result)
		}
	}
	if retry.Progress.Attempts != 3 || retry.Progress.XP != first.Progress.XP {
		t.Fatal("batch retry duplicated evidence")
	}
	individual := decodeAttempt(t, request(app, "POST", "/api/attempt", token, inputs[0]))
	if !individual.Duplicate || individual.Progress.Attempts != 3 {
		t.Fatal("batch and individual did not share idempotency receipts")
	}
	inputs = []AttemptInput{inputs[2], attemptFor("batch-new"), inputs[0]}
	overlap := decodeBatch(t, request(app, "POST", "/api/attempt", token, inputs))
	if !overlap.Results[0].Duplicate || overlap.Results[1].Duplicate || !overlap.Results[2].Duplicate || overlap.Progress.Attempts != 4 {
		t.Fatal("reordered overlapping batch failed to recover independently")
	}
}

func TestAttemptBatchReportsPartialFailuresWithoutTrustingClient(t *testing.T) {
	app := testApp(t)
	token, _ := createSession(t, app, "Ada")
	decodeAttempt(t, request(app, "POST", "/api/attempt", token, attemptFor("prior")))
	conflict := attemptFor("prior")
	conflict.Answer = "wrong"
	inputs := []any{
		conflict,
		map[string]any{"id": "client-correct", "itemId": "item-one", "exerciseId": "exercise-one", "mode": "recognition", "answer": "wrong", "correct": true},
		AttemptInput{ID: "unknown-exercise", ItemID: "item-one", ExerciseID: "fake", Mode: "recognition", Answer: "Guten Tag"},
		attemptFor("after-error"),
	}
	result := decodeBatch(t, request(app, "POST", "/api/attempt", token, inputs))
	if result.Results[0].Status != 409 || result.Results[1].Status != 200 || result.Results[1].Correct || result.Results[2].Status != 400 || !result.Results[3].Correct || result.Progress.Attempts != 3 {
		t.Fatalf("partial batch result: %+v", result)
	}
	if result.Results[0].Error == "" || result.Results[2].Error == "" || result.Progress.CorrectAttempts != 2 {
		t.Fatal("failed batch entries added progress or lost their errors")
	}
}

func TestAttemptBatchBoundsAuthenticationAndPerAttemptRateLimit(t *testing.T) {
	app := testApp(t)
	token, _ := createSession(t, app, "Ada")
	for _, value := range []any{[]AttemptInput{}, make([]AttemptInput, 31), nil, "not a body"} {
		if r := request(app, "POST", "/api/attempt", token, value); r.Code != 400 && r.Code != 415 {
			t.Fatalf("invalid batch accepted: %d %s", r.Code, r.Body.String())
		}
	}
	for _, token := range []string{"", strings.Repeat("a", 43)} {
		if r := request(app, "POST", "/api/attempt", token, []AttemptInput{attemptFor("auth")}); r.Code != 401 {
			t.Fatal("batch accepted unknown account")
		}
	}
	for round := range 4 {
		inputs := make([]AttemptInput, 30)
		for i := range inputs {
			inputs[i] = attemptFor(fmt.Sprintf("limit-%d-%d", round, i))
			inputs[i].Answer = strings.Repeat("a", 400)
		}
		result := decodeBatch(t, request(app, "POST", "/api/attempt", token, inputs))
		if len(result.Results) != 30 || result.Progress.Attempts != 30*(round+1) {
			t.Fatal("maximum-sized batch was rejected or truncated")
		}
	}
	if r := request(app, "POST", "/api/attempt", token, []AttemptInput{attemptFor("rate-over")}); r.Code != 429 {
		t.Fatal("batch bypassed the per-attempt rate limit")
	}
}

func TestConcurrentBatchesRecordAnAttemptExactlyOnce(t *testing.T) {
	app := testApp(t)
	token, _ := createSession(t, app, "Ada")
	var group sync.WaitGroup
	responses := make(chan *httptest.ResponseRecorder, 12)
	for range 12 {
		group.Go(func() {
			responses <- request(app, "POST", "/api/attempt", token, []AttemptInput{attemptFor("shared-round")})
		})
	}
	group.Wait()
	close(responses)
	nonduplicates := 0
	for response := range responses {
		result := decodeBatch(t, response)
		if !result.Results[0].Duplicate {
			nonduplicates++
		}
	}
	progress := storyProgress(t, app, token)
	if nonduplicates != 1 || progress.Attempts != 1 || progress.XP != 6 {
		t.Fatal("concurrent batches duplicated evidence or XP")
	}
}

func TestPreviewBatchNeverMutatesAccount(t *testing.T) {
	app := testApp(t)
	token, _ := createSession(t, app, "Ada")
	before, _ := app.store.Get(context.Background(), tokenHash(token))
	input := attemptFor("batch-preview")
	input.Preview = true
	result := decodeBatch(t, request(app, "POST", "/api/attempt", token, []AttemptInput{input}))
	after, _ := app.store.Get(context.Background(), tokenHash(token))
	if !result.Results[0].Correct || !reflect.DeepEqual(before, after) || result.Retrievals.Graded != 0 {
		t.Fatal("preview batch awarded learning evidence")
	}
}
