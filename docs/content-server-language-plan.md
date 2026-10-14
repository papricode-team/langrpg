# Plan: word highlighting, server-owned content, and more target languages

Written 2026-10-14 against `d9a67146`. Product decisions confirmed 2026-10-14; engineering implementation is available; content review and staging rollout remain pending. See [implementation status](content-server-language-implementation.md).

## Confirmed product decisions

- No feature needs to work offline, including completed-conversation replay.
- The second course teaches **English**, with **Turkish and German** support. The existing German course retains English and Turkish support.
- One course is active at a time. Each course keeps independent saved learning progress and story state when the learner switches.
- **Show exact answer** becomes available only after the first server-recorded attempt for that exercise in that account and course. A correct or incorrect graded attempt qualifies. Reloading or switching courses preserves this eligibility.
- Reviewers are available in every required language. The content pass includes English, Turkish and German as needed for each course.

Three requirements:

1. Tapping a word in a sentence must highlight its meaning in the translated sentence, everywhere a translation is shown.
2. Learning content must live on the server, be addressed by UUIDs, and be served in small, rate-limited slices.
3. The product must be able to teach languages other than German.

They are handled together because the fix for 1 is content that belongs on the server (2), and the shape of that content decides whether 3 is possible without a rewrite later.

---

## Part 1 — Word highlighting

### 1.1 Why it fails today

[web/src/dialogue-translation.ts](../web/src/dialogue-translation.ts) does not know which translated word belongs to the tapped one. It takes the word's dictionary gloss and searches for that text inside the translated sentence with a regex. The gloss is *bilet*, the sentence says *Biletiniz*, no match, no highlight. English works slightly better only because of a hand-written list of special cases (ten verb inflections, articles, *Sie*, *möchte*). The story journal, act intros, evidence cards, expeditions and interiors use a different renderer with no word highlighting at all.

The matching information was never authored. The browser is asked to reinvent it from two strings on every tap. It cannot.

### 1.2 What to do instead

**For every sentence that has a translation, author which word(s) in the translation correspond to each tappable word, store that with the sentence on the server, and send it along with the sentence.** The browser then only has to mark the exact string it was given.

The record contains authored alignments per support language. Each alignment selects a specific occurrence of a source word and one or more exact target spans:

```jsonc
{
  "id": "5d7c1b9e-…",                                   // UUID
  "text": "Ihre Fahrkarte, bitte. Auch meine Akten müssen geprüft werden.",
  "translations": {
    "tr": {
      "text": "Biletiniz, lütfen. Benim dosyalarımın da denetlenmesi gerekiyor.",
      "words": [
        { "source": { "text": "Fahrkarte", "occurrence": 1 }, "targets": [{ "text": "Biletiniz", "occurrence": 1 }] },
        { "source": { "text": "bitte", "occurrence": 1 }, "targets": [{ "text": "lütfen", "occurrence": 1 }] },
        { "source": { "text": "Auch", "occurrence": 1 }, "targets": [{ "text": "da", "occurrence": 1 }] },
        { "source": { "text": "Akten", "occurrence": 1 }, "targets": [{ "text": "dosyalarımın", "occurrence": 1 }] },
        { "source": { "text": "geprüft", "occurrence": 1 }, "targets": [{ "text": "denetlenmesi", "occurrence": 1 }] },
        { "source": { "text": "müssen", "occurrence": 1 }, "targets": [{ "text": "gerekiyor", "occurrence": 1 }] },
        { "source": { "text": "werden", "occurrence": 1 }, "targets": [] }
      ]
    },
    "en": {
      "text": "Your ticket, please. My files must be checked too.",
      "words": [
        { "source": { "text": "Ihre", "occurrence": 1 }, "targets": [{ "text": "Your", "occurrence": 1 }] },
        { "source": { "text": "Fahrkarte", "occurrence": 1 }, "targets": [{ "text": "ticket", "occurrence": 1 }] },
        { "source": { "text": "bitte", "occurrence": 1 }, "targets": [{ "text": "please", "occurrence": 1 }] },
        { "source": { "text": "Auch", "occurrence": 1 }, "targets": [{ "text": "too", "occurrence": 1 }] },
        { "source": { "text": "Akten", "occurrence": 1 }, "targets": [{ "text": "files", "occurrence": 1 }] },
        { "source": { "text": "müssen", "occurrence": 1 }, "targets": [{ "text": "must", "occurrence": 1 }] },
        { "source": { "text": "geprüft", "occurrence": 1 }, "targets": [{ "text": "checked", "occurrence": 1 }] }
      ]
    }
  }
}
```

This example shows selected alignments; exported records must cover every required tappable source occurrence.

Rules for the map:

