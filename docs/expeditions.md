# Ten expedition communities

The Atlas now contains thirteen freely explorable regions: the original three story towns and ten new expeditions. The original 18 quests remain in Lindenhafen, Waldruh and Nebelstadt. Each expedition has a local cast, connected routes, contextual German encounters and a neighborhood planning game.

These are fictional contemporary communities inspired by specific places. Their personal relationships and disputes are authored stories, rather than claims about how a culture behaves. Everyday homes, studios, repair work, gardens, transport and shared resources accompany the architectural references. The current art and dialogue have not undergone community or educator review.

## Region and game catalog

| Region / ID | Cultural inspiration and exploration | Neighborhood game | Language and relationships |
| --- | --- | --- | --- |
| Saffron Court / `saffroncourt` | Fez, Morocco; shaded workshop lanes, courtyard gates and hidden gardens | The courtyard delivery | Follow directions, distinguish similar names and ask permission. Salma and Youssef share repairs; Amina and Karim quietly maintain the same garden. |
| Rain Arcade / `rainmarket` | Contemporary Japanese covered shopping neighborhoods; a long arcade with side alleys | The rain arcade timetable | Negotiate closing times, sleep, rain and after-hours collection. Haru’s early shift matters to Mei’s event, while Aiko’s side door helps Jun. |
| Windplain / `windplain` | Mongolian seasonal steppe communities; a broad meadow with a mobile camp | Pack the moving camp | Pack supplies, confirm changing addresses and use fixed landmarks. Sarnai, Bat, Tuya and Nomin connect the move, repair, visit and route record. |
| Riverweave / `riverweave` | Cần Thơ, Vietnam; waterside landings, connected banks and kitchens | The river market basket | Compare quantities, capacity, budgets and causes of delay. Linh’s boat, Phuc’s order, Mai’s kitchen and Bao’s changed landing all affect one delivery. |
| Terracielo / `terracielo` | Taquile, Peru; terraces, switchbacks and shared workspaces | The terrace commission | Describe measurements and revisions, distinguish a trial from an agreement, and update deadlines. Rosa, Mateo, Ana and Pilar hold different parts of the commission. |
| Sunpatch / `sunpatch` | Oaxaca, Mexico; a contemporary mural and workshop quarter | The neighborhood radio message | Reconstruct an announcement, confirm a sender’s meaning and coordinate public space. Inés, Pablo, Alma and Valeria connect the mural, access, recordings and invitations. |
| Kigalights / `kigalights` | Kigali, Rwanda; a hillside creative district with stepped studios | A studio for three neighbors | Allocate rooms and times, explain accessibility and respect borrowing conditions. Aline, Eric, Chantal and Patrick coordinate a public screening and its arrival routes. |
| Cedar Bay / `cedarbay` | Kerala, India; canal paths, garden banks and a reading room | The canal ferry connection | Connect transport, weather alternatives, return obligations and arrival times. Meera’s reading, Arun’s boat, Anjali’s lamp and Farah’s guests share one evening. |
| Seoul Steps / `seoulsteps` | Seoul, South Korea; compact hillside studios and rooftop gardens | The rooftop evening plan | Clarify entrances, distinguish possible from agreed times, and share limited space. Minji, Jisoo, Hana, Soo and Eun coordinate laundry, recording, rehearsal and a gathering. |
| Dune Garden / `dunegarden` | Oman; oasis garden paths and irrigation infrastructure | The garden water agreement | Allocate duration, explain a fault and negotiate replacement time. Maryam, Salim, Huda, Khalid and Noura connect the schedule, gate repair and corrected notice. |

The planning games support A1, A2 and B1 with level-specific German briefings and constraints. Local cast and object encounters have an authored default difficulty and optional English support. Forty encounters include deliberately plausible misunderstandings with feedback on the exact time, referent, quantity, cause or obligation; the remaining encounters provide clearer introductory alternatives.

## Content and artwork counts

| Addition across ten expeditions | Count | Per region |
| --- | ---: | ---: |
| Named interactive NPCs | 80 | 8 |
| Roaming residents | 80 | 8 |
| Interactive discoveries | 100 | 10 |
| German encounters | 180 | 18 |
| Neighborhood planning games | 10 | 1, with A1/A2/B1 support |
| Static prop sprite frames | 240 | 24 |
| Independent motion frames | 240 | 4 objects × 6 frames |
| Character sprite frames | 640 | 16 identities × 4 poses |
| Distinct painted character identities | 160 | 8 named neighbors and 8 roaming residents, each with their own appearance |
| Placed scenery instances | 1,140 | 114: 90 static instances and 24 animated decorations |

