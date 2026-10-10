package main

import (
	"context"
	"encoding/json"
	"net/http"
	"sort"
	"strings"
	"time"
	"unicode/utf8"
)

type StoryState struct {
	Flags           map[string]bool                `json:"flags"`
	Inventory       []string                       `json:"inventory"`
	Reputation      map[string]int                 `json:"reputation"`
	Bell            int                            `json:"bell"`
	BellWarnings    int                            `json:"bellWarnings"`
	GateFailures    map[string]int                 `json:"gateFailures"`
	Day             int                            `json:"day"`
	LanternStreak   int                            `json:"lanternStreak"`
	Promise         DailyPromise                   `json:"promise"`
	Nodes           map[string]string              `json:"nodes"`
	Choices         map[string]string              `json:"choices"`
	Ending          string                         `json:"ending,omitempty"`
	Expeditions     map[string]ExpeditionRecord    `json:"expeditions"`
	ExpeditionPlans map[string]ExpeditionPlanState `json:"expeditionPlans"`
	Inspections     map[string][]string            `json:"inspections"`
	GateAttempts    map[string][]string            `json:"gateAttempts"`
}

type ExpeditionRecord struct {
	Selected int  `json:"selected"`
	Correct  bool `json:"correct"`
	Attempts int  `json:"attempts"`
}

type StorySave struct {
	Slot              string     `json:"slot"`
	Name              string     `json:"name"`
	At                time.Time  `json:"at"`
	Story             StoryState `json:"story"`
	CompletedQuestIDs []string   `json:"completedQuestIds"`
}

type StoryRule struct {
	QuestID                string            `json:"questId"`
	GateExerciseID         string            `json:"gateExerciseId"`
	ReplyExerciseIDs       []string          `json:"replyExerciseIds"`
	ChoiceIDs              []string          `json:"choiceIds"`
	MapID                  string            `json:"mapId"`
	NPCID                  string            `json:"npcId"`
	NPC                    MapSpawn          `json:"npc"`
	InvestigationObjectIDs []string          `json:"investigationObjectIds"`
	Objects                []StoryObject     `json:"objects"`
	Choices                []StoryChoiceRule `json:"choices"`
}

type StoryChoiceRule struct {
	ID        string         `json:"id"`
	Effects   []StoryEffect  `json:"effects"`
	Condition StoryCondition `json:"condition"`
}
type StoryCondition struct {
	Flag        string `json:"flag"`
	WithoutFlag string `json:"withoutFlag"`
	Item        string `json:"item"`
	MissingItem string `json:"missingItem"`
	Faction     string `json:"faction"`
	Minimum     int    `json:"minimum"`
	Ending      string `json:"ending"`
}

func (c StoryCondition) met(s *StoryState) bool {
	return (c.Flag == "" || s.Flags[c.Flag]) && (c.WithoutFlag == "" || !s.Flags[c.WithoutFlag]) &&
		(c.Item == "" || contains(s.Inventory, c.Item)) && (c.MissingItem == "" || !contains(s.Inventory, c.MissingItem)) &&
		(c.Faction == "" || s.Reputation[c.Faction] >= c.Minimum) && (c.Ending == "" || s.Ending == c.Ending)
}

type StoryEffect struct {
	Faction string `json:"faction"`
	Amount  int    `json:"amount"`
	Item    string `json:"item"`
	Flag    string `json:"flag"`
	Bell    int    `json:"bell"`
}

type StoryObject struct {
	ID string  `json:"id"`
	X  float64 `json:"x"`
	Y  float64 `json:"y"`
}

// Warning choices can bring a bell forward within an act. The later canonical
// beats remain playable before the final bell, independent of faction choices.
var storyBellMilestones = map[string]int{
	"a1-arrival": 1, "a1-lost-parcel": 2,
	"a2-broken-clock": 3, "a2-archive": 4,
	"b1-new-route": 5, "b1-storm": 6, "b1-atlas": 7,
}

func bellCeilingForQuest(questID string) int {
	if questID == "b1-atlas" {
		return 7
	}
	return 6
}

