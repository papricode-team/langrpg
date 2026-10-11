package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"time"
)

const worldDaySeconds = 720

// WorldIdentity belongs to the shared world, never to an account or story save.
// An immutable epoch lets restarted servers reconstruct time without tick writes.
type WorldIdentity struct {
	Version int       `json:"version"`
	Epoch   time.Time `json:"epoch"`
	Seed    string    `json:"seed"`
}

func newWorldIdentity() (WorldIdentity, error) {
	var seed [16]byte
	if _, err := rand.Read(seed[:]); err != nil {
		return WorldIdentity{}, err
	}
	return WorldIdentity{Version: 1, Epoch: time.Now().UTC(), Seed: hex.EncodeToString(seed[:])}, nil
}

func (identity WorldIdentity) validate() error {
	seed, err := hex.DecodeString(identity.Seed)
	if identity.Version != 1 || identity.Epoch.IsZero() || err != nil || len(seed) != 16 || identity.Seed != hex.EncodeToString(seed) {
		return errors.New("invalid persisted world identity; restore the saved epoch and seed")
	}
	return nil
}

func (s *JSONStore) initializeWorld() error {
	if s.state.World != nil {
		return s.state.World.validate()
	}
	identity, err := newWorldIdentity()
	if err != nil {
		return err
	}
	s.state.World = &identity
	if err = s.save(); err != nil {
		s.state.World = nil
	}
	return err
}

func (s *JSONStore) WorldIdentity() WorldIdentity {
	s.mu.Lock()
	defer s.mu.Unlock()
	return *s.state.World
}

func (s *PGStore) initializeWorld(ctx context.Context) error {
	identity, err := newWorldIdentity()
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
	identity = WorldIdentity{}
	if err = json.Unmarshal(data, &identity); err != nil {
		return err
	}
	if err = identity.validate(); err != nil {
		return err
	}
	s.worldIdentity = identity
	return nil
}

func (s *PGStore) WorldIdentity() WorldIdentity { return s.worldIdentity }
