package main

import (
	"context"
	"net/http"
	"strings"
	"time"
)

// Supported support languages. German is always the target language; the base
// language only selects which meanings, hints and interface text accompany it.
// Grading, scheduling and story rules never read it.
const (
	BaseLanguageEnglish = "en"
	BaseLanguageTurkish = "tr"
	BaseLanguageGerman  = "de"
)

// Preferences are per-account settings that follow the player across devices.
// Accounts saved before preferences existed normalise to English support.
type Preferences struct {
	BaseLanguage string `json:"baseLanguage,omitempty"`
}

func validBaseLanguage(value string) bool {
	return value == BaseLanguageEnglish || value == BaseLanguageTurkish
}

// normalizedPreferences fills safe defaults for old or partial saved state.
func normalizedPreferences(p Preferences) Preferences {
	if !validBaseLanguage(p.BaseLanguage) && p.BaseLanguage != BaseLanguageGerman {
		p.BaseLanguage = BaseLanguageEnglish
	}
	return p
}

func (a *App) updatePreferences(w http.ResponseWriter, r *http.Request) {
	hash, err := bearer(r)
	if err != nil {
		apiFailure(w, err)
		return
	}
	var input Preferences
	if err = decodeJSON(w, r, &input); err != nil {
		apiFailure(w, err)
		return
	}
	input.BaseLanguage = strings.TrimSpace(input.BaseLanguage)
	valid := validBaseLanguage(input.BaseLanguage)
	if a.content != nil {
		valid = contains(a.content.ByCourse[a.curriculum.CourseID].SupportLanguages, input.BaseLanguage)
	}
	if !valid {
		writeError(w, 400, "choose a support language declared by the active course")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()
	account, err := a.store.UpdatePreferences(ctx, hash, input)
	if err != nil {
		apiFailure(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"preferences": normalizedPreferences(account.Preferences)})
}
