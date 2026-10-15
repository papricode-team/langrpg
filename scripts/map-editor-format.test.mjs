import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {toTiled,fromTiled} from './map-editor-format.mjs';
import {getSceneryGeometryMap} from '../web/src/scene-schema.ts';
const {withSceneryCollision,sceneryFootprints}=await import('../web/src/placed-scenery.ts');
const document=JSON.parse(await readFile(new URL('../web/src/data/world-navigation.json',import.meta.url),'utf8'));
const scenes=JSON.parse(await readFile(new URL('../web/src/data/world-scenes.json',import.meta.url),'utf8'));
test('Tiled roundtrip preserves canonical geometry and foot placements',()=>{
  for(const id of Object.keys(document.maps))assert.deepEqual(fromTiled(toTiled(id,document),document),document);
});
test('Tiled preserves modular terrain layers, blocked water and construction groups',()=>{
  const source=structuredClone(scenes),scene=source.maps.lindenhafen;
  scene.modularTerrain={version:1,base:'meadow',surfaces:[{id:'canal-water',groupId:'canal-piece',material:'deep-water',blocked:true,polygon:[[100,100],[200,100],[200,200],[100,200]]}]};
  const tiled=toTiled(scene.id,source);
  assert.equal(tiled.layers.find(layer=>layer.name==='Terrain').visible,false);
  assert.deepEqual(fromTiled(tiled,source),source);
  tiled.layers.find(layer=>layer.name==='Terrain surfaces').objects[0].x+=20;
  const moved=fromTiled(tiled,source).maps.lindenhafen.modularTerrain.surfaces[0];
  assert.deepEqual(moved.polygon,[[120,100],[220,100],[220,200],[120,200]]);
  assert.equal(moved.groupId,'canal-piece');assert.equal(moved.blocked,true);
});
test('all three checked-in editor documents preserve canonical scene data',async()=>{
  assert.equal(Object.keys(scenes.maps).length,3);
  for(const id of Object.keys(scenes.maps)) {
    const tiled=JSON.parse(await readFile(new URL(`../docs/maps/${id}.tmj`,import.meta.url),'utf8'));
    assert.deepEqual(fromTiled(tiled,scenes),scenes,`${id}: editor document drifted from runtime scene`);
  }
});
test('v2 roundtrip preserves every scene field, including activities and generation settings',()=>{
  const source=structuredClone(scenes),scene=source.maps.lindenhafen;
  scene.activities=[{id:'test-seat',ownerId:scene.scenery[0].id,kind:'seat',offsetX:18.5,offsetY:-3.5,approach:{x:14,y:20},exit:{x:-14,y:20},capacity:1}];
  scene.generationZones=[{id:'garden',polygon:[[100,100],[200,100],[200,200],[100,200]],seed:42,rulesVersion:1,palette:['tree','bench'],pinnedIds:[scene.scenery[0].id],count:4,minSpacing:30,clearance:12,minScale:.8,maxScale:1.1}];
  for(const id of Object.keys(source.maps))assert.deepEqual(fromTiled(toTiled(id,source),source),source);
  const tiled=toTiled('lindenhafen',source);
  tiled.layers.find(layer=>layer.name==='Scenery').objects[0].x+=20;
  const moved=fromTiled(tiled,source).maps.lindenhafen;
  assert.equal(moved.scenery[0].x,scene.scenery[0].x+20);
  assert.deepEqual(moved.activities,scene.activities,'owner movement preserves relative activity offsets');
  const host=scene.scenery.find(item=>item.interior);
  assert.deepEqual(fromTiled(tiled,source).maps.lindenhafen.scenery.find(item=>item.id===host.id).interior,host.interior,'rooms stay with their building');
  assert.equal(tiled.layers.some(layer=>layer.name==='Entrances'),false);
});
test('v2 image terrain uses logical dimensions and scenery preserves pivots and horizontal flips',()=>{
  const scene=scenes.maps.lindenhafen,item=scene.scenery[0],plate=scene.terrain[0];
  const images={terrain:{[plate.dayAsset]:{asset:plate.dayAsset,imageWidth:3072,imageHeight:2048}},scenery:{[item.id]:{asset:'/assets/example.webp',imageWidth:2048,imageHeight:2048,frame:{x:12,y:16,w:400,h:500},originX:.45,originY:.95,referenceWidth:300}}};
  const tiled=toTiled(scene.id,scenes,{images});
  const terrain=tiled.layers.find(layer=>layer.name==='Terrain').objects[0];
  assert.equal(terrain.width,plate.width);assert.equal(terrain.height,plate.height);
  assert.equal(tiled.tilesets[0].tiles[0].imagewidth,3072);
  assert.deepEqual(fromTiled(tiled,scenes),scenes);
  const object=tiled.layers.find(layer=>layer.name==='Scenery').objects[0];
  object.x+=10;object.gid=(object.gid|0x80000000)>>>0;
  const moved=fromTiled(tiled,scenes).maps[scene.id].scenery[0];
  assert.ok(Math.abs(moved.x-item.x-10)<1e-8);assert.equal(moved.flipX,true);
  object.height*=2;assert.throws(()=>fromTiled(tiled,scenes),/aspect ratio/);
});
test('Tiled furniture resizing and mirroring carry its usable positions',()=>{
  const source=structuredClone(scenes),scene=source.maps.lindenhafen,owner=scene.scenery[0];
  scene.activities=[{id:'seat',ownerId:owner.id,kind:'seat',offsetX:5,offsetY:10,approach:{x:8,y:20},capacity:2,places:[{x:-12,y:0},{x:12,y:0}]}];
  owner.interior={kind:'inn',returnOffset:{x:15,y:35}};
  const tiled=toTiled(scene.id,source),object=tiled.layers.find(layer=>layer.name==='Scenery').objects[0];
  object.properties.find(value=>value.name==='width').value*=2;
  object.properties.push({name:'flipX',type:'bool',value:true});
  const moved=fromTiled(tiled,source).maps.lindenhafen;
  assert.deepEqual(moved.activities[0].approach,{x:-16,y:40});
  assert.deepEqual(moved.activities[0].places,[{x:24,y:0},{x:-24,y:0}]);
  assert.deepEqual(moved.scenery[0].interior.returnOffset,{x:-30,y:70});
});
test('unsupported v2 content cannot disappear silently',()=>{
  const source=structuredClone(scenes);delete source.maps.lindenhafen.navigation;
  source.maps.lindenhafen.walkable=[[[20,20],[200,20],[200,200],[20,200]]];
  const tiled=toTiled('lindenhafen',source);
  tiled.layers.find(layer=>layer.name==='Walkable').objects[0].properties=[{name:'lost',type:'string',value:'no'}];
  assert.throws(()=>fromTiled(tiled,scenes),/custom properties/);
  tiled.layers.find(layer=>layer.name==='Walkable').objects[0].properties=[];
  tiled.layers.find(layer=>layer.name==='Scenery').objects[0].template='unresolved.tx';
  assert.throws(()=>fromTiled(tiled,scenes),/Resolve Tiled template/);
});

