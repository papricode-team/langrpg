/** Pointer and wheel rules for the admin map canvas, kept free of Phaser so they can be tested. */
export const GRID_SIZE = 16;

/**
 * A mouse wheel scrolls in whole notches; a trackpad scrolls smoothly and in
 * both directions. A pinch arrives as a wheel event with Ctrl held.
 */
export function wheelIntent(event: Pick<WheelEvent, 'ctrlKey' | 'metaKey' | 'deltaMode' | 'deltaX' | 'deltaY'>): 'zoom' | 'pan' {
  if (event.ctrlKey || event.metaKey || event.deltaMode !== 0) return 'zoom';
  return event.deltaX === 0 && Math.abs(event.deltaY) >= 50 && Number.isInteger(event.deltaY) ? 'zoom' : 'pan';
}
export const snap = (value: number, step = GRID_SIZE): number => Math.round(value / step) * step;
