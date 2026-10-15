// Package pgtest gives Postgres integration tests an isolated schema in the
// disposable database named by TEST_DATABASE_URL.
package pgtest

import (
	"context"
	"fmt"
	neturl "net/url"
	"os"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

var sequence atomic.Int64

// URL returns TEST_DATABASE_URL or skips the test.
func URL(t testing.TB) string {
	t.Helper()
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("set TEST_DATABASE_URL to a disposable PostgreSQL database")
	}
	return url
}

// SchemaURL creates an empty schema, drops it after the test, and returns a
// connection string whose search_path selects it.
func SchemaURL(t testing.TB, databaseURL, prefix string) string {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	schema := fmt.Sprintf("%s_%d_%d", prefix, time.Now().UnixNano(), sequence.Add(1))
	if _, err = pool.Exec(ctx, "CREATE SCHEMA "+schema); err != nil {
		pool.Close()
		t.Fatal(err)
	}
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		_, _ = pool.Exec(ctx, "DROP SCHEMA "+schema+" CASCADE")
		pool.Close()
	})
	if strings.Contains(databaseURL, "://") {
		parsed, err := neturl.Parse(databaseURL)
		if err != nil {
			t.Fatal(err)
		}
		query := parsed.Query()
		query.Set("search_path", schema)
		parsed.RawQuery = query.Encode()
		return parsed.String()
	}
	return databaseURL + " search_path=" + schema
}

// Pool opens a pool on an isolated schema and closes it after the test.
func Pool(t testing.TB, prefix string) (*pgxpool.Pool, string) {
	t.Helper()
	url := SchemaURL(t, URL(t), prefix)
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	return pool, url
}
