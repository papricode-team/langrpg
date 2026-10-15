package main

import (
	"context"
	"encoding/json"
	"errors"
	"glotworld/server/internal/billing"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"
)

func hasSupportAccess(account Account, now time.Time) bool {
	return account.Support.Grant.Lifetime || now.Before(account.Support.Grant.Until)
}
func appendAdminAudit(account *Account, actor Account, action, reason string, now time.Time) {
	account.Support.Audit = append(account.Support.Audit, AdminAuditEntry{At: now, ActorID: actor.Player.ID, ActorEmail: actor.Email, Action: action, Reason: reason})
	if len(account.Support.Audit) > 100 {
		account.Support.Audit = account.Support.Audit[len(account.Support.Audit)-100:]
	}
}

// Explicit projections keep credentials, token hashes and internal receipts off the wire.
func (a *App) adminUser(account Account, detail bool) map[string]any {
	user := map[string]any{"id": account.Player.ID, "name": account.Player.Name, "email": account.Email, "registered": account.Email != "", "admin": a.isAdmin(account), "createdAt": account.CreatedAt, "courseId": account.ActiveCourseID, "access": a.accessState(account, a.now().UTC()), "grant": account.Support.Grant,
		"billing": map[string]any{"plan": account.Billing.Plan, "customerId": account.Billing.CustomerID, "subscriptionId": account.Billing.SubscriptionID, "status": account.Billing.SubscriptionStatus, "paidUntil": account.Billing.PaidUntil, "verifiedAt": account.Billing.VerifiedAt}}
	if a.content != nil {
		if course, ok := a.content.ByCourse[account.ActiveCourseID]; ok {
			var title string
			if json.Unmarshal(course.Title, &title) != nil {
				var titles map[string]string
				_ = json.Unmarshal(course.Title, &titles)
				title = titles["en"]
			}
			if title == "" {
				title = course.Slug
			}
			user["courseName"] = title
		}
	}
	if detail {
		user["xp"] = account.Progress.XP
		user["audit"] = account.Support.Audit
		user["resetPending"] = account.Support.Reset.Hash != "" && a.now().Before(account.Support.Reset.ExpiresAt)
	}
	return user
}
func (a *App) listAdminUsers(w http.ResponseWriter, r *http.Request) {
	admin, ok := a.requireAdmin(w, r)
	if !ok {
		return
	}
	if !a.allow("admin-users-read:"+admin.Player.ID, 120) {
		writeError(w, 429, "too many directory requests; try again in a minute")
		return
	}
	query := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("q")))
	kind := r.URL.Query().Get("kind")
	offset, err := strconv.Atoi(r.URL.Query().Get("offset"))
	if r.URL.Query().Get("offset") == "" {
		offset = 0
		err = nil
	}
	if err != nil || offset < 0 || offset > 1000000 || len(query) > 254 || (kind != "" && kind != "registered" && kind != "guest") {
		writeError(w, 400, "invalid user search")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	accounts, total, err := a.store.ListAdminAccounts(ctx, query, kind, offset, 30)
	if err != nil {
		apiFailure(w, err)
		return
	}
	users := []map[string]any{}
	for _, account := range accounts {
		users = append(users, a.adminUser(account, false))
	}
	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, 200, map[string]any{"users": users, "total": total, "offset": offset, "limit": 30, "billingAvailable": a.billingAvailable()})
}
func (a *App) readAdminUser(w http.ResponseWriter, r *http.Request) {
	if _, ok := a.requireAdmin(w, r); !ok {
		return
	}
	account, err := a.store.GetAccountByID(r.Context(), r.PathValue("id"))
	if err != nil {
		adminUserFailure(w, err)
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, 200, map[string]any{"user": a.adminUser(account, true)})
}
func adminUserFailure(w http.ResponseWriter, err error) {
	if errors.Is(err, ErrUnauthorized) {
		writeError(w, 404, "user was not found")
	} else {
		apiFailure(w, err)
	}
}

