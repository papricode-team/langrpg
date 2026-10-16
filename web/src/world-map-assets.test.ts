import { describe, expect, it, vi } from 'vitest';
import type * as Phaser from 'phaser';
import { getMap, type MapId } from './maps';
import { regionAssets, regionPeopleFrames, regionPeopleKey, WorldMapAssets } from './world-map-assets';
import {castActorsForMap,castAssetUrl,castAtlasUrl,castAssets} from './character-cast';

function fixture() {
  const textures = new Set<string>();
  const queued: string[] = [];
  let listeners: (() => void)[] = [];
  let loading = false;
  const loader = {
    image: vi.fn((key: string) => { queued.push(key); }),
    atlas: vi.fn((key: string) => { queued.push(key); }),
    multiatlas: vi.fn((key: string) => { queued.push(key); }),
    spritesheet: vi.fn((key:string)=>{queued.push(key);}),
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
  it('bypasses atlas copies cached by an earlier deployment', () => {
    const mock = fixture();
    mock.assets.load(getMap('waldruh'));
    expect(mock.loader.atlas).toHaveBeenCalledWith('waldruh-props', `/assets/waldruh-props.webp?v=${__APP_VERSION__}`, `/assets/waldruh-props.json?v=${__APP_VERSION__}`);
  });
  it('loads the town props and authored resident activities', () => {
    expect(regionAssets(getMap('lindenhafen')).map(asset => asset.key)).toEqual(['lindenhafen-props', 'lindenhafen-variations',...['ella','karl','anne','mila'].map(look=>`lindenhafen-resident-actions-${look}`),...castActorsForMap('lindenhafen').flatMap(actor=>castAssets(actor).map(asset=>asset.key))]);
  });
  it('coalesces requests while delivering every arrival callback', () => {
    const mock = fixture(), map = getMap('lindenhafen');
    const first = vi.fn(), second = vi.fn();
    mock.assets.load(map, first); mock.assets.load(map, second);
    expect(mock.loader.image).toHaveBeenCalledTimes(regionAssets(map).filter(asset => !asset.atlas&&!asset.cell&&!asset.multiAtlas).length);
    expect(mock.loader.atlas).toHaveBeenCalledTimes(regionAssets(map).filter(asset => asset.atlas&&!asset.multiAtlas).length);
    expect(mock.loader.multiatlas).toHaveBeenCalledTimes(regionAssets(map).filter(asset => asset.multiAtlas).length);
    expect(mock.loader.start).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
    mock.complete();
    expect(first).toHaveBeenCalledTimes(1); expect(second).toHaveBeenCalledTimes(1);
    const cached = vi.fn(); mock.assets.load(map, cached);
    expect(cached).toHaveBeenCalledOnce(); expect(mock.loader.atlas).toHaveBeenCalledTimes(regionAssets(map).filter(asset => asset.atlas&&!asset.multiAtlas).length);
  });
  it.each(['lindenhafen','waldruh','nebelstadt','saffroncourt','rainmarket','windplain','riverweave','terracielo','sunpatch','kigalights','cedarbay','seoulsteps','dunegarden'] as MapId[])('loads and releases %s cast bakes without releasing the shared main cast',(mapId)=>{
    const mock=fixture(),map=getMap(mapId),shared=castActorsForMap(null)[0];
    mock.textures.add(shared.key);mock.assets.load(map);
    for(const actor of castActorsForMap(map.id))for(const asset of castAssets(actor)){
      if(asset.multiAtlas)expect(mock.loader.multiatlas).toHaveBeenCalledWith(asset.key,castAtlasUrl(asset),'/assets/character-cast/');
      else expect(mock.loader.atlas).toHaveBeenCalledWith(asset.key,castAssetUrl(asset),castAtlasUrl(asset));
    }
    mock.complete();expect(mock.assets.release(map)).toBe(true);
    expect([...mock.textures]).toEqual([shared.key]);
  });
  it('reclaims a departed destination after its in-flight load completes', () => {
    const mock = fixture(), oldMap = getMap('lindenhafen'), newMap = getMap('waldruh');
    mock.assets.load(oldMap, () => mock.assets.release(oldMap));
    expect(mock.assets.release(oldMap)).toBe(false);
    mock.assets.load(newMap);
    mock.complete();
    expect([...mock.textures]).toEqual(regionAssets(newMap).map(asset => asset.key));
    expect(mock.remove.mock.calls.map(call => call[0])).toEqual(regionAssets(oldMap).map(asset => asset.key));
  });
  it('does not start the loader during Phaser preload', () => {
    const mock = fixture(); mock.assets.load(getMap('lindenhafen'), undefined, false);
    expect(mock.loader.start).not.toHaveBeenCalled();
    mock.complete();
    expect(mock.assets.release(getMap('lindenhafen'))).toBe(true);
    expect(mock.textures.size).toBe(0);
  });

  it('reloads only a missing props page before declaring the destination ready', () => {
    const mock = fixture(), map = getMap('waldruh');
    for (const asset of regionAssets(map)) mock.textures.add(asset.key);
    mock.textures.delete('waldruh-props');
    const ready = vi.fn();
    mock.assets.load(map, ready);
    expect(mock.queued).toEqual(['waldruh-props']);
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
