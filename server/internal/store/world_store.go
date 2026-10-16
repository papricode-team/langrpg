package store

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"sort"
	"time"

	"github.com/jackc/pgx/v5"
)

// World is the stored world: one scene per town, the document fields every town
// shares, and the publication compiled from them. The store treats every part
// as opaque JSON; the server and the scene compiler own their shapes.
type World struct {
	// Revision counts publications. It starts at 1 and grows by one per save.
	Revision int64
	Shared   json.RawMessage
	Maps     map[string]json.RawMessage
	// Publication holds {contentVersion, worldMaps, investigations, diagnostics}.
	Publication json.RawMessage
}

// WorldChange is one publication. Maps lists only the towns that changed.
type WorldChange struct {
	Shared      json.RawMessage
	Maps        map[string]json.RawMessage
	Removed     []string
	Publication json.RawMessage
	// The edit log records who changed what.
	Actor  string
	Source string
	Ops    json.RawMessage
}

// StoryLine is an admin change to one story line. Hidden and Edited are opaque
// JSON; a line with neither is deleted.
type StoryLine struct {
	Key     string
	GraphID string
	Hidden  json.RawMessage
	Edited  json.RawMessage
}

// WorldEdit is one entry of the edit log.
type WorldEdit struct {
	Seq      int64           `json:"seq"`
	Revision int64           `json:"revision"`
	Actor    string          `json:"actor"`
	Source   string          `json:"source"`
	Maps     []string        `json:"maps"`
	Ops      json.RawMessage `json:"ops,omitempty"`
	At       time.Time       `json:"at"`
}

// WorldStore persists the editable world.
type WorldStore interface {
	// LoadWorld returns nil when nothing has been published.
	LoadWorld(context.Context) (*World, error)
	// WorldRevision returns 0 when nothing has been published.
	WorldRevision(context.Context) (int64, error)
	// SaveWorld publishes change when the stored revision is still expected (0
	// for the first publication) and returns the new revision. Otherwise it
	// returns ErrConflict.
	SaveWorld(ctx context.Context, expected int64, change WorldChange) (int64, error)
	StoryLines(context.Context) ([]StoryLine, error)
	SaveStoryLine(context.Context, StoryLine) error
	// WorldEdits lists the newest edits first, at most limit, before seq when it is positive.
	WorldEdits(ctx context.Context, before int64, limit int) ([]WorldEdit, error)
}

// DiskWorld is the JSON development store's copy of the world tables.
type DiskWorld struct {
	Revision    int64                      `json:"revision"`
	Shared      json.RawMessage            `json:"shared"`
	Maps        map[string]json.RawMessage `json:"maps"`
	Publication json.RawMessage            `json:"publication"`
	StoryLines  map[string]diskStoryLine   `json:"storyLines,omitempty"`
	Edits       []WorldEdit                `json:"edits,omitempty"`
}

type diskStoryLine struct {
	GraphID string          `json:"graphId"`
	Hidden  json.RawMessage `json:"hidden,omitempty"`
	Edited  json.RawMessage `json:"edited,omitempty"`
}

// The development store keeps the last edits only.
const diskWorldEdits = 200

func cloneRaw(value json.RawMessage) json.RawMessage {
	if value == nil {
		return nil
	}
	return bytes.Clone(value)
}

func (s *JSONStore) LoadWorld(_ context.Context) (*World, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	saved := s.state.WorldTables
	if saved == nil {
		return nil, nil
	}
	maps := make(map[string]json.RawMessage, len(saved.Maps))
	for id, scene := range saved.Maps {
		maps[id] = cloneRaw(scene)
	}
	return &World{Revision: saved.Revision, Shared: cloneRaw(saved.Shared), Maps: maps, Publication: cloneRaw(saved.Publication)}, nil
}

func (s *JSONStore) WorldRevision(_ context.Context) (int64, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.state.WorldTables == nil {
		return 0, nil
	}
	return s.state.WorldTables.Revision, nil
}

