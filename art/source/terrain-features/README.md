# Painted terrain style pass — 2026-10-17

The current 15 PNG masters are selected built-in `image_gen` repaints for finding 2 of `docs/visual-style-review.md`. `style-review.json` records each selected generation and the exact sibling `*-style-prompt.txt`. The earlier `generation.json` remains the original generation history.

The café painting and the approved `quay-straight.png` repaint define the warm sandstone/cream, terracotta repairs, olive moss and upper-left golden light. The timber landing uses honeyed oak. Existing canvas sizes (1254 × 1254), road connections, deck registration and traced geometry were retained so authored crossings continue working. The edit prompts explicitly retain the elevated three-quarter game camera and all transparent openings.

These feature IDs are shared, with no town-aware renderer selection. The warm Lindenhafen set is therefore the default, also compatible with Waldruh's pale stone. Nebelstadt still needs explicit coastal variants and town-aware selection if its quays must remain wet slate. No world placements or collision data were edited.

Export: `node scripts/prepare-terrain-features.mjs --art-only`. Check: `node scripts/check-terrain-features.mjs`. The asset-only flag avoids writing the shared generated JSON catalogue; omitting it retains the normal exporter behaviour. Runtime WebPs retain generated alpha and native dimensions. Comparison: `docs/audits/visual-style/terrain-after-features.jpg`.
