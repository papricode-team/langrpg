# Painted world UI

Built-in imagegen produced the selected masters. Exact prompts and reference paths are in `world-ui.txt`, `world-threshold.txt` and `world-ring.txt`. The initial sheet supplied the wood/brass plate and parchment. Its floor-painted threshold and heavy metal ring were rejected; the two separate masters replace them.

Runtime derivatives preserve alpha and use WebP quality 88 / alpha quality 100 (threshold: quality 85). From the 1254 × 1254 `world-ui.png`, extract the plaque at `(10,300,625,230)` and parchment at `(640,250,614,300)`, then trim with Sharp threshold 5. The ring is trimmed with threshold 5, resized to width 480 without enlargement, and padded with 16 transparent pixels on every side. The threshold is resized to 512 × 160. No generated lettering is used; Phaser overlays the loaded web fonts.

`world-ui-proof.png` is a deterministic contact sheet of the actual runtime WebPs over the town shadow colour `#4f5b53`, plus parcel, book and scissors cropped from the existing `items-2` atlas. It is an asset inspection proof, not a live game screenshot. All selected masters and runtime derivatives were viewed before acceptance.

## Interaction prompt v2

NPC talk prompts now use `world-prompt-v2-keycap.png`, `world-prompt-v2-tab.png`
and `world-prompt-v2-touch.png`. The generated masters retain genuine alpha and
have no baked lettering. Exact built-in imagegen prompts and the five attached
style references are recorded in their adjacent `.txt` files. Three directions
were compared first in `world-prompt-v2-contact.png`; the separate ivory keycap
and parchment tab won for contrast and restraint. The final brass trim is simpler
than the concept sheet so it survives reduction.

Run `node scripts/prepare-world-prompt-v2.mjs` for the narrow, independent export:
Sharp trim threshold 5, Lanczos3, 48 × 48 keycap/touch and 144 × 48 tab, WebP
quality 92 / alpha quality 100. These cover a 24 CSS px row at 2× density.
Phaser measures the 12 px DM Sans verb and fits the tab to that width plus 8 px;
the key shrinks from 24 to 14 px when needed, keeping the 12 px letter. Smaller character frames use two
rows above the name, preserving the font floor. `world-prompt-v2-proof.png`
shows the real runtime pieces over town art at desktop/phone scale, with a player
standing directly below the NPC. Its recipe is `scripts/proof-world-prompt-v2.mjs`.

The old wood `world-prompt.webp` is retired from NPC interaction prompts but is
retained and loaded for `cutscene.ts`'s existing “Enter · Weiter” control.
The original `world-ui.png` master and historical proof also remain provenance.
Doors and objects have separate name labels and did not use the NPC plaque.