func storyRule(id string) (StoryRule, bool) {
	b, err := curriculumFiles.ReadFile("story_rules.json")
	if err != nil {
		return StoryRule{}, false
	}
	var manifest struct {
		Rules []StoryRule `json:"rules"`
	}
	if json.Unmarshal(b, &manifest) != nil {
		return StoryRule{}, false
	}
	for _, rule := range manifest.Rules {
		if rule.QuestID == id {
			return rule, true
		}
	}
	return StoryRule{}, false
}

func ensureStory(p *Progress) {
	s := &p.Story
	if s.Flags == nil {
		s.Flags = map[string]bool{}
	}
	if s.Inventory == nil {
		s.Inventory = []string{"successor-letter"}
	}
	if s.Reputation == nil {
		s.Reputation = map[string]int{"brassOffice": 0, "lamplighters": 0, "unwritten": 0}
	}
	if s.Nodes == nil {
		s.Nodes = map[string]string{}
	}
	if s.Choices == nil {
		s.Choices = map[string]string{}
	}
	if s.Expeditions == nil {
		s.Expeditions = map[string]ExpeditionRecord{}
	}
	if s.ExpeditionPlans == nil {
		s.ExpeditionPlans = map[string]ExpeditionPlanState{}
	}
	if s.Inspections == nil {
		s.Inspections = map[string][]string{}
	}
	if s.GateAttempts == nil {
		s.GateAttempts = map[string][]string{}
	}
	if s.GateFailures == nil {
		s.GateFailures = map[string]int{}
	}
	if s.Day < 1 {
		s.Day = 1
	}
	ensureDailyPromise(s)
	for _, id := range p.CompletedQuestIDs {
		if contains(storyQuestOrder, id) {
			s.Nodes[id] = "complete"
			s.Flags["quest:"+id] = true
			giveStoryItem(s, id+"-evidence")
		}
	}
	if contains(p.CompletedQuestIDs, "a1-lost-parcel") {
		s.Flags["route:waldruh"] = true
	}
	if contains(p.CompletedQuestIDs, "a2-archive") {
		s.Flags["route:nebelstadt"] = true
	}
	if contains(p.CompletedQuestIDs, "b1-atlas") {
		s.Flags["route:coastline"] = true
		giveStoryItem(s, "restored-atlas")
	}
	if s.Choices["a1-arrival"] == "report" {
		s.Flags["platform-reported"] = true
		giveStoryItem(s, "inspector-ledger")
	} else if s.Choices["a1-arrival"] == "protect" {
		s.Flags["platform-protected"] = true
		giveStoryItem(s, "lamplighter-key")
	}
	ceiling, earned := 2, 0
	for _, id := range storyQuestOrder {
		if contains(p.CompletedQuestIDs, id) {
			earned = max(earned, storyBellMilestones[id])
			ceiling = max(ceiling, storyBellMilestones[id])
		} else if node := s.Nodes[id]; node == "gate" || node == "choice" {
			ceiling = max(ceiling, min(6, max(earned, storyBellMilestones[id])))
		}
	}
	// Also repairs older saves in which Act I report choices exhausted all seven
	// bells. Earned discoveries and their language evidence remain unchanged.
	s.BellWarnings = max(0, min(2, s.BellWarnings))
	if s.Flags["platform-reported"] {
		s.BellWarnings = max(1, s.BellWarnings)
	}
	limit := 6
	if contains(p.CompletedQuestIDs, "b1-atlas") {
		limit = 7
	}
	s.Bell = max(min(limit, earned+s.BellWarnings), min(s.Bell, min(limit, ceiling+s.BellWarnings)))
}

// Pressure survives canonical beats. Two early warnings leave the last bell
// for the finale rather than turning language mistakes into a soft lock.
func warnStoryBell(s *StoryState) {
	if s.BellWarnings < 2 {
		s.BellWarnings++
		s.Bell = min(6, s.Bell+1)
	}
}
func recordStoryGateFailure(s *StoryState, questID string) {
	s.GateFailures[questID] = min(3, s.GateFailures[questID]+1)
	if s.GateFailures[questID] == 3 && !s.Flags["bell-warning:"+questID] {
		s.Flags["bell-warning:"+questID] = true
		warnStoryBell(s)
	}
}

