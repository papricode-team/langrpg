# Engine, backend and repository review (2026-10-15)

Reviewed from code at commit `51946b10` on a clean worktree. Nothing was changed. Each finding names a file and line and a concrete failure. Severity: **H** breaks players or production, **M** hurts under load or on an unlucky path, **L** cleanliness.

## 1. What is broken right now

| | Finding | Evidence |
| --- | --- | --- |
| H | **CI on `main` has been red since 2026-10-14, 35 runs in a row.** `npm run check` runs `content:check`, which is `word-map.mjs --check --require-reviewed`. That is a release gate: it fails until 13,513 sentences carry a native reviewer's name. Every later CI step (`npm test`, tooling tests, build, budgets, `go test -race`, Docker build) has not run since. | `package.json` `check` script; `.github/workflows/checks.yml` line 49; commit `46b55528` |
| H | **`go test -race ./...` fails with a data race** in `TestWorldOpsPublishCheckedEditsAndStreamPatches`. The test writes `listener.player.MapID` and `InteriorID` without holding `World.mu` while the broadcast ticker reads them. The race is in the test, not production, but it makes the CI gate fail as soon as CI runs it again. | `server/admin_world_ops_test.go:167`, `server/world.go:114,127` |
| H | **Position broadcast stops after travel or a second room visit.** `ExploreScene.init()` resets `elapsed` to 0 but not `nextSendAt`, a class field. After `scene.restart`, `sendPosition()` returns early until `elapsed` passes the previous run's value. Ten minutes in Lindenhafen, then travel: peers see you frozen at spawn for ten minutes. | `web/src/explore-scene.ts:181-188`, `:641-644` |
| H | **Reconnect inside a room desynchronises client and server.** `confirmInterior` calls `this.townReady?.openInterior`. On reconnect the welcome frame calls `onMap` (which restarts the world and clears `townReady`) and then `onInterior`, so the confirmed room is dropped. `api.interiorId` says inn, the scene shows the town, and moves are sent in room coordinates. | `web/src/world.ts:327-332`, `web/src/api.ts:282-283` |
| H | **Rate limits key on the proxy's address in production.** Every limiter uses `r.RemoteAddr`; no `X-Forwarded-For` handling exists. Behind Traefik all players share one address, so the 11th login attempt site-wide in a minute returns 429 for everyone, and the 61st guest session per minute is refused. | `server/app.go:338`, `auth.go:142`, `admin_users.go:332`, `analytics.go:98` |
| H | **Unauthenticated callers can switch the whole API to 429.** `allowCount` refuses every key once more than 4096 entries are younger than a minute. `registerAccount` inserts a key for any bearer string before validating it. About 70 requests per second with random tokens from one host blocks login, attempts, content, billing and admin writes for all users. | `server/app.go:254-276`, `server/auth.go:75-80` |

## 2. Engine (`web/src`, Phaser 4.2.1)

The Phaser-native rework from the 2026-10-13 review holds: scene per mode, registry-owned state, tween and clock driven motion, one shared mini-game `Phaser.Game`, listeners and tweens cleaned at shutdown. The remaining problems sit in the page layer and in async flows.

Still open from `docs/engine-scene-review.md`: activity loads not cancelled by a newer dialog, travel dropped silently on disconnect, cinematics flagged seen before playing, bark director spin, peers never settle, mode derived from booleans and DOM queries, `interiorId` with four owners. Two "fixed" claims are only half true: the mini-game round timer is its own `requestAnimationFrame` loop (`minigames/engine.ts:89,390`) and a `document` keydown handler still coexists with Phaser's keyboard (`main.ts:1828`, hence the 60 ms Escape debounce at `world-edit-mode.ts:257`).

Correctness, beyond the two H items above:

- **M** `openDialog` only bumps `miniGameLoading`. `startActivity` and the interior openers check their own counters, so a dialog opened during their awaits gets its `innerHTML` overwritten and a controller mounted that nobody destroys. `main.ts:1455-1457`, `:1106-1113`, `:524-560`.
- **M** A failed save makes a mini-game round unfinishable: the catch path keeps `pending`, `finish()` returns while `pending` is set, and `destroy()` never emits `end`. `minigames/engine.ts:365-405`.
- **M** Disconnect clears `pendingMap` but not `pendingTravelBeat`, so after reconnect the travel cutscene plays on the map you never left and no toast says travel was cancelled. `main.ts:2512-2516`, `:891`.
- **M** `attemptedCinematics.add` and the POST happen before `playCutscene`, which resolves immediately under reduced motion or when the town is not ready. Reduced-motion players never see arrival stories. `main.ts:812-821`.
- **L** `void session.release()` and `.then()` without `.catch` surface lock-API errors as unhandled rejections. `world-edit-mode.ts:137,183,189`, `main.ts:399,2226`.

