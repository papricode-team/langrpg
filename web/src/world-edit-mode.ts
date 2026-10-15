/**
 * In-game edit mode for admins. The town keeps running: the admin walks with
 * the keyboard, and the pointer selects and drags objects instead of walking.
 * Every committed change publishes immediately and reaches all players.
 */
import * as Phaser from 'phaser';
import type {MapId} from './maps';
import type {NavigationGrid} from './navigation';
import {sceneryFootprints} from './placed-scenery';
import {getWorldScene,sceneDocument} from './scene-data';
import {getSceneryGeometryMap,sceneEntrancePoint,type SceneInteriorKind,type SceneScenery,type ScenePoint} from './scene-schema';
import {applyEditOps,type WorldEditOp} from './world-edit-ops';
import {defaultActivities,newPlacement,paletteChoices,type PaletteChoice} from './world-edit-palette';
import {objectLabel,placementProblems,roomOptions,SceneReach,sizeRange,WorldEditError,type WorldProblem} from './world-edit-rules';
import type {WorldEditSession,WorldLock} from './world-edit-session';
import type {WorldScenery} from './world-scenery';
import {sceneryTextureKey} from './placed-scenery';
import {sceneryAnimationManifestKey,type SceneryAnimationManifest} from './scenery-animation';
import {worldDepth} from './world-depth';

export interface EditTarget { kind: 'scenery' | 'npc' | 'object'; id: string; }
export interface EditSelection {
  target: EditTarget;
  label: string;
  /** Another admin holding this object. */
  lockedBy?: string;
  item?: SceneScenery;
  size?: {min: number; max: number};
  rooms: readonly SceneInteriorKind[];
}
export interface EditState {
  map: string;
  selection?: EditSelection;
  placing?: PaletteChoice;
  busy: boolean;
  canUndo: boolean;
  palette: PaletteChoice[];
  thumbnails: Readonly<Record<string, string>>;
}
export interface EditView {
  state(state: EditState): void;
  toast(message: string, error?: boolean): void;
}

/** What the world scene exposes to the editor. */
export interface EditSurface extends Phaser.Scene {
  readonly editMapId: string;
  editScenery(): WorldScenery | undefined;
  editNavigation(): NavigationGrid;
  /** Story characters and evidence markers as currently drawn. */
  editAnchors(): {kind: 'npc' | 'object'; id: string; x: number; y: number}[];
  /** Frame name to thumbnail data URL, from loaded artwork. */
  editThumbnail(frame: string): string | undefined;
  /** True while the pointer pans the view instead of editing. */
  editPanning?(): boolean;
}

/** Connects the overlay, the session and the scene's controller. */
export class EditBridge {
  controller?: WorldEditController;
  /** Objects other admins hold, by ID. */
  readonly locks = new Map<string, string>();
  readonly remote = new Map<string, {x: number; y: number; name: string; at: number}>();
  readonly session: WorldEditSession;
  readonly view: EditView;
  readonly selfId: () => string;
  readonly sendPreview: (id: string, x: number, y: number) => void;
  constructor(session: WorldEditSession, view: EditView, selfId: () => string, sendPreview: (id: string, x: number, y: number) => void) {
    this.session = session; this.view = view; this.selfId = selfId; this.sendPreview = sendPreview;
  }
  setLocks(locks: readonly WorldLock[]): void {
    const next = new Map(locks.filter(lock => lock.adminId !== this.selfId()).map(lock => [lock.id, lock.adminName]));
    // Lock renewals arrive often; only a real change redraws the panels.
    if (next.size === this.locks.size && [...next].every(([id, name]) => this.locks.get(id) === name)) return;
    this.locks.clear();
    for (const [id, name] of next) this.locks.set(id, name);
    this.controller?.publish();
  }
  remotePreview(id: string, x: number, y: number, name: string): void { this.remote.set(id, {x, y, name, at: performance.now()}); }
}

let ghostSequence = 0;
/** Keys typed into a form field or pressed on a panel control belong to that control. */
export function editingControlFocused(target: EventTarget | null = document.activeElement): boolean {
  const element = (target instanceof HTMLElement ? target : document.activeElement) as HTMLElement | null;
  if (!element || element === document.body) return false;
  return element.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(element.tagName) || !!element.closest('.map-panel, .world-edit');
}

