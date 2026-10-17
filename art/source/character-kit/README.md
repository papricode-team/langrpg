# Character kit

**Wardrobe parity (2026-10-17).** The active native catalogue in `hd/catalogue.json`
contains the same 81 walking wardrobe options for regular, slim and broad builds.
The 146 new build-specific components retain their generated page paintings,
prompts, registration, locked sheets and all 36-frame review proofs. Portraits
have independent paintings under `../player-portraits/`; components below the
portrait crop have explicit coverage records.

`node scripts/character-wardrobe-parity.mjs --check` audits the compiled options;
the tooling test also checks the source and server catalogues. For future gaps,
`prepare-character-wardrobe.mjs` prepares staged page jobs, and
`stage-character-wardrobe.mjs COMPONENT_ID` assembles, locks, checks and renders
review proofs without approving them. Export checked art before preparing its
portrait guide with `prepare-wardrobe-portraits.mjs wardrobe-PAGE COMPONENT_ID ...`.
Visual review and hash-bound approval are still required before publication.

**Historical resolution rebuild note (2026-10-13).** The user rejected the published
set's on-screen sharpness. The completion notes below describe the earlier
low-resolution publication, not acceptance of its visual quality. Native
replacements, prompts, and registration live in `hd/`; see the
[rebuild tracker](../../../docs/character-resolution-rebuild.md). Never publish
enlarged pose guides as new artwork or mix unfinished HD components into the
active catalogue.

Updated 2026-10-13. **The mannequin, cap, skirt and waves pass validation in all
36 frames and have completed visual proof review on the game's revised walk.**
The phase-zero gate is green, and its original sources/proofs remain archived.
The [character components plan](../../../docs/character-components-plan.md)
remains the roadmap. Phase-one export, catalogue and composition tooling is
available, including browser baking and texture ownership. The live renderer,
tabbed builder and schema-v2 persistence are integrated and browser-checked;
phase-one exit checks pass, including portraits and narrow-screen review.
Phase two is complete: all 82 v1 components are approved, including the regular
mannequin, every wardrobe/accessory slot and the handheld lantern. Client and
server catalogues share asset version `f023205a1a21d51f`. Phase three is complete:
all 192 cast identities have approved recipes and integrated walking atlases.
Phase four publishes three builds and the Wave, Seated and Raise lantern pose
sets, plus smile and worried portrait variants for regular/soft. Details and dated
publication evidence follow.

## Reviewed results

| Component | Selected source | Result |
| --- | --- | --- |
| Regular mannequin | `body-regular-candidate-4.png` | Full cyan coverage and revised alternating support-leg poses |
| Soft cap | `prepared/headwear-cap-walk.png` from candidate 1 | Whole-frame re-registration; primary fabric, secondary band, skin fringe |
| Knee-length skirt | `bottom-skirt-candidate-2.png` | Regenerated on the revised walk with complete carried cyan legs |
| Waves hair | `prepared/hair-waves-walk.png` from candidate 3 | Whole-frame re-registration; connected waves, clear chin |

All four have zero protected-pixel drift, one connected painted region per
frame and all required materials. Mannequin skin-key coverage is 100%; maximum
head/foot anchor drift is 1.26 editor pixels, within the three-pixel limit.
Actual per-frame figures are in the proof JSON reports.

- [Mannequin contact sheet](../../proofs/walk-migration/body-regular.png) / [walk](../../proofs/walk-migration/body-regular.gif)
- [Skirt, cap and jacket overlap](../../proofs/walk-migration/bottom-skirt--headwear-cap.png) / [walk](../../proofs/walk-migration/bottom-skirt--headwear-cap.gif)
- [Waves hair before/after cap hide rule](../../proofs/walk-migration/headwear-cap--hair-waves--rules.png)
- [Waves on mannequin and outfit](../../proofs/walk-migration/hair-waves.png) / [walk](../../proofs/walk-migration/hair-waves.gif)

Contact sheets include every standing and walking frame, in two deterministic
colour palettes. Normal proofs show the mannequin above and the compatible
existing outfit below. The hair-rule proof shows waves hair above and the cap
with hair hidden below. GIFs show all four facings together, standing followed
by the eight walking frames. Visual review checked registration, cap fit,
colour separation, skirt hem consistency, leg attachment and jacket overlap.

`catalogue.json` records approval with hashes of the reviewed PNG/GIF/report
and locked source. Re-running `proof` produces a diagnostic report with
`approved: false`; visual approval lives in the catalogue's separate `review`
record and applies only to its recorded hashes.

## Revised-walk registration

The original spike validated against `motion.png`, but the live game replaces
that master's lower body with revised walking boards. A direct comparison
exposed doubled mannequin legs beneath those trousers. The migrated reference
now uses the actual legacy editor sheets, preserving their alternating support
legs. Compare [before](../../proofs/walk-migration/trousers-before.png) and
[after](../../proofs/walk-migration/trousers-after.png).

`references/regular-walk.json` pins the ordered source sheets and tints.
`reference` composes them and maps each complete editor frame back to the
1536×1024 native grid. One shared isotropic transform per frame is retained;
small whole-frame offsets include the new painted edges without clipping.
The reference registration records those adjustments and all source hashes.
No limb is separately transformed. These are resampled painting references,
not claims of pixel-exact reconstruction of the old master.

```sh
node scripts/character-kit.mjs reference art/source/character-kit/references/regular-walk.json --out art/source/character-kit/references/regular-walk.png
node scripts/character-kit.mjs reproject art/source/character-kit/headwear-cap-candidate-1.png --from web/public/assets/player-layers/manifest.json --to art/source/character-kit/references/regular-walk.registration.json --out art/source/character-kit/prepared/headwear-cap-walk.png
```

Built-in ImageGen painted mannequin candidate 4 on the new reference and skirt
candidate 2 on that mannequin. Cap and hair candidates were re-registered as
whole frames, with their original raw PNGs preserved. Prepared candidates have
provenance binding both registrations and the raw source. `lock`/`check` reject
changed preparation inputs or reference sources. The skirt's retained skin
region begins at 30% of waist-to-ground so raised legs remain connected directly
beneath its hem. The single-region and pose checks were not relaxed.

`catalogue.json` is authoritative. `catalogue-before-walk-migration.json` and
`catalogue-walk-staging.json` preserve the before/after migration snapshots.
`--catalogue <file>` allows isolated candidate checks, and `proof --out <png>`
keeps staged proofs separate from existing approvals. All migrated locked PNGs
use `-walk.png`; the prior sources and reviewed proofs remain untouched.
The active catalogue's `proofDirectory` also routes ordinary `proof`/`batch`
output to the migrated proof directory, preserving the earlier proof files.

The regression comparison counts opaque mannequin pixels below the waist not
covered by either legacy bottom sheet. Exposure fell from 14,719 to 642 pixels
across the 36 editor frames, with no frame above 50 pixels (small edge
differences). This quantitative check complements the contact-sheet review.

## Corrections established by the original spike

**Body replacement must be able to erase clothing.** An additive overlay lock
cannot remove old coat tails and boot edges. `lock.operation: "replace"` clears
only the editable region and copies the candidate's declared materials there.
Protected RGBA outside the mask remains byte-identical. This establishes the
mannequin silhouette, which becomes the reference for garments. All pieces
still use the original manifest's per-frame transform; no body parts move or
get separate transforms during extraction.

The 95% skin-coverage gate now measures the replacement mannequin's visible
silhouette, rather than requiring skin in the old coat-tail silhouette. To
prevent this accepting a shrunken, shifted or background-filled body, replacement
validation additionally requires at least 0.8 silhouette intersection-over-union
with the master, 0.8 head overlap, and at most three canonical editor pixels of
crown, ground or head-centre drift. Horizontal position is measured at the head,
not the whole clothed bounding box whose coat tails are deliberately removed.
The previous opaque-backdrop candidate still fails these checks, covered by a
regression test. This corrects the initial spike's coverage definition; it does
not claim pixel-identical clothed and unclothed silhouettes.

**Key boundaries need their painted seams.** `detailReach: 1` retains candidate
pixels immediately adjacent to keyed paint. The cap also treats the cyan fringe
as shared skin, so it follows the avatar colour instead of leaving a cyan halo.
`anchorMaterial: "primary"` prevents detached green iris pixels from becoming
hat trim. The skirt restricts skin to a registered lower-leg region; unrelated
hand and torso edits are discarded. `keepMaterials: ["skin"]` carries unchanged
leg pixels too, avoiding holes caused by difference-only extraction.

Cleanup is explicit and bounded: the body discards detached islands of at most
four source pixels, garments at most twelve. Larger detached primary paint
regions remain errors. Nothing is moved, stretched, filled or generated by
cleanup. The region tests, material minimums and count bounds still run after
locking, with regression tests for detached paint and missing materials.

**Legacy outfit proofs need the right base.** The existing revised trousers
already contain their walking legs. Their proof uses the existing head/hands
skin and neutral face sheets, not a second full mannequin underneath. When a
skirt replaces Bottom, those trousers are omitted and the full mannequin is
used. The jacket draws above the skirt. Legacy sheets are read-only proof
fixtures, not approved new-kit components. Their migration remains phase one.

## Generic commands

Run from the repository root after `npm ci`:

```sh
node scripts/character-kit.mjs status
node scripts/character-kit.mjs kit --slot body --rows
node scripts/character-kit.mjs kit --slot headwear
node scripts/character-kit.mjs kit --slot bottom
node scripts/character-kit.mjs prompt headwear-cap
node scripts/character-kit.mjs lock body-regular
node scripts/character-kit.mjs lock headwear-cap
node scripts/character-kit.mjs lock bottom-skirt
node scripts/character-kit.mjs check body-regular
node scripts/character-kit.mjs check headwear-cap
node scripts/character-kit.mjs check bottom-skirt
node scripts/character-kit.mjs proof body-regular
node scripts/character-kit.mjs proof headwear-cap
node scripts/character-kit.mjs proof bottom-skirt --with headwear-cap
node scripts/character-kit.mjs proof headwear-cap --with hair-waves --rules
node --test scripts/character-kit.test.mjs
```