Architecture:

- `content.ts` is 4614 lines, of which lines 214 to 4603 are one `quests` array literal. Thirty-three modules import it and `main.ts` touches `quests` 44 times. It duplicates what `content-runtime.ts` already fetches by UUID. It should be `src/data/quests.json` behind a typed loader, as `world-scenes.json` already is.
- `main.ts` is 2549 lines with 97 module-level `let`s, 156 top-level functions, 260 `querySelector` calls and 33 `addEventListener` against 0 `removeEventListener`. The seams are visible: session and billing (`:1965-2460`), menu routing (`:735-800`), exercise runner (`:1491-1680`), launchers (`:1027-1145`), region and cinematic flow (`:805-895`), speech (`:1713-1790`), world edit (`:1791-1825`), global delegation (`:1826-1963`).
- Three launcher idioms do the same job: `startMiniGame` (counter plus owner), `startWorldDelivery` (owner only), `startActivity` (counter only). One `openAsyncDialog(token, loader)` helper removes the whole class of stale-dialog bugs.
- Two import cycles, both `scene-data → world-edit-ops → world-edit-catalogue → world-edit-rules → navigation → scene-data`. Gameplay navigation should not depend on editor rules; move `applyWorldPatch` out of `scene-data.ts`.
- DOM inside Phaser: `isTyping()` reads `document.activeElement` every frame (`explore-scene.ts:580`), `confirm()` blocks inside a key handler (`world-edit-mode.ts:359`), palette thumbnails are rasterised synchronously to base64 on edit start (`:482-494`), and a DOM `CustomEvent` acts as the event bus (`main.ts:727,490`).

Performance, per frame unless noted:

- `occlusionCharacters()` spreads three maps and allocates per actor, then `world-scenery.ts` filters characters per visible item and calls `getBounds()` per part. `world-scene.ts:793-796`.
- `activityWorld.sample()` allocates per resident plus a `Map`; `activityTime()` allocates twice; `worldRain` rehashes. `world-scene.ts:700-709`.
- `clock.advance(0)` runs four or five times per frame, each building a label string. `world-scene.ts:487-589`.
- Bark director re-filters and `Date.parse`-sorts the lexicon every frame for every NPC within 230 px whenever `lineAllowed` rejects, because `lastGlobal` is stamped after the early return. `world-routines.ts:189-216`.
- Mobile resize re-rasterises every text label through `setResolution` and snaps the camera on each URL-bar show or hide. `explore-scene.ts:759-777`.
- Two full `NavigationGrid` builds per map (98k cells with polygon tests). `world-scene.ts:177,613`.

Type safety: zero `any`, zero `@ts-ignore`, 28 `as unknown as`, about 479 non-null assertions (211 in `main.ts`). `strict` is on but `noUncheckedIndexedAccess`, `noImplicitOverride` and unused checks are off, and ESLint disables `no-explicit-any`, `no-non-null-assertion` and `no-unused-vars`. WebSocket frames are `JSON.parse` into `any` with ad-hoc field checks (`api.ts:267-316`).

## 3. Backend (`server/`, Go 1.26)

Good: bearer-only auth with no cookies and hence no CSRF surface, session tokens stored as SHA-256 with constant-time compare, equal-cost login for unknown emails, Creem webhook HMAC with replay window, idempotent receipts and authoritative re-fetch, strict CORS allowlist, 8 KiB and 64 KiB body caps, every admin handler behind `requireAdmin`, no SQL built from user input, no secrets in logs, lock order always `Store.mu` then `World.mu`, JSON store writes via temp file plus fsync plus rename, websocket goroutines joined on exit. `gofmt` and `go vet` are clean and `go mod tidy` is a no-op.

Beyond the two H items above:

