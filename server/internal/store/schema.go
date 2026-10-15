package store

import (
	"context"
	"log/slog"

	"glotworld/server/internal/migrate"
	"glotworld/server/migrations"

	"github.com/jackc/pgx/v5/pgxpool"
)

// MigrateSchema applies pending versioned migrations (server/migrations).
// Replicas starting together serialize on an advisory lock; an edited applied
// migration stops startup.
func MigrateSchema(ctx context.Context, pool *pgxpool.Pool) error {
	all, err := migrations.All()
	if err != nil {
		return err
	}
	result, err := migrate.Apply(ctx, pool, all)
	if err != nil {
		return err
	}
	if len(result.Applied) > 0 {
		slog.Info("database migrations applied", "versions", result.Applied)
	}
	if len(result.Ahead) > 0 {
		slog.Warn("database has migrations newer than this binary", "versions", result.Ahead)
	}
	return nil
}
