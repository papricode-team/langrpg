package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func adminUsersFixture(t *testing.T) (*App, string, string, Player) {
	t.Helper()
	app := testApp(t)
	app.adminEmails = map[string]bool{"admin@example.com": true}
	admin, _ := createSession(t, app, "Owner")
	member, player := createSession(t, app, "Juniper")
	password, err := hashPassword("original lantern password")
	if err != nil {
		t.Fatal(err)
	}
	for token, email := range map[string]string{admin: "admin@example.com", member: "juniper@example.com"} {
		if err := app.store.SetCredentials(context.Background(), tokenHash(token), email, password); err != nil {
			t.Fatal(err)
		}
	}
	return app, admin, member, player
}
func adminAction(t *testing.T, app *App, token, id, action string, extra map[string]any) *httptest.ResponseRecorder {
	t.Helper()
	body := map[string]any{"reason": "Support request from account holder"}
	for key, value := range extra {
		body[key] = value
	}
	return request(app, "POST", "/api/admin/users/"+id+"/"+action, token, body)
}
func TestAdminUsersDirectoryAuthorizationAndRedaction(t *testing.T) {
	app, admin, member, player := adminUsersFixture(t)
	for _, test := range []struct {
		token string
		code  int
	}{{"", 401}, {member, 403}, {admin, 200}} {
		r := request(app, "GET", "/api/admin/users", test.token, nil)
		if r.Code != test.code {
			t.Fatalf("directory %d: %s", r.Code, r.Body.String())
		}
	}
	result := request(app, "GET", "/api/admin/users?q=JUNIPER&kind=registered", admin, nil)
	var directory struct {
		Users []map[string]any
		Total int
	}
	if json.Unmarshal(result.Body.Bytes(), &directory) != nil || directory.Total != 1 || directory.Users[0]["id"] != player.ID {
		t.Fatalf("search %s", result.Body.String())
	}
	for _, path := range []string{"/api/admin/users", "/api/admin/users/" + player.ID} {
		r := request(app, "GET", path, admin, nil)
		for _, secret := range []string{"passwordHash", "pbkdf2", "actorSession", "\"sessions\"", "\"hash\""} {
			if strings.Contains(r.Body.String(), secret) {
				t.Fatalf("secret %q exposed", secret)
			}
		}
	}
	if r := request(app, "GET", "/api/admin/users?offset=-1", admin, nil); r.Code != 400 {
		t.Fatal(r.Body.String())
	}
	if r := request(app, "GET", "/api/admin/users/missing", admin, nil); r.Code != 404 {
		t.Fatal(r.Body.String())
	}
	if r := request(app, "POST", "/api/admin/users/"+player.ID+"/rename", admin, map[string]string{"name": "New Name"}); r.Code != 400 {
		t.Fatal("reason was not required")
	}
	owner, _ := app.store.Get(context.Background(), tokenHash(admin))
	if r := adminAction(t, app, admin, owner.Player.ID, "impersonate", nil); r.Code != 403 {
		t.Fatal("admin impersonation allowed")
	}
}
func TestAdminUsersResetPasswordSingleUseRevokesEverySession(t *testing.T) {
	app, admin, member, player := adminUsersFixture(t)
	second, _ := randomID(32)
	if err := app.store.AddSession(context.Background(), tokenHash(second), player.ID); err != nil {
		t.Fatal(err)
	}
	var reset struct{ ResetPath string }
	result := adminAction(t, app, admin, player.ID, "reset-password", nil)
	if result.Code != 200 || json.Unmarshal(result.Body.Bytes(), &reset) != nil {
		t.Fatal(result.Body.String())
	}
	link, _ := url.Parse(reset.ResetPath)
	params, _ := url.ParseQuery(link.Fragment)
	if _, err := app.store.Get(context.Background(), tokenHash(member)); err != nil {
		t.Fatal("issuing link revoked session")
	}
	payload := map[string]string{"accountId": player.ID, "token": params.Get("token"), "password": "new secret lantern password"}
	completed := request(app, "POST", "/api/account/reset-password", "", payload)
	if completed.Code != 200 {
		t.Fatal(completed.Body.String())
	}
	for _, token := range []string{member, second} {
		if r := request(app, "POST", "/api/session", token, map[string]any{}); r.Code != 401 {
			t.Fatalf("old session still valid: %d", r.Code)
		}
	}
	if r := request(app, "POST", "/api/account/reset-password", "", payload); r.Code != 400 {
		t.Fatal("reset link reused")
	}
	if r := request(app, "POST", "/api/account/login", "", map[string]string{"email": "juniper@example.com", "password": "original lantern password"}); r.Code != 401 {
		t.Fatal("old password accepted")
	}
	if r := request(app, "POST", "/api/account/login", "", map[string]string{"email": "juniper@example.com", "password": payload["password"]}); r.Code != 200 {
		t.Fatal(r.Body.String())
	}
	account, _ := app.store.GetAccountByID(context.Background(), player.ID)
	if len(account.Support.Audit) != 2 || account.Support.Reset.Hash != "" || !verifyPassword(payload["password"], account.PasswordHash) {
		t.Fatal("reset not persisted with audit")
	}
}
func TestAdminUsersResetExpiryReplacementAndCredentialChange(t *testing.T) {
	app, admin, member, player := adminUsersFixture(t)
	now := time.Now().UTC()
	app.now = func() time.Time { return now }
	issue := func() map[string]string {
		r := adminAction(t, app, admin, player.ID, "reset-password", nil)
		var result struct{ ResetPath string }
		json.Unmarshal(r.Body.Bytes(), &result)
		u, _ := url.Parse(result.ResetPath)
		q, _ := url.ParseQuery(u.Fragment)
		return map[string]string{"accountId": player.ID, "token": q.Get("token"), "password": "replacement password"}
	}
	first := issue()
	second := issue()
	if r := request(app, "POST", "/api/account/reset-password", "", first); r.Code != 400 {
		t.Fatal("older reset link accepted")
	}
	now = now.Add(time.Hour)
	if r := request(app, "POST", "/api/account/reset-password", "", second); r.Code != 400 {
		t.Fatal("expired reset accepted")
	}
	third := issue()
	r := request(app, "POST", "/api/account/credentials", member, map[string]string{"currentPassword": "original lantern password", "newPassword": "a manually changed password"})
	if r.Code != 200 {
		t.Fatal(r.Body.String())
	}
	if r := request(app, "POST", "/api/account/reset-password", "", third); r.Code != 400 {
		t.Fatal("link survived credential change")
	}
}
func TestAdminUsersSupportSessionsAreScopedExpiringAndRevocable(t *testing.T) {
	app, admin, member, player := adminUsersFixture(t)
	now := time.Now().UTC()
	app.now = func() time.Time { return now }
	issue := func() string {
		r := adminAction(t, app, admin, player.ID, "impersonate", nil)
		var result struct{ Token string }
		if r.Code != 200 || json.Unmarshal(r.Body.Bytes(), &result) != nil {
			t.Fatal(r.Body.String())
		}
		return result.Token
	}
	support := issue()
	if r := request(app, "POST", "/api/session", support, map[string]any{}); r.Code != 200 || !strings.Contains(r.Body.String(), player.ID) {
		t.Fatal(r.Body.String())
	}
	for _, path := range []string{"/api/admin/users", "/api/billing/portal", "/api/account/credentials", "/api/account/register", "/api/account/login", "/api/access/reset"} {
		method := "POST"
		if path == "/api/admin/users" {
			method = "GET"
		}
		r := request(app, method, path, support, map[string]any{})
		if r.Code != 403 {
			t.Fatalf("support action %s returned %d", path, r.Code)
		}
	}
	if r := request(app, "POST", "/api/session", member, map[string]any{}); r.Code != 200 {
		t.Fatal("user session replaced")
	}
	now = now.Add(30 * time.Minute)
	if r := request(app, "POST", "/api/session", support, map[string]any{}); r.Code != 401 {
		t.Fatal("expired support session accepted")
	}
	support = issue()
	if r := adminAction(t, app, admin, player.ID, "revoke-sessions", nil); r.Code != 200 {
		t.Fatal(r.Body.String())
	}
	if r := request(app, "POST", "/api/session", support, map[string]any{}); r.Code != 401 {
		t.Fatal("revoked support session accepted")
	}
	support = issue()
	if err := app.store.DeleteSession(context.Background(), tokenHash(admin)); err != nil {
		t.Fatal(err)
	}
	if r := request(app, "POST", "/api/session", support, map[string]any{}); r.Code != 401 {
		t.Fatal("support session outlived parent admin login")
	}
}
func TestAdminUsersGrantDoesNotOverwriteBillingOrProgress(t *testing.T) {
	app, admin, member, player := adminUsersFixture(t)
	app.billing = &CreemBilling{}
	now := time.Now().UTC()
	app.now = func() time.Time { return now }
	app.store.UpdateAccount(context.Background(), tokenHash(member), func(account *Account) error {
		account.Access.PlayedNanoseconds = int64(trialPlayLimit)
		account.Progress.XP = 123
		account.Billing.CustomerID = "preserved-customer"
		return nil
	})
	if r := adminAction(t, app, admin, player.ID, "grant-access", map[string]any{"days": 7}); r.Code != 200 {
		t.Fatal(r.Body.String())
	}
	account, _ := app.store.GetAccountByID(context.Background(), player.ID)
	if a := app.accessState(account, now); a.Phase != "paid" || a.Plan != "complimentary" {
		t.Fatalf("grant ineffective: %+v", a)
	}
	if account.Progress.XP != 123 || account.Billing.CustomerID != "preserved-customer" || !account.Analytics.PaidAt.IsZero() {
		t.Fatal("grant altered billing/progress")
	}
	if a := app.accessState(account, now.Add(7*24*time.Hour)); a.Phase != "payment_required" {
		t.Fatal("grant did not expire")
	}
	if r := adminAction(t, app, admin, player.ID, "revoke-grant", nil); r.Code != 200 {
		t.Fatal(r.Body.String())
	}
	account, _ = app.store.GetAccountByID(context.Background(), player.ID)
	if app.accessState(account, now).Phase != "payment_required" {
		t.Fatal("grant not revoked")
	}
}
func TestAdminUsersManageAccountRollsBackAndSurvivesRestart(t *testing.T) {
	file := filepath.Join(t.TempDir(), "state.json")
	store, err := NewJSONStore(file)
	if err != nil {
		t.Fatal(err)
	}
	account := Account{Player: Player{ID: "member", Name: "Juniper"}, Progress: newProgress()}
	if err = store.Create(context.Background(), "session", account); err != nil {
		t.Fatal(err)
	}
	_, _, err = store.ManageAccount(context.Background(), "member", false, "support", func(a *Account) error {
		a.Support.Grant.Lifetime = true
		appendAdminAudit(a, account, "grant-access", "test grant", time.Now())
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	restarted, err := NewJSONStore(file)
	if err != nil {
		t.Fatal(err)
	}
	saved, err := restarted.Get(context.Background(), "support")
	if err != nil || !saved.Support.Grant.Lifetime || len(saved.Support.Audit) != 1 {
		t.Fatal("support state lost")
	}
	store.path = filepath.Join(file, "impossible.json")
	if _, _, err = store.ManageAccount(context.Background(), "member", true, "", func(a *Account) error { a.PasswordHash = "replacement"; return nil }); err == nil {
		t.Fatal("expected persistence failure")
	}
	saved, err = store.Get(context.Background(), "session")
	if err != nil || saved.PasswordHash != "" {
		t.Fatal("failed operation revoked or changed account")
	}
}
func TestAdminUsersScheduledCancellationUsesVerifiedSubscription(t *testing.T) {
	app, admin, _, player := adminUsersFixture(t)
	now := time.Now().UTC()
	app.now = func() time.Time { return now }
	fixture := newCreemFixture(player.ID, "monthly", now)
	canceled := 0
	app.billing = testCreem(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/v1/subscriptions/subscription/cancel" {
			var body map[string]string
			json.NewDecoder(r.Body).Decode(&body)
			if r.Method != "POST" || body["mode"] != "scheduled" || body["onExecute"] != "cancel" {
				t.Errorf("unsafe cancellation: %s %+v", r.Method, body)
			}
			canceled++
			fixture.subscription.Status = "scheduled_cancel"
			writeJSON(w, 200, fixture.subscription)
			return
		}
		fixture.serve(w, r)
	}))
	app.store.UpdateAccountByID(context.Background(), player.ID, func(a *Account) error { a.Billing = fixture.state(); return nil })
	for range 2 {
		if r := adminAction(t, app, admin, player.ID, "cancel-subscription", nil); r.Code != 200 {
			t.Fatal(r.Body.String())
		}
	}
	account, _ := app.store.GetAccountByID(context.Background(), player.ID)
	if canceled != 1 || account.Billing.SubscriptionStatus != "scheduled_cancel" || !app.hasPaidAccess(account, now) {
		t.Fatalf("cancellation lost paid access or duplicated: %+v", account.Billing)
	}
}

