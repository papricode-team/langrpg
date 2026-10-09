package main

import (
	"fmt"
	"time"

	fsrs "github.com/open-spaced-repetition/go-fsrs/v4"
)

func reviewScheduler() *fsrs.FSRS {
	parameters := fsrs.DefaultParam()
	parameters.RequestRetention = .90
	parameters.MaximumInterval = 365
	// One learning step lets Good graduate immediately, while errors receive
	// a short revisit. These are supported FSRS configuration parameters.
	parameters.LearningSteps = []float64{10}
	parameters.RelearningSteps = []float64{10}
	parameters.EnableFuzz = false
	return fsrs.NewFSRS(parameters)
}

// Recognition, production and listening retain separate FSRS cards. Supported
// answers are practice; they never establish a successful independent retrieval.
func recordAttempt(p *Progress, itemID, mode string, correct, hinted bool, now time.Time, sourceModes ...string) (Receipt, error) {
	if p.Items == nil {
		p.Items = map[string]Memory{}
	}
	m := p.Items[itemID]
	m.ItemID = itemID
	if m.ModeStats == nil {
		m.ModeStats = map[string]ModeStats{}
	}
	if m.Cards == nil {
		m.Cards = map[string]fsrs.Card{}
	}
	if m.PracticeDueAt == nil {
		m.PracticeDueAt = map[string]time.Time{}
	}
	sourceMode := mode
	if len(sourceModes) > 0 && validMode(sourceModes[0]) {
		sourceMode = sourceModes[0]
	}
	stats := m.ModeStats[mode]
	firstUnaided := stats.UnaidedSuccesses == 0
	card, hasCard := m.Cards[mode]
	wasDue := hasCard && !now.Before(card.Due)
	receipt := Receipt{Correct: &correct}
	stats.Attempts++
	p.Attempts++
	if correct {
		stats.Correct++
		p.CorrectAttempts++
	}
	if hinted {
		// Assistance supplies no independent rating, including transcript-only
		// fallback. Give practice its own encounter gate so a due item cannot
		// loop immediately forever without falsely moving an FSRS card forward.
		delay := time.Hour
		if !correct {
			delay = 10 * time.Minute
			m.Lapses++
		}
		m.PracticeDueAt[sourceMode] = now.Add(delay)
		m.DueAt = nextEncounterDue(m)
	} else {
		delete(m.PracticeDueAt, sourceMode)
		if !hasCard {
			card = fsrs.NewCard(now)
		}
		if !correct {
			m.Lapses++
		} else {
			stats.UnaidedSuccesses++
			if firstUnaided || wasDue {
				receipt.XPAdded = 6
				if mode == "production" {
					receipt.XPAdded = 8
				}
			}
		}
		// Natural early encounters remain useful practice without repeatedly
		// inflating stability or interrupting the story with a review.
		if !correct || !hasCard || card.State != fsrs.Review || wasDue {
			rating := fsrs.Good
			if !correct {
				rating = fsrs.Again
			}
			result, err := reviewScheduler().Next(card, now, rating)
			if err != nil {
				return Receipt{}, fmt.Errorf("schedule item %s: %w", itemID, err)
			}
			m.Cards[mode] = result.Card
			m.StabilityDays, m.Difficulty = result.Card.Stability, result.Card.Difficulty
			if correct {
				m.Repetitions++
			}
			receipt.FSRSReview = &result.ReviewLog
			receipt.ScheduledMode = mode
		}
		m.DueAt = nextEncounterDue(m)
	}
	m.LastSeenAt = now.UTC()
	m.ModeStats[mode] = stats
	p.Items[itemID] = m
	p.XP += receipt.XPAdded
	return receipt, nil
}

func nextEncounterDue(memory Memory) time.Time {
	var due time.Time
	for mode, card := range memory.Cards {
		candidate := card.Due
		if gate := memory.PracticeDueAt[mode]; gate.After(candidate) {
			candidate = gate
		}
		if due.IsZero() || candidate.Before(due) {
			due = candidate
		}
	}
	for mode, practice := range memory.PracticeDueAt {
		if _, hasCard := memory.Cards[mode]; !hasCard && (due.IsZero() || practice.Before(due)) {
			due = practice
		}
	}
	return due
}
