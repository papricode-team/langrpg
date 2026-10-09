import { icon, escapeHtml } from './icons';
import { SCREEN_FILTER_PRESETS, normalizeScreenFilterSettings } from './screen-filter-settings';
import type { ScreenFilterSettings } from './screen-filter-settings';
import './screen-filter-controls.css';

const STORAGE_KEY = 'atlas.screenFilters';
type FilterControl = Exclude<keyof ScreenFilterSettings, 'preset'>;
const controls: { key: FilterControl; label: string; hint: string; min?: number; max?: number; step?: number }[] = [
  { key: 'softness', label: 'Blend edges', hint: 'Soften differences between the painted assets.' },
  { key: 'scanlines', label: 'Screen lines', hint: 'Add the fine horizontal lines of an old television.' },
  { key: 'grain', label: 'Fine texture', hint: 'Give the whole world a shared surface.' },
  { key: 'warmth', label: 'Warmth', hint: 'Bring a warmer tone to the world.' },
  { key: 'vignette', label: 'Edge shade', hint: 'Darken the edges of the screen.' },
  { key: 'pixelSize', label: 'Pixel size', hint: 'Group the world into evenly sized screen pixels.', min: 1, max: 4, step: 0.25 },
];

interface ScreenFilterControlsOptions {
  apply(settings: ScreenFilterSettings): void;
  supported(): boolean;
  onOpenChange(open: boolean): void;
}

/** A non-modal workbench: keep the town visible while changing its finish. */
export class ScreenFilterControls {
  private readonly element: HTMLElement;
  private readonly abort = new AbortController();
  private settings: ScreenFilterSettings;
  private opened = false;
  private comparing = false;
  private comparePointer: number | undefined;
  private returnFocus: HTMLElement | null = null;
  private saveTimer: number | undefined;

  constructor(host: HTMLElement, private readonly options: ScreenFilterControlsOptions) {
    try { this.settings = normalizeScreenFilterSettings(JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')); }
    catch { this.settings = normalizeScreenFilterSettings(null); }
    this.element = document.createElement('aside');
    this.element.className = 'screen-filter-panel';
    this.element.id = 'screen-filter-panel';
    this.element.hidden = true;
    this.element.setAttribute('aria-labelledby', 'screen-filter-title');
    this.element.innerHTML = `
      <header class="screen-filter-header"><div><span class="screen-filter-kicker">EXPERIMENTAL</span><h2 id="screen-filter-title">Screen filters</h2></div><button type="button" class="screen-filter-close" aria-label="Close screen filters">${icon('close')}</button></header>
      <p class="screen-filter-intro">Try a shared finish for the world. Menus stay clear.</p>
      <div class="screen-filter-presets" role="group" aria-label="Screen filter presets">${SCREEN_FILTER_PRESETS.map(preset => `<button type="button" data-screen-preset="${preset.id}" aria-pressed="false">${escapeHtml(preset.name)}</button>`).join('')}</div>
      <div class="screen-filter-look"><strong data-screen-look></strong><span data-screen-custom hidden>Custom</span></div>
      <p class="screen-filter-description" data-screen-description></p>
      <p class="screen-filter-unavailable" data-screen-unavailable hidden role="status">Screen filters aren’t available on this device. Your choices are saved for next time.</p>
      <div class="screen-filter-actions"><button type="button" class="screen-filter-compare" aria-pressed="false">Hold to compare original</button><button type="button" class="screen-filter-reset" aria-label="Reset the current screen filter preset">${icon('refresh')} Reset</button></div>
      <div class="screen-filter-sliders">${controls.map(control => `<label class="screen-filter-slider" for="screen-filter-${control.key}"><span>${control.label}<output for="screen-filter-${control.key}" data-screen-value="${control.key}"></output></span><input id="screen-filter-${control.key}" type="range" min="${control.min ?? 0}" max="${control.max ?? 100}" step="${control.step ?? 1}" data-screen-control="${control.key}" aria-describedby="screen-filter-hint-${control.key}"><small id="screen-filter-hint-${control.key}">${control.hint}</small></label>`).join('')}</div>
      <p class="screen-filter-footer">Saved on this device <span>·</span> <kbd>F</kbd> or <kbd>Esc</kbd> to close</p>`;
    host.append(this.element);
    this.bind();
    this.sync();
    this.options.apply(this.settings);
  }

  isOpen(): boolean { return this.opened; }

  open(trigger?: HTMLElement): void {
    if (this.opened) return;
    this.returnFocus = trigger?.isConnected ? trigger : document.activeElement as HTMLElement;
    this.opened = true;
    this.element.hidden = false;
    this.refreshSupport();
    this.syncTrigger();
    this.options.onOpenChange(true);
    this.element.querySelector<HTMLButtonElement>('[data-screen-preset][aria-pressed="true"]')?.focus();
  }

  close(restoreFocus = true): void {
    if (!this.opened) return;
    this.endCompare();
    this.opened = false;
    this.element.hidden = true;
    this.syncTrigger();
    this.options.onOpenChange(false);
    this.persist();
    if (restoreFocus) {
      const target = this.returnFocus?.isConnected && this.returnFocus.getClientRects().length
        ? this.returnFocus : document.querySelector<HTMLElement>('#world-container');
      target?.focus();
    }
    this.returnFocus = null;
  }

  toggle(trigger?: HTMLElement): void { if (this.opened) this.close(); else this.open(trigger); }

  refreshSupport(): void {
    const supported = this.options.supported();
    this.element.querySelector<HTMLElement>('[data-screen-unavailable]')!.hidden = supported;
    this.element.querySelectorAll<HTMLInputElement>('[data-screen-control]').forEach(input => { input.disabled = !supported; });
    this.element.querySelector<HTMLButtonElement>('.screen-filter-compare')!.disabled = !supported;
    if (!supported) this.endCompare();
  }

  destroy(): void {
    this.close(false);
    this.persist();
    this.abort.abort();
    this.element.remove();
  }

  private bind(): void {
    const signal = this.abort.signal;
    this.element.querySelector('.screen-filter-close')!.addEventListener('click', () => this.close(), { signal });
    this.element.querySelectorAll<HTMLButtonElement>('[data-screen-preset]').forEach(button => {
      button.addEventListener('click', () => {
        const preset = SCREEN_FILTER_PRESETS.find(item => item.id === button.dataset.screenPreset)!;
        this.endCompare();
        this.settings = normalizeScreenFilterSettings(preset.settings);
        this.changed();
      }, { signal });
    });
    this.element.querySelectorAll<HTMLInputElement>('[data-screen-control]').forEach(input => {
      input.addEventListener('input', () => {
        const key = input.dataset.screenControl as FilterControl;
        this.settings = normalizeScreenFilterSettings({ ...this.settings, preset: this.settings.preset === 'original' ? 'soft' : this.settings.preset, [key]: Number(input.value) });
        this.changed();
      }, { signal });
    });
    this.element.querySelector('.screen-filter-reset')!.addEventListener('click', () => {
      this.endCompare();
      this.settings = normalizeScreenFilterSettings(SCREEN_FILTER_PRESETS.find(preset => preset.id === this.settings.preset)!.settings);
      this.changed();
    }, { signal });
    const compare = this.element.querySelector<HTMLButtonElement>('.screen-filter-compare')!;
    compare.addEventListener('pointerdown', event => {
      if (event.button !== 0 || this.comparePointer !== undefined) return;
      event.preventDefault();
      compare.focus();
      this.comparePointer = event.pointerId;
      compare.setPointerCapture(event.pointerId);
      this.beginCompare();
    }, { signal });
    const release = (event: PointerEvent) => { if (event.pointerId === this.comparePointer) this.endCompare(); };
    compare.addEventListener('pointerup', release, { signal });
    compare.addEventListener('pointercancel', release, { signal });
    compare.addEventListener('lostpointercapture', release, { signal });
    compare.addEventListener('keydown', event => {
      if (event.key !== ' ' && event.key !== 'Enter') return;
      event.preventDefault();
      event.stopPropagation();
      if (!event.repeat) this.beginCompare();
    }, { signal });
    compare.addEventListener('keyup', event => {
      if (event.key !== ' ' && event.key !== 'Enter') return;
      event.preventDefault();
      event.stopPropagation();
      this.endCompare();
    }, { signal });
    compare.addEventListener('blur', () => this.endCompare(), { signal });
    window.addEventListener('blur', () => this.endCompare(), { signal });
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.endCompare(); }, { signal });
  }

