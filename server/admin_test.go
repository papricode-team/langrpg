package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"
)

func TestAdminEmailsNormalizeAndRejectInvalidConfiguration(t *testing.T) {
	for _, value := range []string{"", "  \t\n"} {
		emails, err := parseAdminEmails(value)
		if err != nil || len(emails) != 0 {
			t.Fatalf("empty configuration %q: %v %v", value, emails, err)
		}
	}
	emails, err := parseAdminEmails(" ADMIN@Example.com , editor@example.org,admin@example.com ")
	if err != nil || !reflect.DeepEqual(emails, map[string]bool{"admin@example.com": true, "editor@example.org": true}) {
		t.Fatalf("normalized allowlist: %v %v", emails, err)
	}
	for _, value := range []string{
		"admin@example.com,not-an-email",
		"Admin <admin@example.com>",
		"admin@localhost",
		"admin@example.com,",
		",admin@example.com",
		"admin@example.com, ,editor@example.org",
		"admin@example.com\r\neditor@example.org",
	} {
		if emails, err := parseAdminEmails(value); err == nil || emails != nil {
			t.Fatalf("malformed allowlist must grant no access: %q => %v %v", value, emails, err)
		}
	}
}

func TestRequireAdminUsesPersistedAuthenticatedAccount(t *testing.T) {
	app := testApp(t)
	app.adminEmails = map[string]bool{"admin@example.com": true}
	adminToken, adminPlayer := createSession(t, app, "Owner")
	if err := app.store.SetCredentials(context.Background(), tokenHash(adminToken), "admin@example.com", "stored-password-hash"); err != nil {
		t.Fatal(err)
	}
	playerToken, _ := createSession(t, app, "Admin User")
	memberToken, _ := createSession(t, app, "Member")
	if err := app.store.SetCredentials(context.Background(), tokenHash(memberToken), "member@example.com", "stored-password-hash"); err != nil {
		t.Fatal(err)
	}
	// A caller's claim never changes their stored account identity.
	for _, test := range []struct {
		name  string
		token string
		code  int
	}{
		{"missing session", "", http.StatusUnauthorized},
		{"malformed session", "short", http.StatusUnauthorized},
		{"unknown session", strings.Repeat("x", 43), http.StatusUnauthorized},
		{"guest", playerToken, http.StatusForbidden},
		{"registered nonadmin", memberToken, http.StatusForbidden},
		{"admin", adminToken, http.StatusOK},
	} {
		t.Run(test.name, func(t *testing.T) {
			r := httptest.NewRequest(http.MethodPost, "/api/admin/worlds", strings.NewReader(`{"email":"admin@example.com","admin":true}`))
			if test.token != "" {
				r.Header.Set("Authorization", "Bearer "+test.token)
			}
			w := httptest.NewRecorder()
			account, ok := app.requireAdmin(w, r)
			if ok != (test.code == http.StatusOK) || w.Code != test.code {
				t.Fatalf("authorization: allowed=%v status=%d body=%s", ok, w.Code, w.Body.String())
			}
			if ok && account.Player.ID != adminPlayer.ID {
				t.Fatal("authorized a different account")
			}
		})
	}
	app.adminEmails = nil
	r := httptest.NewRequest(http.MethodGet, "/api/admin/worlds", nil)
	r.Header.Set("Authorization", "Bearer "+adminToken)
	w := httptest.NewRecorder()
	if _, ok := app.requireAdmin(w, r); ok || w.Code != http.StatusForbidden {
		t.Fatal("empty allowlist must revoke admin access")
	}
}

func TestAdminStatusInSignupSessionAndLogin(t *testing.T) {
	app := testApp(t)
	app.adminEmails = map[string]bool{"admin@example.com": true}
	token, _ := createSession(t, app, "Owner")
	assertSessionAdmin := func(w *httptest.ResponseRecorder, expected bool) {
		t.Helper()
		var result struct {
			Account struct {
				Admin *bool `json:"admin"`
			} `json:"account"`
		}
		if w.Code != http.StatusOK || json.Unmarshal(w.Body.Bytes(), &result) != nil || result.Account.Admin == nil || *result.Account.Admin != expected {
			t.Fatalf("session admin must be explicitly %v: %d %s", expected, w.Code, w.Body.String())
		}
	}
	assertSessionAdmin(request(app, "POST", "/api/session", token, map[string]any{"admin": true, "email": "admin@example.com"}), false)
	credentials := map[string]string{"email": " ADMIN@Example.com ", "password": "a long lantern password"}
	for range 2 {
		registered := request(app, "POST", "/api/account/register", token, credentials)
		var result struct {
			Admin *bool `json:"admin"`
		}
		if registered.Code != http.StatusOK || json.Unmarshal(registered.Body.Bytes(), &result) != nil || result.Admin == nil || !*result.Admin {
			t.Fatalf("signup and retry must include admin: %d %s", registered.Code, registered.Body.String())
		}
	}
	assertSessionAdmin(request(app, "POST", "/api/session", token, map[string]any{}), true)
	assertSessionAdmin(request(app, "POST", "/api/account/login", "", credentials), true)
	app.adminEmails = nil
	assertSessionAdmin(request(app, "POST", "/api/session", token, map[string]any{}), false)
}

func TestAdminAuthoringAccessDoesNotRequirePaidPlay(t *testing.T) {
	app := trialTestApp(t)
	app.adminEmails = map[string]bool{"admin@example.com": true}
	token, _ := createSession(t, app, "Owner")
	if err := app.store.SetCredentials(context.Background(), tokenHash(token), "admin@example.com", "stored-password-hash"); err != nil {
		t.Fatal(err)
	}
	if _, err := app.store.UpdateAccount(context.Background(), tokenHash(token), func(account *Account) error {
		account.Access.PlayedNanoseconds = int64(trialPlayLimit)
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	r := httptest.NewRequest(http.MethodGet, "/api/admin/worlds", nil)
	r.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	if !app.enforceGameAccess(w, r) {
		t.Fatalf("billing must allow authoring authentication: %d %s", w.Code, w.Body.String())
	}
	if _, ok := app.requireAdmin(w, r); !ok {
		t.Fatalf("admin cannot author after trial expiration: %d %s", w.Code, w.Body.String())
	}
	if got := request(app, "GET", "/api/progress", token, nil).Code; got != http.StatusPaymentRequired {
		t.Fatalf("authoring role must not grant free play: %d", got)
	}
}
