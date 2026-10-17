# Visual style review: scenes and assets

Reviewed 2026-10-17 on `main` at 770eceb3. The question was whether the scenes and visual assets share one style, fit together and read as a premium (AAA) game.

## How this was checked

- **Art:** the runtime WebP assets in `web/public/assets` were inspected directly: town previews, buildings, props, terrain materials and features, portraits, NPC sheets, the in-world cast atlases, minigame sprites and UI art.
- **Screens:** the committed UI and interior screenshots were read.
- **Code:** every Phaser scene and all the CSS were audited.
- **Not checked:** the live world could not be rendered here because the world MCP needs `GLOTWORLD_ADMIN_TOKEN`. Town composition is judged from the `*-preview.webp` exports, which were regenerated on 2026-10-16.

Evidence images are in [`docs/audits/visual-style/`](audits/visual-style/).

## Verdict

The individual pieces are often good, but they come from different art directions. The painted buildings, props, interior rooms, item icons and story portraits are close to premium quality. What breaks the illusion is how they meet:

- characters drawn in another medium;
- ground and stonework in another palette and projection;
- primitives and system fonts wherever Phaser draws something itself;
- a UI that changes theme from one mode to the next.

A player reads these joins as "assembled", not "crafted". Fixing the joins will do more than adding new art.

## What already works

- **Buildings and props.** The golden-hour palette, upper-left light and three-quarter view are consistent across towns and expeditions ([lindenhafen-props](../web/public/assets/lindenhafen-props.webp), the station and café buildings, the Cedarbay set).
- **Interior rooms.** The café room is lit, has light shafts from its windows, and its furniture is drawn to scale ([interior-cafe-room](../web/public/assets/interior-cafe-room.webp), [cafe screenshot](screenshots/interiors/rendering-repair-cafe.jpg)). This is the most cohesive mode.
- **Item art.** [minigames/items](../web/public/assets/minigames/items.webp) is one consistent painted icon family. The workbench backdrop is excellent.
- **Story portraits.** The eight cast portraits and their expression variants are one consistent illustrated family.
- **Rendering setup.** Linear filtering with trilinear mipmaps, a damped camera, painted day/night pairs with a crossfade, quality tiers, and occlusion fading are the right foundation.

## Findings, in priority order

### 1. In-world characters are a different medium (critical)

Since 2026-10-14, every in-game character is drawn from the component-kit atlases in `web/public/assets/character-cast/`, loaded in `boot-scene.ts:23`, `world-map-assets.ts:58` and `interior-scene.ts:72`. These look like smooth 3D renders:

- untextured fabric;
- a desaturated grey-green-brown wardrobe;
- near-identical faces;
- no painted edge or brushwork.

Everything around them (buildings, props, portraits, the old painted NPC sheet) is warm, saturated and painterly.

Identity also drifts between the three versions of the same person. See [marta-three-styles.jpg](audits/visual-style/marta-three-styles.jpg): the portrait, the old painted sprite and the in-world kit sprite.

- Portrait Marta has olive skin, dark curls, hoop earrings and a cream blouse.
- In-world Marta is pale, with a tight bun and a grey blouse.

The minigame action sprites ([minigames/actions](../web/public/assets/minigames/actions.webp)) still use the painted cast, so a character changes style when a minigame opens. [in-world-cast.jpg](audits/visual-style/in-world-cast.jpg) shows that the town residents and the expedition casts share the kit look.

The two additional story portraits are also a fourth style: Inspector Voss and Elise are darker, realistic oil cutouts on transparency ([inspector-portrait](../web/public/assets/story-cast/inspector-portrait.webp)). They do not match the bright illustrated cast portraits.

**Direction:**
- Keep the kit for animation and customisation, but bring it into the paint style. Options:
  - a painted overpaint/stylisation pass on the master frames before export;
  - painted material textures instead of flat tints;
  - at minimum, a warmer grade, an edge darkening/outline and contrast that match the props.
- Lock one identity sheet per story character (skin, hair, signature garment), taken from the portrait, and check the kit recipe against it.
- Repaint the Voss and Elise portraits in the cast portrait style.

### 2. Ground and stonework clash with the buildings (high)

The terrain features (bridges, quays, squares, stairs) are cold blue-grey slate, rendered almost isometrically ([terrain-features.jpg](audits/visual-style/terrain-features.jpg)). The buildings sit on warm sandstone and terracotta. `docs/style/lindenhafen.md` asks for "warm sandstone … cream `#e9d7a6`", but the canal walls and bridges are slate blue.

The tiled materials ([terrain-materials](../web/public/assets/terrain-materials/)) are flat and photographic: navy deep water, blue masonry, a herringbone brick. They are drawn top-down with no light direction, while the buildings use a 60° view lit from the upper left.

The result, visible in [lindenhafen-preview.jpg](audits/visual-style/lindenhafen-preview.jpg):
- roads read as vector shapes with uniform grey kerbs on flat green;
- the three blue bridges are the most saturated things in town;
- large lawns are empty.

Waldruh's original painted terrain, with rock shelves, worn paths and integrated water, is far closer to the target than the material-built Lindenhafen.

**Direction:**
- Regrade or repaint the features and materials into each town's palette: warm stone for Lindenhafen, wet slate only for Nebelstadt, if that is intended.
- Give materials baked upper-left light and occlusion at edges.
- Break up road edges with wear, moss and kerb variation.
- Fill lawns with clustered dressing (the terrain-object library already has grass tufts, wildflowers and ferns).

### 3. Repetition and eclectic architecture (high)

