package main

import (
	"context"
	"encoding/json"
	"errors"
	"glotworld/server/internal/billing/billingtest"
	"net/http"
	"net/http/httptest"
	"os"
	"reflect"
	"strings"
	"testing"
	"time"
)

func browserAnalyticsEvent() AnalyticsEvent {
	return AnalyticsEvent{ID: "event_identifier_12345", Name: "session_started", Visitor: "visitor_identifier_12345", Session: "session_identifier_12345", Source: "newsletter", Campaign: "launch", Device: "mobile"}
}
func TestAnalyticsCollectionTrustBoundaryAndDeduplication(t *testing.T) {
	app := testApp(t)
	now := time.Date(2026, 10, 14, 12, 0, 0, 0, time.UTC)
	app.now = func() time.Time { return now }
	token, player := createSession(t, app, "Visitor")
	event := browserAnalyticsEvent()
	event.AccountID = "forged-account"
	event.At = now.AddDate(-1, 0, 0)
	event.Correct = 400
	for range 2 {
		w := request(app, "POST", "/api/analytics/events", token, map[string]any{"events": []AnalyticsEvent{event}})
		if w.Code != 204 {
			t.Fatalf("collect: %d %s", w.Code, w.Body.String())
		}
	}
	facts, _, err := app.store.ReadAnalytics(context.Background(), now.Add(-time.Hour), now.Add(time.Hour))
	if err != nil || len(facts) != 1 || facts[0].AccountID != player.ID || facts[0].Correct != 0 || !facts[0].At.Equal(now) {
		t.Fatalf("untrusted payload or retry affected facts: %+v %v", facts, err)
	}
	for _, mutate := range []func(*AnalyticsEvent){
		func(e *AnalyticsEvent) { e.Name = "learning_attempt" }, func(e *AnalyticsEvent) { e.Name = "payment_succeeded" },
		func(e *AnalyticsEvent) { e.Source = "name@example.com" }, func(e *AnalyticsEvent) { e.Campaign = "https://site/?token=secret" },
		func(e *AnalyticsEvent) { e.Detail = "private answer" }, func(e *AnalyticsEvent) { e.Visitor = "short" }, func(e *AnalyticsEvent) { e.Device = "custom-device" },
	} {
		bad := browserAnalyticsEvent()
		mutate(&bad)
		if w := request(app, "POST", "/api/analytics/events", token, map[string]any{"events": []AnalyticsEvent{bad}}); w.Code != 400 {
			t.Fatalf("accepted invalid event: %+v (%d)", bad, w.Code)
		}
	}
	// An invalid event rejects the entire batch.
	valid := browserAnalyticsEvent()
	valid.ID = "different_event_identifier"
	valid.Name = "page_view"
	valid.Detail = "game"
	bad := valid
	bad.Name = "made_up"
	if w := request(app, "POST", "/api/analytics/events", "", map[string]any{"events": []AnalyticsEvent{valid, bad}}); w.Code != 400 {
		t.Fatal(w.Code)
	}
	facts, _, _ = app.store.ReadAnalytics(context.Background(), now.Add(-time.Hour), now.Add(time.Hour))
	if len(facts) != 1 {
		t.Fatal("partially wrote rejected batch")
	}
	if w := request(app, "POST", "/api/analytics/events", "bad-token", map[string]any{"events": []AnalyticsEvent{valid}}); w.Code != 401 {
		t.Fatal("invalid auth silently became anonymous")
	}
}

func TestAnalyticsAdminOnlyAndTrialIndependent(t *testing.T) {
	app := testApp(t)
	token, _ := createSession(t, app, "Owner")
	app.adminEmails = map[string]bool{"admin@example.com": true}
	if got := request(app, "GET", "/api/admin/analytics", "", nil).Code; got != 401 {
		t.Fatal(got)
	}
	if got := request(app, "GET", "/api/admin/analytics", token, nil).Code; got != 403 {
		t.Fatal(got)
	}
	if err := app.store.SetCredentials(context.Background(), tokenHash(token), "admin@example.com", "stored-hash"); err != nil {
		t.Fatal(err)
	}
	_, err := app.store.UpdateAccount(context.Background(), tokenHash(token), func(a *Account) error { a.Access.PlayedNanoseconds = int64(trialPlayLimit); return nil })
	if err != nil {
		t.Fatal(err)
	}
	w := request(app, "GET", "/api/admin/analytics?days=7", token, nil)
	if w.Code != 200 {
		t.Fatalf("expired admin cannot read: %d %s", w.Code, w.Body.String())
	}
	var report AnalyticsReport
	if err = json.Unmarshal(w.Body.Bytes(), &report); err != nil {
		t.Fatal(err)
	}
	if report.Customers.Registered != 0 || report.Current.NewPlayers != 0 || len(report.Daily) != 7 {
		t.Fatalf("admin in metrics / wrong date range: %+v", report)
	}
	if got := request(app, "GET", "/api/admin/analytics?days=99999", token, nil).Code; got != 400 {
		t.Fatal(got)
	}
	app.adminEmails = nil
	if got := request(app, "GET", "/api/admin/analytics", token, nil).Code; got != 403 {
		t.Fatal("revoked admin still has access")
	}
}

