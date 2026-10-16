/**
 * The admin map editor's canvas. It draws a town with the play renderers and
 * owns the pointer: selecting (click, Shift-click, box), dragging a whole
 * selection, placing new objects, and moving the camera.
 *
 * The canvas never publishes on its own. It hands finished gestures to its
 * host as operations; the host checks them and applies them through the
 * edit store, which redraws the canvas straight away.
 */
import * as Phaser from 'phaser';
import type {ModularTerrain} from './modular-terrain';
import {getMap,type MapId} from './maps';
import {sceneryFootprints} from './placed-scenery';
import {getWorldScene,sceneDocument} from './scene-data';
import {sceneNavigationGeometry} from './scene-navigation';
import {getSceneryGeometryMap,sceneEntrancePoint,type ScenePoint,type SceneScenery} from './scene-schema';
import {sceneryAnimationManifestKey,type SceneryAnimationManifest} from './scenery-animation';
import {StreamedWorldTerrain} from './streamed-world-terrain';
import {WorldAnimationAssets} from './world-animation-assets';
import {applyEditOps,type WorldEditOp} from './world-edit-ops';
import {newPlacement,type PaletteChoice} from './world-edit-palette';
import {objectLabel,placementProblems} from './world-edit-rules';
import {sceneryThumbnail} from './world-edit-mode';
import {WorldMapAssets} from './world-map-assets';
import {WorldScenery} from './world-scenery';
import {GRID_SIZE,snap,wheelIntent} from './map-canvas-input';

export type MapItemKind = 'scenery' | 'npc' | 'object';
export interface MapItem { kind: MapItemKind; id: string; }
export interface MapLayers { labels: boolean; footprints: boolean; walkable: boolean; grid: boolean; }
export type MapTool = 'select' | 'hand';

/** What the canvas asks of the editor around it. */
export interface MapCanvasHost {
  /** Check and apply a finished gesture. Returns false when it was refused. */
  commit(ops: WorldEditOp[], label: string): boolean;
  /** Check and place a new object. Returns false when it was refused. */
  place(item: SceneScenery): boolean;
  selectionChanged(selection: readonly MapItem[]): void;
  placingChanged(choice: PaletteChoice | undefined): void;
  /** Pointer position in town coordinates, or undefined off the map. */
  pointer(point: ScenePoint | undefined): void;
  zoomChanged(zoom: number): void;
  /** Objects other admins hold, by ID, with their names. */
  locks(): ReadonlyMap<string, string>;
  toast(message: string, error?: boolean): void;
}

