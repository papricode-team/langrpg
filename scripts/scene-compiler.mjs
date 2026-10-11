#!/usr/bin/env node
/** Validate canonical scenes and compile the matching server coordinate contract. */
import {readFile, writeFile, mkdir, rename, rm, access} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash, randomUUID} from 'node:crypto';
import sharp from 'sharp';
import './register-content-loader.mjs';
const {parseWorldSceneDocument, sceneActivityPoint, sceneActivityPlaces, sceneEntrancePoint, sceneInteriorIds} = await import('../web/src/scene-schema.ts');
const {compileResidentActivities} = await import('../web/src/resident-activities.ts');
const {residentActionFrames,RESIDENT_ACTION_ART} = await import('../web/src/resident-action-art.ts');
const {NavigationGrid} = await import('../web/src/navigation.ts');
const {sceneryFootprints} = await import('../web/src/placed-scenery.ts');
const {maps: contentMaps} = await import('../web/src/maps.ts');

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
export const sceneContentVersion = document => createHash('sha256').update(JSON.stringify(stable(document))).digest('hex').slice(0, 16);

/** Performs no writes. Draft collision is validated from the draft's own scenery. */
export async function compileSceneDocument(value, {root = projectRoot} = {}) {
  const document = parseWorldSceneDocument(structuredClone(value));
  const errors = [], registry = {schemaVersion: 1, contentVersion: sceneContentVersion(document), maps: {}};
  const files = new Map();
  const imageSizes = new Map();
  const prefabFrames = new Set();
  const loadJSON = async path => {
    if (!files.has(path)) files.set(path, readFile(resolve(root, path), 'utf8').then(JSON.parse));
    return files.get(path);
  };
  for (const expected of contentMaps) if (!document.maps[expected.id]) errors.push(`missing required map ${expected.id}`);
  for (const scene of Object.values(document.maps)) {
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
      for(const [variant,atlas] of atlases.entries())for(const frame of Object.keys(atlas.frames??{}))prefabFrames.add(`${!!variant}:${frame}`);
      for(const frame of Object.keys(manifests[0].assets??{}))if(manifests.every(manifest=>manifest.assets?.[frame]))for(const variant of [false,true])prefabFrames.add(`${variant}:${frame}`);
      for (const item of scene.scenery) {
        const frame = item.frame ?? item.asset, atlas = atlases[item.variant ? 1 : 0];
        if (!atlas.frames?.[frame] && !manifests.every(manifest => manifest.assets?.[frame])) errors.push(`${scene.id}: scenery ${item.id} has no registered frame ${frame}`);
      }
    }
    const grid = new NavigationGrid(scene.walkable, [...scene.obstacles, ...sceneryFootprints(scene.scenery)], scene);
    if (['lindenhafen','waldruh','nebelstadt'].includes(scene.id)) for (const interior of sceneInteriorIds) {
      if (!scene.entrances?.some(entrance=>entrance.interiorId===interior)) errors.push(`${scene.id}: missing required ${interior} entrance; reassign it to a storefront`);
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
  return {document, contentVersion: registry.contentVersion, registry, storyRules};
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
  console.log(`${command === 'check' ? 'Validated' : 'Compiled'} ${Object.keys(result.document.maps).length} scenes (${result.contentVersion}).`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
