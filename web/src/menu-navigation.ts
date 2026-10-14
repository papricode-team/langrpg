import { escapeHtml as e, icon } from './icons';
import { t } from './i18n';
import type { UiSound } from './ui-sounds';

/**
 * Arrows, WASD, the D-pad or the stick move a selection cursor. Q/E or the bumpers change
 * sections; brackets or triggers change pages. Touch players open a section's page tiles.
 */
export type MenuView = 'menu' | 'quests' | 'story' | 'atlas' | 'journal' | 'character' | 'settings' | 'activities' | 'course';
export type MenuSectionId = 'map' | 'story' | 'learn' | 'you';
export interface MenuSection { readonly id: MenuSectionId; readonly icon: string; readonly label: string; readonly views: readonly MenuView[] }
export type InputMode = 'pointer' | 'keys' | 'pad';
export type Direction = 'up' | 'down' | 'left' | 'right';

export const menuSections: readonly MenuSection[] = [
  { id: 'map', icon: 'compass', get label() { return t('Map'); }, views: ['atlas'] },
  { id: 'story', icon: 'scroll', get label() { return t('Story'); }, views: ['menu', 'quests', 'story'] },
  { id: 'learn', icon: 'book', get label() { return t('Learn'); }, views: ['course', 'journal', 'activities'] },
  { id: 'you', icon: 'shirt', get label() { return t('You'); }, views: ['character', 'settings'] },
];

export function viewLabel(view: MenuView): string {
  return { menu: t('Overview'), quests: t('Quests'), story: t('Discoveries'), atlas: t('Map'), journal: t('Words'), course: t('Course'), activities: t('Activities'), character: t('Character'), settings: t('Settings') }[view];
}

export function sectionOf(view: MenuView): MenuSection {
  return menuSections.find(section => section.views.includes(view)) ?? menuSections[0];
}

/** Remembers the page last open inside each tab, so flipping tabs returns where the player was. */
export class MenuMemory {
  private readonly last = new Map<MenuSectionId, MenuView>();
  remember(view: MenuView): void {
    const section = menuSections.find(section => section.views.includes(view));
    if (section) this.last.set(section.id, view);
  }
  entry(section: MenuSection): MenuView { return this.last.get(section.id) ?? section.views[0]; }
  neighbour(view: MenuView, step: 1 | -1): MenuView {
    const index = menuSections.indexOf(sectionOf(view));
    return this.entry(menuSections[(index + step + menuSections.length) % menuSections.length]);
  }
}

export interface Box { left: number; top: number; right: number; bottom: number }

/**
 * Picks the closest box in a direction. Boxes that overlap the current one across the travel
 * axis win over diagonal ones, so a column of rows moves straight down instead of zig-zagging.
 */
export function nearestInDirection<T>(from: Box, candidates: readonly { item: T; box: Box }[], direction: Direction): T | undefined {
  const vertical = direction === 'up' || direction === 'down';
  const sign = direction === 'down' || direction === 'right' ? 1 : -1;
  const centre = (box: Box) => ({ x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 });
  const origin = centre(from);
  let best: { item: T; score: number } | undefined;
  for (const candidate of candidates) {
    const box = candidate.box, point = centre(box);
    const travel = vertical ? (point.y - origin.y) * sign : (point.x - origin.x) * sign;
    if (travel <= 1) continue;
    // The gap between the facing edges; overlapping boxes still count by their centres.
    const gap = Math.max(0, vertical ? (sign > 0 ? box.top - from.bottom : from.top - box.bottom) : (sign > 0 ? box.left - from.right : from.left - box.right));
    const overlap = vertical ? Math.min(box.right, from.right) - Math.max(box.left, from.left) : Math.min(box.bottom, from.bottom) - Math.max(box.top, from.top);
    const drift = overlap > 0 ? 0 : Math.abs(vertical ? point.x - origin.x : point.y - origin.y);
    const score = gap + travel * .1 + drift * 3;
    if (!best || score < best.score) best = { item: candidate.item, score };
  }
  return best?.item;
}

