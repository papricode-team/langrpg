package main

import (
	"context"
	"errors"
	"glotworld/server/internal/billing"
	"os"
	"strings"
	"testing"
	"time"
)

func TestPostgresBillingLookupAndSessionIndexes(t *testing.T) {
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("set TEST_DATABASE_URL to a disposable PostgreSQL database")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	store, err := NewPGStore(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	app := NewApp(store, testCurriculum(), nil, 10)
	token, player := createSession(t, app, "Indexed Ada")
	t.Cleanup(func() {
		cleanup, done := context.WithTimeout(context.Background(), 5*time.Second)
		defer done()
		_, _ = store.Pool().Exec(cleanup, "DELETE FROM sessions WHERE account_id=$1", player.ID)
		_, _ = store.Pool().Exec(cleanup, "DELETE FROM accounts WHERE id=$1", player.ID)
		app.Close()
	})
	if _, err := store.UpdateAccount(ctx, tokenHash(token), func(account *Account) error {
		account.Billing.Purchases = []billing.Purchase{{CheckoutID: "c-" + player.ID, SubscriptionID: "sub-" + player.ID, TransactionID: "tx-" + player.ID}}
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	for _, refs := range [][2]string{{"sub-" + player.ID, ""}, {"", "tx-" + player.ID}, {"sub-" + player.ID, "tx-other"}, {"sub-other", "tx-" + player.ID}} {
		if id, err := store.FindBillingAccount(ctx, refs[0], refs[1]); err != nil || id != player.ID {
			t.Fatalf("lookup %v: %q %v", refs, id, err)
		}
	}
	for _, refs := range [][2]string{{"", ""}, {"sub-missing", "tx-missing"}} {
		if _, err := store.FindBillingAccount(ctx, refs[0], refs[1]); !errors.Is(err, ErrUnauthorized) {
			t.Fatalf("lookup %v should miss: %v", refs, err)
		}
	}

	// The planner can serve both lookups from indexes rather than scanning accounts.
	tx, err := store.Pool().Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx, "SET LOCAL enable_seqscan=off"); err != nil {
		t.Fatal(err)
	}
	for query, index := range map[string]string{
		`EXPLAIN SELECT account_id FROM billing_purchases WHERE subscription_id='sub-` + player.ID + `' AND subscription_id<>'' ORDER BY account_id LIMIT 1`: "billing_purchases_subscription",
		`EXPLAIN SELECT account_id FROM billing_purchases WHERE transaction_id='tx-` + player.ID + `' AND transaction_id<>'' ORDER BY account_id LIMIT 1`:    "billing_purchases_transaction",
		`EXPLAIN SELECT id FROM accounts WHERE email='indexed@example.com'`:                                                                                  "accounts_email_key",
		`EXPLAIN SELECT COUNT(*) FROM learning_events WHERE account_id='` + player.ID + `' AND activity_id='a' AND run_id='r' AND correct=false`:             "learning_events_corrections",
		`EXPLAIN SELECT token_hash FROM sessions WHERE account_id='` + player.ID + `'`:                                                                       "sessions_account_id",
	} {
		rows, err := tx.Query(ctx, query)
		if err != nil {
			t.Fatal(err)
		}
		var plan []string
		for rows.Next() {
			var line string
			if err = rows.Scan(&line); err != nil {
				t.Fatal(err)
			}
			plan = append(plan, line)
		}
		rows.Close()
		if !strings.Contains(strings.Join(plan, "\n"), index) {
			t.Fatalf("%s does not use %s:\n%s", query, index, strings.Join(plan, "\n"))
		}
	}
}
