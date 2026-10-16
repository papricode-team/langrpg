#!/usr/bin/env node
/**
 * Long-running world edit worker for the Go server. It keeps the published
 * document and its navigation grids in memory, so a single edit is checked in
 * milliseconds instead of recompiling every town.
 *
 * Protocol: one JSON request per stdin line, one JSON response per stdout line.
 *   {id, type: 'apply', base: {key, document?}, ops}
 *     -> {id, ok: true, key, bundle, applied, warnings}
 *     -> {id, ok: false, problems}            edit refused
 *     -> {id, ok: false, needDocument: true}  unknown base key; resend with document
 *   {id, type: 'compile', document}
 *     -> {id, ok: true, bundle} | {id, ok: false, problems}
 *   {id, type: 'reconcile', document, seed?}
 *     -> {id, ok: true, added, bundle}     story anchors added from the seed, authority recompiled
 */
import {readFile} from 'node:fs/promises';
import {createInterface} from 'node:readline';
import {randomUUID} from 'node:crypto';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import './register-content-loader.mjs';
import {compileAdminWorld} from './admin-world-compiler.mjs';
import {compileRegistry, compileStoryRules, missingStoryAnchors, residentProblems, sceneContentVersion} from './scene-compiler.mjs';
const {parseWorldSceneDocument} = await import('../web/src/scene-schema.ts');
const {applyEditOps, parseEditOps} = await import('../web/src/world-edit-ops.ts');
const {placementProblems, newWarnings, SceneReach, WorldEditError, problem} = await import('../web/src/world-edit-rules.ts');

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const root = args[0] === '--root' && args[1] ? resolve(args[1]) : projectRoot;
const authoredRules = JSON.parse(await readFile(resolve(root, 'server/story_rules.json'), 'utf8'));

/** A published document with lazily built navigation per town. */
class WorldState {
  constructor(document, reach = new Map()) { this.document = document; this.reach = reach; }
  reachFor(map) {
    let reach = this.reach.get(map);
    if (!reach) { reach = SceneReach.build(this.document.maps[map]); this.reach.set(map, reach); }
    return reach;
  }
}
const states = new Map();
const remember = (key, state) => {
  states.set(key, state);
  // The server only ever builds on its latest publication. Keep a few for retries.
  while (states.size > 4) states.delete(states.keys().next().value);
};

function apply(request) {
  let state = states.get(request.base?.key);
  if (!state) {
    if (request.base?.document === undefined) return {ok: false, needDocument: true};
    state = new WorldState(parseWorldSceneDocument(structuredClone(request.base.document)));
    remember(request.base.key, state);
  }
  const ops = parseEditOps(request.ops);
  const {document, changed, restored} = applyEditOps(state.document, ops);
  try { parseWorldSceneDocument(structuredClone(document)); }
  catch (error) { return {ok: false, problems: [problem('invalid', ops[0].map, String(error.message ?? error).replace(/^Invalid world scene: /, ''))]}; }
  const reach = new Map(state.reach), problems = [];
  for (const [map, ids] of changed) {
    const before = state.document.maps[map], after = document.maps[map];
    const reachBefore = state.reachFor(map), reachAfter = reachBefore.with(after);
    reach.set(map, reachAfter);
    problems.push(...placementProblems(before, after, ids, {before: reachBefore, after: reachAfter}, restored));
    if (after.residents?.length) {
      // A broken routine never refuses an edit; the town keeps playing without that resident's walk.
      const broken = residentProblems(after, reachAfter.actors);
      const earlier = broken.length ? new Set(residentProblems(before, reachBefore.actors).map(item => item.message)) : new Set();
      problems.push(...broken.filter(item => !earlier.has(item.message)).map(item => ({...item, severity: 'warning'})));
    }
    problems.push(...newWarnings(before, after), ...storyPinWarnings(before, after));
  }
  const errors = problems.filter(item => item.severity === 'error');
  if (errors.length) return {ok: false, problems: errors};
  const key = randomUUID();
  remember(key, new WorldState(document, reach));
  // Clients apply exactly what the server applied, including baked footprints.
  const applied = ops.map(op => op.kind !== 'place' ? op : {...op, item: document.maps[op.map].scenery.find(item => item.id === op.item.id)});
  const worldMaps = compileRegistry(document);
  return {ok: true, key, applied, warnings: problems,
    bundle: {document, changedMaps: [...changed.keys()], worldMaps, investigations: compileStoryRules(document, authoredRules, {strict: false}), contentVersion: sceneContentVersion(document), diagnostics: []}};
}

