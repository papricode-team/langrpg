package main

import (
	"context"
	"encoding/json"
	"reflect"
	"strings"
	"testing"
)

func TestAttemptPreviewIsAuthenticatedAndNeverMutatesLearning(t *testing.T) {
	app := testApp(t)
	token, _ := createSession(t, app, "Ada")
	input := attemptFor("preview-answer")
	input.Preview = true
	for _, auth := range []string{"", strings.Repeat("a", 43)} {
		if r := request(app, "POST", "/api/attempt", auth, input); r.Code != 401 {
			t.Fatalf("preview accepted unknown account: %d %s", r.Code, r.Body.String())
		}
	}
	before, err := app.store.Get(context.Background(), tokenHash(token))
	if err != nil {
		t.Fatal(err)
	}
	for _, answer := range []string{"Guten Tag", "Auf Wiedersehen", "Guten Tag"} {
		input.Answer = answer
		r := request(app, "POST", "/api/attempt", token, input)
		var preview map[string]any
		if r.Code != 200 || json.Unmarshal(r.Body.Bytes(), &preview) != nil {
			t.Fatalf("preview failed: %d %s", r.Code, r.Body.String())
		}
		if preview["correct"] != (answer == "Guten Tag") || preview["preview"] != true || len(preview) != 3 {
			t.Fatalf("preview returned an answer, explanation or receipt: %+v", preview)
		}
	}
	after, err := app.store.Get(context.Background(), tokenHash(token))
	if err != nil || !reflect.DeepEqual(before, after) {
		t.Fatal("preview changed account, attempts, cards, XP or daily evidence")
	}
	input.SceneAttempt = true
	if r := request(app, "POST", "/api/attempt", token, input); r.Code != 400 {
		t.Fatal("preview could bypass an in-world reply")
	}
	input.SceneAttempt = false
	input.ItemID = "item-two"
	if r := request(app, "POST", "/api/attempt", token, input); r.Code != 400 {
		t.Fatal("preview accepted an exercise/item mismatch")
	}
}

func TestPreviewThenRatedCommitRecordsExactlyOneAttemptForEveryMode(t *testing.T) {
	for _, exerciseID := range []string{"exercise-one", "exercise-two", "exercise-audio"} {
		t.Run(exerciseID, func(t *testing.T) {
			app := testApp(t)
			token, _ := createSession(t, app, "Ada")
			ex := app.curriculum.Exercises[exerciseID]
			input := AttemptInput{ID: "review-answer", ExerciseID: ex.ID, ItemID: ex.ItemID, Mode: ex.Mode, Answer: ex.Answer, ResponseTimeMs: 2300, Preview: true}
			if r := request(app, "POST", "/api/attempt", token, input); r.Code != 200 {
				t.Fatal(r.Body.String())
			}
			if p := storyProgress(t, app, token); p.Attempts != 0 || p.XP != 0 || len(p.Items) != 0 {
				t.Fatal("preview scheduled a review")
			}
			input.Preview = false
			input.Rating = "hard"
			first := decodeAttempt(t, request(app, "POST", "/api/attempt", token, input))
			second := decodeAttempt(t, request(app, "POST", "/api/attempt", token, input))
			stats := second.Progress.Items[ex.ItemID].ModeStats[ex.Mode]
			if !first.Correct || !second.Duplicate || first.XPAdded == 0 || second.XPAdded != 0 || second.Progress.Attempts != 1 || stats.Attempts != 1 || stats.ResponseTimeMs != 2300 || second.Progress.Story.Promise.CorrectAnswers != 1 {
				t.Fatal("rating/commit retry duplicated or changed the captured recall")
			}
		})
	}
}

func TestAttemptPreviewLeavesPendingExposureMigrationUntouched(t *testing.T) {
	app := courseTestApp(t)
	token, _ := createSession(t, app, "Ada")
	_, _, _, err := app.store.Mutate(context.Background(), tokenHash(token), "legacy-for-preview", []byte(`{}`), func(account *Account) (Receipt, error) {
		account.Progress.WordExposureVersion = 1
		return Receipt{}, nil
	})
	if err != nil {
		t.Fatal(err)
	}
	ex := app.curriculum.Exercises["word-bahnhof-recognition"]
	input := AttemptInput{ID: "legacy-preview", ItemID: ex.ItemID, ExerciseID: ex.ID, Mode: ex.Mode, Answer: ex.Answer, Preview: true}
	if r := request(app, "POST", "/api/attempt", token, input); r.Code != 200 {
		t.Fatal(r.Body.String())
	}
	account, err := app.store.Get(context.Background(), tokenHash(token))
	if err != nil || account.Progress.WordExposureVersion != 1 || account.Progress.Attempts != 0 || len(account.Progress.Items) != 0 {
		t.Fatal("preview mutated a legacy account while authenticating")
	}
}