/** Device hints live inside the section buttons, so they do not add another chrome row. */
export function menuTabsMarkup(view: MenuView, memory: MenuMemory, mode: InputMode): string {
  const active = menuSections.find(section => section.views.includes(view));
  const glyph = (key: string, pad: string) => `<kbd class="menu-tab-glyph" data-key="${e(key)}" data-pad="${e(pad)}" aria-hidden="true" ${mode === 'pointer' ? 'hidden' : ''}>${e(mode === 'pad' ? pad : key)}</kbd>`;
  return menuSections.map((section, index) => `<button class="menu-tab ${section === active ? 'active' : ''}" data-view="${section === active ? view : memory.entry(section)}" data-menu-section="${section.id}" aria-current="${section === active ? 'page' : 'false'}">${index === 0 ? glyph('Q', 'LB') : ''}${icon(section.icon)}<span>${e(section.label)}</span>${index === menuSections.length - 1 ? glyph('E', 'RB') : ''}</button>`).join('');
}

export interface MenuPage { label: string; attributes: string; selected: boolean }
export function menuPagesMarkup(pages: readonly MenuPage[]): string {
  return pages.map(page => `<button class="menu-page ${page.selected ? 'selected' : ''}" ${page.attributes} data-menu-page aria-pressed="${page.selected}"><span>${e(page.label)}</span>${icon('chevron')}</button>`).join('');
}

export interface MenuChromeOptions {
  view: MenuView;
  memory: MenuMemory;
  mode: InputMode;
  pages: readonly MenuPage[];
  /** Phones show either the section's page tiles or a pushed page. */
  pageOpen: boolean;
  offline?: boolean;
}

/** One chrome contract shared by the desktop rail and the phone section hub. */
export function menuChromeMarkup({ view, memory, mode, pages, pageOpen, offline = false }: MenuChromeOptions): string {
  return `<header class="menu-header"><div class="menu-brand"><span class="menu-crest"><img src="/favicon.svg" width="32" height="32" alt="glotworld"/></span><h1 id="menu-title" class="menu-sr-only">${e(viewLabel(view))}</h1></div><nav class="menu-tabs" id="menu-tabs" aria-label="${e(t('Game sections'))}">${menuTabsMarkup(view, memory, mode)}</nav><button class="menu-close" data-view="world" aria-label="${e(t('Return to game'))}">${icon('close')}${offline ? `<span class="connection-dot" role="status" aria-label="${e(t('Offline'))}"></span>` : ''}</button></header><nav class="menu-pages" id="menu-pages" aria-label="${e(t('Pages'))}">${menuPagesMarkup(pages)}</nav><button class="menu-back" id="menu-back" data-menu-back ${pageOpen ? '' : 'hidden'}>${icon('chevron')}<span>${e(t('Back'))}</span></button>`;
}

export interface MenuNavigatorOptions {
  root: HTMLElement;
  /** True while the menu is showing and nothing sits on top of it. */
  isOpen(): boolean;
  /** True while the world would accept the Start button. */
  canOpen(): boolean;
  open(): void;
  close(): void;
  /** Pops a pushed page; returns false when the section hub is already visible. */
  backPage?(): boolean;
  section(step: 1 | -1): void;
  sound(kind: UiSound): void;
  onModeChange(mode: InputMode): void;
}

const focusableSelector = 'button, input, select, textarea, a[href], summary, [tabindex]:not([tabindex="-1"])';
const repeatDelay = 360, repeatRate = 105;
const pad = { a: 0, b: 1, lb: 4, rb: 5, lt: 6, rt: 7, start: 9, up: 12, down: 13, left: 14, right: 15 } as const;

export class MenuNavigator {
  mode: InputMode = 'pointer';
  private frame = 0;
  private held: boolean[] = [];
  private heldDirection: Direction | undefined;
  private nextRepeat = 0;
  private readonly cleanup: (() => void)[] = [];

