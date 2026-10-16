import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {compileSceneDocument, sceneContentVersion} from './scene-compiler.mjs';

const source = JSON.parse(await readFile(new URL('../content/world-seed.json', import.meta.url), 'utf8'));

test('compiles all regions and aligns server spawns and story evidence with draft anchors', async () => {
  const value = structuredClone(source), scene = value.maps.lindenhafen;
  scene.objects[0].x += 3;
  const compiled = await compileSceneDocument(value);
  assert.equal(Object.keys(compiled.registry.maps).length, 3);
  assert.deepEqual(compiled.registry.maps.lindenhafen.spawn, {x: scene.spawn.x / scene.width, y: scene.spawn.y / scene.height});
  for (const rule of compiled.storyRules.rules) {
    const map = value.maps[rule.mapId];
    for (const target of [rule.npc, ...rule.objects]) {
      const anchor = [...map.npcs, ...map.objects].find(item => item.id === target.id);
      assert.equal(target.x, anchor.x / map.width);
      assert.equal(target.y, anchor.y / map.height);
    }
  }
  const reordered = Object.fromEntries(Object.entries(value).reverse());
  assert.equal(sceneContentVersion(reordered), compiled.contentVersion);
});

test('lets only buildings with a painted door host a room',async()=>{
  const tent=structuredClone(source),scene=tent.maps.lindenhafen;
  scene.scenery.find(item=>item.asset==='stall').interior={kind:'bakery'};
  await assert.rejects(compileSceneDocument(tent),/cannot host a room because its artwork has no door/);
});

test('rejects ground without a weight grid per material',async()=>{
  const value=structuredClone(source);
  value.maps.lindenhafen.ground.weights.pop();
  await assert.rejects(compileSceneDocument(value),/one weight grid per layer/);
});

test('rejects malformed ground materials and object-owned collision before compiling',async()=>{
  const terrain=structuredClone(source);
  terrain.maps.waldruh.ground.layers[1]='grass';
  await assert.rejects(compileSceneDocument(terrain),/known materials/);
  const collision=structuredClone(source);
  collision.maps.waldruh.scenery[0].collision={referenceWidth:0,polygons:[[[0,0],[1,0],[1,1]]]};
  await assert.rejects(compileSceneDocument(collision),/collision reference width must be positive/);
  const polygon=structuredClone(source);
  polygon.maps.waldruh.objects[0].collision={referenceWidth:1,polygons:[[[0,0],[1,0]]]};
  await assert.rejects(compileSceneDocument(polygon),/collision 0 needs 3–256 vertices/);
});
