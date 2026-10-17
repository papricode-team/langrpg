# Ground dressing style pass — 2026-10-17

`detail-grass-tuft.png` and `detail-wildflowers.png` are built-in `image_gen` repaints matching the café's painted foliage and the terrain's upper-left warm light. Exact prompts are sibling `*-style-prompt.txt` files; selected generation names are in `style-review.json`. Existing catalogue IDs, dimensions, placement scale and procedural sway remain available to authored scenes.

These two noncollidable botanical objects explicitly retain their published root pivot and visual registration in `requests.json`, rather than shifting placement because a few antialiased leaf pixels changed during repainting. The exporter now accepts an authored `originY` override, with its previous automatic bottom-pixel pivot as the default for every other object.

The library already contains ferns, mossy river stones, reeds and mushrooms. Reuse these with the repainted grasses and flowers in small asymmetric clusters; keep walking and doorway space clear. No new IDs were needed, and no live-world data was changed. Dense lawn composition still needs an authorised world-authoring pass.

Export: `node scripts/prepare-terrain-objects.mjs --art-only`. Check: `node scripts/check-terrain-objects.mjs`. The flag avoids changing the shared JSON catalogue; normal catalogue export is unchanged. Comparison: `docs/audits/visual-style/terrain-after-dressing.jpg`.

## Town planting pass 2 — 2026-10-17

Seven native 1254 × 1254 transparent built-in ImageGen masters extend this family:
`town-linden`, `town-plane`, `town-boxwood`, `town-hedge`, `town-ivy`,
`town-garden-statue`, and the walkable ground-layer `town-radial-cobble`.
Exact prompts are sibling `*-prompt.txt` files; `town-pass-2.json` records the
selected generation filenames, references and the rejected clipped ivy result.
Existing cypress, rose arches and flower planters are reused rather than duplicated.

Export with `node scripts/prepare-terrain-objects.mjs` (catalogue included).
`originY` is the physical foot pivot for standing objects and the centre of the
radial inlay. Exported visual bounds use that same pivot. The two new trees use
small trunk footprints, not canopy-sized obstacles. The hedge has an authored
masonry footprint; mirroring a placement mirrors its wall as well.

Check with `node scripts/check-terrain-objects.mjs
--report=docs/audits/visual-style/town-after-object-check.json` on one line.
`node scripts/check-town-style.mjs` checks the seven new exports' 2 MB budget
and completely clear alpha boundaries, then draws the current seed offline.
It accepts `--before <world.json>` for a composition comparison and identity,
other-town, bridge and canal-weight invariants. Evidence and limitations are in
`docs/visual-pass/town-2.md`. Existing LFS patterns already cover every new master.

## Lindenhafen variety pass (2026-10-17)

`town-chestnut`, `town-birch` and `town-beech` add horse chestnut candle blossoms,
silver birch bark and a restrained copper-beech accent. All are native
1254 × 1254 transparent built-in ImageGen paintings, with exact sibling
`*-prompt.txt` files and selected references recorded in `variety-pass-4.json`.
They use the linden's 158.72 world width and exact trunk-only footprint. Native
root-bottom alpha determines their standing pivot, as for the existing trees.
Each catalogue request and all 43 seed trees explicitly use `motion: still`.
Export only the additions with:

```sh
node scripts/prepare-terrain-objects.mjs --only=town-chestnut,town-birch,town-beech
```

The renderer currently gives the `tree` role a small sway even when `motion`
is `still`; see `docs/visual-pass/variety-4.md` for that out-of-scope integration
issue. No animated frames or procedural detail sway were added to these assets.