func TestPostgresAdminUserManagement(t *testing.T) {
	databaseURL := os.Getenv("TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("set TEST_DATABASE_URL to a disposable PostgreSQL database")
	}
	ctx := context.Background()
	store, err := NewPGStore(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	app := NewApp(store, testCurriculum(), nil, 10)
	suffix, _ := randomID(8)
	adminEmail := "admin-" + suffix + "@example.com"
	app.adminEmails = map[string]bool{adminEmail: true}
	admin, owner := createSession(t, app, "Support Owner")
	member, player := createSession(t, app, "Support Member")
	t.Cleanup(func() {
		for _, id := range []string{owner.ID, player.ID} {
			store.pool.Exec(ctx, "DELETE FROM learning_events WHERE account_id=$1", id)
			store.pool.Exec(ctx, "DELETE FROM sessions WHERE account_id=$1", id)
			store.pool.Exec(ctx, "DELETE FROM accounts WHERE id=$1", id)
		}
		app.Close()
	})
	if err = store.SetCredentials(ctx, tokenHash(admin), adminEmail, "test-hash"); err != nil {
		t.Fatal(err)
	}
	if err = store.SetCredentials(ctx, tokenHash(member), "member-"+suffix+"@example.com", "test-hash"); err != nil {
		t.Fatal(err)
	}
	directory, total, err := store.ListAdminAccounts(ctx, strings.ToLower(suffix), "registered", 0, 30)
	if err != nil || total != 2 || len(directory) != 2 {
		t.Fatalf("directory query: total=%d error=%v", total, err)
	}
	if r := adminAction(t, app, admin, player.ID, "grant-access", map[string]any{"days": 30}); r.Code != 200 {
		t.Fatal(r.Body.String())
	}
	r := adminAction(t, app, admin, player.ID, "impersonate", nil)
	var support struct{ Token string }
	if r.Code != 200 || json.Unmarshal(r.Body.Bytes(), &support) != nil {
		t.Fatal(r.Body.String())
	}
	if r = adminAction(t, app, admin, player.ID, "revoke-sessions", nil); r.Code != 200 {
		t.Fatal(r.Body.String())
	}
	for _, token := range []string{member, support.Token} {
		if _, err = store.Get(ctx, tokenHash(token)); !errors.Is(err, ErrUnauthorized) {
			t.Fatal("session survived revocation")
		}
	}
	account, err := store.GetAccountByID(ctx, player.ID)
	if err != nil || len(account.Support.Audit) != 3 || !hasSupportAccess(account, time.Now()) {
		t.Fatalf("transaction lost account state: %v", err)
	}
}

func TestAdminUsersSupportSessionWorksAcrossCourses(t *testing.T) {
	app := contentTestApp(t)
	app.adminEmails = map[string]bool{"admin@example.com": true}
	admin, _ := createSession(t, app, "Owner")
	member, player := createSession(t, app, "Learner")
	if err := app.store.SetCredentials(context.Background(), tokenHash(admin), "admin@example.com", "test-hash"); err != nil {
		t.Fatal(err)
	}
	english := testContentID(t, app, "course", "english")
	if _, err := app.store.UpdateAccountByID(context.Background(), player.ID, func(a *Account) error { a.ActiveCourseID = english; return nil }); err != nil {
		t.Fatal(err)
	}
	r := adminAction(t, app, admin, player.ID, "impersonate", nil)
	var result struct{ Token string }
	if r.Code != 200 || json.Unmarshal(r.Body.Bytes(), &result) != nil {
		t.Fatal(r.Body.String())
	}
	scoped := *app
	adapter := *app.canonical
	adapter.expectedCourse = english
	scoped.store = &adapter
	account, err := scoped.store.Get(context.Background(), tokenHash(result.Token))
	if err != nil {
		t.Fatal(err)
	}
	if err = scoped.validateSupportSession(context.Background(), account, tokenHash(result.Token)); err != nil {
		t.Fatalf("admin's different course blocked support session: %v", err)
	}
	if _, err = app.store.Get(context.Background(), tokenHash(member)); err != nil {
		t.Fatal("member session lost")
	}
}
