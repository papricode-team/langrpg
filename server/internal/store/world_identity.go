package store

import (
	"context"
	"encoding/json"
	"glotworld/server/internal/world"
)

func (s *JSONStore) initializeWorld() error {
	if s.state.World != nil {
		return s.state.World.Validate()
	}
	identity, err := world.NewIdentity()
	if err != nil {
		return err
	}
	s.state.World = &identity
	if err = s.save(); err != nil {
		s.state.World = nil
	}
	return err
}

func (s *JSONStore) WorldIdentity() world.Identity {
	s.mu.Lock()
	defer s.mu.Unlock()
	return *s.state.World
}

func (s *PGStore) initializeWorld(ctx context.Context) error {
	identity, err := world.NewIdentity()
	if err != nil {
		return err
	}
	data, err := json.Marshal(identity)
	if err != nil {
		return err
	}
	// The unique key elects one epoch even when multiple servers start together.
	if _, err = s.pool.Exec(ctx, `INSERT INTO world_state(id,data) VALUES('main',$1) ON CONFLICT(id) DO NOTHING`, data); err != nil {
		return err
	}
	if err = s.pool.QueryRow(ctx, `SELECT data FROM world_state WHERE id='main'`).Scan(&data); err != nil {
		return err
	}
	identity = world.Identity{}
	if err = json.Unmarshal(data, &identity); err != nil {
		return err
	}
	if err = identity.Validate(); err != nil {
		return err
	}
	s.worldIdentity = identity
	return nil
}

func (s *PGStore) WorldIdentity() world.Identity { return s.worldIdentity }