func TestAnalyticsMilestonesAndAttemptReplays(t *testing.T) {
	app := testApp(t)
	now := time.Date(2026, 10, 1, 12, 0, 0, 0, time.UTC)
	app.now = func() time.Time { return now }
	token, _ := createSession(t, app, "Learner")
	preview := attemptFor("preview-only")
	preview.Preview = true
	if w := request(app, "POST", "/api/attempt", token, preview); w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	account, _ := app.store.Get(context.Background(), tokenHash(token))
	if !account.Analytics.ActivatedAt.IsZero() {
		t.Fatal("preview activated learner")
	}
	for range 2 {
		decodeAttempt(t, request(app, "POST", "/api/attempt", token, attemptFor("first-answer")))
	}
	account, _ = app.store.Get(context.Background(), tokenHash(token))
	if !account.Analytics.ActivatedAt.Equal(now) {
		t.Fatal("activation not saved with attempt")
	}
	first := account.Analytics.ActivatedAt
	now = now.Add(24 * time.Hour)
	decodeAttempt(t, request(app, "POST", "/api/attempt", token, attemptFor("first-answer")))
	facts, _, _ := app.store.ReadAnalytics(context.Background(), now.Add(-48*time.Hour), now.Add(time.Hour))
	if len(facts) != 1 || facts[0].Name != "learning_attempt" {
		t.Fatalf("replay or preview added event: %+v", facts)
	}
	if w := request(app, "POST", "/api/access/reset", token, map[string]any{}); w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	decodeAttempt(t, request(app, "POST", "/api/attempt", token, attemptFor("first-answer")))
	account, _ = app.store.Get(context.Background(), tokenHash(token))
	if !account.Analytics.ActivatedAt.Equal(first) {
		t.Fatal("reset lost first activation")
	}
	facts, _, _ = app.store.ReadAnalytics(context.Background(), now.Add(-48*time.Hour), now.Add(time.Hour))
	if len(facts) != 2 {
		t.Fatal("new reset generation collided with old action")
	}
}

func TestAnalyticsRegistrationTimestampIsStable(t *testing.T) {
	app := testApp(t)
	token, _ := createSession(t, app, "Saved Learner")
	now := time.Now().UTC()
	app.now = func() time.Time { return now }
	input := map[string]string{"email": "learner@example.com", "password": "long learner password"}
	for range 2 {
		if w := request(app, "POST", "/api/account/register", token, input); w.Code != 200 {
			t.Fatal(w.Body.String())
		}
		now = now.Add(time.Minute)
	}
	account, _ := app.store.Get(context.Background(), tokenHash(token))
	if !account.Analytics.RegisteredAt.Equal(now.Add(-2 * time.Minute)) {
		t.Fatal("retry moved registration milestone")
	}
}

