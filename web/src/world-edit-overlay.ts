import {buildingRoomKind} from './scene-schema';
/** The in-game edit mode panels: a top band, an inspector and the Add palette. */
import './world-edit.css';
import {escapeHtml as escape} from './icons';
import type {EditBridge,EditState,EditView} from './world-edit-mode';
import {catalogueGroups,variantChoices,variantLabel} from './world-edit-catalogue';
import {roomNames,townName} from './world-edit-rules';
import type {SceneInteriorKind} from './scene-schema';

const capital = (text: string): string => text.charAt(0).toLocaleUpperCase() + text.slice(1);

export class WorldEditOverlay implements EditView {
  private readonly root: HTMLElement;
  private readonly band: HTMLElement;
  private readonly inspector: HTMLElement;
  private readonly palette: HTMLElement;
  private readonly toasts: HTMLElement;
  private paletteOpen = false;
  private catalogueGroup = '';
  private readonly docked: boolean;
  private last?: EditState;
  private paletteKey = '';
  private inspectorKey = '';
  bridge?: EditBridge;

  private readonly onDone?: () => void;
  /**
   * Floating over the game by default. With `mount`, the panels dock inside it
   * for the admin map editor and the object tray stays open.
   */
  constructor(options: {onDone?: () => void; mount?: HTMLElement} = {}) {
    this.onDone = options.onDone;
    this.docked = !!options.mount;
    this.root = document.createElement('div');
    this.root.className = options.mount ? 'world-edit world-edit-docked' : 'world-edit';
    this.paletteOpen = !!options.mount;
    this.root.innerHTML = `<div class="world-edit-band" role="toolbar" aria-label="Edit mode">
        <span class="world-edit-title"><strong>Editing</strong> <span data-edit-town></span><span class="world-edit-live">Changes go live for everyone</span></span>
        <span class="world-edit-status" role="status" aria-live="polite"></span>
        <button type="button" data-edit="undo">Undo</button>
        ${options.mount ? '' : '<button type="button" data-edit="add" aria-expanded="false">Add objects</button>'}
        ${options.onDone ? '<button type="button" data-edit="done" class="primary">Done</button>' : ''}
      </div>
      <div class="world-edit-toasts" aria-live="polite"></div>
      <aside class="world-edit-inspector" hidden aria-label="Selected object"></aside>
      <section class="world-edit-palette" hidden aria-label="Add an object"></section>`;
    this.band = this.root.querySelector('.world-edit-band')!;
    this.inspector = this.root.querySelector('.world-edit-inspector')!;
    this.palette = this.root.querySelector('.world-edit-palette')!;
    this.toasts = this.root.querySelector('.world-edit-toasts')!;
    this.root.addEventListener('click', this.click);
    this.root.addEventListener('change', this.change);
    (options.mount ?? document.body).append(this.root);
  }

  destroy(): void { this.root.remove(); }

  private get controller() { return this.bridge?.controller; }

  private click = (event: MouseEvent): void => {
    const button = (event.target as HTMLElement).closest<HTMLElement>('[data-edit]');
    if (!button || (button as HTMLButtonElement).disabled) return;
    const action = button.dataset.edit, controller = this.controller;
    switch (action) {
      case 'done': this.onDone?.(); break;
      case 'edit-room': void controller?.editRoom(); break;
      case 'undo': void controller?.undo(); break;
      case 'add': this.paletteOpen = !this.paletteOpen; if (this.paletteOpen) controller?.deselect(); else controller?.cancelPlacing(); this.render(); break;
      case 'flip': controller?.flip(); break;
      case 'delete': controller?.remove(); break;
      case 'deselect': controller?.deselect(); break;
      case 'place': {
        const choice = this.last?.palette.find(item => item.frame === button.dataset.frame);
        if (choice) controller?.startPlacing(choice);
        break;
      }
      case 'variant': controller?.setVariant(button.dataset.frame!); break;
      case 'cancel-place': controller?.cancelPlacing(); break;
    }
  };

  private change = (event: Event): void => {
    const input = event.target as HTMLInputElement | HTMLSelectElement;
    const controller = this.controller;
    if (input.name === 'catalogue-group') { this.catalogueGroup = input.value; this.render(); }
    else if (input.name === 'size') controller?.resize(Number(input.value));
    else if (input.name === 'room') controller?.setRoom((input.value || null) as SceneInteriorKind | null);
    else if (input.name === 'solid') controller?.setSolid((input as HTMLInputElement).checked);
  };

  state(state: EditState): void {
    if (!this.docked && state.selection) this.paletteOpen = false;
    this.last = state; this.render();
  }

  toast(message: string, error = false): void {
    const item = document.createElement('p');
    item.className = `world-edit-toast${error ? ' error' : ''}`;
    item.setAttribute('role', error ? 'alert' : 'status');
    item.textContent = message;
    this.toasts.append(item);
    while (this.toasts.children.length > 3) this.toasts.firstElementChild?.remove();
    window.setTimeout(() => item.remove(), error ? 7000 : 5000);
  }

  private render(): void {
    const state = this.last;
    if (!state) return;
    this.band.querySelector('[data-edit-town]')!.textContent = townName(state.map);
    this.band.querySelector('.world-edit-status')!.textContent = state.busy ? 'Saving…' : '';
    (this.band.querySelector('[data-edit="undo"]') as HTMLButtonElement).disabled = state.busy || !state.canUndo;
    const add = this.band.querySelector<HTMLButtonElement>('[data-edit="add"]');
    add?.setAttribute('aria-expanded', String(this.paletteOpen)); add?.classList.toggle('active', this.paletteOpen);
    this.renderInspector(state);
    this.renderPalette(state);
  }

