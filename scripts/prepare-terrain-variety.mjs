#!/usr/bin/env node
/** Apply the retained paving zones and balanced tree species to Lindenhafen only.
 * Requires the original seed as --before; all other current maps are preserved. */
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
const root=process.cwd();
await import(pathToFileURL(root+'/scripts/register-content-loader.mjs'));
const {shapeGround}=await import(pathToFileURL(root+'/scripts/ground-shapes.mjs'));
const {groundLayers,groundFromLayers,MAX_GROUND_LAYERS}=await import(pathToFileURL(root+'/web/src/ground.ts'));
const read=p=>JSON.parse(fs.readFileSync(p));
// Always derive the pass from the retained baseline rather than reapplying to itself.
const beforeIndex=process.argv.indexOf('--before');
if(beforeIndex<0)throw Error('Usage: node scripts/prepare-terrain-variety.mjs --before original-seed.json');
const baseline=read(process.argv[beforeIndex+1]),document=read('content/world-seed.json');
const town=structuredClone(baseline.maps.lindenhafen),before=town.ground;
const layout=read('art/source/terrain-materials/variety-layout.json');
const designed=shapeGround(town,{...layout,cell:before.cell});
const old=groundLayers(before,town.width,town.height),mask=groundLayers(designed,town.width,town.height);
if(!['cobble','limestone','town-cobble'].every(id=>before.layers.includes(id)))throw Error('Baseline must contain the original Lindenhafen paving.');
const paving=['cobble','limestone','town-cobble'].map(id=>old.layers[before.layers.indexOf(id)]);
const values=mask.layers.map(()=>new Uint8Array(old.columns*old.rows));
for(let i=0;i<values[0].length;i++){
 const total=paving.reduce((sum,layer)=>sum+layer[i],0);
 let assigned=0,best=0;
 for(let j=0;j<values.length;j++){
  values[j][i]=Math.round(total*mask.layers[j][i]/255);assigned+=values[j][i];
  if(mask.layers[j][i]>mask.layers[best][i])best=j;
 }
 values[best][i]+=total-assigned;
}
const preserved=['meadow','moss','deep-water'];
town.ground=groundFromLayers([...preserved,...designed.layers],[...preserved.map(id=>old.layers[before.layers.indexOf(id)]),...values],before.cell,before.features);
if(town.ground.layers.length>MAX_GROUND_LAYERS)throw Error('Too many layers');
// Assign the most constrained (closest neighbours) first, then balance the four
// green species while reserving four widely separated copper beeches as accents.
const trees=town.scenery.filter(s=>s.asset==='tree');
const accents=new Set(['archive-court-tree','promenade-tree-northeast','library-court-tree','quay-tree-west']);
const species=['town-linden','town-plane','town-chestnut','town-birch'];
const counts=Object.fromEntries(species.map(id=>[id,0])),assigned=[];
for(const tree of trees.filter(t=>accents.has(t.id))){tree.frame='town-beech';tree.motion='still';assigned.push(tree);}
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const pending=trees.filter(t=>!accents.has(t.id)).sort((a,b)=>Math.min(...trees.filter(t=>t!==a).map(t=>distance(t,a)))-Math.min(...trees.filter(t=>t!==b).map(t=>distance(t,b)))||a.id.localeCompare(b.id));
for(const tree of pending){
 const ranked=species.map((id,index)=>({id,index,score:counts[id]*90+assigned.filter(t=>t.frame===id).reduce((n,t)=>n+Math.max(0,440-distance(t,tree))*4,0)})).sort((a,b)=>a.score-b.score||a.index-b.index);
 tree.frame=ranked[0].id;tree.motion='still';counts[tree.frame]++;assigned.push(tree);
}
document.maps.lindenhafen=town;
fs.writeFileSync('content/world-seed.json',JSON.stringify(document,null,2)+'\n');
console.log({layers:town.ground.layers,treeCounts:{...counts,'town-beech':accents.size},nearestSameSpecies:trees.filter(t=>trees.filter(x=>x!==t).sort((a,b)=>distance(a,t)-distance(b,t))[0].frame===t.frame).map(t=>t.id)});
