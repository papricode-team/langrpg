import { describe, expect, it, vi } from 'vitest';
import type * as Phaser from 'phaser';
import { WorldAnimationAssets } from './world-animation-assets';
import type { SceneryAnimationManifest } from './scenery-animation';

const manifest = (period: string): SceneryAnimationManifest => ({
  version: 3, framesPerAsset: 2, terrain: `waldruh-${period}-terrain`, assets: {
    tree: { key: `waldruh-${period}-trees`, frames: ['tree-0','tree-1'], fps: 1, width: 120, height: 160, referenceWidth: 120, originX: .5, originY: 1 },
    house: { key: 'unused-house-motion', frames: ['house'], fps: 0, width: 120, height: 160, referenceWidth: 120, originX: .5, originY: 1,
      base: {key: `waldruh-${period}-houses`, frame: 'house'}, overlays: [
        {id:'smoke', key:'shared-smoke', frames:['smoke-0','smoke-1'], fps:1, width:40,height:40,referenceWidth:120,originX:.5,originY:.5,offsetX:0,offsetY:-100},
      ] },
  },
});

function fixture() {
  const textures = new Set<string>(), cache = new Map<string, SceneryAnimationManifest>();
  const queued: {key:string;type:string}[] = [];
  const events = new Map<string, ((...args: any[]) => void)[]>();
  let loading = false;
  const emit = (event: string, ...args: any[]) => {
    const callbacks = events.get(event) ?? [];
    events.delete(event);
    for (const callback of callbacks) callback(...args);
  };
  const loader = {
    atlas: vi.fn((key:string) => {queued.push({key,type:'atlas'});}),
    image: vi.fn((key:string) => {queued.push({key,type:'image'});}),
    json: vi.fn((key:string) => {queued.push({key,type:'json'});}),
    once: (event:string, callback:(...args:any[])=>void) => events.set(event,[...(events.get(event)??[]),callback]),
    off: (event:string, callback:(...args:any[])=>void) => events.set(event,(events.get(event)??[]).filter(fn=>fn!==callback)),
    start: vi.fn(() => {loading = true;}), isLoading: () => loading,
  };
  const scene = {load:loader,cache:{json:{get:(key:string)=>cache.get(key)}},textures:{exists:(key:string)=>textures.has(key)}} as unknown as Phaser.Scene;
  return {assets:new WorldAnimationAssets(scene),textures,cache,queued,loader,events,
    manifestLoaded(period: string) {
      const key = `waldruh-${period}-animations`, data = manifest(period);
      queued.splice(queued.findIndex(file=>file.key===key),1);
      cache.set(key,data); emit(`filecomplete-json-${key}`,key,'json',data);
    },
    async complete(failed: string[] = []) {
      for (const file of queued.splice(0)) if (file.type !== 'json' && !failed.includes(file.key)) textures.add(file.key);
      loading = false; emit('complete');
      await Promise.resolve();
    },
  };
}

describe('day/night asset streaming', () => {
  it('coalesces preload requests and waits for every base, overlay and terrain', async () => {
    const mock = fixture(), first = vi.fn(), second = vi.fn();
    mock.assets.load('waldruh','night',first,false);
    mock.assets.load('waldruh','night',second,false);
    expect(mock.loader.start).not.toHaveBeenCalled();
    expect(mock.loader.json).toHaveBeenCalledOnce();
    mock.manifestLoaded('night');
    expect(mock.queued.map(file=>file.key)).toEqual(['waldruh-night-trees','waldruh-night-houses','shared-smoke','waldruh-night-terrain']);
    expect(first).not.toHaveBeenCalled();
    await mock.complete();
    expect(first).toHaveBeenCalledExactlyOnceWith(true);
    expect(second).toHaveBeenCalledExactlyOnceWith(true);
    expect(mock.assets.ready('waldruh','night')).toBe(true);
  });

  it('reports a failed page and reloads only that page before allowing the switch', async () => {
    const mock = fixture(), ready = vi.fn();
    mock.assets.load('waldruh','night',ready); mock.manifestLoaded('night');
    await mock.complete(['waldruh-night-houses']);
    expect(ready).toHaveBeenCalledExactlyOnceWith(false);
    expect(mock.assets.ready('waldruh','night')).toBe(false);
    ready.mockClear(); mock.assets.load('waldruh','night',ready);
    expect(mock.queued).toEqual([{key:'waldruh-night-houses',type:'atlas'}]);
    expect(ready).not.toHaveBeenCalled();
    await mock.complete();
    expect(ready).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('requires terrain even after all scenery pages have loaded', async () => {
    const mock = fixture(), ready = vi.fn();
    mock.assets.load('waldruh','day',ready); mock.manifestLoaded('day');
    await mock.complete(['waldruh-day-terrain']);
    expect(ready).toHaveBeenCalledExactlyOnceWith(false);
    mock.assets.load('waldruh','day');
    expect(mock.queued).toEqual([{key:'waldruh-day-terrain',type:'image'}]);
    await mock.complete();
    expect(mock.assets.ready('waldruh','day')).toBe(true);
  });

  it('cleans failed manifest listeners so retries do not enqueue stale work', async () => {
    const mock = fixture(), ready = vi.fn();
    mock.assets.load('waldruh','night',ready);
    await mock.complete();
    expect(ready).toHaveBeenCalledExactlyOnceWith(false);
    expect(mock.events.get('filecomplete-json-waldruh-night-animations')).toHaveLength(0);
    mock.assets.load('waldruh','night'); mock.manifestLoaded('night');
    expect(mock.loader.atlas).toHaveBeenCalledTimes(3);
    await mock.complete();
    expect(mock.assets.ready('waldruh','night')).toBe(true);
  });

  it('keeps a newly queued period separate from the batch that just completed', async () => {
    const mock = fixture(), nightReady = vi.fn();
    mock.assets.load('waldruh','day',() => mock.assets.load('waldruh','night',nightReady));
    mock.manifestLoaded('day'); await mock.complete();
    expect(nightReady).not.toHaveBeenCalled();
    expect(mock.assets.pending('waldruh','night')).toBe(true);
    mock.manifestLoaded('night'); await mock.complete();
    expect(nightReady).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('retains both sides of a fade and shared sheets requested by an in-flight period', async () => {
    const mock = fixture();
    mock.cache.set('waldruh-day-animations',manifest('day'));
    mock.cache.set('waldruh-night-animations',manifest('night'));
    mock.assets.load('waldruh','night');
    const retained = mock.assets.retainedTextures('waldruh','day');
    expect(retained.has('shared-smoke')).toBe(true);
    expect(retained.has('waldruh-night-houses')).toBe(true);
    await mock.complete();
    const fading = mock.assets.retainedTextures('waldruh','night','day');
    expect(fading.has('waldruh-day-houses')).toBe(true);
    expect(fading.has('waldruh-day-terrain')).toBe(true);
    expect(fading.has('waldruh-night-terrain')).toBe(true);
    const finished = mock.assets.retainedTextures('waldruh','night');
    expect(finished.has('waldruh-day-houses')).toBe(false);
    expect(finished.has('shared-smoke')).toBe(true);
    expect(finished.has('waldruh-night-terrain')).toBe(true);
  });
});