`check` writes nothing and exits nonzero on failure. `lock` explicitly replaces
the entry's locked derivative and sidecar; retain raw candidates separately.
The sidecar fingerprints candidate, base, registration, mask, generated prompt,
exact generation prompt, materials, lock policy and locked pixels. Changes to
any of those invalidate provenance. `proof --with` validates the companion
components too and records every input asset hash and facing-specific layer
visibility. Proofs and recipes share the same pure visibility/order rules for
occupancy, exclusions, full/partial hides, and facing order. When an ID exists
both as a new component and a legacy proof fixture, explicit `--with` chooses
the new component and validates it.

## Foundation tooling after the green spike

`export` writes separate material sheets at runtime (64 × 96 per frame) and
editor (128 × 192) resolutions, thumbnails and a derivative manifest. Material
coverage is combined before layering components so filtered key boundaries do
not introduce transparent seams. `build-catalogue` checks approval hashes,
source provenance and exported asset hashes before compiling identical client
and server catalogues. It also synchronizes the Turkish catalogue labels and
runs the translation coverage check.

```sh
node scripts/character-kit.mjs export body-regular
node scripts/character-kit.mjs export headwear-cap
node scripts/character-kit.mjs export bottom-skirt
node scripts/character-kit.mjs build-catalogue
node scripts/character-kit.mjs bake art/source/character-kit/recipes/spike-preview.json --out art/proofs/spike-component-bake.webp --editor --preview
node --test scripts/character-kit-assets.test.mjs
```

The browser-independent resolver handles occupancy, full and partial hair
hides, exclusions, coverage metadata, facing order and material colours. The
offline baker uses that resolver and the shared pixel compositor. The
[exported-material preview](../../proofs/spike-component-bake.webp) was reviewed
across all 36 frames, confirming cap fit, skirt movement and carried skin legs.

The compiled catalogue contains 82 reviewed components, including all six
face sets, three markings, four facial-hair options and fourteen hairstyles.
Production baking accepts the complete foundation recipe
without `--preview`. Older spike/preview recipes deliberately omit required
pieces and still need the explicit authoring-only flag. Browser and Go both
use the generated catalogue for migration and persistence validation.

## Default face and live integration

`face-oval-candidate-3.png` is approved and locked as `face-oval.png`.
Three built-in ImageGen edits and their exact prompts are retained under
`prompts/face-oval-candidate-{1,2,3}.txt`. The first left cyan nose/mouth detail;
the second lost profile marks; the third passes all 36 cells. Front and profile
features are visible; all nine rear-facing cells must remain empty.
Eyes, brows, nose and mouth need separate regions, so this entry has an explained
maximum of eight. The mask covers three facings; `ignoreKeys` discards mannequin
keys and `minBaseAlpha: 240` excludes flattened background fringe. These explicit
extraction/visibility settings are recorded in provenance and tested. The
mannequin, cap and skirt retain their original single-region gates.

- [Face proof](../../proofs/walk-migration/face-oval.png)
- [Face with outfit](../../proofs/walk-migration/face-oval--top-shirt--outer-travel--bottom-straight--footwear-boots--hair-waves.png)
- [Complete production atlas](../../proofs/foundation-outfit.webp)
- [Live builder screenshot](../../proofs/foundation-builder-browser.jpg)

Players now use one baked Phaser Sprite with 36 registered frames. Changes keep
the previous texture until its replacement is ready; revision checks discard
obsolete bakes. Departures release ownership, including work finishing after
departure. The hidden placeholder never receives avatar-only frame indices.
Ambient tint still applies to the baked sprite.

The builder has catalogue tabs, lazily inserted thumbnails, material colours,
standing/walk controls, four-facing previews, six presets, randomisation and
rule explanations. Preview canvases retain equipped sheets across walking frames
instead of repeatedly decoding an outfit larger than the idle cache. The idle
sheet cache targets 24 MiB; active preview leases retain their working set in
addition to that budget. Removing a builder releases its leases.

Shared migration fixtures cover flat/nested v1, bald, historical unsupported
options, named colours, blank/null selections and v2 round trips. Unknown v2
fields, slots, removed options and colour keys are rejected on save. Go tests
exercise creation, editing, session resume and login after a storage restart.
An isolated browser check used Vite 5193 and a temporary backend on 8099: a cap
and skirt were selected, saved, rendered in town and reopened in the editor.
No browser errors were reported. User development servers were untouched.

Phase-one exit checks now pass. HUD, chat and inn-panel portraits crop the same
down-facing standing composition as the renderer, with a bounded 32-recipe cache,
missing-asset retries and stale-result guards. A saved preset change was verified
in the HUD and world. At 390×844 the builder fits its container with no horizontal
overflow; the menu close button remains accessible beside the event log.

- [Actual portrait and matching world sprite](../../proofs/foundation-portrait-browser.jpg)
- [Mobile editor](../../proofs/foundation-builder-mobile.jpg)

The old bespoke player exporters, kits, packers and their tests are retired.
`character-kit-pixels.mjs` owns the shared sampler and visible-pixel comparison;
44 generic kit tests still pass. Historical scripts are available from Git
history; raw sources and legacy reference exports remain untouched. The web
suite passes 729 tests, the production build passes, and shared Go migration /
persistence tests pass. No catalogue-fill or story-cast completion is claimed.

## Phase two: faces

`face-soft` is the first added catalogue variant, approved from candidate 1 after
all 36 frame checks and visual review on the mannequin and full outfit in two
palettes. The rear-facing row contains no feature paint. The exact built-in
ImageGen prompt is `prompts/face-soft-candidate-1.txt`; the unchanged raw output is
`face-soft-candidate-1.png`, with locked pixels in `face-soft.png`.
The [head detail sheet](../../proofs/walk-migration/face-soft-heads.png) supplements
the hashed contact-sheet and walk proofs in its catalogue review record.
The face batch is complete: `angular` and `mature` use candidate 1; `round` and
`almond` use candidate 2. Round candidate 1 exceeded the region limit in one
front-facing cell; almond candidate 1 exceeded it in several front cells and
lacked right-profile paint. Targeted built-in ImageGen repairs pass the existing
checks. Rejected contact sheets and head crops remain as `face-round-rejected-1`
and `face-almond-rejected-1` in the proof directory.

All six sets have zero protected drift, visible front/profile features and an
empty rear-facing row. Bare head crops and full-outfit contact sheets were
reviewed across all 36 frames in two palettes. Each approved source, exact prompt
and proof hash is recorded in the catalogue; runtime/editor WebPs and thumbnails
are exported through the generic kit. The remaining slot batches,
story-cast recipes, additional builds and pose sets remain outstanding.

The expanded catalogue exposed a migration edge case: old unsupported selectors
such as `face: mature` must keep the appearance V1 actually rendered, even after
a matching V2 component becomes available. Client and server migration now pin
the legacy regular build, default face and outfit, preserving bald versus waves
and saved colours. Explicit V2 choices continue to round-trip. Shared fixtures
cover both the historical fallback and a saved V2 mature face.

## Phase two: markings

Freckles, blush and a left-cheek beauty mark are approved from their second
built-in ImageGen candidates. Raw candidates 1–3 and exact submitted prompts
remain under `markings-*-candidate-*.png` and `prompts/`. Candidate 3 attempted
transparent extraction but moved the markings, so it is not used. The earlier
opaque extraction proofs are retained with `-rejected-1` / `-rejected-2` suffixes.

Natural pigment edges painted over cyan contained mixed underpainting, which
looked pale on darker skin. The generic lock now supports explicit `detailInk`
matting for a single declared ink colour: a two-basis RGB solve recovers pigment
luminance and alpha against the known base flattened on its declared input
matte. It accepts only changed natural-detail pixels inside the mask and near-
opaque base, rejects colours outside the declared residual tolerance, and does
not move, fill or smooth any pixels. Optional authored opacity controls pigment
strength; blush uses 0.35. The ink colours, residual tolerance and opacity are
recorded in lock provenance. This is an opt-in extraction policy, not a change
to existing pieces or a general segmentation of natural-colour clothing.

All three pass the original markings policies in all 36 cells with zero protected
drift. Freckles/blush are visible from the front and both profiles. The beauty
mark is visible only from the front and right-facing profile, with no paint on
the hidden cheek or rear row. Review covers the default face on the mannequin
and mature face with the full outfit in two palettes. Their approved proof hashes
are recorded in the catalogue. All marking material sheets remain untinted
natural-colour detail, with alpha composited by the shared baker.

- [Freckles](../../proofs/walk-migration/markings-freckles--face-oval.png)
- [Blush](../../proofs/walk-migration/markings-blush--face-oval.png)
- [Beauty mark](../../proofs/walk-migration/markings-beauty-mark--face-oval.png)
- [Blush in the production bake](../../proofs/markings-blush-outfit.png)

The final 17-component build passes 46 generic pipeline tests, 28 targeted web
tests and the Go migration/persistence tests. Client/server catalogues match at
asset version `8a18bf871dc1f6c0`; label coverage is complete. The production blush
recipe and atlas are saved with the other recipes/proofs. Its PNG is a flattened
view for inspection; the WebP retains alpha for use as a sprite atlas.

## Facial hair batch

Moustache, goatee, short beard and full beard now pass all 36 frames with zero
protected drift. Built-in ImageGen candidate 1 was selected for moustache and
both beards; goatee uses candidate 4. Its first two candidates split the
moustache into disconnected fragments, and candidate 3 lacked sufficient key
paint. Candidate 4 was regenerated from the clean mannequin with a joined,
stronger-key moustache. All raw candidates and exact submitted prompts are
retained; rejected proofs and the candidate-3 check report remain in the proof
folder. The fourth goatee attempt exceeds the planning estimate of 1–3 calls;
validation thresholds were not relaxed to accept it.

