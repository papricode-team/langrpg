import {describe,expect,it} from 'vitest';
import {visibleQuayRings} from './terrain-masonry';
import {rectangleSurface,surfaceAt,type ModularTerrain} from './modular-terrain';
import draft from './data/lindenhafen-terrain-rebuild.json';

describe('visible canal banks',()=>{
 it('moves the bank to the edge of a landing painted over water',()=>{
  const water=rectangleSurface('canal','banked-water',0,0,200,200);
  const landing=rectangleSurface('landing','town-cobble',0,0,120,200);
  const rings=visibleQuayRings([water,landing]);
  expect(rings).toHaveLength(1);
  expect(Math.min(...rings[0].polygon.map(p=>p[0]))).toBe(120);
  expect(visibleQuayRings([landing,water])[0].polygon.some(p=>p[0]===0)).toBe(true);
 });
 it('merges overlapping water and preserves opposite winding around an island',()=>{
  const rings=visibleQuayRings([
   rectangleSurface('a','banked-water',0,0,150,200),
   rectangleSurface('b','banked-water',100,0,150,200),
   rectangleSurface('island','town-cobble',80,80,40,40),
  ]);
  expect(rings).toHaveLength(2);
  const areas=rings.map(({polygon:p})=>p.reduce((sum,a,i)=>{const b=p[(i+1)%p.length];return sum+a[0]*b[1]-b[0]*a[1];},0));
  expect(areas[0]).toBeGreaterThan(0);expect(areas[1]).toBeLessThan(0);
 });
 it('never draws the live town bank through the interior of a later paved landing',()=>{
  const terrain=draft.modularTerrain as unknown as ModularTerrain;
  for(const {polygon:ring} of visibleQuayRings(terrain.surfaces))for(let i=0;i<ring.length;i++){
   const a=ring[i],b=ring[(i+1)%ring.length],dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);
   if(length<.1)continue;
   // Water lies just inside every exposed boundary, including island holes.
   const x=(a[0]+b[0])/2-dy/length*.01,y=(a[1]+b[1])/2+dx/length*.01;
   expect(surfaceAt(terrain,x,y)?.material).toBe('banked-water');
  }
 });
});