func (s *JSONStore) SaveWorld(_ context.Context, expected int64, change WorldChange) (int64, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	before := s.state.WorldTables
	current := int64(0)
	if before != nil {
		current = before.Revision
	}
	if current != expected {
		return 0, ErrConflict
	}
	next := &DiskWorld{Revision: current + 1, Maps: map[string]json.RawMessage{}, StoryLines: map[string]diskStoryLine{}}
	if before != nil {
		next.Shared = before.Shared
		for id, scene := range before.Maps {
			next.Maps[id] = scene
		}
		for key, line := range before.StoryLines {
			next.StoryLines[key] = line
		}
		next.Edits = append(next.Edits, before.Edits...)
	}
	if change.Shared != nil {
		next.Shared = cloneRaw(change.Shared)
	}
	for id, scene := range change.Maps {
		next.Maps[id] = cloneRaw(scene)
	}
	for _, id := range change.Removed {
		delete(next.Maps, id)
	}
	next.Publication = cloneRaw(change.Publication)
	seq := int64(1)
	if len(next.Edits) > 0 {
		seq = next.Edits[len(next.Edits)-1].Seq + 1
	}
	next.Edits = append(next.Edits, WorldEdit{Seq: seq, Revision: next.Revision, Actor: change.Actor, Source: change.Source, Maps: changedMaps(change), Ops: cloneRaw(change.Ops), At: time.Now().UTC()})
	if len(next.Edits) > diskWorldEdits {
		next.Edits = next.Edits[len(next.Edits)-diskWorldEdits:]
	}
	s.state.WorldTables = next
	if err := s.save(); err != nil {
		s.state.WorldTables = before
		return 0, err
	}
	return next.Revision, nil
}

func changedMaps(change WorldChange) []string {
	ids := append([]string{}, change.Removed...)
	for id := range change.Maps {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	return ids
}

func (s *JSONStore) StoryLines(_ context.Context) ([]StoryLine, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.state.WorldTables == nil {
		return nil, nil
	}
	lines := make([]StoryLine, 0, len(s.state.WorldTables.StoryLines))
	for key, line := range s.state.WorldTables.StoryLines {
		lines = append(lines, StoryLine{Key: key, GraphID: line.GraphID, Hidden: cloneRaw(line.Hidden), Edited: cloneRaw(line.Edited)})
	}
	sort.Slice(lines, func(i, j int) bool { return lines[i].Key < lines[j].Key })
	return lines, nil
}

func (s *JSONStore) SaveStoryLine(_ context.Context, line StoryLine) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	saved := s.state.WorldTables
	if saved == nil {
		return errors.New("the world has not been published")
	}
	before, existed := saved.StoryLines[line.Key]
	if saved.StoryLines == nil {
		saved.StoryLines = map[string]diskStoryLine{}
	}
	if line.Hidden == nil && line.Edited == nil {
		delete(saved.StoryLines, line.Key)
	} else {
		saved.StoryLines[line.Key] = diskStoryLine{GraphID: line.GraphID, Hidden: cloneRaw(line.Hidden), Edited: cloneRaw(line.Edited)}
	}
	if err := s.save(); err != nil {
		if existed {
			saved.StoryLines[line.Key] = before
		} else {
			delete(saved.StoryLines, line.Key)
		}
		return err
	}
	return nil
}

func (s *JSONStore) WorldEdits(_ context.Context, before int64, limit int) ([]WorldEdit, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	result := []WorldEdit{}
	if s.state.WorldTables == nil {
		return result, nil
	}
	edits := s.state.WorldTables.Edits
	for i := len(edits) - 1; i >= 0 && len(result) < limit; i-- {
		if before <= 0 || edits[i].Seq < before {
			result = append(result, edits[i])
		}
	}
	return result, nil
}

