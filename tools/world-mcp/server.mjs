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
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {worldClient, WorldAPIError} from '../../scripts/world-client.mjs';
import {pullWorld, pushWorld} from '../../scripts/world-sync.mjs';
import {scenePreviewPNG} from '../../scripts/world-preview.mjs';
import '../../scripts/register-content-loader.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const {parseWorldSceneDocument} = await import('../../web/src/scene-schema.ts');
const {paletteChoices} = await import('../../web/src/world-edit-catalogue.ts');
const {terrainMaterials} = await import('../../web/src/terrain-materials.ts');
const {terrainFeatures} = await import('../../web/src/terrain-features.ts');
const {groundFingerprint} = await import('../../web/src/ground.ts');

const editGuide = `Each operation names its town in "map". Coordinates are world units: x grows east, y grows south; a
scenery or anchor position is the foot point where it meets the ground. Kinds:
- {kind:"move", map, id, x, y}: move scenery.
- {kind:"moveAnchor", map, anchor:"npc"|"object", id, x, y}: move a story character or piece of evidence.
- {kind:"place", map, item:{id, asset, frame?, x, y, width, flipX?}, activities?}: add scenery. Choose asset and frame
  from list_catalogue; width is the drawn width in world units (see its typicalWidth). ids are lowercase-with-dashes and unique
  in the town. activities are spots residents use: {id, ownerId: item.id, kind: seat|work|pickup|service|shelter|wait, offsetX, offsetY, capacity?}.
- {kind:"update", map, id, frame?, width?, flipX?, collidable?, interior?: {kind: cafe|bakery|supermarket|inn} | null}.
- {kind:"remove", map, id}: refused while a resident's schedule uses the object's activity spots.
- {kind:"residents", map, residents:[...]}: replace a town's residents and their daily schedules (see get_town).
- {kind:"paint", map, material, radius, strength, points:[[x,y],...]}: one brush stroke of ground. The soft round
  brush adds strength (0–1) of the material along the points (up to 400); radius is in world units (up to 512). Repeat
  a stroke to cover fully. A town uses at most six materials; blocked materials (water, cliff) stop walkers where they
  dominate. Materials come from list_catalogue.
- {kind:"ground", map, ground, expected}: replace a town's whole ground, for example to move bridges and inlays in
  ground.features. expected is the fingerprint of the ground being replaced, from get_town's terrain section.
Up to 50 operations apply together or not at all. Edits that break play are refused with problems that name the
objects; softer issues (overlaps, blocked routes) publish with warnings. Render the town afterwards to check.`;

