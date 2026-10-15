import {describe,it,expect} from 'vitest';
import data from './data/world-scenes.json';
import {terrainDistrict,districtDocument} from './terrain-district';
import {parseWorldSceneDocument,sceneEntrancePoint} from './scene-schema';
import {sceneNavigationGeometry} from './scene-navigation';
import {NavigationGrid,PLAYER_RADIUS} from './navigation';

describe('connected perspective terrain district',()=>{
 const original=parseWorldSceneDocument(data),draft=districtDocument(original),scene=draft.maps.lindenhafen;
 const geometry=sceneNavigationGeometry(scene);
 const navigation=new NavigationGrid(geometry.ground,geometry.barriers,scene,{agentRadius:PLAYER_RADIUS});
 it('keeps the published document intact and produces a valid editable world draft',()=>{
  expect(original.maps.lindenhafen.modularTerrain).toBeUndefined();
  expect(draft.maps.waldruh).toEqual(original.maps.waldruh);
  expect(()=>parseWorldSceneDocument(draft)).not.toThrow();
  expect(scene.modularTerrain?.features?.length).toBeGreaterThan(5);
 });
 it.each(terrainDistrict.routes)('allows an adult-sized actor to traverse $id without snapping the destination',route=>{
  expect(navigation.isWalkable(route.from.x,route.from.y)).toBe(true);
  expect(navigation.isWalkable(route.to.x,route.to.y)).toBe(true);
  const path=navigation.findPath(route.from,route.to);
  expect(path.length).toBeGreaterThan(0);
  expect(path.at(-1)).toEqual(route.to);
 });
 it('keeps story markers and the three building approaches reachable',()=>{
  const approaches=scene.scenery.filter(item=>item.asset==='house').map(item=>({id:item.id,...sceneEntrancePoint(scene,item,true)}));
  for(const point of [...scene.npcs,...scene.objects,...approaches]){
   expect(navigation.isWalkable(point.x,point.y),point.id).toBe(true);
   expect(navigation.findPath(scene.spawn,point).at(-1),point.id).toMatchObject({x:point.x,y:point.y});
  }
 });
 it('keeps the canal and the bridge masonry blocked',()=>{
  expect(navigation.isWalkable(800,1000)).toBe(false);
  expect(navigation.isWalkable(930,820)).toBe(false);
 });
});
