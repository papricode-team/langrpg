package main

import (
	"context"
	"flag"
	"log"
	"os"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"lernen01/server/internal/contentstore"
)

func main() {
	path := flag.String("content", "content.json", "generated content bundle")
	validate := flag.Bool("validate", false, "validate without writing Postgres")
	flag.Parse()
	b, err := contentstore.LoadJSON(*path)
	if err != nil {
		log.Fatal(err)
	}
	if *validate {
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
	if err = contentstore.Import(ctx, pool, b); err != nil {
		log.Fatal(err)
	}
	log.Printf("imported %d courses and %d records", len(b.Courses), len(b.Records))
}