- **M** Sessions never expire and a password change does not revoke other sessions. `CredentialChange.apply` only resets `Support.Reset`; `sessions.created_at` is never read. A stolen token stays valid forever. `server/auth_store.go:23-30`, `store.go:263`.
- **M** `/api/world-content` is unauthenticated, unlimited, hits the database per call and serves up to 2 MiB with `Cache-Control: no-store`. Add an ETag and a limiter. `server/admin_world.go:263-275`.
- **M** Guest accounts and sessions grow without bound, and `FindBillingAccount` scans every account with `jsonb_array_elements` and no index. `server/app.go:321-367`, `billing_store.go:117-119`.
- **M** Each learning request costs three or more database round trips, a `FOR UPDATE` row rewrite in `touchAccess`, and about fifteen JSON passes through `canonicalStore.account()`. The websocket calls `accessGuard` on every move message, so one `SELECT` per move at up to 40 per second per player. `server/content_runtime.go:212-217`, `trial_store.go:75-101`, `content_adapter.go:273-290`, `world.go:296-299`.
- **M** Outbound Creem HTTPS calls run inside a `SELECT … FOR UPDATE` transaction, with 6 s per call and up to three calls. A slow Creem blocks the player's every request for up to 8 s and ties up pool connections. `server/billing.go:247-294`, `:427-475`.
- **L** The session token travels in the websocket URL (`app.go:511`). PBKDF2 iterations are hard-pinned to 600000, so the cost can never rise without a migration (`auth.go:40`).

Architecture and operations:

- 99 files in one `main` package with a 17-field `App` shallow-copied per request. `Store` is a real 24-method interface but leaks: `main.go:51` type-asserts `*PGStore`, `content_adapter.go:520` switches on the concrete type, and optional capabilities are discovered by ad-hoc assertions. Extract `internal/store`, `internal/billing` and `internal/world` first; they have the fewest back-references.
- No versioned migrations. Schema is `CREATE TABLE IF NOT EXISTS` at boot (`store.go:262-279`), and `entrypoint.sh` re-imports the 70 MB content bundle into Postgres on every boot with `ALTER TABLE … SET NOT NULL` inside one transaction. Two replicas booting together serialise or deadlock on DDL. Make import a release step and adopt a migrations table.
- `/api/health` pings the database, so a database blip marks the container unhealthy with no liveness/readiness split.
- No access log, request IDs or metrics.
- The runtime image is `node:24-alpine` carrying the Go binary, `node_modules` (sharp, typescript), all of `web/src`, `docs/audits`, `docs/archive` and the 70 MB bundle. Node is needed for the world compiler, but shipping the frontend source tree is not.

Tests: auth, billing, websocket origin, admin and Postgres transactions are well covered. CI runs `go test -race ./...` without `TEST_DATABASE_URL`, so every Postgres integration test in `postgres_test.go`, `billing_test.go`, `content_postgres_test.go`, `referrals_test.go`, `trial_test.go`, `analytics_test.go` and `world_identity_test.go` skips; a separate job runs exactly one of them against a real database. No test covers the limiter overflow, proxy IP handling, or session revocation on password change.

## 4. Project and repository hygiene

Sizes, from `git ls-files` and `git rev-list --objects --all`:

| What | Size |
| --- | --- |
| Tracked files | 24,989 |
| Checkout without LFS content | 97 MB |
| LFS content for the current tree | 11.2 GB |
| Local `.git/objects` | 4.1 GB (6 packs, 5 garbage temp objects) |
| Local `.git/lfs` | 12 GB |
| `server/content.json` in history | 476 MB across 10 commits |
| `web` directory in history | 1.48 GB (mostly `web/public` assets, 12,064 files) |
| `art` non-LFS in history | 711 MB (art tracked before the LFS cut-over) |

Findings:

