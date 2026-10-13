# Character components completion audit

**Player portrait correction completed, 2026-10-13.** Dedicated native 256×256
components now cover every supported customization and expression, replacing the
51px crop path. Actual-size desktop/narrow proofs and retained artwork are in
[player portraits](../art/source/player-portraits/README.md). This completes the
portrait correction; it does not complete the separate world/editor rebuild.

**Reopened after visual rejection, 2026-10-13.** The implementation checks below
did not establish acceptable on-screen detail. The user rejected the resolution
of the entire generated character set. The 64×96 world frames, 128×192 editor
frames and roughly 51×51 portrait crops are insufficient at the game's actual
display sizes. This document is a historical implementation audit, not a current
claim that the character artwork is complete. Native high-resolution replacement
and full-set screen review are required; see [resolution rebuild](character-resolution-rebuild.md).

2026-10-13. This records the delivered scope of the
[character components plan](character-components-plan.md). Asset version:
`f023205a1a21d51f`. Sources, exact generation prompts, failed candidates,
registered derivatives and visual approvals remain in
[`art/source/character-kit`](../art/source/character-kit/README.md).

| Requirement | Delivered evidence |
| --- | --- |
| Phase-zero gate before foundation | Mannequin, cap and skirt each pass all 36 frames with zero protected-pixel drift. Full cyan mannequin coverage, registered head/foot anchors, cap/hair hide rule and skirt-carried legs are documented in the kit's reviewed-results and spike-corrections sections. Fresh read-only checks reconfirmed the gate at completion. |
| Generic pipeline | `character-kit.mjs` provides kit, prompt, lock, check, export, proof, batch, status, build-catalogue and bake. Slot masks, key separation, source hashes and visual approval are data driven. Thirteen bespoke legacy scripts/tests were retired after replacement. |
| Shared recipe and rendering | Browser and Node use the same resolver and compositor. Tests cover dress occupancy, hides, exclusions, overlap metadata, per-facing order, material tints and exact visible-pixel parity. Players use one baked sprite with a 32-texture LRU and ownership release on departure. |
| Persistence | Schema-v2 allowlists are compiled for browser and Go from the same catalogue. Shared v1 fixtures, removed/unknown options, colour keys and persistence round trips are tested. |
| Builder | Slot tabs, lazy thumbnails, equipped-sheet loading, material colours, six presets, randomisation, inline rule explanations, standing/walk/facing controls and actual-avatar portraits are implemented. Desktop, saved-avatar and narrow-screen proofs are linked from the kit README. |
| Regular catalogue | 82 approved walking components: body 1; face 6; markings 3; facial hair 4; hair 14; headwear 8; top 12 including four dresses; outer 8; bottom 8; footwear 6; eyewear 4; neck 3; bag 4; held 1. Optional none choices require no asset. |
| Story cast | 192 authored identities have validated recipes and reviewed 36-frame walking atlases. Main cast, town residents and expedition residents use these where the action is supported. Existing painted actions remain for uncovered work and props. |
| Extra builds | Slim and broad each have an independently generated mannequin, registration, masks and nine-component reduced wardrobe. Together with regular this publishes 100 walking components. |
| Pose sets | Wave (9), Seated (9) and Raise lantern (8) publish 26 separately registered action components. The builder only offers fully compatible outfits. Four residents use approved wave atlases in their greeting schedules. Raise lantern requires the actual lantern; removing it restores Standing. |
| Dialogue expressions | Two reviewed face variants, smile and worried, match regular/soft. Authored Marta cues change the portrait without changing the recipe. Unsupported identities retain their own neutral face; unsupported painted cast portraits remain available. Cache identity and async stale-result tests cover rapid dialogue changes. |
| Constraints | Painterly keyed artwork; one shared transform per whole frame; no skeletal animation or per-limb transforms; runtime player composition; offline story-cast composition. |

The initial phase-four scope is deliberately a reduced wardrobe and matching
pose/expression coverage. It does not provide every garment for every build or
every action for every resident. The data model supports extending those sets;
unsupported combinations keep their established fallback instead of substituting
another face or outfit.

Validation at completion: 794 web tests, 44 pipeline/reference tests and 16
published-asset tests passed; TypeScript and Go avatar checks passed. Cast
publication and the expression browser review are recorded in
[`publication-review.json`](../art/proofs/expressions/publication-review.json).
Historical reports retain the asset version and scope they tested.
