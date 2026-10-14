import { readdir, stat, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { jobs } from './dialogue-audio-content.mjs';
const root = resolve('web/dist');
async function files(dir) { return (await Promise.all((await readdir(dir, { withFileTypes: true })).map(async item => item.isDirectory() ? files(resolve(dir,item.name)) : [resolve(dir,item.name)]))).flat(); }
const assets = await files(root);
const js = assets.filter(path => path.endsWith('.js'));
const sizes = await Promise.all(js.map(async path => ({ path, size: (await stat(path)).size })));
const largest = Math.max(...sizes.map(item => item.size));
const total = sizes.reduce((sum,item) => sum + item.size,0);
// Learning records are served by the API. Browser JavaScript contains the engine,
// presentation and interface strings, with a hard startup and aggregate ceiling.
const startupHTML = await readFile(resolve(root, 'index.html'), 'utf8');
const startupPaths = new Set([...startupHTML.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi)].map(([,source]) => resolve(root, source.replace(/^\//, '').split(/[?#]/, 1)[0])));
const mainChunks = sizes.filter(item => startupPaths.has(item.path));
if (!mainChunks.length || mainChunks.length !== startupPaths.size) throw new Error('Unable to identify the startup JavaScript chunk');
for (const chunk of mainChunks) if (chunk.size > 3 * 1024 * 1024) throw new Error(`Main JavaScript budget exceeded: ${chunk.size}`);
if (largest > 3 * 1024 * 1024 || total > 5 * 1024 * 1024) throw new Error(`JavaScript budget exceeded: largest ${largest}, total ${total}`);
const art=assets.filter(path=>path.includes('/assets/')&&/\.(webp|png|jpg)$/.test(path));
const artSizes=await Promise.all(art.map(async path=>({path,size:(await stat(path)).size})));
for(const asset of artSizes)if(asset.size>2*1024*1024)throw new Error(`Individual art budget exceeded: ${asset.path}`);
const artTotal=artSizes.reduce((sum,item)=>sum+item.size,0);
const expansionPrefix=resolve(root,'assets/world-expansions')+'/';
// Character sheets are loaded per recipe or destination. Reserve a separate
// 640 MiB package for the complete native wardrobe, 192 NPCs and room variants.
// Preserve native pixels; destination loading, trimmed atlases and the 2 MiB
// per-file limit bound individual transfers instead of reducing resolution.
const characterPrefixes=['character-kit','character-kit-hd','character-cast','character-portraits','player-portraits'].map(name=>resolve(root,'assets',name)+'/');
const characterArt=artSizes.filter(item=>characterPrefixes.some(prefix=>item.path.startsWith(prefix)));
const characterArtTotal=characterArt.reduce((sum,item)=>sum+item.size,0);
if(characterArtTotal>640*1024*1024)throw new Error(`Character distribution art budget exceeded: ${characterArtTotal}`);
const baseArt=artSizes.filter(item=>!item.path.startsWith(expansionPrefix)&&!characterPrefixes.some(prefix=>item.path.startsWith(prefix)));
const expansionArt=artSizes.filter(item=>item.path.startsWith(expansionPrefix));
const baseArtTotal=baseArt.reduce((sum,item)=>sum+item.size,0);
// Three story towns each reserve 16 MiB for eight detailed ground pieces.
// Keep individual downloads bounded at 2 MiB and stream one destination.
if(baseArtTotal>160*1024*1024)throw new Error(`Base distribution art budget exceeded: ${baseArtTotal}`);
// Expansion is a separately accounted, camera-streamed package. Each registered
// chunk earns two 2 MiB details + two 256 KiB overviews; unreferenced files earn
// no allowance. At twelve additions per original map the ceiling is 702 MiB.
const scenes=JSON.parse(await readFile('web/src/data/world-scenes.json','utf8'));
const registered=new Set();let chunkCount=0;
for(const scene of Object.values(scenes.maps)){
  const tiles=scene.terrain.filter(tile=>tile.dayAsset.startsWith('/assets/world-expansions/'));
  if(tiles.length>12)throw new Error(`Expansion chunk budget exceeded: ${scene.id}`);
  chunkCount+=tiles.length;
  for(const tile of tiles){
    for(const field of ['dayAsset','nightAsset','dayPreviewAsset','nightPreviewAsset']){
      const asset=tile[field];
      if(!asset?.startsWith(`/assets/world-expansions/${scene.id}/`))throw new Error(`Incomplete expansion lighting/overview assets: ${scene.id}/${tile.id}`);
      const path=resolve(root,asset.slice(1));registered.add(path);
      const entry=expansionArt.find(item=>item.path===path);
      if(!entry)throw new Error(`Missing expansion asset: ${asset}`);
      if(field.includes('Preview')&&entry.size>256*1024)throw new Error(`Expansion overview budget exceeded: ${asset}`);
    }
  }
  const bytes=expansionArt.filter(item=>item.path.startsWith(`${expansionPrefix}${scene.id}/`)).reduce((sum,item)=>sum+item.size,0);
  if(bytes>tiles.length*4.5*1024*1024)throw new Error(`Expansion region budget exceeded: ${scene.id}`);
}
for(const asset of expansionArt)if(!registered.has(asset.path))throw new Error(`Unreferenced expansion art: ${asset.path}`);
if(chunkCount>156)throw new Error(`Expansion distribution chunk budget exceeded: ${chunkCount}`);
for(const town of ['lindenhafen','waldruh','nebelstadt']){
  const townBytes=baseArt.filter(item=>item.path.split('/').at(-1).startsWith(town)).reduce((sum,item)=>sum+item.size,0);
  if(townBytes>36*1024*1024)throw new Error(`Region art budget exceeded: ${town}`);
}
const audioSizes=await Promise.all(assets.filter(path=>/\.(mp3|ogg|wav)$/.test(path)).map(async path=>({path,size:(await stat(path)).size})));
const audioTotal=audioSizes.reduce((sum,item)=>sum+item.size,0);
for(const asset of audioSizes)if(asset.size>1024*1024)throw new Error(`Individual audio budget exceeded: ${asset.path}`);
if(audioTotal>80*1024*1024)throw new Error(`Distribution audio budget exceeded: ${audioTotal}`);
const manifest = JSON.parse(await readFile('web/public/audio/dialogue/manifest.json', 'utf8'));
const clips = new Map(manifest.clips.map(clip => [clip.id,clip]));
for (const line of jobs) {
  if (clips.get(line.clipId)?.text !== line.german) throw new Error(`Missing or stale dialogue clip: ${line.clipId}`);
  const clip = await stat(resolve(root, 'audio/dialogue', `${line.clipId}.mp3`));
  if (!clip.size) throw new Error(`Empty dialogue clip: ${line.clipId}`);
}
console.log(`Budgets pass: JavaScript ${(largest/1024/1024).toFixed(2)} MiB largest / ${(total/1024/1024).toFixed(2)} MiB total; art ${(artTotal/1024/1024).toFixed(2)} MiB (${(baseArtTotal/1024/1024).toFixed(2)} base + ${(characterArtTotal/1024/1024).toFixed(2)} characters + ${((artTotal-baseArtTotal-characterArtTotal)/1024/1024).toFixed(2)} expansion, ${chunkCount} chunks); audio ${(audioTotal/1024/1024).toFixed(2)} MiB. All ${jobs.length} dialogue audio clips present and current.`);