- Source and target selectors use exact text and a one-based occurrence number on both sides. Authoring tools compile validated selectors to UTF-16 ranges in the unchanged strings, so the renderer only marks supplied ranges and cannot match a substring inside an unrelated word.
- Personalizing template placeholders such as `{name}` must adjust the authored source and target ranges as part of substitution, without rematching words. Text and ranges always describe the same rendered string, even when a player name changes its length or duplicates a word in the sentence.
- Repeated source words may have different alignments. Repeated translated words select the intended occurrence explicitly; there is no special `ticket#2` string syntax.
- A target span may cover several words, and several source occurrences may share a target span. A source occurrence may also map to multiple spans: *Möchtest* maps to **Would** and **like** separately in “Would you like…”, excluding **you**.
- Keep individual words tappable. Phrase meanings can be shared by their component words; the renderer does not create overlapping phrase and word buttons.
- An explicit empty `targets` array means “no counterpart”; missing alignment data means incomplete authoring. Tappable source-word metadata and support-language glosses remain separate from alignment, so *werden* still opens its gloss with no highlight.

The project manager's job is to get this map **written for every sentence we show with a translation**, in each course's support languages, and to keep it written when sentences change. Concretely:

1. **Export** a sheet (`scripts/word-map.mjs --export`) with one row per sentence: course id, sentence id, target sentence, translations, and an empty alignment column for each support language. For the German course, pre-fill the English alignment column from the existing lexicon only where the gloss and source occurrence identify an unambiguous exact span; leave everything else blank. Translators fill the blanks. This is the same native-speaker pass that [docs/turkish-route.md](turkish-route.md) already requires, with one more column.
2. **Import** (`--apply`) back into the content files. **Validate** on import and in CI: every source and target selector resolves to its authored occurrence, ranges stay valid, and every required noun/verb/adjective occurrence has an alignment or an explicit empty target list. A missing or stale map fails `npm run check`, exactly like the existing story lint.
3. **Store** the maps with the sentences on the server (Part 2). They are content, versioned with the content.

