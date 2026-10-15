package store

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"

	"github.com/jackc/pgx/v5"
)

// WorldDocuments is implemented by stores that persist the published world:
// the editable scene document and every authority manifest compiled from it,
// committed together as one revision. The store treats the document as opaque
// JSON with a top-level "revision" string.
type WorldDocuments interface {
	// LoadWorldDocument returns nil when nothing has been published.
	LoadWorldDocument(context.Context) (json.RawMessage, error)
	// SaveWorldDocument publishes document if the stored revision is still
	// expectedRevision (or nothing is stored); otherwise it returns ErrConflict.
	SaveWorldDocument(ctx context.Context, expectedRevision string, document json.RawMessage) error
	// WorldDocumentRevision returns "" when nothing has been published.
	WorldDocumentRevision(context.Context) (string, error)
}

func documentRevision(document json.RawMessage) string {
	var head struct {
		Revision string `json:"revision"`
	}
	_ = json.Unmarshal(document, &head)
	return head.Revision
}

func (s *JSONStore) WorldDocumentRevision(_ context.Context) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.state.WorldContent == nil {
		return "", nil
	}
	return documentRevision(s.state.WorldContent), nil
}

func (s *PGStore) WorldDocumentRevision(ctx context.Context) (string, error) {
	var revision string
	err := s.pool.QueryRow(ctx, "SELECT data->>'revision' FROM world_content WHERE id='main'").Scan(&revision)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", nil
	}
	return revision, err
}

func (s *JSONStore) LoadWorldDocument(_ context.Context) (json.RawMessage, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.state.WorldContent == nil {
		return nil, nil
	}
	return bytes.Clone(s.state.WorldContent), nil
}

func (s *JSONStore) SaveWorldDocument(_ context.Context, expected string, document json.RawMessage) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.state.WorldContent != nil && documentRevision(s.state.WorldContent) != expected {
		return ErrConflict
	}
	before := s.state.WorldContent
	s.state.WorldContent = bytes.Clone(document)
	if err := s.save(); err != nil {
		s.state.WorldContent = before
		return err
	}
	return nil
}

func (s *PGStore) LoadWorldDocument(ctx context.Context) (json.RawMessage, error) {
	var data []byte
	err := s.pool.QueryRow(ctx, "SELECT data FROM world_content WHERE id='main'").Scan(&data)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	return data, err
}

func (s *PGStore) SaveWorldDocument(ctx context.Context, expected string, document json.RawMessage) error {
	result, err := s.pool.Exec(ctx, `INSERT INTO world_content(id,data) VALUES('main',$1)
 ON CONFLICT(id) DO UPDATE SET data=EXCLUDED.data WHERE world_content.data->>'revision'=$2`, []byte(document), expected)
	if err != nil {
		return err
	}
	if result.RowsAffected() != 1 {
		return ErrConflict
	}
	return nil
}