func (a *App) manageAdminUser(w http.ResponseWriter, r *http.Request) {
	actor, ok := a.requireAdmin(w, r)
	if !ok {
		return
	}
	if !a.allow("admin-users-write:"+actor.Player.ID, 30) {
		writeError(w, 429, "too many account actions; try again in a minute")
		return
	}
	var input struct {
		Reason   string `json:"reason"`
		Name     string `json:"name"`
		Days     int    `json:"days"`
		Lifetime bool   `json:"lifetime"`
	}
	if err := decodeJSON(w, r, &input); err != nil {
		apiFailure(w, err)
		return
	}
	input.Reason = strings.TrimSpace(input.Reason)
	if utf8.RuneCountInString(input.Reason) < 3 || utf8.RuneCountInString(input.Reason) > 500 {
		writeError(w, 400, "add a reason between 3 and 500 characters")
		return
	}
	action := r.PathValue("action")
	id := r.PathValue("id")
	ctx, cancel := context.WithTimeout(r.Context(), 12*time.Second)
	defer cancel()
	target, err := a.store.GetAccountByID(ctx, id)
	if err != nil {
		adminUserFailure(w, err)
		return
	}
	if a.isAdmin(target) {
		writeError(w, 403, "administrator accounts are read-only here; use account settings for your own credentials")
		return
	}
	now := a.now().UTC()
	revoke := action == "revoke-sessions"
	sessionHash := ""
	response := map[string]any{}
	var change func(*Account) error
	// prepare runs outside the account lock (Creem calls) before each attempt.
	var prepare func() error
	switch action {
	case "rename":
		input.Name = strings.TrimSpace(input.Name)
		if !validName(input.Name) {
			writeError(w, 400, "name must contain 2–24 letters, numbers, spaces, apostrophes, dashes or underscores")
			return
		}
		change = func(account *Account) error {
			account.Player.Name = input.Name
			for id, state := range account.CourseStates {
				state.Player.Name = input.Name
				account.CourseStates[id] = state
			}
			return nil
		}
	case "grant-access":
		if target.Email == "" {
			writeError(w, 409, "the guest must register before receiving complimentary access")
			return
		}
		if !input.Lifetime && (input.Days < 1 || input.Days > 3650) {
			writeError(w, 400, "choose between 1 and 3650 days")
			return
		}
		change = func(account *Account) error {
			until := time.Time{}
			if !input.Lifetime {
				until = now.AddDate(0, 0, input.Days)
			}
			account.Support.Grant = SupportGrant{Lifetime: input.Lifetime, Until: until}
			return nil
		}
	case "revoke-grant":
		change = func(account *Account) error { account.Support.Grant = SupportGrant{}; return nil }
	case "reset-password":
		if target.Email == "" {
			writeError(w, 409, "guests do not have a password to reset")
			return
		}
		secret, e := randomID(32)
		if e != nil {
			apiFailure(w, e)
			return
		}
		expires := now.Add(time.Hour)
		change = func(account *Account) error {
			account.Support.Reset = PasswordReset{Hash: tokenHash(secret), ExpiresAt: expires}
			return nil
		}
		response["resetPath"] = "/reset-password.html#" + url.Values{"account": {id}, "token": {secret}}.Encode()
		response["expiresAt"] = expires
	case "revoke-sessions":
		if target.Email == "" {
			writeError(w, 409, "register this guest before revoking sessions, so they can sign back in")
			return
		}
		change = func(account *Account) error { account.Support.Reset = PasswordReset{}; return nil }
	case "impersonate":
		secret, e := randomID(32)
		if e != nil {
			apiFailure(w, e)
			return
		}
		token := "support_" + secret
		sessionHash = tokenHash(token)
		actorHash, _ := bearer(r)
		expires := now.Add(30 * time.Minute)
		change = func(account *Account) error {
			if account.Support.Sessions == nil {
				account.Support.Sessions = map[string]SupportSession{}
			}
			for hash, session := range account.Support.Sessions {
				if !now.Before(session.ExpiresAt) {
					delete(account.Support.Sessions, hash)
				}
			}
			if len(account.Support.Sessions) >= 10 {
				return &APIError{429, "too many active support sessions for this user"}
			}
			account.Support.Sessions[sessionHash] = SupportSession{ActorSession: actorHash, ExpiresAt: expires}
			return nil
		}
		response["token"] = token
		response["expiresAt"] = expires
	case "sync-billing", "cancel-subscription":
		if !a.billingAvailable() {
			writeError(w, 409, "Creem billing is not configured")
			return
		}
		// Creem is queried (and a cancellation issued) before the account row is
		// locked; the result is applied under the lock only if the purchase
		// ledger it was computed from is unchanged, otherwise it is recomputed.
		var base, snapshot billing.State
		cancelSubscription := action == "cancel-subscription"
		prepare = func() error {
			current, e := a.store.GetAccountByID(ctx, id)
			if e != nil {
				return e
			}
			base = current.Billing
			if snapshot, e = a.billing.Snapshot(ctx, id, base, now); e != nil {
				return e
			}
			if !cancelSubscription {
				return nil
			}
			if snapshot.SubscriptionID == "" {
				return &APIError{409, "no verified recurring subscription to cancel"}
			}
			if snapshot.SubscriptionStatus != "scheduled_cancel" && snapshot.SubscriptionStatus != "canceled" {
				// https://docs.creem.io/skills/creem-api/REFERENCE — keep the paid period.
				if e = a.billing.Request(ctx, "POST", "/v1/subscriptions/"+url.PathEscape(snapshot.SubscriptionID)+"/cancel", map[string]string{"mode": "scheduled", "onExecute": "cancel"}, nil); e != nil {
					return e
				}
				snapshot.SubscriptionStatus = "scheduled_cancel"
			}
			return nil
		}
		change = func(account *Account) error {
			if !billing.SameLedger(account.Billing, base) {
				return billing.ErrLedgerChanged
			}
			next := snapshot
			next.WebhookReceipts = account.Billing.WebhookReceipts
			account.Billing = next
			if a.hasPaidAccess(*account, now) && account.Analytics.PaidAt.IsZero() {
				account.Analytics.PaidAt = now
			}
			return nil
		}
	default:
		writeError(w, 404, "unknown admin action")
		return
	}
	var account Account
	var hashes []string
	for attempt := 0; ; attempt++ {
		if prepare != nil {
			if err = prepare(); err != nil {
				break
			}
		}
		account, hashes, err = a.store.ManageAccount(ctx, id, revoke, sessionHash, func(account *Account) error {
			if a.isAdmin(*account) {
				return &APIError{403, "administrator accounts are read-only here"}
			}
			if err := change(account); err != nil {
				return err
			}
			// Audit is written once, with the change that was actually applied.
			appendAdminAudit(account, actor, action, input.Reason, now)
			return nil
		})
		if !errors.Is(err, billing.ErrLedgerChanged) || attempt >= 2 {
			break
		}
	}
	if errors.Is(err, billing.ErrLedgerChanged) {
		writeError(w, 409, billing.ErrLedgerChanged.Error())
		return
	}
	if err != nil {
		adminUserFailure(w, err)
		return
	}
	for _, hash := range hashes {
		a.world.RevokeSession(hash)
	}
	if action == "rename" {
		a.world.UpdateProfile(account.Player)
	}
	response["user"] = a.adminUser(account, true)
	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, 200, response)
}

