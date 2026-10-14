# Server content authoring

`source.json` is the imported German authoring source, including private grading inputs and support text. `english-proof.json` is the small English course with Turkish and German support. Neither file enters the browser build.

Build the records with `node scripts/build-content.mjs`. The build writes `server/content.json`, the committed `content_ids.json` identity catalog and stripped presentation geometry. Existing catalog UUIDs are preserved. Dialogue nodes and choices use quest-scoped keys because their old names repeat across quests.

`published-content-ids.json` preserves the earlier published catalog as compatibility aliases. The bundle carries this map unchanged so the server can restore saved references without replacing current UUIDs. Keep both catalogs across rebuilds. Interior conversations and word-detail examples are captured in `source.json` and exported as scoped contexts; conversation reads load one node and its choices at a time.

## Word-map review

1. Run `node scripts/word-map.mjs --export` to refresh `word-map-review.tsv`.
2. Review each source occurrence and fill the support-language `*_words` cells. The cells contain JSON arrays of `{source:{text,occurrence},targets:[{text,occurrence}]}`. Occurrences are one-based and case-sensitive. Select complete words or phrases, never substrings. Several target spans may represent one source word. Use `targets:[]` only when that particular occurrence has no translated counterpart.
3. The English column may contain conservative exact-span suggestions. These are drafts and do not imply review. Keep untouched rows out of a partial import, and blank the `*_words` cells for languages you are not reviewing. Every populated alignment column must cover the row's complete `required_words` list; incomplete exported suggestions are also validated. A blank alignment cell skips that language and preserves any previously imported map, while missing maps remain missing.
4. Keep the source and existing translated text unchanged. If either changes, update the authoring source and export again; stale sheets are rejected. A missing translation can be supplied in its blank language text column together with its complete map.
5. Run `node scripts/word-map.mjs --apply reviewed.tsv`, then build again. The importer validates the entire input before writing. `reviewed_by` signs off the whole sentence, so supply it only after every support language for that row has received native-speaker review. Leave it blank for partial language imports; the imported sentence remains pending. Rows with no populated alignment cells are untouched, including their existing review status.
6. Run `npm run content:check` before release. Every sentence also requires an actual reviewer recorded in `reviewed_by`. Missing translations, missing source occurrences and stale ranges fail this check. `--check --allow-pending` checks the structural validity of a draft during implementation, and is not a release check.

`authored-maps.json` contains selected acceptance cases, including Turkish ticket inflections, English split “Would”/“like”, repeated pronouns and explicit no-counterpart words. The English proof's ten sentences also have authored maps. All initially authored content remains pending native-speaker review. The rest of the inventory remains explicitly incomplete until the reviewers return maps; missing entries have never been replaced by blanket empty targets.

Ranges are compiled in UTF-16 offsets. Placeholder personalization changes offsets by substitution edits without rematching words. Keep the authored selectors and unchanged source strings together so the compiler can detect stale content.

## Verification

`node --test scripts/word-map.test.mjs scripts/content-runtime-plugin.test.mjs` checks the review round trip, exact occurrence selectors, range substitutions, authored acceptance cases, course proof and production browser transformations. Production transforms replace authoring banks with authenticated runtime registries, preserve static presentation anchors and replace legacy learning references with committed UUIDs. Authoring tests still use their original source fixtures.

`scripts/content-snapshot.mjs` is a legacy importer. Normal rebuilds use `content/source.json`; rerun the importer only when deliberately incorporating a change to the retained legacy authoring files.

## Course voices

The English proof currently uses browser speech synthesis with its `en-GB` course voice configuration. An optional English teacher voice set is declared in `scripts/tts/voices.json`; no authored English recordings or voice reference clips were generated in this implementation. The local Qwen pipeline accepts canonical `{clipId: sentence UUID, speaker, text, courseId}` jobs with `--course english`, keeps that course's references and clips separate, and retains the existing German commands and asset paths. Run `python3 scripts/tts/qwen_tts.py --course english --jobs english-jobs.json --dry-run` to validate the plan without loading models. See `scripts/tts/README.md` for generation and voice-review steps.

## Imported alignment drafts

`imported-alignment-drafts.json` converts the historical 9a83d89d token-index corpus into exact occurrence selectors. The builder accepts only unchanged source text and matching support text; explicit historical translation overrides apply to their attested authoring slugs. Existing locally authored maps and acceptance fixtures take precedence. Unsupported token formats remain in its `rejected` reviewer-input list.

The original cache, review TSV and translation sources are preserved under `imported-drafts/9a83d89d/`. Historical `reviewed` fixtures are test provenance, not named native-speaker approval. Every imported entry remains pending native review, and `content:check` still requires actual sentence-level signoff. `scripts/import-alignment-drafts.mjs` performs the mechanical conversion without calling a model or changing text.