const SELECT = 0xf3c76a, HOVER = 0xfff4d8, LOCKED = 0xe4645a, VALID = 0x9fe0a8, INVALID = 0xff7a6a, REMOTE = 0x8fc7ff;
const ANCHOR_PICK = 34;

export class WorldEditController {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly names: Phaser.GameObjects.Text[] = [];
  private hovered?: EditTarget;
  private selected?: EditTarget;
  private drag?: {target: EditTarget; startX: number; startY: number; originX: number; originY: number; x: number; y: number; moved: boolean; valid: boolean; checkedAt: number};
  private placing?: {choice: PaletteChoice; ghost?: Phaser.GameObjects.Image; ghostKey?: string; x: number; y: number; valid: boolean};
  private busy = false;
  private thumbnails: Record<string, string> = {};
  private readonly palette: PaletteChoice[];
  private readonly scene: EditSurface;
  private readonly bridge: EditBridge;

  constructor(scene: EditSurface, bridge: EditBridge) {
    this.scene = scene; this.bridge = bridge;
    this.graphics = scene.add.graphics().setDepth(worldDepth(100000, 'label'));
    this.palette = paletteChoices(scene.editMapId);
    for (const choice of this.palette) { const image = scene.editThumbnail(choice.frame); if (image) this.thumbnails[choice.frame] = image; }
    scene.input.on('pointerdown', this.pointerDown, this);
    scene.input.on('pointermove', this.pointerMove, this);
    scene.input.on('pointerup', this.pointerUp, this);
    scene.input.on('pointerupoutside', this.pointerUp, this);
    scene.input.keyboard?.on('keydown-ESC', this.escapeKey, this);
    scene.input.keyboard?.on('keydown-DELETE', this.deleteKey, this);
    scene.input.keyboard?.on('keydown-BACKSPACE', this.deleteKey, this);
    bridge.controller = this;
    void bridge.session.status(this.map).then(status => bridge.setLocks(status.locks)).catch(() => undefined);
    this.publish();
  }

  destroy(): void {
    const scene = this.scene;
    scene.input.off('pointerdown', this.pointerDown, this);
    scene.input.off('pointermove', this.pointerMove, this);
    scene.input.off('pointerup', this.pointerUp, this);
    scene.input.off('pointerupoutside', this.pointerUp, this);
    scene.input.keyboard?.off('keydown-ESC', this.escapeKey, this);
    scene.input.keyboard?.off('keydown-DELETE', this.deleteKey, this);
    scene.input.keyboard?.off('keydown-BACKSPACE', this.deleteKey, this);
    scene.editScenery()?.clearPreview();
    this.cancelPlacing(false);
    this.graphics.destroy();
    for (const name of this.names) name.destroy();
    if (this.selected) void this.bridge.session.release(this.scene.editMapId, this.selected.id);
    if (this.bridge.controller === this) this.bridge.controller = undefined;
  }

  // State ----------------------------------------------------------------------

  private get map(): string { return this.scene.editMapId; }
  private item(id: string): SceneScenery | undefined { return getWorldScene(this.map).scenery.find(value => value.id === id); }

  publish(): void {
    const scene = getWorldScene(this.map), target = this.selected;
    let selection: EditSelection | undefined;
    if (target && (target.kind !== 'scenery' || this.item(target.id))) {
      const item = target.kind === 'scenery' ? this.item(target.id) : undefined;
      selection = {target, label: objectLabel(scene, target.id), lockedBy: this.bridge.locks.get(target.id),
        ...(item ? {item, size: sizeRange(this.map, item)} : {}), rooms: item ? roomOptions(this.map, item) : []};
    }
    this.bridge.view.state({map: this.map, selection, placing: this.placing?.choice, busy: this.busy, canUndo: this.bridge.session.canUndo,
      palette: this.palette, thumbnails: this.thumbnails});
  }

  /** The document changed under us: drop a selection that no longer exists. */
  documentChanged(): void {
    if (this.selected?.kind === 'scenery' && !this.item(this.selected.id)) this.select(undefined);
    // Someone else's edit only interrupts a drag when it moved or removed this object.
    const drag = this.drag, now = drag ? this.position(drag.target) : undefined;
    if (drag && (!now || now.x !== drag.originX || now.y !== drag.originY)) { this.scene.editScenery()?.clearPreview(); this.drag = undefined; }
    else if (drag?.moved && drag.target.kind === 'scenery') this.scene.editScenery()?.previewMove(drag.target.id, drag.x - drag.originX, drag.y - drag.originY, drag.valid);
    this.publish();
  }

