# Server content and language implementation

Implemented 2026-10-14 in this worktree. Release remains blocked on the available native reviewers completing the content pass.

## Delivered

- Private canonical authoring source, stable UUID catalog, generated server bundle, JSON development store, PostgreSQL content tables and transactional importer. Production startup reads the content store. Docker imports the bundle before opening the server. The optional `MIGRATE_CONTENT_UUIDS=true` migration preserves course snapshots, progress, story slots, rewards and immutable receipts; legacy German receipts remain safe to retry before migration.
- Authenticated content reads with bounded batches, account-wide rate limits, course/story/intake/access gates, selected-language filtering, private ETags and authorization before conditional responses. Content reads recursively withhold grading solutions and explanations.
- One active course, independent saved progress and resumable state, validated support-language selection. Trial and billing remain account-wide. Stale requests cannot mutate a newly activated course.
- Explicit occurrence maps compiled to UTF-16 ranges, placeholder-safe substitutions, one shared sentence renderer, keyboard/touch tooltips and help accounting. Dialogue, narrative/evidence, grammar examples, expeditions and interior cards use the shared renderer. The old matching heuristics and story glossary have been removed.
- Lazy browser content client with identity-scoped caches and cancellation; paged stories and bounded lesson batches. Production transforms remove the retained authoring banks from browser JavaScript. Development file serving also blocks direct private banks and raw learning-module requests. Those legacy source files remain available for authoring regression tests; runtime records use `text`, `translations`, generic lexical fields and course grading configuration. Compatibility adapters retain older German view fields.
- Tiny English proof course: ten sentences, one graph, one unit, four restored words, English speech, Turkish and German support. It shares the record, grading and renderer pipeline. The existing German world remains specialized presentation; the English proof uses the generic course player. Speech uses its declared `en-GB` browser voice; per-course authoring casts also prepare optional recordings through the local Qwen tool. No English recordings were generated.
- Exact-answer eligibility requires a server-recorded graded attempt. Opening a previous gate does not count as answer assistance. Explicit Show persists assistance before displaying an answer, including cached answers. Assistance expires for later scheduled recall; eligibility remains saved.

## Content review handoff

The generated inventory contains 13,513 sentence rows. There are 634 incomplete language maps, including 317 missing translations. No native reviewer approvals have been recorded. Four presentation labels also lack prior Turkish translations: “Railway station”, “Marta’s café”, “The lantern bakery”, and “Fritz’s neighbourhood supermarket”. Acceptance examples and the English proof have draft authored maps, without invented review approval or blanket no-counterpart entries.

Review [the TSV](../content/word-map-review.tsv) using [the authoring instructions](../content/README.md), then run:

```sh
npm run content:apply -- reviewed.tsv
npm run content:build
npm run content:check
```

`content:check` requires complete maps and a named reviewer. It is included in `npm run check`. `content:check-schema` permits incomplete drafts while still rejecting stale selectors/ranges; it is only an implementation check.

## Verification

