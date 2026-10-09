package main

import (
	"context"
	"crypto/pbkdf2"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"net"
	"net/http"
	"net/mail"
	"strings"
	"time"
	"unicode/utf8"
)

const passwordIterations = 600000

func normalizeEmail(value string) (string, bool) {
	value = strings.ToLower(strings.TrimSpace(value))
	address, err := mail.ParseAddress(value)
	return value, err == nil && address.Address == value && len(value) <= 254 && !strings.ContainsAny(value, "\r\n") && strings.Contains(strings.SplitN(value, "@", 2)[1], ".")
}

func hashPassword(password string) (string, error) {
	salt, err := randomID(24)
	if err != nil {
		return "", err
	}
	key, err := pbkdf2.Key(sha256.New, password, []byte(salt), passwordIterations, 32)
	if err != nil {
		return "", err
	}
	return "pbkdf2-sha256$600000$" + salt + "$" + base64.RawURLEncoding.EncodeToString(key), nil
}

func verifyPassword(password, encoded string) bool {
	parts := strings.Split(encoded, "$")
	if len(parts) != 4 || parts[0] != "pbkdf2-sha256" || parts[1] != "600000" {
		return false
	}
	expected, err := base64.RawURLEncoding.DecodeString(parts[3])
	if err != nil || len(expected) != 32 {
		return false
	}
	key, err := pbkdf2.Key(sha256.New, password, []byte(parts[2]), passwordIterations, 32)
	return err == nil && subtle.ConstantTimeCompare(key, expected) == 1
}

func sessionResponse(token string, account Account) map[string]any {
	return map[string]any{"token": token, "player": account.Player, "progress": account.Progress, "account": map[string]any{"registered": account.Email != "", "email": account.Email}}
}

type credentialInput struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

func (a *App) registerAccount(w http.ResponseWriter, r *http.Request) {
	hash, err := bearer(r)
	if err != nil {
		apiFailure(w, err)
		return
	}
	if !a.allow("register:"+hash, 6) {
		writeError(w, 429, "too many account requests; try again in a minute")
		return
	}
	var input credentialInput
	if err = decodeJSON(w, r, &input); err != nil {
		apiFailure(w, err)
		return
	}
	email, valid := normalizeEmail(input.Email)
	if !valid {
		writeError(w, 400, "enter a valid email address")
		return
	}
	if utf8.RuneCountInString(input.Password) < 10 || utf8.RuneCountInString(input.Password) > 128 {
		writeError(w, 400, "use a password with 10–128 characters")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	// Check authentication before doing expensive password work.
	if _, err = a.store.Get(ctx, hash); err != nil {
		apiFailure(w, err)
		return
	}
	encoded, err := hashPassword(input.Password)
	if err != nil {
		apiFailure(w, err)
		return
	}
	if err = a.store.SetCredentials(ctx, hash, email, encoded); err != nil {
		if errors.Is(err, ErrCredentialsConflict) {
			// A response can be lost after the credentials were committed. Repeating
			// the same signup is safe, but cannot replace an existing password.
			linked, getErr := a.store.Get(ctx, hash)
			if getErr != nil {
				apiFailure(w, getErr)
				return
			}
			if linked.Email == email && verifyPassword(input.Password, linked.PasswordHash) {
				writeJSON(w, 200, map[string]any{"registered": true, "email": email})
				return
			}
			writeError(w, 409, "this account is already linked or the email is already in use")
			return
		}
		apiFailure(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"registered": true, "email": email})
}

func (a *App) loginAccount(w http.ResponseWriter, r *http.Request) {
	remote, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		remote = r.RemoteAddr
	}
	if !a.allow("login:"+remote, 10) {
		writeError(w, 429, "too many login attempts; try again in a minute")
		return
	}
	var input credentialInput
	if err = decodeJSON(w, r, &input); err != nil {
		apiFailure(w, err)
		return
	}
	email, valid := normalizeEmail(input.Email)
	if !valid || utf8.RuneCountInString(input.Password) > 128 {
		writeError(w, 401, "email or password is incorrect")
		return
	}
	if !a.allow("login-email:"+tokenHash(email), 10) {
		writeError(w, 429, "too many login attempts; try again in a minute")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	account, err := a.store.GetByEmail(ctx, email)
	if err != nil && !errors.Is(err, ErrUnauthorized) {
		apiFailure(w, err)
		return
	}
	encoded := account.PasswordHash
	if errors.Is(err, ErrUnauthorized) {
		// Spend the same derivation work for unknown accounts.
		encoded = "pbkdf2-sha256$600000$unknown-account-salt$" + base64.RawURLEncoding.EncodeToString(make([]byte, 32))
	}
	if !verifyPassword(input.Password, encoded) || err != nil {
		writeError(w, 401, "email or password is incorrect")
		return
	}
	token, err := randomID(32)
	if err != nil {
		apiFailure(w, err)
		return
	}
	if err = a.store.AddSession(ctx, tokenHash(token), account.Player.ID); err != nil {
		apiFailure(w, err)
		return
	}
	// Apply the same additive migrations used by session resume.
	account, err = a.getAccount(ctx, tokenHash(token))
	if err != nil {
		apiFailure(w, err)
		return
	}
	writeJSON(w, 200, sessionResponse(token, account))
}