type Verdict = 'ok' | 'warning' | 'error';
const WARN = 0xf5b14a, SELECT = 0xf3c76a, HOVER = 0xfff4d8, LOCKED = 0xe4645a, VALID = 0x9fe0a8, INVALID = 0xff7a6a, MARQUEE = 0x8fc7ff;
const MIN_ZOOM = .12, MAX_ZOOM = 4;
const DRAG_THRESHOLD = 4;
/** Labels for story markers appear once the town is this close. */
const LABEL_ZOOM = .55;
const fillPolygon = (g: Phaser.GameObjects.Graphics, polygon: readonly (readonly [number, number])[]) => {
  g.beginPath(); polygon.forEach(([x, y], index) => index ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath(); g.fillPath();
};

/** "the parcel" reads as "Parcel" on a map label. */
const capitalName = (text: string) => { const bare = text.replace(/^the /, ''); return bare.charAt(0).toLocaleUpperCase() + bare.slice(1); };

export class AdminMapScene extends Phaser.Scene {
  private mapId: MapId = 'lindenhafen';
  private readonly period = 'day' as const;
  private scenery?: WorldScenery;
  private terrain?: StreamedWorldTerrain;
  private terrainDocument?: ModularTerrain;
  private regionAssets!: WorldMapAssets;
  private animationAssets!: WorldAnimationAssets;
  private overlay!: Phaser.GameObjects.Graphics;
  private staticOverlay!: Phaser.GameObjects.Graphics;
  private labels: Phaser.GameObjects.Text[] = [];
  private loaded?: MapId;
  private loading = 0;
  private needsFit = false;
  private host?: MapCanvasHost;
  private resolveReady!: () => void;
  readonly created = new Promise<void>(resolve => { this.resolveReady = resolve; });

  // Editing state ------------------------------------------------------------------------
  private active = true;
  private tool: MapTool = 'select';
  private spaceHeld = false;
  private selection: MapItem[] = [];
  private hovered?: MapItem;
  private pan?: {x: number; y: number; scrollX: number; scrollY: number};
  private drag?: {items: {item: MapItem; x: number; y: number}[]; startX: number; startY: number; dx: number; dy: number; moved: boolean; verdict: Verdict; checkedAt: number};
  private marquee?: {x: number; y: number; toX: number; toY: number; additive: boolean; base: MapItem[]};
  private placing?: {choice: PaletteChoice; ghost?: Phaser.GameObjects.Image; ghostKey?: string; x: number; y: number; verdict: Verdict};
  private nudge?: {dx: number; dy: number; timer: number};
  private layers: MapLayers = {labels: true, footprints: false, walkable: false, grid: false};
  private snapping = false;
  private thumbnails = new Map<string, string | undefined>();
  private ghostSequence = 0;

  constructor() { super('admin-map'); }

  create(): void {
    this.cameras.main.setBackgroundColor('#c8d0bc');
    this.regionAssets = new WorldMapAssets(this, false, true);
    this.animationAssets = new WorldAnimationAssets(this, false);
    this.staticOverlay = this.add.graphics().setDepth(9e6);
    this.overlay = this.add.graphics().setDepth(1e7);
    this.input.mouse?.disableContextMenu();
    this.input.on('pointerdown', this.pointerDown, this);
    this.input.on('pointermove', this.pointerMove, this);
    this.input.on('pointerup', this.pointerUp, this);
    this.input.on('pointerupoutside', this.pointerUp, this);
    this.input.on('gameout', () => { this.hovered = undefined; this.host?.pointer(undefined); });
    this.game.canvas.addEventListener('wheel', this.wheel, {passive: false});
    this.events.once(Phaser.Scenes.Events.DESTROY, () => this.game.canvas?.removeEventListener('wheel', this.wheel));
    this.resolveReady();
  }

  attach(host: MapCanvasHost): void { this.host = host; }

  // Town ------------------------------------------------------------------------------------

  get editMapId(): MapId { return this.mapId; }

  /** Load and show a town. A newer request wins over an older one still loading. */
  async show(mapId: MapId): Promise<void> {
    const generation = ++this.loading;
    this.cancelGesture(); this.setSelection([]);
    this.scenery?.destroy(); this.scenery = undefined;
    this.terrain?.destroy(); this.terrain = undefined;
    const previous = this.loaded;
    if (previous && previous !== mapId) {
      this.regionAssets.release(getMap(previous));
      const manifest = this.cache.json.get(sceneryAnimationManifestKey(previous, this.period)) as SceneryAnimationManifest | undefined;
      if (manifest) for (const asset of Object.values(manifest.assets))
        for (const key of [asset.key, ...(asset.base ? [asset.base.key] : []), ...(asset.overlays ?? []).map(overlay => overlay.key)]) if (this.textures.exists(key)) this.textures.remove(key);
      this.thumbnails.clear();
    }
    this.mapId = mapId; this.loaded = mapId;
    await new Promise<void>(resolve => this.regionAssets.load(getMap(mapId), resolve));
    if (generation !== this.loading) return;
    await new Promise<void>(resolve => this.animationAssets.load(mapId, this.period, () => resolve()));
    if (generation !== this.loading) return;
    const scene = getWorldScene(mapId);
    this.terrain = new StreamedWorldTerrain(this, scene, this.period).setDepth(-1e6);
    this.terrainDocument = scene.modularTerrain;
    this.scenery = new WorldScenery(this, mapId, this.period);
    this.drawStatic();
    this.fit();
  }

  /** The document changed: bring sprites up to date and drop selected objects that are gone. */
  refresh(): void {
    if (!this.scenery) return;
    const scene = getWorldScene(this.mapId);
    this.scenery.sync(scene.scenery);
    if (this.terrainDocument !== scene.modularTerrain) {
      this.terrain?.setWorld(scene);
      this.terrainDocument = scene.modularTerrain;
    }
    // A nudge still waiting to publish stays where the keyboard put it.
    if (this.nudge) for (const entry of this.selection) if (entry.kind === 'scenery') this.scenery.previewMove(entry.id, this.nudge.dx, this.nudge.dy);
    const kept = this.selection.filter(item => this.position(item));
    if (kept.length !== this.selection.length) this.setSelection(kept);
    if (this.drag && this.drag.items.some(entry => !this.position(entry.item))) this.cancelGesture();
    this.drawStatic();
  }
  /** Rebuild from scratch after a whole-world import. */
  rebuild(): Promise<void> { this.loaded = undefined; return this.show(this.mapId); }

  /** Terrain drawn from a draft instead of the document, for the terrain tools' preview. */
  previewTerrain(terrain?: ModularTerrain): void {
    const world = getWorldScene(this.mapId);
    this.terrain?.setWorld(terrain ? {...world, modularTerrain: terrain} : world);
    this.terrainDocument = world.modularTerrain;
    this.scenery?.sync(world.scenery, terrain ?? world.modularTerrain);
  }

  /** Object tools stop while another mode, such as terrain, owns the pointer. */
  setActive(active: boolean): void {
    this.active = active;
    if (!active) { this.cancelGesture(); this.hovered = undefined; }
  }

  // Camera ---------------------------------------------------------------------------------

  fit(): void {
    const scene = getWorldScene(this.mapId), camera = this.cameras.main;
    // A hidden page has no size yet; fit once it is shown.
    if (camera.width <= 0 || camera.height <= 0) { this.needsFit = true; return; }
    this.needsFit = false;
    this.zoomTo(Math.min(camera.width / scene.width, camera.height / scene.height) * .96);
    camera.centerOn(scene.width / 2, scene.height / 2);
  }
  /** Zoom around a screen point, by default the middle of the view. */
  zoomTo(zoom: number, screen?: {x: number; y: number}): void {
    const camera = this.cameras.main, at = screen ?? {x: camera.width / 2, y: camera.height / 2};
    const before = camera.getWorldPoint(at.x, at.y);
    camera.setZoom(Phaser.Math.Clamp(zoom, MIN_ZOOM, MAX_ZOOM));
    // Phaser applies a new zoom on the next render; work out the shift directly.
    camera.preRender();
    const after = camera.getWorldPoint(at.x, at.y);
    camera.scrollX += before.x - after.x; camera.scrollY += before.y - after.y;
    this.host?.zoomChanged(camera.zoom);
  }
  zoomBy(factor: number): void { this.zoomTo(this.cameras.main.zoom * factor); }
  get zoom(): number { return this.cameras.main.zoom; }
  /** Bring points into view, zooming in only as far as needed. */
  frame(points: readonly ScenePoint[], minZoom = .8): void {
    if (!points.length) return;
    const camera = this.cameras.main;
    const xs = points.map(point => point.x), ys = points.map(point => point.y);
    const left = Math.min(...xs) - 160, right = Math.max(...xs) + 160, top = Math.min(...ys) - 260, bottom = Math.max(...ys) + 120;
    const fitted = Math.min(camera.width / (right - left), camera.height / (bottom - top));
    this.zoomTo(Math.min(Math.max(camera.zoom, minZoom), fitted, 1.6));
    camera.centerOn((left + right) / 2, (top + bottom) / 2);
  }
  frameSelection(): void { this.frame(this.selection.map(item => this.position(item)!).filter(Boolean)); }

  private wheel = (event: WheelEvent): void => {
    event.preventDefault();
    const camera = this.cameras.main, rect = this.game.canvas.getBoundingClientRect();
    const screen = {x: (event.clientX - rect.left) * camera.width / rect.width, y: (event.clientY - rect.top) * camera.height / rect.height};
    if (wheelIntent(event) === 'zoom') {
      const delta = event.deltaMode === 1 ? event.deltaY * 33 : event.deltaY;
      this.zoomTo(camera.zoom * Math.exp(-Phaser.Math.Clamp(delta, -120, 120) * (event.ctrlKey ? .01 : .0025)), screen);
    } else {
      camera.scrollX += event.deltaX / camera.zoom;
      camera.scrollY += event.deltaY / camera.zoom;
    }
  };

  setTool(tool: MapTool): void { this.tool = tool; this.cancelGesture(); }
  /** Space held down turns the pointer into a hand while it lasts. */
  setSpaceHeld(held: boolean): void { this.spaceHeld = held; if (!held && this.pan && this.tool !== 'hand') this.pan = undefined; }
  get panning(): boolean { return !!this.pan || this.spaceHeld || this.tool === 'hand'; }
  setLayers(layers: MapLayers): void { this.layers = {...layers}; this.drawStatic(); }
  setSnapping(on: boolean): void { this.snapping = on; }

  // Selection --------------------------------------------------------------------------------

  get selected(): readonly MapItem[] { return this.selection; }
  setSelection(items: readonly MapItem[]): void {
    const unique = [...new Map(items.map(item => [item.id, item])).values()];
    if (unique.length === this.selection.length && unique.every((item, index) => item.id === this.selection[index].id)) return;
    this.commitNudge();
    this.selection = unique;
    this.host?.selectionChanged(this.selection);
  }
  selectAll(): void {
    const scene = getWorldScene(this.mapId);
    this.setSelection(scene.scenery.map(item => ({kind: 'scenery' as const, id: item.id})));
  }
  /** Find what a town ID refers to. */
  itemFor(id: string): MapItem | undefined {
    const scene = getWorldScene(this.mapId);
    if (scene.scenery.some(item => item.id === id)) return {kind: 'scenery', id};
    if (scene.npcs.some(item => item.id === id)) return {kind: 'npc', id};
    if (scene.objects.some(item => item.id === id)) return {kind: 'object', id};
    return undefined;
  }

  position(item: MapItem): ScenePoint | undefined {
    const scene = getWorldScene(this.mapId);
    const value = item.kind === 'scenery' ? scene.scenery.find(entry => entry.id === item.id)
      : (item.kind === 'npc' ? scene.npcs : scene.objects).find(entry => entry.id === item.id);
    return value ? {x: value.x, y: value.y} : undefined;
  }
  private sceneryItem(id: string): SceneScenery | undefined { return getWorldScene(this.mapId).scenery.find(item => item.id === id); }

  private anchors(): (MapItem & ScenePoint)[] {
    const scene = getWorldScene(this.mapId);
    return [...scene.npcs.map(anchor => ({kind: 'npc' as const, id: anchor.id, x: anchor.x, y: anchor.y})),
      ...scene.objects.map(anchor => ({kind: 'object' as const, id: anchor.id, x: anchor.x, y: anchor.y}))];
  }

  private pick(x: number, y: number): MapItem | undefined {
    const radius = Math.max(22, 16 / this.cameras.main.zoom);
    let best: {item: MapItem; distance: number} | undefined;
    for (const anchor of this.anchors()) {
      const distance = Math.hypot(anchor.x - x, anchor.y - 20 - y);
      if (distance < radius && (!best || distance < best.distance)) best = {item: {kind: anchor.kind, id: anchor.id}, distance};
    }
    if (best) return best.item;
    const spec = this.scenery?.objectAt(x, y);
    return spec ? {kind: 'scenery', id: spec.id} : undefined;
  }

  // Pointer ------------------------------------------------------------------------------------

  private worldPoint(pointer: Phaser.Input.Pointer): ScenePoint {
    const point = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    return {x: point.x, y: point.y};
  }

  private pointerDown(pointer: Phaser.Input.Pointer): void {
    const event = pointer.event as MouseEvent;
    if (pointer.rightButtonDown() || pointer.middleButtonDown() || this.panning) {
      this.pan = {x: pointer.x, y: pointer.y, scrollX: this.cameras.main.scrollX, scrollY: this.cameras.main.scrollY};
      return;
    }
    if (!this.active || !this.scenery) return;
    const point = this.worldPoint(pointer);
    if (this.placing) { this.placing.x = point.x; this.placing.y = point.y; this.drop(event.shiftKey); return; }
    const target = this.pick(point.x, point.y), additive = event.shiftKey || event.metaKey || event.ctrlKey;
    if (!target) {
      this.marquee = {x: point.x, y: point.y, toX: point.x, toY: point.y, additive, base: additive ? [...this.selection] : []};
      if (!additive) this.setSelection([]);
      return;
    }
    const isSelected = this.selection.some(item => item.id === target.id);
    if (additive) { this.setSelection(isSelected ? this.selection.filter(item => item.id !== target.id) : [...this.selection, target]); return; }
    if (!isSelected) this.setSelection([target]);
    const locks = this.host?.locks() ?? new Map();
    const holder = this.selection.map(item => locks.get(item.id)).find(Boolean);
    if (holder) { this.host?.toast(`${holder} is editing ${objectLabel(getWorldScene(this.mapId), target.id)} right now.`); return; }
    this.commitNudge();
    this.drag = {items: this.selection.map(item => ({item, ...this.position(item)!})), startX: point.x, startY: point.y, dx: 0, dy: 0, moved: false, verdict: 'ok', checkedAt: 0};
  }

  private pointerMove(pointer: Phaser.Input.Pointer): void {
    if (this.pan) {
      const camera = this.cameras.main;
      camera.scrollX = this.pan.scrollX - (pointer.x - this.pan.x) / camera.zoom;
      camera.scrollY = this.pan.scrollY - (pointer.y - this.pan.y) / camera.zoom;
      return;
    }
    const point = this.worldPoint(pointer), scene = getWorldScene(this.mapId);
    this.host?.pointer(point.x >= 0 && point.y >= 0 && point.x <= scene.width && point.y <= scene.height ? point : undefined);
    if (!this.active) return;
    const event = pointer.event as MouseEvent;
    if (this.placing) {
      const at = this.snapping !== event.altKey ? {x: snap(point.x), y: snap(point.y)} : point;
      this.placing.x = at.x; this.placing.y = at.y;
      this.placing.verdict = this.verdict([{kind: 'place', map: this.mapId, item: newPlacement(scene, this.placing.choice, at)}]);
      return;
    }
    if (this.marquee) { this.marquee.toX = point.x; this.marquee.toY = point.y; this.updateMarquee(); return; }
    if (!this.drag) { this.hovered = this.pick(point.x, point.y); return; }
    const drag = this.drag;
    let dx = point.x - drag.startX, dy = point.y - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) * this.cameras.main.zoom < DRAG_THRESHOLD) return;
    drag.moved = true;
    // Shift keeps the move on one axis.
    if (event.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
    const lead = drag.items[0];
    if (this.snapping !== event.altKey) { dx = snap(lead.x + dx) - lead.x; dy = snap(lead.y + dy) - lead.y; }
    drag.dx = Math.round(dx); drag.dy = Math.round(dy);
    const now = performance.now();
    if (now - drag.checkedAt > 60) { drag.checkedAt = now; drag.verdict = this.verdict(this.moveOps(drag.dx, drag.dy, drag.items)); }
    for (const entry of drag.items) if (entry.item.kind === 'scenery') this.scenery?.previewMove(entry.item.id, drag.dx, drag.dy, drag.verdict !== 'error');
  }

  private pointerUp(): void {
    if (this.pan) { this.pan = undefined; return; }
    if (this.marquee) { this.marquee = undefined; return; }
    const drag = this.drag;
    this.drag = undefined;
    if (!drag?.moved) return;
    const ops = this.moveOps(drag.dx, drag.dy, drag.items);
    const done = ops.length > 0 && this.host!.commit(ops, drag.items.length === 1 ? `Move ${objectLabel(getWorldScene(this.mapId), drag.items[0].item.id)}` : `Move ${drag.items.length} objects`);
    // A published move redraws the objects in place; a refused one springs back.
    if (!done) this.scenery?.clearPreview();
  }

  private updateMarquee(): void {
    const box = this.marquee!, left = Math.min(box.x, box.toX), right = Math.max(box.x, box.toX), top = Math.min(box.y, box.toY), bottom = Math.max(box.y, box.toY);
    const scene = getWorldScene(this.mapId), inside = (point: ScenePoint) => point.x >= left && point.x <= right && point.y >= top && point.y <= bottom;
    const found: MapItem[] = [
      ...scene.scenery.filter(inside).map(item => ({kind: 'scenery' as const, id: item.id})),
      ...this.anchors().filter(inside).map(anchor => ({kind: anchor.kind, id: anchor.id})),
    ];
    this.setSelection(box.additive ? [...box.base, ...found] : found);
  }

  private moveOps(dx: number, dy: number, items: readonly {item: MapItem; x: number; y: number}[]): WorldEditOp[] {
    if (!dx && !dy) return [];
    return items.map(({item, x, y}) => item.kind === 'scenery' ? {kind: 'move' as const, map: this.mapId, id: item.id, x: x + dx, y: y + dy}
      : {kind: 'moveAnchor' as const, map: this.mapId, anchor: item.kind, id: item.id, x: x + dx, y: y + dy});
  }

  /**
   * How a gesture would land, fast enough to run while dragging: 'error' would be
   * refused, 'warning' publishes with a note. Routes are checked when publishing.
   */
  verdict(ops: WorldEditOp[]): Verdict {
    if (!ops.length) return 'ok';
    try {
      const result = applyEditOps(sceneDocument, ops), before = getWorldScene(this.mapId), after = result.document.maps[this.mapId];
      const problems = placementProblems(before, after, result.changed.get(this.mapId) ?? new Set(), undefined, result.restored);
      return problems.some(problem => problem.severity === 'error') ? 'error' : problems.length ? 'warning' : 'ok';
    } catch { return 'error'; }
  }

  // Keyboard nudging ------------------------------------------------------------------------------

  /** Move the selection by a few units. Repeated presses publish as one edit once the keys rest. */
  nudgeBy(dx: number, dy: number): void {
    if (!this.selection.length || this.drag) return;
    const locks = this.host?.locks() ?? new Map();
    if (this.selection.some(item => locks.has(item.id))) return;
    const nudge = this.nudge ?? {dx: 0, dy: 0, timer: 0};
    window.clearTimeout(nudge.timer);
    nudge.dx += dx; nudge.dy += dy;
    nudge.timer = window.setTimeout(() => this.commitNudge(), 450);
    this.nudge = nudge;
    for (const item of this.selection) if (item.kind === 'scenery') this.scenery?.previewMove(item.id, nudge.dx, nudge.dy);
  }
  /** Publish a nudge now, for example before the selection changes. */
  commitNudge(): void {
    const nudge = this.nudge;
    if (!nudge) return;
    this.nudge = undefined;
    window.clearTimeout(nudge.timer);
    const items = this.selection.map(item => ({item, ...this.position(item)!})).filter(entry => entry.x !== undefined);
    const ops = this.moveOps(nudge.dx, nudge.dy, items);
    if (!ops.length || !this.host!.commit(ops, items.length === 1 ? `Nudge ${objectLabel(getWorldScene(this.mapId), items[0].item.id)}` : `Nudge ${items.length} objects`)) this.scenery?.clearPreview();
  }

  // Placing ----------------------------------------------------------------------------------------

  get placingChoice(): PaletteChoice | undefined { return this.placing?.choice; }

  startPlacing(choice: PaletteChoice): void {
    this.cancelGesture();
    this.setSelection([]);
    const pointer = this.input.activePointer, point = this.worldPoint(pointer);
    this.placing = {choice, x: point.x, y: point.y, verdict: 'ok'};
    const thumbnail = this.thumbnail(choice.frame);
    if (thumbnail) {
      // A fresh key per placement: towns share frame names.
      const key = `map-ghost-${++this.ghostSequence}`;
      this.placing.ghostKey = key;
      const show = () => {
        if (this.placing?.choice !== choice) return;
        const width = newPlacement(getWorldScene(this.mapId), choice, {x: 0, y: 0}).width;
        this.placing.ghost = this.add.image(0, 0, key).setOrigin(.5, 1).setAlpha(.72).setDepth(this.overlay.depth - 1);
        this.placing.ghost.setScale(width / Math.max(1, this.placing.ghost.width));
      };
      this.textures.once(`addtexture-${key}`, show);
      if (thumbnail.startsWith('data:')) this.textures.addBase64(key, thumbnail);
      else { this.load.image(key, thumbnail); if (!this.load.isLoading()) this.load.start(); }
    }
    this.host?.placingChanged(choice);
  }

  cancelPlacing(): void {
    const placing = this.placing;
    if (!placing) return;
    this.placing = undefined;
    placing.ghost?.destroy();
    if (placing.ghostKey) {
      this.textures.off(`addtexture-${placing.ghostKey}`);
      if (this.textures.exists(placing.ghostKey)) this.textures.remove(placing.ghostKey);
    }
    this.host?.placingChanged(undefined);
  }

  /** Place the object under the pointer. With `keep`, carry on placing the same kind. */
  private drop(keep: boolean): void {
    const placing = this.placing!;
    const scene = getWorldScene(this.mapId), item = newPlacement(scene, placing.choice, placing);
    if (!this.host!.place(item)) return;
    if (keep) return;
    this.cancelPlacing();
    this.setSelection([{kind: 'scenery', id: item.id}]);
  }

  /** Cancel whatever the pointer is doing. Returns false when nothing was going on. */
  cancelGesture(): boolean {
    let cancelled = false;
    if (this.placing) { this.cancelPlacing(); cancelled = true; }
    if (this.drag) { if (this.drag.moved) this.scenery?.clearPreview(); this.drag = undefined; cancelled = true; }
    if (this.marquee) { this.marquee = undefined; cancelled = true; }
    if (this.nudge) { window.clearTimeout(this.nudge.timer); this.nudge = undefined; this.scenery?.clearPreview(); cancelled = true; }
    return cancelled;
  }

  // Artwork ---------------------------------------------------------------------------------------

  /** A small picture of an object's artwork from the loaded town, cached per town. */
  thumbnail(frame: string): string | undefined {
    if (!this.thumbnails.has(frame) || !this.thumbnails.get(frame)) this.thumbnails.set(frame, sceneryThumbnail(this, this.mapId, this.period, frame));
    return this.thumbnails.get(frame);
  }

  // Drawing -----------------------------------------------------------------------------------------

  private footprint(item: SceneScenery): readonly (readonly (readonly [number, number])[])[] {
    return sceneryFootprints([item], getSceneryGeometryMap(this.mapId));
  }

  /** Layers that only change with the document: walking areas and footprints. */
  private drawStatic(): void {
    const g = this.staticOverlay;
    g.clear();
    if (!this.scenery) return;
    const scene = getWorldScene(this.mapId);
    if (this.layers.walkable) {
      const geometry = sceneNavigationGeometry(scene);
      g.fillStyle(0x7fd0a0, .16);
      for (const polygon of geometry.ground) fillPolygon(g, polygon);
      g.fillStyle(0xe4645a, .28);
      for (const polygon of geometry.barriers) fillPolygon(g, polygon);
    }
    if (this.layers.footprints) {
      g.lineStyle(1.5, 0xfff4d8, .8);
      for (const polygon of sceneryFootprints(scene.scenery, getSceneryGeometryMap(this.mapId))) {
        g.beginPath(); polygon.forEach(([x, y], index) => index ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath(); g.strokePath();
      }
    }
  }

  private outline(item: MapItem, color: number, width: number, offset: ScenePoint = {x: 0, y: 0}): void {
    const g = this.overlay, zoom = this.cameras.main.zoom;
    g.lineStyle(width / zoom, color, .95);
    if (item.kind === 'scenery') {
      const value = this.sceneryItem(item.id), bounds = this.scenery?.boundsOf(item.id);
      if (bounds) g.strokeRect(bounds.x + offset.x, bounds.y + offset.y, bounds.right - bounds.x, bounds.bottom - bounds.y);
      if (value) for (const polygon of this.footprint(value)) {
        g.beginPath(); polygon.forEach(([x, y], index) => index ? g.lineTo(x + offset.x, y + offset.y) : g.moveTo(x + offset.x, y + offset.y)); g.closePath(); g.strokePath();
      }
      if (value?.interior) {
        const door = sceneEntrancePoint(getWorldScene(this.mapId), value);
        g.fillStyle(color, .9).fillCircle(door.x + offset.x, door.y + offset.y, 6 / zoom);
      }
      return;
    }
    const anchor = this.position(item);
    if (anchor) g.strokeCircle(anchor.x + offset.x, anchor.y - 20 + offset.y, 22 / zoom);
  }

  private label(index: number, text: string, x: number, y: number, color = '#fff', background = '#132a22d0'): number {
    let label = this.labels[index];
    if (!label) {
      label = this.add.text(0, 0, '', {fontFamily: 'DM Sans, Arial, sans-serif', fontSize: '13px', padding: {x: 6, y: 3}}).setOrigin(.5, 0).setDepth(1e7 + 1);
      this.labels[index] = label;
    }
    if (label.text !== text) label.setText(text);
    label.setColor(color).setBackgroundColor(background).setPosition(x, y).setScale(1 / this.cameras.main.zoom).setVisible(true);
    return index + 1;
  }

  update(time: number): void {
    const camera = this.cameras.main, view = camera.worldView;
    if (this.needsFit && camera.width > 0 && this.scenery) this.fit();
    this.terrain?.update(view, camera.zoom);
    this.scenery?.update(time / 1000, view);
    this.drawOverlay();
  }

  private drawOverlay(): void {
    const g = this.overlay, zoom = this.cameras.main.zoom, view = this.cameras.main.worldView;
    g.clear();
    if (!this.scenery) return;
    const scene = getWorldScene(this.mapId), locks = this.host?.locks() ?? new Map<string, string>();
    let labels = 0;
    if (this.layers.grid && zoom >= .35) {
      g.lineStyle(1 / zoom, 0x132a22, .14);
      const step = zoom < .7 ? GRID_SIZE * 4 : GRID_SIZE;
      for (let x = Math.floor(view.x / step) * step; x <= view.right; x += step) g.lineBetween(x, Math.max(0, view.y), x, Math.min(scene.height, view.bottom));
      for (let y = Math.floor(view.y / step) * step; y <= view.bottom; y += step) g.lineBetween(Math.max(0, view.x), y, Math.min(scene.width, view.right), y);
    }
    // Story characters and evidence, which play draws as people and markers.
    const selected = new Set(this.selection.map(item => item.id)), offset = this.drag?.moved ? {x: this.drag.dx, y: this.drag.dy} : this.nudge ? {x: this.nudge.dx, y: this.nudge.dy} : {x: 0, y: 0};
    const names: {text: string; x: number; y: number; rank: number}[] = [];
    for (const anchor of this.anchors()) {
      const moving = selected.has(anchor.id), x = anchor.x + (moving ? offset.x : 0), y = anchor.y + (moving ? offset.y : 0);
      const color = anchor.kind === 'npc' ? 0xf3c76a : 0x9fd3e0;
      g.fillStyle(0x132a22, .88).fillCircle(x, y - 20, 13 / zoom);
      g.lineStyle(2.5 / zoom, color, 1).strokeCircle(x, y - 20, 13 / zoom);
      g.fillStyle(color, 1).fillCircle(x, y - 20, 4 / zoom);
      const focused = moving || this.hovered?.id === anchor.id;
      if (this.layers.labels && (zoom >= LABEL_ZOOM || focused))
        names.push({text: capitalName(objectLabel(scene, anchor.id)), x, y: y - 2, rank: focused ? 0 : anchor.kind === 'npc' ? 1 : 2});
    }
    // Names never pile up: a name that would cover a more important one waits until hovered.
    const placed: {left: number; right: number; top: number; bottom: number}[] = [];
    for (const name of names.sort((a, b) => a.rank - b.rank)) {
      const width = (name.text.length * 7 + 14) / zoom, box = {left: name.x - width / 2, right: name.x + width / 2, top: name.y, bottom: name.y + 22 / zoom};
      if (name.rank && placed.some(other => box.left < other.right && box.right > other.left && box.top < other.bottom && box.bottom > other.top)) continue;
      placed.push(box);
      labels = this.label(labels, name.text, name.x, name.y);
    }
    for (const [id, name] of locks) {
      const item = this.itemFor(id), position = item && this.position(item);
      if (!item || !position) continue;
      this.outline(item, LOCKED, 2);
      labels = this.label(labels, `${name} is editing`, position.x, position.y + 6, '#ffd2cc', '#4a1f1cd8');
    }
    if (this.hovered && !selected.has(this.hovered.id) && !locks.has(this.hovered.id) && !this.drag && !this.marquee) this.outline(this.hovered, HOVER, 1.5);
    const dragging = !!this.drag?.moved || !!this.nudge;
    const tones = {ok: VALID, warning: WARN, error: INVALID}, color = this.drag?.moved ? tones[this.drag.verdict] : SELECT;
    for (const item of this.selection) this.outline(item, color, 2.5, dragging ? offset : undefined);
    if (this.selection.length > 1) {
      // One frame around a group, so the whole selection reads as one thing.
      const points = this.selection.flatMap(item => {
        const bounds = item.kind === 'scenery' ? this.scenery?.boundsOf(item.id) : undefined, at = this.position(item);
        return bounds ? [{x: bounds.x, y: bounds.y}, {x: bounds.right, y: bounds.bottom}] : at ? [{x: at.x - 20, y: at.y - 40}, {x: at.x + 20, y: at.y}] : [];
      });
      if (points.length) {
        const left = Math.min(...points.map(p => p.x)) + offset.x * +dragging, top = Math.min(...points.map(p => p.y)) + offset.y * +dragging;
        const right = Math.max(...points.map(p => p.x)) + offset.x * +dragging, bottom = Math.max(...points.map(p => p.y)) + offset.y * +dragging;
        g.lineStyle(1.5 / zoom, SELECT, .7).strokeRect(left - 8 / zoom, top - 8 / zoom, right - left + 16 / zoom, bottom - top + 16 / zoom);
      }
    }
    if (this.marquee) {
      const box = this.marquee;
      g.fillStyle(MARQUEE, .12).fillRect(Math.min(box.x, box.toX), Math.min(box.y, box.toY), Math.abs(box.toX - box.x), Math.abs(box.toY - box.y));
      g.lineStyle(1.5 / zoom, MARQUEE, .9).strokeRect(Math.min(box.x, box.toX), Math.min(box.y, box.toY), Math.abs(box.toX - box.x), Math.abs(box.toY - box.y));
    }
    if (this.placing) {
      const item = newPlacement(scene, this.placing.choice, this.placing), tone = {ok: VALID, warning: WARN, error: INVALID}[this.placing.verdict];
      g.lineStyle(2 / zoom, tone, .95);
      for (const polygon of this.footprint(item)) { g.beginPath(); polygon.forEach(([x, y], index) => index ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath(); g.strokePath(); }
      this.placing.ghost?.setPosition(this.placing.x, this.placing.y).setTint(this.placing.verdict === 'error' ? 0xff9a8a : 0xffffff).setFlipX(false);
    }
    for (let index = labels; index < this.labels.length; index++) if (this.labels[index].visible) this.labels[index].setVisible(false);
    this.game.canvas.style.cursor = this.pan ? 'grabbing' : this.panning ? 'grab' : this.placing ? 'crosshair' : this.drag?.moved ? 'move' : this.hovered && this.active ? 'pointer' : 'default';
  }
}
