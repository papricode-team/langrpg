# JSONB storage plan

Status: plan only, no code changed. Written 2026-10-16 after the ground-fingerprint bug (17a2f736), where PostgreSQL `jsonb` reordering a town's keys made the map editor refuse every bridge move after a restart.

The plan has two parts. Account fields and learning-event fields that the server queries move out of JSONB into real columns and one table. World and content blobs that the server never looks inside switch from `jsonb` to `json`, so the stored bytes stay exactly as written.

## 1. What is stored as JSONB today

| Table.column | Queried inside at runtime? | Where |
| --- | --- | --- |
| `accounts.data` | **Yes**: email, createdAt, player name, billing, analytics | `auth_store.go` `GetByEmail`; `sessions.go` `pgLiveSession` and `PruneExpiredSessions`; `admin_users_store.go` `ListAdminAccounts`; `analytics_store.go` `ReadAnalytics`; `billing_store.go` `FindBillingAccount` |
| `learning_events.request` | **Yes**: activityId, runId, exerciseId, answer, preview | `store.go` `ActivityProofs`; `receipts.go` `ExerciseReceiptExists` |
| `learning_events.receipt` | **Yes**: correct | same two queries |
| `world_maps.scene` | No | `world_store.go` reads and writes whole values |
| `world_publication.shared`, `.world_maps`, `.investigations`, `.diagnostics` | No | `world_store.go` `LoadWorld`/`SaveWorld` |
| `world_story_lines.hidden`, `.edited` | No | `world_store.go` `StoryLines`/`SaveStoryLine` |
| `world_edits.ops` | No | `world_store.go` `WorldEdits` |
| `world_state.data` | No | `world_identity.go` |
| `world_content.data` | No runtime reader; kept as the rollback copy from 0007 | only `migrations/0007_world_tables.sql` |
| `content_courses.body`, `content_manifests.body`, `content_{sentences,lexemes,exercises,units,graphs,expeditions,minigames}.body` | No | `internal/contentstore/content.go` import (`INSERT … ON CONFLICT`) and load (`SELECT body`) |
| `content_metadata.ids`, `.published_ids` | No (see note) | `content.go:287` reads `to_jsonb(m)->'published_ids'` |

How this was checked: a grep over `server/` for `->>`, `->'`, `@>`, `jsonb` and `::json` in non-test Go, plus every `SELECT`/`INSERT`/`UPDATE` in `internal/contentstore/content.go` and `internal/store/world_store.go`. No script under `scripts/` queries these tables directly. The MCP tools go through the HTTP API. The only SQL that reaches inside a world blob is the one-time copy in migration 0007.

Note on `content.go:287`: `to_jsonb(m)->'published_ids'` turns the whole row into JSONB to read a column that may be missing. Migration 0001 adds that column, so it always exists, and the expression also works on a `json` column. The JSON step replaces it with a plain `published_ids`.

## 2. Principles

- **Only `PGStore` changes.** The `Account` struct, the `Store` interface and the JSON development store (`DiskState`) stay as they are. Every change is in how `PGStore` maps an `Account` to rows.
- **Expand, then contract.** New columns and the purchases table are filled by triggers derived from the blob, so a binary from before this work keeps them correct if it is redeployed. New binaries also write them explicitly. Only the last account migration removes keys from the blob, and it is the one step that cannot be rolled back (see §7).
- **One read path and one write path for accounts.** Every `UPDATE accounts SET data=…` goes through a single helper, so a column cannot be missed at one call site. There are 11 call sites today (list in §3.3).
- **Creem is never called while an account lock is held.** No migration, trigger or store helper calls Creem. Purchase rows are written inside the same transaction that holds `SELECT … FOR UPDATE` on the account row, which is the lock `UpdateAccountByID` already takes. `reconcileBilling` in `billing.go` keeps its shape: it reads, calls Creem with no lock held, then applies the result under the lock if `billing.SameLedger` still holds.
- **Migrations follow `server/README.md`.** Each is a new, contiguous `NNNN_name.sql` that runs in a single transaction (so no `CONCURRENTLY`) and uses `IF NOT EXISTS`/`IF EXISTS`. Applied files are never edited. The numbers below assume the steps merge in this order. If they ship as separate PRs, each takes the next free number when it merges.

## 3. Step 1: account columns (migration 0008)

### 3.1 Migration `server/migrations/0008_account_columns.sql`

