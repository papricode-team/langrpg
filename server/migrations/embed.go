// Package migrations holds the PostgreSQL schema history, applied in order by
// internal/migrate. Never edit an applied migration; add the next NNNN file.
package migrations

import (
	"embed"

	"glotworld/server/internal/migrate"
)

//go:embed *.sql
var files embed.FS

// All returns every migration in version order.
func All() ([]migrate.Migration, error) {
	return migrate.Load(files, ".")
}