  private beginCompare(): void {
    if (!this.opened || this.comparing || !this.options.supported()) return;
    this.comparing = true;
    const button = this.element.querySelector<HTMLButtonElement>('.screen-filter-compare')!;
    button.setAttribute('aria-pressed', 'true');
    button.textContent = 'Showing original — release';
    this.options.apply(normalizeScreenFilterSettings({ preset: 'original' }));
  }

  private endCompare(): void {
    const pointer = this.comparePointer;
    this.comparePointer = undefined;
    const button = this.element.querySelector<HTMLButtonElement>('.screen-filter-compare')!;
    if (pointer !== undefined && button.hasPointerCapture(pointer)) button.releasePointerCapture(pointer);
    if (!this.comparing) return;
    this.comparing = false;
    button.setAttribute('aria-pressed', 'false');
    button.textContent = 'Hold to compare original';
    this.options.apply(this.settings);
  }

  private changed(): void {
    this.sync();
    if (!this.comparing) this.options.apply(this.settings);
    if (this.saveTimer !== undefined) clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => this.persist(), 120);
  }

  private sync(): void {
    const preset = SCREEN_FILTER_PRESETS.find(item => item.id === this.settings.preset)!;
    this.element.querySelectorAll<HTMLButtonElement>('[data-screen-preset]').forEach(button => { button.setAttribute('aria-pressed', String(button.dataset.screenPreset === preset.id)); });
    this.element.querySelector<HTMLElement>('[data-screen-look]')!.textContent = preset.name;
    this.element.querySelector<HTMLElement>('[data-screen-custom]')!.hidden = controls.every(control => this.settings[control.key] === preset.settings[control.key]);
    this.element.querySelector<HTMLElement>('[data-screen-description]')!.textContent = preset.description;
    for (const control of controls) {
      const value = this.settings[control.key];
      const input = this.element.querySelector<HTMLInputElement>(`[data-screen-control="${control.key}"]`)!;
      input.value = String(value);
      this.element.querySelector<HTMLOutputElement>(`[data-screen-value="${control.key}"]`)!.value = control.key === 'pixelSize' ? `${value}×` : `${value}%`;
      input.setAttribute('aria-valuetext', control.key === 'pixelSize' ? `${value} screen pixels` : `${value} percent`);
    }
  }

  private syncTrigger(): void {
    document.querySelector('#game-shell')?.classList.toggle('screen-filters-open', this.opened);
  }

  private persist(): void {
    if (this.saveTimer !== undefined) { clearTimeout(this.saveTimer); this.saveTimer = undefined; }
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings)); }
    catch { /* The workbench still works when this device cannot store preferences. */ }
  }
}
