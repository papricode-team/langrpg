package main

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"

	"glotworld/server/internal/store"
)

// Admin privileges are deployment configuration, never client-supplied profile
// data. Reject the whole list if any entry is invalid rather than applying only
// the valid subset of a misspelled configuration.
func parseAdminEmails(value string) (map[string]bool, error) {
	emails := make(map[string]bool)
	if strings.TrimSpace(value) == "" {
		return emails, nil
	}
	for _, entry := range strings.Split(value, ",") {
		email, valid := normalizeEmail(entry)
		if !valid {
			return nil, fmt.Errorf("ADMIN_EMAILS must be a comma-separated list of valid email addresses")
		}
		emails[email] = true
	}
	return emails, nil
}

func (a *App) isAdmin(account Account) bool {
	email, valid := normalizeEmail(account.Email)
	return valid && a.adminEmails[email]
}

// Authoring is available independently of paid play, but always authenticates
// the persisted account and checks the server's current allowlist.
func (a *App) requireAdmin(w http.ResponseWriter, r *http.Request) (Account, bool) {
	hash, err := bearer(r)
	if err != nil {
		apiFailure(w, err)
		return Account{}, false
	}
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()
	var account Account
	if isAdminToken(r) {
		tokens, ok := a.store.(store.AdminTokens)
		if !ok {
			apiFailure(w, ErrUnauthorized)
			return Account{}, false
		}
		account, err = tokens.AdminTokenAccount(ctx, hash)
	} else {
		account, err = a.store.Get(ctx, hash)
	}
	if err != nil {
		apiFailure(w, err)
		return Account{}, false
	}
	if !a.isAdmin(account) {
		writeError(w, http.StatusForbidden, "administrator access is required")
		return Account{}, false
	}
	return account, true
}
