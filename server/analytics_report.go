package main

import (
	"context"
	"net/http"
	"sort"
	"strconv"
	"time"
)

type AnalyticsMetrics struct {
	Visitors       int `json:"visitors"`
	Sessions       int `json:"sessions"`
	NewPlayers     int `json:"newPlayers"`
	Registrations  int `json:"registrations"`
	Activated      int `json:"activated"`
	ActiveLearners int `json:"activeLearners"`
	Attempts       int `json:"attempts"`
	Correct        int `json:"correct"`
	Completions    int `json:"completions"`
	PaywallViewers int `json:"paywallViewers"`
	CheckoutUsers  int `json:"checkoutUsers"`
	NewCustomers   int `json:"newCustomers"`
	Errors         int `json:"errors"`
}
type AnalyticsDay struct {
	Date string `json:"date"`
	AnalyticsMetrics
}
type AnalyticsBreakdown struct {
	Label     string `json:"label"`
	Visitors  int    `json:"visitors"`
	Players   int    `json:"players"`
	Activated int    `json:"activated"`
	Customers int    `json:"customers"`
}
type AnalyticsRetention struct {
	Day      int      `json:"day"`
	Eligible int      `json:"eligible"`
	Returned int      `json:"returned"`
	Rate     *float64 `json:"rate"`
}
type AnalyticsCohort struct {
	Week      string               `json:"week"`
	Learners  int                  `json:"learners"`
	Retention []AnalyticsRetention `json:"retention"`
}
type AnalyticsFunnelStep struct {
	Label string   `json:"label"`
	Users int      `json:"users"`
	Rate  *float64 `json:"rate"`
}
type AnalyticsEventTotal struct {
	Name    string `json:"name"`
	Detail  string `json:"detail"`
	Count   int    `json:"count"`
	Users   int    `json:"users"`
	Correct int    `json:"correct"`
}
type AnalyticsRecent struct {
	Player string    `json:"player"`
	Event  string    `json:"event"`
	At     time.Time `json:"at"`
}
type AnalyticsCustomerSummary struct {
	Registered int `json:"registered"`
	EverPaid   int `json:"everPaid"`
	Monthly    int `json:"monthly"`
	Yearly     int `json:"yearly"`
	Lifetime   int `json:"lifetime"`
	Stale      int `json:"stale"`
	Expired    int `json:"expired"`
}
type AnalyticsReport struct {
	GeneratedAt   time.Time                `json:"generatedAt"`
	From          time.Time                `json:"from"`
	To            time.Time                `json:"to"`
	PreviousFrom  time.Time                `json:"previousFrom"`
	Days          int                      `json:"days"`
	RetentionDays int                      `json:"retentionDays"`
	FirstEventAt  *time.Time               `json:"firstEventAt"`
	BillingMode   string                   `json:"billingMode"`
	Current       AnalyticsMetrics         `json:"current"`
	Previous      AnalyticsMetrics         `json:"previous"`
	Daily         []AnalyticsDay           `json:"daily"`
	Sources       []AnalyticsBreakdown     `json:"sources"`
	Campaigns     []AnalyticsBreakdown     `json:"campaigns"`
	Devices       []AnalyticsBreakdown     `json:"devices"`
	Funnel        []AnalyticsFunnelStep    `json:"funnel"`
	Retention     []AnalyticsRetention     `json:"retention"`
	Cohorts       []AnalyticsCohort        `json:"cohorts"`
	Events        []AnalyticsEventTotal    `json:"events"`
	Recent        []AnalyticsRecent        `json:"recent"`
	Customers     AnalyticsCustomerSummary `json:"customers"`
}

type analyticsSet map[string]bool

func (s analyticsSet) add(v string) {
	if v != "" {
		s[v] = true
	}
}
func analyticsRate(n, d int) *float64 {
	if d == 0 {
		return nil
	}
	v := float64(n) * 100 / float64(d)
	return &v
}
func analyticsDay(t time.Time) time.Time {
	t = t.UTC()
	return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, time.UTC)
}
func analyticsIn(t, from, to time.Time) bool { return !t.IsZero() && !t.Before(from) && t.Before(to) }
func analyticsActor(e AnalyticsEvent) string {
	if e.AccountID != "" {
		return "a:" + e.AccountID
	}
	return "v:" + e.Visitor
}

