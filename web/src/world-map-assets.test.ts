import { describe, expect, it, vi } from 'vitest';
import type * as Phaser from 'phaser';
import { getMap, type MapId, type WorldMapSpec } from './maps';
import { regionAssets, regionPeopleFrames, regionPeopleKey, WorldMapAssets } from './world-map-assets';

const expedition = (id: string): WorldMapSpec => ({
  ...getMap('lindenhafen'), id: id as MapId,
  asset: `/assets/${id}-terrain.webp`,
  sceneryAsset: `/assets/${id}-props.webp`, sceneryAtlas: `/assets/${id}-props.json`,
  variationAsset: `/assets/${id}-props.webp`, variationAtlas: `/assets/${id}-props.json`,
});
function fixture() {
  const textures = new Set<string>();
  const queued: string[] = [];
  let listeners: (() => void)[] = [];
  let loading = false;
  const loader = {
    image: vi.fn((key: string) => { queued.push(key); }),
    atlas: vi.fn((key: string) => { queued.push(key); }),
    once: vi.fn((_event: string, callback: () => void) => { listeners.push(callback); }),
    start: vi.fn(() => { loading = true; }),
    isLoading: () => loading,
  };
  const remove = vi.fn((key: string) => { textures.delete(key); });
  const scene = { load: loader, textures: { exists: (key: string) => textures.has(key), remove } } as unknown as Phaser.Scene;
  return { assets: new WorldMapAssets(scene), textures, queued, loader, remove,
    complete() { for (const key of queued.splice(0)) textures.add(key); loading = false; const callbacks = listeners; listeners = []; for (const callback of callbacks) callback(); },
  };
}

describe('destination asset streaming', () => {
  it('loads only terrain, local props and local people for an expedition', () => {
    expect(regionAssets(expedition('saffroncourt')).map(asset => asset.key)).toEqual(['saffroncourt', 'saffroncourt-props', 'saffroncourt-people', 'saffroncourt-people-1', 'saffroncourt-people-2']);
    expect(regionAssets(getMap('lindenhafen')).map(asset => asset.key)).toEqual(['lindenhafen', 'lindenhafen-props', 'lindenhafen-variations']);
  });
  it('coalesces requests while delivering every arrival callback', () => {
    const mock = fixture(), map = expedition('windplain');
    const first = vi.fn(), second = vi.fn();
    mock.assets.load(map, first); mock.assets.load(map, second);
    expect(mock.loader.image).toHaveBeenCalledTimes(1);
    expect(mock.loader.atlas).toHaveBeenCalledTimes(4);
    expect(mock.loader.start).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
    mock.complete();
    expect(first).toHaveBeenCalledTimes(1); expect(second).toHaveBeenCalledTimes(1);
    const cached = vi.fn(); mock.assets.load(map, cached);
    expect(cached).toHaveBeenCalledOnce(); expect(mock.loader.atlas).toHaveBeenCalledTimes(4);
  });
  it('reclaims a departed destination after its in-flight load completes', () => {
    const mock = fixture(), oldMap = expedition('rainmarket'), newMap = expedition('cedarbay');
    mock.assets.load(oldMap, () => mock.assets.release(oldMap));
    expect(mock.assets.release(oldMap)).toBe(false);
    mock.assets.load(newMap);
    mock.complete();
    expect([...mock.textures]).toEqual(['cedarbay', 'cedarbay-props', 'cedarbay-people', 'cedarbay-people-1', 'cedarbay-people-2']);
    expect(mock.remove.mock.calls.map(call => call[0])).toEqual(['rainmarket', 'rainmarket-props', 'rainmarket-people', 'rainmarket-people-1', 'rainmarket-people-2']);
  });
  it('does not start the loader during Phaser preload', () => {
    const mock = fixture(); mock.assets.load(getMap('lindenhafen'), undefined, false);
    expect(mock.loader.start).not.toHaveBeenCalled();
    mock.complete();
    expect(mock.assets.release(getMap('lindenhafen'))).toBe(true);
    expect(mock.textures.size).toBe(0);
  });

  it('reloads only a missing character page before declaring the destination ready', () => {
    const mock = fixture(), map = expedition('riverweave');
    for (const asset of regionAssets(map)) mock.textures.add(asset.key);
    mock.textures.delete('riverweave-people-2');
    const ready = vi.fn();
    mock.assets.load(map, ready);
    expect(mock.queued).toEqual(['riverweave-people-2']);
    expect(ready).not.toHaveBeenCalled();
    mock.complete();
    expect(ready).toHaveBeenCalledOnce();
    mock.assets.release(map);
    expect(mock.textures.size).toBe(0);
  });
});

describe('stable regional character identities', () => {
  it('resolves each global identity to one page and four exclusive animation frames', () => {
    const bindings = Array.from({ length: 16 }, (_, variant) => ({
      key: regionPeopleKey('cedarbay', variant), frames: regionPeopleFrames(variant),
    }));
    expect(bindings.map(binding => binding.key)).toEqual([
      ...Array(4).fill('cedarbay-people'), ...Array(6).fill('cedarbay-people-1'), ...Array(6).fill('cedarbay-people-2'),
    ]);
    expect(new Set(bindings.flatMap(binding => binding.frames.map(frame => `${binding.key}:${frame}`))).size).toBe(64);
    expect(bindings[15].frames).toEqual(['person-15-0', 'person-15-1', 'person-15-2', 'person-15-3']);
    for (const invalid of [-1, 16, 1.5, NaN]) {
      expect(() => regionPeopleKey('cedarbay', invalid)).toThrow(RangeError);
      expect(() => regionPeopleFrames(invalid)).toThrow(RangeError);
    }
  });
});