test('Tiled artwork edits refresh inherited collision for point and image scenery',()=>{
  for(const image of [false,true])for(const change of [{asset:'bench'},{frame:'house-1'}]){
    const source=structuredClone(scenes),scene=source.maps.lindenhafen,owner=scene.scenery[0];
    const images=image?{scenery:{[owner.id]:{asset:'/assets/example.webp',imageWidth:2048,imageHeight:2048,frame:{x:12,y:16,w:400,h:500},originX:.45,originY:.95,referenceWidth:300}}}:undefined;
    const tiled=toTiled(scene.id,source,{images}),object=tiled.layers.find(layer=>layer.name==='Scenery').objects[0];
    for(const [name,value]of Object.entries(change)){
      const entry=object.properties.find(property=>property.name===name);
      if(entry)entry.value=value;else object.properties.push({name,type:'string',value});
    }
    const imported=fromTiled(tiled,source).maps[scene.id].scenery[0];
    const expected={...owner,...change};delete expected.collision;
    assert.deepEqual(imported.collision,withSceneryCollision(expected,getSceneryGeometryMap(scene.id)).collision);
    assert.notDeepEqual(imported.collision,owner.collision);
    assert.deepEqual(sceneryFootprints([imported]),sceneryFootprints([withSceneryCollision(expected,getSceneryGeometryMap(scene.id))]));
  }
});