func (s *PGStore) LoadWorld(ctx context.Context) (*World, error) {
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	var world World
	var contentVersion string
	var worldMaps, investigations, diagnostics []byte
	err = tx.QueryRow(ctx, "SELECT revision,shared,content_version,world_maps,investigations,diagnostics FROM world_publication WHERE id='main'").Scan(&world.Revision, &world.Shared, &contentVersion, &worldMaps, &investigations, &diagnostics)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	world.Publication, err = json.Marshal(map[string]any{"contentVersion": contentVersion, "worldMaps": json.RawMessage(worldMaps), "investigations": json.RawMessage(investigations), "diagnostics": json.RawMessage(diagnostics)})
	if err != nil {
		return nil, err
	}
	rows, err := tx.Query(ctx, "SELECT id,scene FROM world_maps")
	if err != nil {
		return nil, err
	}
	world.Maps = map[string]json.RawMessage{}
	for rows.Next() {
		var id string
		var scene []byte
		if err := rows.Scan(&id, &scene); err != nil {
			rows.Close()
			return nil, err
		}
		world.Maps[id] = scene
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return &world, tx.Commit(ctx)
}

func (s *PGStore) WorldRevision(ctx context.Context) (int64, error) {
	var revision int64
	err := s.pool.QueryRow(ctx, "SELECT revision FROM world_publication WHERE id='main'").Scan(&revision)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, nil
	}
	return revision, err
}

type publicationColumns struct {
	ContentVersion string          `json:"contentVersion"`
	WorldMaps      json.RawMessage `json:"worldMaps"`
	Investigations json.RawMessage `json:"investigations"`
	Diagnostics    json.RawMessage `json:"diagnostics"`
}

func (s *PGStore) SaveWorld(ctx context.Context, expected int64, change WorldChange) (int64, error) {
	var publication publicationColumns
	if err := json.Unmarshal(change.Publication, &publication); err != nil {
		return 0, err
	}
	if publication.Diagnostics == nil {
		publication.Diagnostics = json.RawMessage("[]")
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx)
	var revision int64
	if expected == 0 {
		if change.Shared == nil {
			return 0, errors.New("the first publication needs the shared world fields")
		}
		result, err := tx.Exec(ctx, `INSERT INTO world_publication(id,revision,shared,content_version,world_maps,investigations,diagnostics) VALUES('main',1,$1,$2,$3,$4,$5) ON CONFLICT(id) DO NOTHING`,
			[]byte(change.Shared), publication.ContentVersion, []byte(publication.WorldMaps), []byte(publication.Investigations), []byte(publication.Diagnostics))
		if err != nil {
			return 0, err
		}
		if result.RowsAffected() != 1 {
			return 0, ErrConflict
		}
		revision = 1
	} else {
		err = tx.QueryRow(ctx, `UPDATE world_publication SET revision=revision+1, shared=COALESCE($2,shared), content_version=$3, world_maps=$4, investigations=$5, diagnostics=$6, updated_at=NOW() WHERE id='main' AND revision=$1 RETURNING revision`,
			expected, nullableJSON(change.Shared), publication.ContentVersion, []byte(publication.WorldMaps), []byte(publication.Investigations), []byte(publication.Diagnostics)).Scan(&revision)
		if errors.Is(err, pgx.ErrNoRows) {
			return 0, ErrConflict
		}
		if err != nil {
			return 0, err
		}
	}
	batch := &pgx.Batch{}
	for id, scene := range change.Maps {
		batch.Queue(`INSERT INTO world_maps(id,scene,revision) VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET scene=EXCLUDED.scene, revision=EXCLUDED.revision, updated_at=NOW()`, id, []byte(scene), revision)
	}
	for _, id := range change.Removed {
		batch.Queue(`DELETE FROM world_maps WHERE id=$1`, id)
	}
	batch.Queue(`INSERT INTO world_edits(revision,actor,source,maps,ops) VALUES($1,$2,$3,$4,$5)`, revision, change.Actor, change.Source, changedMaps(change), nullableJSON(change.Ops))
	if err := tx.SendBatch(ctx, batch).Close(); err != nil {
		return 0, err
	}
	return revision, tx.Commit(ctx)
}

func nullableJSON(value json.RawMessage) any {
	if value == nil {
		return nil
	}
	return []byte(value)
}