func (a *App) adminAnalytics(w http.ResponseWriter, r *http.Request) {
	admin, ok := a.requireAdmin(w, r)
	if !ok {
		return
	}
	if !a.allow("analytics-report:"+admin.Player.ID, 20) {
		writeError(w, 429, "too many dashboard refreshes; try again shortly")
		return
	}
	days := 30
	if value := r.URL.Query().Get("days"); value != "" {
		v, err := strconv.Atoi(value)
		if err != nil || v != 7 && v != 30 && v != 90 {
			writeError(w, 400, "days must be 7, 30 or 90")
			return
		}
		days = v
	}
	now := a.now().UTC()
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()
	facts, accounts, err := a.store.ReadAnalytics(ctx, analyticsDay(now).AddDate(0, 0, -analyticsRetentionDays+1), now)
	if err != nil {
		apiFailure(w, err)
		return
	}
	writeJSON(w, 200, a.buildAnalytics(facts, accounts, days, now))
}

func analyticsMetrics(facts []AnalyticsFact, accounts []AnalyticsAccount, from, to time.Time) AnalyticsMetrics {
	m := AnalyticsMetrics{}
	visitors, sessions, active, walls, checkouts := analyticsSet{}, analyticsSet{}, analyticsSet{}, analyticsSet{}, analyticsSet{}
	for _, f := range facts {
		if !analyticsIn(f.At, from, to) {
			continue
		}
		switch f.Name {
		case "session_started":
			visitors.add(f.Visitor)
			sessions.add(f.Session)
		case "learning_attempt":
			active.add(f.AccountID)
			m.Attempts += f.Count
			m.Correct += f.Correct
		case "unit_completed", "quest_completed", "activity_completed":
			m.Completions += f.Count
		case "paywall_viewed":
			walls.add(analyticsActor(f.AnalyticsEvent))
		case "checkout_started":
			checkouts.add(f.AccountID)
		case "checkout_failed", "client_error":
			m.Errors += f.Count
		}
	}
	for _, a := range accounts {
		if analyticsIn(a.CreatedAt, from, to) {
			m.NewPlayers++
		}
		if analyticsIn(a.Milestones.RegisteredAt, from, to) {
			m.Registrations++
		}
		if analyticsIn(a.Milestones.ActivatedAt, from, to) {
			m.Activated++
		}
		if analyticsIn(a.Milestones.PaidAt, from, to) {
			m.NewCustomers++
		}
	}
	m.Visitors = len(visitors)
	m.Sessions = len(sessions)
	m.ActiveLearners = len(active)
	m.PaywallViewers = len(walls)
	m.CheckoutUsers = len(checkouts)
	return m
}

