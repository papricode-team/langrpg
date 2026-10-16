#!/usr/bin/env node
/** Offline story-cast IO. Recipes use the exact player resolver/compositor. */
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {resolve, dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {bakeCharacterSheet} from './bake-character-sheet.mjs';
import {catalogueForPose, recipeErrors, resolveRecipe} from '../web/src/character-recipe.mjs';
import {packCharacterAtlasPages} from './character-atlas.mjs';

const ROOT=resolve(import.meta.dirname,'..');
const SOURCE='art/source/character-kit/cast';
const OUTPUT='web/public/assets/character-cast';
const json=async path=>JSON.parse(await readFile(path,'utf8'));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
// Pixel processing is a bake input too: changed transparency/compositing rules
// must invalidate existing NPC sheets even when every component is unchanged.
const rendererSignature=hash(Buffer.concat(await Promise.all([
  'web/src/character-compositor.mjs','scripts/bake-character-sheet.mjs','scripts/character-atlas.mjs',
].map(path=>readFile(resolve(ROOT,path))))));
const safe=id=>typeof id==='string'&&/^[a-z][a-z0-9-]*$/.test(id);
// Keep the reviewed component revision reproducible independently of later wardrobe edits.
const characterCatalogue=await json(resolve(ROOT,SOURCE,'component-catalogue.json'));

export async function castInventory() {
  await import('./register-content-loader.mjs');
  // The authored registries are filled before any web module that reads them is evaluated.
  const {npcs}=await import('./content-source.mjs');
  const [{expeditionRegions},{worldResidentSpecs},{sceneDocument}]=await Promise.all([
    import('../web/src/expeditions.ts'),
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
  return {atlas:`${OUTPUT}/${name}.webp`,geometry:`${OUTPUT}/${name}.atlas.json`,proof:`art/proofs/character-cast/${name}.png`,editor:`art/proofs/character-cast/${name}.webp`,report:`${OUTPUT}/${name}.json`};
}

/** Every runtime page must remain intact before an unchanged bake is reused. */
export async function castBakeArtifactsCurrent(report,{root=ROOT,sourceComponentsSha256}={}) {
  if(sourceComponentsSha256!==undefined&&report.sourceComponentsSha256!==sourceComponentsSha256)return false;
  const paths=castPaths(report.id,report.poseSet??'walk'),recipe=`${SOURCE}/${report.id}.json`;
  if(report.recipe!==recipe||report.atlas!==paths.atlas||report.geometry!==paths.geometry||report.proof!==paths.proof||report.images!==undefined&&!Array.isArray(report.images))return false;
  const pages=[{path:report.atlas,sha256:report.atlasSha256},...(report.images??[])];
  for(const [index,page] of (report.images??[]).entries())if(!page||page.path!==(index?paths.atlas.replace(/\.webp$/,`.${index}.webp`):paths.atlas))return false;
  const files=[...pages.map(page=>({...page,maxBytes:2*1024*1024})),
    {path:recipe,sha256:report.recipeSha256},{path:paths.geometry,sha256:report.geometrySha256},
    {path:paths.proof,sha256:report.proofSha256},{path:paths.editor,sha256:report.editorSha256}];
  try {
    for(const file of files){
      const bytes=await readFile(resolve(root,file.path));
      if(file.maxBytes&&bytes.length>file.maxBytes||hash(bytes)!==file.sha256)return false;
    }
    return true;
  } catch(error) {
    if(error.code==='ENOENT')return false;
    throw error;
  }
}

async function writePackedCast(input,cell,image,atlas,root) {
  const packed=await packCharacterAtlasPages(input,cell),images=[];
  await mkdir(dirname(resolve(root,image)),{recursive:true});
  for(const [index,page] of packed.pages.entries()){
    const path=index?image.replace(/\.webp$/,`.${index}.webp`):image;
    await writeFile(resolve(root,path),page.image);
    images.push({path,sha256:hash(page.image),firstFrame:page.firstFrame,frameCount:page.frameCount});
  }
  const multiAtlas=packed.pages.length>1;
  const geometry=multiAtlas?{textures:packed.pages.map((page,index)=>({image:`${images[index].path.slice(OUTPUT.length+1)}?v=${images[index].sha256.slice(0,16)}`,frames:Object.entries(page.atlas.frames).map(([frame,rect])=>({filename:String(page.firstFrame+Number(frame)),...rect})),meta:page.atlas.meta}))}:packed.pages[0].atlas;
  const bytes=JSON.stringify(geometry,null,2)+'\n';await writeFile(resolve(root,atlas),bytes);
  return {sha256:images[0].sha256,atlasSha256:hash(bytes),textureBytes:packed.textureBytes,...(multiAtlas?{multiAtlas:true,images}:{})};
}

export async function bakeNativeCastVariant(entry,{root=ROOT,componentCatalogue=characterCatalogue}={}) {
  if(!safe(entry.id))throw new Error('Invalid native cast id');
  if(entry.mapId!==null)return;
  const input=resolve(root,`art/proofs/character-cast/${entry.id}.webp`);
  const image=`${OUTPUT}/native/${entry.id}.webp`,atlas=`${OUTPUT}/native/${entry.id}.atlas.json`;
  const packed=await writePackedCast(input,componentCatalogue.format.editorCell,image,atlas,root);
  return {key:`character-cast-${entry.id}-native`,image,atlas,...packed,cell:componentCatalogue.format.editorCell,source:`art/proofs/character-cast/${entry.id}.webp`,sourceSha256:hash(await readFile(input))};
}

export function castSourceSignature(recipe,catalogue,poseSet='walk',renderer=rendererSignature) {
  const posed=catalogueForPose(poseSet,catalogue);
  return hash(JSON.stringify({renderer,layers:['down','right','up','left'].map(facing=>resolveRecipe(recipe,facing,posed).layers)}));
}

export async function bakeCastEntry(entry,{root=ROOT,poseSet='walk',componentCatalogue=characterCatalogue}={}) {
  if(!safe(entry.id))throw new Error('Invalid cast id');
  const paths=castPaths(entry.id,poseSet),catalogue=catalogueForPose(poseSet,componentCatalogue);
  const recipePath=`${SOURCE}/${entry.id}.json`,recipeBytes=await readFile(resolve(root,recipePath));
  const recipe=JSON.parse(recipeBytes),errors=recipeErrors(recipe,catalogue);
  if(errors.length)throw new Error(`${entry.id}: ${errors.join('; ')}`);
  const {atlas,proof,editor}=paths;
  const result=await bakeCharacterSheet(recipe,{root,out:atlas,poseSet,catalogue:componentCatalogue});
  const packed=await writePackedCast(await readFile(resolve(root,atlas)),componentCatalogue.format.runtimeCell,atlas,paths.geometry,root);
  await writeFile(resolve(root,`${atlas}.json`),JSON.stringify({...result,path:undefined,...packed,atlas:paths.geometry},null,2)+'\n');
  await mkdir(dirname(resolve(root,proof)),{recursive:true});
  // A complete editor-resolution sheet is the review artifact, never a subset
  // of poses. Its report binds the same recipe and component asset version.
  const editorResult=await bakeCharacterSheet(recipe,{root,out:editor,editor:true,poseSet,catalogue:componentCatalogue});
  await sharp(resolve(root,editor)).flatten({background:'#ece8df'}).png().toFile(resolve(root,proof));
  const report={id:entry.id,poseSet,recipe:recipePath,recipeSha256:hash(recipeBytes),atlas,
    atlasSha256:packed.sha256,geometry:paths.geometry,geometrySha256:packed.atlasSha256,textureBytes:packed.textureBytes,...(packed.multiAtlas?{multiAtlas:true,images:packed.images}:{}),
    cell:componentCatalogue.format.runtimeCell,sourceComponentsSha256:castSourceSignature(recipe,componentCatalogue,poseSet),proof,proofSha256:hash(await readFile(resolve(root,proof))),
    editorSha256:editorResult.sha256,assetVersion:result.assetVersion,frames:36};
  if(poseSet==='walk'&&entry.mapId===null)report.native=await bakeNativeCastVariant(entry,{root,componentCatalogue});
  await writeFile(resolve(root,paths.report),JSON.stringify(report,null,2)+'\n');
  return report;
}

async function reviewedCastAsset(entry,poseSet,review,root) {
  const paths=castPaths(entry.id,poseSet),report=await json(resolve(root,paths.report));
  const recipeBytes=await readFile(resolve(root,SOURCE,`${entry.id}.json`));
  const errors=recipeErrors(JSON.parse(recipeBytes),catalogueForPose(poseSet,characterCatalogue));
  if(report.sourceComponentsSha256!==castSourceSignature(JSON.parse(recipeBytes),characterCatalogue,poseSet))throw new Error(`Stale cast components: ${entry.id}/${poseSet}`);
  if(errors.length||report.id!==entry.id||(report.poseSet??'walk')!==poseSet||report.assetVersion!==characterCatalogue.assetVersion||report.recipeSha256!==hash(recipeBytes))throw new Error(`Stale cast recipe: ${entry.id}/${poseSet}`);
  if(report.atlas!==paths.atlas||report.proof!==paths.proof||report.frames!==36)throw new Error(`Invalid cast report: ${entry.id}/${poseSet}`);
  if(report.geometry!==paths.geometry||report.geometrySha256!==hash(await readFile(resolve(root,paths.geometry)))||report.atlasSha256!==hash(await readFile(resolve(root,report.atlas)))||report.proofSha256!==hash(await readFile(resolve(root,report.proof)))||report.editorSha256!==hash(await readFile(resolve(root,paths.editor))))throw new Error(`Changed cast artifact: ${entry.id}/${poseSet}`);
  for(const image of [...(report.images??[]),...(report.native?.images??[])])if(image.sha256!==hash(await readFile(resolve(root,image.path))))throw new Error(`Changed cast page: ${entry.id}/${poseSet}`);
  if(review?.recipeSha256!==report.recipeSha256||review?.proofSha256!==report.proofSha256||!review?.notes?.trim())throw new Error(`Unreviewed cast: ${entry.id}/${poseSet}`);
  const native=report.native;
  if(entry.mapId===null&&poseSet==='walk'&&(!native||native.cell?.join()!==characterCatalogue.format.editorCell.join()||native.sourceSha256!==report.editorSha256||native.sha256!==hash(await readFile(resolve(root,native.image)))||native.atlasSha256!==hash(await readFile(resolve(root,native.atlas)))))throw new Error(`Changed native cast artifact: ${entry.id}`);
  return {key:`character-cast-${entry.id}${poseSet==='walk'?'':`-${poseSet}`}`,image:paths.atlas.replace('web/public',''),atlas:paths.geometry.replace('web/public',''),atlasSha256:report.geometrySha256,sha256:report.atlasSha256,recipeSha256:report.recipeSha256,textureBytes:report.textureBytes,...(report.multiAtlas?{multiAtlas:true}:{}),
    ...(native?{native:{key:native.key,image:native.image.replace('web/public',''),atlas:native.atlas.replace('web/public',''),sha256:native.sha256,atlasSha256:native.atlasSha256,recipeSha256:report.recipeSha256,cell:native.cell,textureBytes:native.textureBytes,...(native.multiAtlas?{multiAtlas:true}: {})}}:{})};
}

export async function buildCast({root=ROOT}={}) {
  if(characterCatalogue.format.runtimeCell[0]<384||characterCatalogue.format.runtimeCell[1]<576)throw new Error('Cast requires native-detail 384×576 components');
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
