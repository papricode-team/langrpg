package main

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"time"
)

type SharedWorldClock struct {
	Hour       float64   `json:"hour"`
	Label      string    `json:"label"`
	Period     string    `json:"period"`
	Day        int       `json:"day"`
	ServerTime time.Time `json:"serverTime"`
}

func sharedClockAt(epoch, now time.Time) SharedWorldClock {
	elapsed := math.Max(0, now.Sub(epoch).Seconds())
	hour := math.Mod(7+elapsed*24/720, 24)
	minute := int(math.Floor(hour * 60))
	period := "night"
	if hour >= 7 && hour < 19 {
		period = "day"
	}
	return SharedWorldClock{hour, fmt.Sprintf("%02d:%02d", minute/60, minute%60), period, 1 + int(elapsed/720), now.UTC()}
}

func (w *World) Clock() SharedWorldClock { return sharedClockAt(w.clockEpoch, time.Now()) }

func (a *App) worldClock(w http.ResponseWriter, r *http.Request) { writeJSON(w, 200, a.world.Clock()) }

type DailyPromise struct {
	Day            int    `json:"day"`
	Date           string `json:"date"`
	Title          string `json:"title"`
	Target         int    `json:"target"`
	CorrectAnswers int    `json:"correctAnswers"`
	Completed      bool   `json:"completed"`
}

// Calendar evidence belongs to Progress, outside rewound narrative saves.
// Dates use the server's UTC calendar; no client clock can create a new day.
type DailyPromiseRecord struct {
	CorrectAnswers int      `json:"correctAnswers"`
	Completed      bool     `json:"completed"`
	RetrievedItems []string `json:"retrievedItems,omitempty"`
}

func ensureDailyPromise(s *StoryState) {
	s.Promise.Day = s.Day
	s.Promise.Title = "Make three unaided German connections"
	s.Promise.Target = 3
}

func refreshDailyPromise(p *Progress, now time.Time) {
	if p.DailyPromises == nil {
		p.DailyPromises = map[string]DailyPromiseRecord{}
	}
	ensureDailyPromise(&p.Story)
	date := now.UTC().Format(time.DateOnly)
	record := p.DailyPromises[date]
	p.Story.Promise.Date = date
	p.Story.Promise.CorrectAnswers = record.CorrectAnswers
	p.Story.Promise.Completed = record.Completed
	// Keep yesterday's lantern visible while today's promise is in progress.
	day := now.UTC()
	if !record.Completed {
		day = day.AddDate(0, 0, -1)
	}
	p.Story.LanternStreak = 0
	for p.DailyPromises[day.Format(time.DateOnly)].Completed {
		p.Story.LanternStreak++
		day = day.AddDate(0, 0, -1)
	}
}

func recordPromiseAttempt(p *Progress, correct, hinted bool, now time.Time, itemMode string) {
	refreshDailyPromise(p, now)
	date := p.Story.Promise.Date
	record := p.DailyPromises[date]
	if correct && !hinted && !record.Completed && !contains(record.RetrievedItems, itemMode) {
		record.RetrievedItems = append(record.RetrievedItems, itemMode)
		record.CorrectAnswers++
		record.Completed = record.CorrectAnswers >= p.Story.Promise.Target
		p.DailyPromises[date] = record
		refreshDailyPromise(p, now)
	}
}

func (w *World) atInn(playerID string) bool {
	w.mu.Lock()
	defer w.mu.Unlock()
	client := w.clients[playerID]
	return client != nil && client.player.InteriorID == "inn"
}

func (a *App) sleepStory(w http.ResponseWriter, r *http.Request) {
	hash, err := bearer(r)
	if err != nil {
		apiFailure(w, err)
		return
	}
	var input struct {
		ID string `json:"id"`
	}
	if err = decodeJSON(w, r, &input); err != nil {
		apiFailure(w, err)
		return
	}
	if !safeID.MatchString(input.ID) {
		writeError(w, 400, "invalid rest action ID")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()
	request, _ := json.Marshal(input)
	account, _, duplicate, err := a.store.Mutate(ctx, hash, "story-sleep:"+input.ID, request, func(account *Account) (Receipt, error) {
		if !a.world.atInn(account.Player.ID) {
			return Receipt{}, &APIError{409, "return to your room at the inn before resting"}
		}
		s := &account.Progress.Story
		s.Day++
		refreshDailyPromise(&account.Progress, a.now().UTC())
		return Receipt{}, nil
	})
	if err != nil {
		apiFailure(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"story": account.Progress.Story, "progress": account.Progress, "clock": a.world.Clock(), "duplicate": duplicate})
}
