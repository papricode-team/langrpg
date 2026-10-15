/** Exact, independently generated cutout requests. Run before built-in image_gen calls. */
import {mkdir,writeFile} from 'node:fs/promises';
const objects=[
 ['reeds','River reeds','planter',70,'sway','a natural clump of green riverside reeds with five brown cattails, individual arching stems and a compact rooted base'],
 ['fern','Woodland fern','planter',64,'sway','one lush woodland fern with elegantly separated fronds, a compact rooted base and a few curled young shoots'],
 ['wildflowers','Meadow flowers','planter',64,'sway','a loose small patch of white daisies, blue cornflowers and tiny yellow meadow flowers with individual stems and a compact grassy base'],
 ['mushrooms','Forest mushrooms','planter',38,'still','a cluster of five woodland mushrooms of different sizes, warm chestnut and cream caps, a little moss at their feet'],
 ['grass-tuft','Grass tuft','planter',42,'sway','a small untidy tuft of fine meadow grass with a few dry seed heads, individual blades and a compact rooted base'],
 ['river-rocks','River stones','planter',72,'still','three smooth weathered grey river boulders, one large and two small, subtle pale mineral veins and small moss patches'],
 ['driftwood','Driftwood log','bench',94,'still','one weathered fallen branch of silver-brown driftwood, with a broken end and small fork, lying horizontally'],
 ['barrels','Oak barrels','planter',60,'still','two small old oak storage barrels with dark iron hoops, one upright and one slightly shorter, no labels'],
 ['crates','Market crates','planter',62,'still','two small wooden market crates, one open with a few red apples and one closed, weathered pale timber, no labels'],
 ['lily-pads','Flowering lily pads','boat',68,'bob','a small group of four round green lily pads and one pale pink water-lily flower, viewed from above at a 45-degree angle, no surrounding water'],
 ['duck','Mallard duck','boat',30,'bob','one small friendly male mallard duck swimming facing right, iridescent green head, chestnut breast, detailed grey-brown feathers, no water, no wake'],
 ['lantern','Garden lantern','lamp',34,'glow','one low wrought-iron garden lantern on a short decorative stake, warm amber glass, a modest stone foot, no large pole'],
 ['watering-can','Watering can','planter',30,'still','one charming old sage-green metal watering can, oval handle, long spout and perforated rose, resting naturally on the ground'],
 ['firepit','Stone fire pit','planter',64,'flicker','a small circular ring of eight weathered stones containing glowing logs and a small warm orange campfire, compact dancing flame silhouette, no smoke plume'],
 ['bunting','Garden bunting','sign',110,'sway','a short string of five muted cream, terracotta and sage triangular fabric pennants between two slim wooden garden stakes, sagging gently, no text'],
 ['birdbath','Stone birdbath','fountain',54,'still','a small weathered carved stone birdbath with a shallow circular basin on a short pedestal, a little clear water, faint moss at the base, no bird']
].map(([id,name,asset,worldWidth,motion,subject])=>({id:`detail-${id}`,name,asset,worldWidth,motion,subject}));
const common='Use case: stylized-concept. Asset type: high-resolution transparent scenery cutout for a cozy European village exploration game. Style: finely detailed hand-painted 2.5D game art, soft natural brush texture, realistic small material details, restrained warm earthy palette; compatible with ornate timber-and-stone village buildings, not vector, not low-poly, not chunky pixel art. Camera: fixed elevated three-quarter orthographic view, about 45 degrees downward, no perspective vanishing point. Soft diffuse daylight from upper left. One isolated asset centered, fills roughly 85 percent of a square canvas with generous safe margin, all parts fully visible. True transparent background including between leaves and branches. No surrounding landscape, ground tile, vignette, backdrop, frame, lettering, interface, watermark or hard cast shadow. Render at the largest native square resolution available; crisp fine detail suitable for zooming in. ';
for(const path of ['art/source/terrain-objects','docs/prompts/terrain-objects'])await mkdir(path,{recursive:true});
for(const object of objects){object.prompt=common+`Subject: ${object.subject}.`;await writeFile(`docs/prompts/terrain-objects/${object.id}.txt`,object.prompt+'\n');}
await writeFile('art/source/terrain-objects/requests.json',JSON.stringify({generator:'built-in image_gen',objects},null,2)+'\n');
console.log(`Prepared ${objects.length} independent requests.`);
