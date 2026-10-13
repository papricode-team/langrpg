# Character components plan

Written 2026-10-13. Supersedes the "Modular player characters" prototype
described in [art.md](art.md) as the direction for the character builder,
the player renderer and (later) the story cast.

**Resolution correction, 2026-10-13:** the user rejected the entire character
set's low on-screen resolution. The original pixel dimensions in this plan are
superseded by the [native-resolution rebuild](character-resolution-rebuild.md).
Mechanical validation and the earlier completion audit do not satisfy this
visual acceptance requirement. The rebuild remains in progress.

Player portrait update, 2026-10-13: the user clarified this complaint concerns
player portraits at actual UI sizes. Dedicated native 256×256 portrait layers
now cover the entire supported customizable set. This supersedes the standing
sprite crop described below. See [source and review evidence](../art/source/player-portraits/README.md).

Implementation note, 2026-10-13: the [phase-zero spike](../art/source/character-kit/README.md)
is green for the mannequin, cap and skirt. Body replacement needs an explicit
erase-inside-mask operation: preserving the old clothed silhouette also preserves
coat tails. The implemented gate measures skin coverage on the new mannequin
and independently checks master pose/head overlap and head/foot anchors. Garment
overlays preserve protected RGBA and use that mannequin as their reference.
Exact prompts, reviewed proofs and these pipeline corrections are recorded in
the spike report; phase-one runtime integration and exit checks pass.

Implementation status: phases zero through three are complete. The regular-build
catalogue has 82 reviewed components; all 192 story-cast recipes have reviewed
36-frame atlases. Players use one baked sprite, the builder exposes catalogue
tabs and material colours, and client/Go migration and persistence checks pass.
Phase four now publishes slim and broad with nine components each, for 100
components across three builds. Every extra-build component passed the generic
pipeline and visual review, including jacket/skirt overlaps. Twenty-six regular
action components (nine Wave, nine Seated and eight Raise lantern) are published
separately from the 100 walking components at asset version `f023205a1a21d51f`.
All 192 cast atlases were rebaked
without changing their reviewed pixels. The generic pose-set pipeline routes
kits, checks, exports, proofs and bakes through distinct action grids. Browser
baking and the builder preview support complete matching action outfits, with
strict compatibility and reduced-motion behaviour. Four residents now use reviewed
component wave atlases during their authored greeting schedules, preserving their
walking recipes and using the same sprite. Unsupported actions retain painted
artwork. Raise lantern has its own reviewed grid and wardrobe; the action requires
an equipped lantern and returns to Standing when it is removed. Dialogue portraits
now support reviewed smile and worried variants of regular/soft, with explicit
Marta dialogue cues and neutral fallback for unsupported identities. Expressions
are transient and do not change saved recipes. Phase four's initial reduced
wardrobes and pose/expression sets are implemented; further art coverage can grow
through the same catalogue.
Detailed evidence and source provenance are in the kit README.

## 1. Why the current builder failed

The prototype in `web/src/avatar-options.ts`, `web/src/modular-character.ts`
and `web/src/character-builder.ts` renders a player from seven registered
sheets (`bottom-detail`, `bottom-fabric`, `body-skin`, `head-detail`,
`jacket-detail`, `jacket-fabric`, `hair-*`) that were all carved out of one
painted master (`art/source/player-customizations/motion.png`, a bald figure
in a teal jacket and grey trousers, 9 × 4 grid). The user-facing result is
four colour pickers and a two-entry hair menu. Face, jacket, trouser and build
selectors exist but are hidden because each has exactly one option.

The root causes are structural, not a lack of effort on the art:

1. **The "body" is the master's clothes.** `body-skin` contains only the head
   and hands. The legs *are* the trousers, the torso *is* the jacket. Nothing
   can be swapped for a skirt, shorts, a t-shirt or a sleeveless top because
   there is no painted skin underneath.
2. **Every piece was a bespoke pipeline.** Hair has its own kit, lock,
   check and export scripts (`prepare-player-head-edits.mjs`,
   `lock-player-hair-edit.mjs`); the walking legs have another four scripts
   and a 300-line README. Adding a hat would mean writing a hat pipeline.
   Nothing is generic over "a slot with a mask".
3. **Materials were segmented by hue heuristics** from the natural-colour
   master (`prepare-player-layers.mjs` classifies pixels as coat/skin/boot by
   hue ranges). That is fragile and only works for this one painting. The
   hair edit proved the robust alternative: paint the new piece in a key
   colour, then extract the key.
