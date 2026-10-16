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
const allArtSizes=await Promise.all(art.map(async path=>({path,size:(await stat(path)).size})));
for(const asset of allArtSizes)if(asset.size>2*1024*1024)throw new Error(`Individual art budget exceeded: ${asset.path}`);
// Graphics quality tiers are alternatives: a player downloads Low first and then at most one other tier.
// The budgets below measure High (assets/ itself); Low and Medium must stay well below it.
const tierRoot=resolve(root,'assets/q')+'/';
const artSizes=allArtSizes.filter(item=>!item.path.startsWith(tierRoot));
const tierTotal=tier=>allArtSizes.filter(item=>item.path.startsWith(`${tierRoot}${tier}/`)).reduce((sum,item)=>sum+item.size,0);
const qualityManifest=JSON.parse(await readFile(resolve(root,'assets/q/manifest.json'),'utf8'));
for(const rel of Object.keys(qualityManifest.files))for(const tier of ['low','medium'])await stat(resolve(root,'assets/q',tier,rel));
const artTotal=artSizes.reduce((sum,item)=>sum+item.size,0);
// Character sheets are loaded per recipe or destination: the wardrobe, 192 NPCs and room variants.
// Cast atlases and portraits ship lossy (scripts/asset-quality.mjs); the avatar kit stays lossless
// because the baker composites its exact pixels.
const characterPrefixes=['character-kit','character-kit-hd','character-cast','character-portraits','player-portraits'].map(name=>resolve(root,'assets',name)+'/');
const characterArt=artSizes.filter(item=>characterPrefixes.some(prefix=>item.path.startsWith(prefix)));
const characterArtTotal=characterArt.reduce((sum,item)=>sum+item.size,0);
if(characterArtTotal>280*1024*1024)throw new Error(`Character distribution art budget exceeded: ${characterArtTotal}`);
const baseArt=artSizes.filter(item=>!characterPrefixes.some(prefix=>item.path.startsWith(prefix)));
const baseArtTotal=baseArt.reduce((sum,item)=>sum+item.size,0);
// Towns share the tiled ground materials; keep individual downloads bounded at 2 MiB and stream one destination.
if(baseArtTotal>80*1024*1024)throw new Error(`Base distribution art budget exceeded: ${baseArtTotal}`);
const lowTotal=tierTotal('low'),mediumTotal=tierTotal('medium');
if(lowTotal>80*1024*1024||mediumTotal>140*1024*1024)throw new Error(`Quality tier budget exceeded: low ${lowTotal}, medium ${mediumTotal}`);
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
  const clip = await stat(resolve(root, 'audio/dialogue', `${line.clipId}.ogg`));
  if (!clip.size) throw new Error(`Empty dialogue clip: ${line.clipId}`);
}
console.log(`Budgets pass: JavaScript ${(largest/1024/1024).toFixed(2)} MiB largest / ${(total/1024/1024).toFixed(2)} MiB total; art ${(artTotal/1024/1024).toFixed(2)} MiB at High (${(baseArtTotal/1024/1024).toFixed(2)} base + ${(characterArtTotal/1024/1024).toFixed(2)} characters), Medium ${(mediumTotal/1024/1024).toFixed(2)} MiB, Low ${(lowTotal/1024/1024).toFixed(2)} MiB; audio ${(audioTotal/1024/1024).toFixed(2)} MiB. All ${jobs.length} dialogue audio clips present and current.`);