func (s *PGStore) StoryLines(ctx context.Context) ([]StoryLine, error) {
	rows, err := s.pool.Query(ctx, "SELECT line_key,graph_id,hidden,edited FROM world_story_lines ORDER BY line_key")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	lines := []StoryLine{}
	for rows.Next() {
		var line StoryLine
		var hidden, edited []byte
		if err := rows.Scan(&line.Key, &line.GraphID, &hidden, &edited); err != nil {
			return nil, err
		}
		if hidden != nil {
			line.Hidden = hidden
		}
		if edited != nil {
			line.Edited = edited
		}
		lines = append(lines, line)
	}
	return lines, rows.Err()
}

func (s *PGStore) SaveStoryLine(ctx context.Context, line StoryLine) error {
	if line.Hidden == nil && line.Edited == nil {
		_, err := s.pool.Exec(ctx, "DELETE FROM world_story_lines WHERE line_key=$1", line.Key)
		return err
	}
	_, err := s.pool.Exec(ctx, `INSERT INTO world_story_lines(line_key,graph_id,hidden,edited) VALUES($1,$2,$3,$4)
 ON CONFLICT(line_key) DO UPDATE SET graph_id=EXCLUDED.graph_id, hidden=EXCLUDED.hidden, edited=EXCLUDED.edited, updated_at=NOW()`,
		line.Key, line.GraphID, nullableJSON(line.Hidden), nullableJSON(line.Edited))
	return err
}

func (s *PGStore) WorldEdits(ctx context.Context, before int64, limit int) ([]WorldEdit, error) {
	rows, err := s.pool.Query(ctx, `SELECT seq,revision,actor,source,maps,ops,created_at FROM world_edits WHERE $1<=0 OR seq<$1 ORDER BY seq DESC LIMIT $2`, before, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	edits := []WorldEdit{}
	for rows.Next() {
		var edit WorldEdit
		var ops []byte
		if err := rows.Scan(&edit.Seq, &edit.Revision, &edit.Actor, &edit.Source, &edit.Maps, &ops, &edit.At); err != nil {
			return nil, err
		}
		if ops != nil {
			edit.Ops = ops
		}
		edits = append(edits, edit)
	}
	return edits, rows.Err()
}

// convertWorldContent turns a development state saved before the world tables
// into them.
func convertWorldContent(saved json.RawMessage) (*DiskWorld, error) {
	var old struct {
		Document       map[string]json.RawMessage `json:"document"`
		ContentVersion string                     `json:"contentVersion"`
		WorldMaps      json.RawMessage            `json:"worldMaps"`
		Investigations json.RawMessage            `json:"investigations"`
		Diagnostics    json.RawMessage            `json:"diagnostics"`
		Story          struct {
			HiddenLines map[string]json.RawMessage `json:"hiddenLines"`
			EditedLines map[string]json.RawMessage `json:"editedLines"`
		} `json:"story"`
	}
	if err := json.Unmarshal(saved, &old); err != nil {
		return nil, err
	}
	world := &DiskWorld{Revision: 1, Maps: map[string]json.RawMessage{}, StoryLines: map[string]diskStoryLine{}}
	if err := json.Unmarshal(old.Document["maps"], &world.Maps); err != nil {
		return nil, err
	}
	delete(old.Document, "maps")
	var err error
	if world.Shared, err = json.Marshal(old.Document); err != nil {
		return nil, err
	}
	if world.Publication, err = json.Marshal(publicationColumns{old.ContentVersion, old.WorldMaps, old.Investigations, old.Diagnostics}); err != nil {
		return nil, err
	}
	graph := func(line json.RawMessage) string {
		var head struct {
			GraphID string `json:"graphId"`
		}
		_ = json.Unmarshal(line, &head)
		return head.GraphID
	}
	for key, line := range old.Story.HiddenLines {
		world.StoryLines[key] = diskStoryLine{GraphID: graph(line), Hidden: line}
	}
	for key, line := range old.Story.EditedLines {
		entry := world.StoryLines[key]
		entry.GraphID, entry.Edited = graph(line), line
		world.StoryLines[key] = entry
	}
	return world, nil
}