4. **The catalogue is hard-coded TypeScript**, with labels duplicated into
   a `switch` for i18n. Growing it to a hundred entries by hand is not
   realistic, and the builder has no thumbnails, no tabs, no randomiser.
5. **No z-order rules.** Layer order is a fixed array regardless of facing.
   That is fine for hair-over-jacket, and breaks the moment we add a
   backpack, a scarf, a hood or a cloak.
6. **Draw cost scales with slots.** Each equipped piece is one Phaser image
   per character. Seven is tolerable; fifteen per player in a multiplayer
   town is not.

What *did* work and must be kept: one shared 9 × 4 pose grid, one isotropic
transform per frame recorded in the manifest, no limb rigging, no per-piece
transforms, keyed-colour extraction, lock-to-master provenance, 36-frame
validation, and GPU tinting that keeps painted shading.

## 2. Target

A player (and later any NPC) is a **recipe**: a build plus one option per
slot plus a colour per tintable material. Every option is a component sheet
on the shared grid. Spritesheets are **composed from components at runtime**
for players (baked once per recipe into a single texture) and **offline** for
the story cast. Nobody ever paints a complete character again; they paint a
component on the mannequin.

Concrete v1 target for the builder (about 90 components):

| Slot | Options | Tintable materials |
| --- | --- | --- |
| Build (mannequin) | 1 in v1 (`regular`), 2 more in phase 4 | skin |
| Face | 6 feature sets (eyes/nose/mouth) | none (detail only) |
| Markings | 3 (freckles, blush, beauty mark) + none | none |
| Facial hair | 4 + none | hair colour |
| Hair | 14 styles + bald | hair colour |
| Headwear | 8 + none | primary, secondary |
| Top | 8 + 4 dresses (dress occupies top and bottom) | primary, secondary |
| Outer | 8 + none (incl. existing travel jacket, a cloak, an apron) | primary, secondary |
| Bottom | 8 (incl. existing straight trousers, two skirts, shorts) | primary |
| Footwear | 6 (incl. existing boots) | primary |
| Eyewear | 4 + none | frame |
| Neck | 3 scarves + none | primary |
| Bag | 4 + none | primary |
| Held | lantern + none | none |

Everything is data; the numbers above are a budget, not a schema limit.

## 3. Core design

### 3.1 The mannequin

Generate **one full-coverage base body** per build: the master figure with
jacket, shirt, trousers and boots replaced by bare skin (a plain fitted base
suit painted entirely in the skin key colour). This is one ImageGen edit of
`base.png` with a full-body mask, locked to the master's silhouette and
head, then extracted into `body-skin` (full body) + `head-detail` (neutral
eyes/brows/mouth of the default face). From then on every garment is an
overlay and the skin shows wherever a garment does not cover it, which is
what makes skirts, shorts, short sleeves and open collars possible.

The mannequin's silhouette becomes the **reference silhouette** for all
validation: a component may extend outside it (hair, a coat hem, a bag) only
inside its slot mask, and must touch it (nothing floats).

### 3.2 Component sheet format

A component is one source edit (1536 × 1024, 9 × 4 cells on the master's
grid) in which the artist/ImageGen paints *only* the new piece, using key
colours for each material:

| Key | Material | Runtime tint |
| --- | --- | --- |
| muted violet `#7a5a9a` family | primary fabric | user colour |
| muted green `#5a9a6a` family | secondary fabric (lapels, trim, laces) | user colour |
| cyan `#5a9a9a` family | skin (legs under a skirt, arms under a tee) | avatar skin colour |
| any natural colour | detail (buttons, buckles, lantern glass) | not tinted |

The exporter converts each keyed material to a luminance-normalised grey
sheet (reference 180, exactly as `body-skin` already does) and keeps detail
in colour. Each component therefore ships as up to four RGBA sheets:
`<slot>-<id>.primary.webp`, `.secondary.webp`, `.skin.webp`, `.detail.webp`,
in both runtime (64 × 96 cells) and editor (128 × 192 cells) sizes, plus a
thumbnail. Pixels that are opaque in a component and belong to no key are
detail by definition, so a component with no keys (glasses) is one sheet.

### 3.3 Catalogue (data, not code)

`art/source/character-kit/catalogue.json` is the single source of truth:

