package main

import "fmt"

// This is the authored clue chain, rather than map order or CEFR settings.
var storyQuestOrder = []string{
	"a1-arrival", "a1-cafe", "a1-market", "a1-station", "a1-workshop", "a1-lost-parcel",
	"a2-apartment", "a2-evening-plans", "a2-rail-trip", "a2-broken-clock", "a2-clinic", "a2-archive",
	"b1-witness", "b1-new-route", "b1-work", "b1-council", "b1-storm", "b1-atlas",
}

func questPrerequisite(questID string, completed []string) string {
	if contains(completed, questID) {
		return ""
	}
	for _, id := range storyQuestOrder {
		if id == questID {
			return ""
		}
		if !contains(completed, id) {
			return id
		}
	}
	return ""
}

func routeUnlocked(mapID string, completed []string) bool {
	if mapID == DefaultMapID {
		return true
	}
	if mapID == "waldruh" || mapID == "nebelstadt" {
		milestone, later := "a1-lost-parcel", 6
		if mapID == "nebelstadt" {
			milestone, later = "a2-archive", 12
		}
		if contains(completed, milestone) {
			return true
		}
		// Earlier versions allowed quests out of order. Preserve a town in which
		// the saved player has already made a discovery, without inventing clues.
		for _, id := range storyQuestOrder[later:] {
			if contains(completed, id) {
				return true
			}
		}
		return false
	}
	return validMapID(mapID) && contains(completed, "b1-atlas")
}

func routeLockedError(mapID string) error {
	message := "Restore the three towns before exploring the coastline."
	if mapID == "waldruh" {
		message = "Find Lina's letter and restore the name Waldruh first."
	}
	if mapID == "nebelstadt" {
		message = "Obtain Ada's confession in Waldruh first."
	}
	return &APIError{403, message}
}

func requireQuestOrder(questID string, completed []string) error {
	known := contains(storyQuestOrder, questID)
	if known {
		if missing := questPrerequisite(questID, completed); missing != "" {
			return &APIError{409, fmt.Sprintf("follow the clue chain first (missing %s)", missing)}
		}
	}
	return nil
}
