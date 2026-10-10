# Turkish → German route

Status: implemented on the `worktree-agent-a861b482cca271d88` branch. The Turkish text is **machine-authored** (written by an AI model, Claude) and has **not** been reviewed by a native speaker. Nothing here is certified; see [Review needs](#review-needs).

## 1. Requirement

A learner can choose the **base language** (the language that supports German) as English or Turkish. With Turkish selected, Turkish replaces English wherever English supports the German today: sentence meanings, word glosses, hints, explanations, objectives and interface text. The German itself, the voiced audio, placement, scoring, scheduling and server grading do not change.

## 2. Design

### 2.1 Setting and persistence

- `baseLanguage: 'en' | 'tr'`, default `en`.
- Chosen on the first-run screen next to the player name (“I speak: English / Türkçe”) and later in **Menu → Settings**.
- Server: `Account.preferences.baseLanguage` in the account document (JSON file store and PostgreSQL JSONB). Missing/unknown values normalise to `en`, so existing saves load unchanged and no SQL migration is needed. `POST /api/session` accepts an optional `baseLanguage` for a new account and returns `preferences` with every session; `POST /api/preferences` updates it. Grading code never reads it.
- Client: cached in `localStorage['atlas.baseLanguage']` so the right language paints before the session resumes; the server value wins once the session arrives.

### 2.2 One i18n layer — `web/src/i18n.ts`

All support-language decisions go through one module instead of conditionals scattered across views:

| Helper | Use |
| --- | --- |
| `baseLanguage()` / `setBaseLanguage()` | current support language; sets `<html lang>` so CSS `text-transform` applies Turkish casing rules (i → İ) |
| `t(english, vars?)` | interface chrome. The English string is the key (gettext style), `{name}` placeholders are filled after lookup |
| `localized(value)` | content with an `english` field. `{german, english}` looks up the Turkish meaning **by its German sentence**; a bare English content string (titles, objectives, gate prompts, glosses) looks up by its English source |
| `lexemeMeaning(word)`, `localizedExercise(ex)`, `localizedGrammar(guide)` | course overlays keyed by lexeme / exercise / guide id |
| `upper(text)` | `toLocaleUpperCase('tr')` when Turkish is active — never the locale-blind `toUpperCase()` |
| `supportLang()` | `lang` attribute for support text (`en` or `tr`) |

Every lookup falls back to the English source if the Turkish string is missing; nothing throws. Misses are counted (`missingTranslations()`) for the dev/test report.

### 2.3 Overlays, never edits

English data files stay canonical. Turkish lives in `web/src/data/i18n/`:

- `tr-story.json` — `{ "<unit id>": { "de" | "en": <source>, "tr": <Turkish> } }`. Unit ids are stable (`dialogue:<line id>`, `choice:<quest>:<choice id>`, `topic:<quest>:<topic id>`, `evidence:<quest>:<object id>`, `clue:<quest>:letter:<n>`, …). Sentence units record the **German** source, text units their **English** source.
- `tr-ui.json` — `{ "<English UI string>": "<Turkish>" }`.
- `tr-course.json` — lexicon glosses by lexeme id (with the English gloss they translate), grammar guides and story-quest exercises by id.

Why the source text is stored next to each translation: `scripts/i18n-coverage.mjs` and `web/src/i18n-coverage.test.ts` enumerate every story unit from the live data (`web/src/i18n-units.ts`) and **fail** when a unit has no Turkish entry, or when its stored source no longer matches the current German/English (the story changed and the translation is stale). Turkish cannot silently rot. The same check verifies `{name}` placeholders, that identical German sentences have one Turkish meaning, and that every `t('…')` key in the source has a Turkish entry.

At runtime the story overlay is indexed by source text, so consumers call `localized(line)` without threading ids.

### 2.4 Lazy loading

The overlay is one dynamic-import chunk (`i18n-tr`). English players never download it. Turkish players load it before the shell paints (cached choice) or immediately when they switch.

### 2.5 Word glosses and highlighting

The English route highlights the tapped German word's English gloss inside the full English sentence. Turkish is agglutinative (`lamba` → `lambayı`, `kitap` → `kitabı`), so a gloss rarely matches a whole word. The Turkish route therefore:

1. always shows the tapped word's gloss on its own line (Turkish if available, otherwise the English gloss, marked `lang="en"`);
2. highlights inside the Turkish sentence **only** on an exact whole-word match of the Turkish gloss; English-specific heuristics (articles, *möchte → would like*, *Sie → she/they*) are disabled;
3. otherwise shows the sentence without a highlight. It never highlights a guess.

### 2.6 Learning evidence

Assistance is recorded where it was before: revealing a meaning (“What did they say?”), tapping a word, the hint, the grammar note and the exact answer all call the same `hint()`/`expose()` paths regardless of language. The base language never enters attempt payloads, so server grading and FSRS scheduling are identical.

### 2.7 Fonts

Fraunces and DM Sans were imported as the `latin` subset only, which lacks `ğ Ğ ş Ş İ` (it has `ı ç ö ü`). The imports now use the combined fontsource weight files, which declare both `latin` and `latin-ext` with `unicode-range`, so the latin-ext file is fetched only when such a glyph is on screen.

## 3. What is translated

Coverage figures are produced by `node scripts/i18n-coverage.mjs` (see §4).

- **Story** (required to be 100%, enforced): every dialogue line, simpler A1 variant and reply correction; topic questions and answers; choices; evidence texts; objectives and gate prompts; introduced words and line glosses; act texts; clue titles, texts and leads; Elise's letters; object lore; quest introductions, titles and objectives; NPC roles and greetings; resident greetings, callbacks and title greetings; cinematic captions (shown as Turkish subtitles under the German); contextual grammar notes; guided A1 gate replies.
- **Interface**: every string routed through `t()` (HUD, menu, settings, first run, dialogue tools, quest log, discoveries, journal, toasts, exercise/review chrome). Surfaces not yet routed through `t()` are listed in §5.
- **Course**: all story-quest exercises (prompts, hints, explanations, meanings — including the 18 gate exercises); all grammar-guide titles, explanations and example meanings; Turkish glosses for the A1 lexicon and the story vocabulary. Other course text falls back to English with a note in Settings: “Turkish support covers the story and A1 basics; other course text is still English.”
- **Turkish-speaker notes** (“Türkçe konuşanlar için”): short contrastive notes in a few grammar guides — no grammatical gender/articles in Turkish; German verb-second vs Turkish verb-final order; *Sie/du* ≈ *siz/sen*; German case on articles vs Turkish case suffixes.

## 4. Coverage

See the final numbers recorded at the end of this file (generated by `node scripts/i18n-coverage.mjs`).

## 5. Known gaps

See the end of this file.

## Review needs

See the end of this file.
