package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"
)

const maxAttemptBatch = 30

// Each entry retains its own durable receipt. A failed entry does not erase
// accepted rounds, and retrying the same IDs can safely recover a partial batch.
func (a *App) attempt(w http.ResponseWriter, r *http.Request) {
	hash, err := bearer(r)
	if err != nil {
		apiFailure(w, err)
		return
	}
	if !strings.HasPrefix(strings.ToLower(r.Header.Get("Content-Type")), "application/json") {
		writeError(w, 415, "use Content-Type: application/json")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 65536)
	decoder := json.NewDecoder(r.Body)
	var raw json.RawMessage
	if err := decoder.Decode(&raw); err != nil {
		writeError(w, 400, "invalid JSON body (maximum 64 KiB)")
		return
	}
	var extra any
	if err := decoder.Decode(&extra); err != io.EOF {
		writeError(w, 400, "send exactly one JSON object or attempt array")
		return
	}
	trimmed := bytes.TrimSpace(raw)
	batch := len(trimmed) > 0 && trimmed[0] == '['
	var inputs []AttemptInput
	if batch {
		if err := json.Unmarshal(raw, &inputs); err != nil || len(inputs) == 0 || len(inputs) > maxAttemptBatch {
			writeError(w, 400, "send an array of 1 to 30 attempts")
			return
		}
	} else {
		var input AttemptInput
		if len(trimmed) == 0 || trimmed[0] != '{' || len(raw) > 8192 || json.Unmarshal(raw, &input) != nil {
			writeError(w, 400, "send an attempt object (maximum 8 KiB) or an array of 1 to 30 attempts")
			return
		}
		inputs = []AttemptInput{input}
	}
	if !a.allowCount("attempt:"+hash, 120, len(inputs)) {
		writeError(w, 429, "too many attempts; try again in a minute")
		return
	}
	for _, input := range inputs {
		if input.Preview {
			continue
		}
		ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
		playing := true
		account, err := a.touchAccess(ctx, hash, &playing)
		cancel()
		if err != nil {
			apiFailure(w, err)
			return
		}
		if status := a.accessState(account, a.now().UTC()); accessBlocked(status) {
			writeAccessBlocked(w, status)
			return
		}
		break
	}
	if !batch {
		result, err := a.applyAttempt(r.Context(), hash, inputs[0])
		if err != nil {
			apiFailure(w, err)
			return
		}
		writeJSON(w, 200, result)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()
	// Authenticate before a batch can return entry results, including an array
	// consisting entirely of malformed attempts.
	if _, err := a.store.Get(ctx, hash); err != nil {
		apiFailure(w, err)
		return
	}
	results := make([]map[string]any, 0, len(inputs))
	for _, input := range inputs {
		result, err := a.applyAttempt(ctx, hash, input)
		if err != nil {
			var accessError *AccessDeniedError
			if errors.As(err, &accessError) {
				writeAccessBlocked(w, accessError.Access)
				return
			}
			status, message := attemptFailure(err)
			results = append(results, map[string]any{"attemptId": input.ID, "status": status, "error": message})
			continue
		}
		delete(result, "progress")
		result["status"] = http.StatusOK
		results = append(results, result)
	}
	account, err := a.store.Get(ctx, hash)
	if err != nil {
		apiFailure(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"results": results, "progress": account.Progress, "retrievals": retrievalMetrics(account.Progress)})
}

func attemptFailure(err error) (int, string) {
	var apiError *APIError
	switch {
	case errors.As(err, &apiError):
		return apiError.Status, apiError.Message
	case errors.Is(err, ErrUnauthorized):
		return 401, "session is invalid; create or restore a session"
	case errors.Is(err, ErrConflict):
		return 409, ErrConflict.Error()
	default:
		slog.Error("batched attempt failed", "error", err)
		return 503, "storage is temporarily unavailable"
	}
}

// applyAttempt is the shared authoritative grading path for individual and batched rounds.
func (a *App) applyAttempt(ctx context.Context, hash string, input AttemptInput) (map[string]any, error) {
	if input.Reveal {
		if input.Preview {
			return nil, &APIError{400, "answer reveals must be recorded as assisted attempts"}
		}
		input.Hinted = true
		input.Answer = "[answer reveal]"
	}
	if input.Preview && input.SceneAttempt {
		return nil, &APIError{400, "story replies must be answered in their scene"}
	}
	if !safeID.MatchString(input.ID) || len(input.Answer) > 1024 || strings.TrimSpace(input.Answer) == "" || !validMode(input.Mode) {
		return nil, &APIError{400, "send a unique attempt ID, answer, and valid exercise mode"}
	}
	if (input.Rating != "" && input.Rating != "hard" && input.Rating != "good" && input.Rating != "easy") || input.ResponseTimeMs < 0 || input.ResponseTimeMs > 600000 || ((input.ScenarioID != "" || len(input.BoardState) > 0) && input.ActivityID == "") {
		return nil, &APIError{400, "send a valid recall rating, response time and mission context"}
	}
	exercise, ok := a.curriculum.Exercises[input.ExerciseID]
	if a.content != nil {
		account, err := a.getAccount(ctx, hash)
		if err != nil {
			return nil, err
		}
		id := a.content.Resolve("exercises", input.ExerciseID)
		visible := a.contentExerciseEntitled(id, &account.Progress)
		if input.Preview && a.contentPlacementExercise(id) {
			visible = true
		}
		if id == "" || !visible {
			return nil, &APIError{404, "content not found"}
		}
	}
	guidedGate := a.isGuidedStoryGate(input)
	if input.GuidedChoice && !guidedGate {
		return nil, &APIError{400, "guided choices must be supported replies to an A1 conversation's current request"}
	}
	transcriptFallback := exercise.Mode == "listening" && input.Mode == "recognition" && input.Hinted
	missionRecognition := exercise.Mode == "production" && input.Mode == "recognition" && input.Hinted && input.ActivityID != "" && safeID.MatchString(input.RunID) && activityContains(input.ActivityID, a.curriculum.Items[exercise.ItemID].Level, exercise.ID)
	if !ok || exercise.ItemID != input.ItemID || (exercise.Mode != input.Mode && !transcriptFallback && !missionRecognition && !guidedGate) {
		return nil, &APIError{400, "exercise, item and mode do not match the curriculum"}
	}
	exercise, err := a.miniGameExercise(input, exercise)
	if err != nil {
		return nil, err
	}
	exerciseLevel := a.curriculum.Items[exercise.ItemID].Level
	if binding, authored := a.curriculum.MiniGameContent[exercise.ID]; authored {
		exerciseLevel = binding.Level
	}
	if input.Level != "" && (!validLevel(input.Level) || exerciseLevel != input.Level) {
		return nil, &APIError{400, "exercise does not belong to this level"}
	}
	if input.ActivityID != "" || input.RunID != "" {
		level := a.curriculum.Items[exercise.ItemID].Level
		if !safeID.MatchString(input.RunID) || !activityContains(input.ActivityID, level, exercise.ID) {
			return nil, &APIError{400, "activity run and exercise do not match a known mission"}
		}
		// Board actions submit authored sentences rather than independent German
		// output. They can establish comprehension, never unaided production.
		if exercise.Mode == "production" {
			input.Hinted = true
		}
	}
	if input.QuestID != "" {
		quest, ok := a.curriculum.Quests[input.QuestID]
		if !ok || !contains(quest.RequiredItemIDs, input.ItemID) {
			return nil, &APIError{400, "item does not belong to this quest"}
		}
	}
	if input.SceneAttempt {
		rule, known := a.currentStoryRule(input.QuestID)
		gate := input.ExerciseID == rule.GateExerciseID && (input.Mode == "production" || guidedGate)
		reply := contains(rule.ReplyExerciseIDs, input.ExerciseID) && input.Mode == "recognition"
		if !known || (!gate && !reply) || input.ActivityID != "" {
			return nil, &APIError{400, "the scene answer must match its authored German request"}
		}
	}
	boardCorrect, boardHandled, boardErr := a.curriculum.activityBoardGrade(input)
	if boardErr != nil {
		return nil, boardErr
	}
	request, _ := json.Marshal(input)
	ctx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	if input.Preview {
		// Preview is read-only, including for accounts awaiting exposure
		// migration. It supplies no answer, explanation, receipt or evidence.
		account, err := a.store.Get(ctx, hash)
		if err != nil {
			return nil, err
		}
		if err := checkAccessGeneration(ctx, account); err != nil {
			return nil, err
		}
		if status := a.accessState(account, a.now().UTC()); accessBlocked(status) {
			return nil, &AccessDeniedError{Access: status}
		}
		if err := a.requireMiniGameVocabulary(input, exercise, &account.Progress); err != nil {
			return nil, err
		}
		correct := gradeMiniGameAnswer(exercise, input)
		if input.Reveal {
			correct = false
		}
		if boardHandled {
			correct = boardCorrect
		}
		return map[string]any{"attemptId": input.ID, "preview": true, "correct": correct}, nil
	}
	account, receipt, duplicate, err := a.mutate(ctx, hash, "attempt:"+input.ID, request, func(account *Account) (Receipt, error) {
		if input.SceneAttempt {
			check := a.requireStoryGate
			if input.Mode == "recognition" && !guidedGate {
				check = a.requireStoryReply
			}
			if err := check(account, input.QuestID); err != nil {
				return Receipt{}, err
			}
		}
		now := a.now().UTC()
		migrateContextExposures(&account.Progress, a.curriculum, now)
		migrateIntake(&account.Progress, a.curriculum.Syllabus)
		// Pacing: a word drill needs its word restored. Phrase practice and the
		// placement sample and story conversations stay open regardless of intake.
		if err := a.requireWordIntroduced(exercise, &account.Progress); err != nil {
			return Receipt{}, err
		}
		if err := a.requireMiniGameVocabulary(input, exercise, &account.Progress); err != nil {
			return Receipt{}, err
		}
		correct := gradeMiniGameAnswer(exercise, input)
		if boardHandled {
			correct = boardCorrect
		}
		gradedInput := input
		if input.Reveal {
			correct = false
		}
		if binding, authored := a.curriculum.MiniGameContent[exercise.ID]; authored && binding.ForceHinted {
			gradedInput.Hinted = true
		}
		if input.SceneAttempt && input.Mode == "recognition" && !guidedGate && account.Progress.Story.Flags["reply-help:"+input.ExerciseID] {
			gradedInput.Hinted = true
		}
		sourceMode := exercise.Mode
		if guidedGate {
			sourceMode = "recognition"
		}
		receipt, err := recordRatedAttempt(&account.Progress, input.ItemID, input.Mode, correct, gradedInput.Hinted, now, sourceMode, input.Rating, input.ResponseTimeMs)
		if err != nil {
			return Receipt{}, err
		}
		recordWordEvidence(&account.Progress, exercise, gradedInput, correct, now)
		recordMiniGameEvidence(&account.Progress, exercise, gradedInput, correct)
		recordPromiseAttempt(&account.Progress, correct, gradedInput.Hinted, now, input.ItemID+":"+input.Mode)
		if input.SceneAttempt && input.Mode == "recognition" && !guidedGate {
			if correct {
				account.Progress.Story.Flags["reply:"+input.ExerciseID] = true
			} else {
				account.Progress.Story.Flags["reply-help:"+input.ExerciseID] = true
			}
		}
		if input.SceneAttempt && input.Mode == "production" && !correct {
			recordStoryGateFailure(&account.Progress.Story, input.QuestID)
		}
		if input.SceneAttempt && (input.Mode == "production" || guidedGate) && correct {
			proofs := append(account.Progress.Story.GateAttempts[input.QuestID], input.ID)
			if len(proofs) > 32 {
				proofs = proofs[len(proofs)-32:]
			}
			account.Progress.Story.GateAttempts[input.QuestID] = proofs
		}
		return receipt, nil
	})
	if err != nil {
		return nil, err
	}
	added := receipt.XPAdded
	if duplicate {
		added = 0
	}
	reason := exercise.Feedback(input.Answer)
	if input.AnswerKind == "surface" {
		reason = "Write the target word's form from this recording."
		if receipt.Correct != nil && *receipt.Correct {
			reason = "The transcribed word matches the witness recording."
		}
	}
	if boardHandled && !boardCorrect {
		reason = "Check the German instructions against your items, actions and route. The mission board is not complete yet."
	}
	if reason == "" {
		reason = "The answer matches the authored target."
		if receipt.Correct == nil || !*receipt.Correct {
			reason = "Compare your answer with the authored target, then try again."
		}
	}
	response := map[string]any{"attemptId": input.ID, "correct": receipt.Correct, "correctedAnswer": exercise.Answer, "reason": reason, "xpAdded": added, "duplicate": duplicate, "progress": account.Progress}
	response["explanation"] = exercise.Explanation
	if a.content != nil {
		if record, ok := a.content.Get("exercises", a.content.Resolve("exercises", exercise.ID)); ok {
			body := contentBody(record)
			if support, ok := body["support"].(map[string]any); ok {
				language := normalizedPreferences(account.Preferences).BaseLanguage
				if translated, ok := support[language].(map[string]any); ok {
					if explanation := contentString(translated, "explanation"); explanation != "" {
						response["explanation"] = explanation
					}
				}
			}
		}
	}
	if input.Reveal {
		response["modelAnswer"] = exercise.Answer
		response["assisted"] = true
	}
	return response, nil
}
