package main

import (
	"glotworld/server/internal/avatar"
	"glotworld/server/internal/store"
	"glotworld/server/internal/world"
)

// The HTTP layer uses the domain types of the internal packages under their
// established names. These are aliases, not copies: values cross package
// boundaries unchanged.
type (
	Avatar = avatar.Avatar

	Store               = store.Store
	JSONStore           = store.JSONStore
	PGStore             = store.PGStore
	Account             = store.Account
	CourseState         = store.CourseState
	Progress            = store.Progress
	Memory              = store.Memory
	WordMemory          = store.WordMemory
	WordEvidence        = store.WordEvidence
	ModeStats           = store.ModeStats
	ExerciseEvidence    = store.ExerciseEvidence
	AttemptEvidence     = store.AttemptEvidence
	ActivityProgress    = store.ActivityProgress
	Receipt             = store.Receipt
	SavedAction         = store.SavedAction
	Intake              = store.Intake
	StoryState          = store.StoryState
	InkRecord           = store.InkRecord
	StorySave           = store.StorySave
	ExpeditionRecord    = store.ExpeditionRecord
	ExpeditionPlanState = store.ExpeditionPlanState
	DailyPromise        = store.DailyPromise
	DailyPromiseRecord  = store.DailyPromiseRecord
	Preferences         = store.Preferences
	PlayAccess          = store.PlayAccess
	ReferralState       = store.ReferralState
	AccountSupport      = store.AccountSupport
	SupportGrant        = store.SupportGrant
	PasswordReset       = store.PasswordReset
	SupportSession      = store.SupportSession
	AdminAuditEntry     = store.AdminAuditEntry
	AnalyticsMilestones = store.AnalyticsMilestones
	AnalyticsEvent      = store.AnalyticsEvent
	AnalyticsFact       = store.AnalyticsFact
	AnalyticsAccount    = store.AnalyticsAccount
	CredentialChange    = store.CredentialChange

	Player               = world.Player
	MapSpawn             = world.MapSpawn
	WorldRange           = world.Range
	WorldCoordinateFrame = world.CoordinateFrame
	WorldMapDefinition   = world.MapDefinition
	WorldMapRegistry     = world.MapRegistry
	WorldIdentity        = world.Identity
	SharedWorldClock     = world.SharedClock
)

const (
	BaseLanguageEnglish = store.BaseLanguageEnglish
	BaseLanguageTurkish = store.BaseLanguageTurkish
	BaseLanguageGerman  = store.BaseLanguageGerman
)

// Storage errors keep their established names in the HTTP layer.
var (
	ErrUnauthorized        = store.ErrUnauthorized
	ErrConflict            = store.ErrConflict
	ErrCredentialsConflict = store.ErrCredentialsConflict
	ErrCredentialsChanged  = store.ErrCredentialsChanged
)
