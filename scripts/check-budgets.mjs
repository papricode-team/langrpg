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
// The complete offline curriculum is distributed as four bounded data chunks.
// This aggregate includes that content, Phaser, and application code.
if (largest > 4 * 1024 * 1024 || total > 12 * 1024 * 1024) throw new Error(`JavaScript budget exceeded: largest ${largest}, total ${total}`);
const art=assets.filter(path=>path.includes('/assets/')&&/\.(webp|png|jpg)$/.test(path));
const artSizes=await Promise.all(art.map(async path=>({path,size:(await stat(path)).size})));
for(const asset of artSizes)if(asset.size>2*1024*1024)throw new Error(`Individual art budget exceeded: ${asset.path}`);
const artTotal=artSizes.reduce((sum,item)=>sum+item.size,0);
if(artTotal>100*1024*1024)throw new Error(`Distribution art budget exceeded: ${artTotal}`);
for(const town of ['lindenhafen','waldruh','nebelstadt']){
  const townBytes=artSizes.filter(item=>item.path.split('/').at(-1).startsWith(town)).reduce((sum,item)=>sum+item.size,0);
  if(townBytes>16*1024*1024)throw new Error(`Region art budget exceeded: ${town}`);
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
console.log(`Budgets pass: JavaScript ${(largest/1024/1024).toFixed(2)} MiB largest / ${(total/1024/1024).toFixed(2)} MiB total; art ${(artTotal/1024/1024).toFixed(2)} MiB; audio ${(audioTotal/1024/1024).toFixed(2)} MiB. All ${jobs.length} dialogue audio clips present and current.`);
