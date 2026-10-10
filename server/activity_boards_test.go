package main

import (
	"encoding/json"
	"testing"
)

func solvedBoard(t *testing.T, curriculum Curriculum, board ActivityBoardSpec) ActivityBoardState {
	t.Helper()
	state := ActivityBoardState{Kind: board.Kind}
	switch board.Kind {
	case "cafe":
		var goal struct {
			Items   map[string]int `json:"items"`
			Steps   []string       `json:"steps"`
			Venue   string         `json:"venue"`
			Service string         `json:"service"`
			Slot    string         `json:"slot"`
		}
		if err := json.Unmarshal(board.Goal, &goal); err != nil {
			t.Fatal(err)
		}
		state.Tray, state.Steps, state.Venue, state.Service, state.Slot = goal.Items, goal.Steps, goal.Venue, goal.Service, goal.Slot
	case "market":
		if err := json.Unmarshal(board.Goal, &state.Basket); err != nil {
			t.Fatal(err)
		}
		state.Method, state.Traded = board.Method, board.Trade != nil
		if board.Method == "cash" {
			change := board.Tender
			for id, quantity := range state.Basket {
				change -= curriculum.ActivityPrices[id] * quantity
			}
			for _, coin := range []int{1000, 500, 200, 100, 50, 20, 10} {
				for change >= coin {
					state.ChangeCoins = append(state.ChangeCoins, coin)
					change -= coin
				}
			}
		}
	case "detective":
		state.Links = map[string]string{}
		for _, slot := range board.Slots {
			state.Links[slot.ID] = slot.Expected
		}
	case "delivery":
		if err := json.Unmarshal(board.Goal, &state.Position); err != nil {
			t.Fatal(err)
		}
		state.Trail, state.Parcel, state.Transport, state.Departure, state.Help = board.Path, board.Parcel, board.Transport, board.Departure, board.Help
	}
	return state
}

func TestServerAssessesEveryAuthoredActivityBoard(t *testing.T) {
	curriculum, err := loadCurriculum()
	if err != nil {
		t.Fatal(err)
	}
	if len(curriculum.ActivityBoards) != 48 {
		t.Fatal("missing authored activity boards")
	}
	for id, scene := range curriculum.ActivityBoards {
		state := solvedBoard(t, curriculum, scene.Board)
		if !curriculum.validActivityBoard(scene.Board, state) {
			t.Errorf("authored solution rejected %s", id)
		}
		switch state.Kind {
		case "cafe":
			state.Tray = map[string]int{}
		case "market":
			state.ChangeCoins = []int{-1}
		case "detective":
			state.Links = map[string]string{}
		case "delivery":
			state.Trail = []BoardCell{scene.Board.Start, state.Position}
		}
		if curriculum.validActivityBoard(scene.Board, state) {
			t.Errorf("incomplete/forged board accepted %s", id)
		}
	}
}

func TestActivityAttemptCannotClaimCanonicalAnswerWithoutBoardProof(t *testing.T) {
	curriculum, err := loadCurriculum()
	if err != nil {
		t.Fatal(err)
	}
	store, err := NewJSONStore("")
	if err != nil {
		t.Fatal(err)
	}
	app := NewApp(store, curriculum, nil, 10)
	t.Cleanup(app.Close)
	token, _ := createSession(t, app, "Ada")
	scene := curriculum.ActivityBoards["cafe-a1-first-light"]
	exercise := curriculum.Exercises[scene.ExerciseID]
	input := AttemptInput{ID: "no-proof", ItemID: exercise.ItemID, ExerciseID: exercise.ID, Answer: exercise.Answer, Mode: "recognition", Hinted: true, ActivityID: scene.ActivityID, RunID: "board-run", Level: "A1"}
	if got := request(app, "POST", "/api/attempt", token, input).Code; got != 400 {
		t.Fatalf("canonical answer bypassed board: %d", got)
	}
	input.ID = "wrong-board"
	input.ScenarioID = scene.ID
	input.BoardState = []byte(`{"kind":"cafe","tray":{},"steps":[]}`)
	wrong := decodeAttempt(t, request(app, "POST", "/api/attempt", token, input))
	if wrong.Correct || wrong.XPAdded != 0 {
		t.Fatal("client's canonical string overrode the wrong board")
	}
	input.ID = "right-board"
	input.BoardState, _ = json.Marshal(solvedBoard(t, curriculum, scene.Board))
	right := decodeAttempt(t, request(app, "POST", "/api/attempt", token, input))
	if !right.Correct || right.Progress.Items[exercise.ItemID].ModeStats["production"].UnaidedSuccesses != 0 {
		t.Fatal("valid board lost comprehension or fabricated independent production")
	}
	input.ID = "wrong-scene"
	input.ScenarioID = "market-a1-two-apples"
	if got := request(app, "POST", "/api/attempt", token, input).Code; got != 400 {
		t.Fatalf("cross-scene proof accepted: %d", got)
	}
}