const tools = [
  {name: 'world_status', description: 'List the towns with their size and contents, the world revision and who is editing what. Start here.',
    inputSchema: {type: 'object', properties: {}}},
  {name: 'get_town', description: 'Read one town as JSON. Choose sections to keep the answer small; region limits scenery, characters and evidence to an area.',
    inputSchema: {type: 'object', required: ['town'], properties: {
      town: {type: 'string'},
      sections: {type: 'array', items: {type: 'string', enum: ['scenery', 'npcs', 'objects', 'activities', 'residents', 'districts', 'terrain', 'spawn', 'prefabs']}, description: 'Default: scenery, npcs, objects, districts, spawn. terrain gives the ground materials, features and fingerprint.'},
      region: regionSchema()}}},
  {name: 'render_town', description: 'Draw a town as a labelled plan: ground, water and other blocked terrain, object footprints (brown), scenery ids, story characters (red), evidence (orange squares), residents\' homes (purple) and the spawn (green), over a grid in world units.',
    inputSchema: {type: 'object', required: ['town'], properties: {town: {type: 'string'}, region: regionSchema(), labels: {type: 'boolean', default: true}}}},
  {name: 'list_catalogue', description: 'Objects that can be placed in a town (asset, frame, label, rooms a building can host, typical drawn width in world units), the ground materials it can be painted with, and the bridge and inlay pieces for its ground.',
    inputSchema: {type: 'object', required: ['town'], properties: {town: {type: 'string'}, asset: {type: 'string', description: 'Only this kind, such as house, tree or bench.'}}}},
  {name: 'apply_edits', description: `Validate and publish edit operations to the live world.\n${editGuide}`,
    inputSchema: {type: 'object', required: ['ops'], properties: {ops: {type: 'array', minItems: 1, maxItems: 50, items: {type: 'object'}}}}},
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
  async function town(name) {
    const current = await world(), scene = current.document.maps[name];
    if (!scene) throw new Error(`There is no town called ${name}. Towns: ${Object.keys(current.document.maps).join(', ')}.`);
    return {scene, current};
  }
  const inside = region => item => !region || (item.x >= region.x && item.x <= region.x + region.width && item.y >= region.y && item.y <= region.y + region.height);
  const json = value => ({content: [{type: 'text', text: JSON.stringify(value, null, 1)}]});

  const handlers = {
    async world_status() {
      const current = await world(), status = await client.status();
      return json({revision: current.revision, contentVersion: current.contentVersion, server: client.origin, locks: status.locks,
        towns: Object.values(current.document.maps).map(scene => ({id: scene.id, width: scene.width, height: scene.height, scenery: scene.scenery.length,
          npcs: scene.npcs.map(npc => npc.id), evidence: scene.objects.length, residents: (scene.residents ?? []).length,
          districts: (scene.districts ?? []).map(district => district.label), ground: scene.ground.layers}))});
    },
    async get_town({town: name, sections = ['scenery', 'npcs', 'objects', 'districts', 'spawn'], region}) {
      const {scene, current} = await town(name), keep = inside(region), result = {id: scene.id, width: scene.width, height: scene.height, revision: current.revision};
      for (const section of sections) {
        if (section === 'scenery') result.scenery = scene.scenery.filter(keep).map(({collision, sortLine, ...item}) => item);
        else if (section === 'npcs' || section === 'objects') result[section] = scene[section].filter(keep).map(({collision, ...item}) => item);
        else if (section === 'terrain') result.terrain = {cell: scene.ground.cell, materials: scene.ground.layers, features: scene.ground.features ?? [], fingerprint: groundFingerprint(scene.ground),
          note: 'Weights are encoded; render_town shows the painted ground. Change it with paint operations.'};
        else if (section === 'prefabs') result.prefabs = current.document.prefabs ?? [];
        else result[section] = scene[section] ?? [];
      }
      return json(result);
    },
    async render_town({town: name, region, labels = true}) {
      const {scene} = await town(name);
      const png = await scenePreviewPNG(scene, {region, labels});
      return {content: [{type: 'image', data: png.toString('base64'), mimeType: 'image/png'}]};
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
    async apply_edits({ops}) {
      const result = await client.applyOps(ops);
      cached = undefined;
      return json({revision: result.revision, applied: result.applied.length, warnings: result.warnings.map(item => `${item.map}: ${item.message}`)});
    },
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

  return {
    tools,
    async call(name, args = {}) {
      const handler = handlers[name];
      if (!handler) return {isError: true, content: [{type: 'text', text: `Unknown tool ${name}.`}]};
      try { return await handler(args); }
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
        serverInfo: {name: 'glotworld-world', version: '1.0.0'},
        instructions: 'Edit the glotworld towns. Read with world_status, get_town and render_town; change with apply_edits; check the result with render_town.'}});
      else if (method === 'ping') send({id, result: {}});
      else if (method === 'tools/list') send({id, result: {tools: world.tools}});
      else if (method === 'tools/call') send({id, result: await world.call(params?.name, params?.arguments)});
      else send({id, error: {code: -32601, message: `Unknown method ${method}`}});
    } catch (error) { send({id, error: {code: -32603, message: String(error.message ?? error)}}); }
  });
  return lines;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) serveMCP(createWorldTools());
