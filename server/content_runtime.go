package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strings"

	"glotworld/server/internal/contentstore"
	"glotworld/server/internal/store"
	"glotworld/server/internal/world"

	"golang.org/x/text/unicode/norm"
)

type CourseGrading = contentstore.Grading

func (a *App) InstallContent(bundle *contentstore.Bundle) error {
	if err := bundle.Validate(); err != nil {
		return err
	}
	a.content = bundle
	a.indexStationExercises()
	a.lexemeSentences = map[string][]string{}
	for _, record := range bundle.Records {
		if record.Kind != "sentence" {
			continue
		}
		var body map[string]any
		_ = json.Unmarshal(record.Body, &body)
		for _, entry := range anyValues(body["words"]) {
			word, _ := entry.(map[string]any)
			if id, ok := word["lexemeId"].(string); ok {
				a.lexemeSentences[id] = append(a.lexemeSentences[id], record.ID)
			}
		}
	}
	a.courseCurricula = map[string]Curriculum{}
	adapter, err := store.NewCanonical(a.store, bundle, storeHooks())
	if err != nil {
		return err
	}
	a.canonical = adapter
	a.store = adapter
	for _, course := range bundle.Courses {
		c, err := curriculumFromContent(bundle, course, adapter)
		if err != nil {
			return fmt.Errorf("course %s: %w", course.Slug, err)
		}
		a.courseCurricula[course.ID] = c
	}
	a.curriculum = a.courseCurricula[adapter.DefaultCourse()]
	return nil
}
func curriculumFromContent(bundle *contentstore.Bundle, course contentstore.Course, adapter *store.Canonical) (Curriculum, error) {
	data, ok := bundle.Private(course.ID, "curriculum")
	if !ok {
		return Curriculum{}, fmt.Errorf("missing private grading curriculum")
	}
	var merged map[string]json.RawMessage
	if err := json.Unmarshal(adapter.Raw(data, false), &merged); err != nil {
		return Curriculum{}, err
	}
	if extra, exists := bundle.Private(course.ID, "course"); exists {
		var additions map[string]json.RawMessage
		if err := json.Unmarshal(adapter.Raw(extra, false), &additions); err != nil {
			return Curriculum{}, err
		}
		for key, value := range additions {
			if old, exists := merged[key]; exists {
				if len(value) > 0 && value[0] == '[' {
					var left, right []json.RawMessage
					_ = json.Unmarshal(old, &left)
					_ = json.Unmarshal(value, &right)
					merged[key], _ = json.Marshal(append(left, right...))
				} else {
					var left, right map[string]json.RawMessage
					_ = json.Unmarshal(old, &left)
					_ = json.Unmarshal(value, &right)
					if left == nil {
						left = map[string]json.RawMessage{}
					}
					for k, v := range right {
						if _, duplicate := left[k]; duplicate {
							return Curriculum{}, fmt.Errorf("course duplicates %s mapping %s", key, k)
						}
						left[k] = v
					}
					merged[key], _ = json.Marshal(left)
				}
			} else {
				merged[key] = value
			}
		}
	}
	data, _ = json.Marshal(merged)
	c, err := parseCurriculum(data)
	if err != nil {
		return c, err
	}
	for exerciseID, words := range c.ContextWordIDs {
		exercise, exists := c.Exercises[exerciseID]
		if !exists || exercise.TargetWordID != "" {
			return c, fmt.Errorf("invalid context exposure exercise %s", exerciseID)
		}
		for _, word := range words {
			if !contains(exercise.WordIDs, word) {
				exercise.WordIDs = append(exercise.WordIDs, word)
			}
		}
		c.Exercises[exerciseID] = exercise
	}
	if data, ok = bundle.Private(course.ID, "activityBoards"); ok {
		if err = loadActivityBoards(&c, adapter.Raw(data, false)); err != nil {
			return c, err
		}
	}
	if data, ok = bundle.Private(course.ID, "syllabus"); ok {
		if c.Syllabus, err = parseSyllabus(adapter.Raw(data, false), c.Lexicon); err != nil {
			return c, err
		}
	}
	for _, entry := range []struct{ kind, source string }{{"minigames", "story"}, {"expeditionLearning", "expedition"}} {
		if data, ok = bundle.Private(course.ID, entry.kind); ok {
			var check struct {
				Exercises []json.RawMessage `json:"exercises"`
			}
			if json.Unmarshal(data, &check) == nil && len(check.Exercises) == 0 {
				continue
			}
			// Validate against this course's stored rules. Production has no
			// legacy files, and the runtime manifest cache is installed later.
			var rules expeditionManifest
			if entry.source == "expedition" {
				ruleData, exists := bundle.Private(course.ID, "expeditions")
				if !exists {
					return c, fmt.Errorf("missing private expedition rules")
				}
				if err = json.Unmarshal(adapter.Raw(ruleData, false), &rules); err != nil {
					return c, fmt.Errorf("expedition rules: %w", err)
				}
			}
			if err = loadMiniGameExercisesWithRules(&c, adapter.Raw(data, false), entry.source, rules); err != nil {
				return c, err
			}
		}
	}
	c.StoryRules = map[string]StoryRule{}
	if data, ok = bundle.Private(course.ID, "storyRules"); ok {
		var manifest struct {
			Rules []StoryRule `json:"rules"`
		}
		if err = json.Unmarshal(adapter.Raw(data, false), &manifest); err != nil {
			return c, err
		}
		for _, rule := range manifest.Rules {
			c.StoryRules[rule.QuestID] = rule
		}
	}
	c.CourseID = course.ID
	c.Target = course.Target
	c.Grading = course.Grading
	for id, e := range c.Exercises {
		e.Grading = &c.Grading
		c.Exercises[id] = e
	}
	return c, nil
}
func (a *App) storyRule(id string) (StoryRule, bool) {
	if a.editing != nil && (a.curriculum.Target == "" || a.curriculum.Target == "de") {
		a.editing.mu.RLock()
		defer a.editing.mu.RUnlock()
		for _, rule := range a.editing.current.Investigations.Rules {
			if rule.QuestID == id {
				return rule, true
			}
		}
		return StoryRule{}, false
	}
	if a.curriculum.StoryRules != nil {
		rule, ok := a.curriculum.StoryRules[id]
		return rule, ok
	}
	return storyRule(id)
}
func (a *App) questOrder() []string {
	if a.content == nil || a.curriculum.Target == "de" {
		return storyQuestOrder
	}
	var ids []string
	for id := range a.curriculum.StoryRules {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	return ids
}

// Each request receives its own curriculum/store view. Course activation cannot
// mutate another request's grader or accept a write against a switched course.
func (a *App) withCourse(handler func(*App, http.ResponseWriter, *http.Request)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if a.content == nil {
			handler(a, w, r)
			return
		}
		scoped := *a
		courseID := a.canonical.DefaultCourse()
		hash, authErr := bearer(r)
		if authErr != nil && r.URL.Path == "/api/world" {
			if token := r.URL.Query().Get("token"); len(token) >= 32 && len(token) <= 128 {
				hash = tokenHash(token)
				authErr = nil
			}
		}
		if authErr == nil {
			if active, loaded := r.Context().Value(activeCourseKey{}).(string); loaded {
				if active != "" {
					courseID = active
				}
			} else if account, err := a.store.Get(r.Context(), hash); err == nil && account.ActiveCourseID != "" {
				courseID = account.ActiveCourseID
			}
		}

		if c, ok := a.courseCurricula[courseID]; ok {
			scoped.curriculum = c
		}
		expected := courseID
		if r.URL.Path == "/api/account/login" || r.URL.Path == "/api/referral/link" || strings.HasPrefix(r.URL.Path, "/api/billing/") {
			expected = ""
		}
		scoped.store = a.canonical.WithCourse(expected)
		if r.Body != nil && r.Method == http.MethodPost && r.URL.Path != "/api/billing/webhook" {
			raw, err := io.ReadAll(io.LimitReader(r.Body, 65538))
			if err != nil {
				writeError(w, 400, "invalid request body")
				return
			}
			if len(raw) > 65536 {
				writeError(w, 400, "request exceeds 64 KiB")
				return
			}
			r.Body = io.NopCloser(bytes.NewReader(a.canonical.Raw(raw, false)))
		}
		if r.URL.Path == "/api/world" {
			handler(&scoped, w, r)
			return
		}
		handler(&scoped, &canonicalWriter{ResponseWriter: w, adapter: a.canonical}, r)
	}
}

