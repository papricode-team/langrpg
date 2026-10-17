#!/usr/bin/env node
/** Validate canonical scenes and compile the matching server coordinate contract. */
import {readFile, access} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import './register-content-loader.mjs';
const {parseWorldSceneDocument, sceneEntrances, sceneEntrancePoint} = await import('../web/src/scene-schema.ts');
import {auditSceneQuality} from './scene-quality.mjs';
import {sceneryFrameSizes,validateSceneryGeometry} from './scenery-geometry.mjs';
const {compileResidentActivities} = await import('../web/src/resident-activities.ts');
const {residentActionFrames,RESIDENT_ACTION_ART} = await import('../web/src/resident-action-art.ts');
const {NavigationGrid,PLAYER_RADIUS} = await import('../web/src/navigation.ts');
const {terrainObjects,terrainObject}=await import('../web/src/terrain-objects.ts');
const {sceneNavigationGeometry} = await import('../web/src/scene-navigation.ts');
const {maps: contentMaps} = await import('../web/src/maps.ts');
const {getInterior} = await import('../web/src/interiors.ts');
const {buildingRooms,buildingRoomId}=await import('../web/src/room-layout.ts');
const {roomLayoutProblems} = await import('../web/src/room-layout-validation.ts');
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
    entrances: Object.fromEntries(sceneEntrances(scene).flatMap(entrance => {
      const layout = entrance.interiorId.startsWith('train-') ? undefined : entrance.owner.roomLayout;
      if (layout) {
        const problems = roomLayoutProblems(getInterior(layout.kind), layout);
        if (problems.length) throw new SceneCompileError(problems.map(message=>problem('invalid',scene.id,message,[entrance.ownerId])));
      }
      const approach = sceneEntrancePoint(scene, entrance), back = sceneEntrancePoint(scene, entrance, true);
      const rooms=layout ? buildingRooms(layout) : [{id:'main',layout:undefined}];
      return rooms.map(room=>[buildingRoomId(entrance.interiorId,room.id), {id:entrance.id,ownerId:entrance.ownerId,
        ...(room.id!=='main'?{building:entrance.interiorId}:{}),
        ...(room.layout?.level!==undefined?{level:room.layout.level}:{}),
        ...(room.layout?.spawn ? {spawn:{x:room.layout.spawn.x/1536,y:room.layout.spawn.y/1024}} : {}),
        ...(room.layout?.links?.length ? {doors:Object.fromEntries(room.layout.links.map(door=>{
          const destination=rooms.find(r=>r.id===door.targetRoom).layout.links.find(d=>d.id===door.targetDoor);
          return [door.id,{...(door.kind?{kind:door.kind}:{}),target:buildingRoomId(entrance.interiorId,door.targetRoom),arrival:{x:destination.x/1536,y:destination.y/1024}}];
        }))} : {}),
        approach:{x:approach.x/scene.width,y:approach.y/scene.height},return:{x:back.x/scene.width,y:back.y/scene.height}}]);
    })),
    ...(scene.legacyOffset ? {legacyOffset: scene.legacyOffset} : {}),
  };
  return registry;
}

/**
 * Story positions follow the edited anchors; narrative and grading rules stay as authored.
 * `strict` refuses a story pin whose anchor is missing, for the checked-in world. Admin
 * edits are not strict: a pin whose anchor was removed keeps its authored position, as the
 * server does when it reconciles a saved world, so a story pin never blocks a map edit.
 */
