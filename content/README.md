# Server content authoring

`source/` is the private, editable authoring corpus. It includes the original
TypeScript quest, resident, interior and expedition content, the complete course,
and its Turkish translations. Nothing here is a browser import.

`node scripts/export-content.mjs` builds `server/content.json`. The committed
`content_ids.json` maps `kind:slug` to an opaque UUID v4. Keep this map across
rebuilds; deleting entries would invalidate saved references. Public record
bodies use UUID references, while the separate private `grading` index retains
the existing grading identifiers for migration and grading compatibility.

`node scripts/align-content.mjs --check` is the strict rollout gate: a missing
authored alignment fails it. `--check --allow-pending` validates the completed
subset while the migration is in progress, and reports the remaining backlog.
It must not be described as complete corpus coverage.

`node scripts/align-content.mjs --author-templates` authors lexical labels from
the explicit lemma-to-meaning relation in the original source. It handles only
the exact lemma or its authored article form, and never derives a match from an
arbitrary sentence. `--review` writes `review/alignment.tsv` with indexed tokens,
alignment pairs, and explicit omissions for the native-speaker review.

For sentence authoring, the optional Codex build adapter supports `--propose
--codex /path/to/codex --batch-size 12 --filter story --limit 24`. It uses the
existing Codex login and accepts JSON index pairs, never text changes. A batch
is mechanically validated before it is saved. Run this only when transmission
of the authoring content through Codex is permitted. `--proposals file.json`
imports the same JSON format without calling a model. Without `--accept`, the
result remains a proposal and is never used for highlighting. Accepted Codex
and template alignments are `authored`, with `nativeReview: pending`; the TSV
pass remains a separate human review. The known regression fixtures are
committed in `alignments/fixtures.json`.

Alignment hashes include the unchanged German, English and Turkish text.
Changed text invalidates the cache and returns the line to `pending`. The shared
tokenizer emits UTF-16 offsets; punctuation, emoji and combining marks keep
their original positions. Runtime clients consume these offsets directly.

Verify the build with `node --test scripts/content-alignment.test.mjs
scripts/export-content.test.mjs`.
