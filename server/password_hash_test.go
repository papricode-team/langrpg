package main

import (
	"context"
	"crypto/pbkdf2"
	"crypto/sha256"
	"encoding/base64"
	"strconv"
	"strings"
	"testing"
)

func legacyPasswordHash(t *testing.T, password string, iterations int) string {
	t.Helper()
	key, err := pbkdf2.Key(sha256.New, password, []byte("legacy-salt"), iterations, 32)
	if err != nil {
		t.Fatal(err)
	}
	return "pbkdf2-sha256$" + strconv.Itoa(iterations) + "$legacy-salt$" + base64.RawURLEncoding.EncodeToString(key)
}

func TestVerifyPasswordReadsStoredIterations(t *testing.T) {
	legacy := legacyPasswordHash(t, "an older lantern password", 100000)
	if !verifyPassword("an older lantern password", legacy) || verifyPassword("wrong password", legacy) {
		t.Fatal("a valid lower-iteration hash must verify by its own count")
	}
	if !passwordNeedsRehash(legacy) {
		t.Fatal("a weaker hash should be upgraded")
	}
	current, err := hashPassword("a current lantern password")
	if err != nil || !verifyPassword("a current lantern password", current) || passwordNeedsRehash(current) {
		t.Fatalf("current hash: %v", err)
	}
	for _, bad := range []string{
		strings.Replace(legacy, "$100000$", "$0100000$", 1),
		strings.Replace(legacy, "$100000$", "$9$", 1),
		strings.Replace(legacy, "$100000$", "$99999999999$", 1),
		strings.Replace(legacy, "pbkdf2-sha256", "pbkdf2-sha1", 1),
	} {
		if verifyPassword("an older lantern password", bad) || passwordNeedsRehash(bad) {
			t.Fatalf("malformed hash accepted: %s", bad)
		}
	}
}

func TestLoginUpgradesWeakerPasswordHash(t *testing.T) {
	app := testApp(t)
	token, _ := createSession(t, app, "Legacy Ida")
	credentials := credentialInput{Email: "legacy-ida@example.com", Password: "an older lantern password"}
	if w := request(app, "POST", "/api/account/register", token, credentials); w.Code != 200 {
		t.Fatalf("register: %d %s", w.Code, w.Body.String())
	}
	legacy := legacyPasswordHash(t, credentials.Password, 100000)
	if _, err := app.store.UpdateAccount(context.Background(), tokenHash(token), func(account *Account) error {
		account.PasswordHash = legacy
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	loginToken(t, app, credentials.Email, credentials.Password)
	account, err := app.store.GetByEmail(context.Background(), credentials.Email)
	if err != nil || account.PasswordHash == legacy || passwordNeedsRehash(account.PasswordHash) || !verifyPassword(credentials.Password, account.PasswordHash) {
		t.Fatalf("login did not upgrade the stored hash: %v %s", err, account.PasswordHash)
	}
	loginToken(t, app, credentials.Email, credentials.Password)
}
