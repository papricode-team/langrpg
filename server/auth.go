package main

import (
	"context"
	"crypto/pbkdf2"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"glotworld/server/internal/store"
	"net/http"
	"net/mail"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"
)

const passwordIterations = 600000

// Stored hashes carry their own iteration count so the work factor can rise
// without locking anyone out. The bounds reject corrupt or hostile values.
const minPasswordIterations, maxPasswordIterations = 10000, 10000000

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
	return "pbkdf2-sha256$" + strconv.Itoa(passwordIterations) + "$" + salt + "$" + base64.RawURLEncoding.EncodeToString(key), nil
}

func passwordHashIterations(encoded string) (int, bool) {
	parts := strings.Split(encoded, "$")
	if len(parts) != 4 || parts[0] != "pbkdf2-sha256" {
		return 0, false
	}
	iterations, err := strconv.Atoi(parts[1])
	if err != nil || strconv.Itoa(iterations) != parts[1] || iterations < minPasswordIterations || iterations > maxPasswordIterations {
		return 0, false
	}
	return iterations, true
}

func verifyPassword(password, encoded string) bool {
	iterations, ok := passwordHashIterations(encoded)
	if !ok {
		return false
	}
	parts := strings.Split(encoded, "$")
	expected, err := base64.RawURLEncoding.DecodeString(parts[3])
	if err != nil || len(expected) != 32 {
		return false
	}
	key, err := pbkdf2.Key(sha256.New, password, []byte(parts[2]), iterations, 32)
	return err == nil && subtle.ConstantTimeCompare(key, expected) == 1
}

// passwordNeedsRehash reports a valid hash weaker than the current work factor.
func passwordNeedsRehash(encoded string) bool {
	iterations, ok := passwordHashIterations(encoded)
	return ok && iterations < passwordIterations
}

func sessionResponse(token string, account Account) map[string]any {
	return map[string]any{"token": token, "player": account.Player, "progress": account.Progress, "account": map[string]any{"registered": account.Email != "", "email": account.Email, "admin": false}, "preferences": store.NormalizePreferences(account.Preferences)}
}

func (a *App) sessionResponse(token string, account Account) map[string]any {
	response := sessionResponse(token, account)
	response["account"].(map[string]any)["admin"] = a.isAdmin(account)
	response["access"] = a.accessState(account, a.now().UTC())
	if a.content != nil {
		response["activeCourseId"] = account.ActiveCourseID
		if course, ok := a.content.ByCourse[account.ActiveCourseID]; ok {
			response["course"] = publicCourse(course)
		}
	}
	return response
}

type credentialInput struct {
	Email        string `json:"email"`
	Password     string `json:"password"`
	ReferralCode string `json:"referralCode,omitempty"`
}

