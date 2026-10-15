package store

import (
	"encoding/json"
	"errors"
	"time"
)

// Hooks are the domain rules a store applies while it holds an account. The
// server supplies them; the store itself never interprets story, trial or
// referral state.
type Hooks struct {
	// NormalizeProgress completes and repairs decoded progress, including
	// story-state migrations for older saves. It runs on every decoded account
	// and must start from EnsureContainers.
	NormalizeProgress func(*Progress)
	// ResetGame clears an account for a fresh game while keeping its identity,
	// credentials and billing.
	ResetGame func(*Account) error
	// CreditReferral credits inviter for account's signup with email, inside
	// the registration transaction, and reports whether a credit applied.
	CreditReferral func(account, inviter *Account, email string, now time.Time) bool
}

func (h Hooks) validate() error {
	if h.NormalizeProgress == nil || h.ResetGame == nil || h.CreditReferral == nil {
		return errors.New("store: every domain hook is required")
	}
	return nil
}

// clone deep-copies an account through its JSON form, as stored.
func (h Hooks) clone(a Account) Account {
	b, _ := json.Marshal(a)
	var out Account
	_ = json.Unmarshal(b, &out)
	h.NormalizeProgress(&out.Progress)
	return out
}