```json
{
  "id": "outer-trench",
  "slot": "outer",
  "label": "Trench coat",
  "build": "regular",
  "mask": "outer-long",
  "materials": ["primary", "secondary"],
  "covers": { "bottom": "upper" },
  "hides": [],
  "excludes": [],
  "zOrder": { "default": 60, "up": 60 },
  "prompt": "…a knee-length belted trench coat with wide lapels…",
  "status": "approved",
  "candidate": "art/source/character-kit/outer-trench-candidate-2.png",
  "locked": "art/source/character-kit/outer-trench.png"
}
```

`scripts/character-kit.mjs build-catalogue` compiles the approved entries into
`web/src/data/character-kit.json` (slots, options, labels, materials, rules,
z-order, thumbnails, asset version). `avatar-options.ts` becomes a thin
loader over that file; the label `switch` in the builder goes away and
labels are translated through the existing `tr-ui.json` keys generated by
`scripts/i18n-coverage.mjs`.

### 3.4 Composition rules

The recipe → layer resolver (`characterLayers()` rewritten, still pure and
unit-tested) applies, in order:

1. **Occupancy.** A dress occupies `top` and `bottom`; selecting it clears
   those slots in the UI and the resolver ignores them.
2. **Hides.** Headwear declares `hides: ["hair"]` (full) or `hairCrown`
   (partial: hair sheet still drawn, hat drawn above it). Hair styles that
   cannot sit under a hat (`bun`, `afro`) declare `excludes: ["headwear"]`
   so the UI greys the slot out, instead of relying on pixel luck.
3. **Covers.** An outer piece declaring `covers.bottom: "upper"` is simply
   drawn above the bottom; no pixels are removed. Coverage declarations exist
   so the builder can warn about and the QA proofs can prioritise
   combinations that overlap.
4. **Facing-aware z-order.** Each component has a base z and optional
   per-facing overrides. Defaults by slot: held-behind 5, bag(back) 10,
   body 20, face/markings 25, bottom 30, footwear 35, top 40, outer 50,
   facial hair 55, hair 60, neck 65, eyewear 70, headwear 80, bag(front) 85,
   held-front 90. For the up-facing row, hair moves above neck and outer
   (it falls over the coat), the bag moves to front, and held items move
   behind.
5. **Materials → tints.** Each layer gets a tint from the recipe's colour for
   that component's material (`primary`/`secondary` per component, `skin`
   and `hair` shared across the avatar).

### 3.5 Baking instead of stacking

Players are baked: `bakeAvatarTexture(scene, recipe)` composes all layers for
all 36 frames into one canvas (576 × 384 at runtime size) using the existing
multiply-then-mask tint code from `paintCharacter`, registers it as a Phaser
spritesheet keyed by a hash of the recipe, and the character becomes **one
sprite**. Remote players bake on join and on avatar change; the cache is
bounded (LRU, ~32 textures) and evicts when a player leaves. The editor
preview keeps the live per-layer canvas path because it changes every click.
Ambient time-of-day tinting continues to apply on the baked sprite.

The same resolver and compositor run in Node with Sharp
(`scripts/bake-character-sheet.mjs`) to export sheets offline, which is how
the story cast gets its atlases in phase 3 and how the builder's thumbnails
are produced.

### 3.6 Avatar schema v2

```json
{ "v": 2, "build": "regular", "skin": "#d6a07d", "hair": "#48372e",
  "parts": { "face": "soft", "hair": "bob", "headwear": null, "top": "shirt",
             "outer": "travel", "bottom": "straight", "footwear": "boots", "bag": "satchel", "held": "lantern" },
  "colors": { "top.primary": "#d4c7aa", "outer.primary": "#326a65", "outer.secondary": "#2a4436", "bottom.primary": "#44464d" } }
```

v1 avatars (`{hair, skin, outfit}` + optional `parts`) migrate deterministically
to the equivalent v2 recipe on load, client and server. `server/avatar.go`
validates against an allowlist generated from the same compiled catalogue
(the Go side embeds `character-kit.json` like it embeds `course.json`), so a
removed option can never be saved and an unknown colour key is rejected.

## 4. Pipeline: one generic kit

Replace the hair- and leg-specific scripts with `scripts/character-kit.mjs`
and subcommands. Each subcommand is small and tested; the point is that no
slot ever needs its own script again.

