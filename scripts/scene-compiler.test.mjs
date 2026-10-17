import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {compileRegistry, compileSceneDocument, sceneContentVersion} from './scene-compiler.mjs';

const source = JSON.parse(await readFile(new URL('../content/world-seed.json', import.meta.url), 'utf8'));

test('compiles all regions and aligns server spawns and story evidence with draft anchors', async () => {
  const value = structuredClone(source), scene = value.maps.lindenhafen;
  scene.objects[0].x += 3;
  const compiled = await compileSceneDocument(value);
  assert.equal(Object.keys(compiled.registry.maps).length, 3);
  assert.deepEqual(compiled.registry.maps.lindenhafen.spawn, {x: scene.spawn.x / scene.width, y: scene.spawn.y / scene.height});
  for (const rule of compiled.storyRules.rules) {
    if (rule.interiorId) {
      const authored = JSON.parse(await readFile(new URL('../server/story_rules.json', import.meta.url), 'utf8'));
      assert.deepEqual(rule, authored.rules.find(item => item.questId === rule.questId));
      continue;
    }
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


test('compiles a custom room arrival point without changing its outdoor return', async () => {
  const {getInterior} = await import('../web/src/interiors.ts');
  const {createRoomLayout} = await import('../web/src/room-layout-runtime.ts');
  const value=structuredClone(source), scene=value.maps.lindenhafen;
  const owner=scene.scenery.find(item=>item.id==='high-street-house');
  const before=compileRegistry(value).maps.lindenhafen.entrances['home--high-street-house'];
  owner.roomLayout=createRoomLayout(getInterior('home'));
  owner.roomLayout.floors=[{id:'expanded-floor',points:[[120,260],[1420,260],[1420,920],[120,920]]}];
  owner.roomLayout.spawn={x:672,y:784};owner.roomLayout.exit={x:1200,y:816};
  const entrance=compileRegistry(value).maps.lindenhafen.entrances['home--high-street-house'];
  assert.deepEqual(entrance.spawn,{x:672/1536,y:784/1024});
  assert.deepEqual(entrance.return,before.return);
  owner.roomLayout.exit={x:20,y:20};
  assert.throws(()=>compileRegistry(value),/exit on clear floor/);
});

test('compiles paired room doors with separate identities and exact arrivals', async()=>{
  const {getInterior}=await import('../web/src/interiors.ts');
  const {createRoomLayout,additionalRoomTemplate}=await import('../web/src/room-layout-runtime.ts');
  const value=structuredClone(source),owner=value.maps.lindenhafen.scenery.find(item=>item.id==='high-street-house');
  const main=createRoomLayout(getInterior('home')),study=createRoomLayout(additionalRoomTemplate(getInterior('home')));
  main.links=[{id:'study-door',x:600,y:750,targetRoom:'study',targetDoor:'hall-door'}];
  study.links=[{id:'hall-door',x:500,y:750,targetRoom:'main',targetDoor:'study-door'}];
  main.rooms=[{id:'study',name:'Study',layout:study}];owner.roomLayout=main;
  const entries=compileRegistry(value).maps.lindenhafen.entrances,root='home--high-street-house',child=`${root}::study`;
  assert.equal(entries[child].building,root);
  assert.deepEqual(entries[root].doors['study-door'],{target:child,arrival:{x:500/1536,y:750/1024}});
  assert.deepEqual(entries[child].doors['hall-door'],{target:root,arrival:{x:600/1536,y:750/1024}});
  assert.deepEqual(entries[child].return,entries[root].return);
  study.links[0].x=0;
  assert.throws(()=>compileRegistry(value),/Room doors must be on clear floor/);
});

test('compiles upstairs and basement stairs with exact return landings and floor metadata',async()=>{
  const {getInterior}=await import('../web/src/interiors.ts');
  const {createRoomLayout,additionalRoomTemplate}=await import('../web/src/room-layout-runtime.ts');
  const value=structuredClone(source),owner=value.maps.lindenhafen.scenery.find(item=>item.id==='high-street-house');
  const main=createRoomLayout(getInterior('home'));main.links=[];main.rooms=[];
  for(const [id,level,x] of [['up',1,500],['down',-1,1000]]){
    const child=createRoomLayout(additionalRoomTemplate(getInterior('home')));child.level=level;
    child.links=[{id:'landing',kind:'stairs',x,y:750,targetRoom:'main',targetDoor:id}];
    main.links.push({id,kind:'stairs',x:700,y:750,targetRoom:id,targetDoor:'landing'});
    main.rooms.push({id,name:id,layout:child});
  }
  owner.roomLayout=main;
  const entries=compileRegistry(value).maps.lindenhafen.entrances,root='home--high-street-house';
  assert.equal(entries[`${root}::up`].level,1);assert.equal(entries[`${root}::down`].level,-1);
  assert.deepEqual(entries[root].doors.up,{kind:'stairs',target:`${root}::up`,arrival:{x:500/1536,y:750/1024}});
  assert.deepEqual(entries[`${root}::down`].doors.landing,{kind:'stairs',target:root,arrival:{x:700/1536,y:750/1024}});
  delete main.links[0].kind;delete main.rooms[0].layout.links[0].kind;
  assert.throws(()=>compileRegistry(value),/use stairs between different floors/);
});

// Both train destinations share the station but never inherit its editable floors.
test('keeps train backdrops independent of the station building layout',async()=>{
  const {getInterior}=await import('../web/src/interiors.ts');
  const {createRoomLayout}=await import('../web/src/room-layout-runtime.ts');
  const value=structuredClone(source),station=value.maps.lindenhafen.scenery.find(item=>item.id==='station');
  station.roomLayout=createRoomLayout(getInterior('station'));
  const entries=compileRegistry(value).maps.lindenhafen.entrances;
  for(const id of ['train-compartment','train-dining']) {
    assert.equal(entries[id].ownerId,'station');
    assert.equal(entries[id].spawn,undefined);
    assert.equal(entries[id].doors,undefined);
  }
  assert.ok(entries['station--station'].spawn);
});
