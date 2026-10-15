package store

import (
	"encoding/json"
	"errors"
	"glotworld/server/internal/billing"
	"glotworld/server/internal/world"
	"slices"
	"time"

	fsrs "github.com/open-spaced-repetition/go-fsrs/v4"
)

var (
	// ErrCourseChanged reports a write against a course the account has since
	// left; the client must reload that course's saved state.
	ErrCourseChanged = errors.New("the active course changed; reload its saved state")
	ErrUnauthorized  = errors.New("session is invalid")
	ErrConflict      = errors.New("idempotency key was already used for another request")
)

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
	ID                string    `json:"id"`
	ExerciseID        string    `json:"exerciseId"`
	ItemID            string    `json:"itemId"`
	Mode              string    `json:"mode"`
	Correct           bool      `json:"correct"`
	Hinted            bool      `json:"hinted"`
	MiniGameID        string    `json:"miniGameId,omitempty"`
	AnswerKind        string    `json:"answerKind,omitempty"`
	ContextExerciseID string    `json:"contextExerciseId,omitempty"`
	RegionID          string    `json:"regionId,omitempty"`
	ContentID         string    `json:"contentId,omitempty"`
	Level             string    `json:"level,omitempty"`
	SelectedValue     *int      `json:"selectedValue,omitempty"`
	ActivityID        string    `json:"activityId,omitempty"`
	RunID             string    `json:"runId,omitempty"`
	At                time.Time `json:"at"`
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
	Revision            int64                           `json:"revision"`
	XP                  int                             `json:"xp"`
	CompletedQuestIDs   []string                        `json:"completedQuestIds"`
	Attempts            int                             `json:"attempts"`
	CorrectAttempts     int                             `json:"correctAttempts"`
	Items               map[string]Memory               `json:"items"`
	Words               map[string]WordMemory           `json:"words"`
	CompletedUnitIDs    []string                        `json:"completedUnitIds"`
	Activities          map[string]ActivityProgress     `json:"activities"`
	AnswerHelpAt        map[string]time.Time            `json:"answerHelpAt,omitempty"`
	ExerciseStats       map[string]ExerciseEvidence     `json:"exerciseStats"`
	RecentAttempts      map[string]AttemptEvidence      `json:"recentAttempts"`
	MiniGameStats       map[string]ModeStats            `json:"miniGameStats,omitempty"`
	FormStats           map[string]map[string]ModeStats `json:"formStats,omitempty"`
	WordExposureVersion int                             `json:"wordExposureVersion"`
	// Daily learning evidence survives narrative save-slot loads.
	DailyPromises map[string]DailyPromiseRecord `json:"dailyPromises,omitempty"`
	// Vocabulary intake: credited play and the syllabus words introduced so far.
	Intake Intake     `json:"intake"`
	Story  StoryState `json:"story"`
}

type Account struct {
	Support               AccountSupport         `json:"support,omitempty"`
	Analytics             AnalyticsMilestones    `json:"analytics,omitempty"`
	Referrals             ReferralState          `json:"referrals,omitempty"`
	ActiveCourseID        string                 `json:"activeCourseId,omitempty"`
	CourseStates          map[string]CourseState `json:"courseStates,omitempty"`
	Access                PlayAccess             `json:"access,omitempty"`
	Billing               billing.State          `json:"billing,omitempty"`
	Email                 string                 `json:"email,omitempty"`
	PasswordHash          string                 `json:"passwordHash,omitempty"`
	Player                world.Player           `json:"player"`
	Progress              Progress               `json:"progress"`
	CreatedAt             time.Time              `json:"createdAt"`
	StorySaves            map[string]StorySave   `json:"storySaves,omitempty"`
	RewardedQuestIDs      []string               `json:"rewardedQuestIds,omitempty"`
	RewardedExpeditionIDs []string               `json:"rewardedExpeditionIds,omitempty"`
	Preferences           Preferences            `json:"preferences,omitempty"`
}

