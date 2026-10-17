# Interior art sources

Original assets generated with the built-in ImageGen tool for glotworld.
Each object sheet has four animation frames across and six object rows down.
Companion `*-prompt.txt` files record the exact generation prompt.
The export script preserves native alpha and a shared crop/pivot per sequence.

`interior-effects.png` is a separate ImageGen sheet containing four steam frames
and four flame frames on native alpha. Its exact prompt is saved alongside it.
The renderer holds furniture and indoor resident poses steady and blends only
these detail overlays, avoiding drift in the original generated rigid geometry.
`scripts/prepare-interior-effects.mjs` exports the new effects with shared emitter
anchors; `scripts/prepare-interior-art.mjs` also invokes it.

`interior-proportioned.png` contains six corrected static fixture sprites: bakery
counter, café table/chairs, pastry display, grocery checkout, oven, and scales.
Its companion prompt records the human-scale proportions. The still exporter
uses inspected row boundaries and native alpha, keeping countertop goods small
and floor pivots aligned with the room geometry.

`train-carriage-night.png` is the prologue's walkable room: one top-down glass carriage in the café's camera, with the compartment, washroom door, dining counter and carriage door baked into the band behind the aisle. `train-carriage-dawn.png` is a pixel-aligned image edit of the same frame relit for morning; the room crossfades to it in the last beat. Both were generated with Codex image generation from the prompts beside them. `node scripts/prepare-prologue-art.mjs` exports them.
