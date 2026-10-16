import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, writeFile, mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {compileSceneDocument, saveSceneDocument, sceneContentVersion} from './scene-compiler.mjs';

const source = JSON.parse(await readFile(new URL('../web/src/data/world-scenes.json', import.meta.url), 'utf8'));

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

test('invalid saves leave every published file untouched and successful saves preserve IDs', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'lantern-scenes-'));
  const options = {sourcePath: join(directory, 'source.json'), registryPath: join(directory, 'registry.json'), storyRulesPath: join(directory, 'rules.json'), versionPath: join(directory, 'version.json')};
  try {
    await writeFile(options.sourcePath, JSON.stringify(source));
    await writeFile(options.registryPath, 'published registry');
    await writeFile(options.storyRulesPath, 'published rules');
    await writeFile(options.versionPath, 'published version');
    const invalid = structuredClone(source); invalid.maps.lindenhafen.npcs[0].x = -4;
    await assert.rejects(saveSceneDocument(invalid, options), /outside scene bounds/);
    assert.equal(await readFile(options.sourcePath, 'utf8'), JSON.stringify(source));
    assert.equal(await readFile(options.registryPath, 'utf8'), 'published registry');
    assert.equal(await readFile(options.storyRulesPath, 'utf8'), 'published rules');
    assert.equal(await readFile(options.versionPath, 'utf8'), 'published version');
    const result = await saveSceneDocument(source, options);
    assert.deepEqual(JSON.parse(await readFile(options.sourcePath, 'utf8')), source);
    assert.equal(JSON.parse(await readFile(options.registryPath, 'utf8')).contentVersion, result.contentVersion);
    assert.deepEqual(JSON.parse(await readFile(options.versionPath, 'utf8')), {contentVersion: result.contentVersion});
  } finally { await rm(directory, {recursive: true, force: true}); }
});

test('lets only buildings with a painted door host a room',async()=>{
  const tent=structuredClone(source),scene=tent.maps.lindenhafen;
  scene.scenery.find(item=>item.asset==='stall').interior={kind:'bakery'};
  await assert.rejects(compileSceneDocument(tent),/cannot host a room because its artwork has no door/);
});

test('rejects legacy street whitelists and loose obstacles in clear-land scenes',async()=>{
  for(const field of ['walkable','obstacles']) {
    const value=structuredClone(source),scene=value.maps.lindenhafen;
    scene[field].push([[20,20],[40,20],[40,40],[20,40]]);
    await assert.rejects(compileSceneDocument(value),/clear-land scenes must use terrain collision and object-owned footprints/);
  }
});

test('rejects malformed terrain hazards and object-owned collision before compiling',async()=>{
  const terrain=structuredClone(source);
  terrain.maps.waldruh.navigation.terrainCollision[0].kind='grass';
  await assert.rejects(compileSceneDocument(terrain),/invalid collision kind/);
  const collision=structuredClone(source);
  collision.maps.waldruh.scenery[0].collision.referenceWidth=0;
  await assert.rejects(compileSceneDocument(collision),/collision reference width must be positive/);
  const polygon=structuredClone(source);
  polygon.maps.waldruh.objects[0].collision={referenceWidth:1,polygons:[[[0,0],[1,0]]]};
  await assert.rejects(compileSceneDocument(polygon),/collision 0 needs 3–256 vertices/);
});