// The encoder emits JSON in one write. Responses are rewritten only at the API
// boundary; authored sentence strings and presentation IDs remain untouched.
type canonicalWriter struct {
	http.ResponseWriter
	adapter *store.Canonical
}

func (w *canonicalWriter) Write(data []byte) (int, error) {
	changed := w.adapter.Raw(data, true)
	_, err := w.ResponseWriter.Write(changed)
	if err != nil {
		return 0, err
	}
	return len(data), nil
}

func genericNormalize(value string, g CourseGrading, sensitive bool) string {
	value = norm.NFC.String(strings.Join(strings.Fields(value), " "))
	trim := g.IgnoreTrailing

	value = strings.TrimRight(value, trim+" \t\r\n")
	if !sensitive {
		value = strings.ToLower(value)
	}
	return value
}
func keyboardNormalize(value string, g CourseGrading) string {
	keys := make([]string, 0, len(g.KeyboardSubstitutions))
	for key := range g.KeyboardSubstitutions {
		keys = append(keys, key)
	}
	sort.Slice(keys, func(i, j int) bool { return len(keys[i]) > len(keys[j]) })
	var pairs []string
	for _, key := range keys {
		pairs = append(pairs, key, g.KeyboardSubstitutions[key])
	}
	if len(pairs) > 0 {
		return strings.NewReplacer(pairs...).Replace(value)
	}
	return value
}
func courseGrade(e Exercise, answer string) bool {
	g := *e.Grading
	production := e.Mode == "production"
	actual := genericNormalize(answer, g, (e.CaseSensitive || g.CaseSensitive) && !production)
	for _, accepted := range append([]string{e.Answer}, e.AcceptedAnswers...) {
		if production && e.CaseSensitive {
			left, right := strings.Fields(genericNormalize(answer, g, true)), strings.Fields(genericNormalize(accepted, g, true))
			changed := false
			if len(left) == len(right) {
				for i, word := range right {
					if contains(g.MeaningfulCapitals, word) && left[i] == strings.ToLower(word) {
						changed = true
						break
					}
				}
			}
			if changed {
				continue
			}
		}
		expected := genericNormalize(accepted, g, (e.CaseSensitive || g.CaseSensitive) && !production)
		if actual == expected {
			return true
		}
		if !production {
			continue
		}
		x, y := strings.Fields(keyboardNormalize(actual, g)), strings.Fields(keyboardNormalize(expected, g))
		if len(x) != len(y) {
			continue
		}
		slips := 0
		match := true
		for i, word := range x {
			if word == y[i] {
				continue
			}
			if !g.MechanicalTypos || slips > 0 || !mechanicalTypo(word, y[i]) {
				match = false
				break
			}
			slips++
		}
		if match {
			return true
		}
	}
	return false
}
func (a *App) courseFeedback(e Exercise, answer, lang string) string {
	correct := e.Grade(answer)
	if correct {
		if explanation := a.authoredExplanation(e, lang); explanation != "" {
			return explanation
		}
	}
	// German retains its precise grammar guidance. Other courses never receive
	// German article, verb-order or umlaut advice.
	if a.curriculum.Target == "" || a.curriculum.Target == "de" {
		return e.Feedback(answer)
	}
	if correct {
		if e.Explanation != "" {
			return e.Explanation
		}
		switch lang {
		case "tr":
			return "Yanıtınız doğru."
		case "de":
			return "Deine Antwort ist richtig."
		}
		return "Your answer is correct."
	}
	switch lang {
	case "tr":
		return "Yanıtınızı örnek yanıtla karşılaştırıp yeniden deneyin."
	case "de":
		return "Vergleiche deine Antwort mit der Musterantwort und versuche es erneut."
	}
	return "Compare your answer with the model answer and try again."
}

