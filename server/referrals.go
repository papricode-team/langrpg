package main

import (
	"context"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
)

// The public invite code is the existing opaque player ID, never a session token.
// Enabled records that this registered player issued an invite during free play.
type ReferralState struct {
	Enabled           bool   `json:"enabled,omitempty"`
	InvitedBy         string `json:"invitedBy,omitempty"`
	SuccessfulSignups int64  `json:"successfulSignups,omitempty"`
	ResetSignups      int64  `json:"resetSignups,omitempty"`
}

var referralCodePattern = regexp.MustCompile(`^[A-Za-z0-9_-]{8,64}$`)

func validReferralCode(code string) string {
	if referralCodePattern.MatchString(code) {
		return code
	}
	return ""
}

func referralBonus(account Account) time.Duration {
	return time.Duration(referralSignups(account)) * referralPlayBonus
}

func referralSignups(account Account) int64 {
	total := min(max(0, account.Referrals.SuccessfulSignups), int64(maxReferralSignups))
	return total - min(max(0, account.Referrals.ResetSignups), total)
}

// Called only inside the store's atomic registration transaction. Existing
// accounts and duplicate signup requests never reach this operation.
func creditReferral(account, inviter *Account, email string, now time.Time) bool {
	if inviter == nil || !inviter.Referrals.Enabled || inviter.Email == "" || inviter.Player.ID == account.Player.ID || strings.EqualFold(inviter.Email, email) || account.Referrals.InvitedBy != "" {
		return false
	}
	// Settle against the OLD allowance so waiting at the paywall is not charged
	// retroactively when the reward reopens the trial.
	settlePlay(inviter, now)
	inviter.Referrals.SuccessfulSignups = min(min(max(0, inviter.Referrals.SuccessfulSignups), int64(maxReferralSignups))+1, int64(maxReferralSignups))
	account.Referrals.InvitedBy = inviter.Player.ID
	return true
}

func (a *App) referralLink(w http.ResponseWriter, r *http.Request) {
	hash, err := bearer(r)
	if err != nil {
		apiFailure(w, err)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	u, err := url.Parse(strings.TrimRight(env("PUBLIC_URL", "https://glotworld.com"), "/"))
	if err != nil || u.Host == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" || (u.Scheme != "https" && !(u.Scheme == "http" && (u.Hostname() == "localhost" || u.Hostname() == "127.0.0.1"))) {
		writeError(w, 503, "invite links are not configured yet")
		return
	}
	account, err := a.store.UpdateAccount(ctx, hash, func(account *Account) error {
		settlePlay(account, a.now().UTC())
		if account.Email == "" {
			return &APIError{403, "sign up before inviting a friend"}
		}
		if a.accessState(*account, a.now().UTC()).Phase != "trial" && !account.Referrals.Enabled {
			return &APIError{403, "invite a friend during your free trial"}
		}
		account.Referrals.Enabled = true
		return nil
	})
	if err != nil {
		apiFailure(w, err)
		return
	}
	u.Path = strings.TrimRight(u.Path, "/") + "/"
	u.RawQuery = url.Values{"ref": {account.Player.ID}}.Encode()
	writeJSON(w, 200, map[string]any{"url": u.String(), "bonusMinutes": 90, "successfulSignups": account.Referrals.SuccessfulSignups, "access": a.accessState(account, a.now().UTC())})
}