  // Picking ----------------------------------------------------------------------

  private pick(x: number, y: number): EditTarget | undefined {
    let anchor: {kind: 'npc' | 'object'; id: string; distance: number} | undefined;
    for (const value of this.scene.editAnchors()) {
      const distance = Math.hypot(value.x - x, value.y - 20 - y);
      if (distance < ANCHOR_PICK && (!anchor || distance < anchor.distance)) anchor = {kind: value.kind, id: value.id, distance};
    }
    if (anchor) return {kind: anchor.kind, id: anchor.id};
    const spec = this.scene.editScenery()?.objectAt(x, y);
    return spec ? {kind: 'scenery', id: spec.id} : undefined;
  }

  private select(target: EditTarget | undefined): void {
    const previous = this.selected;
    if (previous && (!target || previous.id !== target.id)) void this.bridge.session.release(this.map, previous.id);
    this.selected = target;
    if (target && (!previous || previous.id !== target.id)) {
      const map = this.map;
      void this.bridge.session.lock(map, target.id).then(locks => {
        // The admin moved on while the lock was being taken: give it back.
        if (this.selected?.id !== target.id) { void this.bridge.session.release(map, target.id); return; }
        this.bridge.setLocks(locks);
      }).catch((error: Error) => {
        if (this.selected?.id !== target.id) return;
        this.bridge.view.toast(error.message, true);
        if (this.drag?.target.id === target.id) { this.scene.editScenery()?.clearPreview(); this.drag = undefined; }
        this.selected = undefined;
        this.publish();
      });
    }
    this.publish();
  }

  // Pointer ----------------------------------------------------------------------

  private worldPoint(pointer: Phaser.Input.Pointer): ScenePoint {
    const point = this.scene.cameras.main.getWorldPoint(pointer.x, pointer.y);
    return {x: point.x, y: point.y};
  }

  private pointerDown(pointer: Phaser.Input.Pointer): void {
    if (pointer.rightButtonDown() || pointer.middleButtonDown() || this.busy || this.scene.editPanning?.()) return;
    const point = this.worldPoint(pointer);
    if (this.placing) { this.placing.x = point.x; this.placing.y = point.y; void this.dropPlacement(); return; }
    const target = this.pick(point.x, point.y);
    if (!target) { this.select(undefined); return; }
    const holder = this.bridge.locks.get(target.id);
    if (holder) { this.bridge.view.toast(`${holder} is editing ${objectLabel(getWorldScene(this.map), target.id)} right now.`); return; }
    this.select(target);
    const origin = this.position(target);
    if (origin) this.drag = {target, startX: point.x, startY: point.y, originX: origin.x, originY: origin.y, x: origin.x, y: origin.y, moved: false, valid: true, checkedAt: 0};
  }

  private pointerMove(pointer: Phaser.Input.Pointer): void {
    const point = this.worldPoint(pointer);
    if (this.placing) {
      this.placing.x = point.x; this.placing.y = point.y;
      this.placing.valid = this.cheapProblems([{kind: 'place', map: this.map, item: newPlacement(getWorldScene(this.map), this.placing.choice, point)}]).length === 0;
      return;
    }
    if (!this.drag) { this.hovered = this.pick(point.x, point.y); return; }
    const drag = this.drag;
    const dx = point.x - drag.startX, dy = point.y - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    drag.moved = true;
    drag.x = Math.round(drag.originX + dx); drag.y = Math.round(drag.originY + dy);
    const now = performance.now();
    if (now - drag.checkedAt > 80) { drag.checkedAt = now; drag.valid = this.cheapProblems([this.moveOp(drag.target, drag.x, drag.y)]).length === 0; }
    if (drag.target.kind === 'scenery') this.scene.editScenery()?.previewMove(drag.target.id, drag.x - drag.originX, drag.y - drag.originY, drag.valid);
    this.bridge.sendPreview(drag.target.id, drag.x, drag.y);
  }

  private pointerUp(): void {
    const drag = this.drag;
    this.drag = undefined;
    if (!drag?.moved) return;
    // Keep the dragged sprite where it was dropped until the published edit redraws it.
    void this.commit([this.moveOp(drag.target, drag.x, drag.y)], done => {
      if (!done) this.scene.editScenery()?.clearPreview();
      else window.setTimeout(() => { if (!this.drag) this.scene.editScenery()?.clearPreview(); }, 1500);
    });
  }