test('Tiled retains explicitly edited collision when changing the artwork',()=>{
  const source=structuredClone(scenes),scene=source.maps.lindenhafen,owner=scene.scenery[0];
  const before=structuredClone(owner.collision);
  const tiled=toTiled(scene.id,source),object=tiled.layers.find(layer=>layer.name==='Scenery').objects[0];
  const custom={referenceWidth:100,polygons:[[[-5,-7],[5,-7],[5,0],[-5,0]]]};
  object.properties.find(property=>property.name==='asset').value='bench';
  object.properties.find(property=>property.name==='collision').value=JSON.stringify(custom);
  const imported=fromTiled(tiled,source).maps[scene.id].scenery[0];
  assert.equal(imported.asset,'bench');assert.deepEqual(imported.collision,custom);
  assert.deepEqual(owner.collision,before,'import must not mutate the original collider');
});
test('editor position and polygon offset edits reach the canonical pixel data',()=>{
  const tiled=toTiled('lindenhafen',document);
  const npc=tiled.layers.find(layer=>layer.name==='NPCs').objects[0];npc.x+=24;
  const layer=tiled.layers.find(layer=>layer.name==='Walkable');layer.offsetx=8;
  const next=fromTiled(tiled,document);
  assert.equal(next.maps.lindenhafen.npcs[0].x,document.maps.lindenhafen.npcs[0].x+24);
  assert.equal(next.maps.lindenhafen.walkable[0][0][0],document.maps.lindenhafen.walkable[0][0][0]+8);
});
test('malformed layer and shape edits cannot silently remove runtime collision',()=>{
  const tiled=toTiled('lindenhafen',document);
  tiled.layers.find(layer=>layer.name==='Walkable').objects[0].polygon=undefined;
  assert.throws(()=>fromTiled(tiled,document),/needs a polygon/);
  tiled.layers=tiled.layers.filter(layer=>layer.name!=='Obstacles');
  assert.throws(()=>fromTiled(tiled,document),/Missing Tiled layer/);
});

test('Tiled preserves prefab catalog and moves a whole placed group with its baselines',()=>{
  const source=structuredClone(scenes),scene=source.maps.lindenhafen,prefab=source.prefabs.find(item=>item.id==='sheltered-bench');
  const origin={x:scene.width*.75,y:scene.height*.25},instanceId='lindenhafen-sheltered-bench-test';
  const members=prefab.scenery.map(child=>({key:child.id,id:`${instanceId}-${child.id}`,base:{...structuredClone(child),id:`${instanceId}-${child.id}`,x:origin.x+child.x,y:origin.y+child.y}}));
  scene.scenery.push(...members.map(member=>({...structuredClone(member.base),groupId:instanceId})));
  scene.prefabInstances=[...(scene.prefabInstances??[]),{id:instanceId,prefabId:prefab.id,revision:prefab.revision,origin,members,activities:[]}];
  const tiled=toTiled('lindenhafen',source);
  assert.deepEqual(fromTiled(tiled,source),source);
  const ids=new Set(members.map(member=>member.id));
  for(const object of tiled.layers.find(layer=>layer.name==='Scenery').objects.filter(object=>ids.has(object.name))){object.x+=100;object.y+=10;}
  const imported=fromTiled(tiled,source);
  assert.deepEqual(imported.prefabs,source.prefabs);
  const moved=imported.maps.lindenhafen.prefabInstances.find(item=>item.id===instanceId);
  assert.deepEqual(moved.origin,{x:origin.x+100,y:origin.y+10});
  assert.equal(moved.members[0].base.x,members[0].base.x+100);
});