- **Waldruh** uses the same red-roof half-timber house about eight times.
- **Nebelstadt's** preview has a flat grey expansion strip on the right with repeated house/stall pairs. It also still shows a horizon with sky and sea, which contradicts the overhead camera.
- **Lindenhafen** mixes Parisian domes, Dutch gables, Tudor half-timber, a thatched cottage and Mediterranean villas, all with the same autumn-orange tree.

AAA towns feel authored because each has a strong, narrow architectural vocabulary, plus variation within it.

**Direction:**
- Define per-town building kits: a roof family, wall material, window style and a signature landmark.
- Paint three to five variants per house type.
- Add at least two more tree species per town, and seasonal variety that is consistent within a town.
- Re-export the Nebelstadt preview, or fix its expansion area.

### 4. Phaser-drawn elements use primitives and system fonts (high)

The DOM uses Fraunces and DM Sans (`main.ts:36-41`). Every in-world Phaser label uses Georgia or Arial instead:

- the "SPRECHEN · E" hint is Arial 10 px on a flat `#263e36` box (`explore-scene.ts:912`);
- portal tags are Georgia 9 px (`explore-scene.ts:966`);
- the cutscene uses Georgia and Arial (`cutscene.ts:35-39`);
- the travel curtain uses Georgia (`travel-scene.ts:28`).

Several of these sit below the repo's 12 px UI floor.

Placeholder-style shapes stand in for art in the world:
- resident-held items are `fillRect` (`world-scene.ts:814-817`);
- ink labels are flat rectangles (`world-story-marks.ts:66-67`);
- markers, door mats and rings are stroked ellipses (`explore-scene.ts:243-251, 909-964`).

**Direction:**
- Use the loaded web fonts in Phaser, after `document.fonts.ready`.
- Paint a small diegetic UI kit: a brass interaction prompt, a parchment ink tag, a door threshold glow, and held props from the item atlas.

### 5. Minigames look like prototypes (high)

`minigames/scene.ts:25-47` builds every backdrop from rounded rectangles, twelve circles, a stroked clock and a line. The only painted element is one prop at 65% alpha.

Only 6 of 30 games use painted sprites. The rest are:
- CSS gradient blobs (`word-games.css:486-492`);
- "♪" and "✓" glyphs (`engine.ts:196-199`, `scripted-stories.ts:128-196`);
- a literal "Art unavailable" fallback (`sprite-library.ts:21-22`).

The workbench painting proves the quality bar is reachable.

**Direction:**
- Give each mechanic family one painted stage, like the workbench: a station board, a market stall, an archive desk, a garden bed, a clock tower.
- Route every word game through the item atlas.
- Replace glyph feedback with painted stamps or seals.

### 6. The UI changes theme between modes (medium–high)

Five panel looks exist:
- cream parchment encounters (`style-encounters.css:3-10`);
- dark teal dialogue (`dialogue.css:15-22`);
- near-black menu (`game-menu.css:21`);
- two conflicting activity shells, whose winner depends on import order (`activities.css:28-34` vs `activities-hud.css:10-12`);
- a light web-app course player with white inputs and a green focus ring (`course-player.css`).

That course-picker form appears at the top of the Story home ([home-desktop.png](screenshots/ui/home-desktop.png)), so the first screen reads as a SaaS settings page.

There are 1,726 unique hex literals and two partly unused token sets: `style.css:15-21` and `game-ui.css:3-8`. At least seven different brass golds are used.

**Direction:**
- Write one token file: brass, ink, parchment, forest glass, a radius scale and a shadow scale.
- Choose parchment for "in-world documents" (encounters, letters, ink) and dark forest glass for "system" (menu, HUD, dialogue), and apply that rule everywhere.
- Move the course picker out of the Story home into You or settings.

### 7. Presentation polish (medium)

- **No grade by default.** The screen filter defaults to `original` (`screen-filter-settings.ts:2`), so there is no vignette, bloom or colour grade. A subtle always-on grade per town and time of day (lifted shadows, warm highlights, light vignette) unifies mixed sources cheaply. Keep it off the UI.
- **Shadows.** Character shadows are centred blobs (`character-art.ts:185-197`), while the art direction lights from the upper left. Offset and skew them towards the lower right to seat the kit characters into the painted ground.
- **Interiors.** Interiors have no lamps, atmosphere or tint, and characters are forced to white tint indoors (`explore-scene.ts:1129`). The room canvas is built at 1 px per world unit (`world-interior.ts:48-56`), so it is upscaled at play zoom.
- **Transitions.** Door transitions only fade in, with no fade-out first (`world-scene.ts:487-491`).
- **Cutscene.** The cutscene has rectangle letterbox bars and Arial text, and draws a 1536 px train at about 2.3× on a 2× display (`cutscene.ts:31-39`).
- **Tool renderers.** `world-view.ts:63`, `room-view.ts:31` and the admin editor do not use the game's mipmap settings, so MCP screenshots can look different from real play.
- **Home hero art.** The Story home hero uses the old perspective painting of Lindenhafen. The town the player walks into looks different (material-built, flat lawns), which sets an expectation the game does not meet.

## Suggested order of work

1. **Character style pass:** stylise the kit and lock identities against the portraits. This has the largest visual impact, and every scene shows it.
2. **Palette and projection pass on terrain features and materials,** plus lawn dressing. Start with Lindenhafen, the first town players see.
3. **Unified UI tokens and two panel archetypes;** move the course picker out of the Story home.
4. **Diegetic world UI kit and web fonts in Phaser.**
5. **Painted minigame stages,** one per mechanic family.
6. **Default grade, directional shadows, interior lighting, and door and cutscene transitions.**
7. **Town building kits with variants;** regenerate the Nebelstadt preview.

Items 1 and 2 decide whether the game reads as one world. Items 3 and 4 decide whether it reads as one product.
