package main

import (
	"context"
	"encoding/json"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/coder/websocket"
)

func trialTestClock(app *App) *atomic.Int64 {
	clock := &atomic.Int64{}
	clock.Store(time.Date(2026, 10, 14, 10, 0, 0, 0, time.UTC).UnixNano())
	app.now = func() time.Time { return time.Unix(0, clock.Load()).UTC() }
	return clock
}

func trialStatus(t *testing.T, app *App, token string, active *bool) AccessStatus {
	t.Helper()
	method, path := "GET", "/api/access"
	var body any
	if active != nil {
		method, path = "POST", "/api/access/heartbeat"
		body = map[string]bool{"active": *active}
	}
	w := request(app, method, path, token, body)
	if w.Code != 200 {
		t.Fatalf("access status: %d %s", w.Code, w.Body.String())
	}
	var response struct{ Access AccessStatus }
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	return response.Access
}

func playTrial(t *testing.T, app *App, token string, clock *atomic.Int64, duration time.Duration) AccessStatus {
	t.Helper()
	active := true
	status := trialStatus(t, app, token, &active)
	for duration > 0 {
		step := min(duration, 15*time.Second)
		clock.Add(int64(step))
		duration -= step
		status = trialStatus(t, app, token, &active)
	}
	return status
}

func TestTrialJourneyPreservesGuestTimeThroughSignupAndRequiresPayment(t *testing.T) {
	app := testApp(t)
	clock := trialTestClock(app)
	token, _ := createSession(t, app, "Ada")
	if status := trialStatus(t, app, token, nil); status.Phase != "guest" || status.RemainingSeconds != 300 || status.Registered {
		t.Fatalf("initial free access: %+v", status)
	}
	status := playTrial(t, app, token, clock, 5*time.Minute)
	if status.Phase != "login_required" || status.PlayedSeconds != 300 || status.RemainingSeconds != 0 {
		t.Fatalf("anonymous wall: %+v", status)
	}
	for _, route := range []struct{ method, path string }{{"GET", "/api/progress"}, {"POST", "/api/attempt"}, {"POST", "/api/intake/heartbeat"}} {
		response := request(app, route.method, route.path, token, map[string]any{})
		if response.Code != 403 || !strings.Contains(response.Body.String(), "login_required") {
			t.Fatalf("guest bypassed %s: %d %s", route.path, response.Code, response.Body.String())
		}
	}
	registered := request(app, "POST", "/api/account/register", token, credentialInput{Email: "trial@example.com", Password: "a long trial password"})
	if registered.Code != 200 {
		t.Fatalf("signup at wall: %d %s", registered.Code, registered.Body.String())
	}
	status = trialStatus(t, app, token, nil)
	if status.Phase != "trial" || status.RemainingSeconds != 600 || status.PlayedSeconds != 300 || !status.Registered {
		t.Fatalf("signup reset or shortened trial time: %+v", status)
	}
	status = playTrial(t, app, token, clock, 10*time.Minute)
	if status.Phase != "payment_required" || status.PlayedSeconds != 900 {
		t.Fatalf("subscription wall: %+v", status)
	}
	if w := request(app, "POST", "/api/attempt", token, attemptFor("blocked")); w.Code != 402 || !strings.Contains(w.Body.String(), "payment_required") {
		t.Fatalf("payment wall bypass: %d %s", w.Code, w.Body.String())
	}
	if w := request(app, "POST", "/api/access/reset", token, nil); w.Code != 200 {
		t.Fatalf("registered trial could not restart: %d %s", w.Code, w.Body.String())
	}
}

