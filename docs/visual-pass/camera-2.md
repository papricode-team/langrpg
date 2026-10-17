# Camera — second visual pass

Read `AGENTS.md`, the fixed art direction, both first-pass handovers relevant to this work, and the visual review. Viewed the target and a 2× crop around Marta, Greta and Lina. Kept the realistic painted cast and the painted brass/leather kit. No git operations, repository-wide generators, servers or browsers were used.

## Changes

- Outdoor adults target **10% of CSS viewport height**, with **60 px mobile / 72 px desktop** floors and a 120 px ceiling. Rooms target 12%, capped at 144 px, using their authored adult height. Map-cover bounds and the conversation multiplier of 1.12 remain. At 1920×1080 the nominal outdoor adult is 108 CSS px; at 1280×720, 72 px; at 390×844, 84.4 px. Landscape phones retain 60 px. Small maps and extreme aspect ratios can require a closer camera to cover bounds.
- Story NPCs show white, outlined **13 px Fraunces names above the head** and **12 px DM Sans roles below the feet**, including phones. Positions use actual body height and inverse zoom, so room scale and conversation zoom cannot bury the captions. Labels fade with screen-space distance to 45% opacity, with nearby/hovered characters at full opacity. Conversation/cinematic controls suppress exploration labels. Ambient resident names/captions remain proximity-only; the ambient schemas have no occupation field, so their caption is the conservative “Resident.” Story roles use existing authored data. The active story objective retains a small diamond, now sized in CSS pixels and separated from the name. Prompt plates sit below the role.
- Hit targets now retain **44 CSS px on Retina**, rather than 44 backing pixels. Narrow painted doorway hit targets receive the same floor. Portal Exit glyphs also counter-scale to retain their 12 px size. The physical interaction radius remains 140 world units (about two adults); it does not grow simply because the camera pulls back. Scenery/actor culling uses the actual camera world view, and the current ground renderer has no zoom-dependent tile-streaming/detail threshold. Texture quality is governed by device/performance tiers, rather than the old camera zoom.
- Buildings, trees, stalls and matching canopy/detail assets receive **cached alpha-silhouette cast shadows**, projected lower right and blurred once. Bake resolution is bounded to 320 px on the source's longest axis; repeated placements share a texture by frame/pivot/flip. Ground shadows sit above terrain/track and below upright scenery and characters, and do not inherit character occlusion cutouts. They follow editor previews, visibility, ground-contact comparison controls and day/night crossfades. Cast-aware culling retains shadows whose building is off screen. Medium/High bake lazily on visibility; Low skips rendering/baking. Night uses a weaker cooler shadow. Last-owner disposal releases each generated GPU texture. Existing contact strips and character contact shadows remain.
- `loadWorldUi` reserves image/atlas keys **when queued**, across all scene loaders sharing a texture manager. Boot, Travel and Interior wait for the owning queue. Completion/shutdown removes reservations/listeners, failures cannot leave create waiting on a new unstarted loader, and abandoned async scene creates cannot resume into a later run.
- Cutscene transitions now finish fading out the current dialogue container **before** changing text, starting voice or typing the next beat. No duplicate outgoing text is drawn.
- The train loads at native resolution even on Low. It starts centred at foreground scale, aims for 92% width, crops tall artwork through viewport framing, and never exceeds **1.25× decoded native pixels**. On a 1280 px Retina CSS viewport the native cap allows a 960 CSS px train. Wider/higher-density screens deliberately respect the cap. Motion then carries it out to the right; reduced motion still omits it.
- Audited painted UI scaling. Character/portal halos already retain display sizes. Prompt scaling converts from the texture's native dimensions. The movement marker pulse operates on its parent container, preserving its ring child's display size. The coordinator's object-halo correction remains intact. Object discovery markers use their existing discovery texture, rather than a `WORLD_UI` texture.

## Files

Runtime: `web/src/{world-camera,explore-scene,world-scene,world-scenery,world-ui,boot-scene,travel-scene,interior-scene,cutscene,texture-quality}.ts`.

New helpers: `web/src/world-{cast-shadow,cinematic,labels}.ts`.

Tests: updated `web/src/{world-camera,world-ui,explore-scene-restart}.test.ts`; new `web/src/world-{cast-shadow,cinematic,labels}.test.ts`.

No authored/runtime image assets or `.gitattributes` changes were necessary: shadows derive from existing sprite alpha at runtime. No new art masters were created.

## Evidence

Viewed all of these with the image viewer:

- `/tmp/camera-target-detail.png`: enlarged target crop, inspected before implementation.
- `/tmp/camera-2-shadows.png`: offline side-by-side day/night projection specimen using the current café, tree, stall and painted Marta runtime art. Confirms projection direction, softness and the weaker night silhouette. This is a controlled specimen on flat palette colours, **not a screenshot of the town**; SVG fonts are local fallbacks rather than the browser's loaded Fraunces/DM Sans. The night panel isolates shadow colour/opacity and does not apply runtime scenery tint.
- `/tmp/camera-2-train.png`: offline 1280×720 framing specimen using the actual train, at 92% width, with the letterbox/dialogue area. Local SVG fonts; not a running cutscene.
- `/tmp/camera-proof.mjs`: reproducible shadow specimen builder, run from the worktree root. Evidence stays in `/tmp` to respect the assigned file boundary; the coordinator can archive it with the combined pass if desired.

## Checks

Final `npm run check --workspace web`: **passed**, TypeScript, UI type/layout budget (47 stylesheets), and UI template budget (0 legacy allowances).

Final focused Vitest run: **12 suites / 74 tests passed** in 3.77 s:

`world-camera`, `world-ui`, `world-cinematic`, `world-labels`, `world-cast-shadow`, `world-scenery`, `explore-scene-restart`, `texture-quality`, `travel-scene`, `world-fonts`, `world-grade`, `world-scenery-contact`.

Camera expectations deliberately changed from the first-pass framing to the new 10%/12% policy. Added regressions for phone/desktop floors, Retina hit sizes, concurrent loader ownership/retry, sequential beat handoff, native-capped train framing, shadow direction, tier-aware source pixels, shared texture leases and cleanup. No existing check was loosened. Node emitted its existing `ExperimentalWarning: localStorage is not available because --localstorage-file was not provided`; all tests passed.

An intermediate type check caught an invalid terrain layer guess, then was corrected to use actual asset names/roles:

```text
src/world-scenery.ts(126,73): error TS2367: This comparison appears to be unintentional because the types '"ground" | undefined' and '"canopy"' have no overlap.
```

## Remaining integration work

No required source changes outside this ownership area. The coordinator should capture live desktop/mobile town labels, a doorway interaction, Medium/High/Low day/night shadows, and an arrival cutscene. Check crowded caption overlap and the first-visible shadow bake cost on a real phone. Runtime font loading, WebGL filtering, transitions and frame rate cannot be visually certified by offline SVG composites. Full verify/build/repository-wide asset checks remain with the coordinator, as instructed.