export function compileStoryRules(document, authored, {strict = true} = {}) {
  const storyRules = structuredClone(authored);
  const fail = message => { if (strict) throw new Error(message); };
  for (const rule of storyRules.rules) {
    // Interior anchors belong to their room spec, not the editable town map.
    if (rule.interiorId) continue;
    const scene = document.maps[rule.mapId];
    if (!scene) { fail(`Missing scene for story ${rule.questId}`); continue; }
    const normalize = anchor => ({id: anchor.id, x: anchor.x / scene.width, y: anchor.y / scene.height});
    const npc = scene.npcs.find(item => item.id === rule.npcId);
    if (npc) rule.npc = normalize(npc); else fail(`Missing story NPC ${rule.npcId}`);
    rule.objects = rule.investigationObjectIds.map(id => {
      const object = scene.objects.find(item => item.id === id);
      if (object) return normalize(object);
      fail(`Missing story object ${id}`);
      return rule.objects?.find(item => item.id === id) ?? {id, x: 0, y: 0};
    });
  }
  // Fading names and ticket addresses follow the anchors they are written on.
  for (const [row, label] of storyPins(storyRules)) {
    const scene = document.maps[row.mapId];
    if (!scene) { fail(`Missing scene for ${label} ${row.id}`); continue; }
    const anchor = storyAnchor(scene, row.anchor);
    if (anchor) { row.x = anchor.x / scene.width; row.y = anchor.y / scene.height; }
    else if (row.anchor) fail(`Missing ${label} anchor ${row.anchor} for ${row.id}`);
  }
  return storyRules;
}
const storyPins = rules => [...(rules.ink?.entries ?? []).map(entry => [entry, 'ink']), ...(rules.sideQuests ?? []).map(side => [side, 'ticket'])];
function storyAnchor(scene, value) {
  if (!value) return undefined;
  const [kind, id] = value.split(':');
  const rows = kind === 'npc' ? scene.npcs : kind === 'object' ? scene.objects : kind === 'scenery' ? scene.scenery : undefined;
  return rows?.find(item => item.id === id);
}
/** Story pins written on an object that is missing from the town, for editor warnings. */
export function missingStoryAnchors(scene, authored) {
  return storyPins(authored).filter(([row]) => row.mapId === scene.id && row.anchor && !storyAnchor(scene, row.anchor))
    .map(([row, label]) => ({id: row.id, kind: label, anchor: row.anchor, name: row.german ?? row.id}));
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
    {
      const {terrainMaterial}=await import('../web/src/terrain-materials.ts');
      const {terrainFeature}=await import('../web/src/terrain-features.ts');
      for(const id of new Set((scene.ground.features??[]).map(feature=>feature.asset))){
        const art=terrainFeature(id);
        try{
          const size=await sharp(resolve(root,'web/public',art.asset.slice(1))).metadata();
          if(size.width!==art.width||size.height!==art.height||Math.min(size.width,size.height)<1024||!size.hasAlpha)report(map,`ground feature ${id} needs native HD art with transparency`);
        }catch{report(map,`missing ground feature art ${id}`);}
      }
      for(const id of scene.ground.layers){
        const material=terrainMaterial(id);
        try{
          if(!imageSizes.has(material.asset))imageSizes.set(material.asset,sharp(resolve(root,'web/public',material.asset.slice(1))).metadata());
          const size=await imageSizes.get(material.asset);
          if(size.width!==material.width||size.height!==material.height||Math.min(size.width,size.height)<1024||size.width/material.worldSize<2)report(map,`ground material ${id} must retain its registered high resolution`);
        }catch{report(map,`missing ground material ${id}`);}
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
      quality[scene.id]=auditSceneQuality(scene,sceneryManifest);
      for (const issue of quality[scene.id].issues) quality_(map, issue.replace(`${map}: `, ''));
      for(const [variant,atlas] of atlases.entries())for(const frame of Object.keys(atlas.frames??{}))prefabFrames.add(`${!!variant}:${frame}`);
      for(const frame of Object.keys(manifests[0].assets??{}))if(manifests.every(manifest=>manifest.assets?.[frame]))for(const variant of [false,true])prefabFrames.add(`${variant}:${frame}`);
      for(const detail of terrainObjects)for(const variant of [false,true])prefabFrames.add(`${variant}:${detail.id}`);
      for (const item of scene.scenery) {
        const frame = item.frame ?? item.asset, atlas = atlases[item.variant ? 1 : 0];
        const detail=terrainObject(frame);
        if(detail){
          try{const size=await sharp(resolve(root,`web/public${detail.asset}`)).metadata();if(size.width!==detail.width||size.height!==detail.height||detail.width/item.width<4)report(map,`scenery ${item.id} needs native high-resolution detail artwork`,{ids:[item.id]});}
          catch{report(map,`missing detail artwork ${detail.asset}`,{ids:[item.id]});}
          continue;
        }
        if (!atlas.frames?.[frame] && !manifests.every(manifest => manifest.assets?.[frame])) report(map, `scenery ${item.id} has no registered frame ${frame}`, {ids: [item.id]});
      }
    }
    const geometry=sceneNavigationGeometry(scene,sceneryManifest);
    const grid = new NavigationGrid(geometry.ground,geometry.barriers,scene);
    // Spawn, story targets, doors and activity spots, measured with a full player footprint.
    for (const issue of auditScene(scene, SceneReach.from(scene, new NavigationGrid(geometry.ground,geometry.barriers,scene,{agentRadius:PLAYER_RADIUS}), grid)))
      problems.push(issue.code === 'missing-room' && strictQuality ? {...issue, severity: 'error'} : issue);
    const reachability=grid.auditReachability(scene.spawn);
    if(reachability.reachableRatio<.995)report(map,`spawn reaches ${(100*reachability.reachableRatio).toFixed(2)}% of walkable samples; isolated land is allowed, interaction targets must be reachable`,{warning:true});
    problems.push(...residentProblems(scene, grid));
  }
  for(const prefab of document.prefabs??[])for(const item of prefab.scenery){
    if(!prefabFrames.has(`${!!item.variant}:${item.frame??item.asset}`))report('',`prefab ${prefab.id}: child ${item.id} has no registered artwork`);
  }
  const errors = problems.filter(item => item.severity === 'error'), warnings = problems.filter(item => item.severity !== 'error');
  if (errors.length) throw new SceneCompileError(errors);
  const registry = compileRegistry(document);
  // Position-only regeneration keeps the existing narrative/grading rules intact.
  const storyRules = compileStoryRules(document, await loadJSON('server/story_rules.json'), {strict: strictQuality});
  return {document, contentVersion: registry.contentVersion, registry, storyRules,
    warnings: warnings.map(item => item.map ? `${item.map}: ${item.message}` : item.message), problems: warnings, quality};
}

/** Validates the seed world: `node scripts/scene-compiler.mjs check [document.json]`. The server owns the live world. */
async function main() {
  const [command = 'check', input] = process.argv.slice(2);
  if (command !== 'check') throw new Error('Usage: node scripts/scene-compiler.mjs check [document.json]');
  const value = JSON.parse(await readFile(resolve(input ?? resolve(projectRoot, 'content/world-seed.json')), 'utf8'));
  const result = await compileSceneDocument(value);
  if(result.warnings.length)console.warn(result.warnings.join('\n'));
  console.log(`Validated ${Object.keys(result.document.maps).length} scenes (${result.contentVersion}).`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
