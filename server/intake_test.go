package main

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"
)

// pacedStoryTestApp keeps the generated syllabus installed and runs on a
// controllable clock, so tests can earn words by the hour.
func pacedStoryTestApp(t *testing.T) (*App, *time.Time) {
	t.Helper()
	curriculum, err := loadCurriculum()
	if err != nil {
		t.Fatal(err)
	}
	if curriculum.Syllabus == nil {
		t.Fatal("the syllabus manifest is not installed")
	}
	store, err := NewJSONStore("")
	if err != nil {
		t.Fatal(err)
	}
	app := NewApp(store, curriculum, []string{"http://localhost:5173"}, 10)
	clock := time.Date(2026, 10, 11, 9, 0, 0, 0, time.UTC)
	app.now = func() time.Time { return clock }
	t.Cleanup(app.Close)
	return app, &clock
}

type heartbeatResponse struct {
	Progress   Progress     `json:"progress"`
	Introduced []string     `json:"introduced"`
	Status     IntakeStatus `json:"status"`
	Duplicate  bool         `json:"duplicate"`
}

func beat(t *testing.T, app *App, token, id string, seconds int) heartbeatResponse {
	t.Helper()
	r := request(app, "POST", "/api/intake/heartbeat", token, heartbeatInput{ID: id, Seconds: seconds})
	if r.Code != 200 {
		t.Fatalf("heartbeat %s: %d %s", id, r.Code, r.Body.String())
	}
	var value heartbeatResponse
	if err := json.Unmarshal(r.Body.Bytes(), &value); err != nil {
		t.Fatal(err)
	}
	return value
}

func restoreVocabulary(t *testing.T, app *App, token string, wordIDs ...string) {
	t.Helper()
	_, _, _, err := app.store.Mutate(context.Background(), tokenHash(token), "test-restore:"+strings.Join(wordIDs, ","), json.RawMessage(`{}`), func(a *Account) (Receipt, error) {
		migrateIntake(&a.Progress, app.curriculum.Syllabus)
		for _, id := range wordIDs {
			if !a.Progress.wordIntroduced(id) {
				a.Progress.Intake.WordIDs = append(a.Progress.Intake.WordIDs, id)
			}
		}
		return Receipt{}, nil
	})
	if err != nil {
		t.Fatal(err)
	}
}

func settleWords(t *testing.T, app *App, token string) {
	t.Helper()
	_, _, _, err := app.store.Mutate(context.Background(), tokenHash(token), "test-settle:"+app.now().String(), json.RawMessage(`{}`), func(a *Account) (Receipt, error) {
		for _, id := range a.Progress.Intake.WordIDs {
			word := a.Progress.Words[id]
			word.WordID = id
			if word.ModeStats == nil {
				word.ModeStats = map[string]ModeStats{}
			}
			word.ModeStats["recognition"] = ModeStats{Attempts: 1, Correct: 1, UnaidedSuccesses: 1}
			a.Progress.Words[id] = word
		}
		return Receipt{}, nil
	})
	if err != nil {
		t.Fatal(err)
	}
}

func TestNewAdventureReceivesTheOpeningWordsThenTenPerHour(t *testing.T) {
	app, clock := pacedStoryTestApp(t)
	token, _ := createSession(t, app, "Ada")
	s := app.curriculum.Syllabus
	first := beat(t, app, token, "sync", 0)
	if len(first.Introduced) != s.OpeningWords || len(first.Progress.Intake.WordIDs) != s.OpeningWords {
		t.Fatalf("opening allowance: %+v", first.Introduced)
	}
	if first.Introduced[0] != s.WordIDs[0] || first.Status.Pending != 0 || first.Status.NextWordInSeconds != s.SecondsPerWord() {
		t.Fatalf("opening words must follow the syllabus and leave nothing pending: %+v", first.Status)
	}
	// Ten words an hour: sixty one-minute beats introduce exactly ten more words.
	total := 0
	for minute := 1; minute <= 60; minute++ {
		*clock = clock.Add(time.Minute)
		settleWords(t, app, token)
		response := beat(t, app, token, "minute-"+time.Duration(minute).String(), 60)
		total += len(response.Introduced)
		if len(response.Introduced) > 1 {
			t.Fatalf("minute %d introduced %d words at once", minute, len(response.Introduced))
		}
	}
	if total != s.WordsPerHour {
		t.Fatalf("one hour of play introduced %d words, want %d", total, s.WordsPerHour)
	}
	p := storyProgress(t, app, token)
	if p.Intake.ActiveSeconds != 3600 || len(p.Intake.WordIDs) != s.OpeningWords+s.WordsPerHour {
		t.Fatalf("intake after one hour: %+v", p.Intake)
	}
	for index, id := range p.Intake.WordIDs {
		if id != s.WordIDs[index] {
			t.Fatalf("words left the syllabus order at %d: %s", index, id)
		}
	}
}

