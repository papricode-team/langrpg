package main

import (
	"context"
	"net/http"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"
)

var miniGameIDs = []string{
	"re-ink", "lantern-lighting", "tray-rush", "numbered-apples",
	"departure-board", "brass-stamp", "sorting-office", "word-chain",
	"workbench", "kettle-forecast", "seed-packets", "lost-hour",
	"17-59", "looping-tape", "seven-chairs", "adas-alphabet",
	"neighborhood-boards", "delivery-run", "expedition-encounters",
}

// Mini-game forms are derived from the canonical lexicon, never an answer or
// correctness supplied by a game. Conventional exercise answers stay unchanged.
func (a *App) miniGameExercise(input AttemptInput, exercise Exercise) (Exercise, error) {
	if err := a.validateMiniGameContent(input, exercise); err != nil {
		return exercise, err
	}
	if input.ContextExerciseID != "" && input.AnswerKind != "surface" {
		return exercise, &APIError{400, "a recording context is only valid for surface transcription"}
	}
	if input.MiniGameID != "" {
		if !contains(miniGameIDs, input.MiniGameID) || input.SceneAttempt || input.ActivityID != "" || input.RunID != "" || len(exerciseWords(exercise)) == 0 {
			return exercise, &APIError{400, "send a known mini-game and a mapped vocabulary exercise"}
		}
	}
	if input.AnswerKind == "" {
		return exercise, nil
	}
	if input.AnswerKind == "surface" {
		return a.surfaceExercise(input, exercise)
	}
	word, exists := a.curriculum.Lexicon[exercise.TargetWordID]
	if !exists || word.Lemma == "" || exercise.ID != "lex-"+word.ID+"-"+exercise.Mode || (exercise.Mode != "recognition" && exercise.Mode != "listening") || (input.Mode != "recognition" && input.Mode != "listening") || input.SceneAttempt || input.ActivityID != "" {
		return exercise, &APIError{400, "picture and form answers require a canonical lexical recognition or listening exercise"}
	}
	exercise.AcceptedAnswers = nil
	switch input.AnswerKind {
	case "lexeme":
		exercise.Answer = word.Lemma
		exercise.AcceptedAnswers = []string{word.ID}
		// Formal Sie and ordinary sie identify different lexemes. Their IDs
		// remain unambiguous, and a submitted lemma must keep that distinction.
		exercise.CaseSensitive = contains([]string{"Sie", "Ihnen", "Ihr", "Ihre"}, word.Lemma)
		if word.Article != "" {
			form := word.Lemma
			if word.ArticleForm != "" {
				form = word.ArticleForm
			}
			exercise.AcceptedAnswers = append(exercise.AcceptedAnswers, word.Article+" "+form)
		}
	case "article":
		exercise.Answer = word.Article
	case "plural":
		exercise.Answer = word.Plural
	case "initial":
		first, _ := utf8.DecodeRuneInString(word.Lemma)
		exercise.Answer = strings.ToUpper(string(first))
	case "topic":
		exercise.Answer = word.Topic
	default:
		return exercise, &APIError{400, "unknown lexical answer kind"}
	}
	if exercise.Answer == "" {
		return exercise, &APIError{400, "this lexeme has no authored value for the requested form"}
	}
	// Avoid explanations for the conventional translation leaking into picture
	// and form feedback. The canonical value above is the correction to show.
	exercise.Explanation = ""
	return exercise, nil
}

var surfaceToken = regexp.MustCompile(`[\p{L}\p{N}]+(?:[-’'][\p{L}\p{N}]+)*`)

func (a *App) tapeContext(input AttemptInput) (Exercise, error) {
	context, exists := a.curriculum.Exercises[input.ContextExerciseID]
	quest, installed := a.curriculum.Quests["b1-witness"]
	if !exists || !installed || context.Mode != "production" || !strings.HasPrefix(context.ID, "b1-witness-exercise-") || !contains(quest.RequiredItemIDs, context.ItemID) || a.curriculum.Items[context.ItemID].Level != "B1" || context.TargetWordID != "" || len(exerciseWords(context)) == 0 {
		return Exercise{}, &APIError{400, "surface transcription requires an installed witness recording exercise"}
	}
	return context, nil
}

func (a *App) surfaceExercise(input AttemptInput, exercise Exercise) (Exercise, error) {
	word, exists := a.curriculum.Lexicon[exercise.TargetWordID]
	if input.MiniGameID != "looping-tape" || input.Mode != "production" || exercise.Mode != "production" || !exists || exercise.ID != "lex-"+word.ID+"-production" || input.SceneAttempt || input.ActivityID != "" || input.RunID != "" {
		return exercise, &APIError{400, "surface answers are lexical production from The Looping Tape only"}
	}
	context, err := a.tapeContext(input)
	if err != nil {
		return exercise, err
	}
	if !contains(exerciseWords(context), word.ID) {
		return exercise, &APIError{400, "the target word is not part of this witness recording"}
	}
	attested := map[string]bool{}
	formal := contains([]string{"Sie", "Ihnen", "Ihr", "Ihre"}, word.Lemma)
	for _, form := range append([]string{word.Lemma, word.ArticleForm, word.Plural}, word.SurfaceForms...) {
		if form != "" && len(strings.Fields(form)) == 1 {
			attested[normalizeAnswer(form, formal)] = true
		}
	}
	forms := []string{}
	for _, answer := range append([]string{context.Answer}, context.AcceptedAnswers...) {
		for _, token := range surfaceToken.FindAllString(answer, -1) {
			// Sentence-initial capitalization is an attested occurrence, while
			// formal address retains its lexically meaningful capital letter.
			if attested[normalizeAnswer(token, formal)] && !contains(forms, token) {
				forms = append(forms, token)
			}
		}
	}
	if len(forms) == 0 {
		return exercise, &APIError{400, "this recording has no attested target surface form"}
	}
	exercise.Answer, exercise.AcceptedAnswers, exercise.CaseSensitive, exercise.Explanation = forms[0], forms[1:], true, ""
	return exercise, nil
}

