package store

import (
	"context"
	"encoding/json"
	"glotworld/server/internal/billing"
	"sort"
	"time"
)

const AnalyticsRetentionDays = 180

// Fixed fields deliberately exclude names, emails, answers, URLs and arbitrary properties.
type AnalyticsEvent struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	AccountID string    `json:"accountId,omitempty"`
	Visitor   string    `json:"visitor,omitempty"`
	Session   string    `json:"session,omitempty"`
	Source    string    `json:"source,omitempty"`
	Campaign  string    `json:"campaign,omitempty"`
	Device    string    `json:"device,omitempty"`
	Detail    string    `json:"detail,omitempty"`
	Correct   int       `json:"correct,omitempty"`
	At        time.Time `json:"at"`
}

type AnalyticsFact struct {
	AnalyticsEvent
	Count int       `json:"count"`
	Last  time.Time `json:"last"`
}

type AnalyticsAccount struct {
	ID         string              `json:"id"`
	Email      string              `json:"-"` // Only used to exclude configured administrators.
	CreatedAt  time.Time           `json:"createdAt"`
	Registered bool                `json:"registered"`
	Billing    billing.State       `json:"-"`
	Milestones AnalyticsMilestones `json:"milestones"`
}

func (s *PGStore) RecordAnalytics(ctx context.Context, events []AnalyticsEvent, now time.Time) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	// Claim cleanup at most once per day across all app instances. No scheduler needed.
	result, err := tx.Exec(ctx, `UPDATE analytics_maintenance SET pruned_at=$1 WHERE id=1 AND pruned_at < $1::timestamptz - INTERVAL '1 day'`, now)
	if err != nil {
		return err
	}
	if result.RowsAffected() > 0 {
		if _, err = tx.Exec(ctx, `DELETE FROM analytics_events WHERE at < $1`, now.AddDate(0, 0, -AnalyticsRetentionDays)); err != nil {
			return err
		}
	}
	for _, e := range events {
		_, err = tx.Exec(ctx, `INSERT INTO analytics_events(id,name,account_id,visitor,session_id,source,campaign,device,detail,correct,at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT DO NOTHING`, e.ID, e.Name, e.AccountID, e.Visitor, e.Session, e.Source, e.Campaign, e.Device, e.Detail, e.Correct, e.At)
		if err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

func analyticsAccount(a Account) AnalyticsAccount {
	return AnalyticsAccount{ID: a.Player.ID, Email: a.Email, CreatedAt: a.CreatedAt, Registered: a.Email != "", Billing: a.Billing, Milestones: a.Analytics}
}

func (s *JSONStore) RecordAnalytics(_ context.Context, events []AnalyticsEvent, now time.Time) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	previous := s.state.Analytics
	next := make(map[string]AnalyticsEvent, len(previous)+len(events))
	cutoff := now.AddDate(0, 0, -AnalyticsRetentionDays)
	for key, e := range previous {
		if !e.At.Before(cutoff) {
			next[key] = e
		}
	}
	for _, e := range events {
		if _, exists := next[e.ID]; !exists {
			next[e.ID] = e
		}
	}
	s.state.Analytics = next
	if err := s.save(); err != nil {
		s.state.Analytics = previous
		return err
	}
	return nil
}

// Aggregate at the database boundary so large attempt histories don't cross the wire.
func (s *PGStore) ReadAnalytics(ctx context.Context, from, to time.Time) ([]AnalyticsFact, []AnalyticsAccount, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, nil, err
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx, `SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY`); err != nil {
		return nil, nil, err
	}
	rows, err := tx.Query(ctx, `SELECT name,account_id,visitor,session_id,source,campaign,device,detail,
 MIN(at),MAX(at),COUNT(*),SUM(correct) FROM analytics_events WHERE at >= $1 AND at < $2
 GROUP BY (at AT TIME ZONE 'UTC')::date,name,account_id,visitor,session_id,source,campaign,device,detail,
 CASE WHEN name='checkout_started' THEN id ELSE '' END`, from, to)
	if err != nil {
		return nil, nil, err
	}
	facts := []AnalyticsFact{}
	for rows.Next() {
		var f AnalyticsFact
		if err = rows.Scan(&f.Name, &f.AccountID, &f.Visitor, &f.Session, &f.Source, &f.Campaign, &f.Device, &f.Detail, &f.At, &f.Last, &f.Count, &f.Correct); err != nil {
			rows.Close()
			return nil, nil, err
		}
		facts = append(facts, f)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return nil, nil, err
	}
	rows, err = tx.Query(ctx, `SELECT id,COALESCE(email,''),created_at,COALESCE((data->'billing') - 'purchases' - 'webhookReceipts','{}'::jsonb),COALESCE(data->'analytics','{}'::jsonb) FROM accounts`)
	if err != nil {
		return nil, nil, err
	}
	accounts := []AnalyticsAccount{}
	for rows.Next() {
		var a AnalyticsAccount
		var created *time.Time
		var billingData, milestones []byte
		if err = rows.Scan(&a.ID, &a.Email, &created, &billingData, &milestones); err != nil {
			rows.Close()
			return nil, nil, err
		}
		if created != nil {
			a.CreatedAt = created.UTC()
		}
		if err = json.Unmarshal(billingData, &a.Billing); err != nil {
			rows.Close()
			return nil, nil, err
		}
		if err = json.Unmarshal(milestones, &a.Milestones); err != nil {
			rows.Close()
			return nil, nil, err
		}
		a.Registered = a.Email != ""
		accounts = append(accounts, a)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return nil, nil, err
	}
	return facts, accounts, tx.Commit(ctx)
}

func (s *JSONStore) ReadAnalytics(_ context.Context, from, to time.Time) ([]AnalyticsFact, []AnalyticsAccount, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	facts := []AnalyticsFact{}
	for _, e := range s.state.Analytics {
		if !e.At.Before(from) && e.At.Before(to) {
			facts = append(facts, AnalyticsFact{AnalyticsEvent: e, Count: 1, Last: e.At})
		}
	}
	sort.Slice(facts, func(i, j int) bool { return facts[i].At.Before(facts[j].At) })
	accounts := []AnalyticsAccount{}
	for _, a := range s.state.Accounts {
		accounts = append(accounts, analyticsAccount(a))
	}
	return facts, accounts, nil
}
