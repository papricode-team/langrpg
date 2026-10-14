// Package contentstore owns the versioned, private learning catalogue.
package contentstore

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
)

var UUID = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)

var Kinds = []string{"lines", "lexemes", "exercises", "items", "units", "quests", "npcs", "graphs", "nodes", "choices", "expeditions", "minigames", "narratives", "grammar"}

type Record struct {
	ID      string          `json:"id"`
	Slug    string          `json:"slug"`
	Version int             `json:"version"`
	Body    json.RawMessage `json:"body"`
}

type Catalog struct {
	Version   int                        `json:"version"`
	IDs       map[string]string          `json:"ids"`
	Records   map[string][]Record        `json:"records"`
	Grading   json.RawMessage            `json:"grading,omitempty"`
	Metadata  map[string]json.RawMessage `json:"metadata,omitempty"`
	Resources map[string]json.RawMessage `json:"resources,omitempty"`
	byID      map[string]Record
	byKind    map[string]map[string]Record
}

func Parse(data []byte) (*Catalog, error) {
	var c Catalog
	if err := json.Unmarshal(data, &c); err != nil {
		return nil, err
	}
	if c.Version != 1 || c.Records == nil {
		return nil, fmt.Errorf("unsupported content catalogue version")
	}
	c.byID = map[string]Record{}
	c.byKind = map[string]map[string]Record{}
	if c.IDs == nil {
		c.IDs = map[string]string{}
	}
	known := map[string]bool{}
	for _, kind := range Kinds {
		known[kind] = true
	}
	for kind, records := range c.Records {
		if !known[kind] {
			return nil, fmt.Errorf("unknown content record kind %q", kind)
		}
		c.byKind[kind] = map[string]Record{}
		slugs := map[string]bool{}
		for _, record := range records {
			if !UUID.MatchString(record.ID) || record.Slug == "" || record.Version < 1 || !json.Valid(record.Body) {
				return nil, fmt.Errorf("invalid %s record %q", kind, record.Slug)
			}
			var body map[string]any
			if json.Unmarshal(record.Body, &body) != nil || body == nil {
				return nil, fmt.Errorf("%s record body must be an object", kind)
			}
			if _, duplicate := c.byID[record.ID]; duplicate || slugs[record.Slug] {
				return nil, fmt.Errorf("duplicate content identity %q", record.ID)
			}
			key := kind + ":" + record.Slug
			if expected := c.IDs[key]; expected != "" && expected != record.ID {
				return nil, fmt.Errorf("unstable content identity %q", key)
			}
			c.IDs[key] = record.ID
			c.byID[record.ID] = record
			c.byKind[kind][record.ID] = record
			slugs[record.Slug] = true
		}
	}
	return &c, nil
}

func Load(path string) (*Catalog, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	return Parse(data)
}

func (c *Catalog) Get(kind, id string) (Record, bool) {
	if c == nil {
		return Record{}, false
	}
	record, ok := c.byKind[kind][id]
	return record, ok
}

func (c *Catalog) Resolve(kind, slug string) string {
	if c == nil {
		return ""
	}
	return c.IDs[kind+":"+slug]
}

func (c *Catalog) Slug(id string) string {
	if c == nil {
		return id
	}
	if record, ok := c.byID[id]; ok {
		return record.Slug
	}
	for key, value := range c.IDs {
		if value == id {
			_, slug, _ := strings.Cut(key, ":")
			return slug
		}
	}
	return id
}

func (c *Catalog) Save(path string) error {
	if existing, err := Load(path); err == nil {
		for key, id := range existing.IDs {
			if next := c.IDs[key]; next != "" && next != id {
				return fmt.Errorf("content identity changed for %q", key)
			}
		}
	} else if !os.IsNotExist(err) {
		return err
	}
	data, err := json.Marshal(c)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return err
	}
	f, err := os.CreateTemp(filepath.Dir(path), ".content-*")
	if err != nil {
		return err
	}
	defer os.Remove(f.Name())
	if err = f.Chmod(0600); err == nil {
		_, err = f.Write(data)
	}
	if err == nil {
		err = f.Sync()
	}
	closeErr := f.Close()
	if err == nil {
		err = closeErr
	}
	if err != nil {
		return err
	}
	return os.Rename(f.Name(), path)
}

func Schema(ctx context.Context, pool *pgxpool.Pool) error {
	for _, kind := range Kinds {
		_, err := pool.Exec(ctx, `CREATE TABLE IF NOT EXISTS content_`+kind+` (id UUID PRIMARY KEY, slug TEXT NOT NULL UNIQUE, version INT NOT NULL CHECK(version > 0), body JSONB NOT NULL)`)
		if err != nil {
			return err
		}
	}
	_, err := pool.Exec(ctx, `CREATE TABLE IF NOT EXISTS content_catalogue (id TEXT PRIMARY KEY CHECK(id = 'main'), body JSONB NOT NULL)`)
	return err
}

// Import validates before writing and commits every record atomically. The
// stable slug constraint rejects accidental UUID replacement across builds.
func (c *Catalog) Import(ctx context.Context, pool *pgxpool.Pool) error {
	if err := Schema(ctx, pool); err != nil {
		return err
	}
	tx, err := pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	for _, kind := range Kinds {
		for _, record := range c.Records[kind] {
			result, execErr := tx.Exec(ctx, `INSERT INTO content_`+kind+` (id,slug,version,body) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO UPDATE SET body=EXCLUDED.body,version=EXCLUDED.version WHERE content_`+kind+`.slug=EXCLUDED.slug AND content_`+kind+`.version <= EXCLUDED.version`, record.ID, record.Slug, record.Version, record.Body)
			err = execErr
			if err != nil {
				return fmt.Errorf("import %s %q: %w", kind, record.Slug, err)
			}
			if result.RowsAffected() != 1 {
				return fmt.Errorf("content version/identity regression for %s %q", kind, record.Slug)
			}
		}
	}
	metadata, err := json.Marshal(struct {
		Version   int                        `json:"version"`
		IDs       map[string]string          `json:"ids"`
		Grading   json.RawMessage            `json:"grading,omitempty"`
		Metadata  map[string]json.RawMessage `json:"metadata,omitempty"`
		Resources map[string]json.RawMessage `json:"resources,omitempty"`
	}{c.Version, c.IDs, c.Grading, c.Metadata, c.Resources})
	if err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, `INSERT INTO content_catalogue(id,body) VALUES('main',$1) ON CONFLICT(id) DO UPDATE SET body=EXCLUDED.body`, metadata); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func LoadPostgres(ctx context.Context, pool *pgxpool.Pool) (*Catalog, error) {
	var data []byte
	if err := pool.QueryRow(ctx, `SELECT body FROM content_catalogue WHERE id='main'`).Scan(&data); err != nil {
		return nil, err
	}
	var c Catalog
	if err := json.Unmarshal(data, &c); err != nil {
		return nil, err
	}
	c.Records = map[string][]Record{}
	for _, kind := range Kinds {
		rows, err := pool.Query(ctx, `SELECT id::text,slug,version,body FROM content_`+kind)
		if err != nil {
			return nil, err
		}
		for rows.Next() {
			var record Record
			if err := rows.Scan(&record.ID, &record.Slug, &record.Version, &record.Body); err != nil {
				rows.Close()
				return nil, err
			}
			c.Records[kind] = append(c.Records[kind], record)
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			return nil, err
		}
		sort.Slice(c.Records[kind], func(i, j int) bool { return c.Records[kind][i].Slug < c.Records[kind][j].Slug })
	}
	data, err := json.Marshal(c)
	if err != nil {
		return nil, err
	}
	return Parse(data)
}
