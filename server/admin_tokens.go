package main

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"glotworld/server/internal/store"
)

// Admin API tokens let tools such as the world MCP server act for an admin.
// They are created from a signed-in admin session, shown once, and stored as a
// hash. A token acts only while its account is still on ADMIN_EMAILS.
const adminTokenPrefix = "gwa_"

func isAdminToken(r *http.Request) bool {
	return strings.HasPrefix(strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer "), adminTokenPrefix)
}

// adminSource names where a world change came from for the edit log.
func adminSource(r *http.Request) string {
	if isAdminToken(r) {
		return "agent"
	}
	return "editor"
}

func (a *App) adminTokens(w http.ResponseWriter) (store.AdminTokens, bool) {
	tokens, ok := a.store.(store.AdminTokens)
	if !ok {
		writeError(w, 503, "API tokens are unavailable on this server")
	}
	return tokens, ok
}

// requireAdminSession refuses API tokens, so a token can never mint or revoke tokens.
func (a *App) requireAdminSession(w http.ResponseWriter, r *http.Request) (Account, bool) {
	if isAdminToken(r) {
		writeError(w, http.StatusForbidden, "sign in to manage API tokens")
		return Account{}, false
	}
	return a.requireAdmin(w, r)
}

func (a *App) listAdminTokens(w http.ResponseWriter, r *http.Request) {
	if _, ok := a.requireAdminSession(w, r); !ok {
		return
	}
	tokens, ok := a.adminTokens(w)
	if !ok {
		return
	}
	list, err := tokens.ListAdminTokens(r.Context())
	if err != nil {
		apiFailure(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"tokens": list})
}

func (a *App) createAdminToken(w http.ResponseWriter, r *http.Request) {
	account, ok := a.requireAdminSession(w, r)
	if !ok {
		return
	}
	tokens, ok := a.adminTokens(w)
	if !ok {
		return
	}
	var body struct {
		Name string `json:"name"`
	}
	if err := decodeJSON(w, r, &body); err != nil {
		apiFailure(w, err)
		return
	}
	name := strings.Join(strings.Fields(body.Name), " ")
	if name == "" || utf8.RuneCountInString(name) > 60 {
		writeError(w, 400, "name the token in up to 60 characters")
		return
	}
	secret, err := randomID(30)
	if err != nil {
		apiFailure(w, err)
		return
	}
	id, err := randomID(9)
	if err != nil {
		apiFailure(w, err)
		return
	}
	token := adminTokenPrefix + secret
	record := store.AdminToken{ID: id, AccountID: account.Player.ID, Name: name, Hash: tokenHash(token), CreatedAt: a.now().UTC()}
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()
	if err := tokens.CreateAdminToken(ctx, record); err != nil {
		apiFailure(w, err)
		return
	}
	record.Hash = ""
	writeJSON(w, 201, map[string]any{"token": token, "record": record})
}

func (a *App) revokeAdminToken(w http.ResponseWriter, r *http.Request) {
	if _, ok := a.requireAdminSession(w, r); !ok {
		return
	}
	tokens, ok := a.adminTokens(w)
	if !ok {
		return
	}
	if err := tokens.RevokeAdminToken(r.Context(), r.PathValue("id")); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, 404, "token not found")
			return
		}
		apiFailure(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"revoked": true})
}
