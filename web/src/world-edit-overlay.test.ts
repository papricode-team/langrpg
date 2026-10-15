// @vitest-environment happy-dom
import {afterEach,describe,expect,it,vi} from 'vitest';
import {WorldEditOverlay} from './world-edit-overlay';
import type {EditBridge,EditState} from './world-edit-mode';
import {paletteChoices} from './world-edit-catalogue';

const palette = paletteChoices('waldruh');
const initial = (): EditState => ({map: 'waldruh', busy: false, canUndo: false, palette, thumbnails: {}});
let overlay: WorldEditOverlay;
afterEach(() => overlay?.destroy());
const button = (action: string, frame?: string) => document.querySelector<HTMLButtonElement>(`[data-edit="${action}"]${frame ? `[data-frame="${frame}"]` : ''}`)!;
const group = () => document.querySelector<HTMLSelectElement>('[name="catalogue-group"]')!;

describe('object catalogue and selected versions', () => {
  it('opens the catalogue, groups versions, starts placement and cancels', () => {
    const controller = {startPlacing: vi.fn(), cancelPlacing: vi.fn(), deselect: vi.fn()};
    overlay = new WorldEditOverlay();
    overlay.bridge = {controller} as unknown as EditBridge;
    const state = initial(); overlay.state(state);
    button('add').click();
    expect(button('add').getAttribute('aria-expanded')).toBe('true');
    group().value = 'tree'; group().dispatchEvent(new Event('change', {bubbles: true}));
    expect(document.querySelectorAll('[data-edit="place"]')).toHaveLength(5);
    expect(button('place', 'tree-2').textContent?.trim()).toBe('Tree 2');
    button('place', 'tree-2').click();
    const choice = palette.find(choice => choice.frame === 'tree-2')!;
    expect(controller.startPlacing).toHaveBeenCalledWith(choice);
    overlay.state({...state, placing: choice});
    expect(button('place', 'tree-2').getAttribute('aria-pressed')).toBe('true');
    button('cancel-place').click(); expect(controller.cancelPlacing).toHaveBeenCalled();
    overlay.state({...state, busy: true});
    expect(button('place', 'tree-2').disabled).toBe(true);
    overlay.state(state); expect(button('place', 'tree-2').disabled).toBe(false);
  });
  it('offers selected object variants and disables editing during saves and locks', () => {
    const controller = {setVariant: vi.fn()};
    overlay = new WorldEditOverlay(); overlay.bridge = {controller} as unknown as EditBridge;
    const state: EditState = {...initial(), selection: {target: {kind: 'scenery', id: 'a-tree'}, label: 'tree',
      item: {id: 'a-tree', asset: 'tree', frame: 'tree-1', x: 100, y: 100, width: 100}, size: {min: 80, max: 200}, rooms: []}};
    overlay.state(state);
    expect(button('variant', 'tree-1').getAttribute('aria-pressed')).toBe('true');
    button('variant', 'tree-3').click(); expect(controller.setVariant).toHaveBeenCalledWith('tree-3');
    overlay.state({...state, busy: true}); expect(button('variant', 'tree-3').disabled).toBe(true);
    overlay.state({...state, selection: {...state.selection!, lockedBy: 'Other admin'}});
    expect(button('variant', 'tree-3').disabled).toBe(true);
    overlay.state(state); expect(button('variant', 'tree-3').disabled).toBe(false);
    expect(document.querySelector('[data-edit="variant"][data-frame="house-1"]')).toBeNull();
  });
  it('keeps the catalogue available in the docked map editor', () => {
    const mount = document.createElement('div'); document.body.append(mount);
    overlay = new WorldEditOverlay({mount}); overlay.state(initial());
    expect(mount.querySelector<HTMLElement>('.world-edit-palette')!.hidden).toBe(false);
    expect(mount.querySelector('[data-edit="add"]')).toBeNull();
    overlay.destroy(); mount.remove();
  });
});
