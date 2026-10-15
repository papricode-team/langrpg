import {describe,it,expect} from 'vitest';
import source from './data/world-scenes.json';
import {parseWorldSceneDocument} from './scene-schema';
import {lindenhafenTerrainDocument,lindenhafenTerrainRebuild as draft} from './lindenhafen-terrain-rebuild';
import {modularTerrainBarriers} from './modular-terrain';
import {featureSurfaces} from './terrain-features';
import {NavigationGrid,PLAYER_RADIUS} from './navigation';

describe('Lindenhafen terrain reconstruction',()=>{
 const original=parseWorldSceneDocument(source),doc=lindenhafenTerrainDocument(original),scene=doc.maps.lindenhafen,terrain=scene.modularTerrain!;
 // Restrict routes to actual paving: walking across grass must not conceal a disconnected road.
 const paving=[...terrain.surfaces.filter(s=>s.material==='town-cobble'),...(terrain.features??[]).flatMap(featureSurfaces).filter(s=>!s.blocked)].map(s=>s.polygon);
 const grid=new NavigationGrid(paving,[...modularTerrainBarriers(terrain,scene.width,scene.height),...terrain.surfaces.filter(s=>s.material==='canal-grass').map(s=>s.polygon)],scene,{agentRadius:PLAYER_RADIUS});
 it('keeps original coordinates and makes a valid terrain-only document',()=>{
  expect([scene.width,scene.height]).toEqual([2304,1536]);expect(scene.scenery).toEqual([]);
  expect(original.maps.lindenhafen.modularTerrain).toBeUndefined();expect(doc.maps.waldruh).toEqual(original.maps.waldruh);
  expect(()=>parseWorldSceneDocument(doc)).not.toThrow();
 });
 it.each(draft.routes)('connects the market to $id entirely on paving',route=>{
  expect(grid.isWalkable(route.to.x,route.to.y)).toBe(true);
  expect(grid.findPath(route.from,route.to).at(-1)).toEqual(route.to);
 });
 it.each([
  {id:'market bridge',from:{x:1260,y:555},to:{x:1720,y:945},limit:850},
  {id:'harbor bridge',from:{x:1050,y:855},to:{x:1420,y:1160},limit:650},
 ])('crosses $id directly without detouring around the canal',({from,to,limit})=>{
  expect(grid.isWalkable(from.x,from.y)).toBe(true);expect(grid.isWalkable(to.x,to.y)).toBe(true);
  const path=grid.findPath(from,to);expect(path.at(-1)).toEqual(to);
  const length=path.reduce((total,p,i)=>{const q=i?path[i-1]:from;return total+Math.hypot(p.x-q.x,p.y-q.y);},0);
  expect(length).toBeLessThan(limit);
 });
 it('blocks the canal pools and harbor water',()=>{
  for(const [x,y] of [[1530,450],[1050,1200],[1700,1350],[350,1000]])expect(grid.isWalkable(x,y)).toBe(false);
 });
});
