package store

import (
	"context"
	"encoding/json"
	"errors"
	"glotworld/server/internal/billing"
	"glotworld/server/internal/pgtest"
	"glotworld/server/internal/world"
	"reflect"
	"testing"
	"time"
)

func openTestPGStore(t *testing.T, prefix string) (*PGStore, string) {
	t.Helper()
	url := pgtest.SchemaURL(t, pgtest.URL(t), prefix)
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	s, err := NewPGStore(ctx, url, testHooks())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(s.Close)
	return s, url
}

// Email, creation time and purchases come back from their columns and rows
// exactly as written, and purchase lookups find the account by either Creem
// reference.
func TestPostgresAccountColumnsAndPurchaseRowsRoundTrip(t *testing.T) {
	s, url := openTestPGStore(t, "store_accounts")
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	created := time.Date(2026, 10, 16, 12, 0, 0, 123456000, time.UTC)
	for _, id := range []string{"ada", "bob"} {
		account := Account{Player: world.Player{ID: id, Name: "Player " + id}, CreatedAt: created}
		EnsureContainers(&account.Progress)
		if err := s.Create(ctx, "hash-"+id, account); err != nil {
			t.Fatal(err)
		}
	}
	purchases := []billing.Purchase{
		{CheckoutID: "ch-2", RequestID: "r2", ProductID: "p", CreatedAt: created.Add(time.Hour), Plan: "monthly"},
		{CheckoutID: "ch-1", RequestID: "r1", ProductID: "p", CreatedAt: created, CustomerID: "cus", SubscriptionID: "sub-1", OrderID: "ord", TransactionID: "tx-1", Plan: "monthly"},
	}
	updated, err := s.UpdateAccountByID(ctx, "ada", func(a *Account) error {
		a.Email = "ada@example.com"
		a.Billing.Purchases = purchases
		a.Billing.Plan = "monthly"
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}

	// A second store reads everything back from storage.
	restarted, err := NewPGStore(ctx, url, testHooks())
	if err != nil {
		t.Fatal(err)
	}
	defer restarted.Close()
	stored, err := restarted.GetAccountByID(ctx, "ada")
	if err != nil {
		t.Fatal(err)
	}
	if stored.Email != "ada@example.com" || !stored.CreatedAt.Equal(created) || !reflect.DeepEqual(stored.Billing.Purchases, purchases) {
		t.Fatalf("stored account %q %v %+v", stored.Email, stored.CreatedAt, stored.Billing.Purchases)
	}
	if !billing.SameLedger(stored.Billing, updated.Billing) {
		t.Fatal("a stored ledger must equal the ledger that was written, or reconciliation never settles")
	}
	if byEmail, err := restarted.GetByEmail(ctx, "ada@example.com"); err != nil || byEmail.Player.ID != "ada" {
		t.Fatalf("by email: %q %v", byEmail.Player.ID, err)
	}
	for _, refs := range [][2]string{{"sub-1", ""}, {"", "tx-1"}, {"sub-other", "tx-1"}} {
		if id, err := restarted.FindBillingAccount(ctx, refs[0], refs[1]); err != nil || id != "ada" {
			t.Fatalf("lookup %v: %q %v", refs, id, err)
		}
	}
	if _, err := restarted.FindBillingAccount(ctx, "", ""); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("empty references must miss: %v", err)
	}

	// One checkout belongs to one account; the refused write changes nothing.
	if _, err := restarted.UpdateAccountByID(ctx, "bob", func(a *Account) error {
		a.Player.Name = "Changed"
		a.Billing.Purchases = []billing.Purchase{{CheckoutID: "ch-1", CreatedAt: created}}
		return nil
	}); err == nil {
		t.Fatal("a checkout recorded on a second account must be refused")
	}
	if bob, _ := restarted.GetAccountByID(ctx, "bob"); bob.Player.Name != "Player bob" || bob.Billing.Purchases != nil {
		t.Fatalf("a refused write changed bob: %+v", bob)
	}
	// A failing update leaves the purchase rows alone.
	failure := errors.New("refused")
	if _, err := restarted.UpdateAccountByID(ctx, "ada", func(a *Account) error { a.Billing.Purchases = nil; return failure }); !errors.Is(err, failure) {
		t.Fatal(err)
	}
	if again, _ := restarted.GetAccountByID(ctx, "ada"); len(again.Billing.Purchases) != 2 {
		t.Fatalf("purchases after a failed update: %+v", again.Billing.Purchases)
	}

	// The admin directory searches and sorts by the columns.
	if _, err := restarted.UpdateAccountByID(ctx, "bob", func(a *Account) error { a.CreatedAt = created.Add(time.Minute); return nil }); err != nil {
		t.Fatal(err)
	}
	listed, total, err := restarted.ListAdminAccounts(ctx, "player", "", 0, 10)
	if err != nil || total != 2 || listed[0].Player.ID != "bob" || listed[1].Player.ID != "ada" || listed[1].Email != "ada@example.com" || !listed[1].CreatedAt.Equal(created) {
		t.Fatalf("directory %d %+v %v", total, listed, err)
	}
	if listed, total, _ = restarted.ListAdminAccounts(ctx, "player bob", "guest", 0, 10); total != 1 || listed[0].Player.Name != "Player bob" {
		t.Fatalf("search by name: %d %+v", total, listed)
	}
	if _, total, _ = restarted.ListAdminAccounts(ctx, "", "registered", 0, 10); total != 1 {
		t.Fatalf("registered accounts: %d", total)
	}
}

// World parts come back with the bytes that were saved, including key order,
// so content fingerprints computed before a restart still match after it.
func TestPostgresWorldPartsKeepTheirBytes(t *testing.T) {
	s, url := openTestPGStore(t, "store_world_bytes")
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	scene := json.RawMessage(`{"zeta":1,"alpha":{"y":[2,1],"b":"x"},"ground":{"tiles":[{"w":1,"a":2}]}}`)
	ops := json.RawMessage(`[{"op":"move","to":{"y":1,"x":2}}]`)
	if _, err := s.SaveWorld(ctx, 0, WorldChange{Shared: json.RawMessage(`{"version":2,"prefabs":{}}`), Maps: map[string]json.RawMessage{"town": scene},
		Publication: json.RawMessage(`{"contentVersion":"v","worldMaps":{"z":1,"a":2},"investigations":[],"diagnostics":[]}`), Actor: "test", Source: "test", Ops: ops}); err != nil {
		t.Fatal(err)
	}
	line := StoryLine{Key: "line", GraphID: "g", Edited: json.RawMessage(`{"graphId":"g","z":1,"a":2}`)}
	if err := s.SaveStoryLine(ctx, line); err != nil {
		t.Fatal(err)
	}
	restarted, err := NewPGStore(ctx, url, testHooks())
	if err != nil {
		t.Fatal(err)
	}
	defer restarted.Close()
	loaded, err := restarted.LoadWorld(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if string(loaded.Maps["town"]) != string(scene) || string(loaded.Shared) != `{"version":2,"prefabs":{}}` {
		t.Fatalf("town %s shared %s", loaded.Maps["town"], loaded.Shared)
	}
	lines, err := restarted.StoryLines(ctx)
	if err != nil || len(lines) != 1 || string(lines[0].Edited) != string(line.Edited) {
		t.Fatalf("story lines %+v %v", lines, err)
	}
	edits, err := restarted.WorldEdits(ctx, 0, 10)
	if err != nil || len(edits) != 1 || string(edits[0].Ops) != string(ops) {
		t.Fatalf("edits %+v %v", edits, err)
	}
}
