package main

import (
	"encoding/json"
	"fmt"
	"math"
)

type BoardCell struct {
	X int `json:"x"`
	Y int `json:"y"`
}
type ActivityBoardSpec struct {
	Kind   string          `json:"kind"`
	Goal   json.RawMessage `json:"goal"`
	Stock  []string        `json:"stock"`
	Budget int             `json:"budget"`
	Tender int             `json:"tender"`
	Method string          `json:"method"`
	Trade  *struct {
		Give     string `json:"give"`
		Receive  string `json:"receive"`
		Quantity int    `json:"quantity"`
	} `json:"trade"`
	Slots []struct {
		ID       string `json:"id"`
		Expected string `json:"expected"`
	} `json:"slots"`
	Roads      []BoardCell `json:"roads"`
	Path       []BoardCell `json:"path"`
	Start      BoardCell   `json:"start"`
	Checkpoint BoardCell   `json:"checkpoint"`
	Parcel     string      `json:"parcel"`
	Transport  string      `json:"transport"`
	Departure  string      `json:"departure"`
	Help       bool        `json:"help"`
}
type ActivityBoardScenario struct {
	ID         string            `json:"id"`
	ActivityID string            `json:"activityId"`
	Level      string            `json:"level"`
	ExerciseID string            `json:"exerciseId"`
	Board      ActivityBoardSpec `json:"board"`
}
type ActivityBoardState struct {
	Kind        string            `json:"kind"`
	Tray        map[string]int    `json:"tray"`
	Steps       []string          `json:"steps"`
	Venue       string            `json:"venue"`
	Service     string            `json:"service"`
	Slot        string            `json:"slot"`
	Basket      map[string]int    `json:"basket"`
	Method      string            `json:"method"`
	ChangeCoins []int             `json:"changeCoins"`
	Traded      bool              `json:"traded"`
	Links       map[string]string `json:"links"`
	Position    BoardCell         `json:"position"`
	Heading     int               `json:"heading"`
	Trail       []BoardCell       `json:"trail"`
	Parcel      string            `json:"parcel"`
	Transport   string            `json:"transport"`
	Departure   string            `json:"departure"`
	Help        bool              `json:"help"`
}

func loadActivityBoards(curriculum *Curriculum, data []byte) error {
	var manifest struct {
		Scenarios []ActivityBoardScenario `json:"scenarios"`
		Prices    map[string]int          `json:"prices"`
	}
	if err := json.Unmarshal(data, &manifest); err != nil {
		return err
	}
	curriculum.ActivityBoards = map[string]ActivityBoardScenario{}
	curriculum.ActivityPrices = manifest.Prices
	for _, scene := range manifest.Scenarios {
		exercise, exists := curriculum.Exercises[scene.ExerciseID]
		_, duplicate := curriculum.ActivityBoards[scene.ID]
		if !safeID.MatchString(scene.ID) || duplicate || !exists || curriculum.Items[exercise.ItemID].Level != scene.Level || !activityContains(scene.ActivityID, scene.Level, scene.ExerciseID) || scene.Board.Kind != scene.ActivityID {
			return fmt.Errorf("invalid activity board %q", scene.ID)
		}
		curriculum.ActivityBoards[scene.ID] = scene
	}
	return nil
}

// State is evidence to assess, never a trusted correctness flag. The server
// compares it to the same authored scene that generated the player's board.
func (c Curriculum) activityBoardGrade(input AttemptInput) (bool, bool, error) {
	if input.ActivityID == "" || len(c.ActivityBoards) == 0 {
		return false, false, nil
	}
	scene, exists := c.ActivityBoards[input.ScenarioID]
	if !exists || scene.ActivityID != input.ActivityID || scene.ExerciseID != input.ExerciseID || scene.Level != c.Items[input.ItemID].Level || len(input.BoardState) == 0 || len(input.BoardState) > 16384 {
		return false, true, &APIError{400, "send the known mission scene and its board state"}
	}
	var state ActivityBoardState
	if err := json.Unmarshal(input.BoardState, &state); err != nil {
		return false, true, &APIError{400, "send a valid mission board state"}
	}
	return c.validActivityBoard(scene.Board, state), true, nil
}

func sameBoardInventory(actual, expected map[string]int) bool {
	if len(actual) != len(expected) {
		return false
	}
	for id, quantity := range expected {
		if quantity < 1 || quantity > 9 || actual[id] != quantity {
			return false
		}
	}
	return true
}

func (c Curriculum) validActivityBoard(board ActivityBoardSpec, state ActivityBoardState) bool {
	if state.Kind != board.Kind {
		return false
	}
	switch board.Kind {
	case "cafe":
		var goal struct {
			Items   map[string]int `json:"items"`
			Steps   []string       `json:"steps"`
			Venue   string         `json:"venue"`
			Service string         `json:"service"`
			Slot    string         `json:"slot"`
		}
		if json.Unmarshal(board.Goal, &goal) != nil || !sameBoardInventory(state.Tray, goal.Items) || len(state.Steps) != len(goal.Steps) {
			return false
		}
		for i, step := range goal.Steps {
			if state.Steps[i] != step {
				return false
			}
		}
		return (goal.Venue == "" || state.Venue == goal.Venue) && (goal.Service == "" || state.Service == goal.Service) && (goal.Slot == "" || state.Slot == goal.Slot)
	case "market":
		var goal map[string]int
		if json.Unmarshal(board.Goal, &goal) != nil || !sameBoardInventory(state.Basket, goal) || state.Method != board.Method || len(state.ChangeCoins) > 30 || (board.Trade != nil && !state.Traded) {
			return false
		}
		total := 0
		for id, quantity := range state.Basket {
			price, exists := c.ActivityPrices[id]
			if !exists || price < 0 {
				return false
			}
			total += price * quantity
		}
		if total > board.Budget {
			return false
		}
		change := 0
		for _, coin := range state.ChangeCoins {
			if coin != 10 && coin != 20 && coin != 50 && coin != 100 && coin != 200 && coin != 500 && coin != 1000 {
				return false
			}
			change += coin
		}
		if board.Method == "cash" {
			return change == board.Tender-total
		}
		return change == 0
	case "detective":
		if len(state.Links) != len(board.Slots) {
			return false
		}
		for _, slot := range board.Slots {
			if state.Links[slot.ID] != slot.Expected {
				return false
			}
		}
		return true
	case "delivery":
		var goal BoardCell
		if json.Unmarshal(board.Goal, &goal) != nil || state.Position != goal || len(state.Trail) < 1 || len(state.Trail) > 100 || state.Trail[0] != board.Start || state.Trail[len(state.Trail)-1] != goal || state.Heading < 0 || state.Heading > 3 || state.Parcel != board.Parcel || state.Transport != board.Transport || (board.Departure != "" && state.Departure != board.Departure) || (board.Help && !state.Help) {
			return false
		}
		checkpoint := false
		for i, cell := range state.Trail {
			road := false
			for _, candidate := range board.Roads {
				if candidate == cell {
					road = true
					break
				}
			}
			if !road {
				return false
			}
			if cell == board.Checkpoint {
				checkpoint = true
			}
			if i > 0 && math.Abs(float64(cell.X-state.Trail[i-1].X))+math.Abs(float64(cell.Y-state.Trail[i-1].Y)) != 1 {
				return false
			}
		}
		return checkpoint
	}
	return false
}
