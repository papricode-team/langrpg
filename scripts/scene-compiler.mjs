#!/usr/bin/env node
/** Validate canonical scenes and compile the matching server coordinate contract. */
import {readFile, writeFile, mkdir, rename, rm, access} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash, randomUUID} from 'node:crypto';
import sharp from 'sharp';
import './register-content-loader.mjs';
const {parseWorldSceneDocument, sceneActivityPoint, sceneActivityPlaces, sceneEntrancePoint, sceneInteriorIds,PERSON_HEIGHT} = await import('../web/src/scene-schema.ts');
import {auditSceneQuality} from './scene-quality.mjs';
import {validateSceneryGeometry} from './scenery-geometry.mjs';
const {compileResidentActivities} = await import('../web/src/resident-activities.ts');
const {residentActionFrames,RESIDENT_ACTION_ART} = await import('../web/src/resident-action-art.ts');
const {NavigationGrid,PLAYER_RADIUS} = await import('../web/src/navigation.ts');
const {withSceneryCollision} = await import('../web/src/placed-scenery.ts');
const {getSceneryGeometryMap} = await import('../web/src/scene-schema.ts');
const {sceneNavigationGeometry} = await import('../web/src/scene-navigation.ts');
const {maps: contentMaps} = await import('../web/src/maps.ts');

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
export const sceneContentVersion = document => createHash('sha256').update(JSON.stringify(stable(document))).digest('hex').slice(0, 16);

