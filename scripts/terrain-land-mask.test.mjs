import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import sharp from 'sharp';
import {exportClearLandMasks} from './terrain-land-mask.mjs';

const fixture = () => ({
  id: 'mask-fixture', width: 16, height: 8,
  navigation: {model: 'clear-land', terrainCollision: [
    {id: 'river', kind: 'water', polygon: [[6,2],[10,2],[10,6],[6,6]]},
    {id: 'cliff', kind: 'cliff', polygon: [[14,0],[16,0],[16,8],[14,8]]},
  ]},
  objects: [{id: 'movable-crate', x: 3, y: 4,
    collision: {referenceWidth: 1, polygons: [[[-1,-1],[1,-1],[1,1],[-1,1]]]} }],
  scenery: [{id: 'movable-building', x: 12, y: 4, width: 4,
    collision: {referenceWidth: 4, polygons: [[[-1,-1],[1,-1],[1,1],[-1,1]]]} }],
  terrain: [
    {id: 'west', x: 0, y: 0, width: 8, height: 8},
    {id: 'east', x: 8, y: 0, width: 8, height: 8},
  ],
});

const withDirectory = async run => {
  const root=await mkdtemp(join(tmpdir(),'lantern-land-mask-'));
  try {return await run(root);} finally {await rm(root,{recursive:true,force:true});}
};
const maskPath = (root, scene, tile) => join(root,'web/public/assets/walkable-masks',`${scene.id}-${tile.id}.png`);
const pixels = async path => sharp(path).removeAlpha().greyscale().raw().toBuffer({resolveWithObject:true});
const worldPixel = async (root,scene,x,y) => {
  const tile=scene.terrain.find(tile=>x>=tile.x&&y>=tile.y&&x<tile.x+tile.width&&y<tile.y+tile.height);
  assert.ok(tile,`(${x}, ${y}) needs a registered terrain tile`);
  const {data,info}=await pixels(maskPath(root,scene,tile));
  return data[(y-tile.y)*info.width+(x-tile.x)];
};

test('clear land is white, water and cliffs are black, and object bases stay out of terrain masks',async()=>{
  await withDirectory(async root=>{
    const scene=fixture(),tiles=await exportClearLandMasks(root,scene);
    assert.equal(tiles.length,2);
    for(const [x,y] of [[0,0],[5,4],[10,6],[13,7],[3,4],[12,4]])
      assert.equal(await worldPixel(root,scene,x,y),255,`clear ground at (${x}, ${y})`);
    for(const [x,y] of [[6,2],[7,4],[8,4],[9,5],[14,0],[15,7]])
      assert.equal(await worldPixel(root,scene,x,y),0,`terrain blocker at (${x}, ${y})`);
    for(const tile of scene.terrain) {
      assert.equal(tile.walkableMaskAsset,`/assets/walkable-masks/${scene.id}-${tile.id}.png`);
      assert.deepEqual(await readFile(maskPath(root,scene,tile)),
        await readFile(join(root,'art/source/terrain-detail',`${scene.id}-${tile.id}-walkable.png`)));
    }
    const manifest=JSON.parse(await readFile(join(root,'art/source/terrain-detail',`${scene.id}-walkable-masks.json`),'utf8'));
    assert.equal(manifest.model,'clear-land');
    assert.deepEqual(manifest.terrainCollision,scene.navigation.terrainCollision);
    assert.ok(!('objects' in manifest),'placed objects are separate from painted terrain');
  });
});

test('tile seams match a single world mask and regeneration is deterministic',async()=>{
  await withDirectory(async root=>{
    const scene=fixture();
    await exportClearLandMasks(root,scene);
    const before=await Promise.all(scene.terrain.map(tile=>readFile(maskPath(root,scene,tile))));
    const single={...structuredClone(scene),id:'continuous-mask',terrain:[{id:'whole',x:0,y:0,width:16,height:8}]};
    await exportClearLandMasks(root,single);
    const whole=await pixels(maskPath(root,single,single.terrain[0]));
    for(const tile of scene.terrain) {
      const {data,info}=await pixels(maskPath(root,scene,tile));
      for(let y=0;y<tile.height;y++)for(let x=0;x<tile.width;x++)
        assert.equal(data[y*info.width+x],whole.data[(tile.y+y)*whole.info.width+tile.x+x],`seam pixel ${tile.x+x}, ${tile.y+y}`);
    }
    await exportClearLandMasks(root,scene);
    for(const [index,tile] of scene.terrain.entries())
      assert.deepEqual(await readFile(maskPath(root,scene,tile)),before[index]);
  });
});

test('moving objects preserves terrain masks while changing hazards regenerates blocked ground',async()=>{
  await withDirectory(async root=>{
    const scene=fixture();
    await exportClearLandMasks(root,scene);
    const before=await Promise.all(scene.terrain.map(tile=>readFile(maskPath(root,scene,tile))));
    scene.objects[0].x=8;scene.scenery[0].x=5;
    await exportClearLandMasks(root,scene);
    for(const [index,tile] of scene.terrain.entries())
      assert.deepEqual(await readFile(maskPath(root,scene,tile)),before[index]);
    scene.navigation.terrainCollision=scene.navigation.terrainCollision.filter(hazard=>hazard.kind!=='water');
    await exportClearLandMasks(root,scene);
    assert.equal(await worldPixel(root,scene,7,4),255);
    assert.equal(await worldPixel(root,scene,8,4),255);
    assert.equal(await worldPixel(root,scene,15,4),0,'the unchanged cliff stays blocked');
    for(const [index,tile] of scene.terrain.entries())
      assert.notDeepEqual(await readFile(maskPath(root,scene,tile)),before[index]);
  });
});

test('canonical Waldruh grass and bare soil are land while the painted river and cliff faces stay blocked',async()=>{
  await withDirectory(async root=>{
    const source=JSON.parse(await readFile(new URL('../web/src/data/world-scenes.json',import.meta.url),'utf8'));
    const scene=structuredClone(source.maps.waldruh);
    await exportClearLandMasks(root,scene);
    // These are terrain-art fixtures, independent of the old street whitelist.
    for(const [x,y] of [[103,416],[302,164],[397,272],[1874,414]])
      assert.equal(await worldPixel(root,scene,x,y),255,`grass or soil at (${x}, ${y})`);
    for(const [x,y] of [[1465,267],[214,228],[1207,354],[1880,195]])
      assert.equal(await worldPixel(root,scene,x,y),0,`painted river or rock face at (${x}, ${y})`);
  });
});

test('terrain mask export rejects navigation without the clear-land contract',async()=>{
  await withDirectory(async root=>{
    const scene=fixture();delete scene.navigation;
    await assert.rejects(exportClearLandMasks(root,scene),/expected clear-land navigation/);
  });
});
