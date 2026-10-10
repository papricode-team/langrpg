package main

import (
	"context"
	"encoding/json"
	"sort"
	"time"

	fsrs "github.com/open-spaced-repetition/go-fsrs/v4"
)

func (a *App) getAccount(ctx context.Context, hash string) (Account, error) {
	account, err := a.store.Get(ctx, hash)
	if err != nil || account.Progress.WordExposureVersion >= 2 || len(a.curriculum.Lexicon) == 0 {
		return account, err
	}
	request := json.RawMessage(`{"version":2}`)
	account, _, _, err = a.store.Mutate(ctx, hash, "word-exposure-migration:v2", request, func(account *Account) (Receipt, error) {
		migrateContextExposures(&account.Progress, a.curriculum, a.now().UTC())
		return Receipt{}, nil
	})
	return account, err
}

// Reconstruct exposure from saved contextual practice without transferring any
// phrase success, repetitions or stability into an individual word's cards.
func migrateContextExposures(p *Progress, curriculum Curriculum, now time.Time) {
	ensureProgress(p)
	if p.WordExposureVersion >= 2 || len(curriculum.Lexicon) == 0 {
		return
	}
	counts := map[string]int{}
	lastSeen := map[string]time.Time{}
	for _, exercise := range curriculum.Exercises {
		if exercise.TargetWordID != "" || len(exercise.WordIDs) == 0 {
			continue
		}
		memory, exists := p.Items[exercise.ItemID]
		if !exists {
			continue
		}
		count := p.ExerciseStats[exercise.ID].Attempts
		if count == 0 {
			for _, stats := range memory.ModeStats {
				count += stats.Attempts
			}
			if count == 0 {
				count = memory.Repetitions
			}
		}
		for _, id := range exercise.WordIDs {
			counts[id] += count
			if memory.LastSeenAt.After(lastSeen[id]) {
				lastSeen[id] = memory.LastSeenAt
			}
		}
	}
	for id, count := range counts {
		if count == 0 {
			continue
		}
		word := p.Words[id]
		word.WordID = id
		if count > word.ContextExposures {
			word.ContextExposures = count
		}
		if count+word.DirectAttempts > word.Exposures {
			word.Exposures = count + word.DirectAttempts
		}
		seen := lastSeen[id]
		if seen.IsZero() {
			seen = now
		}
		if seen.After(word.LastSeenAt) {
			word.LastSeenAt = seen
		}
		if memory, exists := p.Items["word-"+id]; exists {
			syncWordCards(&word, memory)
		}
		refreshWordMastery(&word)
		p.Words[id] = word
	}
	// Version one created recall deadlines for reading alone. Clear those
	// legacy deadlines while keeping actual retrieval cards authoritative.
	for id, word := range p.Words {
		if memory, exists := p.Items["word-"+id]; exists {
			syncWordCards(&word, memory)
		} else if word.DirectAttempts == 0 {
			word.DueAt = time.Time{}
		}
		refreshWordMastery(&word)
		p.Words[id] = word
	}
	p.WordExposureVersion = 2
}

// Only the authored target of a direct word drill inherits retrieval evidence.
// Other words in a correctly answered sentence are still exposure, not mastery.
func recordWordEvidence(p *Progress, exercise Exercise, input AttemptInput, correct bool, now time.Time) {
	ensureProgress(p)
	seen := map[string]bool{}
	words := append([]string{}, exercise.WordIDs...)
	if exercise.TargetWordID != "" {
		words = append(words, exercise.TargetWordID)
	}
	for _, id := range words {
		if seen[id] {
			continue
		}
		seen[id] = true
		word := p.Words[id]
		word.WordID = id
		word.Exposures++
		word.LastSeenAt = now.UTC()
		if memory, exists := p.Items["word-"+id]; exists {
			syncWordCards(&word, memory)
		}
		if exercise.TargetWordID == id {
			word.DirectAttempts++
			memory := p.Items[exercise.ItemID]
			word.DueAt, word.StabilityDays, word.Difficulty = memory.DueAt, memory.StabilityDays, memory.Difficulty
			word.Repetitions, word.Lapses = memory.Repetitions, memory.Lapses
			syncWordCards(&word, memory)
		} else {
			word.ContextExposures++
		}
		refreshWordMastery(&word)
		p.Words[id] = word
	}
	stats := p.ExerciseStats[exercise.ID]
	stats.Attempts++
	stats.LastAttemptAt = now.UTC()
	if correct {
		stats.Correct++
		stats.LastCorrectAt = now.UTC()
		if !input.Hinted {
			stats.UnaidedSuccesses++
		}
	}
	p.ExerciseStats[exercise.ID] = stats
	p.RecentAttempts[input.ID] = AttemptEvidence{ID: input.ID, ExerciseID: exercise.ID, ItemID: exercise.ItemID, Mode: input.Mode, Correct: correct, Hinted: input.Hinted, ActivityID: input.ActivityID, RunID: input.RunID, At: now.UTC()}
	// Progress carries a bounded recent history. Mission completion, idempotency
	// and auditing use full immutable receipts in the durable learning-event store.
	if len(p.RecentAttempts) > 256 {
		ids := make([]string, 0, len(p.RecentAttempts))
		for id := range p.RecentAttempts {
			ids = append(ids, id)
		}
		sort.Slice(ids, func(i, j int) bool {
			left, right := p.RecentAttempts[ids[i]], p.RecentAttempts[ids[j]]
			if left.At.Equal(right.At) {
				return ids[i] < ids[j]
			}
			return left.At.Before(right.At)
		})
		for _, id := range ids[:len(ids)-256] {
			delete(p.RecentAttempts, id)
		}
	}
}

func syncWordCards(word *WordMemory, memory Memory) {
	word.ModeStats, word.Cards, word.PracticeDueAt = memory.ModeStats, memory.Cards, memory.PracticeDueAt
	word.DueAt, word.StabilityDays, word.Difficulty = memory.DueAt, memory.StabilityDays, memory.Difficulty
	word.Repetitions, word.Lapses = memory.Repetitions, memory.Lapses
}

func refreshWordMastery(word *WordMemory) {
	if word.ModeStats == nil {
		word.ModeStats = map[string]ModeStats{}
	}
	if word.Cards == nil {
		word.Cards = map[string]fsrs.Card{}
	}
	word.Evidence = map[string]WordEvidence{}
	word.Mastery = "exposed"
	retained := 0
	for _, mode := range []string{"recognition", "listening", "production"} {
		stats := word.ModeStats[mode]
		evidence := WordEvidence{ModeStats: stats, Status: "unseen"}
		if stats.Attempts > 0 {
			evidence.Status = "learning"
			word.Mastery = "learning"
		}
		if card, exists := word.Cards[mode]; exists {
			evidence.DueAt, evidence.StabilityDays = card.Due, card.Stability
			if gate := word.PracticeDueAt[mode]; gate.After(evidence.DueAt) {
				evidence.DueAt = gate
			}
			// Repeated early answers do not advance FSRS. A retention label needs
			// spaced successful ratings and a week of estimated stability.
			if stats.UnaidedSuccesses >= 2 && card.Reps >= 2 && card.State == fsrs.Review && card.Stability >= 7 {
				evidence.Status = "retained"
				retained++
			}
		} else if due := word.PracticeDueAt[mode]; !due.IsZero() {
			evidence.DueAt = due
		}
		word.Evidence[mode] = evidence
	}
	// Overall retention includes all three modalities. The UI can report each
	// separately without claiming production/listening from recognition alone.
	if retained == 3 {
		word.Mastery = "retained"
	}
}
