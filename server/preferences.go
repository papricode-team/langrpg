package main

import (
	"context"
	"glotworld/server/internal/store"
	"net/http"
	"strings"
	"time"
)

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
	valid := store.ValidBaseLanguage(input.BaseLanguage)
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
	writeJSON(w, 200, map[string]any{"preferences": store.NormalizePreferences(account.Preferences)})
}