Each new region places ten building instances among the static scenery, with distinct community, food, transport, repair, residential and garden silhouettes. Smaller canal-side foundations fit on traced grass banks. The ten object markers have visible scenery beside their approach points. Scenery instances reuse their region’s painted frames; 1,140 instances does not mean 1,140 unique sprite paintings.

The original worlds add 276 scenery instances, seven story NPCs, nine roaming residents and 15 interactive discoveries. Across all thirteen regions this gives 1,416 placed scenery instances, 87 interactive NPCs, 89 roaming residents and 115 discoveries.

## Animation and placement

New architecture uses static transparent prop frames. Each motion row is a complete painted object with its own container, stand or pole: a moving plant, cloth shade, lantern or water feature. The 24 animated decorations have separate ground positions and normal foot-depth sorting. They are never stacked as floating pots in tree canopies or water features on vehicles. Daytime and nighttime reuse the same new motion atlases; lighting changes with the world clock. Reduced motion freezes their current frames.

Each person has a stable character identity. Named neighbors use indices 0–7; roaming residents use 8–15. Three separate character pages hold identities 0–3, 4–9 and 10–15, with four registered animation poses per person. The eight named-neighbor portraits use those same identities. Character assignments never wrap around or change as the camera moves, so residents can gather without showing duplicate characters.

Terrain and navigation use the region’s normalized route nodes and links. The game pathfinder also uses static scenery foundations. Riverweave and Cedar Bay restrict land-based decoration to bank polygons traced from their terrain paintings; the independent decorations remain beside the walking approaches. The new regions stream their destination terrain, props, three character atlases and motion assets on demand.

## Saved progress

Original quests, course work, graded activity rewards and review schedules continue to use the server. Multiplayer presence, chat and travel support all thirteen regions.

New neighborhood plans and local encounter results use browser `localStorage`. Games save by region and level; correct encounter outcomes remain remembered after a later unsuccessful attempt. Another device, browser profile or private window has separate expedition progress. Clearing browser storage removes these records. They do not award server-graded course or story completion, and are not synchronized with the player profile. When browser storage is unavailable the encounters remain playable, but cannot retain those local records.

## Sources, prompts and export

Generated originals and production prompt specifications live in `art/source/expeditions/`, with six source sheets and their prompt files per region. Terrain layout guides and additional final-prompt files record the reference material and refinements used during generation:

```text
{id}-terrain.png       {id}-terrain-prompt.txt
{id}-props.png         {id}-props-prompt.txt
{id}-motions.png       {id}-motions-prompt.txt
{id}-people.png        {id}-people-prompt.txt
{id}-people-1.png      {id}-people-1-prompt.txt
{id}-people-2.png      {id}-people-2-prompt.txt
```

The artwork was generated with the built-in ImageGen tool. `scripts/expedition-art-plan.mjs` records the cultural and visual specifications. `scripts/prepare-expedition-art.mjs` exports generated alpha-preserving frames, registers animation rows, and assembles previews from the current runtime placements:

```sh
npm install
node scripts/prepare-expedition-art.mjs
node scripts/prepare-expedition-art.mjs riverweave
node scripts/prepare-expedition-art.mjs --partial
node scripts/prepare-expedition-art.mjs --previews-only
node scripts/prepare-expedition-art.mjs --people-only
```

`--partial` permits missing source sheets during production. It should not be used to conceal missing assets in a completed build. `--people-only` updates the character pages and portraits without re-exporting terrain or scenery. Runtime exports in `web/public/assets/` include terrain, preview, prop atlas, motion atlas, three people atlases, an eight-person portrait strip and daytime/nighttime animation manifests for each region.

## Verification

```sh
npm run check
npm --prefix web test -- src/expeditions.test.ts src/expedition-art.test.ts src/expedition-games.test.ts
npm --prefix web test -- src/maps.test.ts src/navigation.test.ts src/world-life.test.ts
```

Catalog tests verify unique targets, complete encounter mappings, four motion kinds and eight connected resident loops per expedition. Map tests check every NPC, discovery and interaction approach against the collision geometry. Art tests check real alpha, atlas bounds, registered rows, all referenced frames, separate motion sheets and terrain/preview dimensions. Game tests cover valid plans and persistence. Visual review of the assembled previews remains necessary to catch scenery on water, misleading terrain paths or poor overlap that data checks cannot assess.