func (a *App) registerAccount(w http.ResponseWriter, r *http.Request) {
	hash, err := bearer(r)
	if err != nil {
		apiFailure(w, err)
		return
	}
	// Resolve the session before touching the limiter: arbitrary bearer strings
	// must not create limiter keys. Each existing session has its own window.
	if _, err = a.store.Get(r.Context(), hash); err != nil {
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
	// Settle the anonymous allowance before changing the account's limit. A
	// delayed signup cannot charge time spent waiting at the login wall.
	if _, err = a.touchAccess(ctx, hash, nil); err != nil {
		apiFailure(w, err)
		return
	}
	encoded, err := hashPassword(input.Password)
	if err != nil {
		apiFailure(w, err)
		return
	}
	if err = a.store.RegisterWithReferral(ctx, hash, email, encoded, validReferralCode(input.ReferralCode), a.now().UTC()); err != nil {
		if errors.Is(err, ErrCredentialsConflict) {
			// A response can be lost after the credentials were committed. Repeating
			// the same signup is safe, but cannot replace an existing password.
			linked, getErr := a.store.Get(ctx, hash)
			if getErr != nil {
				apiFailure(w, getErr)
				return
			}
			if linked.Email == email && verifyPassword(input.Password, linked.PasswordHash) {
				a.recordSessionAnalytics(r, linked)
				writeJSON(w, 200, map[string]any{"registered": true, "email": email, "admin": a.isAdmin(linked), "access": a.accessState(linked, a.now().UTC())})
				return
			}
			writeError(w, 409, "this account is already linked or the email is already in use")
			return
		}
		apiFailure(w, err)
		return
	}
	linked, err := a.touchAccess(ctx, hash, nil)
	if err != nil {
		apiFailure(w, err)
		return
	}
	a.recordSessionAnalytics(r, linked)
	writeJSON(w, 200, map[string]any{"registered": true, "email": email, "admin": a.isAdmin(linked), "access": a.accessState(linked, a.now().UTC())})
}

func (a *App) loginAccount(w http.ResponseWriter, r *http.Request) {
	if !a.allow("login:"+a.clientIP(r), 10) {
		writeError(w, 429, "too many login attempts; try again in a minute")
		return
	}
	var input credentialInput
	if err := decodeJSON(w, r, &input); err != nil {
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
		encoded = "pbkdf2-sha256$" + strconv.Itoa(passwordIterations) + "$unknown-account-salt$" + base64.RawURLEncoding.EncodeToString(make([]byte, 32))
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
	// Upgrade an older work factor while the plaintext is available. The new
	// hash is derived outside the account lock and applied only if unchanged.
	upgraded := ""
	if passwordNeedsRehash(account.PasswordHash) {
		if upgraded, err = hashPassword(input.Password); err != nil {
			apiFailure(w, err)
			return
		}
	}
	if _, _, err = a.store.ManageAccount(ctx, account.Player.ID, false, tokenHash(token), func(current *Account) error {
		if current.PasswordHash != account.PasswordHash || current.Email != account.Email {
			return ErrUnauthorized
		}
		if upgraded != "" {
			current.PasswordHash = upgraded
		}
		return nil
	}); err != nil {
		apiFailure(w, err)
		return
	}
	if a.content != nil {
		if curriculum, ok := a.courseCurricula[account.ActiveCourseID]; ok {
			a.curriculum = curriculum
		}
	}
	// Apply the same additive migrations used by session resume.
	account, err = a.getAccount(ctx, tokenHash(token))
	if err != nil {
		apiFailure(w, err)
		return
	}
	account, err = a.touchAccess(ctx, tokenHash(token), nil)
	if err != nil {
		apiFailure(w, err)
		return
	}
	a.recordSessionAnalytics(r, account)
	writeJSON(w, 200, a.sessionResponse(token, account))
}

func (a *App) changeCredentials(w http.ResponseWriter, r *http.Request) {
	hash, err := bearer(r)
	if err != nil {
		apiFailure(w, err)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	account, err := a.store.Get(ctx, hash)
	if err != nil {
		apiFailure(w, err)
		return
	}
	if account.Email == "" {
		writeError(w, 403, "add an email and password before changing account details")
		return
	}
	if !a.allow("credentials:"+account.Player.ID, 6) {
		writeError(w, 429, "too many account requests; try again in a minute")
		return
	}
	var input struct {
		CurrentPassword string  `json:"currentPassword"`
		Email           *string `json:"email"`
		NewPassword     *string `json:"newPassword"`
	}
	if err = decodeJSON(w, r, &input); err != nil {
		apiFailure(w, err)
		return
	}
	if (input.Email == nil) == (input.NewPassword == nil) {
		writeError(w, 400, "change either your email or your password")
		return
	}
	if input.CurrentPassword == "" || utf8.RuneCountInString(input.CurrentPassword) > 128 || !verifyPassword(input.CurrentPassword, account.PasswordHash) {
		writeError(w, 403, "current password is incorrect")
		return
	}
	change := CredentialChange{PreviousEmail: account.Email, PreviousHash: account.PasswordHash, Email: account.Email, PasswordHash: account.PasswordHash}
	if input.Email != nil {
		email, valid := normalizeEmail(*input.Email)
		if !valid {
			writeError(w, 400, "enter a valid email address")
			return
		}
		// An unverified email edit must never grant deployment-managed privileges.
		if email != account.Email && a.adminEmails[email] {
			writeError(w, 409, "this email address is unavailable")
			return
		}
		change.Email = email
	} else {
		if utf8.RuneCountInString(*input.NewPassword) < 10 || utf8.RuneCountInString(*input.NewPassword) > 128 {
			writeError(w, 400, "use a password with 10–128 characters")
			return
		}
		change.PasswordHash, err = hashPassword(*input.NewPassword)
		if err != nil {
			apiFailure(w, err)
			return
		}
	}
	if err = a.store.ChangeCredentials(ctx, hash, change); err != nil {
		switch {
		case errors.Is(err, ErrCredentialsConflict):
			writeError(w, 409, "this email address is already in use")
		case errors.Is(err, ErrCredentialsChanged):
			writeError(w, 409, err.Error())
		default:
			apiFailure(w, err)
		}
		return
	}
	// Every other session of this account was revoked with the change.
	a.world.RevokeOtherSessions(account.Player.ID, hash)
	account.Email, account.PasswordHash = change.Email, change.PasswordHash
	writeJSON(w, 200, map[string]any{"registered": true, "email": account.Email, "admin": a.isAdmin(account), "access": a.accessState(account, a.now().UTC())})
}

func (a *App) logoutAccount(w http.ResponseWriter, r *http.Request) {
	hash, err := bearer(r)
	if err != nil {
		apiFailure(w, err)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()
	a.world.RevokeSession(hash)
	playing := false
	if _, err = a.touchAccess(ctx, hash, &playing); err != nil && !errors.Is(err, ErrUnauthorized) {
		apiFailure(w, err)
		return
	}
	if err = a.store.DeleteSession(ctx, hash); err != nil {
		apiFailure(w, err)
		return
	}
	writeJSON(w, 200, map[string]bool{"loggedOut": true})
}
