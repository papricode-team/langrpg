// @vitest-environment happy-dom
import './test-support/phaser-dom';
import * as Phaser from 'phaser';
import { describe, expect, it, vi } from 'vitest';
import { loadWorldFonts, refreshWorldFonts } from './world-fonts';

describe('canvas web fonts', () => {
  it('requests every canvas face and waits for the font set before resolving', async () => {
    let ready!: () => void;
    const load = vi.fn(() => Promise.resolve([]));
    Object.defineProperty(document, 'fonts', {configurable:true, value:{load, ready:new Promise<void>(resolve => { ready = resolve; })}});
    let complete = false;
    const pending = loadWorldFonts().then(() => { complete = true; });
    await Promise.resolve(); await Promise.resolve();
    expect(load.mock.calls).toHaveLength(4);
    expect(complete).toBe(false);
    ready(); await pending;
    expect(complete).toBe(true);
    await loadWorldFonts();
    expect(load).toHaveBeenCalledTimes(4);
  });

  it('refreshes text after fonts settle and never redraws a shut-down scene', async () => {
    const text = Object.create(Phaser.GameObjects.Text.prototype) as Phaser.GameObjects.Text;
    const update = vi.fn(() => text);
    text.style = {update} as unknown as Phaser.GameObjects.TextStyle;
    const events = new Phaser.Events.EventEmitter();
    const scene = {events, children:{list:[text]}} as unknown as Phaser.Scene;
    refreshWorldFonts(scene); await Promise.resolve();
    expect(update).toHaveBeenCalledWith(true);
    expect(update).toHaveBeenCalledOnce();
    refreshWorldFonts(scene);
    events.emit(Phaser.Scenes.Events.SHUTDOWN);
    await Promise.resolve();
    expect(update).toHaveBeenCalledOnce();
  });
});
