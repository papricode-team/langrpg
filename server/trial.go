package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"
)

const (
	guestPlayLimit     = 5 * time.Minute
	trialPlayLimit     = 15 * time.Minute
	referralPlayBonus  = 90 * time.Minute
	maxReferralSignups = (time.Duration(1<<63-1) - trialPlayLimit) / referralPlayBonus
	playLease          = 30 * time.Second
)

// PlayAccess is separate from learning intake: client-supplied seconds, story
// saves and idempotent learning receipts can never grant more free play.
// The account-wide lease prevents reconnects or another tab resetting time.
type PlayAccess struct {
	ResetTrial        bool                 `json:"resetTrial,omitempty"`
	Generation        int64                `json:"generation,omitempty"`
	PlayedNanoseconds int64                `json:"playedNanoseconds,omitempty"`
	ActiveSince       time.Time            `json:"activeSince,omitempty"`
	ActiveUntil       time.Time            `json:"activeUntil,omitempty"`
	SessionLeases     map[string]time.Time `json:"sessionLeases,omitempty"`
}

type AccessStatus struct {
	Phase                string `json:"phase"`
	RemainingSeconds     int    `json:"remainingSeconds"`
	PlayedSeconds        int    `json:"playedSeconds"`
	Registered           bool   `json:"registered"`
	Plan                 string `json:"plan,omitempty"`
	BillingAvailable     bool   `json:"billingAvailable"`
	ReferralBonusSeconds int    `json:"referralBonusSeconds,omitempty"`
	ReferralSignups      int64  `json:"referralSignups,omitempty"`
}

func playLimit(account Account) time.Duration {
	if account.Email != "" {
		return trialPlayLimit + referralBonus(account)
	}
	// Every explicit restart receives fifteen minutes, including guest restarts.
	if account.Access.ResetTrial || account.ActiveCourseID == "" && account.Access.Generation > 0 {
		return trialPlayLimit
	}
	return guestPlayLimit
}

func settlePlay(account *Account, now time.Time) {
	clock := &account.Access
	clock.PlayedNanoseconds = max(0, clock.PlayedNanoseconds)
	if clock.ActiveSince.IsZero() {
		return
	}
	until := minTime(now, clock.ActiveUntil)
	if until.After(clock.ActiveSince) {
		clock.PlayedNanoseconds = min(int64(playLimit(*account)), clock.PlayedNanoseconds+int64(until.Sub(clock.ActiveSince)))
		clock.ActiveSince = until.UTC()
	}
	if !now.Before(clock.ActiveUntil) || clock.PlayedNanoseconds >= int64(playLimit(*account)) {
		clock.ActiveSince, clock.ActiveUntil = time.Time{}, time.Time{}
	}
}

func minTime(left, right time.Time) time.Time {
	if left.Before(right) {
		return left
	}
	return right
}

func (a *App) accessState(account Account, now time.Time) AccessStatus {
	if a.billing == nil {
		return AccessStatus{Phase: "free", Registered: account.Email != "", PlayedSeconds: int(max(0, account.Access.PlayedNanoseconds) / int64(time.Second))}
	}
	settlePlay(&account, now)
	status := AccessStatus{Registered: account.Email != "", PlayedSeconds: int(account.Access.PlayedNanoseconds / int64(time.Second)), BillingAvailable: a.billingAvailable()}
	if hasSupportAccess(account, now) {
		status.Phase, status.Plan = "paid", "complimentary"
		return status
	}
	if a.hasPaidAccess(account, now) {
		status.Phase, status.Plan = "paid", account.Billing.Plan
		return status
	}
	remaining := max(int64(0), int64(playLimit(account))-account.Access.PlayedNanoseconds)
	status.RemainingSeconds = int((remaining + int64(time.Second) - 1) / int64(time.Second))
	if status.Registered {
		status.ReferralBonusSeconds = int(referralBonus(account) / time.Second)
		status.ReferralSignups = referralSignups(account)
		status.Phase = "trial"
		if remaining == 0 {
			status.Phase = "payment_required"
		}
	} else {
		status.Phase = "guest"
		if remaining == 0 {
			status.Phase = "login_required"
		}
	}
	return status
}

