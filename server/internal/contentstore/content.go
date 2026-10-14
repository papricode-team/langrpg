// Package contentstore is the server-owned, immutable learning-content catalog.
package contentstore

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"regexp"
	"sort"

	"github.com/jackc/pgx/v5/pgxpool"
)

var UUID = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

type Grading struct {
	KeyboardSubstitutions map[string]string `json:"keyboardSubstitutions,omitempty"`
	MeaningfulCapitals    []string          `json:"meaningfulCapitals,omitempty"`
	IgnoreTrailing        string            `json:"ignoreTrailing,omitempty"`
	MechanicalTypos       bool              `json:"mechanicalTypos,omitempty"`
	CaseSensitive         bool              `json:"caseSensitive,omitempty"`
}
type Course struct {
	ID               string          `json:"id"`
	Slug             string          `json:"slug"`
	Target           string          `json:"target"`
	SupportLanguages []string        `json:"supportLanguages"`
	Title            json.RawMessage `json:"title"`
	Grading          Grading         `json:"grading"`
	World            json.RawMessage `json:"world,omitempty"`
	Audio            json.RawMessage `json:"audio,omitempty"`
	Voice            string          `json:"voice,omitempty"`
}
type Record struct {
	ID       string          `json:"id"`
	CourseID string          `json:"courseId"`
	Slug     string          `json:"slug,omitempty"`
	Kind     string          `json:"kind"`
	Version  int             `json:"version"`
	Body     json.RawMessage `json:"body"`
}
type Bundle struct {
	Version      int               `json:"version"`
	Courses      []Course          `json:"courses"`
	Records      []Record          `json:"records"`
	IDs          map[string]string `json:"ids"`
	PublishedIDs map[string]string `json:"publishedIds,omitempty"`
	ByID         map[string]Record `json:"-"`
	ByCourse     map[string]Course `json:"-"`
}

// Private manifests share the same catalog lifecycle, but are never exposed by
// the read API. Their old identifiers support the German migration adapter.
var Tables = map[string]string{
	"sentence": "content_sentences", "lexeme": "content_lexemes", "exercise": "content_exercises",
	"unit": "content_units", "graph": "content_graphs", "expedition": "content_expeditions", "minigame": "content_minigames",
}

func Parse(data []byte) (*Bundle, error) {
	var b Bundle
	if err := json.Unmarshal(data, &b); err != nil {
		return nil, err
	}
	if err := b.Validate(); err != nil {
		return nil, err
	}
	return &b, nil
}
func LoadJSON(path string) (*Bundle, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	return Parse(data)
}
func (b *Bundle) Validate() error {
	if b.Version != 1 || len(b.Courses) == 0 || len(b.Records) == 0 {
		return errors.New("unsupported or empty content bundle")
	}
	b.ByID = map[string]Record{}
	b.ByCourse = map[string]Course{}
	for _, c := range b.Courses {
		if !UUID.MatchString(c.ID) || c.Slug == "" || c.Target == "" || len(c.SupportLanguages) == 0 {
			return fmt.Errorf("invalid course %q", c.ID)
		}
		if _, ok := b.ByCourse[c.ID]; ok {
			return fmt.Errorf("duplicate course %q", c.ID)
		}
		seen := map[string]bool{}
		for _, lang := range c.SupportLanguages {
			if lang == "" || lang == c.Target || seen[lang] {
				return fmt.Errorf("invalid support language in %q", c.ID)
			}
			seen[lang] = true
		}
		b.ByCourse[c.ID] = c
	}
	for _, r := range b.Records {
		if !UUID.MatchString(r.ID) || r.Kind == "" || r.Version < 1 || !json.Valid(r.Body) {
			return fmt.Errorf("invalid %s record %q", r.Kind, r.ID)
		}
		var body map[string]json.RawMessage
		if json.Unmarshal(r.Body, &body) != nil || body == nil {
			return fmt.Errorf("record %q body must be an object", r.ID)
		}
		if _, ok := b.ByCourse[r.CourseID]; !ok {
			return fmt.Errorf("unknown course for record %q", r.ID)
		}
		if _, ok := b.ByID[r.ID]; ok {
			return fmt.Errorf("duplicate record %q", r.ID)
		}
		b.ByID[r.ID] = r
	}
	for key, id := range b.IDs {
		if key == "" || !UUID.MatchString(id) {
			return fmt.Errorf("invalid stable identifier %q", key)
		}
	}
	for key, id := range b.PublishedIDs {
		if key == "" || !UUID.MatchString(id) {
			return fmt.Errorf("invalid published identifier %q", key)
		}
	}
	return nil
}
func (b *Bundle) Private(courseID, kind string) (json.RawMessage, bool) {
	for _, r := range b.Records {
		if r.CourseID == courseID && r.Kind == kind {
			return r.Body, true
		}
	}
	return nil, false
}

