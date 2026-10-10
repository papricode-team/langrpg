import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {toTiled,fromTiled} from './map-editor-format.mjs';
const document=JSON.parse(await readFile(new URL('../web/src/data/world-navigation.json',import.meta.url),'utf8'));
test('Tiled roundtrip preserves canonical geometry and foot placements',()=>{
  for(const id of Object.keys(document.maps))assert.deepEqual(fromTiled(toTiled(id,document),document),document);
});
test('all three checked-in town editor documents preserve canonical placements',async()=>{
  for(const id of Object.keys(document.maps)) {
    const tiled=JSON.parse(await readFile(new URL(`../docs/maps/${id}.tmj`,import.meta.url),'utf8'));
    assert.deepEqual(tiled,toTiled(id,document),`${id}: editor document drifted from runtime geometry`);
    assert.deepEqual(fromTiled(tiled,document),document);
  }
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