- **H** `server/content.json` (70 MB) is a build artifact committed to git. `scripts/build-content.mjs` writes it, the Dockerfile rebuilds it from `content/source.json` inside the image, and the Go server only needs it for local JSON-store development. Each rebuild adds 50 to 70 MB to history; ten commits already cost 476 MB. Ignore it and have `npm run dev` build it when missing.
- **H** CI checks out with `lfs: true`, so every push downloads the 11.2 GB LFS tree. Of that, 4.4 GB is `art/proofs` (review evidence read only by authoring scripts) and 5.5 GB is `art/source/character-kit`. The CI steps that need pixels are `check-item-art.mjs` (`art/source/minigames/masters`) and a handful of tests. Fetch only those paths with `git lfs pull --include`, or move proofs out of the repository.
- **M** 3,593 art files, including every town and expedition terrain master at 3 to 4 MB, are tracked as plain git blobs because `.gitattributes` only covers newer paths. `art/source/*.png` and `art/source/expeditions/*.png` are not listed. Add the patterns; migrating history is a separate decision.
- **M** The repository has 72 local branches, 49 already merged into main, and 12 remote branches. Prune them.
- **M** `scripts/` is a flat directory of 146 `.mjs` files (12,852 lines) with 39 test files listed by hand in the `test:tooling` script. Ten scripts are referenced from nowhere: `character-kit-hd.mjs`, `content-snapshot.mjs` (documented as legacy), `foundation-terrain.mjs`, `precompress-web.mjs` (used only by the Dockerfile, which is fine), `prepare-minigame-scenes.mjs`, `prepare-player-portraits.mjs`, `prepare-terrain-expansion.mjs`, `review-player-portraits.mjs`, `story-lint.mjs`. Group by concern (`scripts/art`, `scripts/content`, `scripts/checks`) and use a glob for the test list.
- **M** Each `.claude/worktrees` checkout carries its own `node_modules`; this one was stale from 2026-10-09 and lint and tsc failed until `npm ci`. LFS content is also not smudged in worktrees, so `avatar-baker.test.ts` and `terrain-art.test.ts` fail there with "unsupported image format".
- **L** Docs are fresh (every file in `docs/*.md` touched within the last week) but `docs/map-editor-redesign-handover.md` still references the deleted `level-editor*.ts`, `admin-world-editor.ts` and `world-editor-api.ts`, and `docs/living-world-implementation.md` still describes World Studio. The README project map lists `placed-<region>.ts` files that no longer exist and omits `world-edit-*.ts`, `interior-scene.ts` and `content-runtime.ts`.
- **L** `.github` has one workflow and nothing else: no Dependabot or Renovate, no CODEOWNERS, no PR template, no `.nvmrc` or `engines` field although the README demands Node 24 and Go 1.26.
- **L** The single CI job runs lint, type check, two test suites, asset regeneration, Playwright screenshots, build, budgets, Go tests and a Docker build in sequence. Split into parallel jobs so a content failure does not hide a Go failure.
- **L** `git count-objects` reports five garbage `tmp_obj_*` files in the shared `.git/objects`; `git gc` will clear them.
- Secrets scan found nothing: no live keys, no password literals, `.env` properly ignored, only public Creem product IDs in `.env.example`.

## 5. Test results on this machine

| Suite | Result |
| --- | --- |
| `eslint` | pass |
| `tsc --noEmit` | pass |
| `go vet ./...` | pass |
| `go test -race ./...` | 1 failure (data race in `admin_world_ops_test.go`), then hit the 10 minute default timeout under load |
| `vitest run` (full, under heavy CPU contention) | 125 files, 1209 tests, 49 failed: 42 timeouts, 2 missing LFS images, 5 cascaded |
| `vitest run` (nine failing files, quiet machine) | 144 tests, 3 failed, all at the 5 s default timeout; the same files pass in 8.9 s with `--testTimeout=60000` |
| `node --test` tooling | 255 tests, 15 failed, all in character-kit, cast, portrait and resident-action tests that read LFS art, which this worktree holds only as pointers |

No frontend test fails on an assertion. Every failure is a timeout or a missing LFS image. The Phaser fixture tests (`world-behaviour`, `world-scenes`, `player-movement`, `character-scene`, `cast-resolution`) take 200 to 450 s each under load, and three ordinary tests in `content-runtime.test.ts` and `maps.test.ts` sit within a few hundred milliseconds of the 5 s default. That makes the frontend gate flaky even once CI is green again; raise the per-file timeouts deliberately or make the fixtures cheaper.

## 6. Fix order

