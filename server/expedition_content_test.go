package main

import (
	"encoding/json"
	"slices"
	"sort"
	"testing"
)

func TestContentExpeditionPlansKeepSolutionsPrivateAndRestoreActualAgreements(t *testing.T) {
	app := contentTestApp(t)
	token, _ := createSession(t, app, "Plan owner")
	other, _ := createSession(t, app, "Other planner")
	manifest, err := expeditionContent()
	if err != nil {
		t.Fatal(err)
	}
	var game expeditionGameRule
	for _, rule := range manifest.Games {
		if rule.ID == "terracielo" {
			game = rule
		}
	}
	if game.ID == "" {
		t.Fatal("missing flexible pickup plan")
	}
	valuesAt := func(pickup int) map[string]int {
		t.Helper()
		for _, allocation := range game.ValidValues {
			values := map[string]int{}
			for i, field := range game.Fields {
				values[field.ID] = allocation[i]
			}
			if values["pickup"] == pickup {
				return values
			}
		}
		t.Fatalf("missing accepted pickup %d", pickup)
		return nil
	}
	input := func(id string, pickup int, order []string) map[string]any {
		return map[string]any{"id": id, "mapId": game.ID, "level": "A1", "values": valuesAt(pickup), "order": order}
	}
	contextID := testContentID(t, app, "context", "expedition-game:"+game.ID)
	if response := request(app, "GET", "/api/content/contexts/"+contextID, token, nil); response.Code != 404 {
		t.Fatal("locked expedition game context was disclosed")
	}
	if response := request(app, "POST", "/api/expedition/plan", token, input("locked-plan", 16, game.Order)); response.Code != 403 {
		t.Fatal("locked plan was accepted")
	}
	seedStoryProgress(t, app, token, storyQuestOrder)
	seedStoryProgress(t, app, other, storyQuestOrder)
	read := func(session string) map[string]any {
		t.Helper()
		response := request(app, "GET", "/api/content/contexts/"+contextID, session, nil)
		if response.Code != 200 {
			t.Fatal(response.Body.String())
		}
		assertNoContentSecrets(t, response.Body.Bytes())
		var record struct {
			Body struct {
				Data map[string]any `json:"data"`
			} `json:"body"`
		}
		if err := json.Unmarshal(response.Body.Bytes(), &record); err != nil {
			t.Fatal(err)
		}
		return record.Body.Data
	}
	assertPrivate := func(data map[string]any) {
		t.Helper()
		var visit func(any)
		visit = func(value any) {
			switch v := value.(type) {
			case map[string]any:
				for key, item := range v {
					if key == "agreement" || key == "agreements" || key == "note" {
						t.Fatalf("unattempted plan disclosed %s", key)
					}
					visit(item)
				}
			case []any:
				for _, item := range v {
					visit(item)
				}
			}
		}
		visit(data)
	}
	initial := read(token)
	assertPrivate(initial)
	var stepIDs []string
	for _, entry := range anyValues(initial["steps"]) {
		step, _ := entry.(map[string]any)
		stepIDs = append(stepIDs, stringValue(step["id"]))
	}
	if len(stepIDs) != len(game.Order) || !sort.StringsAreSorted(stepIDs) || slices.Equal(stepIDs, game.Order) {
		t.Fatal("public step ordering disclosed the authored solution sequence")
	}
	malformed := input("missing-plan-field", 16, game.Order)
	delete(malformed["values"].(map[string]int), game.Fields[0].ID)
	if response := request(app, "POST", "/api/expedition/plan", token, malformed); response.Code != 400 {
		t.Fatal("malformed plan was accepted")
	}
	assertPrivate(read(token))
	submit := func(body map[string]any, wantCorrect bool) map[string]any {
		t.Helper()
		response := request(app, "POST", "/api/expedition/plan", token, body)
		var result map[string]any
		if response.Code != 200 || json.Unmarshal(response.Body.Bytes(), &result) != nil || result["correct"] != wantCorrect {
			t.Fatalf("plan result %d %s", response.Code, response.Body.String())
		}
		if !wantCorrect && result["agreement"] != nil {
			t.Fatal("incorrect plan disclosed its model agreement")
		}
		return result
	}
	submit(input("wrong-plan-order", 16, []string{}), false)
	wrong := read(token)
	if wrong["note"] == nil || wrong["agreement"] != nil || wrong["agreements"] != nil {
		t.Fatal("recorded wrong plan did not respect post-attempt note/model eligibility")
	}
	agreement16 := "Wir nähen drei blaue Taschen, jeweils vierzig Zentimeter breit und sechzig Zentimeter hoch. Die Abholung ist um sechzehn Uhr."
	correctInput := input("accepted-later-pickup", 16, game.Order)
	correct := submit(correctInput, true)
	if correct["agreement"] != agreement16 || correct["xpAdded"] != float64(30) {
		t.Fatal("agreement did not reflect the actual accepted flexible pickup")
	}
	duplicate := submit(correctInput, true)
	if duplicate["agreement"] != agreement16 || duplicate["duplicate"] != true || duplicate["xpAdded"] != float64(0) {
		t.Fatal("agreement retry changed the answer or repeated its reward")
	}
	assertSaved := func(pickup int, agreement string) {
		t.Helper()
		data := read(token)
		agreements, _ := data["agreements"].(map[string]any)
		var values []int
		for _, field := range game.Fields {
			values = append(values, valuesAt(pickup)[field.ID])
		}
		key, _ := json.Marshal(values)
		if len(agreements) != 1 || agreements[string(key)] != agreement || data["agreement"] != nil {
			t.Fatal("restored context lost the actual completed allocation or exposed a static solution")
		}
	}
	assertSaved(16, agreement16)
	agreement14 := "Wir nähen drei blaue Taschen, jeweils vierzig Zentimeter breit und sechzig Zentimeter hoch. Die Abholung ist um vierzehn Uhr."
	if result := submit(input("accepted-earlier-pickup", 14, game.Order), true); result["agreement"] != agreement14 || result["xpAdded"] != float64(0) {
		t.Fatal("another accepted pickup used the static example or repeated XP")
	}
	assertSaved(14, agreement14)
	if result := submit(correctInput, true); result["agreement"] != agreement16 || result["duplicate"] != true {
		t.Fatal("old immutable retry lost its own accepted agreement")
	}
	assertSaved(14, agreement14)
	submit(input("wrong-practice-after-completion", 16, []string{}), false)
	assertSaved(14, agreement14)
	assertPrivate(read(other))
}
