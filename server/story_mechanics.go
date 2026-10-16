package main

import (
	"context"
	"encoding/json"
	"math"
	"net/http"
	"sync"
	"time"
)

// The Atlas has one rule: what nobody says, it forgets. Act I shows it through
// names; Acts II and III add words for time and for agreement. The ink registry
// makes that rule playable. Each entry is a name or word written somewhere in a
// town. It starts fading when its story beat happens and fades over visible play
// time (never while the player is away). Saying the name in German beside it
// darkens the ink again. A story name that fades completely cracks the bell;
// restoring it heals the crack.

// InkEntry is one fading name in the world.
type InkEntry struct {
	ID       string   `json:"id"`
	MapID    string   `json:"mapId"`
	Anchor   string   `json:"anchor,omitempty"`
	X        float64  `json:"x"`
	Y        float64  `json:"y"`
	Kind     string   `json:"kind"`
	German   string   `json:"german"`
	English  string   `json:"english"`
	Accepted []string `json:"accepted,omitempty"`
	From     string   `json:"from,omitempty"`
	FromFlag string   `json:"fromFlag,omitempty"`
	// Until ends the writing (a plate taken down); Keep makes it safe for good.
	Until     string `json:"until,omitempty"`
	UntilFlag string `json:"untilFlag,omitempty"`
	Keep      string `json:"keep,omitempty"`
	// While this flag holds the name is lost (a route closed again in Act III).
	DarkFlag   string   `json:"darkFlag,omitempty"`
	Display    string   `json:"display,omitempty"`
	RestoredBy []string `json:"restoredBy,omitempty"`
	// Story names crack the bell when lost; optional ticket names never do.
	Bell bool `json:"bell,omitempty"`
	// Unspoken names (the W on the board) can only return through the story.
	Silent bool   `json:"silent,omitempty"`
	Side   string `json:"side,omitempty"`
}

// InkRegistry is authored in story_rules.json beside the scene rules.
type InkRegistry struct {
	DecaySeconds int        `json:"decaySeconds"`
	PaleBelow    float64    `json:"paleBelow"`
	Entries      []InkEntry `json:"entries"`
}

// InkRecord is the saved state of one entry. SpokenAt is measured in the
// account's visible play seconds.

// SideQuest is an optional ticket from Otto's office: a forgotten name and an
// address. Saying the name at the address returns it to the town.
type SideQuest struct {
	ID       string            `json:"id"`
	MapID    string            `json:"mapId"`
	Host     string            `json:"host"`
	Kind     string            `json:"kind"`
	Anchor   string            `json:"anchor,omitempty"`
	X        float64           `json:"x"`
	Y        float64           `json:"y"`
	German   string            `json:"german"`
	English  string            `json:"english"`
	Accepted []string          `json:"accepted,omitempty"`
	Place    map[string]string `json:"place"`
	Memory   map[string]string `json:"memory"`
	Requires StoryCondition    `json:"requires"`
	Quest    string            `json:"quest,omitempty"`
	XP       int               `json:"xp"`
	Ink      string            `json:"ink,omitempty"`
	// Group names a set of errands; finishing the last one sets the group's flag.
	Group string `json:"group,omitempty"`
}

type storyMechanics struct {
	Ink        InkRegistry `json:"ink"`
	SideQuests []SideQuest `json:"sideQuests"`
}

var mechanicsCache struct {
	sync.Mutex
	source []byte
	value  storyMechanics
}

const defaultInkDecaySeconds = 1500

// loadStoryMechanics reads the registry that travels with the scene rules. The
// result is cached until the underlying manifest changes.
func loadStoryMechanics(data []byte) storyMechanics {
	mechanicsCache.Lock()
	defer mechanicsCache.Unlock()
	if mechanicsCache.source != nil && string(mechanicsCache.source) == string(data) {
		return mechanicsCache.value
	}
	var value storyMechanics
	_ = json.Unmarshal(data, &value)
	if value.Ink.DecaySeconds <= 0 {
		value.Ink.DecaySeconds = defaultInkDecaySeconds
	}
	if value.Ink.PaleBelow <= 0 {
		value.Ink.PaleBelow = .5
	}
	mechanicsCache.source = append([]byte{}, data...)
	mechanicsCache.value = value
	return value
}

func currentStoryMechanics() storyMechanics {
	data, err := curriculumFiles.ReadFile("story_rules.json")
	if err != nil {
		return storyMechanics{Ink: InkRegistry{DecaySeconds: defaultInkDecaySeconds, PaleBelow: .5}}
	}
	return loadStoryMechanics(data)
}

