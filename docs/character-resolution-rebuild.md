# Native-resolution character rebuild

User clarification, 2026-10-13: the complaint concerns the new PLAYER character
portraits, not bespoke NPC portraits. Check the player at actual game sizes;
the earlier 160px NPC review was the wrong benchmark. Lower-resolution rendering
is unacceptable. More source sheets are
explicitly allowed. Upsizing the old rasters is not a replacement for painted
detail.

## Findings

- World components were exported at 64×96 (about 71 painted body pixels).
  Camera framing draws people at 110–180 CSS pixels tall, multiplied by backing
  density and a 1.12 conversation zoom. The budget is at least 404 painted pixels.
- The builder enlarges 128×192 cells into a preview up to 200 CSS pixels wide.
  At 2× density it needs at least 400 native/exported pixels across the frame.
- Player portraits enlarge about 51×51 source pixels to a 128×128 canvas.
  Actual sizes: HUD 38–46 CSS pixels, chat 25, dialogue 44–56, inn 80.
  At 3× density the largest requires 240 genuinely painted pixels per side;
  a 256px export covers it. A larger output canvas alone cannot recover detail.
- Dedicated NPC paintings were a scope mistake. Preserve completed assets, but
  do not generate additional NPC portraits as part of this correction.

## Replacement contract

`web/src/character-resolution.mjs` owns the physical-pixel checks. Source pages
contain four 512×768 frames in a 1024×1536 sheet. Nine pages cover each existing
36-frame component. Registration still uses one transform per whole frame.
Runtime cells are 384×576; editor cells are 512×768. Native source transforms
must not enlarge pixels. Player portrait components need at least 240×240 native
pixels across the actual portrait crop; target 256×256 output. The 768px target
was based on an oversized review and is superseded.

The exporter supports a separate `highResolution` catalogue and asset directory
while replacements are staged. World dimensions, gait scale and cast loading
read the published frame size rather than assuming 64×96. This preserves physical
character size when texture density changes. Memory must be bounded by bytes as
well as entry count before the larger catalogue is published.

## Completion gate

The player's supported visible components and saved customizations must remain
accurate at the measured UI sizes. One crisp preset does not cover the character
set, and NPC artwork does not address this complaint. Keep the old sources for
provenance, but do not label enlarged crops crisp. Complete the mannequin and
hat/skirt spike before advancing phase 1.

Review at actual world camera scale, conversation zoom, maximum desktop editor
size and narrow-screen layout, with high-density screenshots. Check sharpness,
identity, every pose, attachment, material tinting, alpha edges, loading, memory,
stale async results and persistence. No approval is granted by file dimensions
alone: enlarged pose guides are explicitly unpublishable.

## Current work

Player portrait correction completed 2026-10-13. All 100 customizable entries
and two expressions are covered by the dedicated 256px portrait manifest: 80
painted visible entries and 22 explicit out-of-crop entries. The runtime now
composes these native portrait materials directly. See the retained
[sources, exact prompts and verification](../art/source/player-portraits/README.md).
The remaining world/editor rebuild is separate from this completed portrait fix.

- Resolution gate and native-detail sampler tests added.
- Generic exporter accepts larger cells and a separate asset directory.
- Runtime/cast dimensions are being made catalogue-driven.
- HD regular mannequin, cap and skirt pass all 36 frame checks and have staged
  exports. Hair interaction review and final spike approval remain outstanding.
- Seven NPC paintings were completed during the mistaken detour; no further
  NPC generation is planned for this correction.
- `web/qa/character-portraits.html` uses the actual 256px player renderer and
  game styles, with an entire-set gallery and temporary customization controls.
- All 83 portrait composition fixtures and desktop/narrow browser views were
  visually reviewed. Native source hashes, dimensions, tints, expression changes,
  every option and all 112 regular hair/hat combinations pass verification.
- Player portraits are published independently. World/editor sprites still use
  the old character publication; the staged HD spike remains separate.


Publication integration (2026-10-13): the component renderer runs in the current
Phaser Explore/World/Interior scene lifecycle, with late-bake rejection and
texture release covered by real-scene tests. Production character catalogues use
the existing lossless JSON transport so every recipe, hash and registration is
preserved inside the 12 MiB JavaScript budget. Native character images have a
separate 64 MiB distribution allowance, retain the existing 2 MiB per-file cap,
and load per recipe or destination. The 160 MiB base-world art allowance is
unchanged; no character image is downsampled to satisfy packaging budgets.