// touchAccess settles server wall time atomically before renewing a lease.
// nil only reads/settles; false pauses unless a world socket is still playing.
func (a *App) touchAccess(ctx context.Context, hash string, active *bool) (Account, error) {
	now := a.now().UTC()
	return a.store.UpdateAccount(ctx, hash, func(account *Account) error {
		if a.content != nil {
			a.saveCourseLocation(account)
		}
		if err := checkAccessGeneration(ctx, *account); err != nil {
			return err
		}
		if a.billing == nil || a.hasPaidAccess(*account, now) || hasSupportAccess(*account, now) {
			account.Access.ActiveSince, account.Access.ActiveUntil = time.Time{}, time.Time{}
			account.Access.SessionLeases = nil
			return nil
		}
		settlePlay(account, now)
		if account.Access.PlayedNanoseconds >= int64(playLimit(*account)) {
			account.Access.SessionLeases = nil
			return nil
		}
		leases := account.Access.SessionLeases
		for session, until := range leases {
			if !now.Before(until) {
				delete(leases, session)
			}
		}
		// Each session owns its pause signal. A background tab cannot stop a
		// second tab/device, even when sockets are on different server instances.
		worldLease := "world:" + a.leaseOwner + ":" + hash
		if a.world.IsSessionConnected(account.Player.ID, hash) {
			if leases == nil {
				leases = map[string]time.Time{}
			}
			leases[worldLease] = now.Add(playLease)
		} else if active != nil && !*active {
			delete(leases, worldLease)
		}
		if active != nil && *active {
			if leases == nil {
				leases = map[string]time.Time{}
			}
			leases[hash] = now.Add(playLease)
		} else if active != nil {
			delete(leases, hash)
		}
		var until time.Time
		for _, lease := range leases {
			if lease.After(until) {
				until = lease
			}
		}
		account.Access.SessionLeases = leases
		account.Access.ActiveUntil = until
		if until.IsZero() {
			account.Access.ActiveSince = time.Time{}
		} else if account.Access.ActiveSince.IsZero() {
			account.Access.ActiveSince = now
		}
		return nil
	})
}

type AccessDeniedError struct{ Access AccessStatus }

func (e *AccessDeniedError) Error() string { return e.Access.Phase }

type accessGenerationKey struct{}

// activeCourseKey carries the active course of the account that the access
// middleware already loaded for this request.
type activeCourseKey struct{}

func checkAccessGeneration(ctx context.Context, account Account) error {
	if generation, ok := ctx.Value(accessGenerationKey{}).(int64); ok && generation != account.Access.Generation {
		return &APIError{409, "progress was reset; reload the game"}
	}
	return nil
}

