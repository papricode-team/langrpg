// @vitest-environment happy-dom
import './test-support/phaser-dom';
import { describe, expect, it, vi } from 'vitest';
import { trainFraming } from './world-cinematic';
import { CutsceneScene } from './cutscene';

describe('cutscene framing and beat handoff', () => {
  it('fills the foreground using width and crops tall art instead of shrinking to fit', () => {
    const normal = trainFraming(1536,1024,1280,720,1);
    expect(normal.width).toBeCloseTo(1280*.92);
    expect(normal.height).toBeGreaterThan(720*.7);
    const retina = trainFraming(1536,1024,2560,1440,2);
    expect(retina.width).toBe(1536*1.25);
    expect(retina.cssWidth).toBe(960);
  });
  it('does not present or type the incoming beat before the outgoing fade completes', () => {
    const scene = new CutsceneScene(vi.fn());
    const state = scene as unknown as {beats:unknown[];index:number;dialogue:unknown;changing:boolean;present:()=>void;next:()=>void};
    scene.init(); state.beats=[{},{}]; state.dialogue={};
    const present = vi.fn(), add = vi.fn(); state.present=present;
    Object.assign(scene,{tweens:{killTweensOf:vi.fn(),add}});
    state.next(); expect(present).not.toHaveBeenCalled(); expect(state.index).toBe(0);
    expect(state.changing).toBe(true); state.next(); expect(add).toHaveBeenCalledOnce();
    add.mock.calls[0][0].onComplete();
    expect(state.index).toBe(1); expect(present).toHaveBeenCalledOnce(); expect(state.changing).toBe(false);
  });
});
