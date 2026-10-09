import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { expeditionMaps } from './expeditions';
import { getPlacedScenery } from './placed-scenery';
import { sampleSceneryFrame, type SceneryAnimationManifest } from './scenery-animation';
import { regionPeopleKey } from './world-map-assets';

interface Atlas { frames: Record<string, { frame: { x:number;y:number;w:number;h:number }; sourceSize:{w:number;h:number} }>; meta:{size:{w:number;h:number}}; }
const files = import.meta.glob(['../public/assets/*-props.json','../public/assets/*-motions.json','../public/assets/*-people*.json','../public/assets/*-day-animations.json','../public/assets/*-night-animations.json'], { eager:true, import:'default' });
const readAtlas = (name:string): Atlas => files[`../public/assets/${name}.json`] as Atlas;

describe('exported expedition sprites', () => {
  for (const map of expeditionMaps) it(`${map.name} resolves every static prop, independent motion and local character frame`, async () => {
    const props=readAtlas(`${map.id}-props`), motions=readAtlas(`${map.id}-motions`), people=readAtlas(`${map.id}-people`);
    expect(props,`${map.id} props atlas`).toBeDefined();
    expect(motions,`${map.id} motions atlas`).toBeDefined();
    expect(people,`${map.id} people atlas`).toBeDefined();
    expect(Object.keys(props.frames)).toHaveLength(24);
    expect(Object.keys(motions.frames)).toHaveLength(24);
    expect(Object.keys(people.frames)).toHaveLength(16);
    expect(Object.keys(readAtlas(`${map.id}-people-1`).frames)).toHaveLength(24);
    expect(Object.keys(readAtlas(`${map.id}-people-2`).frames)).toHaveLength(24);
    for (const kind of ['props','motions','people','people-1','people-2']) {
      const atlas=readAtlas(`${map.id}-${kind}`);
      const metadata=await sharp(new URL(`../public/assets/${map.id}-${kind}.webp`,import.meta.url).pathname).metadata();
      expect(metadata.hasAlpha,`${map.id}-${kind} requires actual alpha`).toBe(true);
      expect(metadata.width).toBe(atlas.meta.size.w);
      expect(metadata.height).toBe(atlas.meta.size.h);
      expect(metadata.width).toBeLessThanOrEqual(2048);
      expect(metadata.height).toBeLessThanOrEqual(2048);
      for (const {frame} of Object.values(atlas.frames)) {
        expect(frame.x).toBeGreaterThanOrEqual(0);
        expect(frame.y).toBeGreaterThanOrEqual(0);
        expect(frame.w).toBeGreaterThan(0);
        expect(frame.h).toBeGreaterThan(0);
        expect(frame.x+frame.w).toBeLessThanOrEqual(metadata.width!);
        expect(frame.y+frame.h).toBeLessThanOrEqual(metadata.height!);
      }
    }
    for (const period of ['day','night'] as const) {
      const manifest=files[`../public/assets/${map.id}-${period}-animations.json`] as SceneryAnimationManifest;
      expect(Object.keys(manifest.assets)).toHaveLength(4);
      for (const spec of getPlacedScenery(map.id)) {
        const name=spec.frame??spec.asset;
        if (spec.collidable===false) {
          const animation=manifest.assets[name];
          expect(animation,name).toBeDefined();
          expect(animation.key).toBe(`${map.id}-motions`);
          expect(animation.frames).toHaveLength(6);
          expect(animation.frames.every(frame=>!!motions.frames[frame])).toBe(true);
          const dimensions=animation.frames.map(frame=>motions.frames[frame].sourceSize);
          expect(dimensions.every(size=>size.w===dimensions[0].w&&size.h===dimensions[0].h)).toBe(true);
          expect(new Set(Array.from({length:6},(_,index)=>sampleSceneryFrame(animation,spec.id,index/animation.fps))).size).toBe(6);
        } else expect(props.frames[name],`${map.id}: static ${name}`).toBeDefined();
      }
    }
    const keys=new Set<string>();
    const paintings=new Set<string>();
    for (let variant=0;variant<16;variant++) {
      const key=regionPeopleKey(map.id,variant),atlas=readAtlas(key);
      const sizes=Array.from({length:4},(_,index)=>atlas.frames[`person-${variant}-${index}`]?.sourceSize);
      expect(sizes.every(size=>!!size&&size.w===sizes[0].w&&size.h===sizes[0].h)).toBe(true);
      keys.add(`${key}:person-${variant}-0`);
      const frame=atlas.frames[`person-${variant}-0`].frame;
      const pixels=await sharp(new URL(`../public/assets/${key}.webp`,import.meta.url).pathname)
        .extract({left:frame.x,top:frame.y,width:frame.w,height:frame.h}).png().toBuffer();
      paintings.add(pixels.toString('base64'));
    }
    expect(keys.size).toBe(16);
    expect(paintings.size,`${map.id} must not reuse a painted character under another frame name`).toBe(16);
    const portraits=await sharp(new URL(`../public/assets/${map.id}-portraits.webp`,import.meta.url).pathname).metadata();
    expect([portraits.width,portraits.height]).toEqual([2048,256]);
    const terrain=await sharp(new URL(`../public/assets/${map.id}-terrain.webp`,import.meta.url).pathname).metadata();
    const preview=await sharp(new URL(`../public/assets/${map.id}-preview.webp`,import.meta.url).pathname).metadata();
    expect([terrain.width,terrain.height]).toEqual([1536,1024]);
    expect([preview.width,preview.height]).toEqual([1536,1024]);
  });
});
