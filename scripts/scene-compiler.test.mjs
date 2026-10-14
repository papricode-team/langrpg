import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, writeFile, mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {compileSceneDocument, saveSceneDocument, sceneContentVersion} from './scene-compiler.mjs';
const {sceneEntrancePoint}=await import('../web/src/scene-schema.ts');
const {NavigationGrid}=await import('../web/src/navigation.ts');
const {sceneNavigationGeometry}=await import('../web/src/scene-navigation.ts');

const source = JSON.parse(await readFile(new URL('../web/src/data/world-scenes.json', import.meta.url), 'utf8'));

// Draft barriers belong to a registered object. Express their world vertices
// in that owner's local coordinates so these tests exercise the save contract.
const attachCollision = (scene, polygons) => {
  const owner = scene.objects[0];
  owner.collision = {referenceWidth: 1, polygons: polygons.map(polygon =>
    polygon.map(([x, y]) => [x - owner.x, y - owner.y]))};
};

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

test('rejects missing content, unknown artwork and collision introduced by a draft prop', async () => {
  const missing = structuredClone(source); missing.maps.waldruh.objects.pop();
  await assert.rejects(compileSceneDocument(missing), /missing required objects/);
  const artwork = structuredClone(source); artwork.maps.waldruh.scenery[0].frame = 'missing-artwork';
  await assert.rejects(compileSceneDocument(artwork), /no registered frame/);
  const blocked = structuredClone(source), scene = blocked.maps.lindenhafen;
  scene.scenery.push({id: 'blocked-spawn', asset: 'house', x: scene.spawn.x, y: scene.spawn.y + 18, width: 200});
  await assert.rejects(compileSceneDocument(blocked), /spawn is outside walkable ground/);
});

test('rejects a draft spawn that is clear for feet but too close to a solid for the player body', async () => {
  const value = structuredClone(source), scene = value.maps.lindenhafen;
  const {x, y} = scene.spawn;
  // A two-unit object base leaves the authored centre clear while entering the
  // player's ten-unit footprint. Point-only authoring validation accepted it.
  attachCollision(scene, [[[x+8,y-2],[x+10,y-2],[x+10,y+2],[x+8,y+2]]]);
  const geometry=sceneNavigationGeometry(scene);
  assert.equal(new NavigationGrid(geometry.ground, geometry.barriers, scene).isWalkable(x, y), true);
  await assert.rejects(compileSceneDocument(value), error => {
    assert.match(error.message, /lindenhafen: spawn needs 10 units of player clearance/);
    assert.doesNotMatch(error.message, /lindenhafen: spawn is outside walkable ground/);
    return true;
  });
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

test('resizing a saved scene requires a coordinate version migration', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'lantern-scene-version-'));
  const options = {sourcePath: join(directory, 'source.json'), registryPath: join(directory, 'registry.json'), storyRulesPath: join(directory, 'rules.json'), versionPath: join(directory, 'version.json')};
  try {
    await writeFile(options.sourcePath, JSON.stringify(source));
    const resized = structuredClone(source); resized.maps.lindenhafen.width += 14;
    await assert.rejects(saveSceneDocument(resized, options), /higher coordinateVersion/);
    assert.equal(await readFile(options.sourcePath, 'utf8'), JSON.stringify(source));
  } finally { await rm(directory, {recursive: true, force: true}); }
});

test('rejects high-resolution crop bounds and misleading pixel-density declarations', async () => {
  const clipped = structuredClone(source);
  clipped.maps.lindenhafen.terrain[0].dayCrop.x = 8;
  await assert.rejects(compileSceneDocument(clipped), /crop exceeds/);
  const stretched = structuredClone(source), tile = stretched.maps.lindenhafen.terrain[0];
  delete tile.dayCrop;
  await assert.rejects(compileSceneDocument(stretched), /artwork does not match/);
});