func giveStoryItem(s *StoryState, id string) {
	if !contains(s.Inventory, id) {
		s.Inventory = append(s.Inventory, id)
	}
}

func storyNode(p *Progress, questID string) string {
	if node := p.Story.Nodes[questID]; node != "" {
		return node
	}
	return "intro"
}

func (a *App) requireStoryGate(account *Account, questID string) error {
	if err := requireQuestOrder(questID, account.Progress.CompletedQuestIDs); err != nil {
		return err
	}
	if contains(account.Progress.CompletedQuestIDs, questID) || storyNode(&account.Progress, questID) != "gate" {
		return &APIError{409, "open this conversation's current German request first"}
	}
	rule, _ := storyRule(questID)
	if !a.world.nearStoryTarget(account.Player.ID, rule.MapID, rule.NPC, .15) {
		return &APIError{409, "walk back to this conversation's character first"}
	}
	return nil
}

func (a *App) requireStoryReply(account *Account, questID string) error {
	if err := requireQuestOrder(questID, account.Progress.CompletedQuestIDs); err != nil {
		return err
	}
	if contains(account.Progress.CompletedQuestIDs, questID) || storyNode(&account.Progress, questID) != "intro" {
		return &APIError{409, "open this character's greeting first"}
	}
	rule, _ := storyRule(questID)
	if !a.world.nearStoryTarget(account.Player.ID, rule.MapID, rule.NPC, .15) {
		return &APIError{409, "walk to this conversation's character first"}
	}
	return nil
}

