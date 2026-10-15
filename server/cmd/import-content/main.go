package main

import (
	"context"
	"flag"
	"log"
	"os"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"glotworld/server/internal/contentstore"
	"glotworld/server/internal/migrate"
	"glotworld/server/migrations"
)

func main() {
	path := flag.String("content", "content.json", "generated content bundle")
	validate := flag.Bool("validate", false, "validate without writing Postgres")
	force := flag.Bool("force", false, "import even when this bundle was already imported")
	flag.Parse()
	data, err := os.ReadFile(*path)
	if err != nil {
		log.Fatal(err)
	}
	if *validate {
		b, err := contentstore.Parse(data)
		if err != nil {
			log.Fatal(err)
		}
		log.Printf("valid content: %d courses, %d records", len(b.Courses), len(b.Records))
		return
	}
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		log.Fatal("DATABASE_URL is required; use -validate to validate the JSON development store")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		log.Fatal(err)
	}
	defer pool.Close()
	// The importer can run before the server's first boot; it applies the same
	// versioned schema (a no-op read when everything is already applied).
	all, err := migrations.All()
	if err != nil {
		log.Fatal(err)
	}
	result, err := migrate.Apply(ctx, pool, all)
	if err != nil {
		log.Fatal(err)
	}
	if len(result.Applied) > 0 {
		log.Printf("applied database migrations %v", result.Applied)
	}
	// An unchanged bundle needs no DDL or bulk writes on an ordinary restart.
	fingerprint := contentstore.Fingerprint(data)
	if !*force {
		imported, err := contentstore.ImportedFingerprint(ctx, pool)
		if err != nil {
			log.Fatal(err)
		}
		if imported == fingerprint {
			log.Printf("content unchanged (%s); skipping import", fingerprint[:12])
			return
		}
	}
	b, err := contentstore.Parse(data)
	if err != nil {
		log.Fatal(err)
	}
	imported, err := contentstore.ImportFingerprinted(ctx, pool, b, fingerprint, *force)
	if err != nil {
		log.Fatal(err)
	}
	if !imported {
		log.Printf("content was imported concurrently (%s); nothing to do", fingerprint[:12])
		return
	}
	log.Printf("imported %d courses and %d records (%s)", len(b.Courses), len(b.Records), fingerprint[:12])
}