/** Story pins (fading names, Otto's tickets) whose object this edit removed. They stay at their authored spot. */
function storyPinWarnings(before, after) {
  const earlier = new Set(missingStoryAnchors(before, authoredRules).map(pin => pin.id));
  return missingStoryAnchors(after, authoredRules).filter(pin => !earlier.has(pin.id)).map(pin => problem('story-anchor', after.id,
    `${pin.kind === 'ticket' ? `Otto's ticket for ${pin.name}` : `The fading name “${pin.name}”`} was written on this object. Players now find it at its original spot; put the object back with Undo to keep them together.`,
    [pin.anchor.split(':')[1]], undefined, 'warning'));
}

/**
 * A release may add story characters and evidence the saved world lacks. They
 * join at the seed's position; the admin's own placements are kept. Story
 * positions and the map registry are recompiled from the result.
 */
function reconcile(request) {
  const document = structuredClone(request.document), added = [];
  // Towns saved before painted ground that kept their image plates take the seed's ground, which was
  // classified from those plates; vector terrain converts exactly when the document is parsed.
  if (document.version === 3) for (const [id, scene] of Object.entries(document.maps ?? {})) {
    const seeded = request.seed?.maps?.[id]?.ground;
    if (!scene.ground && !scene.modularTerrain && seeded && scene.width === request.seed.maps[id].width && scene.height === request.seed.maps[id].height) {
      scene.ground = structuredClone(seeded);
      added.push(`${id}/ground`);
    }
  }
  for (const [id, seed] of Object.entries(request.seed?.maps ?? {})) {
    const scene = document.maps?.[id];
    if (!scene) continue;
    for (const key of ['npcs', 'objects']) {
      const rows = scene[key] ??= [], known = new Set(rows.map(row => row.id));
      for (const row of seed[key] ?? []) if (!known.has(row.id)) { rows.push(structuredClone(row)); added.push(`${id}/${row.id}`); }
    }
  }
  const upgraded = document.version !== 4;
  const parsed = parseWorldSceneDocument(document);
  const changedMaps = upgraded ? Object.keys(parsed.maps) : [...new Set(added.map(entry => entry.split('/')[0]))];
  return {ok: true, added, bundle: {document: parsed, changedMaps, worldMaps: compileRegistry(parsed),
    investigations: compileStoryRules(parsed, authoredRules, {strict: false}), contentVersion: sceneContentVersion(parsed), diagnostics: []}};
}

/** Build every town's grids ahead of the first edit. */
function warm(request) {
  let state = states.get(request.base?.key);
  if (!state) {
    if (request.base?.document === undefined) return {ok: false, needDocument: true};
    state = new WorldState(parseWorldSceneDocument(structuredClone(request.base.document)));
    remember(request.base.key, state);
  }
  for (const map of Object.keys(state.document.maps)) state.reachFor(map);
  return {ok: true};
}

async function handle(request) {
  try {
    if (request.type === 'apply') return apply(request);
    if (request.type === 'warm') return warm(request);
    if (request.type === 'reconcile') return reconcile(request);
    if (request.type === 'compile') return {ok: true, bundle: await compileAdminWorld(request.document, {root})};
    return {ok: false, problems: [problem('invalid', '', 'Unknown worker request.')]};
  } catch (error) {
    if (error instanceof WorldEditError || Array.isArray(error?.problems)) return {ok: false, problems: error.problems};
    return {ok: false, problems: [problem('invalid', '', String(error?.message ?? error))]};
  }
}

const lines = createInterface({input: process.stdin, crlfDelay: Infinity});
let queue = Promise.resolve();
lines.on('line', line => {
  if (!line.trim()) return;
  queue = queue.then(async () => {
    let request;
    try { request = JSON.parse(line); }
    catch { process.stdout.write(`${JSON.stringify({id: null, ok: false, problems: [problem('invalid', '', 'Invalid worker request.')]})}\n`); return; }
    const response = await handle(request);
    process.stdout.write(`${JSON.stringify({id: request.id, ...response})}\n`);
  });
});
process.stdout.write(`${JSON.stringify({ready: true})}\n`);
