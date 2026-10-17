# Ground dressing style pass — 2026-10-17

`detail-grass-tuft.png` and `detail-wildflowers.png` are built-in `image_gen` repaints matching the café's painted foliage and the terrain's upper-left warm light. Exact prompts are sibling `*-style-prompt.txt` files; selected generation names are in `style-review.json`. Existing catalogue IDs, dimensions, placement scale and procedural sway remain available to authored scenes.

These two noncollidable botanical objects explicitly retain their published root pivot and visual registration in `requests.json`, rather than shifting placement because a few antialiased leaf pixels changed during repainting. The exporter now accepts an authored `originY` override, with its previous automatic bottom-pixel pivot as the default for every other object.

The library already contains ferns, mossy river stones, reeds and mushrooms. Reuse these with the repainted grasses and flowers in small asymmetric clusters; keep walking and doorway space clear. No new IDs were needed, and no live-world data was changed. Dense lawn composition still needs an authorised world-authoring pass.

Export: `node scripts/prepare-terrain-objects.mjs --art-only`. Check: `node scripts/check-terrain-objects.mjs`. The flag avoids changing the shared JSON catalogue; normal catalogue export is unchanged. Comparison: `docs/audits/visual-style/terrain-after-dressing.jpg`.
