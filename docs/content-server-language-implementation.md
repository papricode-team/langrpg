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

The generated inventory contains 12,984 sentence rows. There are 25,927 incomplete language maps, including 751 missing translations. No native reviewer approvals have been recorded. Four presentation labels also lack prior Turkish translations: “Railway station”, “Marta’s café”, “The lantern bakery”, and “Fritz’s neighbourhood supermarket”. Acceptance examples and the English proof have draft authored maps, without invented review approval or blanket no-counterpart entries.

Review [the TSV](../content/word-map-review.tsv) using [the authoring instructions](../content/README.md), then run:

```sh
npm run content:apply -- reviewed.tsv
npm run content:build
npm run content:check
```

`content:check` requires complete maps and a named reviewer. It is included in `npm run check`. `content:check-schema` permits incomplete drafts while still rejecting stale selectors/ranges; it is only an implementation check.

## Verification

- TypeScript, ESLint, production build and distribution budgets pass. The main browser chunk is about 2.53 MiB, below the 3 MiB ceiling. A scan against 2,470 authored target sentences longer than 25 characters found no full learning sentences in emitted JavaScript. The five distributed public audio and item manifests contain no protected transcript or lexical fields; private authoring originals remain available to the content tools.
- Full browser unit suite: 111 files and 1,100 tests passed. Six approved comparison WebPs were restored from the existing local Git LFS cache, with SHA-256 hashes and sizes verified against HEAD pointers; the proof files are clean in Git. No comparison images were regenerated and no tests were skipped.
- The latest focused browser suite passed 170 tests; the final player timer check passed 14 tests; word-map/plugin tooling passed 31 tests. These regressions cover authoring round trips, repeated words, split spans, personalization, stale responses, course switching, saved UUID cursors, delayed loading, immutable retries, explicit answer assistance, heartbeat lifecycle, live minigame registries and direct authoring-file serving.
- Five voice-tool tests passed, including unchanged German defaults, English course selection, isolated output paths, canonical/legacy job compatibility and a dry run that creates no assets or model downloads.
- Live browser verification completed the English conversation in German support, first-attempt answer reveal, an assisted retry, Turkish highlighting (`Hello` → `Merhaba`), a standalone restored-word attempt, German course activation at 0 XP, and English restoration at 48 XP with the saved word attempt. Test profiles used an isolated temporary save file.
- Full Go tests, race checks and `go vet` passed. They cover content reads, grading parity, access/ETags, receipt migration, account-scoped billing/login, course switching and English lesson flow.
- PostgreSQL integrations passed against an isolated PostgreSQL 18.6 cluster using a Unix socket with TCP disabled. The transactional importer preserved every authored record; failed imports rolled back. Repeated UUID migration preserved progress, save slots, rewards and immutable receipts. English grading and answer recovery survived restart, and switching restored German progress. The production executable booted from PostgreSQL with the migration flag enabled; authenticated smoke checks verified initial course configuration, graph loading, first-attempt answer restrictions, localized recovery and switching. The temporary process and cluster were removed after validation.

`npm run check` passes its implementation and existing authoring checks, then fails the required native-review gate: 12,984 sentences await signoff and 25,927 language maps remain incomplete. Native review and staging burn-in remain rollout work. Nothing has been deployed or published.
