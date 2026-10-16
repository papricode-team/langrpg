package migrations_test

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"glotworld/server/internal/migrate"
	"glotworld/server/internal/pgtest"
)

// applyThrough applies the migrations up to and including version.
func applyThrough(t *testing.T, ctx context.Context, pool *pgxpool.Pool, version int) {
	t.Helper()
	var list []migrate.Migration
	for _, m := range all(t) {
		if m.Version <= version {
			list = append(list, m)
		}
	}
	if _, err := migrate.Apply(ctx, pool, list); err != nil {
		t.Fatal(err)
	}
}

func exec(t *testing.T, ctx context.Context, pool *pgxpool.Pool, sql string, args ...any) {
	t.Helper()
	if _, err := pool.Exec(ctx, sql, args...); err != nil {
		t.Fatalf("%s: %v", sql, err)
	}
}

type purchaseRow struct {
	checkout, subscription, transaction string
	position                            int
	created                             time.Time
}

func purchaseRows(t *testing.T, ctx context.Context, pool *pgxpool.Pool, account string) []purchaseRow {
	t.Helper()
	rows, err := pool.Query(ctx, `SELECT checkout_id,subscription_id,transaction_id,position,created_at FROM billing_purchases WHERE account_id=$1 ORDER BY position`, account)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	var out []purchaseRow
	for rows.Next() {
		var p purchaseRow
		if err = rows.Scan(&p.checkout, &p.subscription, &p.transaction, &p.position, &p.created); err != nil {
			t.Fatal(err)
		}
		out = append(out, p)
	}
	return out
}

// Accounts and learning events saved before migrations 0008–0010 gain their
// columns and purchase rows, and a binary that writes only the documents keeps
// them in step afterwards.
func TestAccountAndEventColumnsBackfillAndFollowDocumentWrites(t *testing.T) {
	pool, _ := pgtest.Pool(t, "migrations_columns")
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	applyThrough(t, ctx, pool, 7)
	exec(t, ctx, pool, `INSERT INTO accounts(id,data) VALUES
 ('guest','{"player":{"id":"guest","name":"Gast"},"createdAt":"2026-01-02T03:04:05.123456789Z"}'),
 ('blank','{"player":{"id":"blank"},"email":"","createdAt":"2026-01-03T00:00:00Z"}'),
 ('paid','{"player":{"id":"paid","name":"Ada"},"email":"ada@example.com","createdAt":"2026-01-04T00:00:00Z","billing":{"plan":"monthly","purchases":[
   {"checkoutId":"ch-2","requestId":"r2","productId":"p","createdAt":"2026-02-01T00:00:00.5Z"},
   {"checkoutId":"ch-1","requestId":"r1","productId":"p","createdAt":"2026-01-05T00:00:00Z","subscriptionId":"sub-1","transactionId":"tx-1","plan":"monthly"}]}}')`)
	exec(t, ctx, pool, `INSERT INTO learning_events(account_id,event_key,request,receipt) VALUES
 ('paid','attempt:c:1','{"exerciseId":"e1","answer":"Haus","activityId":"act","runId":"run"}','{"correct":false,"xpAdded":0}'),
 ('paid','attempt:c:2','{"exerciseId":"e1","answer":"","preview":true}','{"xpAdded":0}')`)
	applyThrough(t, ctx, pool, 1<<30)

	type columns struct {
		email *string
		name  string
		at    time.Time
	}
	read := func(id string) columns {
		var c columns
		if err := pool.QueryRow(ctx, `SELECT email,player_name,created_at FROM accounts WHERE id=$1`, id).Scan(&c.email, &c.name, &c.at); err != nil {
			t.Fatal(err)
		}
		return c
	}
	if c := read("guest"); c.email != nil || c.name != "Gast" || !c.at.Equal(time.Date(2026, 1, 2, 3, 4, 5, 123457000, time.UTC)) {
		t.Fatalf("guest columns %+v", c)
	}
	if c := read("blank"); c.email != nil || c.name != "" {
		t.Fatalf("an empty email must be NULL: %+v", c)
	}
	if c := read("paid"); c.email == nil || *c.email != "ada@example.com" || c.name != "Ada" {
		t.Fatalf("paid columns %+v", c)
	}
	got := purchaseRows(t, ctx, pool, "paid")
	if len(got) != 2 || got[0].checkout != "ch-2" || got[0].position != 0 || got[1].checkout != "ch-1" || got[1].subscription != "sub-1" || got[1].transaction != "tx-1" ||
		!got[0].created.Equal(time.Date(2026, 2, 1, 0, 0, 0, 5e8, time.UTC)) {
		t.Fatalf("purchase rows keep the recorded order and fields: %+v", got)
	}

	var activity, run, exercise *string
	var answered bool
	var correct *bool
	if err := pool.QueryRow(ctx, `SELECT activity_id,run_id,exercise_id,answered,correct FROM learning_events WHERE event_key='attempt:c:1'`).Scan(&activity, &run, &exercise, &answered, &correct); err != nil {
		t.Fatal(err)
	}
	if *activity != "act" || *run != "run" || *exercise != "e1" || !answered || correct == nil || *correct {
		t.Fatalf("attempt columns %v %v %v %v %v", activity, run, exercise, answered, correct)
	}
	if err := pool.QueryRow(ctx, `SELECT answered,correct FROM learning_events WHERE event_key='attempt:c:2'`).Scan(&answered, &correct); err != nil || answered || correct != nil {
		t.Fatalf("a preview without a grade is neither answered nor graded: %v %v %v", answered, correct, err)
	}

	// A binary that writes only the document.
	exec(t, ctx, pool, `UPDATE accounts SET data = jsonb_set(jsonb_set(data,'{email}','"grace@example.com"'),'{player,name}','"Grace"') WHERE id='guest'`)
	if c := read("guest"); c.email == nil || *c.email != "grace@example.com" || c.name != "Grace" {
		t.Fatalf("columns did not follow the document: %+v", c)
	}
	exec(t, ctx, pool, `UPDATE accounts SET data = jsonb_set(data,'{billing,purchases}','[{"checkoutId":"ch-1","createdAt":"2026-01-05T00:00:00Z","subscriptionId":"sub-1"}]') WHERE id='paid'`)
	if got = purchaseRows(t, ctx, pool, "paid"); len(got) != 1 || got[0].checkout != "ch-1" || got[0].position != 0 {
		t.Fatalf("purchase rows did not follow the document: %+v", got)
	}
	exec(t, ctx, pool, `INSERT INTO accounts(id,data) VALUES('new','{"player":{"id":"new"},"createdAt":"2026-03-01T00:00:00Z","billing":{"purchases":[{"checkoutId":"ch-3","createdAt":"2026-03-01T00:00:00Z"}]}}')`)
	if got = purchaseRows(t, ctx, pool, "new"); len(got) != 1 || got[0].checkout != "ch-3" {
		t.Fatalf("an inserted account's purchases: %+v", got)
	}
	// One checkout cannot belong to two accounts.
	if _, err := pool.Exec(ctx, `UPDATE accounts SET data = jsonb_set(data,'{billing}','{"purchases":[{"checkoutId":"ch-3","createdAt":"2026-03-01T00:00:00Z"}]}') WHERE id='blank'`); err == nil || !strings.Contains(err.Error(), "billing_purchases_pkey") {
		t.Fatalf("a checkout recorded on a second account must fail: %v", err)
	}
	// A duplicate email is still refused by the email index.
	if _, err := pool.Exec(ctx, `UPDATE accounts SET data = jsonb_set(data,'{email}','"ada@example.com"') WHERE id='blank'`); err == nil {
		t.Fatal("a duplicate email must be refused")
	}
}