  private renderInspector(state: EditState): void {
    const selection = state.selection;
    this.inspector.hidden = !selection;
    if (!selection) { this.inspector.innerHTML = ''; this.inspectorKey = ''; return; }
    // Rebuild only when what is shown changes, so a slider drag or an open list survives.
    const key = JSON.stringify([selection.target, selection.item, selection.lockedBy, selection.size, selection.rooms, state.busy, state.palette, Object.keys(state.thumbnails)]);
    if (key === this.inspectorKey) {
      const locked = state.busy || !!selection.lockedBy;
      this.inspector.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLSelectElement>('button[data-edit="flip"], button[data-edit="delete"], select, input[type=checkbox]').forEach(control => { control.disabled = locked; });
      return;
    }
    this.inspectorKey = key;
    const item = selection.item, disabled = state.busy || !!selection.lockedBy ? ' disabled' : '';
    let body = '';
    if (selection.lockedBy) body += `<p class="world-edit-note warning">${escape(selection.lockedBy)} is editing this right now.</p>`;
    if (!item) {
      body += `<p class="world-edit-note">${selection.target.kind === 'npc' ? 'Story character. Players talk to them here, so keep them beside a path.' : 'Story evidence. Players read it here, so keep it beside a path.'}</p>
        <p class="world-edit-hint">Drag to move.</p>`;
    } else {
      const size = selection.size!, room = item.interior?.kind ?? '';
      const variants = variantChoices(state.palette, item);
      if (variants.length > 1) body += `<div class="world-edit-versions"><h3>Version</h3><div class="world-edit-palette-grid" role="group" aria-label="Object versions">${variants.map(choice => {
        const active = choice.frame === (item.frame ?? item.asset), image = state.thumbnails[choice.frame];
        return `<button type="button" data-edit="variant" data-frame="${escape(choice.frame)}" aria-pressed="${active}" class="${active ? 'active' : ''}"${disabled}>${image ? `<img src="${escape(image)}" alt="">` : ''}<span>${escape(capital(variantLabel(choice)))}</span></button>`;
      }).join('')}</div></div>`;
      body += `<div class="world-edit-row"><button type="button" data-edit="flip"${disabled}>Flip</button><button type="button" data-edit="delete" class="danger"${disabled}>Delete</button></div>
        <label class="world-edit-field"><span>Size</span><input type="range" name="size" min="${size.min}" max="${size.max}" step="1" value="${Math.min(size.max, Math.max(size.min, item.width))}"${disabled || size.min === size.max ? ' disabled' : ''}></label>`;
      if (buildingRoomKind(item)) body += `<button type="button" data-edit="edit-room"${disabled}>Edit room layout</button>`;
      if (selection.rooms.length) body += `<label class="world-edit-field"><span>Room inside</span><select name="room"${disabled}>
          <option value=""${room ? '' : ' selected'}>Default for this building</option>
          ${selection.rooms.map(kind => `<option value="${kind}"${kind === room ? ' selected' : ''}>${escape(capital(roomNames[kind]))}</option>`).join('')}
        </select></label>`;
      body += `<label class="world-edit-check"><input type="checkbox" name="solid"${item.collidable !== false ? ' checked' : ''}${disabled}> Players walk around it</label>
        <p class="world-edit-hint">Drag to move. Delete or Backspace removes it.</p>`;
    }
    this.inspector.innerHTML = `<header><h2>${escape(capital(selection.label))}</h2><button type="button" data-edit="deselect" aria-label="Close">×</button></header>${body}`;
  }

  private renderPalette(state: EditState): void {
    this.palette.hidden = !this.paletteOpen;
    if (!this.paletteOpen) return;
    const groups = catalogueGroups(state.palette);
    const group = groups.find(value => value.asset === this.catalogueGroup) ?? groups[0];
    const key = JSON.stringify([state.map, state.placing?.frame, state.busy, group?.asset, state.palette, Object.keys(state.thumbnails)]);
    if (key === this.paletteKey) return;
    this.paletteKey = key;
    const placing = state.placing;
    this.palette.innerHTML = `<div class="world-edit-catalogue-heading"><h2>Object catalogue</h2>${placing ? '<button type="button" data-edit="cancel-place">Cancel placement</button>' : ''}</div>
      <label class="world-edit-field"><span>Object group</span><select name="catalogue-group">${groups.map(value => `<option value="${value.asset}"${value === group ? ' selected' : ''}>${escape(capital(value.label))} · ${value.choices.length} versions</option>`).join('')}</select></label>
      <p class="world-edit-hint">${placing ? `Click in ${escape(townName(state.map))} to place ${escape(variantLabel(placing))}. Esc cancels.` : 'Choose a version, then click in the town to place it.'}</p>
      <div class="world-edit-palette-grid">${(group?.choices ?? []).map(choice => {
        const image = state.thumbnails[choice.frame], active = placing?.frame === choice.frame;
        return `<button type="button" data-edit="place" data-frame="${escape(choice.frame)}" aria-pressed="${active}" class="${active ? 'active' : ''}"${state.busy ? ' disabled' : ''} title="${escape(capital(variantLabel(choice)))}${choice.rooms.length ? ' · can hold a room' : ''}">
          ${image ? `<img src="${escape(image)}" alt="">` : ''}<span>${escape(capital(variantLabel(choice)))}</span></button>`;
      }).join('')}</div>${groups.length ? '' : '<p class="world-edit-note">No objects are available in this town.</p>'}`;
  }
}