func (a *App) authoredExplanation(e Exercise, lang string) string {
	if a.content == nil || a.canonical == nil {
		return ""
	}
	id, _ := a.canonical.ForwardID(e.ID)
	record, exists := a.content.ByID[id]
	if !exists || record.CourseID != a.curriculum.CourseID {
		return ""
	}
	var body struct {
		Support map[string]struct {
			Explanation string `json:"explanation"`
		} `json:"support"`
	}
	if json.Unmarshal(record.Body, &body) != nil {
		return ""
	}
	return body.Support[lang].Explanation
}

func (a *App) installProductionManifests() {
	source := manifestFiles{content: map[string][]byte{}, sealed: true}
	for kind, file := range map[string]string{"curriculum": "curriculum.json", "course": "course.json", "syllabus": "syllabus.json", "activityBoards": "activity_boards.json", "storyRules": "story_rules.json", "expeditions": "expeditions.json", "expeditionLearning": "expedition_learning.json", "minigames": "minigame_stories.json"} {
		if data, ok := a.content.Private(a.canonical.DefaultCourse(), kind); ok {
			source.content[file] = a.canonical.Raw(data, false)
		}
	}
	curriculumFiles = source
}

func (a *App) nearCourseStoryTarget(account *Account, mapID string, target MapSpawn, radius WorldRange) bool {
	if a.content != nil {
		course := a.content.ByCourse[account.ActiveCourseID]
		var world struct {
			Interaction string `json:"interaction"`
		}
		_ = json.Unmarshal(course.World, &world)
		if world.Interaction == "classroom" {
			return account.Player.MapID == mapID && account.Player.InteriorID == "" && a.world.Definition(mapID).CoordinateFrame.Within(MapSpawn{X: account.Player.X, Y: account.Player.Y}, target, radius)
		}
	}
	return a.world.NearTarget(account.Player.ID, mapID, target, radius)
}

