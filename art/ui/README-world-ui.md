# Painted world UI

Built-in imagegen produced the selected masters. Exact prompts and reference paths are in `world-ui.txt`, `world-threshold.txt` and `world-ring.txt`. The initial sheet supplied the wood/brass plate and parchment. Its floor-painted threshold and heavy metal ring were rejected; the two separate masters replace them.

Runtime derivatives preserve alpha and use WebP quality 88 / alpha quality 100 (threshold: quality 85). From the 1254 × 1254 `world-ui.png`, extract the plaque at `(10,300,625,230)` and parchment at `(640,250,614,300)`, then trim with Sharp threshold 5. The ring is trimmed with threshold 5, resized to width 480 without enlargement, and padded with 16 transparent pixels on every side. The threshold is resized to 512 × 160. No generated lettering is used; Phaser overlays the loaded web fonts.

`world-ui-proof.png` is a deterministic contact sheet of the actual runtime WebPs over the town shadow colour `#4f5b53`, plus parcel, book and scissors cropped from the existing `items-2` atlas. It is an asset inspection proof, not a live game screenshot. All selected masters and runtime derivatives were viewed before acceptance.
