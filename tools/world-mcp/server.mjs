#!/usr/bin/env node
/**
 * MCP server for editing the glotworld world. It speaks MCP over stdio and
 * calls a glotworld server's admin world API, so edits are validated and
 * published exactly like the in-game editor's, and players see them at once.
 *
 *   GLOTWORLD_URL           server origin, default https://glotworld.com
 *   GLOTWORLD_ADMIN_TOKEN   an API token from Admin › API tokens
 *
 * Register it with an MCP client, for example in .mcp.json:
 *   {"mcpServers": {"glotworld-world": {"command": "node", "args": ["tools/world-mcp/server.mjs"]}}}
 */
import {createInterface} from 'node:readline';
import {readFile, writeFile, mkdir, rename, rm} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {worldClient, WorldAPIError} from '../../scripts/world-client.mjs';
import {pullWorld, pushWorld} from '../../scripts/world-sync.mjs';
import {scenePreviewPNG} from '../../scripts/world-preview.mjs';
import {roomViewPNG, townViewPNG, closeWorldView} from '../../scripts/world-view.mjs';
import {shapeGround} from '../../scripts/ground-shapes.mjs';
import {compileSceneDocument, residentProblems, SceneCompileError} from '../../scripts/scene-compiler.mjs';
import '../../scripts/register-content-loader.mjs';
import {roomTools, createRoomHandlers} from './rooms.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const {parseWorldSceneDocument} = await import('../../web/src/scene-schema.ts');
const {paletteChoices} = await import('../../web/src/world-edit-catalogue.ts');
const {terrainMaterials} = await import('../../web/src/terrain-materials.ts');
const {terrainFeatures} = await import('../../web/src/terrain-features.ts');
const {groundFingerprint} = await import('../../web/src/ground.ts');
const {terrainMaterial} = await import('../../web/src/terrain-materials.ts');
const {applyEditOps, parseEditOps} = await import('../../web/src/world-edit-ops.ts');
const {placementProblems, newWarnings, SceneReach, auditScene, sceneWarnings} = await import('../../web/src/world-edit-rules.ts');

const editGuide = `Each operation names its town in "map". Coordinates are world units: x grows east, y grows south; a
scenery or anchor position is the foot point where it meets the ground. Kinds:
- {kind:"move", map, id, x, y}: move scenery.
- {kind:"moveAnchor", map, anchor:"npc"|"object", id, x, y}: move a story character or piece of evidence.
- {kind:"place", map, item:{id, asset, frame?, x, y, width, flipX?}, activities?}: add scenery. Choose asset and frame
  from list_catalogue; width is the drawn width in world units (see its typicalWidth). ids are lowercase-with-dashes and unique
  in the town. activities are spots residents use: {id, ownerId: item.id, kind: seat|work|pickup|service|shelter|wait, offsetX, offsetY, capacity?}.
- {kind:"update", map, id, frame?, width?, flipX?, collidable?, interior?: {kind: cafe|bakery|supermarket|inn|library|workshop|station|greenhouse|home} | null}.
- {kind:"room", map, id, layout, expected}: replace a building’s layout, or reset with layout:null. expected is
  get_building’s fingerprint. Prefer edit_building and copy_building_layout for component, room and floor edits.
- {kind:"remove", map, id}: refused while a resident's schedule uses the object's activity spots.
- {kind:"residents", map, residents:[...]}: replace a town's residents and their daily schedules (see get_town).
- {kind:"paint", map, material, radius, strength, points:[[x,y],...]}: one brush stroke of ground. The soft round
  brush adds strength (0–1) of the material along the points (up to 400); radius is in world units (up to 512). Repeat
  a stroke to cover fully. A town uses at most six materials; blocked materials (water, cliff) stop walkers where they
  dominate. Materials come from list_catalogue.
- {kind:"ground", map, ground, expected}: replace a town's whole ground, for example to move bridges and inlays in
  ground.features. expected is the fingerprint of the ground being replaced, from get_town's terrain section.
Up to 50 operations apply together or not at all. Edits that break play are refused with problems that name the
objects; softer issues (overlaps, blocked routes) publish with warnings. Look at the result with view_town.
With draft (a world file from pull_world) the operations apply to that file with the same checks instead of the
live world; publish the draft with push_world.`;