func (a *App) classroomCourse(id string) bool {
	var world struct {
		Interaction string `json:"interaction"`
	}
	_ = json.Unmarshal(a.content.ByCourse[id].World, &world)
	return world.Interaction == "classroom"
}
func (a *App) saveCourseLocation(account *Account) {
	frame := account.CourseStates[account.ActiveCourseID].LocationFrame
	if a.classroomCourse(account.ActiveCourseID) {
		account.Player = a.world.SavedPlayer(account.Player)
		frame = WorldCoordinateFrame{}
	} else {
		account.Player, frame = a.world.SavedCourseLocation(account.Player, frame)
	}
	store.SnapshotCourse(account)
	state := account.CourseStates[account.ActiveCourseID]
	state.LocationFrame = frame
	account.CourseStates[account.ActiveCourseID] = state
}
func courseStartingPlayer(base Player, course contentstore.Course) Player {
	var config struct {
		Spawn struct {
			MapID string  `json:"mapId"`
			X     float64 `json:"x"`
			Y     float64 `json:"y"`
		} `json:"spawn"`
	}
	_ = json.Unmarshal(course.World, &config)
	base.MapID = DefaultMapID
	base.InteriorID = ""
	base.X = .52
	base.Y = .61
	if config.Spawn.MapID != "" && validMapID(config.Spawn.MapID) && world.ValidCoordinate(config.Spawn.X) && world.ValidCoordinate(config.Spawn.Y) {
		base.MapID = config.Spawn.MapID
		base.X = config.Spawn.X
		base.Y = config.Spawn.Y
	}
	return base
}
