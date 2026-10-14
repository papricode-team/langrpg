// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MenuMemory, MenuNavigator, menuChromeMarkup, menuPagesMarkup, menuSections, menuTabsMarkup, nearestInDirection, sectionOf, type Box } from './menu-navigation';

const box = (left: number, top: number, width = 100, height = 40): Box => ({ left, top, right: left + width, bottom: top + height });

describe('menu sections', () => {
  it('places every menu page in Map, Story, Learn or You', () => {
    expect(menuSections.map(section => section.id)).toEqual(['map', 'story', 'learn', 'you']);
    expect(menuSections.flatMap(section => section.views).sort()).toEqual(['activities', 'atlas', 'character', 'course', 'journal', 'menu', 'quests', 'settings', 'story']);
    expect(sectionOf('atlas').id).toBe('map');
    expect(sectionOf('course').id).toBe('learn');
  });

  it('returns to the last page of a tab and wraps at the ends', () => {
    const memory = new MenuMemory();
    expect(memory.neighbour('menu', 1)).toBe('course');
    expect(memory.neighbour('menu', -1)).toBe('atlas');
    memory.remember('course');
    expect(memory.neighbour('menu', 1)).toBe('course');
    memory.remember('atlas');
    expect(menuTabsMarkup('atlas', memory, 'keys')).toContain('class="menu-tab active" data-view="atlas"');
    expect(memory.neighbour('settings', 1)).toBe('atlas');
  });

  it('marks the active tab and gives the other tabs their remembered page', () => {
    const memory = new MenuMemory(); memory.remember('story');
    const markup = menuTabsMarkup('course', memory, 'pad');
    expect(markup).toContain('class="menu-tab active" data-view="course"');
    expect(markup).toContain('data-view="story" data-menu-section="story"');
    expect(markup).toContain('>LB<');
  });

  it('keeps page navigation usable when a section has only one page', () => {
    const markup = menuPagesMarkup([{ label: 'Map', attributes: 'data-view="atlas"', selected: true }]);
    expect(markup).toContain('data-view="atlas"');
    expect(markup).toContain('data-menu-page');
    expect(markup).not.toContain('<small');
    expect(markup).not.toContain('<kbd');
  });

  it('renders one chrome header, one back control and an offline dot', () => {
    document.body.innerHTML = menuChromeMarkup({ view: 'menu', memory: new MenuMemory(), mode: 'pointer', pages: [{ label: 'Overview', attributes: 'data-view="menu"', selected: true }], pageOpen: true, offline: true });
    expect(document.querySelectorAll('.menu-header').length).toBe(1);
    expect(document.querySelectorAll('.menu-tab').length).toBe(4);
    expect(document.querySelectorAll('[data-menu-back]').length).toBe(1);
    expect(document.querySelector('.menu-back')!.hasAttribute('hidden')).toBe(false);
    expect(document.querySelector('.connection-dot')!.getAttribute('aria-label')).toBe('Offline');
    expect([...document.querySelectorAll('.menu-tab-glyph')].every(glyph => glyph.hasAttribute('hidden') && glyph.closest('.menu-tab'))).toBe(true);
    expect(document.querySelector('.menu-prompts,.menu-footer,.menu-kicker')).toBeNull();
    document.body.innerHTML = menuChromeMarkup({ view: 'atlas', memory: new MenuMemory(), mode: 'keys', pages: [], pageOpen: false });
    expect(document.querySelector('.menu-back')!.hasAttribute('hidden')).toBe(true);
    expect([...document.querySelectorAll('.menu-tab-glyph')].every(glyph => !glyph.hasAttribute('hidden'))).toBe(true);
  });
});

describe('nearestInDirection', () => {
  const grid = [{ item: 'a', box: box(0, 0) }, { item: 'b', box: box(120, 0) }, { item: 'c', box: box(0, 60) }, { item: 'd', box: box(120, 60) }, { item: 'wide', box: box(0, 120, 220) }];
  it('moves straight before moving diagonally', () => {
    expect(nearestInDirection(box(0, 0), grid.filter(c => c.item !== 'a'), 'down')).toBe('c');
    expect(nearestInDirection(box(0, 0), grid.filter(c => c.item !== 'a'), 'right')).toBe('b');
    expect(nearestInDirection(box(120, 60), grid.filter(c => c.item !== 'd'), 'down')).toBe('wide');
    expect(nearestInDirection(box(0, 120, 220), grid.filter(c => c.item !== 'wide'), 'up')).toBe('c');
  });
  it('finds nothing past the edge', () => {
    expect(nearestInDirection(box(0, 0), grid.filter(c => c.item !== 'a'), 'up')).toBeUndefined();
  });
});