// Recheck while the store holds the account row lock, including each entry of a
// queued batch. Access cannot expire between middleware and a progress write.
func (a *App) mutate(ctx context.Context, hash, key string, request json.RawMessage, fn func(*Account) (Receipt, error)) (Account, Receipt, bool, error) {
	if ctx.Value(accessGenerationKey{}) == nil {
		account, err := a.store.Get(ctx, hash)
		if err != nil {
			return Account{}, Receipt{}, false, err
		}
		ctx = context.WithValue(ctx, accessGenerationKey{}, account.Access.Generation)
	}
	var completedQuests, completedUnits []string
	account, receipt, duplicate, err := a.store.Mutate(ctx, hash, key, request, func(account *Account) (Receipt, error) {
		if err := checkAccessGeneration(ctx, *account); err != nil {
			return Receipt{}, err
		}
		now := a.now().UTC()
		if status := a.accessState(*account, now); accessBlocked(status) {
			return Receipt{}, &AccessDeniedError{Access: status}
		}
		if a.billing != nil && !a.hasPaidAccess(*account, now) && !hasSupportAccess(*account, now) {
			settlePlay(account, now)
		}
		beforeQuests := append([]string(nil), account.Progress.CompletedQuestIDs...)
		beforeUnits := append([]string(nil), account.Progress.CompletedUnitIDs...)
		receipt, err := fn(account)
		if err == nil {
			if strings.HasPrefix(key, "quest:") || strings.HasPrefix(key, "story:") {
				for _, id := range account.Progress.CompletedQuestIDs {
					if !contains(beforeQuests, id) {
						completedQuests = append(completedQuests, id)
					}
				}
			}
			if strings.HasPrefix(key, "unit:") {
				for _, id := range account.Progress.CompletedUnitIDs {
					if !contains(beforeUnits, id) {
						completedUnits = append(completedUnits, id)
					}
				}
			}
		}
		if err == nil && receipt.Correct != nil && account.Analytics.ActivatedAt.IsZero() {
			account.Analytics.ActivatedAt = now
		}
		if err == nil {
			if status := a.accessState(*account, a.now().UTC()); accessBlocked(status) {
				return Receipt{}, &AccessDeniedError{Access: status}
			}
		}
		return receipt, err
	})
	if err == nil {
		if err := checkAccessGeneration(ctx, account); err != nil {
			return Account{}, Receipt{}, false, err
		}
		if status := a.accessState(account, a.now().UTC()); accessBlocked(status) {
			return Account{}, Receipt{}, false, &AccessDeniedError{Access: status}
		}
	}
	if err == nil && !duplicate {
		a.recordLearningAnalytics(ctx, account, key, request, receipt)
		for _, id := range completedQuests {
			a.recordAnalytics(ctx, account, AnalyticsEvent{ID: fmt.Sprintf("quest:%s:%s:%d:%s", account.Player.ID, account.ActiveCourseID, account.Access.Generation, id), Name: "quest_completed"})
		}
		for _, id := range completedUnits {
			a.recordAnalytics(ctx, account, AnalyticsEvent{ID: fmt.Sprintf("unit:%s:%s:%d:%s", account.Player.ID, account.ActiveCourseID, account.Access.Generation, id), Name: "unit_completed"})
		}
	}
	return account, receipt, duplicate, err
}

func accessBlocked(status AccessStatus) bool {
	return status.Phase == "login_required" || status.Phase == "payment_required"
}

func writeAccessBlocked(w http.ResponseWriter, status AccessStatus) {
	code, message := http.StatusForbidden, "sign in or create an account to keep your progress, or reset the game for another 15 free minutes"
	if status.Phase == "payment_required" {
		code, message = http.StatusPaymentRequired, "subscribe to keep your progress, or reset the game for another 15 free minutes"
	}
	writeJSON(w, code, map[string]any{"error": message, "access": status})
}

// Authentication, profile, access and billing remain available at a wall.
// Every learning endpoint is protected, including reads and receipt replays.
func (a *App) enforceGameAccess(w http.ResponseWriter, r *http.Request) bool {
	path := r.URL.Path
	contentRead := strings.HasPrefix(path, "/api/content/") && path != "/api/content/courses"
	if contentRead {
		path = "/api/progress"
	}
	switch path {
	case "/api/progress", "/api/attempt", "/api/retrievals", "/api/exposure", "/api/intake/heartbeat", "/api/quest/complete", "/api/course/complete", "/api/activity/complete", "/api/story", "/api/story/transition", "/api/story/inspect", "/api/story/save", "/api/story/load", "/api/story/sleep", "/api/story/cinematic", "/api/expedition/answer", "/api/expedition/plan":
	default:
		return true
	}
	hash, err := bearer(r)
	if err != nil {
		apiFailure(w, err)
		return false
	}
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()
	var active *bool
	if r.Method == http.MethodPost && path != "/api/intake/heartbeat" && path != "/api/attempt" {
		playing := true
		active = &playing
	}
	var account Account
	if path == "/api/attempt" {
		// Answer previews have an established read-only contract. Graded attempts
		// activate the clock after parsing; both paths still enforce the wall.
		account, err = a.store.Get(ctx, hash)
	} else {
		account, err = a.touchAccess(ctx, hash, active)
	}
	if err != nil {
		apiFailure(w, err)
		return false
	}
	if account.Billing.Plan != "" && !a.hasPaidAccess(account, a.now().UTC()) {
		account = a.refreshAccessBilling(ctx, account)
	}
	ctxWithAccount := context.WithValue(r.Context(), accessGenerationKey{}, account.Access.Generation)
	// withCourse scopes the request to this same account's course without a
	// second storage read.
	ctxWithAccount = context.WithValue(ctxWithAccount, activeCourseKey{}, account.ActiveCourseID)
	*r = *r.WithContext(ctxWithAccount)
	status := a.accessState(account, a.now().UTC())
	if accessBlocked(status) {
		writeAccessBlocked(w, status)
		return false
	}
	return true
}