// A checkout recorded on two accounts stops the purchase migration rather than
// dropping one of the purchases.
func TestDuplicateCheckoutStopsThePurchaseMigration(t *testing.T) {
	pool, _ := pgtest.Pool(t, "migrations_duplicate_checkout")
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	applyThrough(t, ctx, pool, 8)
	exec(t, ctx, pool, `INSERT INTO accounts(id,data) VALUES
 ('a','{"player":{"id":"a"},"createdAt":"2026-01-01T00:00:00Z","billing":{"purchases":[{"checkoutId":"same","createdAt":"2026-01-01T00:00:00Z"}]}}'),
 ('b','{"player":{"id":"b"},"createdAt":"2026-01-01T00:00:00Z","billing":{"purchases":[{"checkoutId":"same","createdAt":"2026-01-01T00:00:00Z"}]}}')`)
	if _, err := migrate.Apply(ctx, pool, all(t)); err == nil {
		t.Fatal("the duplicate checkout was accepted")
	}
	var applied int
	if err := pool.QueryRow(ctx, `SELECT max(version) FROM schema_migrations`).Scan(&applied); err != nil || applied != 8 {
		t.Fatalf("migration 0009 must roll back entirely: %d %v", applied, err)
	}
}

// World and content parts keep the exact bytes written to them.
func TestOpaqueBlobsKeepTheirBytes(t *testing.T) {
	pool, _ := pgtest.Pool(t, "migrations_json")
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	applyThrough(t, ctx, pool, 1<<30)
	scene := `{"z": 1, "a": {"y": [2, 1], "b": 3}}`
	exec(t, ctx, pool, `INSERT INTO world_maps(id,scene,revision) VALUES('town',$1,1)`, []byte(scene))
	var stored []byte
	if err := pool.QueryRow(ctx, `SELECT scene FROM world_maps WHERE id='town'`).Scan(&stored); err != nil || string(stored) != scene {
		t.Fatalf("stored %q, %v", stored, err)
	}
}
