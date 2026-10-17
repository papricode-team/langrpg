# Interaction prompt v2

2026-10-17. Completed non-interactively with generated art, offline composites and
local checks. No browser/server, git commands, commits, stash, LFS commands or
`npm run verify/assets/ci/art` were used.

## Exploration and decision

Read `AGENTS.md`, `docs/style/art-direction.md` and `art/ui/README-world-ui.md`
before implementation. Viewed the target painting and all five attached style
references: target art direction, round-button-v1, nameplate-v1,
parchment-card-v1 and lindenhafen-props.

Built-in imagegen first produced [three directions](../../art/ui/world-prompt-v2-contact.png):

1. Separate round ivory/brass keycap and pale parchment tab.
2. Parchment speech-bubble tag with a keycap attached to its left edge.
3. Integrated enamel/brass pill with a green key inset.

Chose direction 1. Its quiet cream centre gives dark text the best contrast;
separate pieces let the verb fit its measured width and allow the key to change
to a touch icon. The speech-bubble tag added a competing tail and the integrated
pill had a heavier green/brass silhouette. Final generations simplified the
sheet's stars, beading and corner fittings to avoid visual noise at small size.
No final sprite contains generated letters or writing. The final touch asset
has a brass speech-bubble outline with an empty centre.

## Behaviour and sizing

- The prompt is a separate scene-level container at
  `worldDepth(worldHeight + 100, 'label')`. A depth on a child of the NPC root
  would still allow foreground characters/scenery to cover it.
- It follows the NPC in world space, above the name's full text canvas with a
  4 CSS px gap. The objective diamond moves beside the name. The role caption
  remains at the feet and is no longer replaced by the prompt.
- The normal row is 24 CSS px tall. `density / zoom` keeps dimensions stable
  while the camera changes. DM Sans “Sprechen” is 12 CSS px, title case, with
  no wrapping, fixed-width canvas, mask or clipping. The tab width is the
  measured text width rounded up plus 8 px of padding.
- The side-by-side footprint stays within about 1.2× the NPC sprite's untrimmed
  frame width in CSS pixels. The key fits between 14 and 24 px (its 12 px E has
  an approximately 8 px painted glyph). A 72 px adult in a short desktop viewport
  still gets a 24 px row. At the proof's
  80 px desktop adult size the row is approximately 87 × 24 px. The sprite's
  transparent frame footprint is the sizing reference, not its narrow painted
  torso: an eight-letter 12 px word cannot fit within a painted torso's width.
- For narrow frames (phone camera and children), preserving
  readable text and the width limit takes priority over a single row. The key
  stacks above the tab: the 60 px phone adult proof uses 62 × 50 px, with a full
  24 px touch icon. This is
  deliberate; there is no font reduction or text clipping.
- Keyboard shows the live alphabetic interaction binding, E today. The gamepad
  API exposes standard button index 0 but no button-label/glyph abstraction, so
  it uses the permitted E fallback. `mobileCamera` selects the speech icon and
  removes the letter. Pointer interaction still uses the existing NPC hit area.
- Only `nearbyInteraction` or a hovered NPC gets a prompt. Focus changes fade
  linearly over 120 ms; reduced motion snaps. Conversation, cinematic, watching,
  terrain-only, editor, disabled-control, unrevealed and culled states hide it.
  Clearing controls hides detached prompts synchronously, including when the
  scene pauses before another frame. Destroying an NPC root destroys its prompt.
- Doors and objects already use separate title labels, with no matching plaque
  to replace; their labels remain as authored.

The old wood plaque is retired **from NPC prompts**. Repository-wide search found
one remaining production consumer: `cutscene.ts`'s “Enter · Weiter” control.
Accordingly `world-prompt.webp` and `WORLD_UI.prompt` remain for that control.
The shared loader's load-once reservations and retry behaviour are preserved.

## Files and provenance

