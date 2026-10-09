import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { expeditionMaps } from './expeditions';
import { getPlacedScenery } from './placed-scenery';
import { sampleSceneryFrame, type SceneryAnimationManifest } from './scenery-animation';

interface Atlas { frames: Record<string, { frame: { x:number;y:number;w:number;h:number }; sourceSize:{w:number;h:number} }>; meta:{size:{w:number;h:number}}; }
const files = import.meta.glob(['../public/assets/*-props.json','../public/assets/*-motions.json','../public/assets/*-people.json','../public/assets/*-day-animations.json','../public/assets/*-night-animations.json'], { eager:true, import:'default' });
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
    for (const kind of ['props','motions','people']) {
      const atlas=readAtlas(`${map.id}-${kind}`);
      const metadata=await sharp(new URL(`../public/assets/${map.id}-${kind}.webp`,import.meta.url).pathname).metadata();
      expect(metadata.hasAlpha,`${map.id}-${kind} requires actual alpha`).toBe(true);
      expect(metadata.width).toBe(atlas.meta.size.w);
      expect(metadata.height).toBe(atlas.meta.size.h);
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
    for (let variant=0;variant<4;variant++) {
      const sizes=Array.from({length:4},(_,index)=>people.frames[`person-${variant}-${index}`]?.sourceSize);
      expect(sizes.every(size=>!!size&&size.w===sizes[0].w&&size.h===sizes[0].h)).toBe(true);
    }
    const terrain=await sharp(new URL(`../public/assets/${map.id}-terrain.webp`,import.meta.url).pathname).metadata();
    const preview=await sharp(new URL(`../public/assets/${map.id}-preview.webp`,import.meta.url).pathname).metadata();
    expect([terrain.width,terrain.height]).toEqual([1536,1024]);
    expect([preview.width,preview.height]).toEqual([1536,1024]);
  });
});
