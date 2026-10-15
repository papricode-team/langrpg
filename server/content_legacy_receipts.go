package main

import (
	"context"
	"glotworld/server/internal/store"
)

func (a *App) hasRecordedExercise(ctx context.Context, hash string, account Account, exerciseID string) (bool, error) {
	if account.Progress.ExerciseStats[exerciseID].Attempts > 0 {
		return true, nil
	}
	if a.canonical == nil {
		return false, nil
	}
	reader, ok := a.canonical.Store.(store.ExerciseReceiptReader)
	if !ok {
		return false, nil
	}
	legacy := account.ActiveCourseID == a.canonical.DefaultCourse()
	eligible, err := reader.ExerciseReceiptExists(ctx, hash, account.ActiveCourseID, exerciseID, forwardID(a.canonical, exerciseID), legacy)
	if err != nil || eligible {
		return eligible, err
	}
	if legacy && a.content != nil {
		if published := a.content.PublishedIDs["exercises:"+exerciseID]; published != "" {
			return reader.ExerciseReceiptExists(ctx, hash, account.ActiveCourseID, exerciseID, published, true)
		}
	}
	return false, nil
}

func forwardID(c *store.Canonical, slug string) string {
	id, _ := c.ForwardID(slug)
	return id
}