func TestHeartbeatsCannotCreditMoreThanWallTimeAndRepeatOnce(t *testing.T) {
	app, clock := pacedStoryTestApp(t)
	token, _ := createSession(t, app, "Ada")
	beat(t, app, token, "sync", 0)
	*clock = clock.Add(10 * time.Second)
	response := beat(t, app, token, "greedy", 120)
	if response.Progress.Intake.ActiveSeconds != 10+heartbeatTolerance {
		t.Fatalf("a beat credited more than the elapsed wall time: %+v", response.Progress.Intake)
	}
	again := beat(t, app, token, "greedy", 120)
	if !again.Duplicate || again.Progress.Intake.ActiveSeconds != response.Progress.Intake.ActiveSeconds {
		t.Fatal("repeating a heartbeat ID credited play twice")
	}
	if r := request(app, "POST", "/api/intake/heartbeat", token, heartbeatInput{ID: "too-long", Seconds: 121}); r.Code != 400 {
		t.Fatalf("oversized beat accepted: %d", r.Code)
	}
}

func TestIntakePausesUntilRestoredWordsAreRecognisedAndBanksAtMostFifteen(t *testing.T) {
	s := &Syllabus{WordsPerHour: 10, OpeningWords: 10, BankCap: 15}
	s.Brake.MaxUnsettled, s.Brake.MaxDue = 12, 20
	for i := 0; i < 40; i++ {
		s.WordIDs = append(s.WordIDs, string(rune('a'+i/26))+string(rune('a'+i%26)))
	}
	s.position = map[string]int{}
	for index, id := range s.WordIDs {
		s.position[id] = index
	}
	p := newProgress()
	now := time.Date(2026, 10, 11, 9, 0, 0, 0, time.UTC)
	migrateIntake(&p, s)
	if added := introduceDue(&p, s, now); len(added) != 10 {
		t.Fatalf("opening words: %v", added)
	}
	// Twelve unsettled words stop both new words and the clock behind them.
	for i := 0; i < 20; i++ {
		now = now.Add(2 * time.Minute)
		creditHeartbeat(&p, s, 120, now)
		introduceDue(&p, s, now)
	}
	status := intakeStatus(&p, s, now)
	if len(p.Intake.WordIDs) != 12 || status.Paused != "practise" || status.Pending != 0 || status.NextWordInSeconds != 0 {
		t.Fatalf("brake did not hold at twelve unsettled words: %d words, %+v", len(p.Intake.WordIDs), status)
	}
	paused := p.Intake.CreditSeconds
	now = now.Add(time.Hour)
	creditHeartbeat(&p, s, 120, now)
	if p.Intake.CreditSeconds != paused || p.Intake.ActiveSeconds != 20*120+120 {
		t.Fatalf("paused intake must count play but earn no words: %+v", p.Intake)
	}
	// Settling the words lifts the brake; unused time never banks more than bankCap words.
	for _, id := range p.Intake.WordIDs {
		p.Words[id] = WordMemory{WordID: id, ModeStats: map[string]ModeStats{"recognition": {Attempts: 1, Correct: 1, UnaidedSuccesses: 1}}}
	}
	for i := 0; i < 100; i++ {
		now = now.Add(time.Hour)
		creditHeartbeat(&p, s, 120, now)
	}
	status = intakeStatus(&p, s, now)
	if status.Paused != "" || status.Pending != s.BankCap {
		t.Fatalf("bank must hold exactly bankCap words: %+v", status)
	}
	if added := introduceDue(&p, s, now); len(added) != s.BankCap || len(p.Intake.WordIDs) != 27 {
		t.Fatalf("banked words: %d introduced, %d total", len(added), len(p.Intake.WordIDs))
	}
	// Review pressure pauses intake too.
	for _, id := range p.Intake.WordIDs[:20] {
		word := p.Words[id]
		word.DirectAttempts, word.DueAt = 1, now.Add(-time.Minute)
		if word.ModeStats == nil {
			word.ModeStats = map[string]ModeStats{"recognition": {UnaidedSuccesses: 1}}
		}
		p.Words[id] = word
	}
	if status := intakeStatus(&p, s, now); status.Paused != "review" || status.Due != 20 {
		t.Fatalf("review brake: %+v", status)
	}
}