- TypeScript, ESLint, production build and distribution budgets pass. The largest browser chunk is 1.74 MiB and total JavaScript is 2.92 MiB, below the unchanged 3 MiB startup/largest and 5 MiB total ceilings. A scan against 2,594 authored target sentences longer than 25 characters and 23,967 private text probes found no protected content in emitted JavaScript or distributed test fixtures. The five distributed public audio and item manifests contain no protected transcript or lexical fields; private authoring originals remain available to the content tools.
- Full browser unit suite after integrating the newer UI and editor: 119 files and 1,149 tests passed. Approved artwork was restored from the existing local Git LFS cache, with SHA-256 hashes and sizes verified against HEAD pointers; the art files are clean in Git. No comparison images were regenerated and no tests were skipped.
- Focused browser regressions cover authoring round trips, repeated words, split spans, personalization, stale responses, course switching, saved UUID cursors, delayed loading, immutable retries, explicit answer assistance, heartbeat lifecycle, live minigame registries and direct authoring-file serving. Focused word-map/import and browser stripping tooling checks pass. The full tooling run passed 221 checks initially; all 14 artwork failures passed targeted reruns after hydrating their exact cached Git LFS dependencies.
- All ten desktop/phone UI checks passed, including menu navigation, word-detail focus restoration, ungraded conversation endings/replay/Back, activity readiness, the 12px font floor and overflow checks. Development previews reject mutations and are stripped from production.
- Five voice-tool tests passed, including unchanged German defaults, English course selection, isolated output paths, canonical/legacy job compatibility and a dry run that creates no assets or model downloads.
- Live browser verification completed the English conversation in German support, first-attempt answer reveal, an assisted retry, Turkish highlighting (`Hello` → `Merhaba`), a standalone restored-word attempt, German course activation at 0 XP, and English restoration at 48 XP with the saved word attempt. Test profiles used an isolated temporary save file.
- Full Go tests, race checks and `go vet` passed. They cover content reads, grading parity, access/ETags, receipt migration, account-scoped billing/login, course switching and English lesson flow.
- PostgreSQL integrations passed against an isolated PostgreSQL 18.6 cluster using a Unix socket with TCP disabled. The transactional importer preserved every authored record; failed imports rolled back. Repeated UUID migration preserved progress, save slots, rewards and immutable receipts. English grading and answer recovery survived restart, and switching restored German progress. The production executable booted from PostgreSQL with the migration flag enabled; authenticated smoke checks verified initial course configuration, graph loading, first-attempt answer restrictions, localized recovery and switching. The temporary process and cluster were removed after validation.

## Main integration

The newer menu, admin editor, billing fixes and unlimited reset flows are retained. Their authored interior conversations now use scoped server contexts; fetched exercises retain vocabulary references for activity and minigame readiness. Unavailable optional drills fall back to the scripted conversation, without recording graded attempts.

The latest main updates also retain the NPC movement fixes, world-context UI polish and glotworld branding. The English player and onboarding use the shared brand component. The rebrand integration passed 51 focused browser tests, TypeScript, ESLint, UI template budgets, full Go tests, focused race checks, build and vet.

The parallel content implementation published 32,849 UUID v4 identities. Its complete identity map is retained in `content/published-content-ids.json`; the runtime accepts those saved references and immutable receipts, while the opt-in migration converts them to this catalog's existing identities. The importer transactionally upgrades that implementation's PostgreSQL tables, including missing course columns and older slug constraints. PostgreSQL tests cover the actual older schema and metadata round trip.

The subsequent authored-alignment commit contributes 6,306 exact text triples covering 13,225 canonical sentences, plus 360 scoped expedition choice sentences. A deterministic converter preserves repeated occurrences, split spans and explicit omissions, and retains unmatched original authoring under `content/imported-drafts/9a83d89d`. Imported authored maps keep native review pending. The editor's building-spacing checks and independent inspection layers are retained. Course examples use bounded server sentence reads and the shared renderer, while expedition explanations arrive only after a recorded answer and survive reopening or retrying.

Diagnostic placement now reads one authorized context and exactly eight exercise and cue records after 600 seconds of persisted play. It uses the shared renderer and correctness-only preview grading, without loading quest banks or granting answer recovery. Planning games hydrate generic UI helpers from JSON and use server grading; completed agreements reflect accepted values, and drafts are scoped by account and course. Inventory and ending panels arrive only after ownership or the exact earned ending.

Admin documents bypass learning-ID rewriting, saved world content survives account migration, and edits to German world bounds convert inactive saved course locations while preserving the English classroom. Course switches invalidate leases without granting a trial reset. Actual reset actions clear all course snapshots consistently.

The final main merge retains invite rewards and the three EUR subscription plans, including yearly billing. Invite credit remains account-wide across courses and resets. Interior exercises use course, level and restored-word entitlements. Dialogue containing authored placeholders stays silent after personalization; fixed dialogue retains recorded audio. The final merge passed 176 focused browser tests, full Go tests, focused race checks, vet, tooling regressions, all ten desktop/phone UI checks, production build and budgets.

`npm run check` passes its implementation and existing authoring checks, then fails the required native-review gate: 13,513 sentences await signoff and 634 language maps remain incomplete. The production rollout still requires native review and staging validation.