func TestRegisteredGameCanRestartRepeatedlyWithFifteenMinutes(t *testing.T) {
	app := testApp(t)
	clock := trialTestClock(app)
	token, player := createSession(t, app, "Restart Ada")
	credentials := credentialInput{Email: "restart@example.com", Password: "a long restart password"}
	if w := request(app, "POST", "/api/account/register", token, credentials); w.Code != 200 {
		t.Fatalf("register: %d %s", w.Code, w.Body.String())
	}
	secondToken, _ := randomID(32)
	if err := app.store.AddSession(context.Background(), tokenHash(secondToken), player.ID); err != nil {
		t.Fatal(err)
	}
	for generation := int64(1); generation <= 3; generation++ {
		// These simulated fifteen-minute sessions run within one real rate window.
		app.rateMu.Lock()
		delete(app.limits, "access:"+tokenHash(token))
		app.rateMu.Unlock()
		decodeAttempt(t, request(app, "POST", "/api/attempt", token, attemptFor("repeat-registered-reset")))
		if status := playTrial(t, app, token, clock, trialPlayLimit); status.Phase != "payment_required" {
			t.Fatalf("round %d did not expire: %+v", generation, status)
		}
		w := request(app, "POST", "/api/access/reset", token, nil)
		var response struct {
			Token    string
			Player   Player
			Access   AccessStatus
			Progress Progress
		}
		if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &response) != nil {
			t.Fatalf("round %d reset: %d %s", generation, w.Code, w.Body.String())
		}
		if response.Token != token || response.Player.ID != player.ID || response.Access.Phase != "trial" || !response.Access.Registered || response.Access.RemainingSeconds != 900 || response.Access.PlayedSeconds != 0 || response.Progress.XP != 0 {
			t.Fatalf("round %d reset retained progress or changed identity: %+v", generation, response)
		}
		if status := trialStatus(t, app, secondToken, nil); status.Phase != "trial" || status.RemainingSeconds != 900 {
			t.Fatalf("second device did not receive restart: %+v", status)
		}
	}
	w := request(app, "POST", "/api/account/login", "", credentials)
	var login struct {
		Player Player
		Access AccessStatus
	}
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &login) != nil || login.Player.ID != player.ID || login.Access.RemainingSeconds != 900 {
		t.Fatalf("restart lost account credentials or allowance: %d %s", w.Code, w.Body.String())
	}
}

func TestGuestGameRestartsGrantFifteenMinutesRepeatedly(t *testing.T) {
	app := testApp(t)
	clock := trialTestClock(app)
	token, _ := createSession(t, app, "Guest Restart Ada")
	for _, duration := range []time.Duration{guestPlayLimit, trialPlayLimit, trialPlayLimit} {
		app.rateMu.Lock()
		delete(app.limits, "access:"+tokenHash(token))
		app.rateMu.Unlock()
		if status := playTrial(t, app, token, clock, duration); status.Phase != "login_required" {
			t.Fatalf("guest round did not expire: %+v", status)
		}
		if w := request(app, "POST", "/api/access/reset", token, nil); w.Code != 200 {
			t.Fatalf("guest restart: %d %s", w.Code, w.Body.String())
		}
		if status := trialStatus(t, app, token, nil); status.Phase != "guest" || status.RemainingSeconds != 900 || status.PlayedSeconds != 0 {
			t.Fatalf("guest restart did not grant fifteen minutes: %+v", status)
		}
	}
}