Scope, in order: the 18 story dialogue graphs and their variants, corrections, topics and choices; story narrative (act text, clues, Elise's letters, evidence); course example sentences; expedition encounter lines; interior word cards. Roughly a few thousand short sentences.

### 1.3 One renderer everywhere

One module, `web/src/translated-sentence.ts`, replaces both the dialogue markup in [dialogue-view.ts](../web/src/dialogue-view.ts) and `renderNarrative()` in [sentence-translations.ts](../web/src/sentence-translations.ts):

- Every authored tappable source-word occurrence becomes a `<button>` in the sentence, including words with no translation counterpart. Tapping it shows its gloss and wraps each supplied target range in `<mark>`. No heuristics, no language rules.
- Tooltip positioning, keyboard handling, Escape, and the help accounting (`hint()`/`expose()`) are kept from the current code.
- Dialogue panel, journal, act intros, evidence cards, expeditions and interiors all call it.

Delete `dialogue-translation.ts`, `story-glossary.ts` and the regex gloss lookup in `main.ts`. Keep the cases from [dialogue-translation.test.ts](../web/src/dialogue-translation.test.ts) as assertions over the authored maps so the agreed behaviour (*Sie* → *She* vs *you*, *möchtest* → *would like*, nothing on ambiguity) stays locked.

Acceptance: in the screenshot, tapping *Fahrkarte* marks *Biletiniz*; *geprüft* marks *denetlenmesi*; *Auch* marks *da*. English route: *bitte* marks *please*.

---

## Part 2 — Moving content behind the API

### 2.1 What ships in the bundle today

| Frontend copy | Size | Server copy? | Becomes |
| --- | --- | --- | --- |
| `content.ts` quests, NPCs, exercises **with answers** | 4.6k lines | partial (`course.json`, ids + answers) | sentences, exercises |
| `data/course*.json` | 18.9 MB | `course.json`, **already drifted** (different hash) | units, exercises |
| `data/course-lexicon.json` | 2.5 MB | inside `course.json` | lexemes |
| `data/dialogue-graphs.json` | 424 KB | no | graphs, sentences |
| `data/story-text.json`, letters, clues | 67 KB | no | sentences |
| `data/expedition-learning*.json`, `minigames/*.json` | 1.3 MB | yes | expeditions, minigames |
| `data/i18n/tr-*.json` | 1.5 MB | no | folded into each record's `translations.tr` |

Ids are readable and sequential (`a1-arrival-exercise-7`, `ich-pron`), so the whole course can be enumerated, and one request for the Vite chunk downloads all of it with answers.

### 2.2 Content store

- Postgres tables `content_sentences`, `content_lexemes`, `content_exercises`, `content_units`, `content_graphs`, `content_expeditions`, `content_minigames`. Each row: `id uuid`, `course_id uuid` (Part 3), `slug` (old id, importer and tests only), `version`, `body jsonb`.
- JSON dev store: a `content.json` next to `server/.data/state.json`, loaded the way `curriculum.go` embeds files today, so `npm run dev` works without Postgres.
- Importer `server/cmd/import-content` reads the build output (`content/*.json` from `build-course.mjs`, `scene-compiler`, `word-map.mjs`) and upserts. A committed `content_ids.json` keeps slug → UUID stable across rebuilds.
- Progress references switch from slugs to UUIDs (`completedQuestIds`, `wordIds`, `exerciseStats`, attempts, story nodes, choices, expedition state). The migration also covers story save slots, reward ledgers, immutable attempt references and derived word-item IDs. One migration rewrites stored accounts via the slug map into the German course, behind a flag, without discarding saved evidence or rewards.
- The server's in-memory `Curriculum` grading index is built per course from the store at boot instead of `//go:embed`. Preserve existing German grading, FSRS, intake pacing and story behavior while making their content and configuration course-specific.

### 2.3 Endpoints

All content reads are under `/api/content/…`, with a session bearer required (guests have one), existing account access/trial checks, `GET` with `ETag` and private caching, each returning only what the account may see in its active course. Authorization runs before cache validation. Cache identity includes account, course, support language and content version; conditional responses never bypass entitlement checks.

| Endpoint | Returns | Gate |
| --- | --- | --- |
| `bootstrap` | NPC roster, quest/map skeleton (uuid, title, level, location, npc), current act text. No sentences, no exercises. | session |
| `graphs/{uuid}` | Node ids, stages, **sentence uuids**, choice uuids, objectives, gate exercise uuid. | quest unlocked for this account (`story_rules`) |
| `sentences?ids=…` (≤ 12) | Sentence records as in 1.2, with only the account's support language. | sentence belongs to a visible node or a completed quest |
| `exercises/{uuid}` | Prompt, mode, options/tiles, hint, example. **Never `answer`, `acceptedAnswers`, `explanation`.** | unit/quest reachable |
| `lexemes?ids=…` (≤ 24) | Lemma, forms, meaning in support language, example sentence uuid. | in the account's restored words, or referenced by a visible sentence |
| `units/{uuid}` | Title, exercise uuids, required word uuids. | at or below the account's level, intake budget respected |
| `expeditions/{uuid}`, `minigames/{uuid}` | Per encounter / per game. | route unlocked |

Model answers and explanations only ever return from `POST /api/attempt`, after an attempt the server has recorded for that account, exercise and active course. Before the first attempt, **Show exact answer** is disabled. After that attempt, the client can show the recorded feedback; following a reload it can recover the feedback through an idempotent retry of the recorded attempt. Revealing or using the model answer retains assisted-practice accounting. Empty requests made only to fetch an answer do not establish eligibility.

### 2.4 Limiters

- Per-account, per-minute budgets through the existing limiter: sentences 120, exercises 60, lexemes 240, graphs 10, bootstrap 6. Charge batch reads by record count and key limits by account identity across sessions. Honest play fetches one sentence per dialogue advance; sustained scraping reaches 429 when the corresponding budget is exhausted.
- Entitlement is the real limiter: quests gate each other, optional vocabulary follows the existing intake budget, expeditions need Act III, guests get only the trial's reach. Preserve story access in clue order regardless of optional vocabulary intake; lexemes referenced by visible story sentences remain readable.
- Unknown and locked ids both return 404. Batch ids are validated as UUIDs and capped; unknown ones are dropped silently.
- Count 404s and 429s per account in logs. No automatic bans in this phase.

### 2.5 Client

- `web/src/content-api.ts`: typed client, in-memory cache per record type, request coalescing, cleared on logout, active-course switch or support-language change. Cancel pending requests on these changes so responses from the previous course cannot populate the new course cache.
- `quest-controller.ts` loads a graph on approach and prefetches the current and next node's sentences only.
- Journal, word atlas, evidence board and course screens page through the API; counts come from the server. Course selection activates one course and restores that course's saved progress, story slots and player location.
- No `web/src/data` learning content is imported by Vite any more. `check-budgets.mjs` gets a hard main-chunk ceiling.

### 2.6 Stays static

World scenes, navigation, scenery geometry, character kit, portraits, audio manifests, Phaser atlases and UI strings (`tr-ui.json` and the German UI support added for the English course). They are presentation, the renderer needs them synchronously, and they carry no course value.

---

## Part 3 — More target languages than German

### 3.1 What is German-specific today

- **Field names.** Every sentence, choice, exercise and NPC line uses `german` / `english` as property names (114 `.german` reads in `web/src`), and 60 hardcoded `lang="de"` attributes.
- **Grading.** `server/attempts.go` and its fixtures apply umlaut keyboard fallbacks (`ae/oe/ue`), German noun capitalisation and formal *Sie* capitalisation.
- **Lexicon shape.** Articles, article forms, plurals and `surfaceForms` are built for German morphology.
- **Audio.** Dialogue clips and TTS voices (`scripts/tts/voices.json`) are German voices with German clip ids.
- **Story.** The three towns, the names, the Brass Office and the du/Sie rules in the story bible are German by design.
- **Support languages** are a separate concern. Extend the current `en` / `tr` layer with German support for the English course, including glosses, prompts, hints, feedback, explanations and interface strings. Support-language choices must belong to the active course's declared support languages.

### 3.2 Target shape

Introduce a **course** as the top-level content unit: `{ id, target: "de", supportLanguages: ["en","tr"], title, grading: {...} }`. Everything in Part 2 hangs off a course id. An account may enrol in several courses, with one active at a time. Progress, story state, save slots and resumable player location are stored per course. Switching restores the selected course without resetting another course. Add authenticated course listing, enrolment and activation operations; activation verifies a supported language and returns the active course configuration and its saved state. Billing and trial access retain their existing account scope.

- **Rename fields** from `german`/`english` to `text`/`translations[lang]` as the content moves to the server (Part 2 already rewrites every reader, so this costs nothing extra now and a full second pass later). The `lang` attribute comes from the course's `target`.
- **Grading rules per course**, declared in content, not in Go: accepted keyboard substitutions (`ae→ä` for German, `c→ç`, `g→ğ` style rules for others), which capitalisation matters, which characters are ignored. `attempts.go` reads the course's rule set; the German set reproduces today's behaviour and the fixtures prove it.
- **Lexicon** keeps a generic core (`lemma`, `pos`, `meanings`, `forms[]`) with a per-course `morphology` block for language-specific fields (article/plural for German, gender for Romance languages, nothing for Turkish). Code reads the core; language-specific UI reads the block if present.
- **Audio** is keyed by sentence uuid and course, with one voice set per course in `voices.json`.
- **Story and world** are per course. A second language is a second course with its own graphs, towns and cast, reusing the engine, the renderer from 1.3, the API and the grading pipeline. Nothing in the engine should name a town or a character.
- **Word maps** (1.2) are language-neutral: authored source occurrences refer to target-language words, and target spans refer to the selected support-language translation.

### 3.3 Proof

Build one tiny **English** course (ten sentences, one graph, one unit, one voice) with **Turkish and German support** during Phase 3. Run the full flow in both support languages: enrol, dialogue with highlighting, one graded attempt, answer reveal after that attempt, and one restored word. Switch between the English and German courses and verify independent saved progress and story/location restoration. This is the acceptance test that German-specific paths no longer control the shared engine.

---

## Part 4 — Rollout

| Phase | Scope | Exit criteria |
| --- | --- | --- |
| **0. Content** (1–2 weeks, mostly translator time) | Word-map export/import/validator; maps authored for story graphs and narrative first, then course examples, expeditions, interiors. UUID map. | `npm run check` fails on a missing map; review sheets delivered to the available reviewers for each required language. |
| **1. Server store** (1 week) | Tables, dev JSON store, importer, `Curriculum` from store, course record, slug→UUID progress migration behind a flag. | Go tests pass against the store; dev and Postgres boot from `content.json`. |
| **2. Read API** (1 week) | Endpoints, course enrolment/activation, entitlements, limiters, ETags. | Locked → 404; over budget → 429; recursive assertions reject model-answer fields in content reads; first-attempt requirement enforced; cache validation cannot bypass course/account access. |
| **3. Client switch** (1.5 weeks) | Content client, `translated-sentence.ts` renderer, field renames to `text`/`translations`, per-course grading rules. Dialogue first, then journal/course/expeditions/interiors. Delete `data/*.json` content imports, `content.ts` arrays, `dialogue-translation.ts`, `story-glossary.ts`. Tiny English course with Turkish and German support as the proof. | Main chunk under budget; highlight tests pass over authored maps; Act I Turkish route checked by hand; English course completes the flow in both support languages; switching preserves separate progress; exact answers remain unavailable until the first recorded attempt. |
| **4. Hardening** | Staging burn-in with the trial flow, review 404/429 counts, tune budgets, remove the migration flag. | |

Implementation decisions:

- **Word maps are authored, not computed.** Nothing at runtime, on the client or the server, derives a match from text. No external service is involved at any stage.
- **Rename `german`/`english` during the content move**, not afterwards. Every reader is being touched anyway.
- **Fold the Turkish overlay into the content records.** A separate map keyed by German sentence is itself a full copy of the course and stops making sense once the server serves per-language records.

**Offline scope:** no feature needs to work offline. Completed conversations replay through the authenticated API with the same access checks. No persistent offline content cache is required.
