#!/usr/bin/env node
/** Validate canonical scenes and compile the matching server coordinate contract. */
import {readFile, writeFile, mkdir, rename, rm, access} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash, randomUUID} from 'node:crypto';
import sharp from 'sharp';
import './register-content-loader.mjs';
const {parseWorldSceneDocument, sceneEntrances, sceneEntrancePoint} = await import('../web/src/scene-schema.ts');
import {auditSceneQuality,auditBuildingSpacing} from './scene-quality.mjs';
import {geometryFromManifest,sceneryFrameSizes,validateSceneryGeometry} from './scenery-geometry.mjs';
const {compileResidentActivities} = await import('../web/src/resident-activities.ts');
const {residentActionFrames,RESIDENT_ACTION_ART} = await import('../web/src/resident-action-art.ts');
const {NavigationGrid,PLAYER_RADIUS} = await import('../web/src/navigation.ts');
const {withSceneryCollision} = await import('../web/src/placed-scenery.ts');
const {getSceneryGeometryMap} = await import('../web/src/scene-schema.ts');
const {sceneNavigationGeometry} = await import('../web/src/scene-navigation.ts');
const {maps: contentMaps} = await import('../web/src/maps.ts');
const {auditScene,SceneReach,problem} = await import('../web/src/world-edit-rules.ts');

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
export const sceneContentVersion = document => createHash('sha256').update(JSON.stringify(stable(document))).digest('hex').slice(0, 16);

/** A compile failure with one structured problem per issue. */
export class SceneCompileError extends Error {
  constructor(problems) { super(problems.map(item => item.map ? `${item.map}: ${item.message}` : item.message).join('\n')); this.problems = problems; }
}

/** Server coordinates for each town: frame, spawn and doorways. */
export function compileRegistry(document) {
  const registry = {schemaVersion: 1, contentVersion: sceneContentVersion(document), maps: {}};
  for (const scene of Object.values(document.maps)) if (scene.kind !== 'interior') registry.maps[scene.id] = {
    width: scene.width, height: scene.height,
    spawn: {x: scene.spawn.x / scene.width, y: scene.spawn.y / scene.height},
    coordinateVersion: scene.coordinateVersion,
    entrances: Object.fromEntries(sceneEntrances(scene).map(entrance => {
      const approach = sceneEntrancePoint(scene, entrance), back = sceneEntrancePoint(scene, entrance, true);
      return [entrance.interiorId, {id: entrance.id, ownerId: entrance.ownerId, approach: {x: approach.x / scene.width, y: approach.y / scene.height}, return: {x: back.x / scene.width, y: back.y / scene.height}}];
    })),
    ...(scene.legacyOffset ? {legacyOffset: scene.legacyOffset} : {}),
  };
  return registry;
}

/** Story positions follow the edited anchors; narrative and grading rules stay as authored. */
export function compileStoryRules(document, authored) {
  const storyRules = structuredClone(authored);
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
  return storyRules;
}

const residentReasons = [
  [/exact activity position is blocked|no route between home and activity/, (name) => `This blocks ${name}'s daily walk. Move it, or change ${name}'s schedule under Admin › Residents.`],
  [/home must be on spawn-connected ground/, (name) => `${name}'s home must be on ground connected to the town.`],
  [/time window is too short/, (name) => `${name}'s time window is too short to walk there, do the activity and walk home.`],
  [/rain response cannot return home/, (name) => `${name} cannot get home in time when it rains. Give that block more time.`],
  [/cannot use|fallback needs/, (name) => `${name}'s activity does not fit that spot. Choose a matching spot.`],
  [/exchange needs/, (name) => `${name}'s shop visit needs a waiting spot near another resident's counter, at a time they serve.`],
];
/** Resident routes are rebuilt at runtime; a blocked route must be caught before publishing. */
export function residentProblems(scene, grid) {
  try { compileResidentActivities(scene, grid); return []; }
  catch (error) {
    const message = String(error.message ?? error), id = message.split(/[/:]/)[0], resident = scene.residents?.find(item => item.id === id);
    const explain = residentReasons.find(([pattern]) => pattern.test(message))?.[1];
    return [problem('resident-route', scene.id, resident && explain ? explain(resident.name)
      : `A resident's daily routine no longer works: ${message}`, resident ? [resident.id] : [], resident?.home)];
  }
}

