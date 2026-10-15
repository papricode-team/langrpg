import {describe,expect,it} from 'vitest';
import {roadCurbRings,visibleRoadCurbRings,curbStones} from './terrain-curbs';
import {rectangleSurface,terrainContains} from './modular-terrain';
import {terrainMaterialDependencies} from './terrain-masonry';
const rect=(x:number,y:number,w:number,h:number)=>rectangleSurface('road','town-cobble',x,y,w,h).polygon;
const area=(p:readonly (readonly [number,number])[])=>p.reduce((n,a,i)=>{
  const b=p[(i+1)%p.length];return n+a[0]*b[1]-a[1]*b[0];
},0)/2;

describe('raised road border stones',()=>{
  it('keeps the center of an overlapping crossroads free of edging',()=>{
    const rings=roadCurbRings([rect(0,40,200,40),rect(80,0,40,120)]);
    expect(rings).toHaveLength(1);
    const stones=rings.flatMap(curbStones);
    expect(stones.length).toBeGreaterThan(10);
    for(const stone of stones)for(const [x,y] of stone.top)
      expect(x>81&&x<119&&y>41&&y<79).toBe(false);
  });
  it('borders garden holes on the garden side and outer roads on the grass side',()=>{
    const rings=roadCurbRings([rect(0,0,200,30),rect(0,170,200,30),rect(0,30,30,140),rect(170,30,30,140)]);
    expect(rings).toHaveLength(2);
    const inner=rings.find(r=>area(r)<0)!,outer=rings.find(r=>area(r)>0)!;
    for(const stone of curbStones(inner))expect(terrainContains(inner,...stone.center)).toBe(true);
    for(const stone of curbStones(outer))expect(terrainContains(outer,...stone.center)).toBe(false);
  });
  it('has deterministic world-space detail on both sides of a chunk boundary',()=>{
    const ring=roadCurbRings([rect(220,230,180,90)])[0];
    const a=curbStones(ring),b=curbStones(structuredClone(ring));
    expect(a).toEqual(b);
    expect(a.some(s=>s.top.some(p=>p[0]<256)&&s.top.some(p=>p[0]>256))).toBe(true);
    for(const stone of a){
      expect(stone.length).toBeGreaterThan(10);
      expect(stone.length).toBeLessThan(30);
      expect(area(stone.top)).toBeGreaterThan(0);
      expect(stone.top.flat().every(Number.isFinite)).toBe(true);
    }
  });
  it('loads the stone art even on a road-only map without canals',()=>{
    expect(terrainMaterialDependencies(['town-cobble'])).toEqual(['town-cobble','canal-masonry']);
  });
  it('adds an inner border when an editor paints a garden over a paved square',()=>{
    const road=rectangleSurface('square','town-cobble',0,0,200,200);
    const garden=rectangleSurface('garden','canal-grass',60,60,80,80);
    const rings=visibleRoadCurbRings([road,garden]);
    expect(rings).toHaveLength(2);
    const inner=rings.find(r=>area(r)<0)!;
    expect(curbStones(inner).length).toBeGreaterThan(10);
    expect(visibleRoadCurbRings([garden,road])).toHaveLength(1);
  });
});
