// Package contentstore is the server-owned, immutable learning-content catalog.
package contentstore

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"regexp"
	"sort"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var UUID = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

type Grading struct {
	KeyboardSubstitutions map[string]string `json:"keyboardSubstitutions,omitempty"`
	MeaningfulCapitals    []string          `json:"meaningfulCapitals,omitempty"`
	IgnoreTrailing        string            `json:"ignoreTrailing,omitempty"`
	MechanicalTypos       bool              `json:"mechanicalTypos,omitempty"`
	CaseSensitive         bool              `json:"caseSensitive,omitempty"`
	// IgnoreInner lists punctuation stripped from the edges of every word of a
	// production answer, so an optional comma or a mid-answer full stop never decides.
	IgnoreInner string `json:"ignoreInner,omitempty"`
	// Equivalents are groups of spellings that grade as the same in production
	// answers of two or more words; the first member is canonical.
	Equivalents [][]string `json:"equivalents,omitempty"`
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

// ImportFormat versions the importer itself. Bump it whenever Import changes
// how a bundle is stored, so an unchanged bundle is imported again once.
const ImportFormat = "content-import-v1"

// importLock serializes importers across replicas booting at the same time.
const importLock = 7418309912

// Fingerprint identifies a bundle file together with the importer format.
func Fingerprint(data []byte) string {
	h := sha256.New()
	h.Write([]byte(ImportFormat))
	h.Write([]byte{0})
	h.Write(data)
	return hex.EncodeToString(h.Sum(nil))
}

type queryRower interface {
	QueryRow(context.Context, string, ...any) pgx.Row
}

// ImportedFingerprint returns the fingerprint of the last recorded import, or
// "" when nothing was recorded. It performs no DDL and no writes.
func ImportedFingerprint(ctx context.Context, db queryRower) (string, error) {
	// Table names resolve when a statement is parsed, so check existence first;
	// a failed statement would abort the importer's transaction.
	var exists bool
	if err := db.QueryRow(ctx, `SELECT to_regclass('content_imports') IS NOT NULL`).Scan(&exists); err != nil || !exists {
		return "", err
	}
	var fingerprint string
	err := db.QueryRow(ctx, `SELECT fingerprint FROM content_imports WHERE id='main'`).Scan(&fingerprint)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", nil
	}
	return fingerprint, err
}

// Import replaces a version atomically: a removed record cannot remain readable
// after the importer publishes its replacement manifest. Unfingerprinted
// imports clear any recorded fingerprint, so the next boot imports again.
func Import(ctx context.Context, pool *pgxpool.Pool, b *Bundle) error {
	_, err := ImportFingerprinted(ctx, pool, b, "", true)
	return err
}

// ImportFingerprinted imports b and records fingerprint in the same
// transaction. Unless force is set, a fingerprint that is already recorded
// (for example, another replica imported it while this one waited for the
// lock) returns false without writing anything.
func ImportFingerprinted(ctx context.Context, pool *pgxpool.Pool, b *Bundle, fingerprint string, force bool) (bool, error) {
	if err := b.Validate(); err != nil {
		return false, err
	}
	started := time.Now()
	tx, err := pool.Begin(ctx)
	if err != nil {
		return false, err
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx, `SELECT pg_advisory_xact_lock($1)`, int64(importLock)); err != nil {
		return false, err
	}
	if fingerprint != "" && !force {
		current, err := ImportedFingerprint(ctx, tx)
		if err != nil {
			return false, err
		}
		if current == fingerprint {
			return false, nil
		}
	}
	if err = importBundle(ctx, tx, b); err != nil {
		return false, err
	}
	if fingerprint == "" {
		_, err = tx.Exec(ctx, `DELETE FROM content_imports WHERE id='main'`)
	} else {
		_, err = tx.Exec(ctx, `INSERT INTO content_imports(id,fingerprint,imported_at,duration_ms) VALUES('main',$1,NOW(),$2) ON CONFLICT(id) DO UPDATE SET fingerprint=EXCLUDED.fingerprint,imported_at=EXCLUDED.imported_at,duration_ms=EXCLUDED.duration_ms`, fingerprint, time.Since(started).Milliseconds())
	}
	if err != nil {
		return false, err
	}
	return true, tx.Commit(ctx)
}

func importBundle(ctx context.Context, tx pgx.Tx, b *Bundle) error {
	// The schema, including the one-time conversion of the pre-multi-course
	// catalog, is owned by server/migrations; the importer only writes rows.
	var err error
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
	_, err = tx.Exec(ctx, `INSERT INTO content_metadata(id,version,ids,published_ids) VALUES('main',$1,$2,$3) ON CONFLICT(id) DO UPDATE SET version=EXCLUDED.version,ids=EXCLUDED.ids,published_ids=EXCLUDED.published_ids`, b.Version, ids, published)
	return err
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
	if err := pool.QueryRow(ctx, `SELECT version,ids,published_ids FROM content_metadata WHERE id='main'`).Scan(&b.Version, &ids, &published); err != nil {
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
