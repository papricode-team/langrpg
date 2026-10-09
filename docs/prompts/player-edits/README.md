# Hair and face edits of the registration master

New head options must be edits of `art/source/player-edits/base.png`, an exact
copy of `art/source/player-customizations/motion.png`. Their poses, head size,
body proportions and nine-column, four-row grid must match that master. Each
row faces down, right, up or left; column zero is standing and columns one
through eight share the walking sequence. The lower-body walking revision
uses the same final grid; its sources and rebuild procedure are documented in
[walk-README.md](walk-README.md).

The current prototype uses the master's own head with a bald option or one
long-waves hair overlay. Its head skin and hand skin share the same luminance
reference of 180 and are combined into `body-skin` before any downsampling.
Merging the same material preserves the original skin contour and avoids an
artificial neck seam caused by independently filtering and overlaying separate
skin masks. Neutral facial detail remains in `head-detail`; the body recipe
also includes separate jacket and trouser detail and fabric layers. All layers
share the same painted origin, frame and unchanged width. Face and build
selectors are hidden while replacements are developed. The earlier donor
face and hair library is withheld; it is not an approved larger catalogue.
Face variants and different builds still need their own matching painted
edits or masters.

The built-in ImageGen tool is available for this workflow; no API key is
needed. Use an image edit of the actual base sheet with the mask as its edit
region guide. Hair must be painted muted violet purple, including highlights
and shadows. The extractor separates that keyed paint from skin and coat,
then the player's chosen hair colour replaces the key in game.

1. Rebuild the body with `node scripts/prepare-player-layers.mjs`, then run
   `node scripts/finalize-player-layer-assets.mjs`. This writes the smaller
   runtime body sheets and preserves their full-size editor sheets.
2. Run `node scripts/prepare-player-head-edits.mjs kit` to write `base.png`,
   `mask-short.png` for styles ending near the jaw and `mask-long.png` for
   styles reaching the shoulders or back. Alpha masks are transparent where
   editing is allowed; `-bw` copies are white where editable and black where
   protected.
3. Edit `base.png` using the relevant guide and prompt. Preserve the exact
   1536×1024 dimensions and real transparency. Save the unmodified ImageGen
   result separately as `art/source/player-edits/hair-<id>-candidate-1.png`.
   The selected long-waves prompt is preserved in `waves-imagegen.txt`.
4. Lock the master's original art with
   `node scripts/lock-player-hair-edit.mjs art/source/player-edits/hair-<id>-candidate-1.png art/source/player-edits/hair-<id>.png`.
   This script starts from the original base RGBA pixels and copies only
   eligible violet hair paint inside the permitted head regions. Repainted
   faces, clothing and background from the raw candidate are excluded.
   Every other source pixel remains exactly the original base pixel. Keep
   both the raw candidate and this derived locked sheet for provenance.
5. Validate without exporting with
   `node scripts/prepare-player-head-edits.mjs --check --input art/source/player-edits/hair-<id>.png --id hair-<id>`.
   Use `--reach short` when checking against the short edit region. The check
   rejects a resized grid, excessive protected visible-pixel drift and empty
   or detached extracted hair in any of the 36 frames. It reports validation
   results without changing assets.
6. After the locked sheet passes validation and visual review, run
   `node scripts/prepare-player-head-edits.mjs`. It extracts the original
   master head and the validated `hair-<id>.png` sheets using the body's exact
   per-frame transform. It merges the head and hand skin at full editor
   resolution, then writes `body-skin`, `head-detail` and hair in both 64×96
   runtime cells and 128×192 editor cells to
   `web/public/assets/player-layers/`. A rejected edit emits no assets. Do not
   run the finalizer again for these sheets.

Run `node --test scripts/prepare-player-head-edits.test.mjs` for validation
coverage, then inspect assembled overlays in all four standing directions and
through every walk frame before exposing another style. The current generated
candidate and locked `hair-waves.png` demonstrate this edit-and-lock process;
they do not establish that a full customization library is finished. The
walking leg revision has separate source boards and visual checks. Registering
unrelated donor heads onto the master is no longer the
active head workflow.

## Prompt template (`hair-waves`)

Edit this sprite sheet. Keep every figure, pose, body, face, jacket, shirt,
trousers, boots, position, scale, lighting and the transparent background
exactly as they are. Only inside the masked area around each head, add
long loose wavy hair reaching the shoulder blades to this same bald
character, in all 36 cells, consistent from cell to cell: front view in row 1,
right profile in row 2, back view in row 3 (the hair covers the back of the
head and falls over the upper back of the jacket), left profile in row 4. The
hair follows each head exactly and sways slightly with the walk. Paint all
hair in muted violet purple, including shadows and highlights, with the same
warm hand-painted rendering and upper-left light as the figure. Do not
change the face, neck, ears' position or head size. No hats, no props, no
background, no grid lines.

For other styles, replace the hair description and use `mask-short.png` for
styles that stop above the collar (crop, buzz, pixie, bob, coils). These are
future edits to create and review, not currently selectable catalogue entries.
