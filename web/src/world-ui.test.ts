import { describe, expect, it, vi } from 'vitest';
import type * as Phaser from 'phaser';
import { fadeWorldOut } from './world-ui';

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
