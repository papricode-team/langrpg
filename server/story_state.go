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

type StoryRule struct {
	InteriorID                       string            `json:"interiorId,omitempty"`
	GateKind                         string            `json:"gateKind,omitempty"`
	QuestID                          string            `json:"questId"`
	GateExerciseID                   string            `json:"gateExerciseId"`
	ReplyExerciseIDs                 []string          `json:"replyExerciseIds"`
	ChoiceIDs                        []string          `json:"choiceIds"`
	MapID                            string            `json:"mapId"`
	NPCID                            string            `json:"npcId"`
	NPC                              MapSpawn          `json:"npc"`
	CompletionInvestigationObjectIDs []string          `json:"completionInvestigationObjectIds,omitempty"`
	OptionalInvestigationObjectIDs   []string          `json:"optionalInvestigationObjectIds,omitempty"`
	InvestigationObjectIDs           []string          `json:"investigationObjectIds"`
	Objects                          []StoryObject     `json:"objects"`
	Choices                          []StoryChoiceRule `json:"choices"`
	// Locked evidence opens only with the named key, ledger or trust.
	Locks []StoryLock `json:"locks,omitempty"`
}

type StoryLock struct {
	ObjectID  string            `json:"objectId"`
	Condition StoryCondition    `json:"condition"`
	Reason    map[string]string `json:"reason"`
}

func (r StoryRule) lockFor(objectID string) (StoryLock, bool) {
	for _, lock := range r.Locks {
		if lock.ObjectID == objectID {
			return lock, true
		}
	}
	return StoryLock{}, false
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
	// At least one alternative must hold (a door several keys open).
	AnyOf []StoryCondition `json:"anyOf,omitempty"`
}

func (c StoryCondition) met(s *StoryState) bool {
	if !((c.Flag == "" || s.Flags[c.Flag]) && (c.WithoutFlag == "" || !s.Flags[c.WithoutFlag]) &&
		(c.Item == "" || contains(s.Inventory, c.Item)) && (c.MissingItem == "" || !contains(s.Inventory, c.MissingItem)) &&
		(c.Faction == "" || s.Reputation[c.Faction] >= c.Minimum) && (c.Ending == "" || s.Ending == c.Ending)) {
		return false
	}
	if len(c.AnyOf) == 0 {
		return true
	}
	for _, alternative := range c.AnyOf {
		if alternative.met(s) {
			return true
		}
	}
	return false
}

type StoryEffect struct {
	Faction string `json:"faction"`
	Amount  int    `json:"amount"`
	Item    string `json:"item"`
	Flag    string `json:"flag"`
	Bell    int    `json:"bell"`
}