func TestAnalyticsReportCohortsAttributionAndMatureRetention(t *testing.T) {
	app := testApp(t)
	now := time.Date(2026, 10, 14, 12, 0, 0, 0, time.UTC)
	app.adminEmails = map[string]bool{"admin@example.com": true}
	day := func(n int) time.Time { return analyticsDay(now).AddDate(0, 0, -n).Add(time.Hour) }
	accounts := []AnalyticsAccount{
		{ID: "a", CreatedAt: day(8), Milestones: AnalyticsMilestones{ActivatedAt: day(8).Add(time.Minute), RegisteredAt: day(8), PaidAt: day(7)}},
		{ID: "b", CreatedAt: day(1), Milestones: AnalyticsMilestones{ActivatedAt: day(1)}},
		{ID: "admin", Email: "admin@example.com", CreatedAt: day(8), Milestones: AnalyticsMilestones{ActivatedAt: day(8)}},
	}
	fact := func(name, account, visitor, session, source string, at time.Time, count int) AnalyticsFact {
		return AnalyticsFact{AnalyticsEvent: AnalyticsEvent{Name: name, AccountID: account, Visitor: visitor, Session: session, Source: source, Device: "desktop", At: at}, Last: at, Count: count}
	}
	facts := []AnalyticsFact{
		fact("session_started", "", "v1", "s1", "newsletter", day(8), 1), fact("game_started", "a", "v1", "s1", "", day(8), 1),
		fact("learning_attempt", "a", "", "", "", day(8).Add(time.Minute), 3), fact("learning_attempt", "a", "", "", "", day(7), 2), fact("learning_attempt", "a", "", "", "", day(1), 1),
		fact("checkout_started", "a", "", "", "", day(8).Add(2*time.Minute), 1),
		fact("learning_attempt", "b", "", "", "", day(1), 1), fact("learning_attempt", "b", "", "", "", day(0), 1),
		fact("session_started", "", "adminv", "admins", "internal", day(8), 1), fact("admin_session", "admin", "adminv", "admins", "", day(8), 1),
	}
	report := app.buildAnalytics(facts, accounts, 30, now)
	if report.Current.Visitors != 1 || report.Current.ActiveLearners != 2 || report.Current.Attempts != 8 || report.Current.NewPlayers != 2 || report.Current.NewCustomers != 1 {
		t.Fatalf("metrics: %+v", report.Current)
	}
	if report.Retention[0].Eligible != 1 || report.Retention[0].Returned != 1 || report.Retention[1].Eligible != 1 || report.Retention[1].Returned != 1 || report.Retention[2].Rate != nil {
		t.Fatalf("immature day counted / return mismatch: %+v", report.Retention)
	}
	if len(report.Funnel) != 4 || report.Funnel[0].Users != 2 || report.Funnel[3].Users != 1 {
		t.Fatalf("funnel: %+v", report.Funnel)
	}
	if len(report.Sources) != 2 || report.Sources[0].Label != "newsletter" || report.Sources[0].Customers != 1 {
		t.Fatalf("attribution: %+v", report.Sources)
	}
	if len(report.Daily) != 30 || report.Daily[29].Attempts != 1 || len(report.Cohorts) != 2 {
		t.Fatal("daily gaps or weekly cohorts wrong")
	}
	// A new checkout before learning must not satisfy the ordered funnel.
	facts[5].At = day(8).Add(-time.Minute)
	report = app.buildAnalytics(facts, accounts, 30, now)
	if report.Funnel[2].Users != 0 || report.Current.NewCustomers != 1 {
		t.Fatal("unordered funnel or customer total wrong")
	}
}

func TestAnalyticsEmptyReportHasArraysAndNullRates(t *testing.T) {
	report := testApp(t).buildAnalytics(nil, nil, 7, time.Now().UTC())
	data, _ := json.Marshal(report)
	for _, value := range []string{`"daily":[`, `"sources":[]`, `"events":[]`, `"recent":[]`, `"rate":null`} {
		if !strings.Contains(string(data), value) {
			t.Fatalf("missing %s: %s", value, data)
		}
	}
	if len(report.Daily) != 7 || report.Current.Visitors != 0 {
		t.Fatal("bad empty metrics")
	}
}

type failingAnalyticsStore struct{ Store }

func (s failingAnalyticsStore) RecordAnalytics(context.Context, []AnalyticsEvent, time.Time) error {
	return errors.New("analytics unavailable")
}
func TestAnalyticsFailureDoesNotBlockLearning(t *testing.T) {
	app := testApp(t)
	token, _ := createSession(t, app, "Resilient Learner")
	app.store = failingAnalyticsStore{app.store}
	decodeAttempt(t, request(app, "POST", "/api/attempt", token, attemptFor("analytics-outage")))
	account, _ := app.store.Get(context.Background(), tokenHash(token))
	if account.Analytics.ActivatedAt.IsZero() {
		t.Fatal("milestone lost with analytics outage")
	}
}

func TestAnalyticsOriginAndPayloadLimits(t *testing.T) {
	app := testApp(t)
	for _, test := range []struct {
		origin, body string
		status       int
	}{{"https://untrusted.example", `{"events":[]}`, 403}, {"", strings.Repeat(" ", 8193) + `{}`, 400}} {
		r := httptest.NewRequest("POST", "/api/analytics/events", strings.NewReader(test.body))
		r.Header.Set("Origin", test.origin)
		r.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		app.Handler().ServeHTTP(w, r)
		if w.Code != test.status {
			t.Fatalf("got %d expected %d", w.Code, test.status)
		}
	}
}

func TestAnalyticsCountsRealStoryCompletionsButNotSaveLoadsOrNoOps(t *testing.T) {
	app := testApp(t)
	token, _ := createSession(t, app, "Story Learner")
	ctx := context.Background()
	hash := tokenHash(token)
	apply := func(key, id string) {
		t.Helper()
		_, _, _, err := app.mutate(ctx, hash, key, json.RawMessage(`{}`), func(a *Account) (Receipt, error) {
			if !contains(a.Progress.CompletedQuestIDs, id) {
				a.Progress.CompletedQuestIDs = append(a.Progress.CompletedQuestIDs, id)
			}
			return Receipt{}, nil
		})
		if err != nil {
			t.Fatal(err)
		}
	}
	apply("story:first", "story-quest")
	apply("quest:already-complete", "story-quest")
	apply("story-load:slot", "loaded-quest")
	facts, _, err := app.store.ReadAnalytics(ctx, time.Now().Add(-time.Hour), time.Now().Add(time.Hour))
	if err != nil {
		t.Fatal(err)
	}
	if len(facts) != 1 || facts[0].Name != "quest_completed" {
		t.Fatalf("wrong completions: %+v", facts)
	}
}

