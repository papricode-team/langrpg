package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"regexp"
	"strings"
	"time"
)

// Milestones are written with account transactions and survive event retention / game resets.
type AnalyticsMilestones struct {
	RegisteredAt time.Time `json:"registeredAt,omitempty"`
	ActivatedAt  time.Time `json:"activatedAt,omitempty"`
	PaidAt       time.Time `json:"paidAt,omitempty"`
}

var analyticsID = regexp.MustCompile(`^[a-zA-Z0-9_-]{16,64}$`)
var analyticsLabel = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}$`)
var browserEvents = map[string]bool{"session_started": true, "page_view": true, "paywall_viewed": true, "client_error": true}

func analyticsRequestIdentity(r *http.Request) (string, string) {
	visitor, session := r.Header.Get("X-Analytics-Visitor"), r.Header.Get("X-Analytics-Session")
	if !analyticsID.MatchString(visitor) || !analyticsID.MatchString(session) {
		return "", ""
	}
	return visitor, session
}

func (a *App) recordAnalytics(ctx context.Context, account Account, e AnalyticsEvent) {
	if a.isAdmin(account) && e.Name != "admin_session" {
		return
	}
	e.AccountID = account.Player.ID
	if e.At.IsZero() {
		e.At = a.now().UTC()
	}
	if e.ID == "" {
		id, err := randomID(16)
		if err != nil {
			return
		}
		e.ID = id
	}
	// Analytics outages never roll back a player's learning or payment.
	ctx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 500*time.Millisecond)
	defer cancel()
	if err := a.store.RecordAnalytics(ctx, []AnalyticsEvent{e}, a.now().UTC()); err != nil {
		slog.Warn("analytics event was not saved", "event", e.Name, "error", err)
	}
}

func (a *App) recordSessionAnalytics(r *http.Request, account Account) {
	visitor, session := analyticsRequestIdentity(r)
	// Each browser session is counted once, including repeated profile saves / resumes.
	if session == "" {
		return
	}
	name := "game_started"
	if a.isAdmin(account) {
		name = "admin_session"
	}
	a.recordAnalytics(r.Context(), account, AnalyticsEvent{ID: "play:" + account.Player.ID + ":" + session, Name: name, Visitor: visitor, Session: session})
}

func (a *App) recordLearningAnalytics(ctx context.Context, account Account, key string, request json.RawMessage, receipt Receipt) {
	name, detail := "", ""
	prefix, _, _ := strings.Cut(key, ":")
	switch prefix {
	case "attempt":
		name = "learning_attempt"
		var input AttemptInput
		_ = json.Unmarshal(request, &input)
		detail = input.Mode
	case "expedition":
		name = "learning_attempt"
		detail = "expedition"
	case "activity-run":
		name = "activity_completed"
	default:
		return
	}
	if name == "learning_attempt" && receipt.Correct == nil {
		return
	}
	correct := 0
	if receipt.Correct != nil && *receipt.Correct {
		correct = 1
	}
	a.recordAnalytics(ctx, account, AnalyticsEvent{ID: fmt.Sprintf("action:%s:%s:%d:%s", account.Player.ID, account.ActiveCourseID, account.Access.Generation, key), Name: name, Detail: detail, Correct: correct})
}

func (a *App) collectAnalytics(w http.ResponseWriter, r *http.Request) {
	remote, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		remote = r.RemoteAddr
	}
	if !a.allow("analytics:"+remote, 120) {
		writeError(w, 429, "too many analytics requests")
		return
	}
	var input struct {
		Events []AnalyticsEvent `json:"events"`
	}
	if err := decodeJSON(w, r, &input); err != nil {
		apiFailure(w, err)
		return
	}
	if len(input.Events) == 0 || len(input.Events) > 12 {
		writeError(w, 400, "send 1–12 analytics events")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()
	var account Account
	if r.Header.Get("Authorization") != "" {
		hash, err := bearer(r)
		if err != nil {
			apiFailure(w, err)
			return
		}
		account, err = a.store.Get(ctx, hash)
		if err != nil {
			apiFailure(w, err)
			return
		}
		if a.isAdmin(account) {
			for _, e := range input.Events {
				if analyticsID.MatchString(e.Session) {
					a.recordAnalytics(ctx, account, AnalyticsEvent{ID: "admin:" + account.Player.ID + ":" + e.Session, Name: "admin_session", Session: e.Session})
				}
			}
			w.WriteHeader(http.StatusNoContent)
			return
		}
	}
	now := a.now().UTC()
	events := make([]AnalyticsEvent, 0, len(input.Events))
	for _, e := range input.Events {
		if !browserEvents[e.Name] || !analyticsID.MatchString(e.ID) || !analyticsID.MatchString(e.Visitor) || !analyticsID.MatchString(e.Session) {
			writeError(w, 400, "invalid analytics event")
			return
		}
		if e.Source != "" && !analyticsLabel.MatchString(e.Source) || e.Campaign != "" && !analyticsLabel.MatchString(e.Campaign) {
			writeError(w, 400, "invalid acquisition label")
			return
		}
		if e.Device != "desktop" && e.Device != "mobile" && e.Device != "tablet" {
			writeError(w, 400, "invalid device category")
			return
		}
		validDetail := e.Name == "session_started" && e.Detail == "" || e.Name == "page_view" && (e.Detail == "entry" || e.Detail == "game" || e.Detail == "course") || e.Name == "paywall_viewed" && (e.Detail == "required" || e.Detail == "optional") || e.Name == "client_error" && (e.Detail == "network" || e.Detail == "server" || e.Detail == "runtime" || e.Detail == "checkout")
		if !validDetail {
			writeError(w, 400, "invalid event detail")
			return
		}
		id := "browser:" + e.Visitor + ":" + e.ID
		if e.Name == "session_started" {
			id = "visit:" + e.Visitor + ":" + e.Session
		}
		// Client timestamps, account claims, correctness and server event names are never trusted.
		events = append(events, AnalyticsEvent{ID: id, Name: e.Name, AccountID: account.Player.ID, Visitor: e.Visitor, Session: e.Session, Source: e.Source, Campaign: e.Campaign, Device: e.Device, Detail: e.Detail, At: now})
	}
	if err := a.store.RecordAnalytics(ctx, events, now); err != nil {
		apiFailure(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
