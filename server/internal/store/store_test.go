package store

import (
	"context"
	"errors"
	"glotworld/server/internal/world"
	"maps"
	"os"
	"path/filepath"
	"strconv"
	"sync"
	"testing"
	"time"
)

// testHooks are minimal domain hooks: containers only, a plain reset and no
// referral credit.
func testHooks() Hooks {
	return Hooks{
		NormalizeProgress: EnsureContainers,
		ResetGame:         func(a *Account) error { a.Progress = Progress{}; EnsureContainers(&a.Progress); return nil },
		CreditReferral:    func(*Account, *Account, string, time.Time) bool { return false },
	}
}

func TestLegacyWorldIdentityMigrationAndCorruption(t *testing.T) {
	path := filepath.Join(t.TempDir(), "state.json")
	legacy := `{"version":1,"accounts":{},"sessions":{},"actions":{}}`
	if err := os.WriteFile(path, []byte(legacy), 0600); err != nil {
		t.Fatal(err)
	}
	s, err := NewJSONStore(path, testHooks())
	if err != nil {
		t.Fatal(err)
	}
	if err := s.WorldIdentity().Validate(); err != nil {
		t.Fatal(err)
	}
	first := s.WorldIdentity()
	reopened, err := NewJSONStore(path, testHooks())
	if err != nil || reopened.WorldIdentity() != first {
		t.Fatal("migration did not persist exactly once", err)
	}
	s.state.World.Seed = "broken"
	if err := s.save(); err != nil {
		t.Fatal(err)
	}
	if _, err := NewJSONStore(path, testHooks()); err == nil {
		t.Fatal("corrupt world was silently replaced with a fresh timeline")
	}
}

func TestParseSessionIdle(t *testing.T) {
	for value, want := range map[string]time.Duration{"": DefaultSessionIdle, "0": 0, " 30 ": 30 * 24 * time.Hour} {
		if got, err := ParseSessionIdle(value); err != nil || got != want {
			t.Fatalf("%q: %v %v", value, got, err)
		}
	}
	for _, value := range []string{"-1", "ninety", "1.5", "99999999"} {
		if _, err := ParseSessionIdle(value); err == nil {
			t.Fatalf("%q should be rejected", value)
		}
	}
}

func newTestProgress() Progress {
	var p Progress
	EnsureContainers(&p)
	return p
}

func browserAnalyticsEvent() AnalyticsEvent {
	return AnalyticsEvent{ID: "event_identifier_12345", Name: "session_started", Visitor: "visitor_identifier_12345", Session: "session_identifier_12345", Source: "newsletter", Campaign: "launch", Device: "mobile"}
}