func (a *App) refreshAccessBilling(ctx context.Context, account Account) Account {
	if account.Email != "" && a.billingAvailable() {
		updated, err := a.refreshBilling(ctx, account, false)
		if err == nil {
			return updated
		}
		slog.Warn("billing refresh failed", "accountId", account.Player.ID, "error", err)
	}
	return account
}

// allowSession applies a per-session limit only after the session is known to
// exist, so unauthenticated floods cannot fill the limiter with junk keys.
func (a *App) allowSession(w http.ResponseWriter, r *http.Request, hash, prefix string, limit int, message string) bool {
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()
	if _, err := a.store.Get(ctx, hash); err != nil {
		apiFailure(w, err)
		return false
	}
	if !a.allow(prefix+hash, limit) {
		writeError(w, 429, message)
		return false
	}
	return true
}

func (a *App) access(w http.ResponseWriter, r *http.Request) {
	hash, err := bearer(r)
	if err != nil {
		apiFailure(w, err)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	account, err := a.touchAccess(ctx, hash, nil)
	if err != nil {
		apiFailure(w, err)
		return
	}
	account = a.refreshAccessBilling(ctx, account)
	writeJSON(w, 200, map[string]any{"access": a.accessState(account, a.now().UTC())})
}

func (a *App) accessHeartbeat(w http.ResponseWriter, r *http.Request) {
	hash, err := bearer(r)
	if err != nil {
		apiFailure(w, err)
		return
	}
	if !a.allowSession(w, r, hash, "access:", 120, "too many play heartbeats; try again in a minute") {
		return
	}
	var input struct {
		Active bool `json:"active"`
	}
	if err = decodeJSON(w, r, &input); err != nil {
		apiFailure(w, err)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	account, err := a.touchAccess(ctx, hash, &input.Active)
	if err != nil {
		apiFailure(w, err)
		return
	}
	account = a.refreshAccessBilling(ctx, account)
	writeJSON(w, 200, map[string]any{"access": a.accessState(account, a.now().UTC())})
}

func (a *App) resetAccess(w http.ResponseWriter, r *http.Request) {
	hash, err := bearer(r)
	if err != nil {
		apiFailure(w, err)
		return
	}
	if !a.allowSession(w, r, hash, "reset:", 12, "too many resets; try again in a minute") {
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()
	account, err := a.store.ResetGame(ctx, hash)
	if err != nil {
		apiFailure(w, err)
		return
	}
	if a.content != nil {
		account, err = a.store.UpdateAccount(ctx, hash, func(account *Account) error {
			account.Player = courseStartingPlayer(account.Player, a.content.ByCourse[account.ActiveCourseID])
			return nil
		})
		if err != nil {
			apiFailure(w, err)
			return
		}
	}
	a.world.ResetPlayer(account.Player.ID)
	account, err = a.getAccount(ctx, hash)
	if err != nil {
		apiFailure(w, err)
		return
	}
	writeJSON(w, 200, a.sessionResponse(strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer "), account))
}

func resetGameProgress(account *Account) error {
	// A restart grants the advertised fresh fifteen minutes; past referral
	// rewards cannot be replayed. Attribution and already-issued links survive.
	account.Referrals.ResetSignups = account.Referrals.SuccessfulSignups
	revision := account.Progress.Revision
	generation := account.Access.Generation
	account.Progress = newProgress()
	account.Progress.Revision = revision + 1
	account.Access = PlayAccess{Generation: generation + 1, ResetTrial: true}
	account.CourseStates = nil
	account.StorySaves, account.RewardedQuestIDs, account.RewardedExpeditionIDs = nil, nil, nil
	spawn := mapSpawns[DefaultMapID]
	account.Player.MapID, account.Player.InteriorID = DefaultMapID, ""
	account.Player.X, account.Player.Y = spawn.X, spawn.Y
	return nil
}