  private lastEscape = 0;
  /** Cancel placing, a drag or the selection. Returns false when there was nothing to cancel. */
  escape(): boolean {
    // The game's document handler and Phaser's keyboard can both deliver one key press.
    const now = performance.now();
    if (now - this.lastEscape < 60) return true;
    if (this.placing) this.cancelPlacing();
    else if (this.drag) { this.scene.editScenery()?.clearPreview(); this.drag = undefined; }
    else if (this.selected) this.select(undefined);
    else return false;
    this.lastEscape = now;
    return true;
  }
  private escapeKey(): void { this.escape(); }
  private deleteKey(event: KeyboardEvent): void {
    if (editingControlFocused(event.target)) return;
    if (this.selected?.kind === 'scenery') this.remove();
  }

  private position(target: EditTarget): ScenePoint | undefined {
    const scene = getWorldScene(this.map);
    const value = target.kind === 'scenery' ? scene.scenery.find(item => item.id === target.id)
      : (target.kind === 'npc' ? scene.npcs : scene.objects).find(item => item.id === target.id);
    return value ? {x: value.x, y: value.y} : undefined;
  }

  private moveOp(target: EditTarget, x: number, y: number): WorldEditOp {
    return target.kind === 'scenery' ? {kind: 'move', map: this.map, id: target.id, x, y}
      : {kind: 'moveAnchor', map: this.map, anchor: target.kind, id: target.id, x, y};
  }

  // Checks and commits --------------------------------------------------------------

  /** Shape and spacing checks, fast enough to run while dragging. */
  private cheapProblems(ops: WorldEditOp[]): WorldProblem[] { return this.problems(ops, false); }

  private problems(ops: WorldEditOp[], routes: boolean): WorldProblem[] {
    const before = getWorldScene(this.map);
    let after;
    let changed: ReadonlySet<string>;
    try {
      const result = applyEditOps(sceneDocument, ops);
      after = result.document.maps[this.map]; changed = result.changed.get(this.map) ?? new Set();
    } catch (error) { return error instanceof WorldEditError ? error.problems : [{code: 'invalid', map: this.map, message: String(error), objectIds: [], severity: 'error'}]; }
    let reach;
    if (routes) {
      const current = SceneReach.from(before, this.scene.editNavigation());
      reach = {before: current, after: current.with(after)};
    }
    return placementProblems(before, after, changed, reach).filter(problem => problem.severity === 'error');
  }

  /** Check locally, publish, and report the outcome. */
  private async commit(ops: WorldEditOp[], settle?: (done: boolean) => void): Promise<boolean> {
    const problems = this.problems(ops, true);
    if (problems.length) { settle?.(false); this.bridge.view.toast(problems[0].message, true); return false; }
    this.busy = true; this.publish();
    let done = false;
    try {
      const result = await this.bridge.session.commit(ops);
      for (const warning of result.warnings) this.bridge.view.toast(warning.message);
      done = true;
      return true;
    } catch (error) {
      this.bridge.view.toast(error instanceof Error ? error.message : 'The change could not be saved.', true);
      return false;
    } finally { settle?.(done); this.busy = false; this.publish(); }
  }

  // Inspector commands ---------------------------------------------------------------

  private selectedItem(): SceneScenery | undefined { return this.selected?.kind === 'scenery' ? this.item(this.selected.id) : undefined; }

  flip(): void {
    const item = this.selectedItem();
    if (item) void this.commit([{kind: 'update', map: this.map, id: item.id, flipX: !item.flipX}]);
  }
  resize(width: number): void {
    const item = this.selectedItem();
    if (item && Math.abs(width - item.width) > .01) void this.commit([{kind: 'update', map: this.map, id: item.id, width}]);
  }
  setSolid(solid: boolean): void {
    const item = this.selectedItem();
    if (item) void this.commit([{kind: 'update', map: this.map, id: item.id, collidable: solid}]);
  }
  /** Give a building a room; a building that was too small for its door grows to fit. */
  setRoom(kind: SceneInteriorKind | null): void {
    const item = this.selectedItem();
    if (!item) return;
    const ops: WorldEditOp[] = [{kind: 'update', map: this.map, id: item.id, interior: kind ? {kind} : null}];
    if (kind) {
      const range = sizeRange(this.map, {...item, interior: {kind}});
      if (item.width < range.min) (ops[0] as Extract<WorldEditOp, {kind: 'update'}>).width = range.min;
    }
    void this.commit(ops);
  }
  remove(): void {
    const item = this.selectedItem();
    if (!item) return;
    if (item.interior && !confirm(`Remove ${objectLabel(getWorldScene(this.map), item.id)} and its door? Players lose access to that room in ${this.map}.`)) return;
    void this.commit([{kind: 'remove', map: this.map, id: item.id}]).then(done => { if (done) this.select(undefined); });
  }
  deselect(): void { this.select(undefined); }
  async undo(): Promise<void> {
    if (this.busy) return;
    this.busy = true; this.publish();
    try { if (!await this.bridge.session.undo()) this.bridge.view.toast('Nothing to undo.'); }
    catch (error) { this.bridge.view.toast(error instanceof Error ? error.message : 'Undo failed.', true); }
    finally { this.busy = false; this.publish(); }
  }

