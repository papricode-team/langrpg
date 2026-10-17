package main

import "fmt"

// This is the authored clue chain, rather than map order or CEFR settings.
var prologueQuestOrder = []string{"a0-ticket", "a0-name", "a0-wagen", "a0-tee", "a0-wo", "a0-langsam", "a0-morgen"}

var storyQuestOrder = []string{
	"a1-arrival", "a1-cafe", "a1-timetable", "a1-notice", "a1-shopping", "a1-room",
	"a1-market", "a1-chalk", "a1-neighbour", "a1-pharmacy", "a1-directions", "a1-bench",
	"a1-station", "a1-phone", "a1-weather", "a1-workshop", "a1-office-window", "a1-bike",
	"a1-lost-found", "a1-invitation", "a1-lost-parcel", "a1-departure", "a2-apartment", "a2-upstairs",
	"a2-evening-plans", "a2-ink-seller", "a2-rail-trip", "a2-forest-rails", "a2-broken-clock", "a2-clinic",
	"a2-cellar", "a2-archive", "b1-witness", "b1-record-room", "b1-new-route", "b1-signalman",
	"b1-work", "b1-council", "b1-temptation", "b1-storm", "b1-atlas",
}

// The last scene of each act opens the next town.
const (
	actOneFinale = "a1-departure"
	actTwoFinale = "a2-archive"
)

func storyQuestIndex(questID string) int {
	for index, id := range storyQuestOrder {
		if id == questID {
			return index
		}
	}
	return -1
}

// storyQuestsThrough returns the chain up to and including questID.
func storyQuestsThrough(questID string) []string {
	return storyQuestOrder[:storyQuestIndex(questID)+1]
}

// Scenes inserted after adventures had already begun (everyday errands and the
// expansion scenes in every act). A save that has completed a later scene may
// skip them; every original scene still counts.
var insertedStoryQuests = map[string]bool{
	"a1-timetable": true, "a1-notice": true, "a1-room": true, "a1-shopping": true,
	"a1-chalk": true, "a1-neighbour": true, "a1-pharmacy": true, "a1-directions": true,
	"a1-bench": true, "a1-weather": true, "a1-bike": true, "a1-phone": true,
	"a1-office-window": true, "a1-invitation": true, "a1-lost-found": true, "a1-departure": true,
	"a2-upstairs": true, "a2-ink-seller": true, "a2-forest-rails": true, "a2-cellar": true,
	"b1-record-room": true, "b1-signalman": true, "b1-temptation": true,
}

// The chain is linear. An inserted scene before the furthest completed one counts
// as passed, so new scenes never lock an existing adventure.
func questPrerequisite(questID string, completed []string) string {
	if contains(completed, questID) {
		return ""
	}
	furthest := -1
	for index, id := range storyQuestOrder {
		if contains(completed, id) {
			furthest = index
		}
	}
	for index, id := range storyQuestOrder {
		if id == questID {
			return ""
		}
		if !contains(completed, id) && !(insertedStoryQuests[id] && index < furthest) {
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
		milestone := actOneFinale
		if mapID == "nebelstadt" {
			milestone = actTwoFinale
		}
		later := storyQuestIndex(milestone) + 1
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
	// Expedition agreements remain available as standalone learning activities.
	manifest, err := expeditionContent()
	if err != nil || !contains(completed, "b1-atlas") {
		return false
	}
	for _, game := range manifest.Games {
		if game.ID == mapID {
			return true
		}
	}
	return false
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
	if contains(prologueQuestOrder, questID) {
		for _, id := range prologueQuestOrder {
			if id == questID {
				return nil
			}
			if !contains(completed, id) {
				return &APIError{409, fmt.Sprintf("follow the train conversation first (missing %s)", id)}
			}
		}
	}
	known := contains(storyQuestOrder, questID)
	if known {
		if missing := questPrerequisite(questID, completed); missing != "" {
			return &APIError{409, fmt.Sprintf("follow the clue chain first (missing %s)", missing)}
		}
	}
	return nil
}

// Story access follows the clue chain, never the optional vocabulary budget.
// A conversation already under way stays open: it was admitted when it began.
func (a *App) requireQuestAccess(questID string, p *Progress) error {
	if node := p.Story.Nodes[questID]; node != "" && contains(storyQuestOrder, questID) {
		return nil
	}
	return requireQuestOrder(questID, p.CompletedQuestIDs)
}