func (a *App) resetPassword(w http.ResponseWriter, r *http.Request) {
	if !a.allow("password-reset:"+a.clientIP(r), 10) {
		writeError(w, 429, "too many reset attempts; try again in a minute")
		return
	}
	var input struct {
		AccountID string `json:"accountId"`
		Token     string `json:"token"`
		Password  string `json:"password"`
	}
	if err := decodeJSON(w, r, &input); err != nil {
		apiFailure(w, err)
		return
	}
	if len(input.Token) != 43 || len(input.AccountID) > 64 {
		writeError(w, 400, "this reset link is invalid or expired")
		return
	}
	if n := utf8.RuneCountInString(input.Password); n < 10 || n > 128 {
		writeError(w, 400, "use a password with 10–128 characters")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	valid := func(account Account) bool {
		return !a.isAdmin(account) && account.Email != "" && account.Support.Reset.Hash == tokenHash(input.Token) && a.now().Before(account.Support.Reset.ExpiresAt)
	}
	account, err := a.store.GetAccountByID(ctx, input.AccountID)
	if err != nil || !valid(account) {
		writeError(w, 400, "this reset link is invalid or expired")
		return
	}
	encoded, err := hashPassword(input.Password)
	if err != nil {
		apiFailure(w, err)
		return
	}
	_, hashes, err := a.store.ManageAccount(ctx, input.AccountID, true, "", func(current *Account) error {
		if !valid(*current) {
			return &APIError{400, "this reset link is invalid or expired"}
		}
		current.PasswordHash = encoded
		current.Support.Reset = PasswordReset{}
		appendAdminAudit(current, *current, "password-reset-completed", "Account holder used the single-use reset link", a.now().UTC())
		return nil
	})
	if err != nil {
		apiFailure(w, err)
		return
	}
	for _, hash := range hashes {
		a.world.RevokeSession(hash)
	}
	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, 200, map[string]bool{"reset": true})
}

func (a *App) validateSupportSession(ctx context.Context, account Account, hash string) error {
	session, ok := account.Support.Sessions[hash]
	if !ok {
		return ErrUnauthorized
	}
	if !a.now().Before(session.ExpiresAt) || a.isAdmin(account) {
		return ErrUnauthorized
	}
	store := a.store
	if a.canonical != nil {
		store = a.canonical.Store
	}
	actor, err := store.Get(ctx, session.ActorSession)
	if err != nil {
		return err
	}
	if !a.isAdmin(actor) {
		return ErrUnauthorized
	}
	return nil
}
func (a *App) enforceSupportSession(w http.ResponseWriter, r *http.Request) bool {
	token := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
	if r.URL.Path == "/api/world" {
		token = r.URL.Query().Get("token")
	}
	if !strings.HasPrefix(token, "support_") {
		return true
	}
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()
	hash := tokenHash(token)
	account, err := a.store.Get(ctx, hash)
	if err == nil {
		err = a.validateSupportSession(ctx, account, hash)
	}
	if err != nil {
		a.world.RevokeSession(hash)
		apiFailure(w, err)
		return false
	}
	path := r.URL.Path
	if strings.HasPrefix(path, "/api/admin/") || strings.HasPrefix(path, "/api/billing/") || strings.HasPrefix(path, "/api/account/") && path != "/api/account/logout" || path == "/api/access/reset" || path == "/api/referral/link" {
		writeError(w, 403, "this action is unavailable during a login-as session; return to Admin first")
		return false
	}
	return true
}