test('compiles attached doors from draft owner positions and rejects obstructed approaches and returns',async()=>{
  const value=structuredClone(source),scene=value.maps.lindenhafen,door=scene.entrances.find(value=>value.interiorId==='cafe');
  const owner=scene.scenery.find(value=>value.id===door.ownerId);owner.x+=2;
  const compiled=await compileSceneDocument(value),point=sceneEntrancePoint(scene,door);
  assert.deepEqual(compiled.registry.maps.lindenhafen.entrances.cafe.approach,{x:point.x/scene.width,y:point.y/scene.height});
  const blocked=structuredClone(value);
  attachCollision(blocked.maps.lindenhafen, [[[point.x-4,point.y-4],[point.x+4,point.y-4],[point.x+4,point.y+4],[point.x-4,point.y+4]]]);
  await assert.rejects(compileSceneDocument(blocked),/cafe-entrance approach is not on reachable/);
  door.returnOffset={x:1-owner.x,y:1-owner.y};
  await assert.rejects(compileSceneDocument(value),/cafe-entrance return is not on reachable/);
  delete scene.entrances;
  await assert.rejects(compileSceneDocument(value),/missing required cafe entrance/);
});

test('rejects activity feet, approaches and exits that would require path projection', async () => {
  for (const field of ['feet', 'approach', 'exit']) {
    const value = structuredClone(source), scene = value.maps.lindenhafen;
    const owner = scene.scenery.find(item => item.id === 'parcel-reading-bench');
    const blocked = {x: 1600 - owner.x, y: 760 - owner.y}; // Canal water.
    const slot = scene.activities.find(item => item.ownerId === owner.id);
    if (field === 'feet') { slot.offsetX = blocked.x; slot.offsetY = blocked.y; }
    else slot[field] = blocked;
    await assert.rejects(compileSceneDocument(value), new RegExp(`activity ${slot.id} ${field} is not on reachable`));
  }
});

test('rejects removed water hazards when their terrain masks have not been regenerated',async()=>{
  for(const scene of Object.values(source.maps))for(const tile of scene.terrain){
    assert.ok(tile.walkableMaskAsset,`${scene.id}/${tile.id} needs its traced ground mask`);
  }
  const water=structuredClone(source);
  const scene=water.maps.lindenhafen;
  const waterHazard=scene.navigation.terrainCollision.find(hazard=>hazard.kind==='water');
  assert.ok(waterHazard, 'the water audit needs an authored water blocker');
  scene.navigation.terrainCollision=scene.navigation.terrainCollision.filter(hazard=>hazard!==waterHazard);
  await assert.rejects(compileSceneDocument(water),/navigation crosses .* outside its painted walkable mask/);
  const missing=structuredClone(source);
  delete missing.maps.lindenhafen.terrain[0].walkableMaskAsset;
  await assert.rejects(compileSceneDocument(missing),/needs an authored ground mask/);
});

test('validates reusable catalog artwork even before a group is placed',async()=>{
  const value=structuredClone(source);value.prefabs[0].scenery[0].frame='unregistered-prefab-art';
  await assert.rejects(compileSceneDocument(value),/prefab cafe-terrace: child bench-west has no registered artwork/);
});

test('enforces person scale and native scenery density',async()=>{
  const scale=structuredClone(source),house=scale.maps.lindenhafen.scenery.find(item=>item.id==='north-library-house');
  house.width*=2;
  await assert.rejects(compileSceneDocument(scale),/height .* persons is outside/);
  const blurry=structuredClone(source),boat=blurry.maps.lindenhafen.scenery.find(item=>item.asset==='boat');
  boat.width*=2;
  await assert.rejects(compileSceneDocument(blurry),/boat source density .* below 3.5 \/ 2.5/);
});

test('rejects crowded painted buildings even when optional quality checks and collision are disabled',async()=>{
  const value=structuredClone(source),scene=value.maps.lindenhafen;
  const owner=scene.scenery.find(item=>item.id==='workshop');
  scene.scenery.push({...structuredClone(owner),id:'crowded-workshop',x:owner.x+owner.width+31,collidable:false});
  await assert.rejects(compileSceneDocument(value,{strictQuality:false}),/buildings workshop and crowded-workshop need at least 32 units between their painted bounds/);
});

