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
 */
import {readFile} from 'node:fs/promises';
import {createInterface} from 'node:readline';
import {randomUUID} from 'node:crypto';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import './register-content-loader.mjs';
import {compileAdminWorld} from './admin-world-compiler.mjs';
import {compileRegistry, compileStoryRules, residentProblems, sceneContentVersion} from './scene-compiler.mjs';
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
    if (!problems.some(item => item.severity === 'error') && after.residents?.length) problems.push(...residentProblems(after, reachAfter.actors));
    problems.push(...newWarnings(before, after));
  }
  const errors = problems.filter(item => item.severity === 'error');
  if (errors.length) return {ok: false, problems: errors};
  const key = randomUUID();
  remember(key, new WorldState(document, reach));
  // Clients apply exactly what the server applied, including baked footprints.
  const applied = ops.map(op => op.kind !== 'place' ? op : {...op, item: document.maps[op.map].scenery.find(item => item.id === op.item.id)});
  const worldMaps = compileRegistry(document);
  return {ok: true, key, applied, warnings: problems,
    bundle: {document, worldMaps, investigations: compileStoryRules(document, authoredRules), contentVersion: sceneContentVersion(document), diagnostics: []}};
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