/**
 * Performs no writes. Draft collision is validated from the draft's own scenery.
 * `strictQuality` makes composition hints errors; the committed repository world
 * uses it, admin edits do not.
 */
export async function compileSceneDocument(value, {root = projectRoot, strictQuality=true} = {}) {
  let document;
  try { document = parseWorldSceneDocument(structuredClone(value)); }
  catch (error) { throw new SceneCompileError([problem('invalid', '', String(error.message ?? error).replace(/^Invalid world scene: /, ''))]); }
  for(const scene of Object.values(document.maps))if(scene.navigation) {
    scene.scenery=scene.scenery.map(item=>withSceneryCollision(item,getSceneryGeometryMap(scene.id)));
    scene.objects=scene.objects.map(item=>({...item,collision:item.collision??{referenceWidth:1,polygons:[]}}));
  }
  const problems = [], quality={};
  const files = new Map();
  const imageSizes = new Map();
  const prefabFrames = new Set();
  const loadJSON = async path => {
    if (!files.has(path)) files.set(path, readFile(resolve(root, path), 'utf8').then(JSON.parse));
    return files.get(path);
  };
  const report = (map, message, {code = 'invalid', ids = [], point, warning = false} = {}) => problems.push(problem(code, map, message, ids, point, warning ? 'warning' : 'error'));
  const quality_ = (map, message, ids = []) => report(map, message, {code: 'quality', ids, warning: !strictQuality});
  for (const expected of contentMaps) if (!document.maps[expected.id]) report('', `missing required map ${expected.id}`);
  for (const scene of Object.values(document.maps)) {
    const map = scene.id;
    let sceneryManifest;
    for(const look of new Set((scene.residents??[]).flatMap(resident=>resident.actionArt?[resident.actionArt]:[]))){
      try{
        const path=`web/public/assets/resident-actions/${look}`,atlas=await loadJSON(`${path}.json`),size=await sharp(resolve(root,`${path}.webp`)).metadata(),art=RESIDENT_ACTION_ART;
        if(size.width!==art.width*art.columns||size.height!==art.height*art.rows||!size.hasAlpha)report(map,`action artwork ${look} must use a transparent registered 512 × 576 atlas`);
        for(const [index,name]of residentActionFrames.entries()){
          const frame=atlas.frames?.[name]?.frame;
          if(!frame||frame.x!==index%art.columns*art.width||frame.y!==Math.floor(index/art.columns)*art.height||frame.w!==art.width||frame.h!==art.height)report(map,`action artwork ${look} has an invalid ${name} frame`);
        }
      }catch{report(map,`missing or unreadable action artwork ${look}`);}
    }
    const content = contentMaps.find(item => item.id === scene.id);
    if (!content && scene.kind !== 'interior') report(map, 'no registered map content');
    if (content && scene.coordinateVersion === 1 && (scene.width !== 1536 || scene.height !== 1024 || (scene.legacyOffset?.x ?? 0) !== 0 || (scene.legacyOffset?.y ?? 0) !== 0)) report(map, 'legacy bounds/origin require a higher coordinateVersion');
    if (content) for (const kind of ['npcs', 'objects']) {
      const expected = new Set(content[kind].map(item => item.id));
      const actual = new Set(scene[kind].map(item => item.id));
      for (const id of actual) if (!expected.has(id)) report(map, `${kind} ${id} has no authored content`, {ids: [id]});
      for (const id of expected) if (!actual.has(id)) report(map, `missing required ${kind} ${id}; deletion needs a content migration`, {code: 'missing', ids: [id]});
    }
    if(scene.modularTerrain){
      const {terrainMaterial}=await import('../web/src/terrain-materials.ts');
      for(const id of new Set([scene.modularTerrain.base,...scene.modularTerrain.surfaces.map(surface=>surface.material)])){
        const material=terrainMaterial(id);
        try{
          const size=await sharp(resolve(root,'web/public',material.asset.slice(1))).metadata();
          if(size.width!==material.width||size.height!==material.height||size.width/material.worldSize<4)report(map,`terrain material ${id} must retain its registered high resolution`);
        }catch{report(map,`missing terrain material ${id}`);}
      }
    }
    for (const tile of scene.terrain) {
      if(content&&!tile.walkableMaskAsset)quality_(map,`${tile.id} needs an authored ground mask`);
      const coreX=scene.legacyOffset?.x??0,coreY=scene.legacyOffset?.y??0;
      const expansion=tile.dayAsset.startsWith('/assets/world-expansions/')||tile.nightAsset?.startsWith('/assets/world-expansions/')
        ||scene.kind!=='interior'&&(tile.x<coreX||tile.y<coreY||tile.x+tile.width>coreX+1536||tile.y+tile.height>coreY+1024);
      if(expansion&&(tile.width!==768||tile.height!==512||tile.pixelDensity!==4
        ||!tile.nightAsset||!tile.dayPreviewAsset||!tile.nightPreviewAsset||!tile.dayCrop||!tile.nightCrop)){
        report(map,`${tile.id} expansion terrain requires 768 × 512 world-unit chunks, 4 pixels per unit, day/night crops and overview assets`);
      }
      for (const asset of [tile.dayPreviewAsset, tile.nightPreviewAsset].filter(Boolean)) {
        try {
          const size = await sharp(resolve(root, 'web/public', asset.slice(1))).metadata();
          if (size.width !== tile.width || size.height !== tile.height) report(map,`${tile.id} overview must be one pixel per world unit`);
        } catch { report(map,`missing or unreadable terrain overview ${asset}`); }
      }
      for (const [asset, crop] of [[tile.dayAsset, tile.dayCrop], [tile.nightAsset, tile.nightCrop]].filter(([asset]) => asset)) {
        try {
          if (!imageSizes.has(asset)) imageSizes.set(asset, sharp(resolve(root, 'web/public', asset.slice(1))).metadata());
          const size = await imageSizes.get(asset);
          if(expansion&&crop&&(crop.x<1||crop.y<1||crop.width!==3072||crop.height!==2048||crop.x+crop.width>=size.width||crop.y+crop.height>=size.height))report(map,`${tile.id} expansion crop needs a 3072 × 2048 visible frame with sampling guards on every edge`);
          if (crop && (crop.x + crop.width > size.width || crop.y + crop.height > size.height)) report(map,`${tile.id} crop exceeds ${asset}`);
          if (tile.pixelDensity !== undefined && ((crop?.width ?? size.width) !== tile.width * tile.pixelDensity || (crop?.height ?? size.height) !== tile.height * tile.pixelDensity)) report(map,`${tile.id} artwork does not match its declared pixel density`);
          if (size.width > 4096 || size.height > 4096) report(map,`${tile.id} terrain exceeds the 4096-pixel GPU texture limit`);
        } catch { report(map,`missing or unreadable terrain asset ${asset}`); }
      }
    }
    if (content) {
      for (const asset of new Set([content.sceneryAsset, content.variationAsset])) {
        try { await access(resolve(root, 'web/public', asset.slice(1))); }
        catch { report(map,`missing scenery asset ${asset}`); }
      }
      const atlases = await Promise.all([content.sceneryAtlas, content.variationAtlas].map(path => loadJSON(`web/public${path}`)));
      const manifests = await Promise.all(['day', 'night'].map(period => loadJSON(`web/public/assets/${scene.id}-${period}-animations.json`)));
      sceneryManifest=manifests[0];
      const frameSizes=await sceneryFrameSizes(manifests,key=>loadJSON(`web/public/assets/${key}.json`));
      for (const issue of validateSceneryGeometry(scene.id,sceneryManifest,await loadJSON('web/src/data/scenery-geometry.json'),manifests[1],frameSizes)) report(map, issue.replace(`${map}: `, ''));
      const renderedGeometry=geometryFromManifest(sceneryManifest,manifests[1],frameSizes);
      const spacingIssues=auditBuildingSpacing(scene,renderedGeometry);
      quality[scene.id]=auditSceneQuality(scene,sceneryManifest,renderedGeometry);
      for (const issue of quality[scene.id].issues.filter(issue=>!spacingIssues.includes(issue))) quality_(map, issue.replace(`${map}: `, ''));
      for(const [variant,atlas] of atlases.entries())for(const frame of Object.keys(atlas.frames??{}))prefabFrames.add(`${!!variant}:${frame}`);
      for(const frame of Object.keys(manifests[0].assets??{}))if(manifests.every(manifest=>manifest.assets?.[frame]))for(const variant of [false,true])prefabFrames.add(`${variant}:${frame}`);
      for (const item of scene.scenery) {
        const frame = item.frame ?? item.asset, atlas = atlases[item.variant ? 1 : 0];
        if (!atlas.frames?.[frame] && !manifests.every(manifest => manifest.assets?.[frame])) report(map, `scenery ${item.id} has no registered frame ${frame}`, {ids: [item.id]});
      }
    }
    const geometry=sceneNavigationGeometry(scene,sceneryManifest);
    const grid = new NavigationGrid(geometry.ground,geometry.barriers,scene);
    const groundGrid = new NavigationGrid(geometry.ground,geometry.terrain,scene);
    // Spawn, story targets, doors and activity spots, measured with a full player footprint.
    for (const issue of auditScene(scene, SceneReach.from(scene, new NavigationGrid(geometry.ground,geometry.barriers,scene,{agentRadius:PLAYER_RADIUS}), grid)))
      problems.push(issue.code === 'missing-room' && strictQuality ? {...issue, severity: 'error'} : issue);
    for(const tile of (scene.modularTerrain ? [] : scene.terrain.filter(tile=>tile.walkableMaskAsset))){
      try{
        const {data,info}=await sharp(resolve(root,'web/public',tile.walkableMaskAsset.slice(1))).removeAlpha().greyscale().raw().toBuffer({resolveWithObject:true});
        if(info.width!==tile.width||info.height!==tile.height)report(map,`${tile.id} walkable mask must be one pixel per world unit`);
        else {
          let offGround=0;
          const groundPixel=(x,y)=>x>=0&&y>=0&&x<info.width&&y<info.height&&data[y*info.width+x]>=128;
          // Mask pixels describe unit squares. Sample their centres so a closed
          // white-cell boundary is not mistaken for its black neighbour. Float
          // contours rasterize with up to one pixel of edge quantization.
          for(let y=3;y<tile.height;y+=6)for(let x=3;x<tile.width;x+=6)
            if(!groundPixel(x,y)&&!groundPixel(x-1,y)&&!groundPixel(x+1,y)&&!groundPixel(x,y-1)&&!groundPixel(x,y+1)
              &&(scene.navigation?groundGrid:grid).isWalkable(tile.x+x+.5,tile.y+y+.5))offGround++;
          if(offGround)report(map,`${tile.id} navigation crosses ${offGround} samples outside its painted walkable mask`);
        }
      }catch{report(map,`missing or unreadable walkable mask ${tile.walkableMaskAsset}`);}
    }
    const reachability=grid.auditReachability(scene.spawn);
    if(reachability.reachableRatio<.995)report(map,`spawn reaches ${(100*reachability.reachableRatio).toFixed(2)}% of walkable samples; ${scene.navigation?'isolated clear land is allowed, interaction targets must be reachable':'at least 99.5% is required'}`,{warning:!!scene.navigation});
    problems.push(...residentProblems(scene, grid));
  }
  for(const prefab of document.prefabs??[])for(const item of prefab.scenery){
    if(!prefabFrames.has(`${!!item.variant}:${item.frame??item.asset}`))report('',`prefab ${prefab.id}: child ${item.id} has no registered artwork`);
  }
  const errors = problems.filter(item => item.severity === 'error'), warnings = problems.filter(item => item.severity !== 'error');
  if (errors.length) throw new SceneCompileError(errors);
  const registry = compileRegistry(document);
  // Position-only regeneration keeps the existing narrative/grading rules intact.
  const storyRules = compileStoryRules(document, await loadJSON('server/story_rules.json'));
  return {document, contentVersion: registry.contentVersion, registry, storyRules,
    warnings: warnings.map(item => item.map ? `${item.map}: ${item.message}` : item.message), problems: warnings, quality};
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