```sql
-- email, created_at and player_name move out of accounts.data. Until 0013 a
-- trigger derives them from data, so binaries that only write data keep them
-- correct; newer binaries also write them directly.
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS player_name TEXT NOT NULL DEFAULT '';

UPDATE accounts SET
  email = NULLIF(data->>'email', ''),
  created_at = (data->>'createdAt')::timestamptz,
  player_name = COALESCE(data->'player'->>'name', '');

CREATE OR REPLACE FUNCTION accounts_sync_columns() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.email := NULLIF(NEW.data->>'email', '');
  NEW.created_at := (NEW.data->>'createdAt')::timestamptz;
  NEW.player_name := COALESCE(NEW.data->'player'->>'name', '');
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS accounts_sync_columns ON accounts;
CREATE TRIGGER accounts_sync_columns BEFORE INSERT OR UPDATE OF data ON accounts
  FOR EACH ROW EXECUTE FUNCTION accounts_sync_columns();

CREATE UNIQUE INDEX IF NOT EXISTS accounts_email_key ON accounts(email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS accounts_created_at ON accounts(created_at DESC, id);
```

- **Why a trigger and not a generated column.** `data->>'email'` and `data->'player'->>'name'` are immutable and could be `GENERATED ALWAYS AS … STORED`. The text-to-`timestamptz` cast is not immutable, because it depends on the `TimeZone` setting, so `created_at` cannot be generated. A trigger also lets 0013 hand the columns over to Go just by dropping it. One mechanism covers all three columns.
- **Backfill.** It is the `UPDATE` above, run inside the migration. Accounts are one row per player, so a full rewrite is cheap at today's size. Check before deploying: `SELECT count(*), pg_size_pretty(pg_total_relation_size('accounts')) FROM accounts;`.
- `created_at` stays nullable until 0013. In 0013 it becomes `NOT NULL`, once every row is known to have a value. Go writes the zero time as `0001-01-01T00:00:00Z`, which parses.
- **The old indexes stay for now.** `accounts_email_unique` (on `data->>'email'`) still enforces uniqueness for a rolled-back binary and serves its `GetByEmail`. Both unique indexes raise `23505`, which `ChangeCredentials` and `RegisterWithReferral` already map to `ErrCredentialsConflict`. 0013 drops the old one.

### 3.2 Precision

`timestamptz` keeps microseconds, but Go's `time.Time` and the blob keep nanoseconds. Once reads take `created_at` from the column, an account's `CreatedAt` could differ from the blob by less than a microsecond. Truncate where the value is created: `app.go:412` (`CreatedAt: a.now().UTC()` becomes `.Truncate(time.Microsecond)`). The same applies to `Purchase.CreatedAt` in step 2.

### 3.3 Store code

Add **`server/internal/store/pg_accounts.go`**:

- `const pgAccountSelect`: `a.id, a.data, a.email, a.created_at` plus, from step 2 on, the purchases subselect (§4.3).
- `func (s *PGStore) scanAccount(row pgx.Row) (Account, error)`: unmarshals `data`, then sets `Email`, `CreatedAt` and, after step 2, `Billing.Purchases` from the columns. It calls `s.hooks.NormalizeProgress`, which every call site repeats today. `Player.Name` is still decoded from the blob (see §6).
- `func (s *PGStore) writeAccount(ctx, tx pgx.Tx, before, after Account) error`: `UPDATE accounts SET data=$2, email=$3, created_at=$4, player_name=$5 WHERE id=$1`, plus the purchase rows from step 2. `email` is written as `NULL` when it is empty.
- `func (s *PGStore) insertAccount(ctx, tx, Account) error` for `Create`.
- `lockSessionAccount` (`sessions.go`) returns `(Account, error)` instead of `(string, []byte, error)`, so callers stop decoding the blob themselves.

Call sites that switch to these helpers:

