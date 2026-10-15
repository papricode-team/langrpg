package main

import (
	"context"
	"encoding/json"
	"glotworld/server/internal/billing/billingtest"
	"maps"
	"reflect"
	"testing"
)

func TestContentReferralsStayAccountWideAcrossCoursesAndResets(t *testing.T) {
	t.Setenv("PUBLIC_URL", "https://glotworld.com")
	app := contentTestApp(t)
	app.billing = billingtest.NewClient(nil)
	inviterToken, inviter := createSession(t, app, "Course inviter")
	german, english := app.canonical.DefaultCourse(), testContentID(t, app, "course", "english")
	update := func(token string, fn func(*Account) error) Account {
		t.Helper()
		account, err := app.store.UpdateAccount(context.Background(), tokenHash(token), fn)
		if err != nil {
			t.Fatal(err)
		}
		return account
	}
	activate := func(course, language string) {
		t.Helper()
		if response := request(app, "POST", "/api/course/activate", inviterToken, map[string]any{"courseId": course, "supportLanguage": language}); response.Code != 200 {
			t.Fatal(response.Body.String())
		}
	}
	update(inviterToken, func(account *Account) error { account.Progress.XP = 9; return nil })
	activate(english, "de")
	update(inviterToken, func(account *Account) error { account.Progress.XP = 23; return nil })
	if err := app.store.SetCredentials(context.Background(), tokenHash(inviterToken), "course-inviter@example.com", "encoded"); err != nil {
		t.Fatal(err)
	}
	code := issueInvite(t, app, inviterToken)
	if code != inviter.ID {
		t.Fatal("canonical adapter changed the account invite identity")
	}
	before := update(inviterToken, func(account *Account) error {
		account.Access.PlayedNanoseconds = int64(trialPlayLimit)
		return nil
	})
	friendToken, _ := createSession(t, app, "Course friend")
	input := map[string]string{"email": "course-friend@example.com", "password": "a long friend password", "referralCode": code}
	for range 2 {
		if response := request(app, "POST", "/api/account/register", friendToken, input); response.Code != 200 {
			t.Fatal(response.Body.String())
		}
	}
	after, err := app.store.Get(context.Background(), tokenHash(inviterToken))
	if err != nil || after.Referrals.SuccessfulSignups != 1 || after.ActiveCourseID != english || !reflect.DeepEqual(before.Progress, after.Progress) || !reflect.DeepEqual(before.CourseStates, after.CourseStates) || playLimit(after) != trialPlayLimit+referralPlayBonus {
		t.Fatal("invite credit changed course progress or duplicated its account-wide reward")
	}
	status := app.accessState(after, app.now())
	if status.Phase != "trial" || status.RemainingSeconds != int(referralPlayBonus.Seconds()) {
		t.Fatal("invite did not reopen the exhausted trial by exactly ninety minutes")
	}
	activate(german, "en")
	after, err = app.store.Get(context.Background(), tokenHash(inviterToken))
	if err != nil || after.Progress.XP != 9 || after.Referrals.SuccessfulSignups != 1 || playLimit(after) != trialPlayLimit+referralPlayBonus {
		t.Fatal("switching courses lost or duplicated the shared referral allowance")
	}
	if response := request(app, "POST", "/api/access/reset", inviterToken, nil); response.Code != 200 {
		t.Fatal(response.Body.String())
	}
	activate(english, "tr")
	after, err = app.store.Get(context.Background(), tokenHash(inviterToken))
	if err != nil || after.Progress.XP != 0 || !after.Referrals.Enabled || after.Referrals.ResetSignups != 1 || referralBonus(after) != 0 || playLimit(after) != trialPlayLimit {
		t.Fatal("reset retained course progress, replayed a reward, or discarded the issued invite")
	}
	secondToken, _ := createSession(t, app, "Second course friend")
	if err := app.store.RegisterWithReferral(context.Background(), tokenHash(secondToken), "second-course-friend@example.com", "encoded", code, app.now()); err != nil {
		t.Fatal(err)
	}
	after, err = app.store.Get(context.Background(), tokenHash(inviterToken))
	if err != nil || after.ActiveCourseID != english || after.Progress.XP != 0 || after.Referrals.SuccessfulSignups != 2 || referralBonus(after) != referralPlayBonus {
		t.Fatal("a new signup after reset did not reward the same account once")
	}
}