const draftSchema = {type: 'string', description: 'A local world file from pull_world (such as .world/draft.json). Reads and edits that file instead of the live world.'};
const shapesGuide = `Lay out a town's ground from shapes, painted in order (later shapes cover earlier ones), into a draft file.
Each shape is {material, line:[[x,y],...], width} (streets, rivers), {material, rect:[x0,y0,x1,y1], radius} (squares),
{material, polygon:[[x,y],...]} or {material, circle:[x,y], radius}. Natural shapes (forest floor, streams, worn paths)
can add soft (edge fade in world units) and wobble (how far the outline wanders). base is the material everywhere else; patches
[{material, amount 0–1, scale}] add soft natural variation to it (moss, dry grass). The edge of a shape is crisp: paving
materials get a row of kerb stones and built water (deep-water, canal-water, banked-water) a coping and wall, exactly
on the outline. Bridges and inlays in ground.features are kept unless features is given (canal-arch-bridge decks run
from the north-west to the south-east, so they cross water running from south-west to north-east). At most six
materials. Check with view_town and audit_town, then push_world.`;

const tools = [
  ...roomTools,
  {name: 'world_status', description: 'List the towns with their size and contents, the world revision and who is editing what. Start here.',
    inputSchema: {type: 'object', properties: {}}},
  {name: 'get_town', description: 'Read one town as JSON. Choose sections to keep the answer small; region limits scenery, characters and evidence to an area.',
    inputSchema: {type: 'object', required: ['town'], properties: {
      town: {type: 'string'}, draft: draftSchema,
      sections: {type: 'array', items: {type: 'string', enum: ['scenery', 'npcs', 'objects', 'activities', 'residents', 'districts', 'terrain', 'spawn', 'prefabs']}, description: 'Default: scenery, npcs, objects, districts, spawn. terrain gives the ground materials, features and fingerprint.'},
      region: regionSchema()}}},
  {name: 'render_town', description: 'Draw a town as a labelled plan: ground in each material\'s flat colour (the legend says which), blocked ground outlined, object footprints (brown), scenery ids, story characters (red), evidence (orange squares), residents\' homes (purple) and the spawn (green), over a grid in world units. Use it to find things; use view_town to see how the town looks.',
    inputSchema: {type: 'object', required: ['town'], properties: {town: {type: 'string'}, region: regionSchema(), labels: {type: 'boolean', default: true}, draft: draftSchema}}},
  {name: 'view_town', description: 'Screenshot a town as players see it: the game\'s own renderer draws the painted ground with its kerbs and canal walls, bridges, buildings, trees and props. Use it to judge how an edit looks. A whole town takes a few seconds; a region renders sharper. scale is screen pixels per world unit (play zoom is about 1).',
    inputSchema: {type: 'object', required: ['town'], properties: {town: {type: 'string'}, region: regionSchema(), scale: {type: 'number', minimum: 0.1, maximum: 3},
      period: {type: 'string', enum: ['day', 'night'], default: 'day'}, draft: draftSchema}}},
  {name: 'audit_town', description: 'Check a town as a release would: story characters, evidence, doors and resident spots reachable from the spawn, residents\' daily walks, artwork scale, composition per screenful (a building, an activity spot and at least ten objects in every 768 × 512 chunk) and overlaps. Empty problems means it is ready to publish.',
    inputSchema: {type: 'object', required: ['town'], properties: {town: {type: 'string'}, draft: draftSchema}}},
  {name: 'shape_ground', description: shapesGuide,
    inputSchema: {type: 'object', required: ['town', 'draft', 'base', 'shapes'], properties: {town: {type: 'string'}, draft: draftSchema, base: {type: 'string'},
      shapes: {type: 'array', items: {type: 'object'}}, patches: {type: 'array', items: {type: 'object'}}, features: {type: 'array', items: {type: 'object'}, description: 'Replace ground.features (bridges, inlays): {id, asset, x, y, width}; x, y is the top-left corner.'}}}},
  {name: 'list_catalogue', description: 'Objects that can be placed in a town (asset, frame, label, rooms a building can host, typical drawn width in world units), the ground materials it can be painted with, and the bridge and inlay pieces for its ground. Use list_room_catalogue for interior furniture and games.',
    inputSchema: {type: 'object', required: ['town'], properties: {town: {type: 'string'}, asset: {type: 'string', description: 'Only this kind, such as house, tree or bench.'}}}},
  {name: 'apply_edits', description: `Validate and publish edit operations to the live world, or apply them to a draft file.\n${editGuide}`,
    inputSchema: {type: 'object', required: ['ops'], properties: {ops: {type: 'array', minItems: 1, maxItems: 50, items: {type: 'object'}}, draft: draftSchema}}},
  {name: 'list_edits', description: 'The edit log, newest first: who changed which towns, from where, and the operations.',
    inputSchema: {type: 'object', properties: {limit: {type: 'integer', minimum: 1, maximum: 200, default: 20}, before: {type: 'integer', description: 'Continue below this seq.'}}}},
  {name: 'pull_world', description: 'Save the whole world (towns and story line changes) to a local file, by default .world/world.json. seed:true also makes it content/world-seed.json, the world new databases start from.',
    inputSchema: {type: 'object', properties: {file: {type: 'string'}, seed: {type: 'boolean'}}}},
  {name: 'push_world', description: 'Publish a pulled world file after editing it. Refused when the server changed since the pull. check:true only validates.',
    inputSchema: {type: 'object', properties: {file: {type: 'string'}, check: {type: 'boolean'}}}},
];