/** Performs no writes. Draft collision is validated from the draft's own scenery. */
export async function compileSceneDocument(value, {root = projectRoot, strictQuality=true} = {}) {
  const document = parseWorldSceneDocument(structuredClone(value));
  for(const scene of Object.values(document.maps))if(scene.navigation) {
    scene.scenery=scene.scenery.map(item=>withSceneryCollision(item,getSceneryGeometryMap(scene.id)));
    scene.objects=scene.objects.map(item=>({...item,collision:item.collision??{referenceWidth:1,polygons:[]}}));
  }
  const errors = [], warnings=[], quality={}, registry = {schemaVersion: 1, contentVersion: sceneContentVersion(document), maps: {}};
  const files = new Map();
  const imageSizes = new Map();
  const prefabFrames = new Set();
  const loadJSON = async path => {
    if (!files.has(path)) files.set(path, readFile(resolve(root, path), 'utf8').then(JSON.parse));
    return files.get(path);
  };
  for (const expected of contentMaps) if (!document.maps[expected.id]) errors.push(`missing required map ${expected.id}`);
  for (const scene of Object.values(document.maps)) {
    let sceneryManifest;
    for(const look of new Set((scene.residents??[]).flatMap(resident=>resident.actionArt?[resident.actionArt]:[]))){
      try{
        const path=`web/public/assets/resident-actions/${look}`,atlas=await loadJSON(`${path}.json`),size=await sharp(resolve(root,`${path}.webp`)).metadata(),art=RESIDENT_ACTION_ART;
        if(size.width!==art.width*art.columns||size.height!==art.height*art.rows||!size.hasAlpha)errors.push(`${scene.id}: action artwork ${look} must use a transparent registered 512 × 576 atlas`);
        for(const [index,name]of residentActionFrames.entries()){
          const frame=atlas.frames?.[name]?.frame;
          if(!frame||frame.x!==index%art.columns*art.width||frame.y!==Math.floor(index/art.columns)*art.height||frame.w!==art.width||frame.h!==art.height)errors.push(`${scene.id}: action artwork ${look} has an invalid ${name} frame`);
        }
      }catch{errors.push(`${scene.id}: missing or unreadable action artwork ${look}`);}
    }
    const content = contentMaps.find(map => map.id === scene.id);
    if (!content && scene.kind !== 'interior') errors.push(`${scene.id}: no registered map content`);
    if (content && scene.coordinateVersion === 1 && (scene.width !== 1536 || scene.height !== 1024 || (scene.legacyOffset?.x ?? 0) !== 0 || (scene.legacyOffset?.y ?? 0) !== 0)) errors.push(`${scene.id}: legacy bounds/origin require a higher coordinateVersion`);
    if (content) for (const kind of ['npcs', 'objects']) {
      const expected = new Set(content[kind].map(item => item.id));
      const actual = new Set(scene[kind].map(item => item.id));
      for (const id of actual) if (!expected.has(id)) errors.push(`${scene.id}: ${kind} ${id} has no authored content`);
      for (const id of expected) if (!actual.has(id)) errors.push(`${scene.id}: missing required ${kind} ${id}; deletion needs a content migration`);
    }
    for (const tile of scene.terrain) {
      if(content&&!tile.walkableMaskAsset)(strictQuality?errors:warnings).push(`${scene.id}: ${tile.id} needs an authored ground mask`);
      const coreX=scene.legacyOffset?.x??0,coreY=scene.legacyOffset?.y??0;
      const expansion=tile.dayAsset.startsWith('/assets/world-expansions/')||tile.nightAsset?.startsWith('/assets/world-expansions/')
        ||scene.kind!=='interior'&&(tile.x<coreX||tile.y<coreY||tile.x+tile.width>coreX+1536||tile.y+tile.height>coreY+1024);
      if(expansion&&(tile.width!==768||tile.height!==512||tile.pixelDensity!==4
        ||!tile.nightAsset||!tile.dayPreviewAsset||!tile.nightPreviewAsset||!tile.dayCrop||!tile.nightCrop)){
        errors.push(`${scene.id}: ${tile.id} expansion terrain requires 768 × 512 world-unit chunks, 4 pixels per unit, day/night crops and overview assets`);
      }
      for (const asset of [tile.dayPreviewAsset, tile.nightPreviewAsset].filter(Boolean)) {
        try {
          const size = await sharp(resolve(root, 'web/public', asset.slice(1))).metadata();
          if (size.width !== tile.width || size.height !== tile.height) errors.push(`${scene.id}: ${tile.id} overview must be one pixel per world unit`);
        } catch { errors.push(`${scene.id}: missing or unreadable terrain overview ${asset}`); }
      }
      for (const [asset, crop] of [[tile.dayAsset, tile.dayCrop], [tile.nightAsset, tile.nightCrop]].filter(([asset]) => asset)) {
        try {
          if (!imageSizes.has(asset)) imageSizes.set(asset, sharp(resolve(root, 'web/public', asset.slice(1))).metadata());
          const size = await imageSizes.get(asset);
          if(expansion&&crop&&(crop.x<1||crop.y<1||crop.width!==3072||crop.height!==2048||crop.x+crop.width>=size.width||crop.y+crop.height>=size.height))errors.push(`${scene.id}: ${tile.id} expansion crop needs a 3072 × 2048 visible frame with sampling guards on every edge`);
          if (crop && (crop.x + crop.width > size.width || crop.y + crop.height > size.height)) errors.push(`${scene.id}: ${tile.id} crop exceeds ${asset}`);
          if (tile.pixelDensity !== undefined && ((crop?.width ?? size.width) !== tile.width * tile.pixelDensity || (crop?.height ?? size.height) !== tile.height * tile.pixelDensity)) errors.push(`${scene.id}: ${tile.id} artwork does not match its declared pixel density`);
          if (size.width > 4096 || size.height > 4096) errors.push(`${scene.id}: ${tile.id} terrain exceeds the 4096-pixel GPU texture limit`);
        } catch { errors.push(`${scene.id}: missing or unreadable terrain asset ${asset}`); }
      }
    }
    if (content) {
      for (const asset of new Set([content.sceneryAsset, content.variationAsset])) {
        try { await access(resolve(root, 'web/public', asset.slice(1))); }
        catch { errors.push(`${scene.id}: missing scenery asset ${asset}`); }
      }
      const atlases = await Promise.all([content.sceneryAtlas, content.variationAtlas].map(path => loadJSON(`web/public${path}`)));
      const manifests = await Promise.all(['day', 'night'].map(period => loadJSON(`web/public/assets/${scene.id}-${period}-animations.json`)));
      sceneryManifest=manifests[0];
      errors.push(...validateSceneryGeometry(scene.id,sceneryManifest,await loadJSON('web/src/data/scenery-geometry.json')));
      quality[scene.id]=auditSceneQuality(scene,sceneryManifest);
      (strictQuality?errors:warnings).push(...quality[scene.id].issues);
      for(const [variant,atlas] of atlases.entries())for(const frame of Object.keys(atlas.frames??{}))prefabFrames.add(`${!!variant}:${frame}`);
      for(const frame of Object.keys(manifests[0].assets??{}))if(manifests.every(manifest=>manifest.assets?.[frame]))for(const variant of [false,true])prefabFrames.add(`${variant}:${frame}`);
      for (const item of scene.scenery) {
        const frame = item.frame ?? item.asset, atlas = atlases[item.variant ? 1 : 0];
        if (!atlas.frames?.[frame] && !manifests.every(manifest => manifest.assets?.[frame])) errors.push(`${scene.id}: scenery ${item.id} has no registered frame ${frame}`);
      }
    }
    const geometry=sceneNavigationGeometry(scene,sceneryManifest);
    const grid = new NavigationGrid(geometry.ground,geometry.barriers,scene);
    const groundGrid = new NavigationGrid(geometry.ground,geometry.terrain,scene);
    const playerGrid = new NavigationGrid(geometry.ground,geometry.barriers,scene,{agentRadius:PLAYER_RADIUS});
    if(!playerGrid.isWalkable(scene.spawn.x,scene.spawn.y))errors.push(`${scene.id}: spawn needs ${PLAYER_RADIUS} units of player clearance`);
    // Actor poses and painted doors stay attached to their props. Check that a
    // player can approach each with a full footprint, without moving the anchor.
    const playerTargets=[...scene.npcs,...scene.objects,
      ...(scene.entrances??[]).flatMap(door=>[false,true].map(returning=>({id:`${door.id} ${returning?'return':'approach'}`,...sceneEntrancePoint(scene,door,returning)}))),
      ...(scene.activities??[]).map(activity=>({id:activity.id,...sceneActivityPoint(scene,activity)}))];
    for(const target of playerTargets) {
      const approach=playerGrid.closestPoint(target.x,target.y,scene.spawn);
      if(Math.hypot(approach.x-target.x,approach.y-target.y)>120||!playerGrid.findPath(scene.spawn,approach).length)
        errors.push(`${scene.id}: ${target.id} has no reachable approach with ${PLAYER_RADIUS} units of player clearance`);
    }
    for(const tile of scene.terrain.filter(tile=>tile.walkableMaskAsset)){
      try{
        const {data,info}=await sharp(resolve(root,'web/public',tile.walkableMaskAsset.slice(1))).removeAlpha().greyscale().raw().toBuffer({resolveWithObject:true});
        if(info.width!==tile.width||info.height!==tile.height)errors.push(`${scene.id}: ${tile.id} walkable mask must be one pixel per world unit`);
        else {
          let offGround=0;
          const groundPixel=(x,y)=>x>=0&&y>=0&&x<info.width&&y<info.height&&data[y*info.width+x]>=128;
          // Mask pixels describe unit squares. Sample their centres so a closed
          // white-cell boundary is not mistaken for its black neighbour. Float
          // contours rasterize with up to one pixel of edge quantization.
          for(let y=3;y<tile.height;y+=6)for(let x=3;x<tile.width;x+=6)
            if(!groundPixel(x,y)&&!groundPixel(x-1,y)&&!groundPixel(x+1,y)&&!groundPixel(x,y-1)&&!groundPixel(x,y+1)
              &&(scene.navigation?groundGrid:grid).isWalkable(tile.x+x+.5,tile.y+y+.5))offGround++;
          if(offGround)errors.push(`${scene.id}: ${tile.id} navigation crosses ${offGround} samples outside its painted walkable mask`);
        }
      }catch{errors.push(`${scene.id}: missing or unreadable walkable mask ${tile.walkableMaskAsset}`);}
    }
    const reachability=grid.auditReachability(scene.spawn);
    if(reachability.reachableRatio<.995)(scene.navigation?warnings:errors).push(`${scene.id}: spawn reaches ${(100*reachability.reachableRatio).toFixed(2)}% of walkable samples; ${scene.navigation?'isolated clear land is allowed, interaction targets must be reachable':'at least 99.5% is required'}`);
    if (['lindenhafen','waldruh','nebelstadt'].includes(scene.id)) for (const interior of sceneInteriorIds) {
      if (!scene.entrances?.some(entrance=>entrance.interiorId===interior)) errors.push(`${scene.id}: missing required ${interior} entrance; reassign it to a storefront`);
    }
    for(const entrance of scene.entrances??[]){
      const owner=scene.scenery.find(item=>item.id===entrance.ownerId),asset=sceneryManifest?.assets[owner.frame??owner.asset],door=asset?.door;
      if(!door)errors.push(`${scene.id}: entrance ${entrance.id} owner has no painted door`);
      else {
        const scale=owner.width/asset.referenceWidth,point=sceneEntrancePoint(scene,entrance),x=(point.x-owner.x)*(owner.flipX?-1:1)/scale,y=(point.y-owner.y)/scale;
        const cachedX=entrance.offsetX*(owner.flipX?-1:1)/scale,cachedY=entrance.offsetY/scale;
        if([x,cachedX].some(value=>value<door.x-.01||value>door.x+door.width+.01)||[y,cachedY].some(value=>value<door.y-.01||value>door.y+door.height+.01))errors.push(`${scene.id}: entrance ${entrance.id} lies outside its painted door rectangle`);
        if(door.height*scale<1.1*PERSON_HEIGHT) (strictQuality?errors:warnings).push(`${scene.id}: entrance ${entrance.id} door is smaller than 1.1 persons`);
      }
    }
    for (const entrance of scene.entrances ?? []) for (const returning of [false,true]) {
      const point = sceneEntrancePoint(scene,entrance,returning);
      if (!grid.isWalkable(point.x,point.y) || !grid.findPath(scene.spawn,point).length) {
        errors.push(`${scene.id}: entrance ${entrance.id} ${returning?'return':'approach'} is not on reachable walkable ground`);
      }
    }
    // Activities are physical actor positions. Unlike story markers, they must
    // never silently project from grass, water or a foundation onto a nearby path.
    for (const activity of scene.activities ?? []) {
      const owner = scene.scenery.find(item => item.id === activity.ownerId);
      const points = [['feet', sceneActivityPoint(scene, activity)],
        ...sceneActivityPlaces(scene,activity).map((point,index)=>[`place ${index+1}`,point]),
        ...['approach', 'exit'].filter(key => activity[key]).map(key => [key, {x: owner.x + activity[key].x, y: owner.y + activity[key].y}])];
      for (const [label, point] of points) {
        if (!grid.isWalkable(point.x, point.y) || !grid.findPath(scene.spawn, point).length) {
          errors.push(`${scene.id}: activity ${activity.id} ${label} is not on reachable walkable ground`);
        }
      }
    }
    try {compileResidentActivities(scene,grid);}catch(error){errors.push(`${scene.id}: ${error.message}`);}
    if (!grid.isWalkable(scene.spawn.x, scene.spawn.y)) errors.push(`${scene.id}: spawn is outside walkable ground`);
    else for (const target of [...scene.npcs, ...scene.objects]) {
      const approach = grid.closestPoint(target.x, target.y);
      if (Math.hypot(approach.x - target.x, approach.y - target.y) > 120 || !grid.findPath(scene.spawn, approach).length) errors.push(`${scene.id}: ${target.id} has no reachable interaction approach`);
    }
    if (scene.kind !== 'interior') registry.maps[scene.id] = {
      width: scene.width, height: scene.height,
      spawn: {x: scene.spawn.x / scene.width, y: scene.spawn.y / scene.height},
      coordinateVersion: scene.coordinateVersion,
      entrances: Object.fromEntries((scene.entrances ?? []).map(entrance => {
        const approach=sceneEntrancePoint(scene,entrance), back=sceneEntrancePoint(scene,entrance,true);
        return [entrance.interiorId,{id:entrance.id,ownerId:entrance.ownerId,approach:{x:approach.x/scene.width,y:approach.y/scene.height},return:{x:back.x/scene.width,y:back.y/scene.height}}];
      })),
      ...(scene.legacyOffset ? {legacyOffset: scene.legacyOffset} : {}),
    };
  }
  for(const prefab of document.prefabs??[])for(const item of prefab.scenery){
    if(!prefabFrames.has(`${!!item.variant}:${item.frame??item.asset}`))errors.push(`prefab ${prefab.id}: child ${item.id} has no registered artwork`);
  }
  if (errors.length) throw new Error(errors.join('\n'));
  // Position-only regeneration keeps the existing narrative/grading rules intact.
  const storyRules = structuredClone(await loadJSON('server/story_rules.json'));
  for (const rule of storyRules.rules) {
    const scene = document.maps[rule.mapId];
    if (!scene) throw new Error(`Missing scene for story ${rule.questId}`);
    const normalize = anchor => ({id: anchor.id, x: anchor.x / scene.width, y: anchor.y / scene.height});
    const npc = scene.npcs.find(item => item.id === rule.npcId);
    if (!npc) throw new Error(`Missing story NPC ${rule.npcId}`);
    rule.npc = normalize(npc);
    rule.objects = rule.investigationObjectIds.map(id => {
      const object = scene.objects.find(item => item.id === id);
      if (!object) throw new Error(`Missing story object ${id}`);
      return normalize(object);
    });
  }
  return {document, contentVersion: registry.contentVersion, registry, storyRules,warnings,quality};
}