func TestWholeStoryRemainsPlayableWithoutWaitingForVocabulary(t *testing.T) {
	for _, paused := range []string{"", "practise", "review"} {
		name := paused
		if name == "" {
			name = "opening words"
		}
		t.Run(name, func(t *testing.T) {
			app, _ := pacedStoryTestApp(t)
			token, player := createSession(t, app, "Ada")
			beat(t, app, token, "sync", 0)
			s := app.curriculum.Syllabus
			if paused != "" {
				count := s.Brake.MaxUnsettled
				if paused == "review" {
					count = s.Brake.MaxDue
				}
				restoreVocabulary(t, app, token, s.WordIDs[:count]...)
				if paused == "review" {
					settleWords(t, app, token)
					_, _, _, err := app.store.Mutate(context.Background(), tokenHash(token), "test-overdue", json.RawMessage(`{}`), func(a *Account) (Receipt, error) {
						for _, id := range a.Progress.Intake.WordIDs {
							word := a.Progress.Words[id]
							word.DirectAttempts, word.DueAt = 1, app.now().Add(-time.Minute)
							a.Progress.Words[id] = word
						}
						return Receipt{}, nil
					})
					if err != nil {
						t.Fatal(err)
					}
				}
			}
			before := storyProgress(t, app, token)
			if status := intakeStatus(&before, s, app.now()); status.Paused != paused {
				t.Fatalf("wrong intake fixture: %+v", status)
			}
			for _, questID := range storyQuestOrder {
				rule, _ := storyRule(questID)
				p := storyProgress(t, app, token)
				choiceID := ""
				for _, choice := range rule.Choices {
					if choice.Condition.met(&p.Story) {
						choiceID = choice.ID
						break
					}
				}
				if choiceID == "" {
					t.Fatalf("%s has no available consequence", questID)
				}
				// Exercises, evidence, transitions and choices all use the real
				// syllabus, without earning time or restoring the scene's words.
				finishStoryQuest(t, app, token, player, questID, questID+"-", choiceID)
			}
			after := storyProgress(t, app, token)
			if len(after.CompletedQuestIDs) != len(storyQuestOrder) || after.Story.Nodes["b1-atlas"] != "complete" {
				t.Fatalf("story did not reach the finale: %+v", after.CompletedQuestIDs)
			}
			if after.Intake.ActiveSeconds != 0 || after.Intake.CreditSeconds != before.Intake.CreditSeconds || len(after.Intake.WordIDs) != len(before.Intake.WordIDs) {
				t.Fatalf("story access changed optional vocabulary pacing: before %+v, after %+v", before.Intake, after.Intake)
			}
		})
	}
}

func TestWordDrillsAndRoutesWaitForRestoredWords(t *testing.T) {
	app, _ := pacedStoryTestApp(t)
	token, _ := createSession(t, app, "Ada")
	first := beat(t, app, token, "sync", 0)
	s := app.curriculum.Syllabus
	locked := s.WordIDs[len(first.Introduced)+5]
	exercise, exists := app.curriculum.Exercises["lex-"+locked+"-recognition"]
	if !exists {
		t.Fatalf("no drill for %s", locked)
	}
	drill := AttemptInput{ID: "early-drill", ItemID: exercise.ItemID, ExerciseID: exercise.ID, Answer: exercise.Answer, Mode: "recognition"}
	if r := request(app, "POST", "/api/attempt", token, drill); r.Code != 409 || !strings.Contains(r.Body.String(), "not been restored") {
		t.Fatalf("locked drill: %d %s", r.Code, r.Body.String())
	}
	open := app.curriculum.Exercises["lex-"+first.Introduced[0]+"-recognition"]
	if r := request(app, "POST", "/api/attempt", token, AttemptInput{ID: "open-drill", ItemID: open.ItemID, ExerciseID: open.ID, Answer: open.Answer, Mode: "recognition"}); r.Code != 200 {
		t.Fatalf("restored word drill: %d %s", r.Code, r.Body.String())
	}
	restoreVocabulary(t, app, token, locked)
	drill.ID = "later-drill"
	if r := request(app, "POST", "/api/attempt", token, drill); r.Code != 200 {
		t.Fatalf("drill after restoring the word: %d %s", r.Code, r.Body.String())
	}
	unit := app.curriculum.Units["course-a1-food-1"]
	if r := request(app, "POST", "/api/course/complete", token, map[string]string{"unitId": unit.ID}); r.Code != 409 || !strings.Contains(r.Body.String(), "route opens after") {
		t.Fatalf("locked route: %d %s", r.Code, r.Body.String())
	}
}