// mechanics prefers positions published by the world editor, so ink plates and
// ticket addresses follow edited buildings.
func (a *App) mechanics() storyMechanics {
	value := currentStoryMechanics()
	if a.editing == nil {
		return value
	}
	a.editing.mu.RLock()
	defer a.editing.mu.RUnlock()
	published := a.editing.current.Investigations
	positions := map[string]MapSpawn{}
	for _, entry := range published.Ink.Entries {
		positions["ink:"+entry.ID] = MapSpawn{X: entry.X, Y: entry.Y}
	}
	for _, side := range published.SideQuests {
		positions["side:"+side.ID] = MapSpawn{X: side.X, Y: side.Y}
	}
	if len(positions) == 0 {
		return value
	}
	copyValue := storyMechanics{Ink: value.Ink, SideQuests: append([]SideQuest{}, value.SideQuests...)}
	copyValue.Ink.Entries = append([]InkEntry{}, value.Ink.Entries...)
	for i, entry := range copyValue.Ink.Entries {
		if position, ok := positions["ink:"+entry.ID]; ok {
			copyValue.Ink.Entries[i].X, copyValue.Ink.Entries[i].Y = position.X, position.Y
		}
	}
	for i, side := range copyValue.SideQuests {
		if position, ok := positions["side:"+side.ID]; ok {
			copyValue.SideQuests[i].X, copyValue.SideQuests[i].Y = position.X, position.Y
		}
	}
	return copyValue
}

// inkStarted reports whether the writing exists for this player now.
func inkStarted(entry InkEntry, p *Progress) bool {
	if entry.From != "" && !contains(p.CompletedQuestIDs, entry.From) {
		return false
	}
	if entry.FromFlag != "" && !p.Story.Flags[entry.FromFlag] {
		return false
	}
	if entry.UntilFlag != "" && p.Story.Flags[entry.UntilFlag] {
		return false
	}
	return entry.Until == "" || !contains(p.CompletedQuestIDs, entry.Until)
}

// inkKept is true once the name is safe for good.
func inkKept(entry InkEntry, p *Progress) bool {
	if entry.Keep != "" && contains(p.CompletedQuestIDs, entry.Keep) {
		return true
	}
	if entry.Side != "" && p.Story.Flags["side:"+entry.Side] {
		return true
	}
	return p.Story.Ink[entry.ID].Kept
}

// inkActive reports whether the entry is fading for this player now.
func inkActive(entry InkEntry, p *Progress) bool {
	return inkStarted(entry, p) && !inkKept(entry, p)
}

// inkLevel is 1 for fresh ink and 0 for a lost name.
func inkLevel(entry InkEntry, p *Progress, decay int) float64 {
	if !inkActive(entry, p) {
		return 1
	}
	if entry.DarkFlag != "" && p.Story.Flags[entry.DarkFlag] {
		return 0
	}
	record, ok := p.Story.Ink[entry.ID]
	if !ok {
		return 1
	}
	elapsed := p.Intake.ActiveSeconds - record.SpokenAt
	if elapsed <= 0 {
		return 1
	}
	return math.Max(0, 1-float64(elapsed)/float64(max(1, decay)))
}

// refreshInk starts newly active entries at full ink, darkens names a finished
// scene said aloud, and recomputes how many story names are lost.
func refreshInk(p *Progress, registry InkRegistry, completedNow string) int {
	s := &p.Story
	if s.Ink == nil {
		s.Ink = map[string]InkRecord{}
	}
	lost := 0
	for _, entry := range registry.Entries {
		record, seen := s.Ink[entry.ID]
		if !inkActive(entry, p) {
			continue
		}
		if !seen {
			s.Ink[entry.ID] = InkRecord{SpokenAt: p.Intake.ActiveSeconds}
			continue
		}
		if completedNow != "" && contains(entry.RestoredBy, completedNow) {
			record.SpokenAt = p.Intake.ActiveSeconds
			s.Ink[entry.ID] = record
			continue
		}
		if entry.Bell && inkLevel(entry, p, registry.DecaySeconds) <= 0 {
			lost++
		}
	}
	return lost
}

// applyInkToBell lets lost names crack the bell. The ink contribution is kept
// separately so a restored name heals the crack; warnings never exceed two, so
// the finale's seventh bell is always the story's own.
func applyInkToBell(s *StoryState, lost, limit int) {
	base := max(0, s.Bell-s.InkWarnings)
	extra := max(0, min(lost, 2-min(2, s.BellWarnings)))
	s.Bell = min(limit, base+extra)
	s.InkWarnings = s.Bell - base
	s.InkLost = lost
}

func inkEntryByID(registry InkRegistry, id string) (InkEntry, bool) {
	for _, entry := range registry.Entries {
		if entry.ID == id {
			return entry, true
		}
	}
	return InkEntry{}, false
}

func nameExercise(german string, accepted []string) Exercise {
	return Exercise{ID: "ink-name", Mode: "production", Answer: german, AcceptedAnswers: accepted, CaseSensitive: false}
}

type inkInput struct {
	ID     string `json:"id"`
	Entry  string `json:"entry"`
	Answer string `json:"answer"`
}