| File | Function | Change |
| --- | --- | --- |
| `store.go` | `Create` | `insertAccount` |
| `store.go` | `Get` | select `pgAccountSelect`, `scanAccount` |
| `store.go` | `Mutate`, `UpdateProfile`, `UpdatePreferences` | `lockSessionAccount` returns `Account`; `writeAccount` |
| `auth_store.go` | `changeCredentials` | same |
| `auth_store.go` | `RegisterWithReferral` | locking row loop uses `scanAccount`; both `UPDATE`s use `writeAccount` |
| `auth_store.go` | `GetByEmail` | `WHERE a.email=$1` (served by `accounts_email_key`) |
| `billing_store.go` | `GetAccountByID`, `UpdateAccountByID` | `scanAccount` / `writeAccount` |
| `admin_users_store.go` | `ManageAccount` | `scanAccount` / `writeAccount` |
| `admin_users_store.go` | `ListAdminAccounts` | filter on `email`, `player_name`, `id`; `ORDER BY created_at DESC, id`; select `id, email, player_name, created_at` as columns and only the remaining fragments from `data` (`access`, `referrals`, `activeCourseId`, `support.grant`, and billing minus `purchases` and `webhookReceipts`) |
| `trial_store.go` | the update at line 101 | `writeAccount`; keep the `bytes.Equal(before, data)` no-op shortcut, comparing whole `Account` encodings |
| `migrate_references.go` | `MigrateReferences` | `scanAccount` / `writeAccount` |
| `analytics_store.go` | `ReadAnalytics` | `SELECT id, COALESCE(email,''), created_at, (data->'billing') - 'purchases' - 'webhookReceipts', data->'analytics'`. This drops the `time.Parse` of the text timestamp; analytics never needs the purchase list. |
| `sessions.go` | `pgLiveSession` | `AND (s.last_used_at > $2 OR a.email IS NULL)` |
| `sessions.go` | `PruneExpiredSessions` | `… AND a.email IS NOT NULL AND s.last_used_at < $1` |

In this step the blob is written in full, exactly as today. Removing keys waits for 0013.

### 3.4 Tests

- `server/migrations/migrations_test.go`: add `"column accounts.email"`, `"UNIQUE INDEX accounts_email_key ON"` and `"INDEX accounts_created_at ON"` to the fresh-schema list. `TestExistingDatabasesAdoptMigrations` then checks automatically that upgraded databases match.
- New `server/migrations/account_columns_test.go`: apply `all(t)[:7]`, insert raw rows (a guest with no `email`, a registered account, `"email": ""`, a nanosecond `createdAt`), apply the rest, and assert the columns. Then run an old-binary-style raw `UPDATE accounts SET data=…` that changes the email and the name, and assert the trigger moved the columns with it.
- `server/postgres_index_test.go`: an `EXPLAIN` of `SELECT id FROM accounts WHERE email=$1` uses `accounts_email_key`.
- `server/postgres_test.go` `TestPostgresAccountCredentials`: a duplicate email still returns 409 through the new index.
- `server/sessions_test.go` `TestPostgresSessionsRevokeOnCredentialChangeAndExpireWhenIdle` already covers guest and linked expiry; it must stay green unchanged.
- `server/admin_users_test.go` `TestPostgresAdminUserManagement`: add ordering by `created_at` and a search by name.
- `server/analytics_test.go` `TestAnalyticsPostgresMatchesJSONAndPersists` already compares the PostgreSQL and JSON reports; it must stay green.
- `CreatedAt` round-trip: create an account, restart the store, and `Get` returns an equal `CreatedAt`. This is the check for the precision fix in §3.2.

## 4. Step 2: billing purchases table (migration 0009)

### 4.1 Migration `server/migrations/0009_billing_purchases.sql`