1. Move `content:check --require-reviewed` out of `npm run check` into a release-only script so CI turns green and runs the rest of the pipeline again.
2. Fix the test race in `admin_world_ops_test.go` (take `World.mu` or use a helper that sets the listener's map under lock).
3. Reset `nextSendAt` and `lastClockLabel` in `ExploreScene.init()`; route `confirmInterior` through the pending-command queue.
4. Derive the client IP from the trusted proxy header; stop inserting limiter keys for unvalidated tokens; replace the fail-closed overflow with eviction.
5. Revoke other sessions on password change and add session expiry.
6. One dialog token for every async opener; let mini-game `finish()` run after a failed save and emit `end` from `destroy()`.
7. Cache the websocket access decision per tick and drop the redundant `withCourse` read.
8. Ignore `server/content.json`; restrict CI LFS fetch to the paths tests read; add the missing `.gitattributes` patterns; prune merged branches.
9. Run the full Go suite with `TEST_DATABASE_URL` in CI and split the workflow into parallel jobs.
10. Split `content.ts` into data and `main.ts` along the seams listed above.

## 7. Implementation status (2026-10-15)

Implemented on branch `claude/engine-backend-repo-review-09e6dc`.

**CI and repository**

- `npm run check` runs the structural word-map check (`content:check-schema`). The native-review gate moved to `npm run release:check`.
- Hosted CI was removed on 2026-10-15 at the team's request. `npm run verify` runs every former CI check locally in sequence: Go formatting, vet and the race suite against PostgreSQL (a disposable cluster when `initdb` is installed), lint, check, Vitest, tooling tests, asset drift, dialogue and i18n audits, build and budgets; `--ui` and `--docker` add the screenshot check and image build.
- `test:tooling` uses a glob; two passing tests that had fallen out of the hand-written list now run.
- `server/content.json` is untracked and ignored. `npm run dev`, CI and the Docker build regenerate it; the rebuild is byte-identical and takes about 3 s.
- `art/source/*.png` and `art/source/expeditions/*.png` are LFS-tracked; 164 masters were renormalized to pointers. History still holds the old blobs.
- Added `.nvmrc` and an `engines` field. Dependabot was added and then removed with the hosted CI.
- Vitest's default timeout is 20 s.
- `compact-translations.test.mjs` failed on `main` since 2026-10-14, hidden by the red CI. It now bundles with the content-runtime plugin, as production does.

**Engine** (`web/src`)

- Fixed: presence after restart, room confirmation during restart, one dialog token for every async opener (`dialog-session.ts`), mini-game finish after a failed save and `end` on destroy, mini-game clock on the Phaser loop, travel beat cleared with a toast on disconnect, cinematics recorded only after they play with a still version for reduced motion, bark director stamping, density-gated label re-rendering, rejected promises caught, both import cycles removed (`world-patch.ts`), per-frame allocations listed in section 2.
- `main.ts` lost its session, billing and speech blocks to `access-session.ts` and `speech.ts`; `game-mode.ts` names the mode. The mode is still derived, not set at each transition.
- `content.ts` no longer holds data (4614 to 90 lines). Quests, characters and chapters live only in `content/source.json`; Node tools read them through `scripts/content-source.mjs` and Vitest through `web/src/test-support/authored-content.ts`. Generated content and the production bundle are byte-identical. Running the legacy importer `content-snapshot.mjs` would still change 30 Turkish UI strings and interior mini-game links in `source.json`, because other legacy TypeScript modules have drifted.

**Backend** (`server/`)

- Fixed: the test race, client IP from trusted proxies (`TRUSTED_PROXIES`), limiter keys only for valid sessions with eviction instead of global denial, session revocation on credential change, idle expiry for linked accounts (`SESSION_IDLE_DAYS`, guests never expire), PBKDF2 iteration parsing with rehash, ETag and rate limit on `/api/world-content`, per-tick websocket access cache, one fewer read per learning request, Creem calls outside row locks for sync, renewal, webhooks and checkout, GIN and session indexes, `/api/live` liveness, fingerprinted boot import under an advisory lock, access log with request IDs.
- Admin `sync-billing` and `cancel-subscription` now call Creem before taking the account lock, like the player paths.
- Versioned migrations: `internal/migrate` applies the embedded `server/migrations/*.sql` once each under an advisory lock, with checksums. `0001_baseline` matches the schema the old boot DDL created, so existing databases adopt it unchanged.
- `/metrics` serves Prometheus text behind `METRICS_TOKEN`: HTTP traffic by route pattern, sockets per map, limiter rejections, Creem calls, content import timing and pool statistics.
- Package extraction: `internal/store`, `internal/world`, `internal/billing`, `internal/avatar`, `internal/migrate`, `internal/metrics` and `internal/pgtest`. `package main` keeps HTTP wiring and handlers. The `*PGStore` assertion and concrete-type switch became declared capability interfaces.
- Not done: replacing the websocket URL token; guest account pruning.

**Verification on this machine after the fixes**

| Check | Result |
| --- | --- |
| gofmt, `go vet` | clean |
| `go test -race ./...` with PostgreSQL 18 | pass |
| lint, `npm run check`, build, budgets, assets drift, i18n | pass |
| Vitest | 1243 tests pass once LFS art is present |
| Tooling tests | 266 of 266 pass once LFS art is present |
| Docker image build | not run; the Docker daemon was not running |

**Repository maintenance**

- 39 merged branches were deleted and `git gc` reduced the pack from 3.5 GB to 2.1 GB. Merged branches still checked out in other worktrees were kept.
