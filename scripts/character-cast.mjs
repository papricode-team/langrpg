#!/usr/bin/env node
/** Offline story-cast IO. Recipes use the exact player resolver/compositor. */
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {resolve, dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {bakeCharacterSheet} from './bake-character-sheet.mjs';
import {catalogueForPose, recipeErrors} from '../web/src/character-recipe.mjs';

const ROOT=resolve(import.meta.dirname,'..');
const SOURCE='art/source/character-kit/cast';
const OUTPUT='web/public/assets/character-cast';
const json=async path=>JSON.parse(await readFile(path,'utf8'));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const safe=id=>typeof id==='string'&&/^[a-z][a-z0-9-]*$/.test(id);
// Existing cast atlases remain bound to the component revision that produced
// their reviewed pixels. A player wardrobe update must not re-author the cast.
const characterCatalogue=await json(resolve(ROOT,SOURCE,'component-catalogue.json'));

export async function castInventory() {
  await import('./register-content-loader.mjs');
  const [{npcs},{expeditionRegions},{worldResidentSpecs},{sceneDocument}]=await Promise.all([
    import('../web/src/content.ts'),import('../web/src/expeditions.ts'),
    import('../web/src/world-life.ts'),import('../web/src/scene-data.ts'),
  ]);
  return [
    ...npcs.map(n=>({id:n.id,name:n.name,mapId:null,role:n.role})),
    ...expeditionRegions.flatMap(region=>region.npcs.map(n=>({...n,mapId:region.id}))),
    ...Object.entries(worldResidentSpecs).flatMap(([mapId,rows])=>rows.map(n=>({...n,mapId}))),
    ...Object.entries(sceneDocument.maps).flatMap(([mapId,scene])=>(scene.residents??[]).map(n=>({...n,mapId}))),
  ];
}

export function validateCastEntries(entries, inventory) {
  const ids=new Set(), known=new Map(inventory.map(actor=>[actor.id,actor]));
  for(const entry of entries) {
    if(!safe(entry.id)||ids.has(entry.id))throw new Error(`Invalid or duplicate cast id: ${entry.id}`);
    ids.add(entry.id);
    const actor=known.get(entry.id);
    if(!actor||actor.mapId!==entry.mapId||actor.name!==entry.name)throw new Error(`Cast identity changed: ${entry.id}`);
    if(!['candidate','approved'].includes(entry.status)||!entry.reference?.trim())throw new Error(`Missing cast status/reference: ${entry.id}`);
    if(entry.poses!==undefined && (!entry.poses || Array.isArray(entry.poses) || typeof entry.poses!=='object'))throw new Error(`Invalid cast poses: ${entry.id}`);
    for(const [pose,state] of Object.entries(entry.poses??{})) {
      if(!safe(pose)||pose==='walk'||!state||!['candidate','approved'].includes(state.status))throw new Error(`Invalid cast pose: ${entry.id}/${pose}`);
    }
  }
  return inventory.filter(actor=>!ids.has(actor.id)).map(actor=>actor.id);
}

async function context(root) {
  const source=await json(resolve(root,SOURCE,'catalogue.json'));
  const missing=validateCastEntries(source.entries,await castInventory());
  return {source,missing};
}

function castPaths(id,poseSet) {
  if(!safe(id)||!safe(poseSet))throw new Error('Invalid cast id or pose set');
  const name=poseSet==='walk'?id:`poses/${poseSet}/${id}`;
  return {atlas:`${OUTPUT}/${name}.webp`,proof:`art/proofs/character-cast/${name}.png`,editor:`art/proofs/character-cast/${name}.webp`,report:`${OUTPUT}/${name}.json`};
}

export async function bakeCastEntry(entry,{root=ROOT,poseSet='walk'}={}) {
  if(!safe(entry.id))throw new Error('Invalid cast id');
  const paths=castPaths(entry.id,poseSet),catalogue=catalogueForPose(poseSet,characterCatalogue);
  const recipePath=`${SOURCE}/${entry.id}.json`,recipeBytes=await readFile(resolve(root,recipePath));
  const recipe=JSON.parse(recipeBytes),errors=recipeErrors(recipe,catalogue);
  if(errors.length)throw new Error(`${entry.id}: ${errors.join('; ')}`);
  const {atlas,proof,editor}=paths;
  const result=await bakeCharacterSheet(recipe,{root,out:atlas,poseSet,catalogue:characterCatalogue});
  await mkdir(dirname(resolve(root,proof)),{recursive:true});
  // A complete editor-resolution sheet is the review artifact, never a subset
  // of poses. Its report binds the same recipe and component asset version.
  const editorResult=await bakeCharacterSheet(recipe,{root,out:editor,editor:true,poseSet,catalogue:characterCatalogue});
  await sharp(resolve(root,editor)).flatten({background:'#ece8df'}).png().toFile(resolve(root,proof));
  const report={id:entry.id,poseSet,recipe:recipePath,recipeSha256:hash(recipeBytes),atlas,
    atlasSha256:result.sha256,proof,proofSha256:hash(await readFile(resolve(root,proof))),
    editorSha256:editorResult.sha256,assetVersion:result.assetVersion,frames:36};
  await writeFile(resolve(root,paths.report),JSON.stringify(report,null,2)+'\n');
  return report;
}

async function reviewedCastAsset(entry,poseSet,review,root) {
  const paths=castPaths(entry.id,poseSet),report=await json(resolve(root,paths.report));
  const recipeBytes=await readFile(resolve(root,SOURCE,`${entry.id}.json`));
  const errors=recipeErrors(JSON.parse(recipeBytes),catalogueForPose(poseSet,characterCatalogue));
  if(errors.length||report.id!==entry.id||(report.poseSet??'walk')!==poseSet||report.assetVersion!==characterCatalogue.assetVersion||report.recipeSha256!==hash(recipeBytes))throw new Error(`Stale cast recipe: ${entry.id}/${poseSet}`);
  if(report.atlas!==paths.atlas||report.proof!==paths.proof||report.frames!==36)throw new Error(`Invalid cast report: ${entry.id}/${poseSet}`);
  if(report.atlasSha256!==hash(await readFile(resolve(root,report.atlas)))||report.proofSha256!==hash(await readFile(resolve(root,report.proof))))throw new Error(`Changed cast artifact: ${entry.id}/${poseSet}`);
  if(review?.recipeSha256!==report.recipeSha256||review?.proofSha256!==report.proofSha256||!review?.notes?.trim())throw new Error(`Unreviewed cast: ${entry.id}/${poseSet}`);
  return {key:`character-cast-${entry.id}${poseSet==='walk'?'':`-${poseSet}`}`,image:paths.atlas.replace('web/public',''),sha256:report.atlasSha256,recipeSha256:report.recipeSha256};
}

export async function buildCast({root=ROOT}={}) {
  const {source,missing}=await context(root),actors=[];
  for(const entry of source.entries.filter(entry=>entry.status==='approved')) {
    const walking=await reviewedCastAsset(entry,'walk',entry.review,root),poses={};
    for(const [poseSet,state] of Object.entries(entry.poses??{}))if(state.status==='approved') {
      poses[poseSet]={...await reviewedCastAsset(entry,poseSet,state.review,root),frameDurations:characterCatalogue.poseSets[poseSet].frameDurations};
    }
    const recipe = await json(resolve(root, `art/source/character-kit/cast/${entry.id}.json`));
    actors.push({id:entry.id,name:entry.name,mapId:entry.mapId,recipe,...walking,...(Object.keys(poses).length?{poses}:{})});
  }
  const manifest={version:1,assetVersion:characterCatalogue.assetVersion,cell:characterCatalogue.format.runtimeCell,frames:36,actors};
  manifest.versionHash=hash(JSON.stringify(manifest)).slice(0,16);
  await writeFile(resolve(root,'web/src/data/character-cast.json'),JSON.stringify(manifest,null,2)+'\n');
  return {approved:actors.length,expected:(await castInventory()).length,missing,candidates:source.entries.filter(e=>e.status!=='approved').map(e=>e.id)};
}

export async function main(args=process.argv.slice(2)) {
  const [command,...rest]=args,poseIndex=rest.indexOf('--pose-set');
  const poseSet=poseIndex<0?'walk':rest[poseIndex+1];
  if(poseIndex>=0&&(!poseSet||!safe(poseSet)))throw new Error('Expected --pose-set <id>');
  const ids=poseIndex<0?rest:[...rest.slice(0,poseIndex),...rest.slice(poseIndex+2)];
  if(poseIndex>=0&&command!=='bake')throw new Error('--pose-set is only valid for bake');
  if(command==='inventory'){console.log(JSON.stringify(await castInventory(),null,2));return;}
  const {source,missing}=await context(ROOT);
  if(command==='status'){
    console.log(JSON.stringify({approved:source.entries.filter(e=>e.status==='approved').length,candidates:source.entries.filter(e=>e.status!=='approved').map(e=>e.id),missing},null,2));return;
  }
  if(command==='build'){console.log(JSON.stringify(await buildCast()));return;}
  if(command!=='bake')throw new Error('Usage: character-cast.mjs inventory|status|bake [ids...] [--pose-set walk]|build');
  if(ids.some(id=>!source.entries.some(e=>e.id===id)))throw new Error('Unknown cast id');
  for(const entry of source.entries.filter(e=>!ids.length||ids.includes(e.id)))console.log(JSON.stringify(await bakeCastEntry(entry,{poseSet})));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(error=>{console.error(error.message);process.exitCode=1;});
