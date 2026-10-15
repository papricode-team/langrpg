package main

import (
	"context"
	"os"
	"testing"
	"time"

	"glotworld/server/internal/contentstore"
	"glotworld/server/internal/store"

	"github.com/jackc/pgx/v5/pgxpool"
)

func TestPostgresContentImportSkipsAnUnchangedBundle(t *testing.T) {
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("set TEST_DATABASE_URL to a disposable PostgreSQL database")
	}
	url = contentTestSchemaURL(t, url)
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	if err = store.MigrateSchema(ctx, pool); err != nil {
		t.Fatal(err)
	}
	data := []byte(`{"version":1,"courses":[{"id":"11111111-1111-4111-8111-111111111111","slug":"german","target":"de","supportLanguages":["en"],"title":"German"}],
"records":[{"id":"22222222-2222-4222-8222-222222222222","courseId":"11111111-1111-4111-8111-111111111111","slug":"greeting","kind":"sentence","version":1,"body":{"text":"Guten Tag"}}],"ids":{}}`)
	bundle, err := contentstore.Parse(data)
	if err != nil {
		t.Fatal(err)
	}
	fingerprint := contentstore.Fingerprint(data)
	if fingerprint == contentstore.Fingerprint(append(data, ' ')) {
		t.Fatal("a changed bundle must have a different fingerprint")
	}
	if recorded, err := contentstore.ImportedFingerprint(ctx, pool); err != nil || recorded != "" {
		t.Fatalf("fresh database: %q %v", recorded, err)
	}
	// The catalog schema is created by migrations, never by the importer.
	if imported, err := contentstore.ImportFingerprinted(ctx, pool, bundle, fingerprint, false); err != nil || !imported {
		t.Fatalf("first import: %v %v", imported, err)
	}
	if recorded, err := contentstore.ImportedFingerprint(ctx, pool); err != nil || recorded != fingerprint {
		t.Fatalf("recorded fingerprint: %q %v", recorded, err)
	}
	// Tamper with the catalog: a skipped import must not rewrite any rows.
	if _, err = pool.Exec(ctx, `UPDATE content_sentences SET body='{"text":"tampered"}'`); err != nil {
		t.Fatal(err)
	}
	body := func() string {
		var text string
		if err := pool.QueryRow(ctx, `SELECT body->>'text' FROM content_sentences`).Scan(&text); err != nil {
			t.Fatal(err)
		}
		return text
	}
	if imported, err := contentstore.ImportFingerprinted(ctx, pool, bundle, fingerprint, false); err != nil || imported || body() != "tampered" {
		t.Fatalf("an unchanged bundle was imported again: %v %v %s", imported, err, body())
	}
	if imported, err := contentstore.ImportFingerprinted(ctx, pool, bundle, fingerprint, true); err != nil || !imported || body() != "Guten Tag" {
		t.Fatalf("a forced import must rewrite the catalog: %v %v %s", imported, err, body())
	}
	// An unfingerprinted import clears the record, so the next boot imports.
	if err = contentstore.Import(ctx, pool, bundle); err != nil {
		t.Fatal(err)
	}
	if recorded, err := contentstore.ImportedFingerprint(ctx, pool); err != nil || recorded != "" {
		t.Fatalf("unfingerprinted import left %q %v", recorded, err)
	}
}
