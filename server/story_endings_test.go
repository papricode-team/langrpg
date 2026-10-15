package main

import "testing"

// playStory walks the canonical scene order and lets pick choose one
// available choice per scene, the way the graph offers them to a player.
func playStory(t *testing.T, pick func(questID string, available []StoryChoiceRule, s *StoryState) string) *StoryState {
	t.Helper()
	s := &StoryState{Flags: map[string]bool{}, Reputation: map[string]int{}}
	for _, questID := range storyQuestOrder {
		rule, ok := storyRule(questID)
		if !ok {
			t.Fatalf("scene %s has no story rule", questID)
		}
		available := []StoryChoiceRule{}
		for _, choice := range rule.Choices {
			if choice.Condition.met(s) {
				available = append(available, choice)
			}
		}
		if len(available) == 0 {
			t.Fatalf("scene %s offers no choice", questID)
		}
		choiceID := pick(questID, available, s)
		s.Flags["quest:"+questID] = true
		applyStoryChoice(s, questID, choiceID)
	}
	return s
}

func factionGain(choice StoryChoiceRule, faction string) int {
	total := 0
	for _, effect := range choice.Effects {
		if effect.Faction == faction {
			total += effect.Amount
		}
	}
	return total
}

// favour picks the choice that helps one faction most and, between equals,
// the one that helps the currently strongest rival least.
func favour(faction string, skip ...string) func(string, []StoryChoiceRule, *StoryState) string {
	return func(_ string, available []StoryChoiceRule, s *StoryState) string {
		best, bestScore := "", -1000
		for _, choice := range available {
			if contains(skip, choice.ID) {
				continue
			}
			score := factionGain(choice, faction) * 10
			for _, rival := range []string{"brassOffice", "lamplighters", "unwritten"} {
				if rival != faction {
					score -= factionGain(choice, rival) * (1 + s.Reputation[rival])
				}
			}
			if score > bestScore {
				best, bestScore = choice.ID, score
			}
		}
		if best == "" {
			best = available[0].ID
		}
		return best
	}
}

func TestEveryEndingIsReachableThroughTheGraphChoices(t *testing.T) {
	for faction, ending := range map[string]string{"lamplighters": "routes-reopened", "unwritten": "towns-consent", "brassOffice": "brass-reformed"} {
		s := playStory(t, favour(faction))
		if s.Ending != ending {
			t.Fatalf("favouring %s ended in %s (reputation %v)", faction, s.Ending, s.Reputation)
		}
	}
}

func TestBrassEndingNoLongerDependsOnTheLedger(t *testing.T) {
	// Refusing the ledger in scene one and never publishing it: Falk's testimony
	// and Frau Kessler's public list must still carry the Office to its reform.
	s := playStory(t, favour("brassOffice", "publish-ledger"))
	if contains(s.Inventory, "inspector-ledger") && s.Flags["ledger-published"] {
		t.Fatal("ledger was published although the path skipped it")
	}
	if !s.Flags["kessler-turned"] || !s.Flags["falk-witness"] {
		t.Fatalf("brass path should turn Kessler and call Falk as witness: %v", s.Flags)
	}
	if s.Ending != "brass-reformed" {
		t.Fatalf("brass path without the ledger ended in %s (reputation %v)", s.Ending, s.Reputation)
	}
}

func TestTemptationIsAChoiceNotAGameOver(t *testing.T) {
	turn := func(questID string, available []StoryChoiceRule, s *StoryState) string {
		if questID == "b1-temptation" {
			return "route-closed-again"
		}
		return favour("unwritten")(questID, available, s)
	}
	s := playStory(t, turn)
	if !s.Flags["route-closed-again"] || s.Ending == "" {
		t.Fatalf("turning the key must still reach an ending: flags %v ending %q", s.Flags, s.Ending)
	}
}
