package store

import (
	"context"
	"time"

	"glotworld/server/internal/contentstore"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Every store implements Store. The interfaces below are optional
// capabilities; callers discover them with a type assertion instead of
// depending on a concrete store type. Canonical forwards the ones that its
// callers use through it (WorldDocuments).
//
//	capability            JSONStore  PGStore
//	WorldDocuments            ✓         ✓
//	LegacyReceiptReader       ✓         ✓
//	ExerciseReceiptReader     ✓         ✓
//	ReferenceMigrator         ✓         ✓
//	SessionPruner             ✓         ✓
//	SessionIdleSetter         ✓         ✓
//	CatalogStore                        ✓
//	PoolStatter                         ✓
//	ContentImportReader                 ✓

// CatalogStore is implemented by stores that also hold the imported content
// catalog. Other stores load it from the generated content.json.
type CatalogStore interface {
	LoadCatalog(context.Context) (*contentstore.Bundle, error)
}

// PoolStatter exposes connection pool statistics for metrics.
type PoolStatter interface {
	PoolStat() *pgxpool.Stat
}

// ContentImportReader reports the last import recorded by cmd/import-content.
type ContentImportReader interface {
	ContentImportInfo(context.Context) (ContentImportInfo, error)
}

// SessionIdleSetter configures idle expiry of linked-account sessions.
type SessionIdleSetter interface {
	SetSessionIdle(time.Duration)
}

// LoadCatalog reads the content catalog imported into PostgreSQL.
func (s *PGStore) LoadCatalog(ctx context.Context) (*contentstore.Bundle, error) {
	return contentstore.LoadPostgres(ctx, s.pool)
}

// Base returns the store a canonical content adapter wraps, for capabilities
// that never carry account data.
func Base(s Store) Store {
	if adapter, ok := s.(*Canonical); ok {
		return adapter.Store
	}
	return s
}

// Pool is the underlying connection pool, for integration tests and tools
// that need direct SQL.
func (s *PGStore) Pool() *pgxpool.Pool { return s.pool }

var (
	_ WorldStore            = (*JSONStore)(nil)
	_ WorldStore            = (*PGStore)(nil)
	_ AdminTokens           = (*JSONStore)(nil)
	_ AdminTokens           = (*PGStore)(nil)
	_ AdminTokens           = (*Canonical)(nil)
	_ LegacyReceiptReader   = (*JSONStore)(nil)
	_ LegacyReceiptReader   = (*PGStore)(nil)
	_ ExerciseReceiptReader = (*JSONStore)(nil)
	_ ExerciseReceiptReader = (*PGStore)(nil)
	_ ReferenceMigrator     = (*JSONStore)(nil)
	_ ReferenceMigrator     = (*PGStore)(nil)
	_ SessionPruner         = (*JSONStore)(nil)
	_ SessionPruner         = (*PGStore)(nil)
	_ SessionIdleSetter     = (*JSONStore)(nil)
	_ SessionIdleSetter     = (*PGStore)(nil)
	_ CatalogStore          = (*PGStore)(nil)
	_ PoolStatter           = (*PGStore)(nil)
	_ ContentImportReader   = (*PGStore)(nil)
)
