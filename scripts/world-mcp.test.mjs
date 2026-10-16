import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PassThrough} from 'node:stream';
import {WorldAPIError} from './world-client.mjs';
import {createWorldTools, serveMCP} from '../tools/world-mcp/server.mjs';

const seed = JSON.parse(await readFile(new URL('../content/world-seed.json', import.meta.url), 'utf8'));

function fakeClient() {
  const calls = [];
  return {calls, origin: 'http://test', status: async () => ({revision: '7', locks: []}),
    export: async () => { calls.push('export'); return {format: 'glotworld-world/1', revision: '7', contentVersion: 'v', document: structuredClone(seed), story: {}}; },
    applyOps: async ops => {
      calls.push(['ops', ops]);
      if (ops[0].kind === 'remove') throw new WorldAPIError('Ella uses the depot in her day.', 422, [{map: 'lindenhafen', message: 'Ella uses the depot in her day.', objectIds: ['promenade-depot']}]);
      return {revision: '8', applied: ops, warnings: [{map: 'lindenhafen', message: 'It overlaps the fountain.'}]};
    },
    edits: async () => ({edits: []})};
}

test('the world tools read towns once per revision and report edit problems', async () => {
  const client = fakeClient(), world = createWorldTools(client);
  const status = JSON.parse((await world.call('world_status')).content[0].text);
  assert.deepEqual(status.towns.map(town => town.id).sort(), ['lindenhafen', 'nebelstadt', 'waldruh']);
  const town = JSON.parse((await world.call('get_town', {town: 'lindenhafen', sections: ['npcs'], region: {x: 0, y: 0, width: 2304, height: 1536}})).content[0].text);
  assert.ok(town.npcs.some(npc => npc.id === 'otto'));
  assert.equal(client.calls.filter(call => call === 'export').length, 1, 'an unchanged revision is not downloaded again');
  const image = await world.call('render_town', {town: 'waldruh'});
  assert.equal(image.content[0].type, 'image');
  assert.ok(Buffer.from(image.content[0].data, 'base64').subarray(1, 4).equals(Buffer.from('PNG')));
  const catalogue = JSON.parse((await world.call('list_catalogue', {town: 'lindenhafen', asset: 'bench'})).content[0].text);
  assert.ok(catalogue.objects.length && catalogue.objects.every(choice => choice.asset === 'bench' && choice.typicalWidth > 0));
  assert.ok(catalogue.materials.some(material => material.id === 'deep-water' && material.blocksWalkers));
  const ground = JSON.parse((await world.call('get_town', {town: 'waldruh', sections: ['terrain']})).content[0].text);
  assert.ok(ground.terrain.materials.includes('cliff') && ground.terrain.fingerprint);
  const applied = JSON.parse((await world.call('apply_edits', {ops: [{kind: 'move', map: 'lindenhafen', id: 'archive', x: 300, y: 430}]})).content[0].text);
  assert.deepEqual(applied, {revision: '8', applied: 1, warnings: ['lindenhafen: It overlaps the fountain.']});
  const refused = await world.call('apply_edits', {ops: [{kind: 'remove', map: 'lindenhafen', id: 'promenade-depot'}]});
  assert.equal(refused.isError, true);
  assert.match(refused.content[0].text, /lindenhafen: Ella uses the depot in her day\. \[promenade-depot\]/);
  assert.match((await world.call('get_town', {town: 'atlantis'})).content[0].text, /no town called atlantis/);
});

test('the server answers MCP initialize, tools/list and tools/call over stdio', async () => {
  const input = new PassThrough(), output = new PassThrough(), lines = [];
  output.on('data', chunk => lines.push(...chunk.toString().trim().split('\n')));
  serveMCP(createWorldTools(fakeClient()), input, output);
  input.write(`${JSON.stringify({jsonrpc: '2.0', id: 1, method: 'initialize', params: {protocolVersion: '2025-06-18'}})}\n`);
  input.write(`${JSON.stringify({jsonrpc: '2.0', method: 'notifications/initialized'})}\n`);
  input.write(`${JSON.stringify({jsonrpc: '2.0', id: 2, method: 'tools/list'})}\n`);
  input.write(`${JSON.stringify({jsonrpc: '2.0', id: 3, method: 'tools/call', params: {name: 'world_status', arguments: {}}})}\n`);
  for (let i = 0; i < 100 && lines.length < 3; i++) await new Promise(done => setTimeout(done, 20));
  const replies = lines.map(line => JSON.parse(line)).sort((a, b) => a.id - b.id);
  assert.equal(replies[0].result.serverInfo.name, 'glotworld-world');
  assert.ok(replies[1].result.tools.some(tool => tool.name === 'apply_edits'));
  assert.match(replies[2].result.content[0].text, /lindenhafen/);
  input.end();
});

test('drafts take edits, ground shapes and audits without touching the live world', async () => {
  const {mkdtemp, writeFile: write, readFile: read, rm} = await import('node:fs/promises');
  const {tmpdir} = await import('node:os');
  const {join} = await import('node:path');
  const folder = await mkdtemp(join(tmpdir(), 'world-draft-')), draft = join(folder, 'draft.json');
  await write(draft, JSON.stringify({format: 'glotworld-world/1', revision: '7', document: seed, story: {}}));
  const client = fakeClient(), world = createWorldTools(client);
  try {
    const moved = JSON.parse((await world.call('apply_edits', {draft, ops: [{kind: 'move', map: 'lindenhafen', id: 'archive', x: 310, y: 560}]})).content[0].text);
    assert.equal(moved.applied, 1);
    assert.equal(client.calls.some(call => Array.isArray(call) && call[0] === 'ops'), false, 'a draft edit never reaches the server');
    const saved = JSON.parse(await read(draft, 'utf8'));
    assert.equal(saved.revision, '7');
    assert.deepEqual([saved.document.maps.lindenhafen.scenery.find(item => item.id === 'archive').x, saved.format], [310, 'glotworld-world/1']);
    const refused = await world.call('apply_edits', {draft, ops: [{kind: 'remove', map: 'lindenhafen', id: 'promenade-depot'}]});
    assert.equal(refused.isError, true, 'the server\'s refusals apply to drafts too');
    const shaped = JSON.parse((await world.call('shape_ground', {town: 'waldruh', draft, base: 'meadow', patches: [{material: 'moss', amount: 0.4}],
      shapes: [{material: 'cobble', line: [[0, 500], [2304, 500]], width: 80}, {material: 'deep-water', rect: [100, 100, 300, 260], radius: 30}]})).content[0].text);
    assert.deepEqual(shaped.materials, ['meadow', 'moss', 'cobble', 'deep-water']);
    const town = JSON.parse((await world.call('get_town', {town: 'waldruh', draft, sections: ['terrain']})).content[0].text);
    assert.equal(town.terrain.fingerprint, shaped.fingerprint);
    const audit = JSON.parse((await world.call('audit_town', {town: 'waldruh', draft})).content[0].text);
    assert.ok(Array.isArray(audit.problems));
    const plan = await world.call('render_town', {town: 'waldruh', draft});
    assert.match(plan.content[1].text, /deep-water \(blocks walkers\)/);
  } finally { await rm(folder, {recursive: true, force: true}); }
});