func TestContentInteriorStationExercisesUseRoomEntitlementAndWordPacing(t *testing.T) {
	app := contentTestApp(t)
	token, _ := createSession(t, app, "Fresh interior visitor")
	for _, slug := range []string{"a1-cafe-exercise-1", "a1-cafe-exercise-2", "a1-cafe-exercise-6", "a1-market-exercise-4"} {
		id := testContentID(t, app, "exercise", slug)
		response := request(app, "GET", "/api/content/exercises/"+id, token, nil)
		if response.Code != 200 {
			t.Fatalf("reachable station exercise remained locked: %d %s", response.Code, response.Body.String())
		}
		assertNoContentSecrets(t, response.Body.Bytes())
		var public struct {
			Body struct {
				WordIDs []string `json:"wordIds"`
			} `json:"body"`
		}
		if json.Unmarshal(response.Body.Bytes(), &public) != nil || len(public.Body.WordIDs) != len(app.curriculum.Exercises[slug].WordIDs) || len(public.Body.WordIDs) == 0 {
			t.Fatal("station practice lost its authoritative restored-word context")
		}
	}
	for _, slug := range []string{"a2-evening-plans-exercise-5", "b1-witness-exercise-3"} {
		if response := request(app, "GET", "/api/content/exercises/"+testContentID(t, app, "exercise", slug), token, nil); response.Code != 404 {
			t.Fatal("opening a room unlocked an advanced or unrelated story exercise")
		}
	}
	// A direct word offered by an authored station may be described before intake;
	// neither a preview nor a rated answer may manufacture its restoration.
	wordExercise := app.curriculum.Exercises["lex-kaffee-noun-recognition"]
	if wordExercise.ID == "" {
		t.Fatal("missing lexical fixture")
	}
	wordID := testContentID(t, app, "exercise", wordExercise.ID)
	app.stationRooms = maps.Clone(app.stationRooms)
	app.stationRooms[wordID] = []stationRoom{{CourseID: app.canonical.DefaultCourse(), MapID: DefaultMapID, InteriorID: "cafe"}}
	if response := request(app, "GET", "/api/content/exercises/"+wordID, token, nil); response.Code != 200 {
		t.Fatal("station vocabulary metadata remained unavailable")
	}
	input := AttemptInput{ID: "unrestored-station-word", ExerciseID: wordID, ItemID: app.canonical.Translate(wordExercise.ItemID, true), Mode: wordExercise.Mode, Answer: wordExercise.Answer}
	for _, preview := range []bool{true, false} {
		input.Preview = preview
		if response := request(app, "POST", "/api/attempt", token, input); response.Code != 409 {
			t.Fatalf("station word bypassed restoration: %d %s", response.Code, response.Body.String())
		}
	}
	app.stationRooms[wordID] = []stationRoom{{CourseID: app.canonical.DefaultCourse(), MapID: "waldruh", InteriorID: "cafe"}}
	if response := request(app, "GET", "/api/content/exercises/"+wordID, token, nil); response.Code != 404 {
		t.Fatal("an invalid or unreachable station room granted an exercise")
	}
	if response := request(app, "POST", "/api/course/activate", token, map[string]any{"courseId": testContentID(t, app, "course", "english"), "supportLanguage": "de"}); response.Code != 200 {
		t.Fatal(response.Body.String())
	}
	if response := request(app, "GET", "/api/content/exercises/"+testContentID(t, app, "exercise", "a1-cafe-exercise-1"), token, nil); response.Code != 404 {
		t.Fatal("the English course inherited a German room's exercise entitlement")
	}
}
