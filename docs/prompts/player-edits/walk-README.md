# Walking leg edits

The 2026-10-09 revision slows the outdoor walk cycle from approximately
0.22 seconds to 0.87 seconds without changing movement speed. The editor uses
`requestAnimationFrame` timestamps for a one-second cycle. Hidden previews and
long stalls resume without a phase jump. Remote network catch-up distance is
excluded from accelerated gait advancement.

Leg artwork was generated with the built-in ImageGen tool. These are painted
frame overlays, not articulated limbs. All runtime pieces use the same
9×4 grid, frame, position and scale. No joints, rotations, body stretching or
independent leg transforms are applied.

The larger editing boards contain four columns and two rows of 384×512 cells,
at 1536×1024 pixels. Each cell has the same inner rectangle
`left=32, top=16, width=320, height=480`. Cropping that entire rectangle and
scaling uniformly by 0.4 produces a 128×192 editor frame; the 64×96 runtime
frame is its derivative. Board cells 0–7 become walking columns 1–8 in one
direction row. Back frames use a recorded whole-frame vertical translation to
bring planted soles to the common ground line before material extraction.
This is source-frame registration; it does not reshape or articulate a limb.
The original waistband material is preserved around the edit boundary to
retain its attachment to the unchanged shirt and jacket. Opaque original
pixels are retained exactly; antialiased edges use source-over compositing,
and transparent original pixels never erase a wider generated thigh. The
waist source is the unchanged `bottom-fabric-raw.webp` and
`bottom-detail-raw.webp` master material, not a prior walking export, so
repeated exports cannot accumulate transitions. Standing cells
are preserved. Upper materials retain their original pixels except a
documented, detached skin component in left walking pose 4; its bounds and
pixel count are asserted by the exporter and regression test.

Selected sources in `art/source/player-edits/`:

- `walk-front-candidate-3.png`: final front cleanup using the painted pose guide.
- `walk-right-candidate-1.png`: right profile eight-pose edit.
- `walk-left-candidate-1.png`: left profile eight-pose edit.
- `walk-back-final.png`: frame packing of generated back poses; cells 0 and 3
  come from `walk-back-candidate-2.png`, and cells 1, 2 and 4–7 come from
  `walk-back-candidate-3.png`. Cell sources are recorded alongside the board.

The original full-grid attempts and first front/back boards are rejected
candidates, not runtime inputs. The pose-guide scripts produce editing
references only. They never supply artwork directly to the game. The painted
guide uses an opposite-half leg reference for front passing pose 7 and back
poses 2/3; ImageGen then paints the selected cleanup outputs. Runtime extraction
copies those generated pixels rather than executing guide transformations.

Prompts are retained as `walk-{front,right,back,left}-eight-poses-imagegen.txt`,
the front/back `-v2-imagegen.txt` revisions, and the selected final cleanup
prompt [walk-painted-pose-preservation-imagegen.txt](walk-painted-pose-preservation-imagegen.txt).
The native kit is prepared by `scripts/prepare-player-walk-kit.mjs` and the
direction boards by `scripts/prepare-player-walk-direction-kit.mjs`.

Rebuild the original body, finalizer, and head/hair first, following the parent
README. Then stage the lower-body export:

```sh
PLAYER_WALK_LEGS_OUTPUT_DIR=/private/tmp/player-walk-review node scripts/prepare-player-walk-legs.mjs \
  --front art/source/player-edits/walk-front-candidate-3.png \
  --right art/source/player-edits/walk-right-candidate-1.png \
  --back art/source/player-edits/walk-back-final.png \
  --left art/source/player-edits/walk-left-candidate-1.png
```

The exporter writes both bottom materials at both sizes, source colour masks,
a staged manifest, assembled proofs, and an extraction report. It verifies
unchanged upper image hashes and preserves decoded standing RGBA pixels.
Dark cloth shading and raised boots must remain connected; colour matching
alone is insufficient. The report flags ground drift and waist coverage
differences rather than moving generated legs to hide them.

Review the assembled loop in every direction, including 8→1, planted soles,
waist joins and several trouser colours. After review, copy only
`bottom-{fabric,detail}{,-preview}.webp` and `manifest.json` from the staged
output into `web/public/assets/player-layers/`, retaining the source colour
derivatives referenced by the manifest. Bump the asset version in both
`world.ts` and `modular-character.ts`. Do not run the original body exporter
or finalizer afterward: it would replace the revised walking bottoms.

Run the walk extraction and head validation tests, the web tests and the
TypeScript build. A passing mask check is not a visual gait review. The wider
customization catalogue and new upper-body arm poses remain separate work.
