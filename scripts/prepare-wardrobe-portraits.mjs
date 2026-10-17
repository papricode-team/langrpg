/** Layout guides only: generated portrait paintings are still required. */
import sharp from 'sharp';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {combineMaterials, over} from '../web/src/character-compositor.mjs';

const [pageId, ...ids] = process.argv.slice(2);
if (!/^wardrobe-[a-z0-9-]+$/.test(pageId ?? '') || !ids.length || ids.length > 9 || new Set(ids).size !== ids.length) {
  throw Error('Usage: prepare-wardrobe-portraits.mjs wardrobe-PAGE COMPONENT_ID ... (up to nine)');
}
const base = 'art/source/player-portraits';
const source = JSON.parse(await readFile('art/source/character-kit/hd/wardrobe-catalogue.json'));
const exported = JSON.parse(await readFile('web/public/assets/character-kit-hd/manifest.json'));
const staged = `${base}/wardrobe-layout.json`;
let layout;
try { layout = JSON.parse(await readFile(staged)); }
catch (error) {
  if (error.code !== 'ENOENT') throw error;
  layout = JSON.parse(await readFile(`${base}/layout.json`));
}
if (layout.pages.some(page => page.id === pageId)) throw Error('This portrait page already exists; preserve its retained reference');
if (ids.some(id => layout.coverage.some(part => part.id === id))) throw Error('A requested component already has portrait coverage');
const colors = {primary:0x7a5a9a,secondary:0x5a9a6a,skin:0x5a9a9a,detail:0xffffff};
async function frame(id) {
  const asset = exported.assets.find(asset => asset.id === id);
  if (!asset) throw Error(`Export the checked component first: ${id}`);
  const layers = [];
  for (const material of asset.materials) {
    const page = asset.sheets[material].editorPages.find(page => page.firstFrame === 0);
    const data = await sharp('web/public/assets/character-kit-hd/' + page.path)
      .extract({left:0,top:0,width:512,height:768}).ensureAlpha().raw().toBuffer();
    layers.push({data,tint:colors[material]});
  }
  return combineMaterials(layers);
}
const parts = [], composites = [];
for (const id of ids) {
  const part = source.entries.find(part => part.id === id);
  if (!part) throw Error(`Unknown component: ${id}`);
  const report = JSON.parse(await readFile(`output/wardrobe-checks/${id}.check.log`));
  if (!report.valid) throw Error(`Repair this component before preparing its portrait: ${id}`);
  let data = await frame(id);
  if (part.slot === 'face') data = over(await frame('body-' + part.build), data);
  const crop = await sharp(Buffer.from(data), {raw:{width:512,height:768,channels:4}})
    .extract({left:152,top:88,width:208,height:208}).raw().toBuffer();
  const visible = crop.some((value,index) => index % 4 === 3 && value > 8);
  if (!visible && !['bag','bottom','footwear','held'].includes(part.slot)) throw Error(`Unexpected empty portrait: ${id}`);
  layout.coverage.push({id,slot:part.slot,build:part.build,visible});
  if (!visible) continue;
  const index = parts.length;
  composites.push({input:await sharp(crop,{raw:{width:208,height:208,channels:4}}).resize(384,384).png().toBuffer(),left:index%3*384,top:Math.floor(index/3)*384});
  parts.push({id,label:part.label,slot:part.slot,build:part.build,materials:part.materials,expression:'neutral'});
}
if (parts.length) {
  const reference = `${base}/references/${pageId}.png`;
  await mkdir(`${base}/references`,{recursive:true});
  await sharp({create:{width:1152,height:1152,channels:4,background:'#00000000'}}).composite(composites).png().toFile(reference);
  layout.pages.push({id:pageId,reference,cell:384,columns:3,rows:3,parts});
  const prompt = `Native painterly portrait overlay sheet for a modular game. Repaint the supplied transparent reference at 1152 by 1152, preserving its exact 3 by 3 grid and every occupied and empty cell. Each occupied cell is one isolated costume or facial overlay, in this row-major order: ${parts.map(part=>part.id).join(', ')}. Match the reference silhouettes, placement, design and material colors (purple #7a5a9a primary, green #5a9a6a secondary, cyan #5a9a9a skin, neutral white detail). Paint crisp new fine fabric, seam and edge detail at native resolution. These are independently painted portrait assets. Preserve all transparent holes and the transparent background; do not add mannequins, faces, bodies, clothing, props, text, labels or shadows that are absent from the reference. Empty cells stay completely transparent.`;
  await mkdir(`${base}/prompts`,{recursive:true});
  await writeFile(`${base}/prompts/${pageId}.txt`,prompt+'\n');
}
await writeFile(staged,JSON.stringify(layout,null,2)+'\n');
console.log(JSON.stringify({page:pageId,parts:parts.map(part=>part.id),staged}));
