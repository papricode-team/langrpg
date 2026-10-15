import {describe,it,expect} from 'vitest';
import {readFile} from 'node:fs/promises';
import {modularTerrainBarriers,rectangleSurface,terrainContains,terrainFingerprint,editableTerrainFromScene,type ModularTerrain} from './modular-terrain';
import {applyEditOps,inverseEditOps,parseEditOps,type WorldEditOp} from './world-edit-ops';
import {sceneDocument as canonicalSceneDocument} from './scene-data';
import {parseWorldSceneDocument} from './scene-schema';
import {NavigationGrid} from './navigation';
import {sceneNavigationGeometry} from './scene-navigation';
const sceneDocument=structuredClone(canonicalSceneDocument);
for(const scene of Object.values(sceneDocument.maps))scene.modularTerrain=editableTerrainFromScene(scene);
const at=(terrain:ModularTerrain,x:number,y:number)=>modularTerrainBarriers(terrain,200,200).some(p=>terrainContains(p,x,y));

describe('editable terrain',()=>{
 it('land bridges cut water collision, and later water closes the same crossing',()=>{
  const terrain:ModularTerrain={version:1,base:'meadow',surfaces:[rectangleSurface('river','deep-water',70,0,60,200),rectangleSurface('bridge','timber',0,80,200,40)]};
  expect(at(terrain,100,100)).toBe(false);expect(at(terrain,100,50)).toBe(true);
  const grid=new NavigationGrid([[[0,0],[200,0],[200,200],[0,200]]],modularTerrainBarriers(terrain,200,200),{width:200,height:200},{agentRadius:10});
  expect(grid.isWalkable(100,100)).toBe(true);expect(grid.isWalkable(100,50)).toBe(false);
  const closed={...terrain,surfaces:[...terrain.surfaces,rectangleSurface('flood','deep-water',80,70,40,60)]};
  expect(at(closed,100,100)).toBe(true);
 });
 it('preserves a walkable island inside a blocked lake',()=>{
  const terrain:ModularTerrain={version:1,base:'deep-water',surfaces:[rectangleSurface('island','sand',50,50,100,100)]};
  expect(at(terrain,30,30)).toBe(true);expect(at(terrain,100,110)).toBe(false);
 });
 it('allows deliberate cliff collision independently of a ground material',()=>{
  const terrain:ModularTerrain={version:1,base:'meadow',surfaces:[{...rectangleSurface('cliff','rock',40,40,80,80),blocked:true}]};
  expect(at(terrain,60,70)).toBe(true);
 });
 it('migrates all three towns without changing terrain hazards',()=>{
  for(const scene of Object.values(sceneDocument.maps)){
   const legacy={...scene};delete legacy.modularTerrain;
   const next={...legacy,modularTerrain:editableTerrainFromScene(legacy)};
   const before=sceneNavigationGeometry(legacy).terrain,after=sceneNavigationGeometry(next).terrain;
   for(let y=7;y<scene.height;y+=23)for(let x=5;x<scene.width;x+=23)
    expect(after.some(p=>terrainContains(p,x,y)),`${scene.id} ${x},${y}`).toBe(before.some(p=>terrainContains(p,x,y)));
  }
 });
 it('publishes, serializes and undoes terrain without mutating the original world',()=>{
  const before=sceneDocument.maps.lindenhafen.modularTerrain!;
  const next={...before,base:'snow'};
  const op:WorldEditOp={kind:'terrain',map:'lindenhafen',terrain:next,expected:terrainFingerprint(before)};
  const undo=inverseEditOps(sceneDocument,op),applied=applyEditOps(sceneDocument,parseEditOps(JSON.parse(JSON.stringify([op])))).document;
  expect(applied.maps.lindenhafen.modularTerrain?.base).toBe('snow');expect(before.base).not.toBe('snow');
  expect(applyEditOps(applied,undo).document).toEqual(sceneDocument);
 });
 it('rejects stale terrain edits instead of overwriting another admin',()=>{
  expect(()=>applyEditOps(sceneDocument,[{kind:'terrain',map:'lindenhafen',terrain:null,expected:'stale'}])).toThrow(/changed/);
 });
 it.each(['unknown-material','self-intersection','outside-map'])('rejects %s at the scene boundary',kind=>{
  const doc=structuredClone(sceneDocument),terrain=doc.maps.lindenhafen.modularTerrain!;
  if(kind==='unknown-material')terrain.base='missing';
  else terrain.surfaces.push({id:'invalid',material:'earth',polygon:kind==='self-intersection'?[[0,0],[100,100],[0,100],[100,0]]:[[-10,20],[40,20],[40,40]]});
  expect(()=>parseWorldSceneDocument(doc)).toThrow();
 });
 it('keeps generated source provenance and actual native dimensions',async()=>{
  const catalogue=JSON.parse(await readFile(new URL('./data/terrain-materials.json',import.meta.url),'utf8'));
  expect(catalogue.materials).toHaveLength(22);
  for(const material of catalogue.materials){expect(material.sourceWidth).toBeGreaterThanOrEqual(1024);expect(material.width/material.worldSize).toBeGreaterThanOrEqual(2);}
 });
});