The facial-hair mask is visible only from the front and both profiles. One
connected region is required for moustache; the other styles allow at most two
attached regions for moustache and chin paint. Rear-facing cells stay empty.
All four were visually reviewed on the oval-face mannequin and with the mature
face, full outfit and cap across the walk in two palettes. Proof hashes and
locked-source hashes are recorded in the catalogue.

Both scalp hair and facial hair use the shared recipe hair colour. The cap's
hide rule suppresses scalp hair while retaining facial hair. A shared client/Go
fixture covers a saved beard with freckles and cap, and a resolver regression
checks the hide rule and shared tint in all four facings.

- [Moustache](../../proofs/walk-migration/facial-hair-moustache--face-oval.png)
- [Goatee](../../proofs/walk-migration/facial-hair-goatee--face-oval.png)
- [Short beard](../../proofs/walk-migration/facial-hair-short-beard--face-oval.png)
- [Full beard](../../proofs/walk-migration/facial-hair-full-beard--face-oval.png)
- [Full beard in the production bake](../../proofs/facial-hair-full-beard-outfit.png)

The 21-component build passes 46 generic pipeline tests, 30 targeted web tests
and the Go migration/persistence tests. Client/server catalogues match at asset
version `4f9e3363298d0808`, with complete Turkish label coverage. The production
recipe is saved in `recipes/facial-hair-full-beard.json`; its WebP atlas retains
alpha and the PNG proof is flattened for inspection.

## Short hairstyle batch

Textured crop, chin-length bob, pixie cut and buzz cut are approved and exported.
Together with waves, this completes five of the fourteen planned hairstyles.
All four were generated through built-in ImageGen on the revised mannequin with
the existing `hair-short` mask. Raw candidates and exact submitted prompts are
saved under `hair-*-candidate-*.png` and `prompts/`.

Crop, pixie and buzz use candidate 1 without cleanup. Bob uses candidate 3:
candidates 1 and 2 left detached paint along the profile faces and were rejected.
Candidate 3 passed 35 frames outright. The final left-facing frame contained one
nine-pixel detached chin-edge fragment beside its 952-pixel hairstyle. Existing
bounded `maxSpeckPixels: 9` cleanup restores only that fragment to the mannequin;
the before-cleanup check report is retained. The one-region validation gate,
registration and source geometry were not changed.

Each style passes all 36 frames with zero protected drift and was reviewed with
the oval face on the mannequin, then with mature face and full starting outfit,
in two palettes. Cap rule proofs cover every facing: hair is visible before the
cap is equipped and fully hidden afterwards. The capped boards are pixel-identical
across all four styles. Catalogue reviews record hashes for the locked sources,
proof images, reports and animated walks.

- [Crop](../../proofs/walk-migration/hair-crop--face-oval.png)
- [Bob](../../proofs/walk-migration/hair-bob--face-oval.png)
- [Pixie](../../proofs/walk-migration/hair-pixie--face-oval.png)
- [Buzz](../../proofs/walk-migration/hair-buzz--face-oval.png)
- [Bob with cap rule](../../proofs/walk-migration/headwear-cap--hair-bob--face-oval--rules.png)
- [Bob with skirt in the production bake](../../proofs/hair-bob-outfit.png)

The 25-component build passes 46 generic pipeline tests, the targeted web tests,
Go avatar migration/persistence tests and TypeScript checking. A shared client/Go
fixture preserves a v2 bob with soft face, blush and skirt. Both compiled
catalogues match at asset version `aaf4ba148b8c3d1a`; Turkish label coverage is
complete. The production recipe is saved in `recipes/hair-bob.json`, with its
alpha WebP and flattened inspection PNG under `art/proofs/`.

## Long hairstyle batch

Long straight hair, loose curls and shoulder-length locs are approved, bringing
the catalogue to 28 components and eight hairstyles. Straight hair uses built-in
ImageGen candidate 1; curls and locs use candidate 2. Raw images and exact prompts
are retained. Candidate-1 rejected proofs and candidate-2/3 failure reports
record the repair history.

Locs candidate 2 removes disconnected strands beneath the profile chin. Curls
candidate 2 preserves the intended loose curls; six left-profile cells retain
small detached chin-edge fragments of 8–20 pixels beside 1178–1236-pixel
hairstyles. Existing bounded `maxSpeckPixels: 20` cleanup restores those fragments
to the mannequin. Candidate 3 made tighter curls and introduced more fragments,
so it was not selected. All three retain the single-region gate and pass all 36
frames with zero protected drift.

Curls exposed enclosed white background inside hair loops. Generic input-matte
extraction now has explicit `matte.includeEnclosed: true` for components without
white detail. This removes matching matte pixels inside loops as well as at the
border; the default still preserves enclosed white buttons and stitching. A
regression test checks the transparent hole, retained coloured paint, protected
pixels and option validation. At this batch, only curls enables this option. Before/after proof
images and the policy in lock provenance document the change.

Visual review covers all frames with oval face on the mannequin and mature face
with the starting outfit in two palettes. Rear hair draws over the jacket.
Cap rules hide each hairstyle in every facing, and the capped boards are
pixel-identical to the previously reviewed bob/cap proof. Reviews include source
and proof hashes.

- [Straight hair](../../proofs/walk-migration/hair-straight--face-oval.png)
- [Loose curls](../../proofs/walk-migration/hair-curls--face-oval.png)
- [Locs](../../proofs/walk-migration/hair-locs--face-oval.png)
- [Curls in the production bake](../../proofs/hair-curls-outfit.png)

The 28-component build passes 47 generic pipeline tests, 31 targeted web tests,
Go avatar tests and TypeScript checking. Client/server catalogues match at
`482c3ae8479a04f0`, with complete Turkish label coverage. The curls production
recipe, alpha WebP and flattened inspection PNG are retained.

At the end of this batch, ponytail and twin braids remained candidates.
Candidate 2 failed connected-region validation (front tail edges and braid sections).
Their third-generation batch terminated with an ImageGen output moderation
rejection labelled sexual; it returned only the curls image. No candidate-3
ponytail or braids image was returned or saved. Exact prompts and the error
request ID are recorded in `prompts/hair-long-third-batch-outcome.txt`.

These six remaining hairstyles were completed in the next batch below.

## Completed hairstyle batch

Ponytail, twin braids, high bun, afro, short coils and mohawk are approved. This
completes the fourteen-style hair budget, with bald provided by the optional slot.
Ponytail and braids use built-in ImageGen candidate 4; the other four use candidate
1. All raw outputs and exact prompts are saved. The edit reference uses the
approved shirt, trousers and boots in neutral grey over the unchanged cyan
mannequin, on the exact source grid. The reference and source hashes are retained
as `prepared/hair-clothed-reference.png` and its JSON sidecar. All six clothed
reference edits returned successfully.

Ponytail and braids expose legitimate front-facing sections separated by the
head or ears. The generic validator now supports `maxRegionsByFacing`, bounded
like the existing garment allowances and requiring an explanation. Ponytail
allows two front regions and braids three; every region must touch the mannequin.
The other facings still require one region. Tests reject allowances without a
reason, invalid facings/counts, body overrides and disconnected paint in a facing
without an allowance. The original mannequin/cap/skirt gates are unchanged.

Ponytail uses `hair-short`; braids uses the new `hair-shoulder` mask, excluding
clothing below the hair. Bounded cleanup removes only small detached edge
fragments (limits: ponytail/braids 20 pixels, bun/coils 15, afro/mohawk 8).
Explicit enclosed-matte removal prevents white holes inside hair loops.
All six pass every frame with zero protected drift. Before-cleanup/mask reports
retain the diagnostic evidence.

Visual review covers all 36 frames on the mannequin and with the mature face and
full starting outfit, in two palettes. Bun, afro and mohawk exclude headwear:
their rule proofs preserve the hairstyle pixel-for-pixel when a cap is selected.
Ponytail, braids and coils are hidden by the cap, producing capped boards identical
to the approved bob reference. The builder regression checks that selecting a
bun clears the cap and disables its tile with an explanation, then selecting
coils restores headwear choices. A shared client/Go fixture preserves a valid
recipe containing afro and cap; the resolver suppresses the excluded cap.

- [Ponytail](../../proofs/walk-migration/hair-ponytail--face-oval.png)
- [Twin braids](../../proofs/walk-migration/hair-braids--face-oval.png)
- [High bun](../../proofs/walk-migration/hair-bun--face-oval.png)
- [Afro](../../proofs/walk-migration/hair-afro--face-oval.png)
- [Short coils](../../proofs/walk-migration/hair-coils--face-oval.png)
- [Mohawk](../../proofs/walk-migration/hair-mohawk--face-oval.png)
- [Afro production bake](../../proofs/hair-afro-outfit.png)

The 34-component build passes 48 pipeline tests, 34 targeted web tests, Go avatar
tests and TypeScript checking. Client/server catalogues match at asset version
`10b767b726779290`, with complete Turkish label coverage. The production recipe,
alpha WebP and flattened inspection PNG are retained. Tops/dresses are the next
slot batch; the remaining wardrobe, story cast, extra builds and pose sets remain.

## First tops and dress batch

The short-sleeve tee, sleeveless top, knit sweater and day dress are approved.
There are now four regular tops (including the collared shirt) and one of the
four planned dresses. All were generated with built-in ImageGen; raw candidates
and exact submitted prompts are retained under this directory and `prompts/`.