func (a *App) buildAnalytics(raw []AnalyticsFact, rawAccounts []AnalyticsAccount, days int, now time.Time) AnalyticsReport {
	today := analyticsDay(now)
	from := today.AddDate(0, 0, 1-days)
	// Current period includes today; the comparison is the preceding complete period.
	previousFrom := from.AddDate(0, 0, -days)
	previousTo := from
	report := AnalyticsReport{GeneratedAt: now, From: from, To: now, PreviousFrom: previousFrom, Days: days, RetentionDays: analyticsRetentionDays, BillingMode: "disabled", Daily: []AnalyticsDay{}, Sources: []AnalyticsBreakdown{}, Campaigns: []AnalyticsBreakdown{}, Devices: []AnalyticsBreakdown{}, Funnel: []AnalyticsFunnelStep{}, Cohorts: []AnalyticsCohort{}, Events: []AnalyticsEventTotal{}, Recent: []AnalyticsRecent{}}
	if a.billingAvailable() {
		report.BillingMode = "production"
		if a.billing.baseURL == "https://test-api.creem.io" {
			report.BillingMode = "sandbox"
		}
	}
	excluded := analyticsSet{}
	accounts := []AnalyticsAccount{}
	byID := map[string]AnalyticsAccount{}
	for _, account := range rawAccounts {
		if a.isAdmin(Account{Email: account.Email}) {
			excluded.add(account.ID)
			continue
		}
		accounts = append(accounts, account)
		byID[account.ID] = account
	}
	// Join anonymous traffic only within a session; never merge different accounts through a shared device.
	owners := map[string]string{}
	excludedSessions := analyticsSet{}
	for _, f := range raw {
		if f.Session == "" || f.AccountID == "" {
			continue
		}
		if excluded[f.AccountID] {
			excludedSessions.add(f.Session)
		}
		if existing := owners[f.Session]; existing != "" && existing != f.AccountID {
			owners[f.Session] = "ambiguous"
		} else {
			owners[f.Session] = f.AccountID
		}
	}
	facts := []AnalyticsFact{}
	for _, f := range raw {
		if excluded[f.AccountID] || excludedSessions[f.Session] {
			continue
		}
		if f.AccountID == "" && owners[f.Session] != "ambiguous" {
			f.AccountID = owners[f.Session]
		}
		// A stale/deleted account cannot be used to manufacture verified activity.
		if f.AccountID != "" {
			if _, exists := byID[f.AccountID]; !exists {
				continue
			}
		}
		if report.FirstEventAt == nil || f.At.Before(*report.FirstEventAt) {
			v := f.At
			report.FirstEventAt = &v
		}
		facts = append(facts, f)
	}
	report.Current = analyticsMetrics(facts, accounts, from, now)
	report.Previous = analyticsMetrics(facts, accounts, previousFrom, previousTo)
	for d := from; !d.After(today); d = d.AddDate(0, 0, 1) {
		report.Daily = append(report.Daily, AnalyticsDay{Date: d.Format("2006-01-02"), AnalyticsMetrics: analyticsMetrics(facts, accounts, d, minTime(d.AddDate(0, 0, 1), now))})
	}
	report.Sources = analyticsBreakdowns(facts, accounts, from, now, "source")
	report.Campaigns = analyticsBreakdowns(facts, accounts, from, now, "campaign")
	report.Devices = analyticsBreakdowns(facts, accounts, from, now, "device")
	// Ordered conversion for players created in this range. Every later step must follow the preceding one.
	checkouts := map[string][]time.Time{}
	for _, f := range facts {
		if f.Name == "checkout_started" {
			checkouts[f.AccountID] = append(checkouts[f.AccountID], f.At)
		}
	}
	steps := []AnalyticsFunnelStep{{Label: "Started an adventure"}, {Label: "Answered an exercise"}, {Label: "Opened checkout"}, {Label: "Became a customer"}}
	for _, account := range accounts {
		if !analyticsIn(account.CreatedAt, from, now) {
			continue
		}
		steps[0].Users++
		activated := account.Milestones.ActivatedAt
		if !analyticsIn(activated, account.CreatedAt, now) {
			continue
		}
		steps[1].Users++
		var checkout time.Time
		for _, at := range checkouts[account.ID] {
			if !at.Before(activated) && at.Before(now) && (checkout.IsZero() || at.Before(checkout)) {
				checkout = at
			}
		}
		if checkout.IsZero() {
			continue
		}
		steps[2].Users++
		if analyticsIn(account.Milestones.PaidAt, checkout, now) {
			steps[3].Users++
		}
	}
	for i := range steps {
		steps[i].Rate = analyticsRate(steps[i].Users, steps[0].Users)
	}
	report.Funnel = steps
	activity := map[string]analyticsSet{}
	for _, f := range facts {
		if f.Name == "learning_attempt" {
			if activity[f.AccountID] == nil {
				activity[f.AccountID] = analyticsSet{}
			}
			activity[f.AccountID].add(analyticsDay(f.At).Format("2006-01-02"))
		}
	}
	cohortAccounts := []AnalyticsAccount{}
	weeks := map[string][]AnalyticsAccount{}
	for _, account := range accounts {
		if analyticsIn(account.Milestones.ActivatedAt, from, now) {
			cohortAccounts = append(cohortAccounts, account)
			d := analyticsDay(account.Milestones.ActivatedAt)
			weekday := (int(d.Weekday()) + 6) % 7
			week := d.AddDate(0, 0, -weekday).Format("2006-01-02")
			weeks[week] = append(weeks[week], account)
		}
	}
	report.Retention = analyticsRetention(cohortAccounts, activity, today)
	for week, members := range weeks {
		report.Cohorts = append(report.Cohorts, AnalyticsCohort{Week: week, Learners: len(members), Retention: analyticsRetention(members, activity, today)})
	}
	sort.Slice(report.Cohorts, func(i, j int) bool { return report.Cohorts[i].Week > report.Cohorts[j].Week })
	eventTotals := map[string]*AnalyticsEventTotal{}
	eventUsers := map[string]analyticsSet{}
	for _, f := range facts {
		if !analyticsIn(f.At, from, now) {
			continue
		}
		key := f.Name + ":" + f.Detail
		if eventTotals[key] == nil {
			eventTotals[key] = &AnalyticsEventTotal{Name: f.Name, Detail: f.Detail}
			eventUsers[key] = analyticsSet{}
		}
		row := eventTotals[key]
		row.Count += f.Count
		row.Correct += f.Correct
		eventUsers[key].add(analyticsActor(f.AnalyticsEvent))
	}
	for key, row := range eventTotals {
		row.Users = len(eventUsers[key])
		report.Events = append(report.Events, *row)
	}
	sort.Slice(report.Events, func(i, j int) bool {
		if report.Events[i].Count == report.Events[j].Count {
			return report.Events[i].Name+report.Events[i].Detail < report.Events[j].Name+report.Events[j].Detail
		}
		return report.Events[i].Count > report.Events[j].Count
	})
	for _, account := range accounts {
		if account.Registered {
			report.Customers.Registered++
		}
		if !account.Milestones.PaidAt.IsZero() {
			report.Customers.EverPaid++
		}
		b := account.Billing
		if b.Plan != "" {
			expired := (b.Plan == "monthly" || b.Plan == "yearly") && !now.Before(b.PaidUntil)
			if expired {
				report.Customers.Expired++
			} else if b.VerifiedAt.IsZero() || now.Sub(b.VerifiedAt) > billingVerificationLifetime || now.Before(b.VerifiedAt) {
				report.Customers.Stale++
			} else if a.hasPaidAccess(Account{Email: account.Email, Billing: b}, now) {
				switch b.Plan {
				case "monthly":
					report.Customers.Monthly++
				case "yearly":
					report.Customers.Yearly++
				case "lifetime":
					report.Customers.Lifetime++
				}
			}
		}
		for name, at := range map[string]time.Time{"Adventure started": account.CreatedAt, "Account saved": account.Milestones.RegisteredAt, "First exercise": account.Milestones.ActivatedAt, "First payment verified": account.Milestones.PaidAt} {
			if analyticsIn(at, from, now) {
				report.Recent = append(report.Recent, AnalyticsRecent{Player: tokenHash(account.ID)[:8], Event: name, At: at})
			}
		}
	}
	sort.Slice(report.Recent, func(i, j int) bool {
		if report.Recent[i].At.Equal(report.Recent[j].At) {
			return report.Recent[i].Player+report.Recent[i].Event < report.Recent[j].Player+report.Recent[j].Event
		}
		return report.Recent[i].At.After(report.Recent[j].At)
	})
	if len(report.Recent) > 30 {
		report.Recent = report.Recent[:30]
	}
	return report
}

