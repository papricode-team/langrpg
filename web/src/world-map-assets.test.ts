import { describe, expect, it, vi } from 'vitest';
import type * as Phaser from 'phaser';
import { getMap, type MapId, type WorldMapSpec } from './maps';
import { regionAssets, WorldMapAssets } from './world-map-assets';

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
    expect(regionAssets(expedition('saffroncourt')).map(asset => asset.key)).toEqual(['saffroncourt', 'saffroncourt-props', 'saffroncourt-people']);
    expect(regionAssets(getMap('lindenhafen')).map(asset => asset.key)).toEqual(['lindenhafen', 'lindenhafen-props', 'lindenhafen-variations']);
  });
  it('coalesces requests while delivering every arrival callback', () => {
    const mock = fixture(), map = expedition('windplain');
    const first = vi.fn(), second = vi.fn();
    mock.assets.load(map, first); mock.assets.load(map, second);
    expect(mock.loader.image).toHaveBeenCalledTimes(1);
    expect(mock.loader.atlas).toHaveBeenCalledTimes(2);
    expect(mock.loader.start).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
    mock.complete();
    expect(first).toHaveBeenCalledTimes(1); expect(second).toHaveBeenCalledTimes(1);
    const cached = vi.fn(); mock.assets.load(map, cached);
    expect(cached).toHaveBeenCalledOnce(); expect(mock.loader.atlas).toHaveBeenCalledTimes(2);
  });
  it('reclaims a departed destination after its in-flight load completes', () => {
    const mock = fixture(), oldMap = expedition('rainmarket'), newMap = expedition('cedarbay');
    mock.assets.load(oldMap, () => mock.assets.release(oldMap));
    expect(mock.assets.release(oldMap)).toBe(false);
    mock.assets.load(newMap);
    mock.complete();
    expect([...mock.textures]).toEqual(['cedarbay', 'cedarbay-props', 'cedarbay-people']);
    expect(mock.remove.mock.calls.map(call => call[0])).toEqual(['rainmarket', 'rainmarket-props', 'rainmarket-people']);
  });
  it('does not start the loader during Phaser preload', () => {
    const mock = fixture(); mock.assets.load(getMap('lindenhafen'), undefined, false);
    expect(mock.loader.start).not.toHaveBeenCalled();
    mock.complete();
    expect(mock.assets.release(getMap('lindenhafen'))).toBe(true);
    expect(mock.textures.size).toBe(0);
  });
});