The first three tops passed geometric checks or needed only explained occlusion
handling, but outfit review found exposed lower-back skin above the trouser
waistband. Tee/sweater candidate 2 and sleeveless candidate 3 extend their hems to
the upper hip. Earlier candidates and rejected outfit proofs remain available.
The reusable catalogue prompts now specify trouser overlap in every facing.
Tee and sleeveless top allow two regions in the profile rows because foreground
arms separate the torso fabric from a visible rear hem section; each section
must touch the mannequin. Front/back and all sweater frames stay single-region.

Day dress candidate 1 has a separately tintable waistband and occupies both top
and bottom. Its small detached edge fragments (17 and 9 source pixels) are removed
by bounded cleanup. Exposed arms and legs use the unchanged mannequin, so the
dress does not paint skin over boots. All four components pass 36 frames with
zero protected drift. Review covers two palettes, trouser/skirt combinations,
boots, hair and the travel jacket.

The dress exposed a generic proof bug: suppressing legacy trousers after choosing
their partial body fixture left transparent calves in the outfit board. Proof
fixture selection now accounts for occupied slots before choosing that body.
A regression renders the dress and compares every calf/boot pixel between the
mannequin and outfit boards in both palettes across all 36 frames. The corrected
dress occupancy proof also matches the no-trousers proof pixel-for-pixel.

- [Tee with trousers](../../proofs/walk-migration/top-tee--face-soft--hair-crop--bottom-straight--footwear-boots.png)
- [Sleeveless top with skirt](../../proofs/walk-migration/top-sleeveless--face-soft--hair-bob--bottom-skirt--footwear-boots.png)
- [Sweater with jacket](../../proofs/walk-migration/top-sweater--face-soft--hair-bob--bottom-skirt--footwear-boots--outer-travel.png)
- [Day dress occupancy](../../proofs/walk-migration/top-dress-day--face-soft--hair-bob--bottom-straight--footwear-boots--rules.png)
- [Day dress production bake](../../proofs/dress-day-outfit.png)

The builder regression selects the dress, changes its belt colour, checks that
Bottom is cleared and disabled with an explanation, then selects a tee and checks
that trousers return. Resolver tests cover both existing bottoms and every
facing. Shared client/Go fixtures cover dress occupancy and the new `top.secondary`
default in older recipes. The 38-component catalogue passes 49 pipeline tests,
37 targeted web tests, Go avatar tests and TypeScript checking. Client/server
catalogues match at `9dacdfbfb170184c`; Turkish label coverage is complete.

The production recipe is `recipes/dress-day.json`, with alpha WebP and flattened
inspection PNG under `art/proofs/`. At that checkpoint, four regular tops and three dresses remained
before the bottoms/footwear batch. The remaining wardrobe, cast, builds, pose sets
and expressions are still outstanding.

## Starting wardrobe and browser baking

The shirt (`top-shirt`), straight trousers (`bottom-straight`), walking boots
(`footwear-boots`) and travel jacket (`outer-travel`) are now approved. Each
uses its retained candidate 1 and exact prompt under `prompts/`. They were
generated on the corrected mannequin with the existing outfit as a style
reference; they are new paintings, not lossless re-locks of the legacy boards.
Their locks exclude the edge-connected white input matte while retaining
enclosed neutral buttons. Material seams still retain bounded adjacent paint.

- [Full outfit in two palettes](../../proofs/walk-migration/outer-travel--top-shirt--bottom-straight--footwear-boots--hair-waves.png)
- [Shirt, skirt, boots and cap](../../proofs/walk-migration/top-shirt--bottom-skirt--footwear-boots--headwear-cap.png)
- [Default-colour exported preview](../../proofs/foundation-outfit-preview.webp)

These pieces exposed a necessary clarification to the original single-region
rule: two boots and garment fragments separated by a foreground arm or leg are
legitimately disconnected. `validation.maxRegions` explicitly allows up to two
regions for the boots/trousers and four for the open jacket, with a per-entry
`regionReason`. Every region must still touch the mannequin. The shirt and all
phase-zero pieces retain the single-region requirement. Validation policy is
part of lock provenance; changing it requires re-locking. Floating paint,
protected-pixel drift, missing materials and inconsistent material counts are
still errors. These allowances are not a claim that every garment is connected.

`web/src/avatar-baker.ts` loads only resolved material sheets, bakes the runtime
atlas and paints individual editor frames through the same `composeAtlas` /
`composeFrame` implementation used offline. Image-load failures can be retried;
the idle decoded-image cache is bounded at 24 MiB (active preview resources
are retained separately as described above). Asset URLs and texture identities
include the compiled catalogue version.

`bakeAvatarTexture(scene, recipe)` registers all 36 frames with Phaser and returns
a lease. Keep it while a sprite uses the texture, release it on avatar change,
and call `release(true)` on departure. The LRU targets 32 textures; live leases
are pinned, so more than 32 simultaneously active unique avatars may temporarily
exceed that target. Unused entries are evicted first. Scene shutdown/destruction
disposes the cache and prevents late bakes from registering new textures.

The in-app browser rendered both atlas sizes successfully. Against the offline
editor preview, alpha matched exactly; browser decode/canvas rounding produced
a maximum premultiplied colour difference of 3.122/255 (241 colour channels above
2/255). All four facings were visually inspected. Node tests using the same image
decoder match every visible pixel exactly. This older pixel comparison verifies the baking module. The later live
builder/world check is recorded above.

```sh
npm run test --workspace web -- src/avatar-texture-cache.test.ts
node --test scripts/character-kit.test.mjs scripts/character-kit-assets.test.mjs scripts/character-kit-reference.test.mjs
```

## Completed tops and dresses

The blouse, Henley, woven tunic, turtleneck, pinafore, wrap dress and long dress
complete the eight regular tops and four dresses. These seven additions were
made with built-in ImageGen. Raw candidates and exact submitted prompts remain
under this directory and `prompts/`; each selected source is linked by the
catalogue and lock provenance. Candidate 1 is used except for the tunic, whose
second candidate removes trousers introduced by the first generation. Both raw
candidates are retained. No garment carries replacement skin, so exposed legs,
arms and footwear continue to come from the mannequin and equipped components.

The tunic uses `top-long`, a neck-to-upper-thigh mask, and declares upper-bottom
coverage without occupying the bottom slot. Blouse profile views permit at most
two attached regions; tunic profiles permit three where foreground forearms and
hands occlude the rear cloth. Front and rear views still require one region.
Neither uses speck cleanup. The pinafore removes eight edge fragments of 8–21
source pixels; the wrap dress removes eight of 6–17 pixels. Their retained main
regions contain thousands of pixels and retain the single-region gate. Henley,
turtleneck and long dress pass without cleanup or extra region allowances.

All seven pass 36 frames with zero protected drift. Each has three hashed proof
sets, reviewed in two palettes: trousers, skirt and travel-jacket combinations
for regular tops; boots, travel jacket and occupancy comparisons for dresses.
The applied-occupancy panels (the lower half of `--rules` proofs) match the
no-trousers compositions pixel-for-pixel for all three new dresses. The upper
half deliberately shows the baseline before applying the dress. Production
bakes for pinafore and long dress also pass visual review across the walk.

- [Tunic overlap review](../../proofs/walk-migration/top-tunic-final-review.png)
- [Pinafore production bake](../../proofs/dress-pinafore-outfit.png)
- [Long dress production bake](../../proofs/dress-long-outfit.png)

The 45-component client/server catalogue matches at `fd7a80c6d068a507` with
complete Turkish label coverage (883/883 UI strings). Resolver tests cover all
four dresses with both bottoms and every facing, plus tunic coverage that keeps
the bottom selected and visible. Validation passes 49 pipeline tests, 38 targeted
web tests, Go avatar tests, TypeScript checking and `git diff --check`.
Bottoms and footwear are next; the rest of the wardrobe, cast recipes, extra
builds and pose sets remain outstanding.

## Completed bottoms and footwear

The six new bottoms are walking shorts, cropped trousers, wide-leg trousers,
slim trousers, cargo trousers and a long pleated skirt. Together with the original
straight trousers and knee skirt, they complete the eight-option budget. Low
lace-up shoes, flats, walking sandals, mid-calf boots and clogs join the original
walking boots to complete all six footwear options.

Each uses its first built-in ImageGen candidate, retained unchanged alongside the
exact prompt in `prompts/bottom-*-candidate-1.txt` or
`prompts/footwear-*-candidate-1.txt`. New components carry fabric/shoe paint and
neutral detail only; exposed skin comes from the original mannequin. No pose,
limb or registration transform changed. All eleven pass 36 frames with zero
protected-pixel drift and no detached paint.

Profile-only region allowances retain actual occluded garment fragments:
shorts and cargo permit two regions on the left, cropped trousers on the right,
and wide/slim trousers on both profiles. These are hip patches behind hands
(16–77 source pixels) and ankle cuffs behind crossing feet (220–228 pixels).
Other facings retain one region; the long skirt passes the unchanged single-region
gate. No new bottom uses speck cleanup. Footwear normally permits two attached
regions, one per shoe. Sandals permit three only in the down-facing row where
the raised foot's exposed instep separates the ankle strap. Flats discard two
small edge fragments (12/17 pixels); clogs discard three (7/8/15 pixels). Low
shoes, sandals and tall boots use no cleanup.

The first overlap proofs showed boot shafts drawn over wide trouser cuffs and
long skirt fabric. Those two bottoms now declare upper-footwear coverage and
z-order 36, above footwear (35) and below tops (40). Fitted trousers keep their
normal order beneath boots. This is component data handled by the existing
shared resolver. Regression checks cover both boot types in all four facings.
Initial reports and proof images remain as evidence of the findings.

Each addition has three final hashed proof sets and a compact `*-final-review.png`
contact sheet. Review covers both palettes and all 36 frames: bottoms with tee,
tunic, blouse and travel jacket plus three footwear types; footwear with shorts,
long skirt and long dress. The production recipes and bakes are:

