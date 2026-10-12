package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
)

// Syllabus is the generated introduction order for the course lexicon
// (scripts/build-syllabus.mjs). The server introduces words from it at a
// bounded rate for optional practice, independently of story access.
type Syllabus struct {
	Version      string `json:"version"`
	WordsPerHour int    `json:"wordsPerHour"`
	OpeningWords int    `json:"openingWords"`
	BankCap      int    `json:"bankCap"`
	Brake        struct {
		MaxUnsettled int `json:"maxUnsettled"`
		MaxDue       int `json:"maxDue"`
	} `json:"brake"`
	WordIDs []string        `json:"wordIds"`
	Quests  []SyllabusQuest `json:"quests"`

	position   map[string]int
	questWords map[string][]string
}

type SyllabusQuest struct {
	QuestID   string   `json:"questId"`
	Level     string   `json:"level"`
	WordIDs   []string `json:"wordIds"`
	Milestone int      `json:"milestone"`
}

func loadSyllabus(lexicon map[string]Lexeme) (*Syllabus, error) {
	b, err := curriculumFiles.ReadFile("syllabus.json")
	if errors.Is(err, fs.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return parseSyllabus(b, lexicon)
}

func parseSyllabus(b []byte, lexicon map[string]Lexeme) (*Syllabus, error) {
	var s Syllabus
	if err := json.Unmarshal(b, &s); err != nil {
		return nil, fmt.Errorf("syllabus manifest: %w", err)
	}
	if s.WordsPerHour < 1 || s.WordsPerHour > 60 || 3600%s.WordsPerHour != 0 || s.OpeningWords < 0 || s.BankCap < 1 || s.Brake.MaxUnsettled < 1 || s.Brake.MaxDue < 1 || len(s.WordIDs) == 0 {
		return nil, errors.New("syllabus manifest has invalid pacing settings")
	}
	s.position = make(map[string]int, len(s.WordIDs))
	for index, id := range s.WordIDs {
		if _, exists := lexicon[id]; !exists {
			return nil, fmt.Errorf("syllabus schedules unknown lexeme %q", id)
		}
		if _, exists := s.position[id]; exists {
			return nil, fmt.Errorf("syllabus schedules lexeme %q twice", id)
		}
		s.position[id] = index
	}
	s.questWords = make(map[string][]string, len(s.Quests))
	for _, quest := range s.Quests {
		if quest.QuestID == "" {
			return nil, errors.New("syllabus quest without id")
		}
		if _, exists := s.questWords[quest.QuestID]; exists {
			return nil, fmt.Errorf("syllabus repeats quest %q", quest.QuestID)
		}
		for _, id := range quest.WordIDs {
			if _, exists := s.position[id]; !exists {
				return nil, fmt.Errorf("syllabus quest %q needs unscheduled lexeme %q", quest.QuestID, id)
			}
		}
		s.questWords[quest.QuestID] = quest.WordIDs
	}
	return &s, nil
}

// SecondsPerWord is the active play needed to earn one new word.
func (s *Syllabus) SecondsPerWord() int { return 3600 / s.WordsPerHour }

// QuestWordIDs reports the lexemes used by a conversation for content audits
// and migration. It does not restrict story access.
func (s *Syllabus) QuestWordIDs(questID string) []string {
	if s == nil {
		return nil
	}
	return s.questWords[questID]
}
