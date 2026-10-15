package main

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"

	"glotworld/server/internal/store"
)

// storeHooks are the story, trial and referral rules the store applies while
// it holds an account row or the development state lock.
func storeHooks() store.Hooks {
	return store.Hooks{NormalizeProgress: ensureProgress, ResetGame: resetGameProgress, CreditReferral: creditReferral}
}

// NewJSONStore opens the development store with the server's domain hooks.
func NewJSONStore(path string) (*JSONStore, error) { return store.NewJSONStore(path, storeHooks()) }

// NewPGStore connects to PostgreSQL with the server's domain hooks.
func NewPGStore(ctx context.Context, url string) (*PGStore, error) {
	return store.NewPGStore(ctx, url, storeHooks())
}

func newProgress() Progress {
	p := Progress{WordExposureVersion: 2}
	ensureProgress(&p)
	return p
}

// ensureProgress completes decoded progress and repairs story state saved by
// older versions. No reset, schema rewrite, or invented historical evidence.
func ensureProgress(p *Progress) {
	store.EnsureContainers(p)
	ensureStory(p)
}

func randomID(bytes int) (string, error) {
	b := make([]byte, bytes)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

func tokenHash(token string) string {
	h := sha256.Sum256([]byte(token))
	return hex.EncodeToString(h[:])
}