- [Summer walk: shorts and sandals](../../proofs/summer-walk.png)
- [Long skirt with flats](../../proofs/long-skirt-walk.png)
- [Wide trousers over tall boots](../../proofs/wide-trousers-walk.png)

The builder regression selects shorts and sandals and changes shoe colour. A
shared client/Go fixture retains that outfit across normalization, while dress
occupancy checks now exercise every bottom option. Client and server catalogues
match at `5a24e1bff5a4d1a1`, with complete Turkish UI coverage (894/894 strings).
All 49 pipeline tests, 40 targeted web tests, Go avatar tests, TypeScript checking
and `git diff --check` pass. The three production bakes were visually inspected.
Outerwear, headwear, extras, cast recipes, additional builds and pose sets remain.

## Completed outerwear

Waistcoat, open cardigan, tailored blazer, belted trench coat, travel cloak,
work apron and raincoat join the original travel jacket, completing eight outer
options. Every addition passes all 36 frames with zero protected-pixel drift.
The outer slot continues to layer over tops and bottoms without occupying them.

Built-in ImageGen produced and repaired these sheets. Candidate 2 is selected
for waistcoat, cardigan, blazer, cloak and raincoat; candidate 3 is selected for
trench and apron. Original candidates and exact generation prompts remain in
this directory and `prompts/outer-*-candidate-*.txt`. The first candidates had
olive trim outside the green key family, leaving gaps after extraction. Repairs
painted the trim within the existing green family, without changing the key
classifier, masks or frame transforms. The apron's final repair also joins its
bib and skirt through a continuous waistband. Initial failing checks and fit
proofs remain in `art/proofs/walk-migration/outer-*-initial-*`.

Region policies describe visible occlusion: waistcoat profile bindings, open
cardigan/blazer panels, cloak panels and cloth between limbs, and apron ties.
Every retained region must touch the mannequin. The raincoat remains one region
in every facing. Bounded edge cleanup removes islands of at most 15 pixels for
waistcoat, 13 for cardigan, 31 for cloak, 6 for raincoat, 22 for trench and 8 for
apron; blazer needs none. The trench retains a separate cuff edge in the right
stride instead of deleting it.

Two generic material validation policies handle actual facing differences.
`materialFacings` specifies where a keyed material must be present and rejects
any pixels of that material in other facings. The apron uses it because only
green neck and waist straps are visible from behind, with no violet bib.
`materialCountByFacing` compares a named material against the nine frames of
each facing, keeping the same six-pixel minimum and 0.25–4× median limits. The
cloak uses it for its small rear collar versus long front lining. Both policies
require a `materialReason`, accept only declared keys and valid facings, and
are forbidden for mannequins. Regression tests reject missing visible paint,
rear leakage, a missing collar in one walk frame and malformed catalogue data.

Each component has three hashed PNG/GIF/report proof sets, reviewed across both
palettes and all 36 frames with shirt/straight trousers/boots, blouse/long
skirt/flats and day dress/tall boots. Compact `outer-*-final-review.png` boards
show those combinations. Contrasting production recipes and bakes were also
reviewed:

- [Cloak over a day dress](../../proofs/cloak-walk.png)
- [Trench over a long skirt](../../proofs/trench-walk.png)
- [Work apron over shirt and cargo trousers](../../proofs/apron-walk.png)

Client and server catalogues match at `fd5f397c4f35e8fd`, with complete Turkish
UI coverage (901/901 strings). All 52 pipeline tests, 40 targeted web tests,
Go avatar tests, TypeScript checking and `git diff --check` pass. The original
mannequin, cap and skirt validation gates remain unchanged. Headwear, extras,
cast recipes, additional builds and pose sets remain outstanding.

## Completed headwear

Beanie, beret, felt walking hat, sunhat, bucket hat, turban and woven headband
join the original cap, completing eight options. All seven additions pass the
unchanged 36-frame checks: one attached region, zero protected-pixel drift and
both keyed materials present in every frame. No region or material validation
exceptions and no speck deletion were needed.

Built-in ImageGen supplied candidate 1 for the six hats and candidate 3 for the
headband. Raw candidates and exact prompts remain under this directory and
`prompts/headwear-*-candidate-*.txt`. Two headband repairs corrected gaps in the
green stripe; the final lock retains neutral seam pixels within two source
pixels of keyed paint (`detailReach: 2`). This keeps the painted band ends
connected without deleting them or weakening validation. Initial failing
reports and fit proofs remain alongside the final proofs. The sunhat's first
service call was rejected by the output filter; an unchanged retry succeeded.

The cap, beanie, beret and turban hide scalp hair. Felt hat, sunhat, bucket hat
and headband use `hairCrown`, retaining hair below their overlay. Bun, afro and
mohawk exclude every headwear option. Facial hair remains visible and retains
the shared hair tint. Resolver tests cover those rules in all four facings;
the builder test selects a sunhat after switching from bun to coils and edits
its ribbon colour. A shared client/Go fixture preserves sunhat and braids.

Approval records hash 53 reviewed PNG/GIF/report proof sets: three outfits for
each addition, plus eight additional hairstyles for each partial-coverage hat.
Together these cover all eleven compatible hairstyles across all 36 frames.
Compact `headwear-*-final-review.png` and `headwear-*-hair-fit-*.png` boards
record the fit review. Production recipes with contrasting hat and hair
colours were baked and visually inspected:

- [Sunhat with braids and long skirt](../../proofs/sunhat-walk.png)
- [Bucket hat with waves and shorts](../../proofs/bucket-walk.png)
- [Headband with coils and cargo trousers](../../proofs/headband-walk.png)

Client and server catalogues match at `58fb5d63b5fa1ba2`, with complete Turkish
UI coverage (908/908 strings). All 52 pipeline tests, 42 targeted web tests,
Go avatar tests, TypeScript checking and `git diff --check` pass. Twelve v1
extras remain, followed by cast recipes, additional builds and pose sets.

## Completed neckwear

Wool scarf, triangular neckerchief and loop scarf complete the three neck
options. Built-in ImageGen candidate 1 is selected for each, with raw sources
and exact `prompts/neck-*-candidate-1.txt` prompts retained. All 36 frames pass
with one attached region, zero protected-pixel drift and no cleanup or
validation exceptions. Each scarf has one tintable fabric material.

Nine hashed PNG/GIF/report proof sets cover both palettes with crop/shirt,
bob/blouse/cardigan/long skirt, and straight hair/turtleneck/trench. Compact
`neck-*-final-review.png` boards record review. Three contrasting production
recipes and bakes confirm neck attachment, face clearance and rear hair overlap:

- [Wool scarf and trench](../../proofs/scarf-walk.png)
- [Neckerchief and shirt](../../proofs/kerchief-walk.png)
- [Loop scarf and cardigan](../../proofs/cowl-walk.png)

Resolver regressions check scarf-over-coat ordering in every facing and
hair-over-scarf ordering from behind. Extras selection, recolouring and removal
are covered in the builder; the shared client/Go fixture retains a coloured
scarf over a trench. Older saves gain the catalogue's default scarf colour
without equipping a scarf. Client and server catalogues match at
`7b0c641611130b66`; Turkish UI coverage is 911/911. All 52 pipeline tests,
45 targeted web tests, Go avatar tests and TypeScript checking pass.

## Completed eyewear

Round, square and cat-eye glasses plus sunglasses complete four eyewear options.
Each visible front/profile frame contains one connected region attached to the
head. Rear cells are empty: the eyewear mask protects that facing, and the
visibility policy requires no paint there. All 36 cells pass with zero
protected-pixel drift, no connectivity exceptions and no speck deletion.

Built-in ImageGen candidate 3 is selected for the three clear styles, and
candidate 2 for sunglasses. Original candidates and exact prompts remain in
this directory and `prompts/eyewear-*-candidate-*.txt`. Initial muted violet
frames blended into cyan and broke into disconnected regions; retaining their
blue edges also made recolouring incomplete. The final repairs use saturated
magenta `#ff00ff`, still inside the existing primary-key family. Clear styles
retain only primary paint, leaving open lenses and fully tintable frames.
Sunglasses retain primary frames plus natural dark lenses and edge detail;
`detailReach: 5` includes their painted lens interiors. No classifier or
extraction-code change was needed. Earlier failing checks and fit proofs remain
as diagnostics, separate from the final approval hashes.

Twenty-four hashed PNG/GIF/report proof sets cover every eyewear option with all
six face sets, six hairstyles, cap/beret/headband and a loop scarf with cardigan.
The `eyewear-*-face-fit-0.png` and `-1.png` contact sheets show every frame in
both palettes. Four contrasting production recipes were baked and reviewed:

- [Round glasses and neckerchief](../../proofs/glasses-round-walk.png)
- [Square glasses and blazer](../../proofs/glasses-square-walk.png)
- [Cat-eye glasses and bob](../../proofs/glasses-cat-eye-walk.png)
- [Sunglasses](../../proofs/glasses-sunglasses-walk.png)

Regression tests cover glasses with every hat, independent frame tint, fixed
lens tint, Extras selection/colour/removal and saved avatars with glasses, hat
and scarf. Older saves gain the default frame colour without equipping glasses.
Client and server catalogues match at `ff2d38be22b5dd5e`; Turkish UI coverage is
915/915. All 52 pipeline tests, 47 targeted web tests, Go avatar tests,
TypeScript checking and `git diff --check` pass. Four bags and the lantern remain
in the v1 catalogue; cast recipes, additional builds, pose sets and expressions
remain in later phases.

## Slot masks and waves migration

All fourteen catalogue slots now have masks, including short/long hair,
short/long outerwear and a full-length dress variant. The later shoulder-length
hair and upper-thigh tunic variants bring the total to nineteen masks.
Bounds use each frame's registered head, neck, waist and ground landmarks.
`kit --slot <slot>` generates every mask variant even when the slot has no
catalogue candidates yet; `--mask <name>` chooses just one. Kits remain derived
and ignored by Git. Tests check every mask in all 36 cells, invalid landmarks,
and kit generation without entries.