| Command | What it does |
| --- | --- |
| `kit --slot <slot> [--build regular]` | Writes `base.png` (the mannequin for that build) and the slot's alpha + black/white masks to `art/source/character-kit/kits/`. Masks are authored once per slot (about 12 masks) as generous regions: `hair-short`, `hair-long`, `headwear`, `face`, `top`, `outer-short`, `outer-long`, `bottom`, `footwear`, `neck`, `bag`, `held`, `body-full`. |
| `prompt <id>` | Prints the complete ImageGen prompt for a catalogue entry: the shared preamble (keep every figure/pose/transparency exactly, 36 cells, consistent across rows, upper-left light, painterly), the slot's region sentence, the material key sentence(s), and the entry's own description. Prompts are versioned in the catalogue so they are reproducible. |
| `lock <id> <candidate.png>` | Starts from the original base RGBA and copies only keyed-colour pixels (and, for detail, only pixels inside the mask that differ from the base) into the locked sheet. Everything outside the mask is byte-identical to the base. This generalises `lock-player-hair-edit.mjs`. |
| `check <id>` | Read-only validation of the locked sheet: exact dimensions, grid unchanged, protected-pixel drift under threshold, every one of the 36 frames has keyed paint, every frame's paint is one connected region touching the mannequin silhouette, no paint outside the mask, per-material pixel counts within a sane range of the median across frames (catches a missing sleeve in one cell). Prints a report, writes nothing. |
| `export <id>` | Applies the manifest's per-frame transform, splits by key, normalises luminance, writes runtime + editor sheets and a thumbnail, and appends the entry to `web/public/assets/character-kit/manifest.json` with source hash and provenance. |
| `proof <id> [--with <other ids>]` | Renders a contact sheet: four facings × standing + eight walk frames, with two random tints, on the mannequin and together with the default outfit (and any `--with` pieces for overlap review). Saved to `art/proofs/`. Visual review is mandatory before `status: approved`. |
| `batch [--slot <slot>] [--status candidate]` | Runs `lock → check → export → proof` for every entry in that state and prints a table. |
| `build-catalogue` | Compiles approved entries to `web/src/data/character-kit.json`, regenerates i18n keys, bumps the asset version used by both `world.ts` and the builder (no more hard-coded `?v=layers12` in two files). |
| `bake <recipe.json> --out <atlas.webp>` | Offline composition of a complete character (phase 3). |

Provenance stays as it is today: raw candidate, locked sheet and prompt are
all committed under `art/source/character-kit/`; runtime sheets are
derivatives and are never hand-edited.

ImageGen loop per component (what an operator actually does):

1. `kit --slot outer` once per slot.
2. `prompt outer-trench` → paste into ImageGen with `base.png` and the mask.
3. Save the result as `outer-trench-candidate-1.png`.
4. `batch --slot outer` → read the check report and open the proof.
5. Fix the prompt and regenerate, or mark `approved` and `build-catalogue`.

Budget: 1 to 3 generations per component, so roughly 100 to 250 ImageGen
calls for the v1 catalogue. The mannequin, the masks and the first component
in each slot are the expensive, judgement-heavy part; after that it is a
loop.

## 5. Builder v2

Replace the dropdown-and-swatch panel with a proper editor, still a plain
TypeScript component in `character-builder.ts`:

- **Slot tabs** down the left (Body, Face, Hair, Head, Top, Outer, Bottom,
  Feet, Extras), each showing a grid of thumbnail tiles rendered offline on
  the mannequin, with a "none" tile where the slot is optional.
- **Colour row per tab**: the slot's materials (primary / secondary) with the
  curated swatches plus the custom picker, and the shared skin and hair
  colours on Body and Hair.
- **Live preview** at editor resolution with the existing turn and walk
  controls, plus a small four-facing strip.
- **Randomise** and **Presets** (six curated looks that double as the
  default avatars for name suggestions).
- **Rules surfaced, not hidden**: a dress disables Bottom with an inline
  note; a bun greys out Headwear.
- **Lazy loading**: a tab loads its thumbnails on first open; editor-size
  sheets load only for equipped pieces. The preview keeps the current
  retry-on-missing-asset behaviour.
- **Portrait**: the UI's player portrait (currently the fixed "wanderer"
  portrait) is derived from the baked down-facing standing frame, so chat,
  panels and the inn ledger show the actual character.

## 6. Phases

### Phase 0: Spike (2–3 days)

Prove the generic pipeline on the three hard cases before building anything
else: the mannequin (full-body skin key edit), a **hat** (overlay with
hide rule and hair interaction) and a **skirt** (replacement piece that
carries its own cyan skin legs). Success means `check` passes and the proof
looks right in all four facings through the walk. If the skin key bleeds
into shading or ImageGen cannot keep 36 cells consistent for a full-body
edit, fall back to generating the mannequin per facing row (four 9 × 1
boards, like the leg revision did) before committing to phase 1.

### Phase 1: Foundation (1–2 weeks)

