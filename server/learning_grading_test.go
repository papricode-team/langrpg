package main

import (
	"context"
	"reflect"
	"strings"
	"testing"
	"time"
)

func TestProductionKeyboardSpellingsAndMechanicalTypos(t *testing.T) {
	exercise := Exercise{Mode: "production", Answer: "Ich möchte einen Kaffee"}
	for _, answer := range []string{"Ich moechte einen Kafefe", "Ich möchte einen Kafffee", "Ich möchte einen Kaffe"} {
		if !exercise.Grade(answer) {
			t.Errorf("typing slip rejected %q", answer)
		}
	}
	for _, answer := range []string{"Ich mochte einen Kaffee", "Ich möchte ein Kaffee", "Ich möchte einen Koffee", "Ich möcthe einen Kafefe"} {
		if exercise.Grade(answer) {
			t.Errorf("language error accepted %q", answer)
		}
	}
	for _, test := range []struct {
		mode, expected, answer string
		sensitive, correct     bool
	}{
		{"production", "schön", "schoen", false, true},
		{"production", "schön", "schon", false, false},
		{"production", "Straße", "Strasse", false, false},
		{"production", "der Bahnhof", "der bahnhof", true, false},
		{"recognition", "schön", "schoen", false, false},
		{"listening", "Kaffee", "Kafefe", false, false},
	} {
		if got := (Exercise{Mode: test.mode, Answer: test.expected, CaseSensitive: test.sensitive}).Grade(test.answer); got != test.correct {
			t.Errorf("%s %q -> %q: %v", test.mode, test.answer, test.expected, got)
		}
	}
}

func TestProductionFeedbackNamesActionableErrors(t *testing.T) {
	for _, test := range []struct {
		expected, answer, feedback string
		sensitive                  bool
	}{
		{"der Bahnhof", "die Bahnhof", "article", false},
		{"Bahnhof", "bahnhof", "capitalization", true},
		{"Ich trinke Kaffee", "Ich Kaffee trinke", "word order", false},
	} {
		if feedback := (Exercise{Mode: "production", Answer: test.expected, CaseSensitive: test.sensitive}).Feedback(test.answer); !strings.Contains(feedback, test.feedback) {
			t.Errorf("unhelpful feedback %q", feedback)
		}
	}
}

func TestStoryProductionPreservesMeaningfulGermanCapitals(t *testing.T) {
	curriculum, err := loadCurriculum()
	if err != nil {
		t.Fatal(err)
	}
	exercise := curriculum.Exercises["a2-apartment-exercise-6"]
	if exercise.Grade("Könnten sie das bitte reparieren?") || !strings.Contains(exercise.Feedback("Könnten sie das bitte reparieren?"), "capitalization") {
		t.Fatal("lowercase formal Sie erased the story response's meaning")
	}
	if !exercise.Grade("Koennten Sie das bitte reparieren?") {
		t.Fatal("keyboard umlaut fallback lost capitalization")
	}
	if !strings.Contains(exercise.Feedback("Koennten sie das bitte reparieren?"), "capitalization") {
		t.Fatal("keyboard spelling hid the capitalization guidance")
	}
}

func TestPassiveExposureMigrationClearsOldDeadlinesAndPreservesRecall(t *testing.T) {
	app := courseTestApp(t)
	token, player := createSession(t, app, "Ada")
	before := courseAttempt(t, app, token, "direct", "word-bahnhof-recognition", false)
	_, _, _, err := app.store.Mutate(context.Background(), tokenHash(token), "legacy-passive", []byte(`{}`), func(account *Account) (Receipt, error) {
		account.Progress.WordExposureVersion = 1
		account.Progress.Words["kaffee"] = WordMemory{WordID: "kaffee", Exposures: 3, ContextExposures: 3, DueAt: app.now().Add(-time.Hour), LastSeenAt: app.now()}
		return Receipt{}, nil
	})
	if err != nil {
		t.Fatal(err)
	}
	account, err := app.getAccount(context.Background(), tokenHash(token))
	if err != nil {
		t.Fatal(err)
	}
	if !account.Progress.Words["kaffee"].DueAt.IsZero() || account.Progress.Words["kaffee"].Exposures != 3 {
		t.Fatal("passive migration did not preserve exposure without a deadline")
	}
	if account.Progress.Words["bahnhof"].DueAt != before.Progress.Words["bahnhof"].DueAt || account.Progress.XP != before.Progress.XP || account.Player.ID != player.ID {
		t.Fatal("passive migration changed actual recall or the account")
	}
	if account.Progress.WordExposureVersion != 2 {
		t.Fatal("passive migration did not advance")
	}
}

func TestPlacementConversationGradesExistingResponsesWithoutCompletingStory(t *testing.T) {
	curriculum, err := loadCurriculum()
	if err != nil {
		t.Fatal(err)
	}
	store, err := NewJSONStore("")
	if err != nil {
		t.Fatal(err)
	}
	app := NewApp(store, curriculum, nil, 10)
	t.Cleanup(app.Close)
	token, _ := createSession(t, app, "Ada")
	before := storyProgress(t, app, token)
	ids := []string{"a1-arrival-exercise-1", "a1-cafe-exercise-6", "a1-lost-parcel-exercise-2", "a2-evening-plans-exercise-4", "a2-archive-exercise-4", "a2-apartment-exercise-6", "b1-council-exercise-5", "b1-witness-exercise-3"}
	for _, id := range ids {
		exercise, exists := curriculum.Exercises[id]
		if !exists {
			t.Fatalf("missing graded placement response %s", id)
		}
		input := AttemptInput{ID: "placement-" + id, ExerciseID: id, ItemID: exercise.ItemID, Answer: exercise.Answer, Mode: exercise.Mode, Level: curriculum.Items[exercise.ItemID].Level}
		result := decodeAttempt(t, request(app, "POST", "/api/attempt", token, input))
		if !result.Correct {
			t.Fatalf("placement response was not graded: %s", id)
		}
		if len(result.Progress.CompletedQuestIDs) != 0 || len(result.Progress.Story.Choices) != 0 || !reflect.DeepEqual(result.Progress.Story.Inventory, before.Story.Inventory) || len(result.Progress.Story.GateAttempts) != 0 {
			t.Fatal("placement invented completed story evidence")
		}
	}
}
