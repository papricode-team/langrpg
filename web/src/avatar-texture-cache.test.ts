import { describe, expect, it, vi } from 'vitest';
import { AvatarTextureCache } from './avatar-texture-cache';

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
};

describe('avatar texture ownership and eviction', () => {
  it('acquires ready textures synchronously and pins them across scene handoffs', async () => {
    const destroy = vi.fn(), cache = new AvatarTextureCache<string>(destroy, 1), pending = deferred<string>();
    expect(cache.acquireReady('avatar')).toBeUndefined();
    const loading = cache.acquire('avatar', () => pending.promise);
    expect(cache.acquireReady('avatar')).toBeUndefined();
    pending.resolve('avatar');
    const original = await loading, nextScene = cache.acquireReady('avatar')!;
    original.release(true);
    expect(nextScene.value).toBe('avatar');
    expect(destroy).not.toHaveBeenCalled();
    (await cache.acquire('another', async () => 'another')).release();
    expect(destroy).toHaveBeenCalledExactlyOnceWith('another');
    nextScene.release(); nextScene.release();
    expect(cache.snapshot()).toEqual({ total: 1, active: 0, pending: 0 });
    cache.dispose();
    expect(cache.acquireReady('avatar')).toBeUndefined();
    expect(destroy).toHaveBeenLastCalledWith('avatar');
  });

  it('bounds retained bytes even below the entry limit without invalidating live sprites', async () => {
    const destroy = vi.fn(), cache = new AvatarTextureCache<{bytes:number}>(destroy,32,{maxBytes:100,sizeOf:value=>value.bytes});
    const a=await cache.acquire('a',async()=>({bytes:70}));
    a.release();
    const b=await cache.acquire('b',async()=>({bytes:70}));
    expect(destroy).toHaveBeenCalledWith(a.value);
    expect(cache.retainedBytes()).toBe(70);
    const c=await cache.acquire('c',async()=>({bytes:120}));
    expect(cache.retainedBytes()).toBe(190);
    expect(destroy).toHaveBeenCalledTimes(1);
    c.release();
    expect(destroy).toHaveBeenLastCalledWith(c.value);
    expect(cache.retainedBytes()).toBe(70);
    b.release();cache.dispose();expect(cache.retainedBytes()).toBe(0);
  });

  it('destroys a result whose memory measurement fails validation', async () => {
    const destroy=vi.fn(),cache=new AvatarTextureCache<string>(destroy,32,{maxBytes:100,sizeOf:()=>NaN});
    await expect(cache.acquire('bad',async()=>'bad')).rejects.toThrow('byte size');
    expect(destroy).toHaveBeenCalledExactlyOnceWith('bad');expect(cache.snapshot().total).toBe(0);
  });
  it('deduplicates concurrent baking and keeps shared live textures pinned', async () => {
    const destroy = vi.fn(), cache = new AvatarTextureCache<string>(destroy, 1), pending = deferred<string>();
    const create = vi.fn(() => pending.promise);
    const a = cache.acquire('same', create), b = cache.acquire('same', create);
    await Promise.resolve(); expect(create).toHaveBeenCalledTimes(1);
    pending.resolve('same'); const [first, second] = await Promise.all([a, b]);
    const third = await cache.acquire('new', async () => 'new');
    first.release(); first.release(); expect(destroy).not.toHaveBeenCalled();
    expect(cache.snapshot()).toEqual({ total: 2, active: 2, pending: 0 });
    second.release(); expect(destroy).toHaveBeenCalledExactlyOnceWith('same');
    third.release(); expect(cache.snapshot()).toEqual({ total: 1, active: 0, pending: 0 });
  });

  it('evicts the least recently used idle recipe and retries failed bakes', async () => {
    const destroy = vi.fn(), cache = new AvatarTextureCache<string>(destroy, 2);
    (await cache.acquire('a', async () => 'a')).release();
    (await cache.acquire('b', async () => 'b')).release();
    (await cache.acquire('a', async () => { throw Error('must reuse'); })).release();
    (await cache.acquire('c', async () => 'c')).release();
    expect(destroy).toHaveBeenCalledExactlyOnceWith('b');
    await expect(cache.acquire('fail', async () => { throw Error('fetch failed'); })).rejects.toThrow('fetch failed');
    (await cache.acquire('fail', async () => 'recovered')).release();
    expect(cache.snapshot()).toEqual({ total: 2, active: 0, pending: 0 });
  });

  it('cleans both ready and late results on shutdown without resurrecting entries', async () => {
    const destroy = vi.fn(), cache = new AvatarTextureCache<string>(destroy), pending = deferred<string>();
    const ready = await cache.acquire('ready', async () => 'ready');
    const late = cache.acquire('pending', () => pending.promise);
    await Promise.resolve(); cache.dispose(); cache.dispose();
    expect(destroy).toHaveBeenCalledExactlyOnceWith('ready');
    pending.resolve('late'); await expect(late).rejects.toThrow('disposed');
    expect(destroy.mock.calls).toEqual([['ready'], ['late']]);
    ready.release(); expect(destroy).toHaveBeenCalledTimes(2);
    expect(cache.snapshot().total).toBe(0);
    await expect(cache.acquire('another', async () => 'another')).rejects.toThrow('disposed');
  });

  it('does not start queued work after disposal', async () => {
    const cache = new AvatarTextureCache(vi.fn()), create = vi.fn(async () => 'unneeded');
    const result = cache.acquire('queued', create); cache.dispose();
    await expect(result).rejects.toThrow('disposed'); expect(create).not.toHaveBeenCalled();
  });

  it('evicts departed players immediately once the final shared owner leaves', async () => {
    const destroy = vi.fn(), cache = new AvatarTextureCache<string>(destroy);
    const a = await cache.acquire('shared', async () => 'shared');
    const b = await cache.acquire('shared', async () => 'unused');
    a.release(true); expect(destroy).not.toHaveBeenCalled();
    b.release(true); expect(destroy).toHaveBeenCalledExactlyOnceWith('shared');
    expect(cache.snapshot().total).toBe(0);
  });
});