func EnsureSchema(ctx context.Context, pool *pgxpool.Pool) error {
	_, err := pool.Exec(ctx, `CREATE TABLE IF NOT EXISTS content_courses(id UUID PRIMARY KEY,slug TEXT NOT NULL UNIQUE,body JSONB NOT NULL);
	CREATE TABLE IF NOT EXISTS content_metadata(id TEXT PRIMARY KEY CHECK(id='main'),version INTEGER NOT NULL,ids JSONB NOT NULL,published_ids JSONB NOT NULL DEFAULT '{}');
	ALTER TABLE content_metadata ADD COLUMN IF NOT EXISTS published_ids JSONB NOT NULL DEFAULT '{}';
	CREATE TABLE IF NOT EXISTS content_manifests(id UUID PRIMARY KEY,course_id UUID NOT NULL REFERENCES content_courses(id),slug TEXT NOT NULL,kind TEXT NOT NULL,version INTEGER NOT NULL,body JSONB NOT NULL,UNIQUE(course_id,kind,slug));`)
	if err != nil {
		return err
	}
	for _, table := range Tables {
		_, err = pool.Exec(ctx, `CREATE TABLE IF NOT EXISTS `+table+`(id UUID PRIMARY KEY,course_id UUID NOT NULL REFERENCES content_courses(id),slug TEXT NOT NULL,version INTEGER NOT NULL CHECK(version>0),body JSONB NOT NULL,UNIQUE(course_id,slug));
		ALTER TABLE `+table+` ADD COLUMN IF NOT EXISTS course_id UUID REFERENCES content_courses(id);
		CREATE INDEX IF NOT EXISTS `+table+`_course ON `+table+`(course_id);`)
		if err != nil {
			return err
		}
	}
	return nil
}