function regionSchema() {
  return {type: 'object', description: 'An area in world units.', required: ['x', 'y', 'width', 'height'],
    properties: {x: {type: 'number'}, y: {type: 'number'}, width: {type: 'number'}, height: {type: 'number'}}};
}

export function createWorldTools(client = worldClient()) {
  let cached;
  /** The published world, fetched again only when the revision moved. */
  async function world() {
    const status = await client.status();
    if (cached?.revision !== status.revision) {
      const bundle = await client.export();
      cached = {revision: bundle.revision, contentVersion: bundle.contentVersion, document: parseWorldSceneDocument(bundle.document)};
    }
    return cached;
  }
  /** A pulled world file: its wrapper, kept for push_world, and the parsed document. */
  async function readDraft(file) {
    const path = resolve(root, file), raw = JSON.parse(await readFile(path, 'utf8'));
    return {path, raw, revision: raw.revision ?? 'draft', document: parseWorldSceneDocument(raw.format ? raw.document : raw)};
  }
  async function saveDraft(draft, document) {
    const value = draft.raw.format ? {...draft.raw, document} : document;
    await mkdir(dirname(draft.path), {recursive: true});
    const temporary=`${draft.path}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, `${JSON.stringify(value, null, 1)}\n`);
      await rename(temporary,draft.path);
    } finally {await rm(temporary,{force:true});}
  }
  async function town(name, draft) {
    const current = draft ? await readDraft(draft) : await world(), scene = current.document.maps[name];
    if (!scene) throw new Error(`There is no town called ${name}. Towns: ${Object.keys(current.document.maps).join(', ')}.`);
    return {scene, current};
  }
  const inside = region => item => !region || (item.x >= region.x && item.x <= region.x + region.width && item.y >= region.y && item.y <= region.y + region.height);
  const json = value => ({content: [{type: 'text', text: JSON.stringify(value, null, 1)}]});

  /** The server's checks, run locally: refusals throw, warnings are reported. */
  async function applyToDraft(draft, rawOps) {
    const file = await readDraft(draft), ops = parseEditOps(rawOps);
    const {document, changed, restored} = applyEditOps(file.document, ops);
    parseWorldSceneDocument(structuredClone(document));
    const problems = [];
    for (const [map, ids] of changed) {
      const before = file.document.maps[map], after = document.maps[map];
      const reachBefore = SceneReach.build(before), reachAfter = reachBefore.with(after);
      problems.push(...placementProblems(before, after, ids, {before: reachBefore, after: reachAfter}, restored));
      if (after.residents?.length) {
        const earlier = new Set(residentProblems(before, reachBefore.actors).map(item => item.message));
        problems.push(...residentProblems(after, reachAfter.actors).filter(item => !earlier.has(item.message)).map(item => ({...item, severity: 'warning'})));
      }
      problems.push(...newWarnings(before, after));
    }
    const errors = problems.filter(item => item.severity === 'error');
    if (errors.length) throw new WorldAPIError('The draft was not changed.', 422, errors);
    await saveDraft(file, document);
    return json({draft, applied: ops.length, warnings: problems.map(item => `${item.map}: ${item.message}`)});
  }

  async function applyOperations({ops,draft}) {
    if(draft)return applyToDraft(draft,ops);
    const result=await client.applyOps(ops);cached=undefined;
    return json({revision:result.revision,applied:result.applied.length,warnings:result.warnings.map(item=>`${item.map}: ${item.message}`)});
  }

  const handlers = {
    ...createRoomHandlers({town,json,applyOperations,viewRoom:roomViewPNG}),
    async world_status() {
      const current = await world(), status = await client.status();
      return json({revision: current.revision, contentVersion: current.contentVersion, server: client.origin, locks: status.locks,
        towns: Object.values(current.document.maps).map(scene => ({id: scene.id, width: scene.width, height: scene.height, scenery: scene.scenery.length,
          npcs: scene.npcs.map(npc => npc.id), evidence: scene.objects.length, residents: (scene.residents ?? []).length,
          districts: (scene.districts ?? []).map(district => district.label), ground: scene.ground.layers}))});
    },
    async get_town({town: name, sections = ['scenery', 'npcs', 'objects', 'districts', 'spawn'], region, draft}) {
      const {scene, current} = await town(name, draft), keep = inside(region), result = {id: scene.id, width: scene.width, height: scene.height, revision: current.revision};
      for (const section of sections) {
        if (section === 'scenery') result.scenery = scene.scenery.filter(keep).map(({collision, sortLine, ...item}) => item);
        else if (section === 'npcs' || section === 'objects') result[section] = scene[section].filter(keep).map(({collision, ...item}) => item);
        else if (section === 'terrain') result.terrain = {cell: scene.ground.cell, materials: scene.ground.layers, features: scene.ground.features ?? [], fingerprint: groundFingerprint(scene.ground),
          note: 'Weights are encoded; view_town shows the painted ground. Change it with shape_ground (designed layouts) or paint operations (touch-ups).'};
        else if (section === 'prefabs') result.prefabs = current.document.prefabs ?? [];
        else result[section] = scene[section] ?? [];
      }
      return json(result);
    },
    async render_town({town: name, region, labels = true, draft}) {
      const {scene} = await town(name, draft);
      const png = await scenePreviewPNG(scene, {region, labels});
      const legend = scene.ground.layers.map(id => `${terrainMaterial(id)?.color ?? '?'} ${id}${terrainMaterial(id)?.blocked ? ' (blocks walkers)' : ''}`).join(', ');
      return {content: [{type: 'image', data: png.toString('base64'), mimeType: 'image/png'}, {type: 'text', text: `Ground colours: ${legend}.`}]};
    },
    async view_town({town: name, region, scale, period = 'day', draft}) {
      const {current} = await town(name, draft);
      const png = await townViewPNG(current.document, name, {region, scale, period});
      return {content: [{type: 'image', data: png.toString('base64'), mimeType: 'image/png'}]};
    },
    async audit_town({town: name, draft}) {
      const {scene, current} = await town(name, draft), problems = new Set();
      for (const item of [...auditScene(scene), ...sceneWarnings(scene)]) problems.add(`${item.severity ?? 'error'}: ${item.message}${item.objectIds?.length ? ` [${item.objectIds.join(', ')}]` : ''}`);
      try { await compileSceneDocument(structuredClone(current.document)); }
      catch (error) {
        if (!(error instanceof SceneCompileError)) throw error;
        for (const item of error.problems.filter(item => !item.map || item.map === name)) problems.add(`error: ${item.message}`);
      }
      return json({town: name, problems: [...problems]});
    },
    async shape_ground({town: name, draft, base, shapes, patches = [], features}) {
      const file = await readDraft(draft), scene = file.document.maps[name];
      if (!scene) throw new Error(`There is no town called ${name} in ${draft}.`);
      const ground = shapeGround(scene, {base, shapes, patches, cell: scene.ground.cell, features: features ?? scene.ground.features ?? []});
      const document = {...file.document, maps: {...file.document.maps, [name]: {...scene, ground}}};
      parseWorldSceneDocument(structuredClone(document));
      await saveDraft(file, document);
      return json({town: name, draft, materials: ground.layers, features: (ground.features ?? []).map(feature => feature.id), fingerprint: groundFingerprint(ground)});
    },
    async list_catalogue({town: name, asset}) {
      const {scene, current} = await town(name), widths = new Map();
      for (const placed of Object.values(current.document.maps).flatMap(other => other.scenery)) {
        const key = placed.frame ?? placed.asset;
        widths.set(key, [...(widths.get(key) ?? []), placed.width]);
      }
      const typical = key => { const list = (widths.get(key) ?? []).sort((a, b) => a - b); return list.length ? list[Math.floor(list.length / 2)] : undefined; };
      return json({objects: paletteChoices(scene.id).filter(choice => !asset || choice.asset === asset)
        .map(choice => ({...choice, typicalWidth: typical(choice.frame) ?? typical(choice.asset)})),
        materials: terrainMaterials.map(({id, name, group, blocked}) => ({id, name, group, blocksWalkers: blocked, usedHere: scene.ground.layers.includes(id)})),
        groundPieces: terrainFeatures.map(({id, name, category, worldWidth}) => ({asset: id, name, category, typicalWidth: worldWidth}))});
    },
    async apply_edits(args) { return applyOperations(args); },
    async list_edits({limit = 20, before = 0}) {
      return json((await client.edits({limit, before})).edits);
    },
    async pull_world({file, seed = false}) {
      const target = file ? resolve(root, file) : undefined;
      const bundle = await pullWorld(client, {file: target, seed});
      return json({revision: bundle.revision, towns: Object.keys(bundle.document.maps), file: target ?? '.world/world.json', seeded: seed});
    },
    async push_world({file, check = false}) {
      const result = await pushWorld(client, {file: file ? resolve(root, file) : undefined, check});
      cached = undefined;
      return json(check ? {valid: true, contentVersion: result.contentVersion, diagnostics: result.diagnostics} : {revision: result.revision, diagnostics: result.diagnostics});
    },
  };

  // Stdio callers may send simultaneous requests. Serialize draft mutations so the
  // fingerprint is checked against the latest completed write, never a stale read.
  const draftWrites=new Map();
  const mutators=new Set(['apply_edits','shape_ground','edit_building','copy_building_layout']);
  return {
    tools,
    async call(name, args = {}) {
      const handler = handlers[name];
      if (!handler) return {isError: true, content: [{type: 'text', text: `Unknown tool ${name}.`}]};
      try {
        if(args.draft && mutators.has(name)) {
          const key=resolve(root,args.draft),previous=draftWrites.get(key) ?? Promise.resolve();
          const pending=previous.catch(()=>{}).then(()=>handler(args));
          draftWrites.set(key,pending);
          try{return await pending;}finally{if(draftWrites.get(key)===pending)draftWrites.delete(key);}
        }
        return await handler(args);
      }
      catch (error) {
        const problems = error instanceof WorldAPIError ? error.problems.map(item => `- ${item.map ? `${item.map}: ` : ''}${item.message}${item.objectIds?.length ? ` [${item.objectIds.join(', ')}]` : ''}`) : [];
        return {isError: true, content: [{type: 'text', text: [String(error.message ?? error), ...problems].join('\n')}]};
      }
    },
  };
}

/** JSON-RPC over stdio, one message per line, as the MCP stdio transport specifies. */
export function serveMCP(world, input = process.stdin, output = process.stdout) {
  const send = message => output.write(`${JSON.stringify({jsonrpc: '2.0', ...message})}\n`);
  const lines = createInterface({input, crlfDelay: Infinity});
  lines.on('line', async line => {
    if (!line.trim()) return;
    let message;
    try { message = JSON.parse(line); } catch { send({id: null, error: {code: -32700, message: 'Parse error'}}); return; }
    const {id, method, params} = message;
    if (id === undefined) return; // notifications need no answer
    try {
      if (method === 'initialize') send({id, result: {protocolVersion: params?.protocolVersion ?? '2025-06-18', capabilities: {tools: {}},
        serverInfo: {name: 'glotworld-world', version: '1.1.0'},
        instructions: 'Edit the glotworld towns. Read with world_status and get_town; render_town is a labelled plan for finding things, view_town shows how a town looks in game. Work on a draft: pull_world to a file, change it with shape_ground and apply_edits (draft), check it with view_town and audit_town, then push_world. For interiors use list_buildings, list_room_catalogue and get_building, then edit_building or copy_building_layout with the returned fingerprints. Inspect with render_room/view_room and audit_building. Mutation tools without a draft publish straight to players.'}});
      else if (method === 'ping') send({id, result: {}});
      else if (method === 'tools/list') send({id, result: {tools: world.tools}});
      else if (method === 'tools/call') send({id, result: await world.call(params?.name, params?.arguments)});
      else send({id, error: {code: -32601, message: `Unknown method ${method}`}});
    } catch (error) { send({id, error: {code: -32603, message: String(error.message ?? error)}}); }
  });
  return lines;
}

// The game view keeps a dev server and a browser running; close them when the client goes away.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  serveMCP(createWorldTools()).on('close', () => closeWorldView().finally(() => process.exit(0)));
