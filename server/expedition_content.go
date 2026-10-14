package main

import (
	"encoding/json"
	"fmt"
	"sort"
	"strconv"
)

// These are the existing authored expeditionAgreement templates. Their variable
// values come only from a server-accepted plan, never a browser solution table.
func authoredExpeditionAgreement(id string, values map[string]int) string {
	words := map[int]string{1: "eins", 2: "zwei", 3: "drei", 4: "vier", 5: "fünf", 6: "sechs", 7: "sieben", 8: "acht", 11: "elf", 12: "zwölf", 13: "dreizehn", 14: "vierzehn", 15: "fünfzehn", 16: "sechzehn", 17: "siebzehn", 18: "achtzehn", 19: "neunzehn", 20: "zwanzig", 21: "einundzwanzig", 23: "dreiundzwanzig", 26: "sechsundzwanzig"}
	n := func(value int) string {
		if word := words[value]; word != "" {
			return word
		}
		return strconv.Itoa(value)
	}
	switch id {
	case "saffroncourt":
		return fmt.Sprintf("Mit Erlaubnis der Haussprecherin bringen wir das Paket um %s Uhr durch das Osttor in den gemeinsamen Hof.", n(values["arrival"]))
	case "rainmarket":
		return fmt.Sprintf("Wir treffen uns von %s bis %s Uhr unter dem Dach. Wir spielen leise Musik und räumen vor der Ruhezeit auf.", n(values["start"]), n(values["end"]))
	case "windplain":
		return fmt.Sprintf("Wir nehmen %s Kilo Wasser, %s Kilo Essen, ein Kilo Werkzeug und das Funkgerät mit. Die Schutzplane gehört auf den Handwagen; das Ger fährt separat.", n(values["water"]), n(values["food"]))
	case "riverweave":
		return fmt.Sprintf("Wir nehmen %s Körbe Gemüse, einen Korb Obst und zwei Säcke Reis. Mit der Fahrt durch den Ostkanal kostet alles %s Münzen.", n(values["veg"]), n(values["veg"]*3+values["fruit"]*4+values["rice"]*5+values["route"]))
	case "terracielo":
		return fmt.Sprintf("Wir nähen drei blaue Taschen, jeweils vierzig Zentimeter breit und sechzig Zentimeter hoch. Die Abholung ist um %s Uhr.", n(values["pickup"]))
	case "sunpatch":
		return fmt.Sprintf("Wir senden die bestätigte Einladung am Freitag um %s Uhr: Am Freitag um acht Uhr treffen wir uns im Innenhof. Bitte bringt eure Ideen mit!", n(values["broadcast"]))
	case "kigalights":
		return fmt.Sprintf("Die Gruppe nutzt Raum A ab vierzehn Uhr. Die Aufnahme ist in Raum B. Die Schnittarbeit beginnt um %s Uhr und endet bis achtzehn Uhr.", n(values["edit"]))
	case "cedarbay":
		return fmt.Sprintf("Wir holen die Kiste am Weststeg ab und fahren um %s Uhr. Vier Personen und die Kiste belegen alle sechs Plätze.", n(values["time"]))
	case "seoulsteps":
		return fmt.Sprintf("Wegen des Regens treffen wir uns von %s bis %s Uhr im Gemeinschaftsraum. Leise Musik, bitte. Alle nutzen den Aufzug.", n(values["start"]), n(values["end"]))
	case "dunegarden":
		return fmt.Sprintf("%s Minuten für den Gemeinschaftsgarten, %s für die jungen Pflanzen, %s für die Bäume und zwei Minuten als Reserve.", n(values["shared"]), n(values["young"]), n(values["trees"]))
	}
	return ""
}

func (a *App) expeditionAgreement(id string, values map[string]int) string {
	resolved := map[string]int{}
	if a.content != nil {
		record := a.content.ByID[a.content.IDs["context:expedition-game:"+id]]
		if record.CourseID == a.curriculum.CourseID {
			var body struct {
				Data struct {
					Solution map[string]int `json:"solution"`
				} `json:"data"`
			}
			if json.Unmarshal(record.Body, &body) == nil {
				for field, value := range body.Data.Solution {
					resolved[field] = value
				}
			}
		}
	}
	for field, value := range values {
		resolved[field] = value
	}
	return authoredExpeditionAgreement(id, resolved)
}

func (a *App) publicExpeditionGame(body map[string]any, account Account) {
	data, _ := body["data"].(map[string]any)
	if data == nil {
		return
	}
	id := stringValue(data["id"])
	manifest, err := expeditionContent()
	var rule *expeditionGameRule
	if err == nil {
		for i := range manifest.Games {
			if manifest.Games[i].ID == id {
				rule = &manifest.Games[i]
				break
			}
		}
	}
	attempted := false
	agreements := map[string]string{}
	for _, level := range []string{"A1", "A2", "B1"} {
		plan := account.Progress.Story.ExpeditionPlans[id+":"+level]
		attempted = attempted || plan.Attempts > 0 || plan.Completed
		if !plan.Completed || rule == nil {
			continue
		}
		values := make([]int, len(rule.Fields))
		for i, field := range rule.Fields {
			values[i] = plan.Values[field.ID]
		}
		key, _ := json.Marshal(values)
		if agreement := a.expeditionAgreement(id, plan.Values); agreement != "" {
			agreements[string(key)] = agreement
		}
	}
	var redact func(any)
	redact = func(value any) {
		switch v := value.(type) {
		case map[string]any:
			delete(v, "agreement")
			delete(v, "agreements")
			if !attempted {
				delete(v, "note")
			}
			for _, item := range v {
				redact(item)
			}
		case []any:
			for _, item := range v {
				redact(item)
			}
		}
	}
	redact(data)
	if steps := anyValues(data["steps"]); len(steps) > 0 {
		sort.Slice(steps, func(i, j int) bool {
			left, _ := steps[i].(map[string]any)
			right, _ := steps[j].(map[string]any)
			return stringValue(left["id"]) < stringValue(right["id"])
		})
		data["steps"] = steps
	}
	if len(agreements) > 0 {
		data["agreements"] = agreements
	}
}
