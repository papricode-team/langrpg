package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"

	"github.com/jackc/pgx/v5"
	"glotworld/server/internal/contentstore"
)

func loadContentCatalogue(ctx context.Context, store Store) (*contentstore.Catalog, error) {
	if pg, ok := store.(*PGStore); ok {
		catalogue, err := contentstore.LoadPostgres(ctx, pg.pool)
		if err == nil {
			return catalogue, nil
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			return nil, fmt.Errorf("load postgres content: %w", err)
		}
	}
	if path := os.Getenv("CONTENT_PATH"); path != "" {
		return contentstore.Load(path)
	}
	if jsonStore, ok := store.(*JSONStore); ok && jsonStore.path != "" {
		catalogue, err := contentstore.Load(filepath.Join(filepath.Dir(jsonStore.path), "content.json"))
		if err == nil {
			return catalogue, nil
		}
		if !errors.Is(err, os.ErrNotExist) {
			return nil, err
		}
	}
	data, err := curriculumFiles.ReadFile("content.json")
	if err != nil {
		return nil, fmt.Errorf("build/import content catalogue before starting the server: %w", err)
	}
	return contentstore.Parse(data)
}

// The build catalogue is the sole grading source. Presentation/rule manifests
// remain server-private and provide unchanged scheduling and story semantics.
func curriculumFromContent(catalogue *contentstore.Catalog) (Curriculum, error) {
	if len(catalogue.Grading) == 0 {
		return Curriculum{}, errors.New("content catalogue is missing its private grading index")
	}
	curriculum, err := parseCurriculum(catalogue.Grading)
	if err != nil {
		return Curriculum{}, fmt.Errorf("content grading: %w", err)
	}
	resource := func(file string) ([]byte, error) {
		internal := func(data []byte) ([]byte, error) {
			var value any
			if err := json.Unmarshal(data, &value); err != nil {
				return nil, err
			}
			translator := App{content: catalogue}
			return json.Marshal(translator.translateContentIDs(value, "", false))
		}
		if data := catalogue.Resources[file]; len(data) > 0 {
			return internal(data)
		}
		aliases := map[string]string{"activity_boards.json": "activityBoards", "expeditions.json": "expeditionSolutions", "expedition_learning.json": "expeditionLearning", "minigame_stories.json": "minigameStories"}
		if data := catalogue.Resources[aliases[file]]; len(data) > 0 {
			return internal(data)
		}
		return curriculumFiles.ReadFile(file)
	}
	boards, err := resource("activity_boards.json")
	if err != nil {
		return Curriculum{}, err
	}
	if err = loadActivityBoards(&curriculum, boards); err != nil {
		return Curriculum{}, err
	}
	syllabus, err := resource("syllabus.json")
	if err != nil {
		return Curriculum{}, err
	}
	if curriculum.Syllabus, err = parseSyllabus(syllabus, curriculum.Lexicon); err != nil {
		return Curriculum{}, err
	}
	for _, source := range []struct{ file, kind string }{{"minigame_stories.json", "story"}, {"expedition_learning.json", "expedition"}} {
		data, err := resource(source.file)
		if err != nil {
			return Curriculum{}, err
		}
		var manifest miniGameLearningManifest
		if err = json.Unmarshal(data, &manifest); err != nil {
			return Curriculum{}, err
		}
		// The merged grading index includes these rows. Bind their authored
		// scenarios through the existing validator, without duplicate insertion.
		for _, row := range manifest.Exercises {
			delete(curriculum.Exercises, row.ID)
		}
		if err = loadMiniGameExercises(&curriculum, data, source.kind); err != nil {
			return Curriculum{}, err
		}
	}
	return curriculum, nil
}
