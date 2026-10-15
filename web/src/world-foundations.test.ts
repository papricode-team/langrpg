import { describe, expect, it } from 'vitest';
import type * as Phaser from 'phaser';
import { BuildingFoundation, foundationBounds, foundationPolygons, traceFoundationContact } from './world-foundations';
import { foundationScene } from './test-support/foundation-scene';
import type { PlacedScenerySpec } from './placed-scenery';

const spec: PlacedScenerySpec = { id: 'house', asset: 'house', x: 400, y: 600, width: 256 };
const geometry = { referenceWidth: 512, footprint: [[-200,-100],[120,-140],[200,-20],[-160,0]] as const };

describe('building ground contact', () => {
  it('traces stones beyond the collider, rejects roof overhangs and leaves open arches unbridged', () => {
    const pixels = new Uint8ClampedArray(16*16*4);
    const pixel = (x:number,y:number,alpha=255) => {pixels[(y*16+x)*4+3]=alpha;};
    for(let x=0;x<16;x++)pixel(x,2); // Continuous roof, far above the wall line.
    for(const x of [2,3,4,11,12,13])pixel(x,15); // Two bases with a walkable gap.
    pixel(3,14);pixel(3,15,24); // Ignore faint alpha fringe, retain solid masonry.
    const artwork={width:256,height:256,referenceWidth:256,originX:.5,originY:1};
    const footprint=[[[-128,-60],[128,-60],[128,-16],[-128,-16]]] as const;
    const lines=traceFoundationContact(pixels,16,16,artwork,footprint);
    expect(lines).toEqual([[[-88,0],[-72,-16],[-56,0]],[[56,0],[72,0],[88,0]]]);
    expect(traceFoundationContact(pixels,16,16,artwork,footprint,true))
      .toEqual(lines.map(line=>line.map(([x,y])=>[-x,y])));
  });
  it('uses canonical geometry, with the same local scaling and mirror as collision', () => {
    expect(foundationPolygons(spec, geometry)).toEqual([[[-100,-50],[60,-70],[100,-10],[-80,0]]]);
    expect(foundationPolygons({...spec,flipX:true,collidable:false,width:512}, geometry))
      .toEqual([[[100,-50],[-60,-70],[-100,-10],[80,0]]]);
    const polygons = foundationPolygons(spec, geometry), bounds = foundationBounds(polygons);
    expect(polygons.flat().every(([x,y])=>x>bounds.x+15&&x<bounds.x+bounds.width-15&&y>bounds.y+15&&y<bounds.y+bounds.height-15)).toBe(true);
  });
  it('honours separate edited foundations and retains a fallback for legacy buildings', () => {
    const collision = { referenceWidth:256, polygons:[[[-80,-20],[-60,-20],[-60,0]],[ [60,-20],[80,-20],[80,0]]] as const };
    expect(foundationPolygons({...spec,collision},geometry)).toEqual(collision.polygons);
    expect(foundationPolygons({...spec,collidable:false,collision:{referenceWidth:256,polygons:[]}},geometry))
      .toEqual(foundationPolygons(spec,geometry));
    expect(foundationPolygons({...spec,asset:'arch'})).toHaveLength(2);
    expect(foundationPolygons(spec)[0]).toHaveLength(8);
  });
  it('shares footprints saved at different scales despite rounding and explicit closing points', () => {
    const points = geometry.footprint.map(([x,y])=>[x*.3,y*.3] as const);
    const saved = {...spec,collision:{referenceWidth:geometry.referenceWidth*.3,polygons:[[...points,points[0]]]}};
    expect(foundationPolygons(saved)).toEqual(foundationPolygons(spec,geometry));
  });
  it('shares atlases across placement sizes and concurrent periods, then releases the last owner', () => {
    const ground = foundationScene();
    const scene = { textures:{createCanvas:ground.createCanvas,remove:ground.remove}, add:{image:ground.image} } as unknown as Phaser.Scene;
    const day = new BuildingFoundation(scene,'lindenhafen',spec,geometry);
    const night = new BuildingFoundation(scene,'lindenhafen',{...spec,x:800,width:512},geometry);
    expect(ground.createCanvas).toHaveBeenCalledTimes(1);
    expect(ground.images[1].key).toBe(ground.images[3].key);
    expect(ground.images.filter(image=>image.frame==='shadow').every(image=>image.blendMode==='MULTIPLY')).toBe(true);
    expect(ground.images.filter(image=>image.frame==='wear').every(image=>image.blendMode==='NORMAL')).toBe(true);
    expect(ground.images[2].scale).toBe(ground.images[0].scale*2);
    day.destroy();
    expect(ground.remove).not.toHaveBeenCalled();
    night.destroy();
    expect(ground.remove).toHaveBeenCalledExactlyOnceWith(ground.images[1].key);
    new BuildingFoundation(scene,'lindenhafen',spec,geometry).destroy();
    expect(ground.createCanvas).toHaveBeenCalledTimes(2);
  });
  it('bounds texture allocation for oversized edited collision shapes', () => {
    const ground = foundationScene();
    const scene = { textures:{createCanvas:ground.createCanvas,remove:ground.remove}, add:{image:ground.image} } as unknown as Phaser.Scene;
    const collision = { referenceWidth:1, polygons:[[[-100,-100],[100,-100],[100,0],[-100,0]]] as const };
    new BuildingFoundation(scene,'lindenhafen',{...spec,collision}).destroy();
    const [,width,height] = ground.createCanvas.mock.calls[0];
    expect(width).toBeLessThanOrEqual(512);
    expect(height).toBeLessThanOrEqual(1024);
    expect(ground.images[0].scale).toBeGreaterThan(1);
  });
});