func (a *App) story(w http.ResponseWriter, r *http.Request) {
	hash, err := bearer(r)
	if err != nil {
		apiFailure(w, err)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()
	account, err := a.getAccount(ctx, hash)
	if err != nil {
		apiFailure(w, err)
		return
	}
	ensureStory(&account.Progress)
	rules := []StoryRule{}
	for _, id := range storyQuestOrder {
		rule, _ := storyRule(id)
		rules = append(rules, rule)
	}
	saves := []map[string]any{}
	for _, save := range account.StorySaves {
		saves = append(saves, map[string]any{"slot": save.Slot, "name": save.Name, "at": save.At})
	}
	sort.Slice(saves, func(i, j int) bool { return saves[i]["slot"].(string) < saves[j]["slot"].(string) })
	writeJSON(w, 200, map[string]any{"story": account.Progress.Story, "progress": account.Progress, "rules": rules, "saves": saves})
}

type StoryTransitionInput struct {
	ID        string `json:"id"`
	QuestID   string `json:"questId"`
	NodeID    string `json:"nodeId"`
	ChoiceID  string `json:"choiceId,omitempty"`
	AttemptID string `json:"attemptId,omitempty"`
}

func (a *App) transitionStory(w http.ResponseWriter, r *http.Request) {
	hash, err := bearer(r)
	if err != nil {
		apiFailure(w, err)
		return
	}
	var input StoryTransitionInput
	if err := decodeJSON(w, r, &input); err != nil {
		apiFailure(w, err)
		return
	}
	rule, known := storyRule(input.QuestID)
	if !known || !safeID.MatchString(input.ID) {
		writeError(w, 400, "unknown story scene or invalid action ID")
		return
	}
	if _, installed := a.curriculum.Quests[input.QuestID]; !installed {
		writeError(w, 400, "story scene is not installed")
		return
	}
	if input.NodeID != "intro" && input.NodeID != "gate" && input.NodeID != "choice" {
		writeError(w, 400, "unknown story node")
		return
	}
	if input.NodeID == "choice" && !contains(rule.ChoiceIDs, input.ChoiceID) {
		writeError(w, 400, "unknown story choice")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()
	var proof SavedAction
	if input.NodeID == "gate" {
		if !safeID.MatchString(input.AttemptID) {
			writeError(w, 409, "answer this conversation's German request first")
			return
		}
		proofs, _, proofErr := a.store.ActivityProofs(ctx, hash, "", "", []string{input.AttemptID})
		if proofErr != nil {
			apiFailure(w, proofErr)
			return
		}
		var ok bool
		proof, ok = proofs[input.AttemptID]
		var attempt AttemptInput
		if !ok || json.Unmarshal(proof.Request, &attempt) != nil || proof.Receipt.Correct == nil || !*proof.Receipt.Correct || attempt.ExerciseID != rule.GateExerciseID || attempt.QuestID != input.QuestID || attempt.Mode != "production" || !attempt.SceneAttempt {
			writeError(w, 409, "a correct saved German answer from this conversation is required")
			return
		}
	}
	request, _ := json.Marshal(input)
	account, receipt, duplicate, err := a.store.Mutate(ctx, hash, "story:"+input.ID, request, func(account *Account) (Receipt, error) {
		ensureStory(&account.Progress)
		if err := requireQuestOrder(input.QuestID, account.Progress.CompletedQuestIDs); err != nil {
			return Receipt{}, err
		}
		if contains(account.Progress.CompletedQuestIDs, input.QuestID) {
			return Receipt{}, &APIError{409, "this discovery is complete; revisit it in your journal"}
		}
		if storyNode(&account.Progress, input.QuestID) != input.NodeID {
			return Receipt{}, &APIError{409, "the conversation has moved on; reopen the current line"}
		}
		if !a.world.nearStoryTarget(account.Player.ID, rule.MapID, rule.NPC, .15) {
			return Receipt{}, &APIError{409, "walk back to this conversation's character first"}
		}
		s := &account.Progress.Story
		switch input.NodeID {
		case "intro":
			for _, id := range rule.ReplyExerciseIDs {
				if !s.Flags["reply:"+id] {
					return Receipt{}, &APIError{409, "answer the character's greeting first"}
				}
			}
			for _, id := range rule.InvestigationObjectIDs {
				if !contains(s.Inspections[input.QuestID], id) {
					return Receipt{}, &APIError{409, "read every piece of evidence in this investigation first"}
				}
			}
			s.Nodes[input.QuestID] = "gate"
			delete(s.GateAttempts, input.QuestID)
			if input.QuestID == "a1-arrival" {
				s.Flags["inspectorSeen"] = true
				s.Flags["successorNamed"] = true
				s.Bell = max(s.Bell, 1)
			}
		case "gate":
			if !contains(s.GateAttempts[input.QuestID], input.AttemptID) {
				return Receipt{}, &APIError{409, "answer the current conversation's German request first"}
			}
			s.Nodes[input.QuestID] = "choice"
		case "choice":
			for _, choice := range rule.Choices {
				if choice.ID == input.ChoiceID && !choice.Condition.met(s) {
					return Receipt{}, &APIError{409, "this choice needs the item or trust shown in the conversation"}
				}
			}
			for _, completed := range account.Progress.CompletedQuestIDs {
				if !contains(account.RewardedQuestIDs, completed) {
					account.RewardedQuestIDs = append(account.RewardedQuestIDs, completed)
				}
			}
			s.Nodes[input.QuestID] = "complete"
			s.Choices[input.QuestID] = input.ChoiceID
			s.Flags["quest:"+input.QuestID] = true
			giveStoryItem(s, input.QuestID+"-evidence")
			applyStoryChoice(s, input.QuestID, input.ChoiceID)
			account.Progress.CompletedQuestIDs = append(account.Progress.CompletedQuestIDs, input.QuestID)
			ensureStory(&account.Progress)
			reward := 0
			if !contains(account.RewardedQuestIDs, input.QuestID) {
				reward = a.curriculum.Quests[input.QuestID].Reward
				account.RewardedQuestIDs = append(account.RewardedQuestIDs, input.QuestID)
				account.Progress.XP += reward
			}
			return Receipt{XPAdded: reward}, nil
		}
		return Receipt{}, nil
	})
	if err != nil {
		apiFailure(w, err)
		return
	}
	added := receipt.XPAdded
	if duplicate {
		added = 0
	}
	writeJSON(w, 200, map[string]any{"story": account.Progress.Story, "progress": account.Progress, "xpAdded": added, "duplicate": duplicate})
}

func applyStoryChoice(s *StoryState, questID, choiceID string) {
	rule, _ := storyRule(questID)
	for _, choice := range rule.Choices {
		if choice.ID == choiceID {
			for _, effect := range choice.Effects {
				if contains([]string{"brassOffice", "lamplighters", "unwritten"}, effect.Faction) {
					s.Reputation[effect.Faction] += effect.Amount
				}
				if effect.Item != "" {
					giveStoryItem(s, effect.Item)
				}
				if effect.Flag != "" {
					s.Flags[effect.Flag] = true
				}
				if effect.Bell > 0 {
					warnStoryBell(s)
				}
			}
		}
	}
	s.Bell = max(s.Bell, min(bellCeilingForQuest(questID), storyBellMilestones[questID]+s.BellWarnings))
	if questID == "b1-new-route" {
		s.Flags["storm_active"] = true
	}
	if questID == "b1-storm" {
		s.Flags["storm_active"] = false
	}
	if questID == "b1-atlas" {
		s.Flags["eliseFound"] = true
		s.Ending = "routes-reopened"
		if s.Reputation["unwritten"] >= s.Reputation["lamplighters"] {
			s.Ending = "towns-consent"
		}
		if s.Reputation["brassOffice"] > 0 && s.Reputation["brassOffice"] >= s.Reputation["lamplighters"] && s.Reputation["brassOffice"] >= s.Reputation["unwritten"] {
			s.Ending = "brass-reformed"
		}
	}
}

func (a *App) saveStory(w http.ResponseWriter, r *http.Request) {
	hash, err := bearer(r)
	if err != nil {
		apiFailure(w, err)
		return
	}
	var input struct {
		Slot string `json:"slot"`
		Name string `json:"name"`
	}
	if err = decodeJSON(w, r, &input); err != nil {
		apiFailure(w, err)
		return
	}
	input.Name = strings.TrimSpace(input.Name)
	if !contains([]string{"1", "2", "3"}, input.Slot) || utf8.RuneCountInString(input.Name) < 1 || utf8.RuneCountInString(input.Name) > 32 {
		writeError(w, 400, "choose a save slot from 1 to 3 and a name of 1 to 32 characters")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()
	request, _ := json.Marshal(input)
	actionID, err := randomID(12)
	if err != nil {
		apiFailure(w, err)
		return
	}
	account, _, _, err := a.store.Mutate(ctx, hash, "story-save:"+actionID, request, func(account *Account) (Receipt, error) {
		ensureStory(&account.Progress)
		if account.StorySaves == nil {
			account.StorySaves = map[string]StorySave{}
		}
		for _, id := range account.Progress.CompletedQuestIDs {
			if !contains(account.RewardedQuestIDs, id) {
				account.RewardedQuestIDs = append(account.RewardedQuestIDs, id)
			}
		}
		account.StorySaves[input.Slot] = StorySave{input.Slot, input.Name, a.now().UTC(), account.Progress.Story, append([]string{}, account.Progress.CompletedQuestIDs...)}
		return Receipt{}, nil
	})
	if err != nil {
		apiFailure(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"save": account.StorySaves[input.Slot], "progress": account.Progress})
}

func (a *App) loadStory(w http.ResponseWriter, r *http.Request) {
	hash, err := bearer(r)
	if err != nil {
		apiFailure(w, err)
		return
	}
	var input struct {
		Slot string `json:"slot"`
	}
	if err = decodeJSON(w, r, &input); err != nil {
		apiFailure(w, err)
		return
	}
	if !contains([]string{"1", "2", "3"}, input.Slot) {
		writeError(w, 400, "unknown story slot")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()
	request, _ := json.Marshal(input)
	actionID, err := randomID(12)
	if err != nil {
		apiFailure(w, err)
		return
	}
	account, _, _, err := a.store.Mutate(ctx, hash, "story-load:"+actionID, request, func(account *Account) (Receipt, error) {
		save, ok := account.StorySaves[input.Slot]
		if !ok {
			return Receipt{}, &APIError{404, "that story slot is empty"}
		}
		for _, id := range account.Progress.CompletedQuestIDs {
			if !contains(account.RewardedQuestIDs, id) {
				account.RewardedQuestIDs = append(account.RewardedQuestIDs, id)
			}
		}
		// Copy through JSON so the active graph cannot mutate its saved snapshot.
		b, _ := json.Marshal(save.Story)
		account.Progress.Story = StoryState{}
		_ = json.Unmarshal(b, &account.Progress.Story)
		account.Progress.CompletedQuestIDs = append([]string{}, save.CompletedQuestIDs...)
		refreshDailyPromise(&account.Progress, a.now().UTC())
		return Receipt{}, nil
	})
	if err != nil {
		apiFailure(w, err)
		return
	}
	a.world.reconcileStoryLocation(account.Player.ID, account.Progress.CompletedQuestIDs)
	writeJSON(w, 200, map[string]any{"story": account.Progress.Story, "progress": account.Progress})
}

func (a *App) inspectStory(w http.ResponseWriter, r *http.Request) {
	hash, err := bearer(r)
	if err != nil {
		apiFailure(w, err)
		return
	}
	var input struct {
		ID       string `json:"id"`
		QuestID  string `json:"questId"`
		ObjectID string `json:"objectId"`
	}
	if err = decodeJSON(w, r, &input); err != nil {
		apiFailure(w, err)
		return
	}
	rule, ok := storyRule(input.QuestID)
	if !ok || !safeID.MatchString(input.ID) || !contains(rule.InvestigationObjectIDs, input.ObjectID) {
		writeError(w, 400, "this object is not evidence for the named investigation")
		return
	}
	var target MapSpawn
	for _, object := range rule.Objects {
		if object.ID == input.ObjectID {
			target = MapSpawn{object.X, object.Y}
			break
		}
	}
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()
	request, _ := json.Marshal(input)
	account, _, duplicate, err := a.store.Mutate(ctx, hash, "story-inspect:"+input.ID, request, func(account *Account) (Receipt, error) {
		if err := requireQuestOrder(input.QuestID, account.Progress.CompletedQuestIDs); err != nil {
			return Receipt{}, err
		}
		if contains(account.Progress.CompletedQuestIDs, input.QuestID) || storyNode(&account.Progress, input.QuestID) != "intro" {
			return Receipt{}, &APIError{409, "this investigation has already moved on"}
		}
		if !a.world.nearStoryTarget(account.Player.ID, rule.MapID, target, .12) {
			return Receipt{}, &APIError{409, "walk to this piece of evidence first"}
		}
		inspected := account.Progress.Story.Inspections[input.QuestID]
		if !contains(inspected, input.ObjectID) {
			account.Progress.Story.Inspections[input.QuestID] = append(inspected, input.ObjectID)
		}
		return Receipt{}, nil
	})
	if err != nil {
		apiFailure(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"story": account.Progress.Story, "progress": account.Progress, "duplicate": duplicate})
}

func (a *App) storyCinematic(w http.ResponseWriter, r *http.Request) {
	hash, err := bearer(r)
	if err != nil {
		apiFailure(w, err)
		return
	}
	var input struct {
		ID   string `json:"id"`
		Kind string `json:"kind"`
	}
	if err = decodeJSON(w, r, &input); err != nil {
		apiFailure(w, err)
		return
	}
	prerequisites := map[string]string{"arrival": "", "platform": "a1-arrival", "clockmill": "a2-broken-clock", "dark-beam": "b1-new-route", "storm": "b1-storm", "bell": "b1-atlas"}
	questID, ok := prerequisites[input.Kind]
	if !ok || !safeID.MatchString(input.ID) {
		writeError(w, 400, "unknown cinematic or action ID")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()
	request, _ := json.Marshal(input)
	account, _, duplicate, err := a.store.Mutate(ctx, hash, "story-cinematic:"+input.ID, request, func(account *Account) (Receipt, error) {
		if questID != "" && !contains(account.Progress.CompletedQuestIDs, questID) {
			return Receipt{}, &APIError{409, "that story moment has not happened yet"}
		}
		account.Progress.Story.Flags["cinematic:"+input.Kind] = true
		return Receipt{}, nil
	})
	if err != nil {
		apiFailure(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"story": account.Progress.Story, "progress": account.Progress, "duplicate": duplicate})
}