- `art/ui/world-prompt-v2-contact.png` and `.txt`: initial comparison and exact prompt.
- `art/ui/world-prompt-v2-{keycap,tab,touch}.png` and adjacent `.txt`: untouched
  generated masters, exact prompts and the five attached references in order.
- `.gitattributes`: explicit `art/ui/world-prompt-v2*.png` LFS rule, including proof.
- `web/public/assets/ui/world-prompt-v2-{keycap,tab,touch}.webp`: runtime exports.
- `scripts/prepare-world-prompt-v2.mjs`: independent export and alpha/budget checks.
- `web/src/world-prompt.ts` and `.test.ts`: pure layout, variant, label depth and fade.
- `web/src/explore-scene.ts`: attachment, placement, text and visibility lifecycle.
- `web/src/world-ui.ts` / `.test.ts`: new texture keys and reservation coverage.
- `web/src/explore-scene-restart.test.ts`: prompt visibility, name clearance,
  touch selection and synchronous clearing regression coverage.
- `art/ui/README-world-ui.md`: active prompt export recipe and legacy-asset status.
- [Offline proof](../../art/ui/world-prompt-v2-proof.png), its adjacent `.txt` and
  `scripts/proof-world-prompt-v2.mjs`: reproducible composition recipe.

The proof combines a crop of the actual `lindenhafen.webp` town, two actual
component-kit character atlas frames, installed Fraunces/DM Sans font outlines,
runtime WebPs and the actual runtime layout helper. The player stand-in is Otto's
component-kit figure, labelled Alex. It stands directly below Marta and draws
over her lower body and the former feet-prompt position. Both keyboard and touch
prompts remain above the name. Alpha samples appear against cream and town-shadow
swatches. This is offline evidence, not a live screenshot. The final PNG was
inspected with the image viewer after generation.

## Checks and results

| Check | Result |
| --- | --- |
| `npm run check --workspace web` | PASS: TypeScript; UI type/layout budget (47 stylesheets); UI template budget (0 allowlisted legacy usages). |
| `npm run test --workspace web -- src/world-ui.test.ts src/world-labels.test.ts src/explore-scene-restart.test.ts src/world-prompt.test.ts` | PASS: 4 files, 28 tests. |
| Targeted ESLint on the six changed/new TypeScript files | PASS. |
| `node scripts/prepare-world-prompt-v2.mjs` | PASS: native alpha present, transparent exterior, opaque interior, all derivatives under 2 MB. |
| Keycap runtime | 48 × 48, 2,102 bytes. |
| Tab runtime | 144 × 48, 2,328 bytes. |
| Touch runtime | 48 × 48, 2,304 bytes. |
| `node scripts/proof-world-prompt-v2.mjs` | PASS: 1200 × 720 PNG; 80/60 CSS px adult scale; inspected. |
| Visual review | PASS: blank centres, crisp small-size forms, no writing artefacts or baked background; clean alpha on light/dark samples; full “Sprechen” and visible E; player cannot cover the prompt. |

Initial failures were corrected without reducing any font floor or changing a
budget:

```text
src/cutscene.ts(57,78): error TS2339: Property 'prompt' does not exist ...
```

The first implementation removed the legacy loader key before a wider search
found the cinematic consumer. Restored that key and retained the old asset.

```text
FAIL world-prompt.test.ts: expected 23.999999999999996 to be 24
```

The new CSS scaling assertion used exact floating-point equality. It now compares
at 10 decimal places; the required 24 px size is unchanged. The final suite passes.
Vitest also printed Node's existing experimental localStorage warning; it did
not affect the results.

```text
Sharp: Error: Image to composite must have same dimensions or smaller
```

The first proof recipe applied the final resize before compositing the 2× layers.
It now composites to a buffer at 2×, then downsamples. The initial proof also
revealed Fraunces lacked the diamond glyph in the offline font parser; a simple
outlined diamond now represents the existing objective marker in the proof.

No task work remains. Live browser/gameplay review and the full repository verify
were intentionally not run under this task's constraints. No git state was touched.
