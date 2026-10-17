import { describe, expect, it, vi } from 'vitest';
import type * as Phaser from 'phaser';
import { fadeWorldOut, loadWorldUi, waitForWorldUi, WORLD_UI } from './world-ui';
import { EventEmitter } from 'node:events';

describe('shared world texture queues', () => {
  it('reserves image and atlas keys across concurrent scene loaders and waits for their owner', async () => {
    const keys = new Set<string>(), textures = {exists:(key:string) => keys.has(key)};
    const loader = () => Object.assign(new EventEmitter(), {scene:{textures,events:new EventEmitter()}, image:vi.fn(), atlas:vi.fn()});
    const owner = loader(), other = loader();
    const first = loadWorldUi(owner as unknown as Phaser.Loader.LoaderPlugin);
    let ready = false;
    const second = loadWorldUi(other as unknown as Phaser.Loader.LoaderPlugin).then(() => {ready=true;});
    expect(owner.image).toHaveBeenCalledTimes(Object.keys(WORLD_UI).length); expect(owner.atlas).toHaveBeenCalledOnce();
    expect(owner.image).toHaveBeenCalledWith('world-prompt', '/assets/ui/world-prompt.webp');
    expect(owner.image).toHaveBeenCalledWith(WORLD_UI.promptTouch, '/assets/ui/world-prompt-v2-touch.webp');
    expect(other.image).not.toHaveBeenCalled(); expect(other.atlas).not.toHaveBeenCalled();
    other.emit('complete'); await Promise.resolve(); expect(ready).toBe(false);
    for (const key of [...Object.values(WORLD_UI),'world-held-items']) {
      keys.add(key); owner.emit('filecomplete',key);
    }
    await Promise.all([first,second,waitForWorldUi(textures as Phaser.Textures.TextureManager)]);
    expect(ready).toBe(true); expect(owner.listenerCount('filecomplete')).toBe(0);
  });

  it('releases failed or abandoned reservations for a later scene retry without blocking create', async () => {
    const textures = {exists:() => false};
    const owner = Object.assign(new EventEmitter(), {scene:{textures,events:new EventEmitter()},image:vi.fn(),atlas:vi.fn()});
    const pending = loadWorldUi(owner as unknown as Phaser.Loader.LoaderPlugin);
    owner.scene.events.emit('shutdown'); await pending;
    await waitForWorldUi(textures as unknown as Phaser.Textures.TextureManager);
    const retry = loadWorldUi(owner as unknown as Phaser.Loader.LoaderPlugin);
    expect(owner.image).toHaveBeenCalledTimes(Object.keys(WORLD_UI).length * 2);
    owner.emit('complete'); await retry;
  });
});

describe('door scene handoff', () => {
  it('waits for the outgoing scene clock before handing over', () => {
    const fadeOut = vi.fn(), delayedCall = vi.fn(), complete = vi.fn();
    const scene = {cameras:{main:{fadeOut}}, time:{delayedCall}} as unknown as Phaser.Scene;
    fadeWorldOut(scene, false, complete);
    expect(fadeOut).toHaveBeenCalledWith(160, 29, 35, 30);
    expect(complete).not.toHaveBeenCalled();
    expect(delayedCall).toHaveBeenCalledWith(160, complete);
    delayedCall.mock.calls[0][1]();
    expect(complete).toHaveBeenCalledOnce();
  });

  it('switches immediately for reduced motion or an authoritative instant handoff', () => {
    const complete = vi.fn();
    fadeWorldOut({} as Phaser.Scene, true, complete);
    expect(complete).toHaveBeenCalledOnce();
  });
});
