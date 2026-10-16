package migrations_test

import (
	"context"
	"os"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"glotworld/server/internal/migrate"
	"glotworld/server/internal/pgtest"
	"glotworld/server/migrations"
)

func all(t *testing.T) []migrate.Migration {
	t.Helper()
	list, err := migrations.All()
	if err != nil {
		t.Fatal(err)
	}
	return list
}

// catalog describes the schema in the pool's search_path schema, independent
// of the schema's name, so two databases can be compared.
func catalog(t *testing.T, ctx context.Context, pool *pgxpool.Pool) []string {
	t.Helper()
	queries := []string{
		`SELECT 'column '||table_name||'.'||column_name||' '||data_type||' null='||is_nullable||' default='||COALESCE(column_default,'') FROM information_schema.columns WHERE table_schema=current_schema() AND table_name<>'schema_migrations'`,
		`SELECT 'index '||tablename||' '||regexp_replace(indexdef, ' ON \S+\.', ' ON ') FROM pg_indexes WHERE schemaname=current_schema() AND tablename<>'schema_migrations'`,
		`SELECT 'trigger '||event_object_table||' '||trigger_name||' '||action_timing||' '||event_manipulation||' '||action_statement FROM information_schema.triggers WHERE trigger_schema=current_schema()`,
		`SELECT 'constraint '||conrelid::regclass::text||' '||conname||' '||pg_get_constraintdef(oid) FROM pg_constraint WHERE connamespace=current_schema()::regnamespace AND conrelid::regclass::text<>'schema_migrations'`,
	}
	var out []string
	for _, query := range queries {
		rows, err := pool.Query(ctx, query)
		if err != nil {
			t.Fatal(err)
		}
		for rows.Next() {
			var line string
			if err = rows.Scan(&line); err != nil {
				t.Fatal(err)
			}
			out = append(out, line)
		}
		rows.Close()
	}
	sortStrings(out)
	return out
}

func sortStrings(values []string) {
	for i := 1; i < len(values); i++ {
		for j := i; j > 0 && values[j] < values[j-1]; j-- {
			values[j], values[j-1] = values[j-1], values[j]
		}
	}
}

func applyAll(t *testing.T, ctx context.Context, pool *pgxpool.Pool) migrate.Result {
	t.Helper()
	result, err := migrate.Apply(ctx, pool, all(t))
	if err != nil {
		t.Fatal(err)
	}
	return result
}

func TestFreshDatabaseAppliesEveryMigrationOnce(t *testing.T) {
	pool, _ := pgtest.Pool(t, "migrations_fresh")
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	first := applyAll(t, ctx, pool)
	if len(first.Applied) != len(all(t)) {
		t.Fatalf("applied %v", first.Applied)
	}
	if second := applyAll(t, ctx, pool); len(second.Applied) != 0 || len(second.Ahead) != 0 {
		t.Fatalf("second run: %+v", second)
	}
	schema := strings.Join(catalog(t, ctx, pool), "\n")
	for _, want := range []string{"column sessions.last_used_at", "INDEX sessions_account_id ON", "INDEX accounts_billing_purchases ON", "column content_imports.fingerprint", "UNIQUE INDEX content_sentences_course_id_slug_key ON",
		"column accounts.email text", "UNIQUE INDEX accounts_email_key ON", "INDEX accounts_created_at ON", "trigger accounts accounts_sync_columns BEFORE UPDATE",
		"INDEX billing_purchases_subscription ON", "trigger accounts accounts_sync_purchases AFTER INSERT",
		"column learning_events.activity_id text", "INDEX learning_events_corrections ON",
		"column world_maps.scene json", "column content_lexemes.body json", "column world_publication.diagnostics json null=NO default='[]'::json"} {
		if !strings.Contains(schema, want) {
			t.Fatalf("fresh schema lacks %s", want)
		}
	}
}

// Databases created by the old boot-time DDL adopt the baseline unchanged and
// end with exactly the schema of a fresh database, with their data intact.
func TestExistingDatabasesAdoptMigrations(t *testing.T) {
	freshPool, _ := pgtest.Pool(t, "migrations_reference")
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	applyAll(t, ctx, freshPool)
	want := catalog(t, ctx, freshPool)
	for name, files := range map[string][]string{
		"51946b10":          {"testdata/schema-51946b10.sql"},
		"51946b10+ad2ebb22": {"testdata/schema-51946b10.sql", "testdata/boot-ddl-ad2ebb22.sql"},
	} {
		t.Run(name, func(t *testing.T) {
			pool, _ := pgtest.Pool(t, "migrations_upgrade")
			for _, file := range files {
				sql, err := os.ReadFile(file)
				if err != nil {
					t.Fatal(err)
				}
				if _, err = pool.Exec(ctx, string(sql)); err != nil {
					t.Fatalf("%s: %v", file, err)
				}
			}
			if _, err := pool.Exec(ctx, `INSERT INTO accounts(id,data) VALUES('ada','{"email":"ada@example.com","player":{"id":"ada"}}');
INSERT INTO sessions(token_hash,account_id) VALUES('hash','ada');
INSERT INTO learning_events(account_id,event_key,request,receipt) VALUES('ada','attempt:1','{}','{"correct":true}');
INSERT INTO content_courses(id,slug,body) VALUES('11111111-1111-4111-8111-111111111111','german','{}');
INSERT INTO content_sentences(id,course_id,slug,version,body) VALUES('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111','greeting',1,'{"text":"Guten Tag"}');`); err != nil {
				t.Fatal(err)
			}
			result := applyAll(t, ctx, pool)
			if len(result.Applied) != len(all(t)) {
				t.Fatalf("every migration should be recorded on adoption: %v", result.Applied)
			}
			if got := catalog(t, ctx, pool); !reflect.DeepEqual(got, want) {
				t.Fatalf("upgraded schema differs from a fresh one:\n%s", diff(want, got))
			}
			var email, text string
			var events int
			var lastUsed time.Time
			if err := pool.QueryRow(ctx, `SELECT a.data->>'email', s.last_used_at, (SELECT count(*) FROM learning_events), (SELECT body->>'text' FROM content_sentences) FROM accounts a JOIN sessions s ON s.account_id=a.id`).Scan(&email, &lastUsed, &events, &text); err != nil {
				t.Fatal(err)
			}
			if email != "ada@example.com" || lastUsed.IsZero() || events != 1 || text != "Guten Tag" {
				t.Fatalf("data changed by adoption: %s %v %d %s", email, lastUsed, events, text)
			}
		})
	}
}

func diff(want, got []string) string {
	seen := map[string]int{}
	for _, line := range want {
		seen[line]++
	}
	for _, line := range got {
		seen[line]--
	}
	var out []string
	for line, count := range seen {
		if count > 0 {
			out = append(out, "- "+line)
		} else if count < 0 {
			out = append(out, "+ "+line)
		}
	}
	sortStrings(out)
	return strings.Join(out, "\n")
}