```sql
-- Purchases move out of accounts.data->'billing'->'purchases'. checkout_id is
-- the unique purchase reference: Creem binds a checkout to one account.
CREATE TABLE IF NOT EXISTS billing_purchases (
 checkout_id TEXT PRIMARY KEY,
 account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 position INTEGER NOT NULL,
 request_id TEXT NOT NULL DEFAULT '',
 product_id TEXT NOT NULL DEFAULT '',
 plan TEXT NOT NULL DEFAULT '',
 created_at TIMESTAMPTZ NOT NULL,
 customer_id TEXT NOT NULL DEFAULT '',
 subscription_id TEXT NOT NULL DEFAULT '',
 order_id TEXT NOT NULL DEFAULT '',
 transaction_id TEXT NOT NULL DEFAULT '',
 UNIQUE (account_id, position) DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX IF NOT EXISTS billing_purchases_subscription ON billing_purchases(subscription_id) WHERE subscription_id <> '';
CREATE INDEX IF NOT EXISTS billing_purchases_transaction ON billing_purchases(transaction_id) WHERE transaction_id <> '';

INSERT INTO billing_purchases(checkout_id, account_id, position, request_id, product_id, plan, created_at, customer_id, subscription_id, order_id, transaction_id)
SELECT p->>'checkoutId', a.id, (t.ord - 1)::int,
  COALESCE(p->>'requestId',''), COALESCE(p->>'productId',''), COALESCE(p->>'plan',''),
  (p->>'createdAt')::timestamptz,
  COALESCE(p->>'customerId',''), COALESCE(p->>'subscriptionId',''), COALESCE(p->>'orderId',''), COALESCE(p->>'transactionId','')
FROM accounts a, jsonb_array_elements(COALESCE(a.data->'billing'->'purchases', '[]')) WITH ORDINALITY AS t(p, ord);

CREATE OR REPLACE FUNCTION accounts_sync_purchases() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.data->'billing'->'purchases' IS NOT DISTINCT FROM OLD.data->'billing'->'purchases' THEN
    RETURN NULL;
  END IF;
  DELETE FROM billing_purchases WHERE account_id = NEW.id;
  INSERT INTO billing_purchases(…) SELECT … FROM jsonb_array_elements(COALESCE(NEW.data->'billing'->'purchases','[]')) WITH ORDINALITY AS t(p, ord);
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS accounts_sync_purchases ON accounts;
CREATE TRIGGER accounts_sync_purchases AFTER INSERT OR UPDATE OF data ON accounts
  FOR EACH ROW EXECUTE FUNCTION accounts_sync_purchases();
```

- **Unique reference.** `checkout_id` is the primary key. Every recorded purchase starts from a checkout (`billing.go:237` on checkout creation, `billing.go:379` from a `checkout.completed` webhook), and `CheckoutBelongsTo` already refuses a checkout bound to another account, so "one checkout, one account" is an existing invariant that is now enforced. A write that breaks it fails the transaction instead of silently attaching a purchase to two accounts.
- **Backfill.** The `INSERT … SELECT` uses no `ON CONFLICT`, on purpose. Dropping a duplicate would drop paid access, so a duplicate fails the migration and the deploy stops. Run this preflight against a production backup first; it must return no rows:

  ```sql
  SELECT p->>'checkoutId' AS checkout, count(*)
  FROM accounts a, jsonb_array_elements(COALESCE(a.data->'billing'->'purchases','[]')) p
  GROUP BY 1 HAVING count(*) > 1 OR COALESCE(p->>'checkoutId','') = '';
  ```

- **`position`** keeps the slice order. `billing.SameLedger` (`internal/billing/client.go:212`) compares `Purchases` as an ordered, JSON-encoded list, so a read must return the purchases in the order they were written. The unique index on position is deferred so that a reorder inside one transaction is legal.
- **What stays in the blob.** `webhookReceipts`, `disputedTransactions`, `plan`, `subscriptionId` and the other scalar billing fields are never searched, so they stay in `data->'billing'`. Only the list that `FindBillingAccount` searches moves out.

### 4.2 The account lock

- `UpdateAccountByID` locks the account row with `SELECT … FOR UPDATE`. `writeAccount` then writes the account and its purchase rows in that same transaction, so purchase rows only change under that lock.
- No new Creem call is added. `reconcileBilling`, `createCheckout` (`billing.go:176`) and the webhook path keep calling Creem before `UpdateAccountByID`. `billing_lock_test.go` (`TestCreemRequestsRunOutsideTheAccountLock`, `TestCreemCheckoutCreationRunsOutsideTheAccountLock`, `TestAdminBillingActionsRunCreemOutsideTheAccountLock`) must pass unchanged.
- `FindBillingAccount` takes no lock. It is an index lookup on `billing_purchases` and returns only an account ID.

### 4.3 Store code

- `pg_accounts.go`: `pgAccountSelect` gains
  `COALESCE((SELECT json_agg(json_build_object('checkoutId',p.checkout_id,'requestId',p.request_id,…) ORDER BY p.position) FROM billing_purchases p WHERE p.account_id=a.id), '[]')`.
  That is one round trip. The lookup by `account_id` is served by the index behind `UNIQUE (account_id, position)`, which also returns the rows in order. `scanAccount` decodes it into `Billing.Purchases`. Empty strings decode as zero values, which matches the `omitempty` fields.