describe('MenuNavigator', () => {
  let navigator: MenuNavigator | undefined;
  afterEach(() => { navigator?.destroy(); navigator = undefined; document.body.replaceChildren(); });

  function mount(open = true) {
    document.body.innerHTML = `<div id="menu"><nav><button class="menu-tab active" id="tab">Tab</button></nav><nav><button class="menu-page selected" id="p1">One</button><button class="menu-page" id="p2">Two</button></nav><div class="menu-content"><button id="first">First</button><button id="second">Second</button><button id="arrow" tabindex="-1">◀</button><input id="search"></div></div>`;
    const positions: Record<string, Box> = { tab: box(0, 0), p1: box(0, 50), p2: box(120, 50), first: box(0, 100), second: box(0, 150), arrow: box(0, 175, 20, 20), search: box(0, 200) };
    for (const [id, rect] of Object.entries(positions)) {
      const element = document.getElementById(id)!;
      element.getBoundingClientRect = () => ({ ...rect, x: rect.left, y: rect.top, width: rect.right - rect.left, height: rect.bottom - rect.top, toJSON: () => rect }) as DOMRect;
      element.getClientRects = () => [element.getBoundingClientRect()] as unknown as DOMRectList;
    }
    const calls = { close: 0, section: [] as number[], sounds: [] as string[], modes: [] as string[] };
    navigator = new MenuNavigator({ root: document.getElementById('menu')!, isOpen: () => open, canOpen: () => true, open: () => undefined, close: () => { calls.close++; }, section: step => calls.section.push(step), sound: kind => calls.sounds.push(kind), onModeChange: mode => calls.modes.push(mode) });
    return calls;
  }
  const key = (key: string, target: Element = document.activeElement ?? document.body) => { const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }); Object.defineProperty(event, 'target', { value: target }); return navigator!.handleKey(event); };

  it('moves the cursor with arrows and WASD, starting on the active page', () => {
    const calls = mount();
    expect(key('ArrowDown')).toBe(true);
    expect(document.activeElement?.id).toBe('p1');
    key('s'); expect(document.activeElement?.id).toBe('first');
    key('ArrowDown'); expect(document.activeElement?.id).toBe('second');
    key('ArrowDown'); expect(document.activeElement?.id).toBe('search');
    key('ArrowUp', document.activeElement!); expect(document.activeElement?.id).toBe('second');
    key('w'); key('w'); key('ArrowRight'); expect(document.activeElement?.id).toBe('p2');
    expect(calls.sounds.filter(sound => sound === 'move').length).toBeGreaterThan(3);
    expect(calls.modes).toEqual(['keys']);
  });

  it('flips tabs with Q and E and pages with brackets or numbers', () => {
    const calls = mount();
    const second = vi.fn(); document.getElementById('p2')!.addEventListener('click', second);
    key('e'); key('q');
    expect(calls.section).toEqual([1, -1]);
    key(']'); expect(second).toHaveBeenCalledTimes(1);
    key('2'); expect(second).toHaveBeenCalledTimes(2);
  });

  it('leaves typing alone', () => {
    mount();
    const search = document.getElementById('search')!; search.focus();
    expect(key('w', search)).toBe(false);
    expect(key('e', search)).toBe(false);
  });

  it('starts on the visible section tab when the phone page rail is hidden', () => {
    mount();
    document.getElementById('p1')!.getClientRects = () => [] as unknown as DOMRectList;
    document.getElementById('p2')!.getClientRects = () => [] as unknown as DOMRectList;
    key('ArrowDown');
    expect(document.activeElement?.id).toBe('tab');
    navigator!.focusTab();
    expect(document.activeElement?.id).toBe('tab');
  });

  it('steps back to the tab bar before closing', () => {
    const calls = mount();
    key('ArrowDown'); key('ArrowDown');
    navigator!.back();
    expect(document.activeElement?.id).toBe('p1');
    expect(calls.close).toBe(0);
    navigator!.back();
    expect(calls.close).toBe(1);
  });

  it('ignores keys while the menu is closed', () => {
    mount(false);
    expect(key('ArrowDown')).toBe(false);
  });

  it('pops a pushed page before closing the menu', () => {
    let pageOpen = true;
    const close = vi.fn();
    const backPage = vi.fn(() => { if (!pageOpen) return false; pageOpen = false; return true; });
    const root = document.createElement('div'); document.body.append(root);
    navigator = new MenuNavigator({ root, isOpen: () => true, canOpen: () => true, open: () => undefined, close, backPage, section: () => undefined, sound: () => undefined, onModeChange: () => undefined });
    navigator.back();
    expect(pageOpen).toBe(false);
    expect(close).not.toHaveBeenCalled();
    navigator.back();
    expect(close).toHaveBeenCalledOnce();
  });

  it('drives the menu from a controller: Start opens, the D-pad moves, A selects, B backs out', () => {
    let frame: FrameRequestCallback | undefined;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frame = callback; return 1; });
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    const buttons = Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 }));
    const pad = { connected: true, axes: [0, 0, 0, 0], buttons } as unknown as Gamepad;
    Object.defineProperty(globalThis.navigator, 'getGamepads', { configurable: true, value: () => [pad] });
    let open = false, opened = 0;
    document.body.innerHTML = `<div id="menu"><button class="menu-tab active" id="tab">Tab</button><div class="menu-content"><button id="row">Row</button></div></div>`;
    const rects: Record<string, Box> = { tab: box(0, 0), row: box(0, 60) };
    for (const [id, rect] of Object.entries(rects)) { const element = document.getElementById(id)!; element.getBoundingClientRect = () => rect as DOMRect; element.getClientRects = () => [rect] as unknown as DOMRectList; }
    const row = vi.fn(); document.getElementById('row')!.addEventListener('click', row);
    let closed = 0; const sections: number[] = [];
    const padNavigator = new MenuNavigator({ root: document.getElementById('menu')!, isOpen: () => open, canOpen: () => true, open: () => { open = true; opened++; }, close: () => { closed++; open = false; }, section: step => sections.push(step), sound: () => undefined, onModeChange: () => undefined });
    let now = 0;
    const tick = (...pressed: number[]) => { buttons.forEach((button, index) => { button.pressed = pressed.includes(index); }); now += 16; frame!(now); };
    tick(9); expect(opened).toBe(1);
    tick(); tick(13); expect(document.activeElement?.id).toBe('tab');
    tick(); tick(13); expect(document.activeElement?.id).toBe('row');
    tick(); tick(0); expect(row).toHaveBeenCalledTimes(1);
    tick(); tick(5); expect(sections).toEqual([1]);
    tick(); tick(1); expect(document.activeElement?.id).toBe('tab'); expect(closed).toBe(0);
    tick(); tick(1); expect(closed).toBe(1);
    padNavigator.destroy();
    vi.unstubAllGlobals();
  });
});