func analyticsRetention(accounts []AnalyticsAccount, activity map[string]analyticsSet, today time.Time) []AnalyticsRetention {
	result := []AnalyticsRetention{}
	for _, day := range []int{1, 7, 30} {
		row := AnalyticsRetention{Day: day}
		for _, a := range accounts {
			target := analyticsDay(a.Milestones.ActivatedAt).AddDate(0, 0, day)
			if !target.Before(today) {
				continue
			} // Only fully elapsed UTC days are eligible.
			row.Eligible++
			if activity[a.ID][target.Format("2006-01-02")] {
				row.Returned++
			}
		}
		row.Rate = analyticsRate(row.Returned, row.Eligible)
		result = append(result, row)
	}
	return result
}

func analyticsBreakdowns(facts []AnalyticsFact, accounts []AnalyticsAccount, from, to time.Time, dimension string) []AnalyticsBreakdown {
	type group struct{ visitors, players, activated, customers analyticsSet }
	groups := map[string]*group{}
	first := map[string]AnalyticsFact{}
	label := func(f AnalyticsFact) string {
		v := f.Source
		if dimension == "campaign" {
			v = f.Campaign
		}
		if dimension == "device" {
			v = f.Device
		}
		if v == "" {
			if dimension == "source" {
				return "direct"
			}
			return "unknown"
		}
		return v
	}
	get := func(key string) *group {
		if groups[key] == nil {
			groups[key] = &group{analyticsSet{}, analyticsSet{}, analyticsSet{}, analyticsSet{}}
		}
		return groups[key]
	}
	for _, f := range facts {
		if f.Name != "session_started" {
			continue
		}
		if analyticsIn(f.At, from, to) {
			get(label(f)).visitors.add(f.Visitor)
		}
		if f.AccountID != "" {
			if previous, exists := first[f.AccountID]; !exists || f.At.Before(previous.At) {
				first[f.AccountID] = f
			}
		}
	}
	for _, a := range accounts {
		if !analyticsIn(a.CreatedAt, from, to) {
			continue
		}
		// Attribution is only from an observed session at creation, never from a later return visit.
		f, ok := first[a.ID]
		key := "unknown"
		if ok && f.At.Before(a.CreatedAt.Add(5*time.Minute)) {
			key = label(f)
		}
		g := get(key)
		g.players.add(a.ID)
		if analyticsIn(a.Milestones.ActivatedAt, from, to) {
			g.activated.add(a.ID)
		}
		if analyticsIn(a.Milestones.PaidAt, from, to) {
			g.customers.add(a.ID)
		}
	}
	result := []AnalyticsBreakdown{}
	for key, g := range groups {
		result = append(result, AnalyticsBreakdown{Label: key, Visitors: len(g.visitors), Players: len(g.players), Activated: len(g.activated), Customers: len(g.customers)})
	}
	sort.Slice(result, func(i, j int) bool {
		if result[i].Visitors == result[j].Visitors {
			return result[i].Label < result[j].Label
		}
		return result[i].Visitors > result[j].Visitors
	})
	return result
}