- `writeAccount(before, after)`: when `before.Billing.Purchases` and `after.Billing.Purchases` encode the same, it skips the purchase rows, so gameplay writes such as `Mutate` cost nothing extra. Otherwise it runs `DELETE FROM billing_purchases WHERE account_id=$1 AND checkout_id <> ALL($2)` and then upserts each purchase with its position. In steps 1 and 2 the trigger has already written the same rows, so the upsert changes nothing.
- `billing_store.go` `FindBillingAccount`: two lookups,
  `SELECT account_id FROM billing_purchases WHERE subscription_id=$1 LIMIT 1` and then the same on `transaction_id`. This keeps today's rule that an empty reference never widens the match. The JSON marshalling and the `@>` query go away.
- `billing.go:237` and `billing.go:379`: truncate `Purchase.CreatedAt` to microseconds (see §3.2), so a purchase read back is identical to the one written and `SameLedger` cannot loop on a precision difference.

### 4.4 Tests

- `server/postgres_index_test.go` `TestPostgresBillingLookupAndSessionIndexes`: the `EXPLAIN` expectation moves from `accounts_billing_purchases` to `billing_purchases_subscription`, plus a transaction case expecting `billing_purchases_transaction`. The existing lookup cases (subscription only, transaction only, mixed, both empty, both missing) stay as they are.
- New `server/migrations/billing_purchases_test.go`: apply up to 0008, insert accounts with zero, one and two purchases (one with an empty `subscriptionId`), apply 0009, and assert the rows and their order. A second case seeds a duplicate `checkoutId` across two accounts and asserts the migration fails.
- Trigger compatibility: a raw `UPDATE accounts SET data=jsonb_set(…'{billing,purchases}'…)` (an old-binary write) replaces the rows.
- A unique checkout: recording the same `CheckoutID` on a second account through `UpdateAccountByID` returns an error and leaves both accounts unchanged.
- Ledger stability (PostgreSQL): record a purchase whose `CreatedAt` has nanoseconds, then run `reconcileBilling` with the fake Creem from `internal/billing/billingtest`. It must apply on the first attempt, never returning `ErrLedgerChanged`.
- `server/billing_test.go` webhook tests: refund and dispute lookups by subscription and by transaction must still find the account against PostgreSQL.
- `internal/store/store_test.go` `TestBillingAccountUpdatesRollbackAndSerialize`: add a PostgreSQL case where a failing `fn` leaves `billing_purchases` unchanged.

## 5. Step 3: learning-event columns (migration 0010)

### 5.1 Migration `server/migrations/0010_learning_event_columns.sql`

```sql
-- Attempt lookups read columns instead of the request and receipt JSONB. The
-- request is the immutable record of what the client sent, so these stay
-- generated from it permanently.
ALTER TABLE learning_events
  ADD COLUMN IF NOT EXISTS activity_id TEXT GENERATED ALWAYS AS (request->>'activityId') STORED,
  ADD COLUMN IF NOT EXISTS run_id TEXT GENERATED ALWAYS AS (request->>'runId') STORED,
  ADD COLUMN IF NOT EXISTS exercise_id TEXT GENERATED ALWAYS AS (request->>'exerciseId') STORED,
  ADD COLUMN IF NOT EXISTS answered BOOLEAN GENERATED ALWAYS AS (COALESCE(request->>'answer','') <> '' AND COALESCE(request->>'preview','false') <> 'true') STORED,
  ADD COLUMN IF NOT EXISTS correct BOOLEAN GENERATED ALWAYS AS ((receipt->>'correct')::boolean) STORED;
CREATE INDEX IF NOT EXISTS learning_events_corrections ON learning_events(account_id, activity_id, run_id) WHERE correct = false;
```

- **Why generated columns.** Here they fit: `->>`, `COALESCE` and the text-to-boolean cast are all immutable. Inserts need no change, any binary keeps the columns correct, and there is no contract step. `exercise_id` and `answered` are included because `ExerciseReceiptExists` reads the same blob. Without them `request` would still be queried.
- **Backfill.** Adding a `STORED` column rewrites the table under an `ACCESS EXCLUSIVE` lock, inside the startup migration. Measure it first: `SELECT count(*), pg_size_pretty(pg_total_relation_size('learning_events')) FROM learning_events;`. Up to a few million rows this takes seconds. If it is much larger, use the fallback instead: plain nullable columns, a `BEFORE INSERT` trigger, and a batched `UPDATE … WHERE ctid = ANY(…)` from a one-off command, with the `ActivityProofs` query tolerating `NULL` until that finishes.
- `receipt->>'correct'` is only ever `true`, `false` or absent, because `Receipt.Correct` is a `*bool` with `omitempty`, so the cast cannot fail.