The legacy waves candidate was re-locked against the mannequin first. It failed
the single-region gate because side-profile hair included separate locks below
the chin; a targeted ImageGen repair still failed in the left-facing row.
Candidate 3 was generated directly on the corrected mannequin using the old
candidate as a hairstyle reference. It passes unchanged validation with zero
protected drift and one connected region in all frames. This is a documented
regeneration after failed re-locking, rather than a lossless migration claim.
The original is retained at `art/source/player-edits/hair-waves-candidate-1.png`;
repair candidates 2/3 and exact prompts live here. The cap interaction proof was
re-reviewed against the approved new-kit waves and its approval hashes updated.

Both repair calls used built-in ImageGen. Candidate 2 used the legacy input
flattened over #fafafa; candidate 3 used the hair kit's `base-visible.png` as
the edit target and that same flattened legacy input as the hairstyle reference.
The final reusable prompt and lock provenance sit beside `hair-waves.png`.

Kits are generated under `kits/<build>/<mask>/` and ignored by Git. They contain
an RGBA base, a white-composited `base-visible.png` for image-generation input,
transparent-where-editable alpha and white-where-editable BW masks, and a prompt.
The white composite prevents hidden RGB below transparency from being treated
as a background reference. Locked output always uses the original RGBA base.
`--rows` also emits exact base/mask row crops and reassembly coordinates. The
source row heights are 258, 254, 256 and 256; never resize a returned row to fit.

## Generation provenance and earlier failure

All artwork was generated with built-in ImageGen, not a CLI/API fallback.
Exact submitted prompts are retained in `prompts/`:

- `body-regular-candidate-2.txt`: original motion master composited over #fafafa.
- `body-regular-candidate-3.txt`: candidate 2 composited over #fafafa, removing
  residual coat tails and smoothing the opaque base suit.
- `headwear-cap-candidate-1.txt` and `bottom-skirt-candidate-1.txt`: corrected
  locked mannequin composited over #fafafa.

The raw PNGs are retained unchanged. White input composites can be regenerated
with Sharp's `flatten({ background: '#fafafa' })`; they are input views, not
replacements for the raw candidates or protected master. The catalogue links
each selected candidate to its exact generation prompt. The `.prompt.txt` beside
a locked file is the current reusable catalogue prompt, which can differ from
the submitted targeted edit prompt.

Candidate 1 and [its rejected proof](../../proofs/body-regular-rejected-1.png)
are retained as failure evidence. It had no fully transparent pixels and left
old clothing behind under the additive lock. The earlier down-facing fallback
was rejected by the image service's output safety filter; its exact prompt is
`prompts/body-regular-row-0.txt`, request ID
`f8eb489e-b56d-4fa1-90de-d10cac829b46`. This iteration used a plain opaque cyan
suit and clean input views; no fallback API or per-limb editing was used.

## Completed bags and held lantern

Four bags complete the v1 Extras wardrobe: crossbody satchel, small backpack,
shoulder tote and belt pouch. Built-in ImageGen candidate 2 supplies satchel,
backpack and pouch; tote candidate 3 repairs a far-side strap that showed
through the near arm. Exact generation and repair prompts are saved in
`prompts/bag-*-candidate-*.txt`, alongside the unchanged raw candidate files.

Bag paint uses saturated magenta within the existing primary key family.
The generic lock keeps one pixel of adjacent detail, ignores cyan mannequin
paint and removes isolated specks of at most 12 source pixels. Each entry
records a bounded per-facing region policy for the visible strap/bag sections
separated by arms. Every retained region must touch the mannequin; protected
pixel drift is zero across all 36 frames. Front/rear assemblies remain single
regions except the tote's front view, where the hand can divide the bag.
The painted visible portions draw at z=85 over clothing in all facings.

All four bags have hashed PNG/GIF/report proof sets over shirt and trousers,
a day dress and a trench coat, with two tint palettes. The
`bag-*-final-review.png` boards collect the reviewed overlaps. Production bakes
use contrasting bag and garment colours for a separate overlap check:

- [Satchel and trench](../../proofs/satchel-lantern-walk.png)
- [Backpack and shirt](../../proofs/backpack-lantern-walk.png)
- [Tote and dress](../../proofs/tote-lantern-walk.png)
- [Belt pouch and shorts](../../proofs/belt-pouch-lantern-walk.png)

The lantern uses built-in ImageGen candidate 2. Candidate 1 changed hands in
the left-facing row; the repair moves the lantern to the anatomical right
hand while extraction preserves the original cyan limbs. The held mask begins
25 source pixels above the waist, excluding unrelated upper-body details.
The lock ignores all three reserved keys, removes enclosed white background
holes and isolated edge specks of at most 20 source pixels. Brass, amber glass
and charcoal detail retain their natural colours. All 36 frames pass the
single-region and silhouette-attachment checks with zero protected drift.
Rear and left views draw at z=5 to respect the body and clothing occlusion;
front and right views draw at z=90. Five hashed proof sets cover the mannequin
and all four bags; `held-lantern-final-review-0.png` and `-1.png` collect them.

Recipes for the four production bakes are in `recipes/*-lantern-walk.json`.
The builder exposes bag colour independently of neckwear and eyewear, and
lantern selection has no colour control. A shared client/Go fixture exercises
bag colour and lantern persistence, while historical fixture inputs remain
unchanged and receive the new default bag colour on normalization. Resolver
and builder tests cover facing order, fixed lantern colours and independent
selection/removal. Verification: 52 pipeline tests, 50 targeted web tests,
TypeScript, Go avatar tests and matching client/server catalogue copies pass.

## Phase three: cast conversion complete

The main nine characters, all 23 original-town route/activity identities and
all 160 people across ten expedition regions have approved V2 recipes under
`cast/`: **192 of 192 identities**, with no missing recipes or candidates awaiting
review. The inventory is derived from the actual content, region, route and
scene definitions rather than a separate name list.

`scripts/character-cast.mjs` uses the same resolver/compositor as players.
It writes one runtime atlas per identity and a full editor-resolution 36-frame
proof. Its approval gate binds recipe bytes, proof pixels, atlas bytes and the
component asset version. Changed recipes or artifacts cannot silently enter
the compiled cast manifest. Catalogue notes link the original painted reference
and document approximations to clothing or props. Every current recipe uses
the regular build; the source cast's varied body proportions await phase four.

```sh
node scripts/character-cast.mjs inventory
node scripts/character-cast.mjs status
node scripts/character-cast.mjs bake marta
node scripts/character-cast.mjs build
node --test scripts/character-cast.test.mjs
```

The world loads regional cast atlases with the region and releases them on
travel. Main-cast atlases remain available across regions. Each converted
walking character uses one sprite, four real facing rows and distance-driven
walk frames, with shared indoor scaling and ambient tint. Missing cast textures
retain the existing painted fallback. The original sit, work, read and carry
action sheets still take over for authored activities, then yield to the
component sprite when walking resumes.

All nine main sheets and nine original route looks were reviewed in full.
Four explicit action-art looks supply the fourteen activity identities; their
duplicate recipe/proof hashes were checked. Saffron Court's sixteen full sheets
were reviewed against the existing painted atlas and its source prompts.
The remaining nine regions each have six review boards covering all sixteen
full 36-frame sheets, plus a reference board from their original painted atlas.
All boards were visually reviewed for facing consistency, garment continuity,
hair/headwear interactions, accessory overlap and reference colours. Clothing
without a matching v1 component uses the approximation recorded in its entry;
special props and painted portraits remain in the original artwork.
The refinement board records shorter curls for Anas and matching neck wraps for
Hajar and Meryem. Proofs and approval hashes live in `cast/catalogue.json`
and `art/proofs/character-cast/`.

- [Main cast review](../../proofs/character-cast/main-review-0.png)
- [Saffron Court reference](../../proofs/character-cast/saffroncourt-reference.png)
- [Saffron Court refined outfits](../../proofs/character-cast/saffroncourt-refined-review.png)
- [Café runtime proof](../../proofs/character-cast/cafe-browser.png)
- [Preserved parcel action](../../proofs/character-cast/action-browser.png)
- [Saffron Court runtime proof](../../proofs/character-cast/saffroncourt-browser.png)
- [Cedar Bay runtime proof](../../proofs/character-cast/cedarbay-browser.png)
- [Seoul Steps runtime proof](../../proofs/character-cast/seoulsteps-browser.png)
- [Dune Garden runtime proof](../../proofs/character-cast/dunegarden-browser.png)

Targeted world tests cover converted/fallback sprites, four facings, reduced
motion, indoor scaling, asset release in all thirteen maps and transitions between painted
actions and component walking. Browser QA confirms café sizing, preserved
parcel carrying and successful travel to Waldruh, Saffron Court, Cedar Bay,
Seoul Steps and Dune Garden without console errors or pending assets.
All 769 web tests, three cast-tooling tests (including inventory completeness),
TypeScript checking, the production build and `git diff --check` pass.

## Phase four: additional builds published; pose sets pending

All eighteen reduced-wardrobe components are visually reviewed, hash-approved
and published: each slim/broad mannequin, soft face, waves hair, collared shirt,
short-sleeve tee, straight trousers, knee-length skirt, walking boots and travel
jacket. The client/server catalogue contains 100 components across three builds
at version `df13fa66433fcfbb`.
Seated, wave and lantern-raise pose sets and dialogue expressions remain pending.

### Shared padded grid

Both builds now use `builds/{slim,broad}/grid-v2/walk.registration.json`, their
own re-registered regular reference master, and `body-{slim,broad}-walk-v2.png`.
Every component uses the same complete-frame affine mapping: scale 0.625,
vertically offset 18 canonical pixels, horizontally centred in its source cell.
Canonical poses and 128×192 editor/64×96 runtime dimensions stay unchanged.
The 1536×1024 source still has exactly 36 non-overlapping cells. This leaves
space for painted hair crowns instead of cropping them at a row boundary.

