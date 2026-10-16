package main

import (
	"encoding/json"
	"glotworld/server/internal/world"
	"slices"
)

type stationRoom struct {
	CourseID   string
	MapID      string
	InteriorID string
	Level      string
}

// Room stations and their linked activities grant access to their authored
// exercises. The ordinary word-introduction checks still guard grading.
func (a *App) indexStationExercises() {
	a.stationRooms = map[string][]stationRoom{}
	activities := map[string][]stationRoom{}
	add := func(exercise string, room stationRoom) {
		record := a.content.ByID[exercise]
		if record.Kind == "exercise" && record.CourseID == room.CourseID && !slices.Contains(a.stationRooms[exercise], room) {
			a.stationRooms[exercise] = append(a.stationRooms[exercise], room)
		}
	}
	for _, record := range a.content.Records {
		if record.Kind != "context" {
			continue
		}
		var body map[string]any
		if json.Unmarshal(record.Body, &body) != nil || stringValue(body["category"]) != "interior" {
			continue
		}
		data, _ := body["data"].(map[string]any)
		mapID := stringValue(data["mapId"])
		if mapID == "" {
			mapID = DefaultMapID
		}
		room := stationRoom{CourseID: record.CourseID, MapID: mapID, InteriorID: stringValue(data["id"])}
		// Whether the town still has the room is checked when stations are shown.
		if !validMapID(room.MapID) || room.InteriorID != "" && !world.KnownInterior(room.InteriorID) {
			continue
		}
		for _, entry := range anyValues(data["objects"]) {
			station, _ := entry.(map[string]any)
			for _, exercise := range stringValues(station["exerciseIds"]) {
				add(exercise, room)
			}
			if activity := stringValue(station["activityId"]); activity != "" {
				key := room.CourseID + ":" + activity
				if !slices.Contains(activities[key], room) {
					activities[key] = append(activities[key], room)
				}
			}
		}
	}
	for _, record := range a.content.Records {
		if record.Kind != "context" {
			continue
		}
		var body map[string]any
		if json.Unmarshal(record.Body, &body) != nil || stringValue(body["category"]) != "activityScenario" {
			continue
		}
		data, _ := body["data"].(map[string]any)
		for _, room := range activities[record.CourseID+":"+stringValue(data["activityId"])] {
			if route := stringValue(data["mapId"]); route == "" || route == room.MapID {
				room.Level = stringValue(data["level"])
				add(stringValue(data["exerciseId"]), room)
			}
		}
	}
}

func (a *App) stationExerciseVisible(exerciseID string, account Account) bool {
	if a.canonical == nil {
		return false
	}
	for _, room := range a.stationRooms[a.canonical.Translate(exerciseID, true)] {
		if room.CourseID == account.ActiveCourseID && a.validInterior(room.MapID, room.InteriorID) && routeUnlocked(room.MapID, account.Progress.CompletedQuestIDs) && a.levelVisible(room.Level, account) {
			return true
		}
	}
	return false
}
