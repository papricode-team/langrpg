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
- `tr-course.json` — every A1–B1 lexicon gloss by lexeme id (with its English source), grammar guides, all authored exercises by id, and route titles/summaries by English source. An exercise's optional `options` map translates visible answer labels; its canonical answer and submitted values remain unchanged. Generated lexical exercises use shared templates rather than individual overlay entries.

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
- **Course** (required to be 100%): every A1, A2 and B1 word meaning, exercise prompt, hint, explanation and support answer label; all route titles/summaries and grammar guides. Generated recognition, listening and production exercises use glosses and shared Turkish templates (`i18n-lexical.ts`). Authored grammar, reading, listening, writing, checkpoint and reference-form exercises have source-checked overlays. Answer buttons show Turkish support text and submit the canonical values; German content stays German. Word cards translate inflection and part-of-speech labels. Review recall prompts use the selected support language.
- **Turkish-speaker notes** (“Türkçe konuşanlar için”): short contrastive notes in a few grammar guides — no grammatical gender/articles in Turkish; German verb-second vs Turkish verb-final order; *Sie/du* ≈ *siz/sen*; German case on articles vs Turkish case suffixes.

## 4. Coverage

Measured by `npm run i18n` (`scripts/i18n-coverage.mjs`), which also runs in CI and fails on incomplete course support, missing/stale story units, lost placeholders, inconsistent meanings or untranslated `t()` keys. The rounded figures shown in Settings live in `web/src/data/i18n/tr-coverage.json`; a test fails if they drift from the measurement (`npm run i18n -- --write` refreshes them).

| Area | Turkish | Required |
| --- | --- | --- |
| Story units (dialogue, variants, corrections, topics, choices, evidence, objectives, gate prompts, glosses, acts, clues, letters, lore, quest intros, NPC roles/greetings, resident lines, cinematics, grammar notes, guided replies, placement lines) | 1,732 / 1,732 (100%) | yes — build fails otherwise |
| Interface strings routed through `t()` | 864 / 864 (100%) | yes |
| A1 lexicon glosses | 811 / 811 (100%) | yes |
| All A1–B1 lexicon glosses | 3,283 / 3,283 (100%) | yes |
| Grammar guides (title, explanation, example meanings) | 39 / 39 (100%) | yes |
| Story-quest exercises (prompt, hint, explanation, meaning; includes the 18 gate exercises) | 126 / 126 (100%) | yes |
| Other course tasks (topic routes, including generated word practice) | 10,266 / 10,266 (100%) | yes |
| Course route titles and summaries | 405 / 405 (100%) | yes |

## 5. Known gaps

- **Not routed through `t()` yet** (their text stays English in the Turkish route): the café/market/detective/delivery mini-games (`activities.ts`, `activity-engine.ts`, `activity-stories.ts`), the ten coastal expeditions and their neighbourhood games (`expeditions.ts`, `expedition-games.ts`; the encounter panel is labelled “İngilizce destek”), interior rooms and their word cards (`interiors.ts`), and world-map labels inside the Phaser canvas (`world.ts`). Their chrome labels in `main.ts` are translated.
- **Server messages**: errors coming from the server (`toast(error.message)`) are English. Answer feedback is rebuilt locally from the same rules (`attemptFeedback`), so grading feedback is Turkish.
- **Highlighting**: Turkish rarely matches a gloss word exactly, so most taps show the gloss line without a highlight — by design (never a wrong highlight).
- **Changing the language reloads the page** so every pre-rendered screen repaints; progress is server-side. A change made offline is kept locally and pushed to the account on the next session.
- **World barks** (German speech bubbles) have no English today and get no Turkish either.

## Review needs

Everything Turkish here is machine-authored and needs a native-speaker pass. Run `node scripts/i18n-coverage.mjs --review > review.tsv` for a German / English / Turkish sheet of every story unit. Priorities:

1. **Address forms**: sen/siz follows the German du/Sie line by line (Voss: siz until b1-council-intro-9 “Sizin için de uygunsa, birbirimize sen diyelim.”; Ada: siz until a2-archive-react-8). “Herr Voss/Otto” → “Voss Bey / Otto Bey”; “Frau Berg” → “Berg Hanım”.
2. **Puns that only work in German**: Ada's alphabetical filing (a2-archive: U/Unterschrift, S/Schuld, N/Nachfolge, W/Wahrheit) keeps the German words with an explanation; the kettle that whistles “tomorrow's weather” (b1-atlas-intro-1, “dünün havasını ıslıkla çalıyor”); the clock/hour pun (b1-work story, “saat, saatleri büküyor”).
3. **The finale wording**: b1-atlas-intro-9 “Buna ilk hatam diyorum: Kimseye sormadım.” (*meinen ersten Fehler*).
4. **Suffixes on German words inside grammar notes** (“Ich brauche'den sonra”, “Wie'den sonra”, “siz'e karşılık gelir”) and the grammar terms chosen (Dativ ≈ “yönelme hâli” is only an approximation).
5. **Placeholder constructions** in the UI avoid suffixes on unknown names and read terse (“Bul: {name}”, “Yolculuk: {place}”, “İçeri gir: {place}”).
6. **Glosses for function words** with no Turkish equivalent (dass, ob, zwar, erst, sondern, zu, the articles) and the literal colour names in the character builder.
7. **Turkish-speaker notes** (a1-pronouns, a1-questions, a1-nouns, a1-accusative, a1-dative, a2-perfect): check accuracy with a German teacher.

## Notes for maintainers

- Adding or changing a German line makes `npm test` and `npm run i18n` fail until the Turkish entry in `web/src/data/i18n/tr-story.json` is added or updated (the stored `de` source must match).
- New interface text: wrap it as `t('English text', { vars })` with a literal string and add the Turkish to `tr-ui.json`.
- Course authoring: update `scripts/turkish-course-texts.json` and the source-checked lexicon/grammar entries, then run `node scripts/sync-turkish-course.mjs`. Missing source translations stop the refresh. Run `npm run i18n -- --write` to refresh the Settings figures. Tests visit every A1–B1 task, verify localized feedback/options, and require complete coverage while keeping grading values intact.
- Use `upper()`/`lower()` from `i18n.ts` for support text; never `toUpperCase()`.

## Findings outside scope (not changed)

- `cinematic-content.ts` recording beat: “Ich höre Sie” — capital *Sie* reads as formal “you”; if “I hear her” was meant it should be *sie*. Turkish follows the German as written (“Sizi duyuyorum”).
- Several imported English course glosses name a rare or wrong sense, e.g. *Quittung* “comeuppance”, *ausfallen* “to sortie”, *Stift* “pin”, *Aufzug* “winding”, *Eintritt* “occurring”, *zwar* “namely”, *billig* “appropriate, fair”. The Turkish glosses use the common learner sense.