func TestAnalyticsPaymentMilestoneRequiresVerifiedBillingAndSurvivesRefresh(t *testing.T) {
	app := testApp(t)
	now := time.Now().UTC()
	app.now = func() time.Time { return now }
	token, player := createSession(t, app, "Paid Learner")
	if err := app.store.SetCredentials(context.Background(), tokenHash(token), "paid@example.com", "hash"); err != nil {
		t.Fatal(err)
	}
	fixture := billingtest.NewFixture(player.ID, "monthly", now)
	app.billing = billingtest.NewClient(http.HandlerFunc(fixture.Serve))
	_, err := app.store.UpdateAccountByID(context.Background(), player.ID, func(a *Account) error { a.Billing = fixture.State(); return nil })
	if err != nil {
		t.Fatal(err)
	}
	for range 2 {
		account, err := app.refreshBilling(context.Background(), mustBillingAccount(t, app, player.ID), true)
		if err != nil {
			t.Fatal(err)
		}
		if !account.Analytics.PaidAt.Equal(fixture.Now) {
			t.Fatalf("payment timestamp moved or missing: %+v", account.Analytics)
		}
		now = now.Add(time.Minute)
	}
}

func TestAnalyticsPostgresMatchesJSONAndPersists(t *testing.T) {
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("set TEST_DATABASE_URL to a disposable PostgreSQL database")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	pg, err := NewPGStore(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	defer pg.Close()
	js, _ := NewJSONStore("")
	now := time.Date(2026, 10, 14, 12, 0, 0, 0, time.UTC)
	id, _ := randomID(16)
	account := Account{Player: Player{ID: id}, CreatedAt: now.Add(-time.Hour), Progress: newProgress(), Analytics: AnalyticsMilestones{ActivatedAt: now.Add(-30 * time.Minute)}}
	if err = pg.Create(ctx, id, account); err != nil {
		t.Fatal(err)
	}
	defer func() {
		pg.Pool().Exec(context.Background(), "DELETE FROM analytics_events WHERE account_id=$1", id)
		pg.Pool().Exec(context.Background(), "DELETE FROM sessions WHERE account_id=$1", id)
		pg.Pool().Exec(context.Background(), "DELETE FROM accounts WHERE id=$1", id)
	}()
	if err = js.Create(ctx, id, account); err != nil {
		t.Fatal(err)
	}
	events := []AnalyticsEvent{{ID: id + ":one", AccountID: id, Name: "learning_attempt", Correct: 1, At: now.Add(-20 * time.Minute)}, {ID: id + ":two", AccountID: id, Name: "learning_attempt", At: now.Add(-10 * time.Minute)}}
	for _, store := range []Store{pg, js} {
		if err = store.RecordAnalytics(ctx, events, now); err != nil {
			t.Fatal(err)
		}
		if err = store.RecordAnalytics(ctx, events, now); err != nil {
			t.Fatal(err)
		}
	}
	pFacts, pAccounts, err := pg.ReadAnalytics(ctx, analyticsDay(now), now)
	if err != nil {
		t.Fatal(err)
	}
	jFacts, jAccounts, err := js.ReadAnalytics(ctx, analyticsDay(now), now)
	if err != nil {
		t.Fatal(err)
	}
	filteredFacts := []AnalyticsFact{}
	filteredAccounts := []AnalyticsAccount{}
	for _, f := range pFacts {
		if f.AccountID == id {
			filteredFacts = append(filteredFacts, f)
		}
	}
	for _, a := range pAccounts {
		if a.ID == id {
			filteredAccounts = append(filteredAccounts, a)
		}
	}
	if len(filteredFacts) != 1 || filteredFacts[0].Count != 2 || filteredFacts[0].Correct != 1 {
		t.Fatalf("SQL rollup/dedupe: %+v", filteredFacts)
	}
	if !reflect.DeepEqual(analyticsMetrics(filteredFacts, filteredAccounts, analyticsDay(now), now), analyticsMetrics(jFacts, jAccounts, analyticsDay(now), now)) {
		t.Fatal("storage implementations disagree")
	}
	if len(filteredAccounts) != 1 || !filteredAccounts[0].Milestones.ActivatedAt.Equal(account.Analytics.ActivatedAt) {
		t.Fatal("SQL milestone projection wrong")
	}
}
