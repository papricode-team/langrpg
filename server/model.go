package main

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"time"

	fsrs "github.com/open-spaced-repetition/go-fsrs/v4"
)

var (
	ErrUnauthorized = errors.New("session is invalid")
	ErrConflict     = errors.New("idempotency key was already used for another request")
)

type Avatar struct {
	Face      string `json:"face,omitempty"`
	Hairstyle string `json:"hairstyle,omitempty"`
	Jacket    string `json:"jacket,omitempty"`
	Bottom    string `json:"bottom,omitempty"`
	Build     string `json:"build,omitempty"`
	Pants     string `json:"pants,omitempty"`
	Hair      string `json:"hair"`
	Skin      string `json:"skin"`
	Outfit    string `json:"outfit"`
}

type Player struct {
	InteriorID string  `json:"interiorId,omitempty"`
	MapID      string  `json:"mapId"`
	ID         string  `json:"id"`
	Name       string  `json:"name"`
	X          float64 `json:"x"`
	Y          float64 `json:"y"`
	Avatar     Avatar  `json:"avatar"`
}

type ModeStats struct {
	Attempts         int   `json:"attempts"`
	Correct          int   `json:"correct"`
	UnaidedSuccesses int   `json:"unaidedSuccesses"`
	TimedAttempts    int   `json:"timedAttempts,omitempty"`
	ResponseTimeMs   int64 `json:"responseTimeMs,omitempty"`
}

type Memory struct {
	ItemID        string               `json:"itemId"`
	StabilityDays float64              `json:"stabilityDays"`
	Difficulty    float64              `json:"difficulty"`
	Repetitions   int                  `json:"repetitions"`
	Lapses        int                  `json:"lapses"`
	LastSeenAt    time.Time            `json:"lastSeenAt"`
	DueAt         time.Time            `json:"dueAt"`
	ModeStats     map[string]ModeStats `json:"modeStats"`
	Cards         map[string]fsrs.Card `json:"cards"`
	PracticeDueAt map[string]time.Time `json:"practiceDueAt,omitempty"`
}

// Context exposure is distinct from evidence of independently recalling a word.
// Each modality has its own FSRS card and retention status.
type WordEvidence struct {
	ModeStats
	Status        string    `json:"status"`
	DueAt         time.Time `json:"dueAt"`
	StabilityDays float64   `json:"stabilityDays"`
}

type WordMemory struct {
	WordID           string               `json:"wordId"`
	Exposures        int                  `json:"exposures"`
	ContextExposures int                  `json:"contextExposures"`
	DirectAttempts   int                  `json:"directAttempts"`
	LastSeenAt       time.Time            `json:"lastSeenAt"`
	DueAt            time.Time            `json:"dueAt"`
	Mastery          string               `json:"mastery"`
	StabilityDays    float64              `json:"stabilityDays"`
	Difficulty       float64              `json:"difficulty"`
	Repetitions      int                  `json:"repetitions"`
	Lapses           int                  `json:"lapses"`
	ModeStats        map[string]ModeStats `json:"modeStats"`
	// Full cards live once in Progress.Items; public word evidence is compact.
	Cards         map[string]fsrs.Card    `json:"-"`
	PracticeDueAt map[string]time.Time    `json:"-"`
	Evidence      map[string]WordEvidence `json:"evidence"`
}

type ExerciseEvidence struct {
	ModeStats
	LastAttemptAt time.Time `json:"lastAttemptAt"`
	LastCorrectAt time.Time `json:"lastCorrectAt"`
}

type AttemptEvidence struct {
	ID         string    `json:"id"`
	ExerciseID string    `json:"exerciseId"`
	ItemID     string    `json:"itemId"`
	Mode       string    `json:"mode"`
	Correct    bool      `json:"correct"`
	Hinted     bool      `json:"hinted"`
	ActivityID string    `json:"activityId,omitempty"`
	RunID      string    `json:"runId,omitempty"`
	At         time.Time `json:"at"`
}

type ActivityProgress struct {
	ActivityID       string    `json:"activityId"`
	Level            string    `json:"level"`
	Completions      int       `json:"completions"`
	CompletedAt      time.Time `json:"completedAt"`
	LastCompletedAt  time.Time `json:"lastCompletedAt"`
	ExerciseIDs      []string  `json:"exerciseIds"`
	CorrectedAnswers int       `json:"correctedAnswers"`
}

type Progress struct {
	Revision            int64                       `json:"revision"`
	XP                  int                         `json:"xp"`
	CompletedQuestIDs   []string                    `json:"completedQuestIds"`
	Attempts            int                         `json:"attempts"`
	CorrectAttempts     int                         `json:"correctAttempts"`
	Items               map[string]Memory           `json:"items"`
	Words               map[string]WordMemory       `json:"words"`
	CompletedUnitIDs    []string                    `json:"completedUnitIds"`
	Activities          map[string]ActivityProgress `json:"activities"`
	ExerciseStats       map[string]ExerciseEvidence `json:"exerciseStats"`
	RecentAttempts      map[string]AttemptEvidence  `json:"recentAttempts"`
	WordExposureVersion int                         `json:"wordExposureVersion"`
	Story               StoryState                  `json:"story"`
}

type Account struct {
	Email                 string               `json:"email,omitempty"`
	PasswordHash          string               `json:"passwordHash,omitempty"`
	Player                Player               `json:"player"`
	Progress              Progress             `json:"progress"`
	CreatedAt             time.Time            `json:"createdAt"`
	StorySaves            map[string]StorySave `json:"storySaves,omitempty"`
	RewardedQuestIDs      []string             `json:"rewardedQuestIds,omitempty"`
	RewardedExpeditionIDs []string             `json:"rewardedExpeditionIds,omitempty"`
}

type Receipt struct {
	Correct       *bool             `json:"correct,omitempty"`
	XPAdded       int               `json:"xpAdded"`
	FSRSReview    *fsrs.ReviewLog   `json:"fsrsReview,omitempty"`
	ScheduledMode string            `json:"scheduledMode,omitempty"`
	Activity      *ActivityProgress `json:"activity,omitempty"`
}

type SavedAction struct {
	Request json.RawMessage `json:"request"`
	Receipt Receipt         `json:"receipt"`
	At      time.Time       `json:"at"`
}

func newProgress() Progress {
	p := Progress{WordExposureVersion: 2}
	ensureProgress(&p)
	return p
}

// Additive JSON/JSONB migration: old accounts retain their progress and gain
// empty fields. No reset, schema rewrite, or invented historical word evidence.
func ensureProgress(p *Progress) {
	if p.CompletedQuestIDs == nil {
		p.CompletedQuestIDs = []string{}
	}
	if p.Items == nil {
		p.Items = map[string]Memory{}
	}
	if p.Words == nil {
		p.Words = map[string]WordMemory{}
	}
	if p.CompletedUnitIDs == nil {
		p.CompletedUnitIDs = []string{}
	}
	if p.Activities == nil {
		p.Activities = map[string]ActivityProgress{}
	}
	if p.ExerciseStats == nil {
		p.ExerciseStats = map[string]ExerciseEvidence{}
	}
	if p.RecentAttempts == nil {
		p.RecentAttempts = map[string]AttemptEvidence{}
	}
	ensureStory(p)
}

func randomID(bytes int) (string, error) {
	b := make([]byte, bytes)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

func tokenHash(token string) string {
	h := sha256.Sum256([]byte(token))
	return hex.EncodeToString(h[:])
}

func cloneAccount(a Account) Account {
	b, _ := json.Marshal(a)
	var out Account
	_ = json.Unmarshal(b, &out)
	ensureProgress(&out.Progress)
	return out
}