  startPlacing(choice: PaletteChoice): void {
    this.cancelPlacing(false);
    this.select(undefined);
    const thumbnail = this.thumbnails[choice.frame];
    this.placing = {choice, x: 0, y: 0, valid: false};
    if (thumbnail) {
      // A fresh key per placement: towns and times of day share frame names.
      const key = `edit-ghost-${++ghostSequence}`;
      this.placing.ghostKey = key;
      const show = () => {
        if (this.placing?.choice !== choice) return;
        const width = newPlacement(getWorldScene(this.map), choice, {x: 0, y: 0}).width;
        this.placing.ghost = this.scene.add.image(0, 0, key).setOrigin(.5, 1).setAlpha(.7).setDepth(this.graphics.depth - 1);
        this.placing.ghost.setScale(width / Math.max(1, this.placing.ghost.width));
      };
      this.scene.textures.once(`addtexture-${key}`, show); this.scene.textures.addBase64(key, thumbnail);
    }
    this.publish();
  }
  cancelPlacing(publish = true): void {
    const placing = this.placing;
    this.placing = undefined;
    placing?.ghost?.destroy();
    if (placing?.ghostKey) {
      this.scene.textures.off(`addtexture-${placing.ghostKey}`);
      if (this.scene.textures.exists(placing.ghostKey)) this.scene.textures.remove(placing.ghostKey);
    }
    if (publish) this.publish();
  }
  private async dropPlacement(): Promise<void> {
    const placing = this.placing;
    if (!placing) return;
    const scene = getWorldScene(this.map), item = newPlacement(scene, placing.choice, placing), activities = defaultActivities(scene, item);
    const done = await this.commit([{kind: 'place', map: this.map, item, ...(activities.length ? {activities} : {})}]);
    if (done) { this.cancelPlacing(); this.select({kind: 'scenery', id: item.id}); }
  }

  // Drawing ---------------------------------------------------------------------------

  private footprint(item: SceneScenery): readonly (readonly (readonly [number, number])[])[] {
    return sceneryFootprints([item], getSceneryGeometryMap(this.map));
  }

  private outline(target: EditTarget, color: number, width: number, offset: ScenePoint = {x: 0, y: 0}): void {
    const g = this.graphics, zoom = this.scene.cameras.main.zoom;
    g.lineStyle(width / zoom, color, .95);
    if (target.kind === 'scenery') {
      const item = this.item(target.id);
      const bounds = this.scene.editScenery()?.boundsOf(target.id);
      if (bounds) g.strokeRect(bounds.x + offset.x, bounds.y + offset.y, bounds.right - bounds.x, bounds.bottom - bounds.y);
      if (item) for (const polygon of this.footprint(item)) {
        g.beginPath(); polygon.forEach(([x, y], index) => index ? g.lineTo(x + offset.x, y + offset.y) : g.moveTo(x + offset.x, y + offset.y)); g.closePath(); g.strokePath();
      }
      if (item?.interior) {
        const door = sceneEntrancePoint(getWorldScene(this.map), item);
        g.fillStyle(color, .9).fillCircle(door.x + offset.x, door.y + offset.y, 6 / zoom);
      }
      return;
    }
    const anchor = this.scene.editAnchors().find(value => value.id === target.id);
    if (anchor) g.strokeCircle(anchor.x + offset.x, anchor.y - 20 + offset.y, 26 / zoom);
  }