// Import replaces a version atomically: a removed record cannot remain readable
// after the importer publishes its replacement manifest.
func Import(ctx context.Context, pool *pgxpool.Pool, b *Bundle) error {
	if err := b.Validate(); err != nil {
		return err
	}
	if err := EnsureSchema(ctx, pool); err != nil {
		return err
	}
	tx, err := pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	// The first published catalog used these table names without course_id and
	// assigned different UUIDs. Replace its rows atomically; account references
	// remain recoverable through the published identifier map.
	for _, table := range tableNames() {
		if _, err = tx.Exec(ctx, `DELETE FROM `+table+` WHERE course_id IS NULL;
		ALTER TABLE `+table+` DROP CONSTRAINT IF EXISTS `+table+`_slug_key;
		CREATE UNIQUE INDEX IF NOT EXISTS `+table+`_course_id_slug_key ON `+table+`(course_id,slug);`); err != nil {
			return err
		}
	}
	for _, c := range b.Courses {
		body, _ := json.Marshal(c)
		if _, err = tx.Exec(ctx, `INSERT INTO content_courses(id,slug,body) VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET slug=EXCLUDED.slug,body=EXCLUDED.body`, c.ID, c.Slug, body); err != nil {
			return err
		}
	}
	byTable := map[string][]string{}
	for _, r := range b.Records {
		table, public := Tables[r.Kind]
		if !public {
			table = "content_manifests"
		}
		byTable[table] = append(byTable[table], r.ID)
		if public {
			_, err = tx.Exec(ctx, `INSERT INTO `+table+`(id,course_id,slug,version,body) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO UPDATE SET course_id=EXCLUDED.course_id,slug=EXCLUDED.slug,version=EXCLUDED.version,body=EXCLUDED.body`, r.ID, r.CourseID, r.Slug, r.Version, r.Body)
		} else {
			_, err = tx.Exec(ctx, `INSERT INTO content_manifests(id,course_id,slug,kind,version,body) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO UPDATE SET course_id=EXCLUDED.course_id,slug=EXCLUDED.slug,kind=EXCLUDED.kind,version=EXCLUDED.version,body=EXCLUDED.body`, r.ID, r.CourseID, r.Slug, r.Kind, r.Version, r.Body)
		}
		if err != nil {
			return err
		}
	}
	for _, table := range append(tableNames(), "content_manifests") {
		ids := byTable[table]
		if ids == nil {
			ids = []string{}
		}
		if _, err = tx.Exec(ctx, `DELETE FROM `+table+` WHERE NOT(id=ANY($1::uuid[]))`, ids); err != nil {
			return err
		}
		if _, err = tx.Exec(ctx, `ALTER TABLE `+table+` ALTER COLUMN course_id SET NOT NULL`); err != nil {
			return err
		}
	}
	var courseIDs []string
	for _, course := range b.Courses {
		courseIDs = append(courseIDs, course.ID)
	}
	if _, err = tx.Exec(ctx, `DELETE FROM content_courses WHERE NOT(id=ANY($1::uuid[]))`, courseIDs); err != nil {
		return err
	}
	ids, _ := json.Marshal(b.IDs)
	published, _ := json.Marshal(b.PublishedIDs)
	if b.PublishedIDs == nil {
		published = []byte("{}")
	}
	if _, err = tx.Exec(ctx, `INSERT INTO content_metadata(id,version,ids,published_ids) VALUES('main',$1,$2,$3) ON CONFLICT(id) DO UPDATE SET version=EXCLUDED.version,ids=EXCLUDED.ids,published_ids=EXCLUDED.published_ids`, b.Version, ids, published); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
func tableNames() []string {
	var names []string
	for _, table := range Tables {
		names = append(names, table)
	}
	sort.Strings(names)
	return names
}
func LoadPostgres(ctx context.Context, pool *pgxpool.Pool) (*Bundle, error) {
	var b Bundle
	var ids, published []byte
	if err := pool.QueryRow(ctx, `SELECT version,ids,COALESCE(to_jsonb(m)->'published_ids','{}'::jsonb) FROM content_metadata m WHERE id='main'`).Scan(&b.Version, &ids, &published); err != nil {
		return nil, fmt.Errorf("content is not imported: %w", err)
	}
	if err := json.Unmarshal(ids, &b.IDs); err != nil {
		return nil, err
	}
	if err := json.Unmarshal(published, &b.PublishedIDs); err != nil {
		return nil, err
	}
	rows, err := pool.Query(ctx, `SELECT body FROM content_courses ORDER BY slug`)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var data []byte
		if err = rows.Scan(&data); err != nil {
			rows.Close()
			return nil, err
		}
		var c Course
		if err = json.Unmarshal(data, &c); err != nil {
			rows.Close()
			return nil, err
		}
		b.Courses = append(b.Courses, c)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return nil, err
	}
	for kind, table := range Tables {
		rows, err = pool.Query(ctx, `SELECT id::text,course_id::text,slug,version,body FROM `+table)
		if err != nil {
			return nil, err
		}
		for rows.Next() {
			r := Record{Kind: kind}
			if err = rows.Scan(&r.ID, &r.CourseID, &r.Slug, &r.Version, &r.Body); err != nil {
				rows.Close()
				return nil, err
			}
			b.Records = append(b.Records, r)
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			return nil, err
		}
	}
	rows, err = pool.Query(ctx, `SELECT id::text,course_id::text,slug,kind,version,body FROM content_manifests`)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var r Record
		if err = rows.Scan(&r.ID, &r.CourseID, &r.Slug, &r.Kind, &r.Version, &r.Body); err != nil {
			rows.Close()
			return nil, err
		}
		b.Records = append(b.Records, r)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return nil, err
	}
	if err = b.Validate(); err != nil {
		return nil, err
	}
	return &b, nil
}