func TestAdminUsersManageAccountRollsBackAndSurvivesRestart(t *testing.T) {
	file := filepath.Join(t.TempDir(), "state.json")
	store, err := NewJSONStore(file, testHooks())
	if err != nil {
		t.Fatal(err)
	}
	account := Account{Player: world.Player{ID: "member", Name: "Juniper"}, Progress: newTestProgress()}
	if err = store.Create(context.Background(), "session", account); err != nil {
		t.Fatal(err)
	}
	_, _, err = store.ManageAccount(context.Background(), "member", false, "support", func(a *Account) error {
		a.Support.Grant.Lifetime = true
		a.Support.Audit = append(a.Support.Audit, AdminAuditEntry{At: time.Now(), ActorID: account.Player.ID, Action: "grant-access", Reason: "test grant"})
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	restarted, err := NewJSONStore(file, testHooks())
	if err != nil {
		t.Fatal(err)
	}
	saved, err := restarted.Get(context.Background(), "support")
	if err != nil || !saved.Support.Grant.Lifetime || len(saved.Support.Audit) != 1 {
		t.Fatal("support state lost")
	}
	store.SetPathForTest(filepath.Join(file, "impossible.json"))
	if _, _, err = store.ManageAccount(context.Background(), "member", true, "", func(a *Account) error { a.PasswordHash = "replacement"; return nil }); err == nil {
		t.Fatal("expected persistence failure")
	}
	saved, err = store.Get(context.Background(), "session")
	if err != nil || saved.PasswordHash != "" {
		t.Fatal("failed operation revoked or changed account")
	}
}

func TestBillingAccountUpdatesRollbackAndSerialize(t *testing.T) {
	store, err := NewJSONStore("", testHooks())
	if err != nil {
		t.Fatal(err)
	}
	account := Account{Player: world.Player{ID: "account"}, Email: "ada@example.com"}
	if err = store.Create(context.Background(), "hash", account); err != nil {
		t.Fatal(err)
	}
	if _, err = store.UpdateAccountByID(context.Background(), "missing", func(*Account) error { return nil }); !errors.Is(err, ErrUnauthorized) {
		t.Fatal("unknown account accepted")
	}
	failure := errors.New("reconcile failed")
	if _, err = store.UpdateAccountByID(context.Background(), "account", func(a *Account) error { a.Billing.Plan = "lifetime"; return failure }); !errors.Is(err, failure) {
		t.Fatal("failed update was committed")
	}
	stored, _ := store.GetAccountByID(context.Background(), "account")
	if stored.Billing.Plan != "" {
		t.Fatal("failed update changed entitlement")
	}
	var workers sync.WaitGroup
	for range 12 {
		workers.Add(1)
		go func() {
			defer workers.Done()
			_, err := store.UpdateAccountByID(context.Background(), "account", func(a *Account) error {
				a.Billing.WebhookReceipts = maps.Clone(a.Billing.WebhookReceipts)
				if a.Billing.WebhookReceipts == nil {
					a.Billing.WebhookReceipts = map[string]time.Time{}
				}
				a.Billing.WebhookReceipts[strconv.Itoa(len(a.Billing.WebhookReceipts))] = time.Now()
				return nil
			})
			if err != nil {
				t.Error(err)
			}
		}()
	}
	workers.Wait()
	stored, _ = store.GetAccountByID(context.Background(), "account")
	if len(stored.Billing.WebhookReceipts) != 12 {
		t.Fatal("concurrent billing writes lost updates")
	}
}

func TestAnalyticsJSONRestartRetentionAndAtomicSave(t *testing.T) {
	path := filepath.Join(t.TempDir(), "state.json")
	s, err := NewJSONStore(path, testHooks())
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC()
	old := browserAnalyticsEvent()
	old.At = now.AddDate(0, 0, -181)
	event := old
	event.ID = "new-event"
	event.At = now
	if err = s.RecordAnalytics(context.Background(), []AnalyticsEvent{old}, old.At); err != nil {
		t.Fatal(err)
	}
	if err = s.RecordAnalytics(context.Background(), []AnalyticsEvent{event, event}, now); err != nil {
		t.Fatal(err)
	}
	s, err = NewJSONStore(path, testHooks())
	if err != nil {
		t.Fatal(err)
	}
	facts, _, err := s.ReadAnalytics(context.Background(), now.AddDate(-1, 0, 0), now.Add(time.Hour))
	if err != nil || len(facts) != 1 || facts[0].ID != "new-event" {
		t.Fatalf("restart or retention: %+v %v", facts, err)
	}
	s.SetPathForTest(filepath.Join(path, "cannot-write.json"))
	next := event
	next.ID = "failed-event"
	if err = s.RecordAnalytics(context.Background(), []AnalyticsEvent{next}, now); err == nil {
		t.Fatal("expected failed save")
	}
	s.EditStateForTest(func(state *DiskState) {
		if len(state.Analytics) != 1 {
			t.Fatal("failed persistence leaked in-memory event")
		}
	})
}

func TestPostgresServersShareOneDurableWorldIdentity(t *testing.T) {
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("set TEST_DATABASE_URL to a disposable PostgreSQL database")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	var stores [3]*PGStore
	var failures [3]error
	var group sync.WaitGroup
	// Initialize schema once; concurrent identity INSERTs exercise the unique key.
	first, err := NewPGStore(ctx, url, testHooks())
	if err != nil {
		t.Fatal(err)
	}
	identity := first.WorldIdentity()
	first.Close()
	for index := range stores {
		group.Add(1)
		go func(index int) {
			defer group.Done()
			stores[index], failures[index] = NewPGStore(ctx, url, testHooks())
		}(index)
	}
	group.Wait()
	for index, store := range stores {
		if failures[index] != nil {
			t.Error(failures[index])
			continue
		}
		defer store.Close()
		if store.WorldIdentity() != identity {
			t.Error("servers disagree about world identity")
		}
	}
}

// analyticsDay is the UTC calendar day containing t.
func analyticsDay(t time.Time) time.Time {
	t = t.UTC()
	return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, time.UTC)
}