func TestExistingAdventuresKeepTheirConversationsAfterMigration(t *testing.T) {
	app, _ := pacedStoryTestApp(t)
	token, _ := createSession(t, app, "Ada")
	s := app.curriculum.Syllabus
	_, _, _, err := app.store.Mutate(context.Background(), tokenHash(token), "legacy-seed", json.RawMessage(`{}`), func(a *Account) (Receipt, error) {
		a.Progress.Intake = Intake{}
		a.Progress.CompletedQuestIDs = []string{"a1-arrival"}
		a.Progress.Story.Nodes["a1-cafe"] = "gate"
		a.Progress.Words["lampe-noun"] = WordMemory{WordID: "lampe-noun", DirectAttempts: 2}
		a.Progress.Words[s.WordIDs[len(s.WordIDs)-1]] = WordMemory{WordID: s.WordIDs[len(s.WordIDs)-1], Exposures: 4}
		return Receipt{}, nil
	})
	if err != nil {
		t.Fatal(err)
	}
	p := storyProgress(t, app, token)
	if p.Intake.Version != intakeVersion {
		t.Fatalf("migration did not run: %+v", p.Intake)
	}
	introduced := introducedSet(&p)
	for _, questID := range []string{"a1-arrival", "a1-cafe"} {
		for _, id := range s.QuestWordIDs(questID) {
			if !introduced[id] {
				t.Fatalf("%s lost the word %s", questID, id)
			}
		}
	}
	if !introduced["lampe-noun"] || introduced[s.WordIDs[len(s.WordIDs)-1]] {
		t.Fatal("practised words migrate; exposure alone does not")
	}
	for index := 1; index < len(p.Intake.WordIDs); index++ {
		if s.position[p.Intake.WordIDs[index-1]] >= s.position[p.Intake.WordIDs[index]] {
			t.Fatal("migrated words must keep syllabus order")
		}
	}
	status := intakeStatus(&p, s, app.now())
	if status.Pending != 0 || p.Intake.CreditSeconds != len(p.Intake.WordIDs)*s.SecondsPerWord() {
		t.Fatalf("migration must not dump a backlog of new words: %+v %+v", status, p.Intake)
	}
	rule, _ := storyRule("a1-cafe")
	if err := app.requireQuestAccess(rule.QuestID, &p); err != nil {
		t.Fatalf("the conversation in progress stayed locked: %v", err)
	}
	if err := app.requireQuestAccess("a1-market", &p); err == nil {
		t.Fatal("a later conversation opened before the current discovery was complete")
	}
}

func TestSyllabusManifestMatchesTheLexiconAndStory(t *testing.T) {
	curriculum, err := loadCurriculum()
	if err != nil {
		t.Fatal(err)
	}
	s := curriculum.Syllabus
	if s == nil || len(s.WordIDs) != len(curriculum.Lexicon) {
		t.Fatalf("the syllabus must schedule every lexeme once: %d of %d", len(s.WordIDs), len(curriculum.Lexicon))
	}
	previous := 0
	for _, questID := range storyQuestOrder {
		quest := s.questWords[questID]
		if len(quest) == 0 {
			t.Fatalf("%s has no vocabulary entry", questID)
		}
		milestone := 0
		for _, id := range quest {
			milestone = max(milestone, s.position[id]+1)
		}
		if milestone < previous {
			t.Fatalf("%s unlocks before an earlier conversation", questID)
		}
		previous = milestone
	}
	if _, err := parseSyllabus([]byte(`{"wordsPerHour":10,"openingWords":10,"bankCap":15,"brake":{"maxUnsettled":12,"maxDue":20},"wordIds":["missing-word"],"quests":[]}`), curriculum.Lexicon); err == nil {
		t.Fatal("unknown lexemes must be rejected")
	}
}