The generic `reproject` command composes source and destination affine maps and
samples once with premultiplied bilinear interpolation. It no longer resamples
through an intermediate editor atlas. Regression tests cover byte-exact identity,
transparent-pixel colour recovery and isolation from neighbouring cells.

Both mannequins pass all 36 frames with 100% skin-key coverage, one connected
region and zero protected-pixel drift. Minimum head silhouette overlap is 0.8084
for slim and 0.8016 for broad; maximum anchor drift is 2.5 and 1.875 editor pixels.
The original overlap limit of 0.8 and anchor limit of three pixels are unchanged.
Historical raw candidates, integer-alignment metadata, original registration,
locked sheets and clothed references are preserved. Each `grid-v2` directory
also retains the previous catalogue entries and their reviews.

### Wardrobe and faces

Shirt candidate 2 reaches the upper hip, and each build's bottom mask extends
eighteen canonical pixels above its inherited waist landmark. The generic
`detailEnclosedBy: "primary"` policy keeps shirt buttons while rejecting exterior
neutral fringe. Shirts, tees, trousers and boots retain the mannequin underneath;
tees and boots export keyed fabric only. Both tees use candidate 1, painted on
the padded clothed references. Fitted boots use candidate 3 from the earlier
reference grid, re-registered as complete frames.

Slim soft face uses candidate 2; broad uses candidate 1. Declared brown ink
recovery separates facial features from cyan underpaint, including near-opaque
pixels after registration. Slim removes isolated one-pixel extraction specks
without increasing the eight-region face limit. The faces retain visible profile
features, and all nine rear-facing heads contain no feature paint.

The first hair candidates exposed the old grid's clipped crowns. They remain
as historical source material and are superseded by slim candidate 3 and broad
candidate 2, generated on the padded grid. Both pass a new explicit one-pixel
`validation.cellMargin` gate in every frame. The shoulder-length hair masks end
at the upper shoulders, excluding hands. In the slim left-facing standing pose,
the ear separates a small front curl from the main hair mass; the declared
left-facing two-region exception records this observed occlusion, with both
regions still attached to the head.

### Current proofs and provenance

The current proof PNGs, animated GIFs and JSON reports are under
`art/proofs/builds/grid-v2/`. Every migrated component was rechecked and visually
reviewed through all 36 frames in two palettes before its approval hashes were
renewed. All eighteen entries are now approved in the published catalogue.

- [Slim mannequin](../../proofs/builds/grid-v2/body-slim.png)
- [Broad mannequin](../../proofs/builds/grid-v2/body-broad.png)
- [Slim face](../../proofs/builds/grid-v2/face-soft-slim.png)
- [Broad face](../../proofs/builds/grid-v2/face-soft-broad.png)
- [Slim hair and shirt outfit](../../proofs/builds/grid-v2/hair-waves-slim.png)
- [Broad hair and shirt outfit](../../proofs/builds/grid-v2/hair-waves-broad.png)
- [Slim tee outfit](../../proofs/builds/grid-v2/top-tee-slim.png)
- [Broad tee outfit](../../proofs/builds/grid-v2/top-tee-broad.png)
- [Slim skirt](../../proofs/builds/grid-v2/bottom-skirt-slim.png)
- [Broad skirt](../../proofs/builds/grid-v2/bottom-skirt-broad.png)
- [Slim jacket and skirt](../../proofs/builds/grid-v2/jacket-skirt-slim.png)
- [Broad jacket and skirt](../../proofs/builds/grid-v2/jacket-skirt-broad.png)
- [Saved broad build in the browser](../../proofs/builds/grid-v2/builder-broad-browser.png)
- [Resolved cell-boundary audit](../../proofs/builds/grid-v2/hair-headroom-review.json)

The padded generation references, immutable editor layers, reference specs and
registrations are in `builds/{slim,broad}/grid-v2/`. Do not overwrite the earlier
references or these frozen layers when exporting later wardrobe pieces. Raw
images and exact per-candidate prompts remain in the source kit and `prompts/`;
all generations used built-in ImageGen. Earlier moderation-rejected boot attempts
have retained prompts but no image file.

Full-colour shirt and tee recipes are saved in each build's `grid-v2` directory;
their editor atlases and reports live beside the proofs. These now bake as full
recipes, without preview mode, because the required face components are present.
These full-colour bakes were reviewed with a temporary in-memory catalogue before
publication. Additional shirt/tee, jacket and skirt recipes and bakes make the
waistband and trim overlap visible in contrasting colours.

The pipeline suite covers grid routing, provenance, clipping, whole-frame
translation and reprojection, material extraction, the explicit cell-clearance
gate, and every approved or visually reviewed staging component.

Both skirts use candidate 1 and retain their own cyan lower legs. The broad
jacket uses candidate 1; slim uses candidate 3 after earlier olive trim and
floating lapels were rejected. Slim removes an isolated sixteen-pixel, two-pixel-wide
hem artifact through the existing speck policy. Jacket panels have a documented
four-region allowance for profile occlusion, with every retained region attached.
No global attachment or silhouette limit was relaxed.

All 57 pipeline tests pass, including every reviewed component. The 772 web
tests, three cast-tooling tests, Go avatar tests, TypeScript check and production
build pass. Shared client/Go fixtures cover both new wardrobes; builder tests
cover build switching, compatible option retention, filtering and randomisation.
An isolated browser session on ports 5193/8099 saved slim, changed to broad and
reloaded broad successfully, with no console errors. All 192 cast atlases were
rebaked against the new asset version; their proof hashes are unchanged, and
the cast manifest passes its existing review/version gates.

The asset hot reload also exposed a late narration callback after Phaser audio
teardown. `World.setNarrationActive` now ignores calls after destruction. The
47 audio/travel tests, including a regression for the delayed callback, and the
production build pass; a repeated browser reload produced no audio error.

## Phase four: pose-set pipeline and wave master

The source catalogue can now declare `poseSets` with a label, a description of
its nine columns and nine frame durations in milliseconds. Entries use
`poseSet: "wave"` (omission means `walk`); recipe option IDs stay the same across
poses, while component IDs remain unique. A build's `poseSets` table gives each
action its own master, mannequin, registration and masks. All action grids keep
36 frames, four facings and the same canonical/runtime cell dimensions.

`kit`, `prompt`, `lock`, `check`, `export`, `proof`, `batch` and `status` accept
`--pose-set`. Explicit mismatches fail. `batch` defaults to walking components;
pass `--pose-set wave` for the action batch. Individual entry commands infer the
pose when the flag is omitted. Action kits live under `kits/<build>/<pose>/<mask>`.
Prompts describe the actual sequence; animated proofs use its declared timing.
Pose metadata is bound into lock provenance. Proofs refuse mixed builds or pose
sets, including legacy walking fixtures.

The export manifest gains a `poseSets` table. Compiled action components live
under `poseSets.<id>.components`, separate from the builder's walking options.
A pose component must have an approved mannequin for its build and pose, and an
approved walking option with the same recipe identity and compatible tint keys.
`catalogueForPose()` selects these action sheets without falling back to walking
pixels. `bake --pose-set wave` rejects missing equipped components before writing
an atlas, uses distinct texture keys and records the pose in its report.

The first regular wave mannequin uses built-in ImageGen candidate 1. Its raw
source, exact prompt, measured original registration, padded target registration
and reprojection provenance are retained under `poses/wave/regular/` and the
source kit. Every mapping is one isotropic transform for the whole figure;
there are no limb transforms. The source has 36 independent figures with real
transparency. The posed master defines new action geometry; its silhouette is
not compared to an unrelated walking frame.

[Wave mannequin proof](../../proofs/poses/wave/body-regular.png) was reviewed
through all 36 frames in two palettes. Every frame passes with 100% skin coverage,
one connected region, zero protected-pixel/anchor drift and zero cell-edge paint.
The mannequin and its matching soft face, waves hair, shirt, straight trousers,
boots and travel jacket are now approved and published. The catalogue contains
100 walking components plus seven wave components at `a76799e3c20d0d91`.

All 59 pipeline tests pass, including pose-specific IO, stale metadata rejection,
action-sheet selection, missing wardrobe rejection and all approved/staged art.
TypeScript checking passes. Seated and lantern-raise masters and wardrobes, world
action playback and dialogue expression variants remain outstanding.


### Wave wardrobe and browser preview

The six new wardrobe pieces retain their built-in ImageGen sources and exact
prompts under `prompts/*-wave-candidate-*.txt`. All use candidate 1 except the
soft face, whose second candidate restores profile feature ink. Hair and clothing
extract their keyed paint while preserving the cyan mannequin. The jacket has
two open front panels, each attached to the body; other facings require one
region. Face ink is checked in its three visible facings, with no rear features.

All 36 frames were reviewed in two palettes and in complete contrasting-colour
shirt/jacket bakes. The hash-bound reviews reference
[shirt outfit](../../proofs/poses/wave/shirt-outfit-complete.png),
[jacket outfit](../../proofs/poses/wave/jacket-outfit-complete.png), and
[face](../../proofs/poses/wave/face-soft.png) proofs. Complete source recipes live
in `poses/wave/regular/`; full-colour bakes live beside the proofs.

`bakeAvatarPixels`, `avatarFramePixels`, `paintAvatar` and `bakeAvatarTexture`
accept `poseSet`. Action sheets use a distinct cache identity and the same shared
compositor. Unsupported equipped pieces are rejected before loading, rather
than silently changing a recipe. The builder's animation selector offers
Standing, Walking and compatible published poses. A wardrobe change that no
longer supports Wave returns to Standing and keeps the chosen clothing. The
four-facing strip shows the action, variable frame durations govern playback,
and reduced motion uses a static action frame. Preview selections are not saved
as avatar fields.

