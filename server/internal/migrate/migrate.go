// Package migrate applies versioned SQL migrations to PostgreSQL.
//
// Migrations are files named NNNN_name.sql, applied once each in version
// order. Each runs in its own transaction together with its schema_migrations
// row, under a transaction-scoped advisory lock, so replicas booting at the
// same time apply every migration exactly once. A migration whose recorded
// checksum differs from the file is a startup error: applied migrations are
// immutable, and changes belong in a new migration.
package migrate

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io/fs"
	"path"
	"regexp"
	"sort"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// lockKey serializes migration runners across every process on the cluster.
const lockKey int64 = 5150931117

var fileName = regexp.MustCompile(`^(\d{4})_([a-z0-9_]+)\.sql$`)

type Migration struct {
	Version  int
	Name     string
	SQL      string
	Checksum string
}

// Result reports what a run did. Ahead lists versions recorded in the database
// that this binary does not know, for example after a rollback deploy.
type Result struct {
	Applied []int
	Ahead   []int
}

// ChecksumError reports an applied migration whose file has since changed.
type ChecksumError struct {
	Version          int
	Name             string
	Recorded, Actual string
}

func (e *ChecksumError) Error() string {
	return fmt.Sprintf("migration %04d_%s was changed after it was applied (recorded checksum %s, file %s); add a new migration instead of editing an applied one", e.Version, e.Name, short(e.Recorded), short(e.Actual))
}

func short(sum string) string {
	if len(sum) > 12 {
		return sum[:12]
	}
	return sum
}

// Checksum hashes migration SQL with line endings normalized, so a checkout
// that converts LF to CRLF does not look like an edited migration.
func Checksum(sql []byte) string {
	sum := sha256.Sum256(bytes.ReplaceAll(sql, []byte("\r\n"), []byte("\n")))
	return hex.EncodeToString(sum[:])
}

// Load reads NNNN_name.sql files from dir. Versions must start at 1 and be
// contiguous, so a missing or duplicated file is caught at build/test time.
func Load(fsys fs.FS, dir string) ([]Migration, error) {
	entries, err := fs.ReadDir(fsys, dir)
	if err != nil {
		return nil, err
	}
	var migrations []Migration
	for _, entry := range entries {
		if entry.IsDir() || path.Ext(entry.Name()) != ".sql" {
			continue
		}
		match := fileName.FindStringSubmatch(entry.Name())
		if match == nil {
			return nil, fmt.Errorf("migration file %q must be named NNNN_lower_snake_name.sql", entry.Name())
		}
		version, _ := strconv.Atoi(match[1])
		data, err := fs.ReadFile(fsys, path.Join(dir, entry.Name()))
		if err != nil {
			return nil, err
		}
		migrations = append(migrations, Migration{Version: version, Name: match[2], SQL: string(data), Checksum: Checksum(data)})
	}
	sort.Slice(migrations, func(i, j int) bool { return migrations[i].Version < migrations[j].Version })
	for i, m := range migrations {
		if m.Version != i+1 {
			return nil, fmt.Errorf("migration versions must be contiguous from 0001; found %04d_%s at position %d", m.Version, m.Name, i+1)
		}
	}
	if len(migrations) == 0 {
		return nil, errors.New("no migrations found")
	}
	return migrations, nil
}

type applied struct {
	name, checksum string
}

func readApplied(ctx context.Context, db interface {
	Query(context.Context, string, ...any) (pgx.Rows, error)
	QueryRow(context.Context, string, ...any) pgx.Row
}) (map[int]applied, error) {
	var exists bool
	if err := db.QueryRow(ctx, `SELECT to_regclass('schema_migrations') IS NOT NULL`).Scan(&exists); err != nil || !exists {
		return map[int]applied{}, err
	}
	rows, err := db.Query(ctx, `SELECT version,name,checksum FROM schema_migrations`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[int]applied{}
	for rows.Next() {
		var version int
		var row applied
		if err = rows.Scan(&version, &row.name, &row.checksum); err != nil {
			return nil, err
		}
		out[version] = row
	}
	return out, rows.Err()
}

// Apply brings the database up to date. When every migration is already
// recorded it only reads schema_migrations: no lock, no DDL.
func Apply(ctx context.Context, pool *pgxpool.Pool, migrations []Migration) (Result, error) {
	var result Result
	done, err := readApplied(ctx, pool)
	if err != nil {
		return result, err
	}
	known := map[int]bool{}
	pending := false
	for _, m := range migrations {
		known[m.Version] = true
		if row, ok := done[m.Version]; ok {
			if row.checksum != m.Checksum {
				return result, &ChecksumError{Version: m.Version, Name: m.Name, Recorded: row.checksum, Actual: m.Checksum}
			}
		} else {
			pending = true
		}
	}
	for version := range done {
		if !known[version] {
			result.Ahead = append(result.Ahead, version)
		}
	}
	sort.Ints(result.Ahead)
	if !pending {
		return result, nil
	}
	if err = bootstrap(ctx, pool); err != nil {
		return result, err
	}
	for _, m := range migrations {
		if _, ok := done[m.Version]; ok {
			continue
		}
		ran, err := applyOne(ctx, pool, m)
		if err != nil {
			return result, fmt.Errorf("migration %04d_%s: %w", m.Version, m.Name, err)
		}
		if ran {
			result.Applied = append(result.Applied, m.Version)
		}
	}
	return result, nil
}

func lock(ctx context.Context, tx pgx.Tx) error {
	_, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock($1)`, lockKey)
	return err
}

func bootstrap(ctx context.Context, pool *pgxpool.Pool) error {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if err = lock(ctx, tx); err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, `CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), checksum TEXT NOT NULL)`); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// applyOne runs one migration and records it atomically. Another runner may
// have applied it while this one waited for the lock; the recheck under the
// lock makes that a no-op (or a checksum error if the files differ).
func applyOne(ctx context.Context, pool *pgxpool.Pool, m Migration) (bool, error) {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return false, err
	}
	defer tx.Rollback(ctx)
	if err = lock(ctx, tx); err != nil {
		return false, err
	}
	var recorded string
	err = tx.QueryRow(ctx, `SELECT checksum FROM schema_migrations WHERE version=$1`, m.Version).Scan(&recorded)
	if err == nil {
		if recorded != m.Checksum {
			return false, &ChecksumError{Version: m.Version, Name: m.Name, Recorded: recorded, Actual: m.Checksum}
		}
		return false, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return false, err
	}
	// No arguments: pgx uses the simple protocol, so a file may hold several statements.
	if _, err = tx.Exec(ctx, m.SQL); err != nil {
		return false, err
	}
	if _, err = tx.Exec(ctx, `INSERT INTO schema_migrations(version,name,applied_at,checksum) VALUES($1,$2,$3,$4)`, m.Version, m.Name, time.Now().UTC(), m.Checksum); err != nil {
		return false, err
	}
	return true, tx.Commit(ctx)
}