// speakInk restores one fading name when the player says it beside the writing.
func (a *App) speakInk(w http.ResponseWriter, r *http.Request) {
	hash, err := bearer(r)
	if err != nil {
		apiFailure(w, err)
		return
	}
	var input inkInput
	if err = decodeJSON(w, r, &input); err != nil {
		apiFailure(w, err)
		return
	}
	mechanics := a.mechanics()
	entry, ok := inkEntryByID(mechanics.Ink, input.Entry)
	if !ok || !safeID.MatchString(input.ID) {
		writeError(w, 400, "unknown name or action ID")
		return
	}
	if entry.Silent {
		writeError(w, 409, "nobody remembers this name yet; the story will bring it back")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()
	request, _ := json.Marshal(input)
	correct := false
	account, _, duplicate, err := a.mutate(ctx, hash, "story-ink:"+input.ID, request, func(account *Account) (Receipt, error) {
		ensureStory(&account.Progress)
		if !inkActive(entry, &account.Progress) {
			return Receipt{}, &APIError{409, "this name is not fading"}
		}
		// The player's own name is on the ticket they carry.
		if entry.Kind != "hud" && !a.nearCourseStoryTarget(account, entry.MapID, MapSpawn{X: entry.X, Y: entry.Y}, storyEvidenceRange) {
			return Receipt{}, &APIError{409, "walk to the writing first"}
		}
		expected := entry.German
		if expected == "{name}" {
			expected = account.Player.Name
		}
		if !nameExercise(expected, entry.Accepted).Grade(input.Answer) {
			return Receipt{}, nil
		}
		correct = true
		s := &account.Progress.Story
		record := s.Ink[entry.ID]
		record.SpokenAt = account.Progress.Intake.ActiveSeconds
		record.Spoken++
		s.Ink[entry.ID] = record
		ensureStory(&account.Progress)
		return Receipt{}, nil
	})
	if err != nil {
		apiFailure(w, err)
		return
	}
	if duplicate {
		level := inkLevel(entry, &account.Progress, mechanics.Ink.DecaySeconds)
		correct = level > .99
	}
	writeJSON(w, 200, map[string]any{"story": account.Progress.Story, "progress": account.Progress, "correct": correct, "duplicate": duplicate})
}

func sideQuestByID(mechanics storyMechanics, id string) (SideQuest, bool) {
	for _, side := range mechanics.SideQuests {
		if side.ID == id {
			return side, true
		}
	}
	return SideQuest{}, false
}

func sideQuestOpen(side SideQuest, p *Progress) bool {
	if side.Quest != "" && !contains(p.CompletedQuestIDs, side.Quest) {
		return false
	}
	return side.Requires.met(&p.Story)
}

func sideGroupComplete(mechanics storyMechanics, group string, s *StoryState) bool {
	for _, side := range mechanics.SideQuests {
		if side.Group == group && !s.Flags["side:"+side.ID] {
			return false
		}
	}
	return true
}

// completeSideQuest returns a ticket's name to the town.
func (a *App) completeSideQuest(w http.ResponseWriter, r *http.Request) {
	hash, err := bearer(r)
	if err != nil {
		apiFailure(w, err)
		return
	}
	var input inkInput
	if err = decodeJSON(w, r, &input); err != nil {
		apiFailure(w, err)
		return
	}
	side, ok := sideQuestByID(a.mechanics(), input.Entry)
	if !ok || !safeID.MatchString(input.ID) {
		writeError(w, 400, "unknown ticket or action ID")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()
	request, _ := json.Marshal(input)
	correct := false
	account, receipt, duplicate, err := a.mutate(ctx, hash, "story-side:"+input.ID, request, func(account *Account) (Receipt, error) {
		ensureStory(&account.Progress)
		s := &account.Progress.Story
		if s.Flags["side:"+side.ID] {
			return Receipt{}, &APIError{409, "this name is already back in town"}
		}
		if !sideQuestOpen(side, &account.Progress) {
			return Receipt{}, &APIError{409, "nobody has asked you about this name yet"}
		}
		if !a.nearCourseStoryTarget(account, side.MapID, MapSpawn{X: side.X, Y: side.Y}, storyEvidenceRange) {
			return Receipt{}, &APIError{409, "walk to the address on the ticket first"}
		}
		if !nameExercise(side.German, side.Accepted).Grade(input.Answer) {
			return Receipt{}, nil
		}
		correct = true
		s.Flags["side:"+side.ID] = true
		if side.Group != "" && sideGroupComplete(a.mechanics(), side.Group, s) {
			s.Flags[side.Group] = true
		}
		// A returned name also darkens the writing it belongs to.
		if record, written := s.Ink[side.Ink]; side.Ink != "" && written {
			record.SpokenAt = account.Progress.Intake.ActiveSeconds
			s.Ink[side.Ink] = record
		}
		account.Progress.XP += side.XP
		ensureStory(&account.Progress)
		return Receipt{XPAdded: side.XP}, nil
	})
	if err != nil {
		apiFailure(w, err)
		return
	}
	added := receipt.XPAdded
	if duplicate {
		added = 0
		correct = account.Progress.Story.Flags["side:"+side.ID]
	}
	writeJSON(w, 200, map[string]any{"story": account.Progress.Story, "progress": account.Progress, "correct": correct, "xpAdded": added, "duplicate": duplicate})
}
