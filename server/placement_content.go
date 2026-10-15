package main

import "encoding/json"

const placementActiveSeconds = 10 * 60

func (a *App) placementEligible(account Account) bool {
	return account.Progress.Intake.ActiveSeconds >= placementActiveSeconds ||
		a.accessState(account, a.now().UTC()).PlayedSeconds >= placementActiveSeconds
}

// The authored diagnostic declares a fixed, small bank. Eligibility grants
// these reads and read-only grading without unlocking their story quests.
func (a *App) placementExerciseVisible(exerciseID string, account Account) bool {
	if a.content == nil || !a.placementEligible(account) {
		return false
	}
	course, ok := a.content.ByCourse[account.ActiveCourseID]
	if !ok {
		return false
	}
	record := a.content.ByID[a.content.IDs["context:placement:"+course.Slug]]
	if record.Kind != "context" || record.CourseID != account.ActiveCourseID {
		return false
	}
	var body struct {
		Category string `json:"category"`
		Data     struct {
			ExerciseIDs []string `json:"exerciseIds"`
		} `json:"data"`
	}
	if json.Unmarshal(record.Body, &body) != nil || body.Category != "placement" || len(body.Data.ExerciseIDs) != 8 {
		return false
	}
	for _, id := range body.Data.ExerciseIDs {
		ref := a.content.ByID[id]
		if ref.Kind == "exercise" && ref.CourseID == account.ActiveCourseID && a.canonical.Translate(ref.ID, false) == exerciseID {
			return true
		}
	}
	return false
}
