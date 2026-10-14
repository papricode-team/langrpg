package main

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/jackc/pgx/v5"
)

// The editable source and all authority manifests commit as one revision.
type worldContentStore interface {
	LoadWorldContent(context.Context) (*WorldContent, error)
	SaveWorldContent(context.Context, string, *WorldContent) error
}

func (s *JSONStore) WorldContentRevision(_ context.Context) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.state.WorldContent == nil {
		return "", nil
	}
	return s.state.WorldContent.Revision, nil
}
func (s *PGStore) WorldContentRevision(ctx context.Context) (string, error) {
	var revision string
	err := s.pool.QueryRow(ctx, "SELECT data->>'revision' FROM world_content WHERE id='main'").Scan(&revision)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", nil
	}
	return revision, err
}

func (s *JSONStore) LoadWorldContent(_ context.Context) (*WorldContent, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.state.WorldContent == nil {
		return nil, nil
	}
	copy := *s.state.WorldContent
	return &copy, nil
}

func (s *JSONStore) SaveWorldContent(_ context.Context, expected string, next *WorldContent) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.state.WorldContent != nil && s.state.WorldContent.Revision != expected {
		return ErrConflict
	}
	before := s.state.WorldContent
	s.state.WorldContent = next
	if err := s.save(); err != nil {
		s.state.WorldContent = before
		return err
	}
	return nil
}

func (s *PGStore) LoadWorldContent(ctx context.Context) (*WorldContent, error) {
	var data []byte
	err := s.pool.QueryRow(ctx, "SELECT data FROM world_content WHERE id='main'").Scan(&data)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var content WorldContent
	if err = json.Unmarshal(data, &content); err != nil {
		return nil, err
	}
	return &content, nil
}

func (s *PGStore) SaveWorldContent(ctx context.Context, expected string, next *WorldContent) error {
	data, err := json.Marshal(next)
	if err != nil {
		return err
	}
	result, err := s.pool.Exec(ctx, `INSERT INTO world_content(id,data) VALUES('main',$1)
 ON CONFLICT(id) DO UPDATE SET data=EXCLUDED.data WHERE world_content.data->>'revision'=$2`, data, expected)
	if err != nil {
		return err
	}
	if result.RowsAffected() != 1 {
		return ErrConflict
	}
	return nil
}
