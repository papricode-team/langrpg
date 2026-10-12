package main

import (
	"encoding/json"
	"fmt"
	"reflect"
	"slices"
	"testing"
)

func TestExpeditionNewTimingFieldsPreserveCompletedLegacyAgreements(t *testing.T) {
	p := newProgress()
	p.Story.ExpeditionPlans["saffroncourt:A1"] = ExpeditionPlanState{Level: "A1", Values: map[string]int{"permission": 1, "gate": 0, "recipient": 2}, Order: []string{"workshop", "permission", "gate", "court"}, Completed: true, Attempts: 2}
	p.Story.ExpeditionPlans["terracielo:A2"] = ExpeditionPlanState{Level: "A2", Values: map[string]int{"count": 3, "width": 40, "height": 60, "pattern": 2}, Completed: true, Attempts: 1}
	p.Story.ExpeditionPlans["sunpatch:B1"] = ExpeditionPlanState{Level: "B1", Values: map[string]int{"day": 1, "time": 8, "place": 1, "source": 1, "broadcast": 6}, Completed: true, Attempts: 1}
	p.Story.ExpeditionPlans["saffroncourt:A2"] = ExpeditionPlanState{Level: "A2", Values: map[string]int{"permission": 1}, Attempts: 1}
	ensureProgress(&p)
	if p.Story.ExpeditionPlans["saffroncourt:A1"].Values["arrival"] != 17 || p.Story.ExpeditionPlans["terracielo:A2"].Values["pickup"] != 15 || p.Story.ExpeditionPlans["sunpatch:B1"].Values["broadcast"] != 6 {
		t.Fatal("legacy agreement timing was absent or replaced")
	}
	if _, exists := p.Story.ExpeditionPlans["saffroncourt:A2"].Values["arrival"]; exists {
		t.Fatal("unfinished draft gained an agreed timing")
	}
	if plan := p.Story.ExpeditionPlans["saffroncourt:A1"]; !plan.Completed || plan.Attempts != 2 || !reflect.DeepEqual(plan.Order, []string{"workshop", "permission", "gate", "court"}) || p.XP != 0 || p.Attempts != 0 {
		t.Fatal("legacy timing migration changed completion, learning evidence or rewards")
	}
}

func TestExpeditionAuthoredAlternativesAreAcceptedAtEveryScaffold(t *testing.T) {
	manifest, err := expeditionContent()
	if err != nil {
		t.Fatal(err)
	}
	for _, game := range manifest.Games {
		t.Run(game.ID, func(t *testing.T) {
			if len(game.ValidValues) < 2 || len(game.ValidValues) > 3 {
				t.Fatalf("expected two or three distinct authored allocations, got %d", len(game.ValidValues))
			}
			for i, values := range game.ValidValues {
				if len(values) != len(game.Fields) {
					t.Fatal("allocation does not match the field schema")
				}
				for j := range i {
					if slices.Equal(values, game.ValidValues[j]) {
						t.Fatal("duplicate allocation disguised as an alternative")
					}
				}
			}
			app := storyTestApp(t)
			token, _ := createSession(t, app, "Ada")
			seedStoryProgress(t, app, token, storyQuestOrder)
			for _, level := range []string{"A1", "A2", "B1"} {
				for index, allocation := range game.ValidValues {
					values := map[string]int{}
					for i, field := range game.Fields {
						values[field.ID] = allocation[i]
					}
					input := map[string]any{"id": fmt.Sprintf("%s-%d", level, index), "mapId": game.ID, "level": level, "values": values, "order": game.Order}
					r := request(app, "POST", "/api/expedition/plan", token, input)
					var response struct {
						Correct bool                `json:"correct"`
						XPAdded int                 `json:"xpAdded"`
						Plan    ExpeditionPlanState `json:"plan"`
					}
					if r.Code != 200 || json.Unmarshal(r.Body.Bytes(), &response) != nil || !response.Correct || !response.Plan.Completed || response.Plan.Attempts != index+1 {
						t.Fatalf("authored alternative rejected: %d %s", r.Code, r.Body.String())
					}
					if (index == 0 && response.XPAdded != 30) || (index > 0 && response.XPAdded != 0) {
						t.Fatal("an alternative allocation re-awarded the same scaffold")
					}
				}
			}
			if p := storyProgress(t, app, token); p.XP != 90 || p.Attempts != 0 || len(p.Items) != 0 {
				t.Fatal("planning alternatives farmed rewards or invented lexical SRS evidence")
			}
		})
	}
}