func gradeMiniGameAnswer(exercise Exercise, input AttemptInput) bool {
	if input.AnswerKind != "surface" {
		return exercise.Grade(input.Answer)
	}
	actual := normalizeAnswer(input.Answer, true)
	for _, form := range append([]string{exercise.Answer}, exercise.AcceptedAnswers...) {
		expected := normalizeAnswer(form, true)
		if actual == expected || productionAnswerMatches(actual, expected) {
			return true
		}
	}
	return false
}

func (a *App) requireMiniGameVocabulary(input AttemptInput, exercise Exercise, p *Progress) error {
	if input.MiniGameID == "" && input.AnswerKind == "" {
		return nil
	}
	if binding, authored := a.curriculum.MiniGameContent[exercise.ID]; authored && binding.RegionID != "" && !routeUnlocked(binding.RegionID, p.CompletedQuestIDs) {
		return routeLockedError(binding.RegionID)
	}
	for _, id := range exerciseWords(exercise) {
		if !p.WordIntroduced(id) {
			return &APIError{409, "mini-games use only words the Atlas has restored"}
		}
	}
	if input.AnswerKind == "surface" {
		context, err := a.tapeContext(input)
		if err != nil {
			return err
		}
		for _, id := range exerciseWords(context) {
			if !p.WordIntroduced(id) {
				return &APIError{409, "every word in the witness recording must be restored first"}
			}
		}
	}
	if input.AnswerKind != "lexeme" || input.Answer == "__timeout__" {
		return nil
	}
	// Distractor taps may be wrong, but must still identify an actual restored
	// word. Unknown or locked options cannot add exposure or retrieval evidence.
	answer := normalizeAnswer(input.Answer, false)
	known := false
	for _, word := range a.curriculum.Lexicon {
		form := word.Lemma
		if word.ArticleForm != "" {
			form = word.ArticleForm
		}
		if answer != normalizeAnswer(word.ID, false) && answer != normalizeAnswer(word.Lemma, false) && (word.Article == "" || answer != normalizeAnswer(word.Article+" "+form, false)) {
			continue
		}
		known = true
		if p.WordIntroduced(word.ID) {
			return nil
		}
	}
	if known {
		return &APIError{409, "the selected picture's word has not been restored yet"}
	}
	return &APIError{400, "the selected picture does not identify a canonical lexeme"}
}

func miniGameStats(stats ModeStats, input AttemptInput, correct bool) ModeStats {
	stats.Attempts++
	if correct {
		stats.Correct++
		if !input.Hinted {
			stats.UnaidedSuccesses++
		}
	}
	if !input.Hinted && input.ResponseTimeMs > 0 {
		stats.TimedAttempts++
		stats.ResponseTimeMs += int64(input.ResponseTimeMs)
	}
	return stats
}

func recordMiniGameEvidence(p *Progress, exercise Exercise, input AttemptInput, correct bool) {
	if input.MiniGameID != "" {
		p.MiniGameStats[input.MiniGameID] = miniGameStats(p.MiniGameStats[input.MiniGameID], input, correct)
	}
	if input.AnswerKind != "" && input.AnswerKind != "lexeme" {
		if p.FormStats[exercise.TargetWordID] == nil {
			p.FormStats[exercise.TargetWordID] = map[string]ModeStats{}
		}
		forms := p.FormStats[exercise.TargetWordID]
		forms[input.AnswerKind] = miniGameStats(forms[input.AnswerKind], input, correct)
	}
}

type RetrievalMetrics struct {
	Graded          int                  `json:"graded"`
	Correct         int                  `json:"correct"`
	Unaided         int                  `json:"unaided"`
	CreditedSeconds int                  `json:"creditedSeconds"`
	PerCreditedHour *float64             `json:"perCreditedHour"`
	Modalities      map[string]ModeStats `json:"modalities"`
	MiniGames       map[string]ModeStats `json:"miniGames"`
}

func retrievalMetrics(p Progress) RetrievalMetrics {
	metrics := RetrievalMetrics{Graded: p.Attempts, Correct: p.CorrectAttempts, CreditedSeconds: p.Intake.ActiveSeconds, Modalities: map[string]ModeStats{}, MiniGames: p.MiniGameStats}
	if metrics.MiniGames == nil {
		metrics.MiniGames = map[string]ModeStats{}
	}
	for _, memory := range p.Items {
		for mode, stats := range memory.ModeStats {
			total := metrics.Modalities[mode]
			total.Attempts += stats.Attempts
			total.Correct += stats.Correct
			total.UnaidedSuccesses += stats.UnaidedSuccesses
			total.TimedAttempts += stats.TimedAttempts
			total.ResponseTimeMs += stats.ResponseTimeMs
			metrics.Modalities[mode] = total
			metrics.Unaided += stats.UnaidedSuccesses
		}
	}
	if p.Intake.ActiveSeconds > 0 {
		rate := float64(p.Attempts) * 3600 / float64(p.Intake.ActiveSeconds)
		metrics.PerCreditedHour = &rate
	}
	return metrics
}

func (a *App) retrievals(w http.ResponseWriter, r *http.Request) {
	hash, err := bearer(r)
	if err != nil {
		apiFailure(w, err)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()
	account, err := a.store.Get(ctx, hash)
	if err != nil {
		apiFailure(w, err)
		return
	}
	writeJSON(w, 200, retrievalMetrics(account.Progress))
}
