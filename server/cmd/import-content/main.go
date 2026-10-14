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
	input := flag.String("input", "content.json", "validated build catalogue")
	output := flag.String("output", ".data/content.json", "development catalogue destination")
	flag.Parse()
	catalogue, err := contentstore.Load(*input)
	if err != nil {
		log.Fatal(err)
	}
	if url := os.Getenv("DATABASE_URL"); url != "" {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
		defer cancel()
		pool, err := pgxpool.New(ctx, url)
		if err != nil {
			log.Fatal(err)
		}
		defer pool.Close()
		if err := catalogue.Import(ctx, pool); err != nil {
			log.Fatal(err)
		}
	} else if err := catalogue.Save(*output); err != nil {
		log.Fatal(err)
	}
	log.Printf("imported content catalogue v%d", catalogue.Version)
}