### 5.2 Store code

- `store.go` `PGStore.ActivityProofs`: the count becomes
  `SELECT COUNT(*) FROM learning_events WHERE account_id=$1 AND event_key LIKE 'attempt:%' AND activity_id=$2 AND run_id=$3 AND correct=false`.
- `receipts.go` `PGStore.ExerciseReceiptExists`: `e.exercise_id IN ($3,$4) AND e.answered AND e.correct IS NOT NULL`.
- `INSERT` in `Mutate` does not change: a generated column cannot be written.

### 5.3 Tests

- `server/postgres_test.go` `TestPostgresPausedActivityUsesImmutableReceipts`: add a row inserted with raw SQL before 0010 (apply `all(t)[:9]`, insert, then apply the rest) and assert it is counted.
- `server/postgres_index_test.go`: an `EXPLAIN` of the corrections count uses `learning_events_corrections`.
- Course-progress tests that call `ExerciseReceiptExists` through the legacy-receipt path (`content_legacy_receipts.go`) must stay green against PostgreSQL, including the legacy `attempt:<id>` key without a course.
- `server/migrations/migrations_test.go`: fresh schema contains `"column learning_events.activity_id"` and `"INDEX learning_events_corrections ON"`.

## 6. Step 4: opaque world and content blobs become `json` (migrations 0011 and 0012)

### 6.1 Assessment

- **The server never queries inside these columns** (see §1). The world store's own comment says it "treats every part as opaque JSON" (`world_store.go:15`). The content store writes whole bodies and reads them back.
- **What `json` gives.** PostgreSQL stores `json` as the validated input text: key order, whitespace and duplicate keys are kept. `jsonb` parses the value and prints it back in its own key order, which caused the fingerprint bug. With `json`, a town read after a restart has the same bytes the compiler wrote. Writes skip the jsonb conversion and reads skip printing it back, which helps the multi-megabyte world publication. Both types are TOAST-compressed.
- **What `json` loses.** It has no equality operator and no GIN indexing, so `=`, `DISTINCT`, `GROUP BY`, `UNION` (without `ALL`) and `@>` would fail on these columns. A grep found none. `ON CONFLICT … DO UPDATE SET body=EXCLUDED.body` and `IS NULL` checks still work. `->`, `->>`, `json_each` and `to_jsonb(row)` still work, so a one-off query or migration can still read inside.
- **Existing rows.** `USING col::json` stores the jsonb's printed text, and the original key order is already lost. Only values written after the switch are verbatim. Each town regains its exact bytes on its next save. Keep the canonical ground fingerprint from 17a2f736 regardless, because the browser may still compare its own encoding against the server's.
- **Go side.** pgx scans `json` into `[]byte` and sends `[]byte` parameters as JSON text, so `world_store.go` and `contentstore/content.go` need no type changes. One caveat: `LoadWorld` rebuilds `Publication` with `json.Marshal(map[string]any{…json.RawMessage…})`, and `encoding/json` compacts `RawMessage`. That keeps key order but drops whitespace. `World.Maps` comes straight from the scan and is byte-exact.
- **Rollback.** A binary from before this step writes `[]byte` and reads `[]byte`. It works against `json` columns, including `to_jsonb(m)->'published_ids'`. This step is reversible: a later migration can `ALTER … TYPE jsonb USING col::jsonb`.

### 6.2 Migration `server/migrations/0011_opaque_json.sql`

```sql
-- World and content blobs are opaque to the server; json keeps the bytes the
-- compiler and importer wrote, where jsonb reorders object keys.
ALTER TABLE world_maps ALTER COLUMN scene TYPE json USING scene::json;
ALTER TABLE world_publication ALTER COLUMN shared TYPE json USING shared::json,
  ALTER COLUMN world_maps TYPE json USING world_maps::json,
  ALTER COLUMN investigations TYPE json USING investigations::json,
  ALTER COLUMN diagnostics DROP DEFAULT,
  ALTER COLUMN diagnostics TYPE json USING diagnostics::json,
  ALTER COLUMN diagnostics SET DEFAULT '[]';
ALTER TABLE world_story_lines ALTER COLUMN hidden TYPE json USING hidden::json,
  ALTER COLUMN edited TYPE json USING edited::json;
ALTER TABLE world_edits ALTER COLUMN ops TYPE json USING ops::json;
ALTER TABLE world_state ALTER COLUMN data TYPE json USING data::json;
ALTER TABLE content_courses ALTER COLUMN body TYPE json USING body::json;
ALTER TABLE content_manifests ALTER COLUMN body TYPE json USING body::json;
-- … the same line for content_sentences, content_lexemes, content_exercises,
-- content_units, content_graphs, content_expeditions, content_minigames.
ALTER TABLE content_metadata ALTER COLUMN ids TYPE json USING ids::json,
  ALTER COLUMN published_ids DROP DEFAULT,
  ALTER COLUMN published_ids TYPE json USING published_ids::json,
  ALTER COLUMN published_ids SET DEFAULT '{}';
```