test('requires distinct real doors and rejects offsets detached from painted openings',async()=>{
  const detached=structuredClone(source),scene=detached.maps.lindenhafen;
  scene.entrances[0].offsetX+=180;
  await assert.rejects(compileSceneDocument(detached),/lies outside its painted door rectangle/);
  const tent=structuredClone(source),door=tent.maps.lindenhafen.entrances[0];
  door.ownerId=tent.maps.lindenhafen.scenery.find(item=>item.asset==='stall').id;
  await assert.rejects(compileSceneDocument(tent),/owner has no painted door/);
});

test('rejects empty chunks and a required interaction isolated by owned collision',async()=>{
  const sparse=structuredClone(source),scene=sparse.maps.nebelstadt;
  scene.scenery=scene.scenery.filter(item=>item.x<1536||item.y<512||!['tree','cypress','lamp','planter','sign','stall'].includes(item.asset));
  await assert.rejects(compileSceneDocument(sparse),/harbour-supply needs at least 18 composed objects/);
  const island=structuredClone(source);
  const town=island.maps.lindenhafen,target=town.npcs.find(npc=>npc.id==='otto'),{x,y}=target;
  // The wall ring leaves the actor's feet on clear ground but separates their
  // approach from the spawn. Empty isolated land alone is allowed in this model.
  attachCollision(town, [
    [[x-150,y-150],[x+150,y-150],[x+150,y-130],[x-150,y-130]],
    [[x-150,y+130],[x+150,y+130],[x+150,y+150],[x-150,y+150]],
    [[x-150,y-150],[x-130,y-150],[x-130,y+150],[x-150,y+150]],
    [[x+130,y-150],[x+150,y-150],[x+150,y+150],[x+130,y+150]],
  ]);
  await assert.rejects(compileSceneDocument(island),/otto has no reachable approach with 10 units of player clearance/);
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

test('requires the latest-main high-resolution format for expansion terrain',async()=>{
  for(const missing of ['pixelDensity','nightAsset','dayCrop','nightCrop','dayPreviewAsset','nightPreviewAsset']){
    const value=structuredClone(source),tile=value.maps.lindenhafen.terrain.find(tile=>tile.x===1536);
    delete tile[missing];
    await assert.rejects(compileSceneDocument(value),/expansion terrain requires/);
  }
  const unguarded=structuredClone(source),tile=unguarded.maps.lindenhafen.terrain.find(tile=>tile.x===1536);
  tile.dayCrop.x=0;
  await assert.rejects(compileSceneDocument(unguarded),/sampling guards on every edge/);
  const lowResolution=structuredClone(source),low=lowResolution.maps.lindenhafen.terrain.find(tile=>tile.x===1536);
  low.dayAsset='/assets/lindenhafen-terrain.webp';delete low.nightAsset;delete low.pixelDensity;delete low.dayCrop;delete low.nightCrop;
  await assert.rejects(compileSceneDocument(lowResolution),/expansion terrain requires/);
});

test('rejects resident schedules whose home, capacity or travel window cannot work in the draft',async()=>{
  const blocked=structuredClone(source);
  blocked.maps.lindenhafen.residents[0].home={x:1600,y:760}; // Canal water.
  await assert.rejects(compileSceneDocument(blocked),/home must be on spawn-connected ground/);
  const rushed=structuredClone(source),task=rushed.maps.lindenhafen.residents[0].schedule[0];
  task.endHour=task.startHour+.1;
  await assert.rejects(compileSceneDocument(rushed),/time window is too short/);
  const crowded=structuredClone(source),scene=crowded.maps.lindenhafen;
  const slot=scene.activities.find(slot=>slot.id===scene.residents[0].schedule[0].activityId);
  slot.capacity=2;
  await assert.rejects(compileSceneDocument(crowded),/needs explicit places for its capacity/);
});