// Billing and credentials stay account scoped. Everything earned through play,
// including narrative saves and reward ledgers, travels with its course.
type CourseState struct {
	Progress              Progress              `json:"progress"`
	Player                world.Player          `json:"player"`
	LocationFrame         world.CoordinateFrame `json:"locationFrame,omitempty"`
	StorySaves            map[string]StorySave  `json:"storySaves,omitempty"`
	RewardedQuestIDs      []string              `json:"rewardedQuestIds,omitempty"`
	RewardedExpeditionIDs []string              `json:"rewardedExpeditionIds,omitempty"`
	SupportLanguage       string                `json:"supportLanguage"`
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

// EnsureContainers gives decoded progress every collection it may be missing
// (additive JSON/JSONB migration: old accounts keep their progress and gain
// empty fields). Story repairs are domain rules supplied through Hooks.
func EnsureContainers(p *Progress) {
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
	if p.MiniGameStats == nil {
		p.MiniGameStats = map[string]ModeStats{}
	}
	if p.FormStats == nil {
		p.FormStats = map[string]map[string]ModeStats{}
	}
	if p.DailyPromises == nil {
		p.DailyPromises = map[string]DailyPromiseRecord{}
	}
	EnsureIntake(p)
}

// Supported support languages. German is always the target language; the base
// language only selects which meanings, hints and interface text accompany it.
// Grading, scheduling and story rules never read it.
const (
	BaseLanguageEnglish = "en"
	BaseLanguageTurkish = "tr"
	BaseLanguageGerman  = "de"
)

type SupportGrant struct {
	Lifetime bool      `json:"lifetime"`
	Until    time.Time `json:"until"`
}

type PasswordReset struct {
	Hash      string    `json:"hash,omitempty"`
	ExpiresAt time.Time `json:"expiresAt,omitempty"`
}

type SupportSession struct {
	ActorSession string    `json:"actorSession"`
	ExpiresAt    time.Time `json:"expiresAt"`
}

type AdminAuditEntry struct {
	At         time.Time `json:"at"`
	ActorID    string    `json:"actorId"`
	ActorEmail string    `json:"actorEmail"`
	Action     string    `json:"action"`
	Reason     string    `json:"reason"`
}

type AccountSupport struct {
	Grant    SupportGrant              `json:"grant"`
	Reset    PasswordReset             `json:"reset,omitempty"`
	Sessions map[string]SupportSession `json:"sessions,omitempty"`
	Audit    []AdminAuditEntry         `json:"audit,omitempty"`
}

// Milestones are written with account transactions and survive event retention / game resets.
type AnalyticsMilestones struct {
	RegisteredAt time.Time `json:"registeredAt,omitempty"`
	ActivatedAt  time.Time `json:"activatedAt,omitempty"`
	PaidAt       time.Time `json:"paidAt,omitempty"`
}

type ExpeditionPlanState struct {
	Level     string         `json:"level"`
	Values    map[string]int `json:"values"`
	Order     []string       `json:"order"`
	Completed bool           `json:"completed"`
	Attempts  int            `json:"attempts"`
}

// Intake is the vocabulary governor: how much active play an account has
// credited toward new words, and which syllabus words it has introduced so
// far. Only the server appends to WordIDs, always in syllabus order.
type Intake struct {
	Version       int       `json:"version"`
	ActiveSeconds int       `json:"activeSeconds"`
	CreditSeconds int       `json:"creditSeconds"`
	LastBeatAt    time.Time `json:"lastBeatAt"`
	WordIDs       []string  `json:"wordIds"`
}

func EnsureIntake(p *Progress) {
	if p.Intake.WordIDs == nil {
		p.Intake.WordIDs = []string{}
	}
}

func (p *Progress) WordIntroduced(id string) bool { return slices.Contains(p.Intake.WordIDs, id) }

// Preferences are per-account settings that follow the player across devices.
// Accounts saved before preferences existed normalise to English support.
type Preferences struct {
	BaseLanguage string `json:"baseLanguage,omitempty"`
}

func ValidBaseLanguage(value string) bool {
	return value == BaseLanguageEnglish || value == BaseLanguageTurkish
}

// NormalizePreferences fills safe defaults for old or partial saved state.
func NormalizePreferences(p Preferences) Preferences {
	if !ValidBaseLanguage(p.BaseLanguage) && p.BaseLanguage != BaseLanguageGerman {
		p.BaseLanguage = BaseLanguageEnglish
	}
	return p
}

// The public invite code is the existing opaque player ID, never a session token.
// Enabled records that this registered player issued an invite during free play.
type ReferralState struct {
	Enabled           bool   `json:"enabled,omitempty"`
	InvitedBy         string `json:"invitedBy,omitempty"`
	SuccessfulSignups int64  `json:"successfulSignups,omitempty"`
	ResetSignups      int64  `json:"resetSignups,omitempty"`
}

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

type StoryState struct {
	Flags           map[string]bool                `json:"flags"`
	Inventory       []string                       `json:"inventory"`
	Reputation      map[string]int                 `json:"reputation"`
	Bell            int                            `json:"bell"`
	BellWarnings    int                            `json:"bellWarnings"`
	GateFailures    map[string]int                 `json:"gateFailures"`
	Day             int                            `json:"day"`
	LanternStreak   int                            `json:"lanternStreak"`
	Promise         DailyPromise                   `json:"promise"`
	Nodes           map[string]string              `json:"nodes"`
	Choices         map[string]string              `json:"choices"`
	Ending          string                         `json:"ending,omitempty"`
	Expeditions     map[string]ExpeditionRecord    `json:"expeditions"`
	ExpeditionPlans map[string]ExpeditionPlanState `json:"expeditionPlans"`
	Inspections     map[string][]string            `json:"inspections"`
	GateAttempts    map[string][]string            `json:"gateAttempts"`
}

type ExpeditionRecord struct {
	Selected int  `json:"selected"`
	Correct  bool `json:"correct"`
	Attempts int  `json:"attempts"`
}

type StorySave struct {
	Slot              string     `json:"slot"`
	Name              string     `json:"name"`
	At                time.Time  `json:"at"`
	Story             StoryState `json:"story"`
	CompletedQuestIDs []string   `json:"completedQuestIds"`
}

// PlayAccess is separate from learning intake: client-supplied seconds, story
// saves and idempotent learning receipts can never grant more free play.
// The account-wide lease prevents reconnects or another tab resetting time.
type PlayAccess struct {
	ResetTrial        bool                 `json:"resetTrial,omitempty"`
	Generation        int64                `json:"generation,omitempty"`
	PlayedNanoseconds int64                `json:"playedNanoseconds,omitempty"`
	ActiveSince       time.Time            `json:"activeSince,omitempty"`
	ActiveUntil       time.Time            `json:"activeUntil,omitempty"`
	SessionLeases     map[string]time.Time `json:"sessionLeases,omitempty"`
}

// attemptRequest is the part of a stored attempt request the store reads.
type attemptRequest struct {
	ExerciseID string `json:"exerciseId"`
	Answer     string `json:"answer"`
	ActivityID string `json:"activityId,omitempty"`
	RunID      string `json:"runId,omitempty"`
	Preview    bool   `json:"preview,omitempty"`
}

// ContentImportInfo describes the last content import recorded by
// cmd/import-content.
type ContentImportInfo struct {
	At       time.Time
	Duration time.Duration
	Known    bool
}