- **Backfill.** None; the type change rewrites each table. The world is a few MB. The content tables are rewritten by every import anyway.
- Defaults are dropped and set again around the type change, so the change does not depend on an assignment cast from `jsonb` to `json`.
- The `CHECK (hidden IS NOT NULL OR edited IS NOT NULL)` on `world_story_lines` is unaffected.
- `learning_events.request` and `receipt` stay `jsonb`: step 3's generated columns depend on them, and the semantic comparison in `Mutate` already handles reordered keys. `accounts.data` stays `jsonb` too: the server still reaches into it for `access`, `referrals` and similar fields, and it is rewritten as a whole on every write.

### 6.3 Migration `server/migrations/0012_drop_world_content_copy.sql` (optional, needs a yes)

`world_content` is the rollback copy that 0007 kept "for one release" (README, World storage). Nothing reads it at runtime. If a release has shipped since 0007 and nobody needs to roll back to the single-document world, `DROP TABLE IF EXISTS world_content;` is better than converting a dead table. `TestPostgresWorldContentMovesIntoWorldTables` (`admin_world_migration_pg_test.go`) then has to seed `world_content` and apply only `all(t)[:7]` before checking. The `DiskState.WorldContent` conversion in the JSON development store is separate and stays. Update the World storage paragraph in `server/README.md`.

### 6.4 Store code

- `internal/contentstore/content.go:287`: `SELECT version, ids, published_ids FROM content_metadata WHERE id='main'`.
- Comments in `store.go` that describe JSONB key reordering stay true for `learning_events`.
- `server/README.md`: say that world and content parts are stored as `json`, byte for byte.

### 6.5 Tests

- New PostgreSQL test in `server/internal/store` (next to `TestPostgresServersShareOneDurableWorldIdentity`, `store_test.go`): `SaveWorld` with a scene whose keys are out of order (`{"z":1,"a":{"y":2,"b":3}}`) and contain whitespace, then `LoadWorld` on a fresh `PGStore`. `World.Maps[id]` must be byte-identical. Do the same for `SaveStoryLine` with `StoryLines`, and for `WorldEdits` ops.
- `server/admin_world_reconcile_pg_test.go` `TestPostgresWorldEditsPublishAfterStartupReconciliation`: add a bridge move after a store restart that sends the fingerprint the client computed before the restart. It must be accepted. This is the original bug, now covered at the storage layer as well.
- `server/content_postgres_test.go` `TestPostgresContentImportBootMigrationAndCourseRestart`: assert that one body's bytes survive an import and a load.
- `server/migrations/migrations_test.go`: the fresh-schema list gains `"column world_maps.scene json"` (match whatever form `catalog()` prints). The upgrade test checks that both paths end the same.

## 7. Step 5: accounts contract (migration 0013, a later release)

Ship this only after steps 1 and 2 have run in production for at least one release, and after deciding that the binaries from before step 1 will not be redeployed.

### 7.1 Migration `server/migrations/0013_account_columns_authoritative.sql`

```sql
-- Columns and billing_purchases are now the only copy of these fields.
DROP TRIGGER IF EXISTS accounts_sync_columns ON accounts;
DROP TRIGGER IF EXISTS accounts_sync_purchases ON accounts;
DROP FUNCTION IF EXISTS accounts_sync_columns();
DROP FUNCTION IF EXISTS accounts_sync_purchases();
UPDATE accounts SET data = (data - 'email' - 'createdAt') #- '{billing,purchases}';
ALTER TABLE accounts ALTER COLUMN created_at SET NOT NULL;
DROP INDEX IF EXISTS accounts_email_unique;
DROP INDEX IF EXISTS accounts_billing_purchases;
```

### 7.2 Store code