  private label(index: number, text: string, x: number, y: number, color: string): void {
    let name = this.names[index];
    if (!name) {
      name = this.scene.add.text(0, 0, '', {fontFamily: 'DM Sans, Arial, sans-serif', fontSize: '13px', color: '#fff', backgroundColor: '#20352dcc', padding: {x: 6, y: 3}}).setOrigin(.5, 1).setDepth(this.graphics.depth + 1);
      this.names[index] = name;
    }
    name.setText(text).setColor(color).setPosition(x, y).setScale(1 / this.scene.cameras.main.zoom).setVisible(true);
  }

  /** Redraw selection, hover, locks and other admins' drags. */
  update(): void {
    const g = this.graphics;
    g.clear();
    let labels = 0;
    const now = performance.now();
    for (const [id, remote] of this.bridge.remote) {
      if (now - remote.at > 1500) { this.bridge.remote.delete(id); continue; }
      const position = this.position({kind: 'scenery', id}) ?? this.position({kind: 'npc', id}) ?? this.position({kind: 'object', id});
      if (!position) continue;
      const kind: EditTarget['kind'] = this.item(id) ? 'scenery' : getWorldScene(this.map).npcs.some(value => value.id === id) ? 'npc' : 'object';
      this.outline({kind, id}, REMOTE, 2, {x: remote.x - position.x, y: remote.y - position.y});
      this.label(labels++, remote.name, remote.x, remote.y - 8, '#cfe6ff');
    }
    for (const [id, name] of this.bridge.locks) {
      const kind: EditTarget['kind'] = this.item(id) ? 'scenery' : getWorldScene(this.map).npcs.some(value => value.id === id) ? 'npc' : 'object';
      if (this.bridge.remote.has(id)) continue;
      this.outline({kind, id}, LOCKED, 2);
      const position = this.position({kind, id});
      if (position) this.label(labels++, `${name} is editing`, position.x, position.y + 22, '#ffd2cc');
    }
    if (this.hovered && this.hovered.id !== this.selected?.id && !this.bridge.locks.has(this.hovered.id)) this.outline(this.hovered, HOVER, 1.5);
    if (this.selected) {
      const drag = this.drag?.moved && this.drag.target.id === this.selected.id ? this.drag : undefined;
      this.outline(this.selected, drag ? (drag.valid ? VALID : INVALID) : SELECT, 2.5, drag ? {x: drag.x - drag.originX, y: drag.y - drag.originY} : undefined);
    }
    if (this.placing) {
      const item = newPlacement(getWorldScene(this.map), this.placing.choice, this.placing);
      const color = this.placing.valid ? VALID : INVALID;
      g.lineStyle(2 / this.scene.cameras.main.zoom, color, .95);
      for (const polygon of this.footprint(item)) { g.beginPath(); polygon.forEach(([x, y], index) => index ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath(); g.strokePath(); }
      this.placing.ghost?.setPosition(this.placing.x, this.placing.y).setTint(this.placing.valid ? 0xffffff : 0xff9a8a);
    }
    for (let index = labels; index < this.names.length; index++) this.names[index].setVisible(false);
  }
}

/** A small picture of an object's artwork, for the Add palette. */
export function sceneryThumbnail(scene: Phaser.Scene, mapId: MapId, period: 'day' | 'night', frame: string): string | undefined {
  const manifest = scene.cache.json.get(sceneryAnimationManifestKey(mapId, period)) as SceneryAnimationManifest | undefined;
  const animation = manifest?.assets[frame];
  let key = animation?.base?.key ?? animation?.key, name = animation ? animation.base?.frame ?? animation.frames[0] : frame;
  if (!key || !scene.textures.exists(key) || !scene.textures.get(key).has(name)) { key = sceneryTextureKey(mapId); name = frame; }
  if (!scene.textures.exists(key) || !scene.textures.get(key).has(name)) return undefined;
  const source = scene.textures.getFrame(key, name), image = source.source.image as CanvasImageSource;
  const canvas = document.createElement('canvas'), scale = Math.min(1, 256 / source.cutWidth, 256 / source.cutHeight);
  canvas.width = Math.max(1, Math.round(source.cutWidth * scale)); canvas.height = Math.max(1, Math.round(source.cutHeight * scale));
  canvas.getContext('2d')?.drawImage(image, source.cutX, source.cutY, source.cutWidth, source.cutHeight, 0, 0, canvas.width, canvas.height);
  try { return canvas.toDataURL('image/png'); } catch { return undefined; }
}