- `character-kit.mjs` with `kit`, `prompt`, `lock`, `check`, `export`,
  `proof`, `batch`, `build-catalogue` and tests; retire the hair/leg scripts
  once their outputs are regenerated through the new kit (the existing
  waves hair and the revised walking trousers become the first catalogue
  entries, re-locked from their existing candidates).
- Slot masks for all slots; catalogue file; compiled `character-kit.json`.
- Resolver rewrite (`characterLayers()` over the catalogue with occupancy,
  hides, excludes, facing z-order) with the existing tests extended.
- Baking compositor shared between browser and Node; one-sprite players in
  `world.ts`; LRU texture cache.
- Avatar schema v2, migration, server allowlist from the compiled catalogue.
- Builder v2 shell with tabs, thumbnails, colours, randomise, presets.

Exit criterion: the game runs with the same two hairstyles and one outfit as
today, but every piece flows through the generic kit and the new builder.

### Phase 2: Catalogue fill (2–3 weeks, parallelisable)

Generate slot by slot in this order, because each unlocks the next review:
faces and markings → hair → tops → bottoms and footwear → outer → headwear →
neck, eyewear, bags, lantern. Each slot gets its own batch, proof review and
`approved` pass. Track progress in the catalogue's `status` field and a
one-line `scripts/character-kit.mjs status` table.

### Phase 3: Story cast from components (1–2 weeks)

Author recipes for the regional residents and the main cast
(`art/source/character-kit/cast/*.json`), bake their walking atlases offline
and switch `world.ts` to use them where a resident has no bespoke painted
action sheet. The painted `characters.webp` cast, portraits and resident
action atlases (sit, work) stay until a component pose set covers them.
Benefits: every NPC gains a proper four-direction walk, the town's people
share one style with the player, and new residents cost a JSON file.

### Phase 4: Builds and pose sets (ongoing)

- Additional mannequins (`slim`, `broad`) as ImageGen edits of the regular
  mannequin. Each build needs its own masks and its own batch of the
  catalogue; the catalogue entry's `build` field and `batch --build broad`
  already support this. Start with a reduced wardrobe per extra build.
- New pose sets (seated, emote/wave, lantern-raise) as additional grids.
  The manifest gains a `poseSets` table; the kit, check and bake commands
  take `--pose-set`. This is how the component system eventually replaces
  the per-resident action atlases.
- Expression variants of the face slot for dialogue portraits.

## 7. What we are deliberately not doing

- No skeletal animation, Spine or per-limb transforms. The whole scheme
  rests on "every sheet is the same 36 registered frames"; that is what
  makes AI-generated edits composable and validation mechanical.
- No per-combination sheets on disk for players; baking happens at runtime.
- No hue-heuristic material segmentation of natural-colour paintings.
  Everything new is key-painted.
- No style change (no pixel-art LPC-style parts). Components are painterly
  edits of the master so the result stays the game's look.

## 8. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| ImageGen drifts the pose or head size inside the mask | `check` protected-pixel drift + silhouette attachment; lock discards everything outside keyed paint |
| Key colour contaminates shading (violet bleeding into a coat's shadow) | Key families are chosen far apart in hue; extraction uses hue bands with chroma floors; the proof with random tints exposes bleed |
| Hat and hair collisions | `hides`/`excludes` rules in data, enforced by the UI and the resolver; proofs with `--with` |
| Long coats and bags over the walk cycle | per-facing z-order; overlap combinations are listed from `covers` and get proofs first |
| Asset weight (≈ 90 components × up to 4 sheets × 2 sizes) | runtime sheets are ~20–40 KB each and load only when equipped; thumbnails are tiny; preview sheets load per tab; precompression already exists |
| Draw calls in multiplayer | one baked sprite per character |
| Saved avatars breaking | schema v2 migration on both sides, server allowlist compiled from the catalogue, tests for every v1 fixture |
| Review burden | proofs are generated, not assembled by hand; `status` table shows what is waiting |

## 9. First concrete steps

1. Create `art/source/character-kit/` with the mannequin prompt and the
   `body-full`, `headwear`, `bottom` masks.
2. Write `scripts/character-kit.mjs` with `kit`, `lock`, `check` and `proof`
   (reusing the logic in `lock-player-hair-edit.mjs` and the validation in
   `prepare-player-head-edits.mjs`).
3. Run the phase 0 spike on mannequin, hat, skirt and review the proofs.
4. On a green spike, start phase 1 with the resolver and the catalogue so
   the builder shell can be developed in parallel with art generation.
