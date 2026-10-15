package migrate_test

import (
	"context"
	"errors"
	"sync"
	"testing"
	"testing/fstest"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"glotworld/server/internal/migrate"
	"glotworld/server/internal/pgtest"
)

func TestLoadRequiresNamedContiguousVersions(t *testing.T) {
	good := fstest.MapFS{
		"0002_second.sql": {Data: []byte("SELECT 2;")},
		"0001_first.sql":  {Data: []byte("SELECT 1;")},
		"README.md":       {Data: []byte("ignored")},
	}
	migrations, err := migrate.Load(good, ".")
	if err != nil || len(migrations) != 2 || migrations[0].Name != "first" || migrations[1].Version != 2 {
		t.Fatalf("load: %+v %v", migrations, err)
	}
	for name, files := range map[string]fstest.MapFS{
		"gap":      {"0001_a.sql": {Data: []byte("")}, "0003_c.sql": {Data: []byte("")}},
		"bad name": {"1_a.sql": {Data: []byte("")}},
		"empty":    {},
	} {
		if _, err := migrate.Load(files, "."); err == nil {
			t.Fatalf("%s: expected an error", name)
		}
	}
	if migrate.Checksum([]byte("a\r\nb\n")) != migrate.Checksum([]byte("a\nb\n")) {
		t.Fatal("line endings must not change a checksum")
	}
}

func testMigrations() []migrate.Migration {
	sql := []string{
		"CREATE TABLE widgets(id INTEGER PRIMARY KEY);",
		"ALTER TABLE widgets ADD COLUMN name TEXT; INSERT INTO widgets VALUES (1,'first');",
		"CREATE INDEX widgets_name ON widgets(name);",
	}
	var out []migrate.Migration
	for i, body := range sql {
		out = append(out, migrate.Migration{Version: i + 1, Name: "step", SQL: body, Checksum: migrate.Checksum([]byte(body))})
	}
	return out
}

func TestApplyOnceAndConcurrently(t *testing.T) {
	_, url := pgtest.Pool(t, "migrate_concurrent")
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	// Separate pools stand in for replicas booting at the same moment. Without
	// the lock, the non-idempotent DDL above would fail in all but one runner.
	const runners = 6
	var group sync.WaitGroup
	results := make([]migrate.Result, runners)
	failures := make([]error, runners)
	for i := range runners {
		group.Add(1)
		go func() {
			defer group.Done()
			pool, err := pgxpool.New(ctx, url)
			if err != nil {
				failures[i] = err
				return
			}
			defer pool.Close()
			results[i], failures[i] = migrate.Apply(ctx, pool, testMigrations())
		}()
	}
	group.Wait()
	applied := map[int]int{}
	for i := range runners {
		if failures[i] != nil {
			t.Fatalf("runner %d: %v", i, failures[i])
		}
		for _, version := range results[i].Applied {
			applied[version]++
		}
	}
	if len(applied) != 3 || applied[1] != 1 || applied[2] != 1 || applied[3] != 1 {
		t.Fatalf("each migration must be applied exactly once: %v", applied)
	}
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	var rows, recorded int
	if err = pool.QueryRow(ctx, `SELECT count(*) FROM widgets`).Scan(&rows); err != nil || rows != 1 {
		t.Fatalf("data migration ran %d times: %v", rows, err)
	}
	if err = pool.QueryRow(ctx, `SELECT count(*) FROM schema_migrations`).Scan(&recorded); err != nil || recorded != 3 {
		t.Fatalf("recorded %d migrations: %v", recorded, err)
	}
	again, err := migrate.Apply(ctx, pool, testMigrations())
	if err != nil || len(again.Applied) != 0 {
		t.Fatalf("a second run must be a no-op: %+v %v", again, err)
	}
	// A binary that knows fewer migrations (a rollback deploy) still starts.
	older, err := migrate.Apply(ctx, pool, testMigrations()[:2])
	if err != nil || len(older.Ahead) != 1 || older.Ahead[0] != 3 {
		t.Fatalf("older binary: %+v %v", older, err)
	}
}

func TestChangedAppliedMigrationStopsStartup(t *testing.T) {
	pool, _ := pgtest.Pool(t, "migrate_checksum")
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	if _, err := migrate.Apply(ctx, pool, testMigrations()); err != nil {
		t.Fatal(err)
	}
	edited := testMigrations()
	edited[1].SQL += " -- edited"
	edited[1].Checksum = migrate.Checksum([]byte(edited[1].SQL))
	var mismatch *migrate.ChecksumError
	if _, err := migrate.Apply(ctx, pool, edited); !errors.As(err, &mismatch) || mismatch.Version != 2 {
		t.Fatalf("an edited applied migration must fail: %v", err)
	}
	// Tampering with the recorded checksum is caught the same way.
	if _, err := pool.Exec(ctx, `UPDATE schema_migrations SET checksum='tampered' WHERE version=3`); err != nil {
		t.Fatal(err)
	}
	if _, err := migrate.Apply(ctx, pool, testMigrations()); !errors.As(err, &mismatch) || mismatch.Version != 3 {
		t.Fatalf("a tampered checksum must fail: %v", err)
	}
	// A pending migration racing a mismatch is not applied either.
	if _, err := pool.Exec(ctx, `DELETE FROM schema_migrations WHERE version=3; UPDATE schema_migrations SET checksum='tampered' WHERE version=1`); err != nil {
		t.Fatal(err)
	}
	if _, err := migrate.Apply(ctx, pool, testMigrations()); !errors.As(err, &mismatch) || mismatch.Version != 1 {
		t.Fatalf("mismatch must be reported before applying pending migrations: %v", err)
	}
	var pending int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM schema_migrations WHERE version=3`).Scan(&pending); err != nil || pending != 0 {
		t.Fatalf("pending migration applied despite a mismatch: %d %v", pending, err)
	}
}