The browser wave bake matches every visible pixel of the reviewed offline atlas.
All 779 web tests and 59 pipeline tests pass, as do Go avatar tests, TypeScript
and the production build. All 192 cast sheets were rebaked at the new asset
version; the existing proof hashes still match their approvals. Isolated browser
QA verified Wave, facing changes, a 390px mobile layout, and selecting a skirt
while waving. The skirt stays selected and the preview returns to Standing.
No browser console errors were reported. Screenshots are
[desktop](../../proofs/poses/wave/builder-wave-browser.png) and
[mobile](../../proofs/poses/wave/builder-wave-mobile.png).


### Seated pose set

The regular seated mannequin and six matching wardrobe pieces are now published
under `poseSets.seated`: soft face, waves hair, collared shirt, straight trousers,
boots and travel jacket. Together with Wave this makes 14 action components,
separate from the 100 walking components, at asset version `c37ff80d15a9c2cc`.
All new source images were generated with built-in ImageGen. Raw candidates and
exact prompts are retained in the source kit and `prompts/*-seated-candidate-*.txt`.

The mannequin uses candidate 1. Its measured source registration applies a
uniform 0.5 scale and whole-frame translation to align head centres and soles;
seated figures remain shorter than standing figures. Knees and hips bend, hands
rest on thighs, and there is no chair baked into the sprite. Every frame has
100% skin coverage, one region, zero protected drift and zero cell-edge paint.

The wardrobe uses candidate 1 except the face. Face candidate 1 passed mechanical
checks but placed the front features too low and far apart to read clearly in the
assembled outfit. Candidate 2 puts smaller features inside the original head.
The jacket's existing speck filter removes isolated 13–17 pixel violet flecks
below the hands with a component-specific 18-pixel cutoff. Its front still allows
only the two open jacket panels; no global validation limit changed.

All 36 frames were visually reviewed in two palettes and contrasting-colour
shirt/jacket bakes. Hash-bound approvals reference
[shirt outfit](../../proofs/poses/seated/shirt-outfit-complete.png),
[jacket outfit](../../proofs/poses/seated/jacket-outfit-complete.png), and
[face](../../proofs/poses/seated/face-soft.png) proofs. The initial failed jacket
proof remains as `outer-travel-diagnostic.*`; it is not an approval artifact.

Browser/offline pixel parity and editor compatibility tests cover both published
actions. All 781 web tests pass, together with the 59 pipeline tests including
the reviewed seated art. The browser showed the assembled seated pose and all
four views without console errors; see
[seated preview](../../proofs/poses/seated/builder-seated-browser.png).
The pose selector leaves saved recipes unchanged. Lantern-raise art, world action
playback and dialogue expression variants remain outstanding.


The seated publication also passes all 15 derivative/catalogue tests, Go avatar
validation, TypeScript, three cast tests and the production build. All 192 cast
atlases were rebaked at `c37ff80d15a9c2cc`; their existing reviewed proof hashes
are unchanged. Per-pose `publication-review.json` files summarize the final
checks. The temporary QA browser tabs and local servers have been closed.


### Cast-compatible action wardrobe and world greetings

The gathered blouse and open blazer now have reviewed Wave and Seated sheets.
The published catalogue contains 100 walking components and 18 action components
(nine per action) at asset version `41c6ee26875d17e2`. Exact built-in ImageGen
prompts and raw candidate-1 PNGs remain under `prompts/` and the source-kit root;
locked sheets are under `poses/{wave,seated}/regular/`.

All four additions pass all 36 frames with zero protected-pixel drift. The seated
blouse's front-facing hands occlude two small side-hem sections. Its declared
front region limit is three, with the reason recorded in the catalogue; every
region must still touch the mannequin. This does not change the mannequin or
other components' connectivity checks. Reviewed proofs include each blouse alone
and under its blazer, in two palettes, plus the actual promenade-reader recipe:
[Wave](../../proofs/poses/wave/blazer-outfit.png) and
[Seated](../../proofs/poses/seated/blazer-outfit.png).

`character-cast.mjs bake [ids...] --pose-set wave` now bakes the unchanged cast
recipe against a complete matching pose catalogue. Action reports, atlases and
proofs live under `poses/<pose>/`; source cast entries track each pose's status
and separate visual review. Publication checks recipe, pose identity, current
asset version, proof/atlas hashes and approval. Candidates are excluded. Walking
reviews cannot approve action sheets. The published cast manifest includes each
approved action's nine frame durations.

Four authored greeters have reviewed wave atlases: Bea (library), Felix (ferry),
Theo (riverside) and Emil (Waldruh supply yard). The world samples the shared
activity phase time and four-direction pose row on the existing walking sprite.
Reduced motion holds a raised-hand frame; leaving the action restores walking.
Only stationary, empty-handed greetings use Wave. The same routing recognizes
empty-handed seated tasks when a resident has an approved Seated atlas. Book,
parcel and tool actions keep their existing painted poses and prop handling.
Regional load/release includes action textures, and missing action downloads
fall back to the painted artwork. No resident recipe or schedule was changed.

All 192 walking atlases were rebaked; all existing reviewed proof hashes remain
unchanged. The 783 web tests, four cast tests, 15 publication tests, TypeScript
and production build pass. Browser QA shows Bea greeting at the library, with
no console errors: [world proof](../../proofs/poses/wave/world-bea-wave-browser.png).

### Raise lantern pose and equipped-item requirement

The regular mannequin now has a separate, reviewed Raise lantern grid: rest,
lift, five raised holds, lower and rest, in all four facings. Its eight components
are the full-skin mannequin, soft face, waves hair, shirt, straight trousers,
boots, travel jacket and lantern. Together with Wave and Seated, this publishes
26 action components alongside 100 walking components at `7e8d2d6ebd74dcae`.
Raw built-in ImageGen candidates and exact prompts are retained; locked sources,
registration and masks live under `poses/lantern-raise/regular/`.

The body has one connected skin region in each frame, complete skin coverage and
zero protected-pixel drift. The jacket declares the visible cuff/hem occlusions
in its front and left region limits; every region must still touch the mannequin.
Lantern candidate 1 failed because a handle wire separated in frame 25. The
reviewed candidate 2 repairs that wire and has one connected attached region in
all 36 frames. Facing-aware order puts the lantern behind the far hand/body in
the back and left rows.

Reviewed [shirt](../../proofs/poses/lantern-raise/shirt-outfit.png) and
[jacket](../../proofs/poses/lantern-raise/jacket-outfit.png) proofs show every frame
in two palettes. The full-colour editor atlases use the same recipes as browser
parity tests. The pose definition declares `requiredParts: {held: "lantern"}`;
shared recipe validation rejects an empty hand before loading sheets. Removing
the lantern while previewing the action returns to Standing and preserves all
other choices. The builder's animation selector fits the longer action label.

Browser QA verified four facings, item removal and zero console errors:
[builder proof](../../proofs/poses/lantern-raise/builder-lantern-browser.png).
All 192 walking cast atlases and four approved wave atlases were rebaked for the
new catalogue version; their reviewed pixels and recipe hashes are unchanged.
Dialogue expression variants were the final phase-four item at this publication;
the following review records their completion.

### Dialogue expressions

The current publication adds two detail-only face variants for `regular/soft`:
`smile` and `worried`. They are separate from the 100 walking components and 26
action components, sharing the neutral face's identity, materials and rules.
They cannot be saved as new face options. Explicit dialogue cues replace only
the portrait's face; uncued lines reset to neutral. Unsupported face/build pairs
retain their own neutral face, and unsupported story portraits retain painted art.

Built-in ImageGen produced smile candidate 1 and worried candidates 1–2. The
original worried candidate lost coherent eyebrow strokes during extraction;
candidate 2 is the reviewed source. Raw outputs and exact prompts are retained.
Declared brown ink recovery removes cyan underpaint from untinted facial detail.
The worried entry allows ink recovery to evaluate blended edge pixels instead of
discarding them as skin first. Two-pixel specks are removed; the existing eight
facial-region limit, silhouette attachment and empty rear-head checks still pass.

Review covered every frame, two skin/tint palettes, bare and clothed compositions,
enlarged four-facing heads and Marta's actual portrait crop. Catalogue approvals
bind the locked art and PNG/GIF/report hashes. See the
[portrait comparison](../../proofs/expressions/marta-comparison.png),
[browser dialogue proof](../../proofs/expressions/dialogue-browser.png) and
[publication report](../../proofs/expressions/publication-review.json).

The first two café introduction lines explicitly cue smile and worried; the next
line is neutral. Browser QA verified these changes and Otto's exact neutral
fallback without modifying game progress. Tests cover face-only pixel changes,
browser/Node parity, expression cache separation, rapid asynchronous replacement,
strict unsupported-combination rejection and QuestController cue forwarding.

All 192 walking and four wave cast atlases were rebaked at
`f023205a1a21d51f`; existing reviewed proof hashes remain unchanged. The manifest
now includes each validated recipe for portrait composition. Final validation:
794 web tests, 44 pipeline/reference tests, 16 asset tests, four cast tests,
TypeScript, Go avatar checks and production build passed. The build retains its
existing large-chunk and mixed static/dynamic import warnings. Browser QA reported
no console errors. The [completion audit](../../../docs/character-components-completion.md)
maps every plan requirement to its delivered scope and evidence.

Publication verification: 787 web tests, 44 pipeline/reference tests, 15 asset
publication tests, four cast tests, Go avatar validation, TypeScript and the
production build pass. The final web run used two workers and a 15-second test
timeout after the existing rainy-day simulation exceeded five seconds during
concurrent builds. Its isolated seven-test file passed in 2.53 seconds; no
application or test-source timeout was changed. Exact verification and proof
hashes are in [publication-review.json](../../proofs/poses/lantern-raise/publication-review.json).