type StoryObject struct {
	WorldID string  `json:"worldId,omitempty"`
	ID      string  `json:"id"`
	X       float64 `json:"x"`
	Y       float64 `json:"y"`
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
	migrateExpeditionPlans(s.ExpeditionPlans)
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
	// Elise's key hangs on the Waldruh lease; saves past that scene carry it.
	if contains(p.CompletedQuestIDs, "a2-apartment") {
		giveStoryItem(s, "keeper-key")
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
	prior := s.Bell - s.InkWarnings
	s.Bell = max(min(limit, earned+s.BellWarnings), min(prior, min(limit, ceiling+s.BellWarnings)))
	s.InkWarnings = 0
	applyInkToBell(s, refreshInk(p, currentStoryMechanics().Ink, ""), limit)
}

// Pressure survives canonical beats. Two early warnings leave the last bell
// for the finale rather than turning language mistakes into a soft lock.
func warnStoryBell(s *StoryState) {
	if s.BellWarnings < 2 {
		s.BellWarnings++
		s.Bell = min(6, s.Bell-s.InkWarnings+1)
		s.InkWarnings = 0
	}
}
func recordStoryGateFailure(s *StoryState, questID string) {
	// Mistakes are practice evidence only; they never push the story toward doom.
	s.GateFailures[questID] = min(3, s.GateFailures[questID]+1)
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
	if err := a.requireQuestAccess(questID, &account.Progress); err != nil {
		return err
	}
	if contains(account.Progress.CompletedQuestIDs, questID) || storyNode(&account.Progress, questID) != "gate" {
		return &APIError{409, "open this conversation's current request first"}
	}
	rule, _ := a.storyRule(questID)
	if !a.nearStoryRule(account, rule, rule.NPC, storyNPCRange) {
		return &APIError{409, "walk back to this conversation's character first"}
	}
	return nil
}

func (a *App) requireStoryReply(account *Account, questID string) error {
	if err := a.requireQuestAccess(questID, &account.Progress); err != nil {
		return err
	}
	if contains(account.Progress.CompletedQuestIDs, questID) || storyNode(&account.Progress, questID) != "intro" {
		return &APIError{409, "open this character's greeting first"}
	}
	rule, _ := a.storyRule(questID)
	if !a.nearStoryRule(account, rule, rule.NPC, storyNPCRange) {
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
	for _, id := range a.questOrder() {
		if a.content != nil && !a.questVisible(id, account) {
			continue
		}
		rule, _ := a.storyRule(id)
		if a.content != nil {
			rule.Objects = append([]StoryObject{}, rule.Objects...)
			for i := range rule.Objects {
				rule.Objects[i].WorldID = rule.Objects[i].ID
			}
		}
		rules = append(rules, rule)
	}
	saves := []map[string]any{}
	for _, save := range account.StorySaves {
		saves = append(saves, map[string]any{"slot": save.Slot, "name": save.Name, "at": save.At})
	}
	sort.Slice(saves, func(i, j int) bool { return saves[i]["slot"].(string) < saves[j]["slot"].(string) })
	writeJSON(w, 200, map[string]any{"story": account.Progress.Story, "progress": account.Progress, "rules": rules, "saves": saves, "mechanics": a.mechanics()})
}

type StoryTransitionInput struct {
	ID           string `json:"id"`
	QuestID      string `json:"questId"`
	NodeID       string `json:"nodeId"`
	ChoiceID     string `json:"choiceId,omitempty"`
	AttemptID    string `json:"attemptId,omitempty"`
	NamePractice bool   `json:"namePractice,omitempty"`
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
	rule, known := a.storyRule(input.QuestID)
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
	if input.NodeID == "gate" && rule.GateKind != "name" {
		if !safeID.MatchString(input.AttemptID) {
			writeError(w, 409, "answer this conversation's request first")
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
		if !ok || json.Unmarshal(proof.Request, &attempt) != nil || proof.Receipt.Correct == nil || !*proof.Receipt.Correct || attempt.ExerciseID != rule.GateExerciseID || attempt.QuestID != input.QuestID || (attempt.Mode != "production" && !a.isGuidedStoryGate(attempt)) || !attempt.SceneAttempt {
			writeError(w, 409, "a correct saved answer from this conversation is required")
			return
		}
	}
	request, _ := json.Marshal(input)
	account, receipt, duplicate, err := a.mutate(ctx, hash, "story:"+input.ID, request, func(account *Account) (Receipt, error) {
		ensureStory(&account.Progress)
		migrateIntake(&account.Progress, a.curriculum.Syllabus)
		if err := a.requireQuestAccess(input.QuestID, &account.Progress); err != nil {
			return Receipt{}, err
		}
		if contains(account.Progress.CompletedQuestIDs, input.QuestID) {
			return Receipt{}, &APIError{409, "this discovery is complete; revisit it in your journal"}
		}
		if storyNode(&account.Progress, input.QuestID) != input.NodeID {
			return Receipt{}, &APIError{409, "the conversation has moved on; reopen the current line"}
		}
		if !a.nearStoryRule(account, rule, rule.NPC, storyNPCRange) {
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
				if contains(rule.CompletionInvestigationObjectIDs, id) || contains(rule.OptionalInvestigationObjectIDs, id) {
					continue
				}
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
			if rule.GateKind == "name" {
				if !input.NamePractice {
					return Receipt{}, &APIError{409, "say your player name first"}
				}
				s.Flags["prologue-name-practice"] = true
			} else if !contains(s.GateAttempts[input.QuestID], input.AttemptID) {
				return Receipt{}, &APIError{409, "answer the current conversation's request first"}
			}
			s.Nodes[input.QuestID] = "choice"
		case "choice":
			for _, id := range rule.CompletionInvestigationObjectIDs {
				if !contains(s.Inspections[input.QuestID], id) {
					return Receipt{}, &APIError{409, "find the requested object before finishing this scene"}
				}
			}
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
			a.applyStoryChoice(s, input.QuestID, input.ChoiceID)
			account.Progress.CompletedQuestIDs = append(account.Progress.CompletedQuestIDs, input.QuestID)
			refreshInk(&account.Progress, currentStoryMechanics().Ink, input.QuestID)
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
	applyStoryChoiceRule(s, questID, choiceID, rule)
}
func (a *App) applyStoryChoice(s *StoryState, questID, choiceID string) {
	rule, _ := a.storyRule(questID)
	applyStoryChoiceRule(s, questID, choiceID, rule)
}
func applyStoryChoiceRule(s *StoryState, questID, choiceID string, rule StoryRule) {
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
	account, _, _, err := a.mutate(ctx, hash, "story-save:"+actionID, request, func(account *Account) (Receipt, error) {
		ensureStory(&account.Progress)
		if account.StorySaves == nil {
			account.StorySaves = map[string]StorySave{}
		}
		for _, id := range account.Progress.CompletedQuestIDs {
			if !contains(account.RewardedQuestIDs, id) {
				account.RewardedQuestIDs = append(account.RewardedQuestIDs, id)
			}
		}
		account.StorySaves[input.Slot] = StorySave{Slot: input.Slot, Name: input.Name, At: a.now().UTC(), Story: account.Progress.Story, CompletedQuestIDs: append([]string{}, account.Progress.CompletedQuestIDs...)}
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
	account, _, _, err := a.mutate(ctx, hash, "story-load:"+actionID, request, func(account *Account) (Receipt, error) {
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
	completed := account.Progress.CompletedQuestIDs
	a.world.ReconcileStoryLocation(account.Player.ID, func(mapID string) bool { return routeUnlocked(mapID, completed) })
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
	rule, ok := a.storyRule(input.QuestID)
	if !ok || !safeID.MatchString(input.ID) || !contains(rule.InvestigationObjectIDs, input.ObjectID) {
		writeError(w, 400, "this object is not evidence for the named investigation")
		return
	}
	var target MapSpawn
	for _, object := range rule.Objects {
		if object.ID == input.ObjectID {
			target = MapSpawn{X: object.X, Y: object.Y}
			break
		}
	}
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()
	request, _ := json.Marshal(input)
	account, _, duplicate, err := a.mutate(ctx, hash, "story-inspect:"+input.ID, request, func(account *Account) (Receipt, error) {
		migrateIntake(&account.Progress, a.curriculum.Syllabus)
		if err := a.requireQuestAccess(input.QuestID, &account.Progress); err != nil {
			return Receipt{}, err
		}
		if contains(account.Progress.CompletedQuestIDs, input.QuestID) || (storyNode(&account.Progress, input.QuestID) != "intro" && !(storyNode(&account.Progress, input.QuestID) == "choice" && (contains(rule.CompletionInvestigationObjectIDs, input.ObjectID) || contains(rule.OptionalInvestigationObjectIDs, input.ObjectID)))) {
			return Receipt{}, &APIError{409, "this investigation has already moved on"}
		}
		if contains(rule.CompletionInvestigationObjectIDs, input.ObjectID) && storyNode(&account.Progress, input.QuestID) != "choice" {
			return Receipt{}, &APIError{409, "ask for directions before finding this object"}
		}
		if !a.nearStoryRule(account, rule, target, storyEvidenceRange) {
			return Receipt{}, &APIError{409, "walk to this piece of evidence first"}
		}
		if lock, locked := rule.lockFor(input.ObjectID); locked && !lock.Condition.met(&account.Progress.Story) {
			message := lock.Reason["en"]
			if message == "" {
				message = "this door is locked"
			}
			return Receipt{}, &APIError{409, message}
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
	prerequisites := map[string]string{"arrival": "", "platform": "a1-arrival", "recording": "a1-station", "erasure": "a1-lost-parcel", "remembered": "a1-bench", "clockmill": "a2-broken-clock", "rails": "a2-forest-rails", "confession": "a2-archive", "dark-beam": "b1-new-route", "ledger": "b1-work", "temptation": "b1-temptation", "storm": "b1-storm", "bell": "b1-atlas", "epilogue": "b1-atlas"}
	questID, ok := prerequisites[input.Kind]
	if !ok || !safeID.MatchString(input.ID) {
		writeError(w, 400, "unknown cinematic or action ID")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()
	request, _ := json.Marshal(input)
	account, _, duplicate, err := a.mutate(ctx, hash, "story-cinematic:"+input.ID, request, func(account *Account) (Receipt, error) {
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

// The introductory train is one small teaching space. Its story is available
// only while the player is in the authored room; town proximity stays unchanged.
func (a *App) nearStoryRule(account *Account, rule StoryRule, target MapSpawn, radius WorldRange) bool {
	if rule.InteriorID != "" {
		return a.world.InInterior(account.Player.ID, rule.MapID, rule.InteriorID)
	}
	return a.nearCourseStoryTarget(account, rule.MapID, target, radius)
}