/** Stage every output first; each rename is atomic, and a failed batch rolls back. */
async function writeStaged(outputs) {
  const staged = [], committed = [];
  try {
    for (const [path, data] of outputs) {
      await mkdir(dirname(path), {recursive: true});
      const previous = await readFile(path).catch(error => { if (error.code === 'ENOENT') return undefined; throw error; });
      const temporary = `${path}.${randomUUID()}.stage`;
      await writeFile(temporary, `${JSON.stringify(data, null, 2)}\n`, {flag: 'wx'});
      staged.push({path, temporary, previous});
    }
    for (const output of staged) { await rename(output.temporary, output.path); committed.push(output); }
  } catch (error) {
    for (const output of committed.reverse()) {
      if (output.previous === undefined) await rm(output.path, {force: true});
      else { await writeFile(output.temporary, output.previous); await rename(output.temporary, output.path); }
    }
    throw error;
  } finally { await Promise.all(staged.map(output => rm(output.temporary, {force: true}))); }
}

/** Local authoring callers must serialize writes and check their source revision. */
export async function saveSceneDocument(value, options = {}) {
  const root = options.root ?? projectRoot;
  const compiled = await compileSceneDocument(value, {root});
  const sourcePath = options.sourcePath ?? resolve(root, 'web/src/data/world-scenes.json');
  const previous = await readFile(sourcePath, 'utf8').then(JSON.parse).catch(error => { if (error.code === 'ENOENT') return undefined; throw error; });
  if (previous) for (const scene of Object.values(compiled.document.maps)) {
    const before = previous.maps?.[scene.id];
    if (!before) continue;
    const boundsChanged = before.width !== scene.width || before.height !== scene.height || JSON.stringify(before.legacyOffset) !== JSON.stringify(scene.legacyOffset);
    if (scene.coordinateVersion < before.coordinateVersion || (boundsChanged && scene.coordinateVersion <= before.coordinateVersion)) throw new Error(`${scene.id}: changed bounds/origin require a higher coordinateVersion`);
  }
  await writeStaged([
    [options.registryPath ?? resolve(root, 'server/world_maps.json'), compiled.registry],
    [options.storyRulesPath ?? resolve(root, 'server/story_rules.json'), compiled.storyRules],
    [options.versionPath ?? resolve(root, 'web/src/data/world-scene-version.json'), {contentVersion: compiled.contentVersion}],
    [sourcePath, compiled.document],
  ]);
  return compiled;
}

async function main() {
  const [command = 'check', input] = process.argv.slice(2);
  if (!['check', 'compile', 'import'].includes(command)) throw new Error('Usage: node scripts/scene-compiler.mjs check | compile | import <document.json>');
  if (command === 'import' && !input) throw new Error('Import requires a scene document');
  const source = resolve(projectRoot, 'web/src/data/world-scenes.json');
  const value = JSON.parse(await readFile(command === 'import' ? resolve(input) : source, 'utf8'));
  const result = command === 'check' ? await compileSceneDocument(value) : await saveSceneDocument(value);
  if(result.warnings.length)console.warn(result.warnings.join('\n'));
  console.log(`${command === 'check' ? 'Validated' : 'Compiled'} ${Object.keys(result.document.maps).length} scenes (${result.contentVersion}).`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
