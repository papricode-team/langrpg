# Art direction

The target is [`references/target-art-direction.webp`](references/target-art-direction.webp), a 1280 × 720 mock of Lindenhafen's old quarter. It shows the world we want players to walk into. Three decisions qualify it (2026-10-17):

- **Characters:** keep the realistic painted component kit. The peg-doll figures in the mock are placeholders, not the character style.
- **UI chrome:** keep main's brass-and-leather painted kit (`web/src/ui-kit.css`). Take the mock's HUD *layout*, not its forest-glass skin.
- **Camera:** pull back from today's framing (an adult is ~15% of screen height) to a middle ground of ~10%. The mock's ~6% is too small for phones.

## What the target does

**One continuous painting.** The town reads as a single illustrated place. It is not a set of sprites on a ground texture. Buildings stand shoulder to shoulder. Gaps hold gardens, terraces, market stalls, hedges, statues, benches and trees. There are no open lawns between roads.

**Paved squares, not roads on grass.** The ground is mostly warm cream flagstone and cobble. Radial cobble rings mark the fountain. Paving sweeps in soft curves around terraces and planters. Kerbs are low and irregular, not uniform outlines. Grass appears only inside walled gardens and planters.

**Green, varied planting.** Trees are mostly deep and mid greens: linden, plane, cypress, clipped box and climbing ivy. Autumn gold is only an accent. Flower colour comes in clusters: roses on arches, window boxes and planters.

**Light.**
- Warm late-morning sun from the upper left.
- Soft, slightly long shadows from trees, stalls and buildings fall on the paving.
- Windows glow faintly.
- The grade is warm but not orange. Highlights are cream, shadows are olive-brown and never black.

**Density of story.** Each place says what it is from its props: the café's parasols and chairs, the market's striped awnings and crates, the archive's banners and steps, the inventor's water wheel, the botanist's rose arch.

**Characters as part of the scene.** People are small relative to buildings (a door is about 1.3 × a person). Each has a white Fraunces name with a dark outline above the head and a small role caption ("Café owner", "Courier") below the feet. A small diamond marks someone with something to say.

**HUD layout** (to be skinned in main's leather kit):
- portrait medallion with name, title, course and XP at top left;
- the town name centred at the top on a compass ribbon (W · N · E), with the district below;
- a round brass-bezel minimap at top right, with icon buttons above it;
- the current chapter card at right, with objective, progress and "Continue story";
- a local chat panel at bottom left;
- a bottom dock (Quests, Journal, Atlas medallion in the centre, Character, Settings) with key hints above it;
- a "memories to revisit" prompt at bottom right.

## How the current build differs

| Area | Now | Target |
|---|---|---|
| Ground | Roads with kerb outlines across large lawns; terrain pass made materials warm | Paved squares and lanes edge to edge; grass only in gardens |
| Planting | One autumn-orange tree repeated; grass reads yellow after the terrain pass | Varied deep-green trees, hedges, ivy and flower clusters |
| Density | Buildings spread apart with empty space between | Packed frontages; every gap dressed |
| Shadows | Contact strips under buildings; character shadows only | Soft cast shadows from trees, stalls and buildings |
| Camera | Adult ≈ 15% of screen height | Adult ≈ 10% |
| Labels | Name only, shown near the player | Name above and role below, always readable |
| HUD | Nameplate, story beacon, menu button, compass button | Full layout above, in leather |

## Rules for new art

- Same view as the buildings: 60° from above, upright three-quarter façades, light from the upper left.
- Painterly with visible but fine brushwork; no photographic textures, no outlines.
- Palette anchors: cream stone `#e9d7a6`, terracotta `#b16c4d`, leaf `#5f7d4a` (deeper than before), water `#4f8a84`, shadow `#4f5b53`.
- Provenance: keep every master and its exact prompt beside it, as `docs/art.md` describes.