func TestGameResetPreservesPaidAccess(t *testing.T) {
	app := testApp(t)
	trialTestClock(app)
	app.billing = testCreem(nil)
	token, _ := createSession(t, app, "Paid Restart Ada")
	before, err := app.store.UpdateAccount(context.Background(), tokenHash(token), func(account *Account) error {
		account.Email, account.PasswordHash = "paid-restart@example.com", "preserved-password"
		account.Billing = BillingState{Plan: "lifetime", CustomerID: "customer", LifetimeOrderID: "order", VerifiedAt: app.now()}
		account.Progress.XP = 100
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	w := request(app, "POST", "/api/access/reset", token, nil)
	if w.Code != 200 {
		t.Fatalf("paid reset: %d %s", w.Code, w.Body.String())
	}
	after, err := app.store.Get(context.Background(), tokenHash(token))
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(before.Billing, after.Billing) || after.Email != before.Email || after.PasswordHash != before.PasswordHash || after.Progress.XP != 0 || !app.hasPaidAccess(after, app.now()) {
		t.Fatal("reset lost billing, credentials or retained progress")
	}
}

func TestEarlySignupGetsFifteenTotalMinutes(t *testing.T) {
	app := testApp(t)
	clock := trialTestClock(app)
	token, _ := createSession(t, app, "Early Ada")
	playTrial(t, app, token, clock, 2*time.Minute)
	if err := app.store.SetCredentials(context.Background(), tokenHash(token), "early@example.com", "encoded"); err != nil {
		t.Fatal(err)
	}
	if status := trialStatus(t, app, token, nil); status.PlayedSeconds != 120 || status.RemainingSeconds != 780 || status.Phase != "trial" {
		t.Fatalf("early signup received extra/missing minutes: %+v", status)
	}
}

func TestSignupSettlesGuestLimitBeforeExpandingTrial(t *testing.T) {
	app := testApp(t)
	clock := trialTestClock(app)
	token, _ := createSession(t, app, "Delayed Signup Ada")
	playTrial(t, app, token, clock, 295*time.Second)
	clock.Add(int64(10 * time.Second))
	w := request(app, "POST", "/api/account/register", token, credentialInput{Email: "delayed@example.com", Password: "a long trial password"})
	if w.Code != 200 {
		t.Fatalf("delayed signup: %d %s", w.Code, w.Body.String())
	}
	if status := trialStatus(t, app, token, nil); status.PlayedSeconds != 300 || status.RemainingSeconds != 600 {
		t.Fatalf("waiting at login wall consumed the registered allowance: %+v", status)
	}
}

func TestTrialUsesServerTimePausesAndCannotBeExtendedByOtherSessions(t *testing.T) {
	app := testApp(t)
	clock := trialTestClock(app)
	token, player := createSession(t, app, "Clock Ada")
	clock.Add(int64(time.Hour))
	if status := trialStatus(t, app, token, nil); status.PlayedSeconds != 0 {
		t.Fatal("viewing a character or access status started the play clock")
	}
	active, inactive := true, false
	trialStatus(t, app, token, &active)
	clock.Add(int64(12*time.Second + 500*time.Millisecond))
	status := trialStatus(t, app, token, &inactive)
	if status.PlayedSeconds != 12 || status.RemainingSeconds != 288 {
		t.Fatalf("clock ignored server elapsed time: %+v", status)
	}
	clock.Add(int64(time.Hour))
	if status := trialStatus(t, app, token, nil); status.PlayedSeconds != 12 || status.RemainingSeconds != 288 {
		t.Fatalf("paused play consumed trial time: %+v", status)
	}
	second, _ := randomID(32)
	if err := app.store.AddSession(context.Background(), tokenHash(second), player.ID); err != nil {
		t.Fatal(err)
	}
	trialStatus(t, app, token, &active)
	clock.Add(int64(15 * time.Second))
	var workers sync.WaitGroup
	for i := range 12 {
		workers.Go(func() {
			current := token
			if i%2 == 0 {
				current = second
			}
			trialStatus(t, app, current, &active)
		})
	}
	workers.Wait()
	if status := trialStatus(t, app, second, nil); status.PlayedSeconds != 27 || status.RemainingSeconds != 273 {
		t.Fatalf("multiple tabs duplicated/reset trial time: %+v", status)
	}
	// A forged client 'seconds' property has no effect on the server clock.
	w := request(app, "POST", "/api/access/heartbeat", token, map[string]any{"active": true, "seconds": -90000, "playedSeconds": 0})
	if w.Code != 200 || trialStatus(t, app, token, nil).PlayedSeconds != 27 {
		t.Fatal("client input controlled elapsed play")
	}
	clock.Add(int64(2 * time.Hour))
	if status := trialStatus(t, app, token, nil); status.PlayedSeconds != 57 {
		t.Fatalf("offline time ran beyond the server lease: %+v", status)
	}
}

func TestGuestResetClearsAllProgressAndReceiptsButPreservesCharacter(t *testing.T) {
	app := testApp(t)
	trialTestClock(app)
	token, player := createSession(t, app, "Reset Ada")
	decodeAttempt(t, request(app, "POST", "/api/attempt", token, attemptFor("repeat-after-reset")))
	before, err := app.store.UpdateAccount(context.Background(), tokenHash(token), func(account *Account) error {
		account.Preferences.BaseLanguage = "tr"
		account.Progress.CompletedQuestIDs = []string{"old-quest"}
		account.Progress.CompletedUnitIDs = []string{"old-course"}
		account.Progress.Intake.ActiveSeconds = 999
		account.StorySaves = map[string]StorySave{"slot": {}}
		account.RewardedQuestIDs = []string{"old-quest"}
		account.RewardedExpeditionIDs = []string{"old-day"}
		account.Player.MapID, account.Player.InteriorID = "waldruh", "inn"
		account.Player.X, account.Player.Y = .9, .9
		account.Access.PlayedNanoseconds = int64(guestPlayLimit)
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	app.world.mu.Lock()
	app.world.memories[player.ID] = &worldMemory{mapID: "waldruh", interiorID: "inn", positions: map[string]MapSpawn{"waldruh": {.9, .9}}}
	app.world.mu.Unlock()
	w := request(app, "POST", "/api/access/reset", token, nil)
	if w.Code != 200 {
		t.Fatalf("guest reset: %d %s", w.Code, w.Body.String())
	}
	var response struct {
		Token  string
		Player Player
		Access AccessStatus
	}
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	after, err := app.store.Get(context.Background(), tokenHash(token))
	if err != nil {
		t.Fatal(err)
	}
	if response.Token != token || after.Player.ID != player.ID || after.Player.Name != player.Name || !reflect.DeepEqual(after.Player.Avatar, player.Avatar) || after.Preferences != before.Preferences {
		t.Fatal("reset changed character, preferences or session")
	}
	if after.Progress.XP != 0 || after.Progress.Attempts != 0 || len(after.Progress.Items) != 0 || len(after.Progress.CompletedQuestIDs) != 0 || len(after.Progress.CompletedUnitIDs) != 0 || after.Progress.Intake.ActiveSeconds != 0 || len(after.StorySaves) != 0 || len(after.RewardedQuestIDs) != 0 || len(after.RewardedExpeditionIDs) != 0 {
		t.Fatalf("reset retained learning or narrative progress: %+v", after)
	}
	if after.Player.MapID != DefaultMapID || after.Player.InteriorID != "" || response.Access.RemainingSeconds != 900 || response.Access.Phase != "guest" || app.world.memories[player.ID] != nil {
		t.Fatalf("reset retained location or clock: %+v", response)
	}
	again := decodeAttempt(t, request(app, "POST", "/api/attempt", token, attemptFor("repeat-after-reset")))
	if again.Duplicate || again.XPAdded == 0 {
		t.Fatal("restart retained old learning receipts")
	}
}

func TestPausingOneDeviceCannotPauseAnotherDevicesLease(t *testing.T) {
	app := testApp(t)
	clock := trialTestClock(app)
	token, player := createSession(t, app, "Two Devices Ada")
	secondToken, _ := randomID(32)
	if err := app.store.AddSession(context.Background(), tokenHash(secondToken), player.ID); err != nil {
		t.Fatal(err)
	}
	// Two application worlds emulate separate server instances sharing storage.
	secondApp := NewApp(app.store, testCurriculum(), nil, 10)
	t.Cleanup(secondApp.world.Close)
	secondApp.now = app.now
	active, inactive := true, false
	trialStatus(t, app, token, &active)
	trialStatus(t, secondApp, secondToken, &active)
	clock.Add(int64(10 * time.Second))
	trialStatus(t, app, token, &inactive)
	clock.Add(int64(10 * time.Second))
	if status := trialStatus(t, secondApp, secondToken, nil); status.PlayedSeconds != 20 || status.RemainingSeconds != 280 {
		t.Fatalf("one device paused another device's play: %+v", status)
	}
	trialStatus(t, secondApp, secondToken, &inactive)
	clock.Add(int64(time.Hour))
	if status := trialStatus(t, app, token, nil); status.PlayedSeconds != 20 {
		t.Fatalf("both devices paused but clock continued: %+v", status)
	}
}

func TestSameTokenTabCannotPauseSocketOnAnotherServer(t *testing.T) {
	app := testApp(t)
	clock := trialTestClock(app)
	token, player := createSession(t, app, "Remote Socket Ada")
	secondApp := NewApp(app.store, testCurriculum(), nil, 10)
	t.Cleanup(secondApp.world.Close)
	secondApp.now = app.now
	secondApp.world.mu.Lock()
	secondApp.world.clients[player.ID] = &worldClient{player: player, sessionHash: tokenHash(token), send: make(chan []byte, 32), cancel: func() {}}
	secondApp.world.mu.Unlock()
	ctx := context.Background()
	if _, err := secondApp.touchAccess(ctx, tokenHash(token), nil); err != nil {
		t.Fatal(err)
	}
	inactive := false
	// The other tab uses the identical local-storage token, and falsely reports
	// inactivity more frequently than the remote socket renews its lease.
	for second := 1; second <= 20; second++ {
		clock.Add(int64(time.Second))
		trialStatus(t, app, token, &inactive)
		if second%5 == 0 {
			if _, err := secondApp.touchAccess(ctx, tokenHash(token), nil); err != nil {
				t.Fatal(err)
			}
		}
	}
	if status := trialStatus(t, app, token, nil); status.PlayedSeconds != 20 {
		t.Fatalf("same-token tab paused remote socket: %+v", status)
	}
	secondApp.world.mu.Lock()
	delete(secondApp.world.clients, player.ID)
	secondApp.world.mu.Unlock()
	if _, err := secondApp.touchAccess(ctx, tokenHash(token), &inactive); err != nil {
		t.Fatal(err)
	}
	clock.Add(int64(time.Hour))
	if status := trialStatus(t, app, token, nil); status.PlayedSeconds != 20 {
		t.Fatalf("socket disconnect did not release its own lease: %+v", status)
	}
}

type delayedTrialStore struct {
	Store
	beforeMutation func()
}

func (s delayedTrialStore) Mutate(ctx context.Context, hash, key string, input json.RawMessage, fn func(*Account) (Receipt, error)) (Account, Receipt, bool, error) {
	s.beforeMutation()
	return s.Store.Mutate(ctx, hash, key, input, fn)
}

func TestQueuedMutationCannotWriteAfterTrialExpires(t *testing.T) {
	app := testApp(t)
	clock := trialTestClock(app)
	token, _ := createSession(t, app, "Queued Ada")
	base := app.store
	if _, err := base.UpdateAccount(context.Background(), tokenHash(token), func(account *Account) error {
		account.Access.PlayedNanoseconds = int64(guestPlayLimit - time.Second)
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	app.store = delayedTrialStore{Store: base, beforeMutation: func() { clock.Add(int64(2 * time.Second)) }}
	w := request(app, "POST", "/api/attempt", token, attemptFor("queued-expired"))
	if w.Code != 403 || !strings.Contains(w.Body.String(), "login_required") {
		t.Fatalf("queued attempt bypassed wall: %d %s", w.Code, w.Body.String())
	}
	account, err := base.Get(context.Background(), tokenHash(token))
	if err != nil || account.Progress.Attempts != 0 || account.Progress.XP != 0 {
		t.Fatalf("expired queued attempt wrote progress: %+v %v", account.Progress, err)
	}
}

func TestBatchStopsAtTrialBoundaryWithoutWritingLaterRounds(t *testing.T) {
	app := testApp(t)
	clock := trialTestClock(app)
	token, _ := createSession(t, app, "Batch Ada")
	base := app.store
	if _, err := base.UpdateAccount(context.Background(), tokenHash(token), func(account *Account) error {
		account.Access.PlayedNanoseconds = int64(guestPlayLimit - time.Second)
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	calls := 0
	app.store = delayedTrialStore{Store: base, beforeMutation: func() {
		calls++
		if calls == 2 {
			clock.Add(int64(2 * time.Second))
		}
	}}
	w := request(app, "POST", "/api/attempt", token, []AttemptInput{attemptFor("batch-valid"), attemptFor("batch-expired")})
	if w.Code != 403 || !strings.Contains(w.Body.String(), "login_required") {
		t.Fatalf("batch bypassed wall: %d %s", w.Code, w.Body.String())
	}
	account, err := base.Get(context.Background(), tokenHash(token))
	if err != nil || account.Progress.Attempts != 1 || account.Progress.XP != 6 {
		t.Fatalf("expired batch entries wrote progress: %+v %v", account.Progress, err)
	}
}

func TestMutationThatRunsPastTrialBoundaryRollsBack(t *testing.T) {
	app := testApp(t)
	clock := trialTestClock(app)
	token, _ := createSession(t, app, "Slow Mutation Ada")
	if _, err := app.store.UpdateAccount(context.Background(), tokenHash(token), func(account *Account) error {
		account.Access.PlayedNanoseconds = int64(guestPlayLimit - time.Second)
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	active := true
	trialStatus(t, app, token, &active)
	_, _, _, err := app.mutate(context.Background(), tokenHash(token), "slow", json.RawMessage(`{}`), func(account *Account) (Receipt, error) {
		account.Progress.XP = 100
		clock.Add(int64(2 * time.Second))
		return Receipt{XPAdded: 100}, nil
	})
	if _, ok := err.(*AccessDeniedError); !ok {
		t.Fatalf("slow mutation bypassed wall: %v", err)
	}
	account, err := app.store.Get(context.Background(), tokenHash(token))
	if err != nil || account.Progress.XP != 0 {
		t.Fatal("mutation that expired before commit saved progress")
	}
}

func TestQueuedMutationCannotRecreateProgressAfterReset(t *testing.T) {
	app := testApp(t)
	trialTestClock(app)
	token, _ := createSession(t, app, "Reset Race Ada")
	base := app.store
	app.store = delayedTrialStore{Store: base, beforeMutation: func() {
		if _, err := base.ResetGame(context.Background(), tokenHash(token)); err != nil {
			t.Fatal(err)
		}
	}}
	w := request(app, "POST", "/api/attempt", token, attemptFor("queued-before-reset"))
	if w.Code != 409 || !strings.Contains(w.Body.String(), "progress was reset") {
		t.Fatalf("queued attempt survived reset: %d %s", w.Code, w.Body.String())
	}
	account, err := base.Get(context.Background(), tokenHash(token))
	if err != nil || account.Progress.Attempts != 0 || account.Progress.XP != 0 || account.Access.Generation != 1 {
		t.Fatal("pre-reset queued mutation recreated progress")
	}
}

func TestResetClosesSocketOnAnotherServerAndClearsReconnectionLocation(t *testing.T) {
	app := testApp(t)
	trialTestClock(app)
	token, player := createSession(t, app, "Remote Reset Ada")
	secondApp := NewApp(app.store, testCurriculum(), nil, 10)
	secondApp.now = app.now
	t.Cleanup(secondApp.world.Close)
	server := httptest.NewServer(secondApp.Handler())
	t.Cleanup(server.Close)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	url := "ws" + strings.TrimPrefix(server.URL, "http") + "/api/world?token=" + token
	conn, _, err := websocket.Dial(ctx, url, nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = conn.CloseNow() })
	if w := request(app, "POST", "/api/access/reset", token, nil); w.Code != 200 {
		t.Fatalf("reset on other server: %d %s", w.Code, w.Body.String())
	}
	if err := conn.Write(ctx, websocket.MessageText, []byte(`{"type":"chat","message":"stale session"}`)); err != nil {
		t.Fatal(err)
	}
	for {
		_, _, err = conn.Read(ctx)
		if err != nil {
			break
		}
	}
	if websocket.CloseStatus(err) != accessRequiredStatus {
		t.Fatalf("remote socket survived reset: %v", err)
	}
	secondApp.world.mu.Lock()
	if memory := secondApp.world.memories[player.ID]; memory != nil {
		memory.mapID, memory.interiorID = "waldruh", "inn"
	}
	secondApp.world.mu.Unlock()
	reconnected, _, err := websocket.Dial(ctx, url, nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = reconnected.CloseNow() })
	_, body, err := reconnected.Read(ctx)
	var welcome struct {
		MapID, InteriorID string
	}
	if err != nil || json.Unmarshal(body, &welcome) != nil || welcome.MapID != DefaultMapID || welcome.InteriorID != "" {
		t.Fatalf("reset reconnect restored an old location: %s %v", body, err)
	}
}

func TestIntakeHeartbeatStartsTrialWithoutTrustingClaimedSeconds(t *testing.T) {
	app := testApp(t)
	clock := trialTestClock(app)
	token, _ := createSession(t, app, "Intake Ada")
	w := request(app, "POST", "/api/intake/heartbeat", token, heartbeatInput{ID: "first-play", Seconds: 120})
	if w.Code != 200 {
		t.Fatalf("intake heartbeat: %d %s", w.Code, w.Body.String())
	}
	clock.Add(int64(15 * time.Second))
	if status := trialStatus(t, app, token, nil); status.PlayedSeconds != 15 || status.RemainingSeconds != 285 {
		t.Fatalf("intake bypassed/manipulated trial clock: %+v", status)
	}
}

func TestTrialClockSurvivesJSONRestartAndSessionResume(t *testing.T) {
	path := filepath.Join(t.TempDir(), "trial.json")
	store, err := NewJSONStore(path)
	if err != nil {
		t.Fatal(err)
	}
	app := NewApp(store, testCurriculum(), nil, 10)
	clock := trialTestClock(app)
	token, _ := createSession(t, app, "Saved Ada")
	playTrial(t, app, token, clock, 95*time.Second)
	app.Close()
	reopened, err := NewJSONStore(path)
	if err != nil {
		t.Fatal(err)
	}
	app = NewApp(reopened, testCurriculum(), nil, 10)
	t.Cleanup(app.Close)
	app.now = func() time.Time { return time.Unix(0, clock.Load()).UTC() }
	resume := request(app, "POST", "/api/session", token, map[string]any{})
	var response struct{ Access AccessStatus }
	if resume.Code != 200 || json.Unmarshal(resume.Body.Bytes(), &response) != nil || response.Access.PlayedSeconds != 95 || response.Access.RemainingSeconds != 205 {
		t.Fatalf("session resume reset trial: %d %s", resume.Code, resume.Body.String())
	}
	if status := playTrial(t, app, token, clock, 205*time.Second); status.Phase != "login_required" {
		t.Fatalf("restart extended trial: %+v", status)
	}
}

func TestWorldEnforcesTrialOnExistingSocketAndReconnect(t *testing.T) {
	app := testApp(t)
	clock := trialTestClock(app)
	token, _ := createSession(t, app, "World Ada")
	if _, err := app.store.UpdateAccount(context.Background(), tokenHash(token), func(account *Account) error {
		account.Access.PlayedNanoseconds = int64(guestPlayLimit - time.Second)
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(app.Handler())
	t.Cleanup(server.Close)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	url := "ws" + strings.TrimPrefix(server.URL, "http") + "/api/world?token=" + token
	conn, _, err := websocket.Dial(ctx, url, nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = conn.CloseNow() })
	// The world remains authoritative even if an active tab claims to be paused.
	inactive := false
	trialStatus(t, app, token, &inactive)
	clock.Add(int64(2 * time.Second))
	if err := conn.Write(ctx, websocket.MessageText, []byte(`{"type":"chat","message":"cannot bypass the wall"}`)); err != nil {
		t.Fatal(err)
	}
	for {
		_, _, err = conn.Read(ctx)
		if err != nil {
			break
		}
	}
	if websocket.CloseStatus(err) != accessRequiredStatus {
		t.Fatalf("existing socket bypassed guest wall: %v", err)
	}
	_, response, err := websocket.Dial(ctx, url, nil)
	if err == nil || response == nil || response.StatusCode != 403 {
		t.Fatalf("reconnect bypassed guest wall: response=%v error=%v", response, err)
	}
}

func TestPostgresTrialTimeAndGuestResetAreAtomic(t *testing.T) {
	databaseURL := os.Getenv("TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("set TEST_DATABASE_URL to a disposable PostgreSQL database")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	store, err := NewPGStore(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	app := NewApp(store, testCurriculum(), nil, 10)
	clock := trialTestClock(app)
	token, player := createSession(t, app, "PG Trial Ada")
	t.Cleanup(func() {
		cleanupCtx, done := context.WithTimeout(context.Background(), 5*time.Second)
		defer done()
		_, _ = store.pool.Exec(cleanupCtx, "DELETE FROM learning_events WHERE account_id=$1", player.ID)
		_, _ = store.pool.Exec(cleanupCtx, "DELETE FROM sessions WHERE account_id=$1", player.ID)
		_, _ = store.pool.Exec(cleanupCtx, "DELETE FROM accounts WHERE id=$1", player.ID)
		app.Close()
	})
	decodeAttempt(t, request(app, "POST", "/api/attempt", token, attemptFor("pg-reset-receipt")))
	clock.Add(int64(20 * time.Second))
	active := true
	var workers sync.WaitGroup
	for range 8 {
		workers.Go(func() {
			trialStatus(t, app, token, &active)
		})
	}
	workers.Wait()
	if status := trialStatus(t, app, token, nil); status.PlayedSeconds != 20 || status.RemainingSeconds != 280 {
		t.Fatalf("concurrent Postgres leases duplicated time: %+v", status)
	}
	if w := request(app, "POST", "/api/access/reset", token, nil); w.Code != 200 {
		t.Fatalf("Postgres reset: %d %s", w.Code, w.Body.String())
	}
	var receipts int
	if err := store.pool.QueryRow(ctx, "SELECT COUNT(*) FROM learning_events WHERE account_id=$1", player.ID).Scan(&receipts); err != nil || receipts != 0 {
		t.Fatalf("Postgres reset retained receipts: %d %v", receipts, err)
	}
	if status := trialStatus(t, app, token, nil); status.PlayedSeconds != 0 || status.RemainingSeconds != 900 {
		t.Fatalf("Postgres reset retained clock: %+v", status)
	}
	result := decodeAttempt(t, request(app, "POST", "/api/attempt", token, attemptFor("pg-reset-receipt")))
	if result.Duplicate || result.XPAdded == 0 {
		t.Fatal("Postgres reset retained idempotency key")
	}
	if err := store.SetCredentials(ctx, tokenHash(token), player.ID+"@example.invalid", "preserved-password"); err != nil {
		t.Fatal(err)
	}
	if w := request(app, "POST", "/api/access/reset", token, nil); w.Code != 200 {
		t.Fatalf("registered Postgres reset: %d %s", w.Code, w.Body.String())
	}
	if status := trialStatus(t, app, token, nil); status.Phase != "trial" || status.RemainingSeconds != 900 || status.PlayedSeconds != 0 {
		t.Fatalf("registered Postgres reset did not renew trial: %+v", status)
	}
	if err := store.pool.QueryRow(ctx, "SELECT COUNT(*) FROM learning_events WHERE account_id=$1", player.ID).Scan(&receipts); err != nil || receipts != 0 {
		t.Fatalf("registered Postgres reset retained receipts: %d %v", receipts, err)
	}
}
