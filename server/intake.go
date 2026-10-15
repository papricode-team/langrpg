package main

import (
	"context"
	"encoding/json"
	"fmt"
	"glotworld/server/internal/store"
	"net/http"
	"sort"
	"time"
)

// IntakeStatus is derived on request; nothing here is persisted.
type IntakeStatus struct {
	Introduced        int    `json:"introduced"`
	Remaining         int    `json:"remaining"`
	Pending           int    `json:"pending"`
	NextWordInSeconds int    `json:"nextWordInSeconds"`
	Paused            string `json:"paused,omitempty"`
	Unsettled         int    `json:"unsettled"`
	Due               int    `json:"due"`
}

const (
	intakeVersion      = 1
	maxHeartbeatSecond = 120
	heartbeatTolerance = 5
)

func introducedSet(p *Progress) map[string]bool {
	set := make(map[string]bool, len(p.Intake.WordIDs))
	for _, id := range p.Intake.WordIDs {
		set[id] = true
	}
	return set
}

// A word is unsettled until the learner has recognised, heard or recalled it
// unaided at least once. Exposure alone never settles it.
func wordUnsettled(p *Progress, id string) bool {
	for _, stats := range p.Words[id].ModeStats {
		if stats.UnaidedSuccesses > 0 {
			return false
		}
	}
	for _, stats := range p.Items["word-"+id].ModeStats {
		if stats.UnaidedSuccesses > 0 {
			return false
		}
	}
	return true
}

func wordDue(p *Progress, id string, now time.Time) bool {
	word := p.Words[id]
	return word.DirectAttempts > 0 && !word.DueAt.IsZero() && !word.DueAt.After(now)
}

// intakeStatus mirrors web/src/intake.ts; keep the two in step.
func intakeStatus(p *Progress, s *Syllabus, now time.Time) IntakeStatus {
	store.EnsureIntake(p)
	status := IntakeStatus{Introduced: len(p.Intake.WordIDs)}
	if s == nil {
		return status
	}
	status.Remaining = max(0, len(s.WordIDs)-status.Introduced)
	for _, id := range p.Intake.WordIDs {
		if wordUnsettled(p, id) {
			status.Unsettled++
		}
		if wordDue(p, id, now) {
			status.Due++
		}
	}
	secondsPerWord := s.SecondsPerWord()
	earned := p.Intake.CreditSeconds / secondsPerWord
	status.Pending = max(0, min(earned-status.Introduced, status.Remaining))
	switch {
	case status.Unsettled >= s.Brake.MaxUnsettled:
		status.Paused = "practise"
	case status.Due >= s.Brake.MaxDue:
		status.Paused = "review"
	}
	if status.Paused != "" {
		status.Pending = 0
	} else if status.Pending == 0 && status.Remaining > 0 {
		status.NextWordInSeconds = secondsPerWord - p.Intake.CreditSeconds%secondsPerWord
	}
	return status
}

// introduceDue appends every word the current budget allows, in syllabus
// order, and returns the newly introduced IDs.
func introduceDue(p *Progress, s *Syllabus, now time.Time) []string {
	if s == nil {
		return nil
	}
	status := intakeStatus(p, s, now)
	if status.Pending == 0 {
		return nil
	}
	introduced := introducedSet(p)
	added := []string{}
	for _, id := range s.WordIDs {
		if len(added) == status.Pending {
			break
		}
		if introduced[id] {
			continue
		}
		p.Intake.WordIDs = append(p.Intake.WordIDs, id)
		added = append(added, id)
	}
	return added
}

// creditHeartbeat counts visible, connected play. A beat can never credit
// more than the wall time since the previous beat, the bank never runs more
// than bankCap words ahead of what was introduced, and paused intake earns
// nothing until the learner has caught up with their restored words.
func creditHeartbeat(p *Progress, s *Syllabus, seconds int, now time.Time) int {
	store.EnsureIntake(p)
	credited := max(0, min(seconds, maxHeartbeatSecond))
	if !p.Intake.LastBeatAt.IsZero() {
		elapsed := int(now.Sub(p.Intake.LastBeatAt).Seconds()) + heartbeatTolerance
		credited = max(0, min(credited, elapsed))
	}
	p.Intake.LastBeatAt = now.UTC()
	p.Intake.ActiveSeconds += credited
	if s == nil || intakeStatus(p, s, now).Paused != "" {
		return credited
	}
	cap := (len(p.Intake.WordIDs) + s.BankCap) * s.SecondsPerWord()
	p.Intake.CreditSeconds = min(p.Intake.CreditSeconds+credited, max(cap, p.Intake.CreditSeconds))
	return credited
}

