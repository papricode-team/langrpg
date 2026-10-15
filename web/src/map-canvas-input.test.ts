import {describe, expect, it} from 'vitest';
import {GRID_SIZE, snap, wheelIntent} from './map-canvas-input';

describe('map canvas input', () => {
  it('zooms for a mouse wheel or a pinch and pans for a trackpad scroll', () => {
    expect(wheelIntent({ctrlKey: false, metaKey: false, deltaMode: 0, deltaX: 0, deltaY: 100})).toBe('zoom');
    expect(wheelIntent({ctrlKey: false, metaKey: false, deltaMode: 1, deltaX: 0, deltaY: 3})).toBe('zoom');
    expect(wheelIntent({ctrlKey: true, metaKey: false, deltaMode: 0, deltaX: 0, deltaY: 2.5})).toBe('zoom');
    expect(wheelIntent({ctrlKey: false, metaKey: false, deltaMode: 0, deltaX: 4, deltaY: 12})).toBe('pan');
    expect(wheelIntent({ctrlKey: false, metaKey: false, deltaMode: 0, deltaX: 0, deltaY: 7.5})).toBe('pan');
  });
  it('snaps to the grid', () => {
    expect(snap(GRID_SIZE * 3 + 7)).toBe(GRID_SIZE * 3);
    expect(snap(GRID_SIZE * 3 + 9)).toBe(GRID_SIZE * 4);
  });
});
