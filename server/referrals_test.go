package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/url"
	"os"
	"path/filepath"
	"reflect"
	"sync"
	"testing"
	"time"
)

func issueInvite(t *testing.T, app *App, token string) string {
	t.Helper()
	w := request(app, "POST", "/api/referral/link", token, nil)
	var result struct {
		URL string `json:"url"`
	}
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &result) != nil {
		t.Fatal(w.Code, w.Body.String())
	}
	u, err := url.Parse(result.URL)
	if err != nil || u.Scheme != "https" || u.Host != "glotworld.com" || u.Query().Get("ref") == "" {
		t.Fatal("invalid invite", result.URL, err)
	}
	return u.Query().Get("ref")
}

func TestReferralSignupExtendsInviterOnlyAndIsIdempotent(t *testing.T) {
	app := trialTestApp(t)
	inviterToken, inviter := createSession(t, app, "Inviter")
	if w := request(app, "POST", "/api/referral/link", inviterToken, nil); w.Code != 403 {
		t.Fatal("guest issued an invite", w.Code)
	}
	if err := app.store.SetCredentials(context.Background(), tokenHash(inviterToken), "inviter@example.com", "encoded"); err != nil {
		t.Fatal(err)
	}
	_, err := app.store.UpdateAccount(context.Background(), tokenHash(inviterToken), func(a *Account) error {
		a.Access.PlayedNanoseconds = int64(guestPlayLimit)
		a.Progress.XP = 123
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	code := issueInvite(t, app, inviterToken)
	if code != inviter.ID || code == inviterToken {
		t.Fatal("invite must use the public player ID, never the session token")
	}
	friendToken, _ := createSession(t, app, "Friend")
	input := map[string]string{"email": "friend@example.com", "password": "a long friend password", "referralCode": code}
	for i := 0; i < 2; i++ {
		if w := request(app, "POST", "/api/account/register", friendToken, input); w.Code != 200 {
			t.Fatal(w.Code, w.Body.String())
		}
	}
	credited, _ := app.store.Get(context.Background(), tokenHash(inviterToken))
	status := app.accessState(credited, app.now())
	if status.RemainingSeconds != 600+5400 || status.ReferralBonusSeconds != 5400 || status.ReferralSignups != 1 || credited.Progress.XP != 123 || !reflect.DeepEqual(credited.Player.Avatar, inviter.Avatar) {
		t.Fatal("incorrect bonus or changed progress", status)
	}
	friend, _ := app.store.Get(context.Background(), tokenHash(friendToken))
	if app.accessState(friend, app.now()).RemainingSeconds != 900 || friend.Referrals.InvitedBy != inviter.ID {
		t.Fatal("friend received the inviter's bonus or attribution was lost")
	}
	// Logging in and retrying signup for an existing account cannot add credit.
	if err := app.store.RegisterWithReferral(context.Background(), tokenHash(friendToken), "other@example.com", "encoded", code, app.now()); !errors.Is(err, ErrCredentialsConflict) {
		t.Fatal(err)
	}
	credited, _ = app.store.Get(context.Background(), tokenHash(inviterToken))
	if credited.Referrals.SuccessfulSignups != 1 {
		t.Fatal("duplicate signup awarded twice")
	}
}

func TestReferralAfterTrialReopensOnlyTheNewAllowance(t *testing.T) {
	app := trialTestApp(t)
	token, _ := createSession(t, app, "Expired inviter")
	app.store.SetCredentials(context.Background(), tokenHash(token), "expired@example.com", "encoded")
	code := issueInvite(t, app, token)
	now := app.now()
	app.store.UpdateAccount(context.Background(), tokenHash(token), func(a *Account) error {
		a.Access.PlayedNanoseconds = int64(trialPlayLimit - time.Second)
		a.Access.ActiveSince = now
		a.Access.ActiveUntil = now.Add(playLease)
		return nil
	})
	app.now = func() time.Time { return now.Add(time.Hour) }
	friend, _ := createSession(t, app, "Late friend")
	if err := app.store.RegisterWithReferral(context.Background(), tokenHash(friend), "late@example.com", "encoded", code, app.now()); err != nil {
		t.Fatal(err)
	}
	inviter, _ := app.store.Get(context.Background(), tokenHash(token))
	status := app.accessState(inviter, app.now())
	if status.Phase != "trial" || status.RemainingSeconds != 5400 || status.PlayedSeconds != 900 || !inviter.Access.ActiveSince.IsZero() {
		t.Fatal("waiting at the wall charged the bonus", status)
	}
	app.store.UpdateAccount(context.Background(), tokenHash(token), func(a *Account) error {
		a.Access.PlayedNanoseconds = int64(trialPlayLimit + referralPlayBonus)
		return nil
	})
	inviter, _ = app.store.Get(context.Background(), tokenHash(token))
	if app.accessState(inviter, app.now()).Phase != "payment_required" {
		t.Fatal("bonus failed to expire")
	}
}

func TestReferralInvalidUnissuedAndSelfLinksDoNotEarnCredit(t *testing.T) {
	for _, kind := range []string{"unknown", "unissued", "self"} {
		t.Run(kind, func(t *testing.T) {
			app := trialTestApp(t)
			inviterToken, inviter := createSession(t, app, "Inviter")
			app.store.SetCredentials(context.Background(), tokenHash(inviterToken), "inviter@example.com", "encoded")
			friendToken, friend := createSession(t, app, "Friend")
			code := inviter.ID
			if kind == "unknown" {
				code = "unknown_inviter_123"
			}
			if kind == "self" {
				code = friend.ID
				app.store.UpdateAccount(context.Background(), tokenHash(friendToken), func(a *Account) error { a.Referrals.Enabled = true; return nil })
			}
			if err := app.store.RegisterWithReferral(context.Background(), tokenHash(friendToken), "friend@example.com", "encoded", code, app.now()); err != nil {
				t.Fatal(err)
			}
			inviterAccount, _ := app.store.Get(context.Background(), tokenHash(inviterToken))
			friendAccount, _ := app.store.Get(context.Background(), tokenHash(friendToken))
			if inviterAccount.Referrals.SuccessfulSignups != 0 || friendAccount.Referrals.SuccessfulSignups != 0 || friendAccount.Referrals.InvitedBy != "" {
				t.Fatal("invalid referral credited")
			}
		})
	}
}

func TestReferralRegistrationJSONRollback(t *testing.T) {
	app := trialTestApp(t)
	store := app.store.(*JSONStore)
	token, _ := createSession(t, app, "Inviter")
	store.SetCredentials(context.Background(), tokenHash(token), "rollback-inviter@example.com", "encoded")
	code := issueInvite(t, app, token)
	friend, _ := createSession(t, app, "Friend")
	store.path = t.TempDir() // Renaming the saved file over a directory must fail.
	if err := store.RegisterWithReferral(context.Background(), tokenHash(friend), "rollback-friend@example.com", "encoded", code, app.now()); err == nil {
		t.Fatal("expected persistence failure")
	}
	i, _ := store.Get(context.Background(), tokenHash(token))
	f, _ := store.Get(context.Background(), tokenHash(friend))
	if i.Referrals.SuccessfulSignups != 0 || f.Email != "" || f.Referrals.InvitedBy != "" {
		t.Fatal("failed signup retained a credit or credentials")
	}
}

func TestReferralStoresConcurrentCreditsAndPersistence(t *testing.T) {
	for _, kind := range []string{"json", "postgres"} {
		t.Run(kind, func(t *testing.T) {
			ctx := context.Background()
			var store Store
			var err error
			path := filepath.Join(t.TempDir(), "state.json")
			if kind == "json" {
				store, err = NewJSONStore(path)
			} else {
				dsn := os.Getenv("TEST_DATABASE_URL")
				if dsn == "" {
					t.Skip("set TEST_DATABASE_URL for referral transaction checks")
				}
				store, err = NewPGStore(ctx, dsn)
			}
			if err != nil {
				t.Fatal(err)
			}
			app := NewApp(store, testCurriculum(), nil, 20)
			app.billing = testCreem(nil)
			var ids []string
			t.Cleanup(func() {
				if pg, ok := store.(*PGStore); ok {
					pg.pool.Exec(ctx, "DELETE FROM learning_events WHERE account_id=ANY($1::text[])", ids)
					pg.pool.Exec(ctx, "DELETE FROM sessions WHERE account_id=ANY($1::text[])", ids)
					pg.pool.Exec(ctx, "DELETE FROM accounts WHERE id=ANY($1::text[])", ids)
				}
				app.Close()
			})
			inviterToken, inviter := createSession(t, app, "Concurrent inviter")
			ids = append(ids, inviter.ID)
			store.SetCredentials(ctx, tokenHash(inviterToken), "inviter-"+inviter.ID+"@example.com", "encoded")
			code := issueInvite(t, app, inviterToken)
			const count = 8
			var wg sync.WaitGroup
			errs := make(chan error, count*2)
			for j := 0; j < count; j++ {
				token, p := createSession(t, app, "Friend")
				ids = append(ids, p.ID)
				for k := 0; k < 2; k++ {
					wg.Go(func() {
						errs <- store.RegisterWithReferral(ctx, tokenHash(token), p.ID+"@example.com", "encoded", code, app.now())
					})
				}
			}
			wg.Wait()
			close(errs)
			success := 0
			for e := range errs {
				if e == nil {
					success++
				} else if !errors.Is(e, ErrCredentialsConflict) {
					t.Fatal(e)
				}
			}
			credited, _ := store.Get(ctx, tokenHash(inviterToken))
			if success != count || credited.Referrals.SuccessfulSignups != count || playLimit(credited) != trialPlayLimit+count*referralPlayBonus {
				t.Fatal("lost or duplicated concurrent credit", success, credited.Referrals)
			}
			// A duplicate email must roll back both the new signup and inviter credit.
			extra, p := createSession(t, app, "Duplicate email")
			ids = append(ids, p.ID)
			if err := store.RegisterWithReferral(ctx, tokenHash(extra), ids[1]+"@example.com", "encoded", code, app.now()); !errors.Is(err, ErrCredentialsConflict) {
				t.Fatal(err)
			}
			extraAccount, _ := store.Get(ctx, tokenHash(extra))
			credited, _ = store.Get(ctx, tokenHash(inviterToken))
			if extraAccount.Email != "" || credited.Referrals.SuccessfulSignups != count {
				t.Fatal("duplicate email credited")
			}
			var reopened Store
			if kind == "json" {
				reopened, err = NewJSONStore(path)
			} else {
				reopened, err = NewPGStore(ctx, os.Getenv("TEST_DATABASE_URL"))
			}
			if err != nil {
				t.Fatal(err)
			}
			defer reopened.Close()
			restored, err := reopened.Get(ctx, tokenHash(inviterToken))
			if err != nil || restored.Referrals.SuccessfulSignups != count || app.accessState(restored, app.now()).RemainingSeconds != 900+count*5400 {
				t.Fatal("restart lost referral time", err, restored.Referrals)
			}
		})
	}
}

func TestReferralResetDiscardsOldBonusButPreservesInvites(t *testing.T) {
	app := trialTestApp(t)
	token, _ := createSession(t, app, "Reset inviter")
	if err := app.store.SetCredentials(context.Background(), tokenHash(token), "reset-inviter@example.com", "encoded"); err != nil {
		t.Fatal(err)
	}
	code := issueInvite(t, app, token)
	for i, email := range []string{"before-reset@example.com", "after-reset@example.com"} {
		friend, _ := createSession(t, app, "Friend")
		if err := app.store.RegisterWithReferral(context.Background(), tokenHash(friend), email, "encoded", code, app.now()); err != nil {
			t.Fatal(err)
		}
		if i == 0 {
			reset, err := app.store.ResetGame(context.Background(), tokenHash(token))
			if err != nil || app.accessState(reset, app.now()).RemainingSeconds != 900 || referralSignups(reset) != 0 || !reset.Referrals.Enabled {
				t.Fatal("reset replayed reward or disabled link", err, reset.Referrals)
			}
		}
	}
	account, err := app.store.Get(context.Background(), tokenHash(token))
	if err != nil || app.accessState(account, app.now()).RemainingSeconds != 6300 || referralSignups(account) != 1 {
		t.Fatal("new invite failed after reset", err, account.Referrals)
	}
}

func TestReferralBonusReopensGatedLearningContent(t *testing.T) {
	app := contentTestApp(t)
	app.billing = testCreem(nil)
	token, _ := createSession(t, app, "Content inviter")
	ctx := context.Background()
	if err := app.store.SetCredentials(ctx, tokenHash(token), "content-inviter@example.com", "encoded"); err != nil {
		t.Fatal(err)
	}
	code := issueInvite(t, app, token)
	if _, err := app.store.UpdateAccount(ctx, tokenHash(token), func(account *Account) error { account.Access.PlayedNanoseconds = int64(trialPlayLimit); return nil }); err != nil {
		t.Fatal(err)
	}
	if w := request(app, "GET", "/api/content/bootstrap", token, nil); w.Code != 402 {
		t.Fatal("expired account read learning content", w.Code, w.Body.String())
	}
	friend, _ := createSession(t, app, "Content friend")
	if err := app.store.RegisterWithReferral(ctx, tokenHash(friend), "content-friend@example.com", "encoded", code, app.now()); err != nil {
		t.Fatal(err)
	}
	if w := request(app, "GET", "/api/content/bootstrap", token, nil); w.Code != 200 {
		t.Fatal("bonus did not reopen learning content", w.Code, w.Body.String())
	}
	if _, err := app.store.UpdateAccount(ctx, tokenHash(token), func(account *Account) error {
		account.Access.PlayedNanoseconds = int64(trialPlayLimit + referralPlayBonus)
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	if w := request(app, "GET", "/api/content/bootstrap", token, nil); w.Code != 402 {
		t.Fatal("learning content stayed open after bonus was spent", w.Code, w.Body.String())
	}
}