// migrateIntake gives existing adventures the words they have already
// practised or needed, in syllabus order, so nobody loses access to a
// conversation they were in the middle of. New accounts receive only the
// opening allowance.
func migrateIntake(p *Progress, s *Syllabus) {
	ensureProgress(p)
	if s == nil || p.Intake.Version >= intakeVersion {
		return
	}
	keep := map[string]bool{}
	for id, word := range p.Words {
		if word.DirectAttempts > 0 {
			keep[id] = true
		}
	}
	for _, quest := range s.Quests {
		questID := quest.QuestID
		if contains(p.CompletedQuestIDs, questID) || p.Story.Nodes[questID] != "" {
			for _, id := range s.QuestWordIDs(questID) {
				keep[id] = true
			}
		}
	}
	for _, id := range p.Intake.WordIDs {
		keep[id] = true
	}
	ids := make([]string, 0, len(keep))
	for id := range keep {
		if _, scheduled := s.position[id]; scheduled {
			ids = append(ids, id)
		}
	}
	sort.Slice(ids, func(i, j int) bool { return s.position[ids[i]] < s.position[ids[j]] })
	p.Intake.WordIDs = ids
	p.Intake.CreditSeconds = max(p.Intake.CreditSeconds, max(s.OpeningWords, len(ids))*s.SecondsPerWord())
	p.Intake.Version = intakeVersion
}

// requireUnitVocabulary: a learning route opens once every word it teaches or
// uses has been introduced, so optional practice cannot outrun the budget.
func (a *App) requireUnitVocabulary(unit CourseUnit, p *Progress) error {
	if a.curriculum.Syllabus == nil {
		return nil
	}
	introduced := introducedSet(p)
	missing := 0
	seen := map[string]bool{}
	check := func(id string) {
		if _, scheduled := a.curriculum.Syllabus.position[id]; scheduled && !introduced[id] && !seen[id] {
			seen[id] = true
			missing++
		}
	}
	for _, id := range unit.RequiredWordIDs {
		check(id)
	}
	for _, id := range unit.RequiredExerciseIDs {
		for _, wordID := range exerciseWords(a.curriculum.Exercises[id]) {
			check(wordID)
		}
	}
	if missing == 0 {
		return nil
	}
	return &APIError{409, fmt.Sprintf("this route opens after %d more restored words", missing)}
}

func (a *App) requireWordIntroduced(exercise Exercise, p *Progress) error {
	if a.curriculum.Syllabus == nil || exercise.TargetWordID == "" {
		return nil
	}
	if _, scheduled := a.curriculum.Syllabus.position[exercise.TargetWordID]; !scheduled || p.WordIntroduced(exercise.TargetWordID) {
		return nil
	}
	return &APIError{409, "this word has not been restored yet; keep playing and it will return"}
}

type heartbeatInput struct {
	ID      string `json:"id"`
	Seconds int    `json:"seconds"`
}

// heartbeat credits a slice of visible, connected play and introduces any
// words the budget now allows. Clients send one beat per minute at most.
func (a *App) heartbeat(w http.ResponseWriter, r *http.Request) {
	hash, err := bearer(r)
	if err != nil {
		apiFailure(w, err)
		return
	}
	if !a.allow("intake:"+hash, 120) {
		writeError(w, 429, "too many heartbeats; try again in a minute")
		return
	}
	var input heartbeatInput
	if err = decodeJSON(w, r, &input); err != nil {
		apiFailure(w, err)
		return
	}
	if !safeID.MatchString(input.ID) || input.Seconds < 0 || input.Seconds > maxHeartbeatSecond {
		writeError(w, 400, "send a unique heartbeat ID and 0–120 seconds of play")
		return
	}
	request, _ := json.Marshal(input)
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()
	if input.Seconds > 0 {
		playing := true
		account, err := a.touchAccess(ctx, hash, &playing)
		if err != nil {
			apiFailure(w, err)
			return
		}
		if status := a.accessState(account, a.now().UTC()); accessBlocked(status) {
			writeAccessBlocked(w, status)
			return
		}
	}
	introduced := []string{}
	account, _, duplicate, err := a.mutate(ctx, hash, "intake:"+input.ID, request, func(account *Account) (Receipt, error) {
		now := a.now().UTC()
		migrateContextExposures(&account.Progress, a.curriculum, now)
		migrateIntake(&account.Progress, a.curriculum.Syllabus)
		creditHeartbeat(&account.Progress, a.curriculum.Syllabus, input.Seconds, now)
		introduced = introduceDue(&account.Progress, a.curriculum.Syllabus, now)
		return Receipt{}, nil
	})
	if err != nil {
		apiFailure(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"progress": account.Progress, "introduced": introduced, "status": intakeStatus(&account.Progress, a.curriculum.Syllabus, a.now().UTC()), "duplicate": duplicate})
}