  constructor(private readonly options: MenuNavigatorOptions) {
    const { root } = options;
    const onPointer = (event: PointerEvent) => { if (event.pointerType !== 'touch' || event.type === 'pointerdown') this.setMode('pointer'); };
    document.addEventListener('pointerdown', onPointer, true);
    document.addEventListener('pointermove', onPointer, true);
    this.cleanup.push(() => { document.removeEventListener('pointerdown', onPointer, true); document.removeEventListener('pointermove', onPointer, true); });
    if (typeof requestAnimationFrame === 'function') this.frame = requestAnimationFrame(this.poll);
  }

  destroy(): void { cancelAnimationFrame(this.frame); this.cleanup.forEach(run => run()); }

  setMode(mode: InputMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.options.root.dataset.input = mode;
    this.options.onModeChange(mode);
  }

  /** Handles a menu keydown. Returns true when the key was consumed. */
  handleKey(event: KeyboardEvent): boolean {
    if (!this.options.isOpen() || event.ctrlKey || event.metaKey || event.altKey) return false;
    const target = event.target as HTMLElement;
    const typing = target.matches('input:not([type="range"]):not([type="checkbox"]):not([type="radio"]),textarea,select') || target.isContentEditable;
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    const direction = ({ ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right' } as Record<string, Direction>)[key];
    if (direction && !(typing && key.length === 1) && !(typing && (direction === 'left' || direction === 'right'))) {
      if ((direction === 'left' || direction === 'right') && target.matches('input[type="range"], [data-nav-horizontal]')) return false;
      this.setMode('keys');
      event.preventDefault();
      this.move(direction);
      return true;
    }
    if (typing) return false;
    if (event.repeat && (key === 'q' || key === 'e' || key === '[' || key === ']')) { event.preventDefault(); return true; }
    if (key === 'q' || key === 'e') { this.setMode('keys'); event.preventDefault(); this.options.section(key === 'e' ? 1 : -1); return true; }
    if (key === '[' || key === ']') { this.setMode('keys'); event.preventDefault(); this.page(key === ']' ? 1 : -1); return true; }
    if (/^[1-9]$/.test(key)) { const page = this.pages()[Number(key) - 1]; if (page) { this.setMode('keys'); event.preventDefault(); this.choosePage(page); return true; } }
    if (key === 'Enter' || key === ' ') { if (target.matches('button, summary, a[href]') && !target.matches('[data-option]')) { this.setMode('keys'); this.options.sound('confirm'); } return false; }
    if (key === 'Tab') this.setMode('keys');
    return false;
  }

  /** One step back: from inside a page to its tab, then out of the menu. Pointer players close at once. */
  back(): void {
    if (this.options.backPage?.()) { this.options.sound('back'); return; }
    const active = document.activeElement as HTMLElement | null;
    if (this.mode !== 'pointer' && active?.closest('.menu-content')) {
      const tab = this.navigationAnchor();
      if (tab) { tab.focus({ preventScroll: true }); this.options.sound('back'); return; }
    }
    this.options.close();
  }

  /** Puts the cursor on the active tab after the page changes. */
  focusTab(): void {
    const tab = this.navigationAnchor();
    tab?.focus({ preventScroll: true });
  }

  page(step: 1 | -1): void {
    const pages = this.pages();
    if (pages.length < 2) return;
    const current = Math.max(0, pages.findIndex(page => page.classList.contains('selected')));
    this.choosePage(pages[(current + step + pages.length) % pages.length]);
  }

  private choosePage(page: HTMLElement): void {
    if (page.classList.contains('selected')) return;
    page.click();
    this.focusTab();
  }

  private pages(): HTMLElement[] { return [...this.options.root.querySelectorAll<HTMLElement>('.menu-page')]; }

  private navigationAnchor(): HTMLElement | undefined {
    return ['.menu-page.selected', '.menu-tab.active'].map(selector => this.options.root.querySelector<HTMLElement>(selector)).find((element): element is HTMLElement => !!element && !element.closest('[hidden],[inert]') && element.getClientRects().length > 0);
  }

  /** Redraws the glyphs that depend on the input device without touching focus. */
  refreshGlyphs(): void {
    this.options.root.querySelectorAll<HTMLElement>('.menu-tab-glyph').forEach(glyph => {
      glyph.hidden = this.mode === 'pointer';
      glyph.textContent = (this.mode === 'pad' ? glyph.dataset.pad : glyph.dataset.key) ?? '';
    });
  }

  private focusables(): HTMLElement[] {
    return [...this.options.root.querySelectorAll<HTMLElement>(focusableSelector)].filter(element => !element.matches(':disabled,[tabindex="-1"]') && !element.closest('[inert],[hidden]') && element.getClientRects().length > 0);
  }

  move(direction: Direction): void {
    const items = this.focusables();
    if (!items.length) return;
    const active = document.activeElement as HTMLElement | null;
    const current = active && items.includes(active) ? active : undefined;
    if (!current) { this.select(this.navigationAnchor() ?? items[0]); return; }
    const box = (element: HTMLElement): Box => element.getBoundingClientRect();
    const next = nearestInDirection(box(current), items.filter(item => item !== current).map(item => ({ item, box: box(item) })), direction);
    if (next) this.select(next);
  }

  private select(element: HTMLElement): void {
    element.focus({ preventScroll: true });
    element.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    this.options.sound('move');
  }

  private readonly poll = (now: number) => {
    this.frame = requestAnimationFrame(this.poll);
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    const gamepad = [...pads].find(item => item?.connected);
    if (!gamepad) { this.held = []; this.heldDirection = undefined; return; }
    const pressed = gamepad.buttons.map(button => button.pressed);
    const edge = (index: number) => pressed[index] && !this.held[index];
    const open = this.options.isOpen();
    const any = pressed.some(Boolean) || gamepad.axes.some(axis => Math.abs(axis) > .5);
    if (any && (open || edge(pad.start))) this.setMode('pad');
    if (!open) {
      if (edge(pad.start) && this.options.canOpen()) this.options.open();
      this.held = pressed; this.heldDirection = undefined;
      return;
    }
    const x = gamepad.axes[0] ?? 0, y = gamepad.axes[1] ?? 0;
    const direction: Direction | undefined = pressed[pad.up] ? 'up' : pressed[pad.down] ? 'down' : pressed[pad.left] ? 'left' : pressed[pad.right] ? 'right'
      : Math.hypot(x, y) < .55 ? undefined : Math.abs(x) > Math.abs(y) ? (x > 0 ? 'right' : 'left') : (y > 0 ? 'down' : 'up');
    if (direction !== this.heldDirection) { this.heldDirection = direction; this.nextRepeat = now + repeatDelay; if (direction) this.padDirection(direction); }
    else if (direction && now >= this.nextRepeat) { this.nextRepeat = now + repeatRate; this.padDirection(direction); }
    if (edge(pad.a)) { const active = document.activeElement as HTMLElement | null; if (active && this.options.root.contains(active)) { if (!active.matches('[data-option]')) this.options.sound('confirm'); active.click(); } else this.move('down'); }
    else if (edge(pad.b)) this.back();
    else if (edge(pad.start)) this.options.close();
    else if (edge(pad.lb) || edge(pad.rb)) this.options.section(edge(pad.rb) ? 1 : -1);
    else if (edge(pad.lt) || edge(pad.rt)) this.page(edge(pad.rt) ? 1 : -1);
    this.held = pressed;
  };

  private padDirection(direction: Direction): void {
    const active = document.activeElement as HTMLElement | null;
    if ((direction === 'left' || direction === 'right') && active?.matches('[data-nav-horizontal]') && this.options.root.contains(active)) {
      active.dispatchEvent(new KeyboardEvent('keydown', { key: direction === 'left' ? 'ArrowLeft' : 'ArrowRight', bubbles: true }));
      return;
    }
    this.move(direction);
  }
}