- `pg_accounts.go` `writeAccount` encodes the blob through a PostgreSQL-only type that leaves out `email`, `createdAt` and `billing.purchases`. For the top-level keys, shadow them with zero-valued `omitempty` fields (`*time.Time` for `createdAt`). For purchases, give the billing state a copy without `Purchases`. `scanAccount` already overlays the columns (since step 1), so reads do not change.
- `Player.Name` stays in the blob. `world.Player` is the record the presence protocol sends in snapshots, and every `CourseState` carries its own `Player`. Removing the name from one nested copy would need custom encoding and gives the server nothing it can query. `player_name` stays a search column that `writeAccount` keeps in step. This is a judgement call; strip it too if a single copy matters more than the extra encoder.
- The steps 1–2 binary already writes the columns and purchase rows explicitly and overlays them on read. If it is redeployed after 0013, it still works: it writes the keys back into the blob, and the 0013 binary ignores them.
- `server/migrations/migrations_test.go` `TestFreshDatabaseAppliesEveryMigrationOnce` currently expects `"INDEX accounts_billing_purchases ON"`; that expectation is removed.

### 7.3 Rollback

A binary from before step 1 reads the email and the purchases from the blob, so after 0013 it would treat every registered account as a guest with no purchases. Do not deploy one. If it ever has to be, run this first:

```sql
UPDATE accounts a SET data = jsonb_set(jsonb_set(a.data, '{createdAt}', to_jsonb(a.created_at)), '{billing,purchases}',
  COALESCE((SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object('checkoutId',p.checkout_id, …)) ORDER BY p.position) FROM billing_purchases p WHERE p.account_id=a.id), '[]'), true)
  || CASE WHEN a.email IS NULL THEN '{}' ELSE jsonb_build_object('email', a.email) END;
```

`docs/deployment.md` should hold this snippet next to the restore instructions.

### 7.4 Tests

- New `server/migrations/account_contract_test.go`: seed accounts through the steps 1–2 store, read every account with `GetAccountByID`, apply 0013, read them again, and require `reflect.DeepEqual`. Then run the rollback SQL from §7.3 and check that the blob again holds `email`, `createdAt` and `billing.purchases`.
- A registered account, a guest, an account with two purchases, and an account that changed its email after step 1 all log in, refresh and reconcile billing after 0013.

## 8. Rollout order

| Release | Migrations | Binary changes | Rollback |
| --- | --- | --- | --- |
| A | 0008, 0009 | `pg_accounts.go`, the call sites in §3.3, `FindBillingAccount`, microsecond truncation | Any earlier binary: the triggers keep columns and rows in step, and the old indexes are still there |
| A (or its own release) | 0010 | `ActivityProofs`, `ExerciseReceiptExists` | Any earlier binary; generated columns need no writer |
| B (independent of A) | 0011, and 0012 if approved | `content.go:287`, README | Any earlier binary; `json` reads and writes as `[]byte`. 0012 cannot be undone, except from a backup |
| C (at least one release after A) | 0013 | the encoder that leaves the moved keys out | Binaries from A onwards only; the §7.3 SQL for anything older |

For each release:

1. Take a database backup (`docs/deployment.md`).
2. Run the preflight queries (the duplicate-checkout check in §4.1 and the size checks in §3.1 and §5.1) against a copy of production.
3. Run `npm run verify` with PostgreSQL available (`TEST_DATABASE_URL`, or `initdb` installed so the script starts a disposable server), so that the Postgres tests actually run instead of being skipped.
4. Deploy. The importer and then the server apply the migrations at startup under the advisory lock.
5. Check `/api/health`, log in with a registered account, and look up a refund webhook by subscription ID (`FindBillingAccount`) in the logs or with a Creem sandbox event.

Steps A and B do not depend on each other. B is the smallest and most self-contained, so it is a good first PR if the user wants the fingerprint class of bug closed off quickly.

## 9. Out of scope, noted for later

- `accounts.data.passwordHash` and the support/reset token hashes sit in the same blob. Moving credentials into their own table would let `GetByEmail` stop loading the whole progress document for a login. That is a separate plan.
- `ListAdminAccounts` searches with `strpos(lower(…))`, which scans every row whatever the column type. A `pg_trgm` index on `lower(email)` and `lower(player_name)` would serve it once the columns exist.
- `learning_events.request` could become `json` after step 3, which would let `Mutate` compare requests byte for byte again. The generated columns would have to be dropped and recreated around the type change, and the semantic comparison already works, so this is not worth doing now.
