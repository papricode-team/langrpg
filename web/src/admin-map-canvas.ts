import type {ModularTerrain} from './modular-terrain';
/**
 * The admin area's map view. It draws a town with the same terrain and scenery
 * renderers as play and hosts the same edit controller as in-game edit mode.
 */
import * as Phaser from 'phaser';
import {getMap,type MapId} from './maps';
import {createMapNavigation,type NavigationGrid} from './navigation';
import {getWorldScene} from './scene-data';
import {sceneNavigationGeometry} from './scene-navigation';
import {sceneryAnimationManifestKey,type SceneryAnimationManifest} from './scenery-animation';
import {StreamedWorldTerrain} from './streamed-world-terrain';
import {WorldAnimationAssets} from './world-animation-assets';
import {WorldMapAssets} from './world-map-assets';
import {WorldScenery} from './world-scenery';
import {objectLabel} from './world-edit-rules';
import {editingControlFocused,sceneryThumbnail,WorldEditController,type EditBridge,type EditSurface} from './world-edit-mode';

export class AdminMapScene extends Phaser.Scene implements EditSurface {
  private terrainEditing=false;
  private terrainDocument?:ModularTerrain;
  private mapId: MapId = 'lindenhafen';
  private readonly period = 'day' as const;
  private scenery?: WorldScenery;
  private terrain?: StreamedWorldTerrain;
  private navigation?: NavigationGrid;
  private regionAssets!: WorldMapAssets;
  private animationAssets!: WorldAnimationAssets;
  private markers!: Phaser.GameObjects.Graphics;
  private labels: Phaser.GameObjects.Text[] = [];
  private controller?: WorldEditController;
  private pan?: {x: number; y: number; scrollX: number; scrollY: number};
  private space?: Phaser.Input.Keyboard.Key;
  private keys?: Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>;
  private loaded?: MapId;
  private loading = 0;
  private needsFit = false;
  private resolveReady!: () => void;
  readonly created = new Promise<void>(resolve => { this.resolveReady = resolve; });

  constructor() { super('admin-map'); }

  create(): void {
    this.cameras.main.setBackgroundColor('#c8d0bc');
    this.regionAssets = new WorldMapAssets(this, false);
    this.animationAssets = new WorldAnimationAssets(this, false);
    this.markers = this.add.graphics().setDepth(1e7);
    this.input.mouse?.disableContextMenu();
    this.space = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE, false);
    this.keys = this.input.keyboard?.addKeys({up: 'W', down: 'S', left: 'A', right: 'D'}, false) as typeof this.keys;
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.rightButtonDown() || pointer.middleButtonDown() || (this.space?.isDown && !editingControlFocused())) this.pan = {x: pointer.x, y: pointer.y, scrollX: this.cameras.main.scrollX, scrollY: this.cameras.main.scrollY};
    });
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!this.pan) return;
      const camera = this.cameras.main;
      camera.scrollX = this.pan.scrollX - (pointer.x - this.pan.x) / camera.zoom;
      camera.scrollY = this.pan.scrollY - (pointer.y - this.pan.y) / camera.zoom;
    });
    const stop = () => { this.pan = undefined; };
    this.input.on('pointerup', stop); this.input.on('pointerupoutside', stop);
    this.input.on('wheel', (pointer: Phaser.Input.Pointer, _objects: unknown[], _x: number, y: number) => {
      const camera = this.cameras.main, before = camera.getWorldPoint(pointer.x, pointer.y);
      camera.setZoom(Phaser.Math.Clamp(camera.zoom * (y > 0 ? .9 : 1.1), .15, 3));
      const after = camera.getWorldPoint(pointer.x, pointer.y);
      camera.scrollX += before.x - after.x; camera.scrollY += before.y - after.y;
    });
    this.resolveReady();
  }

  /** Load and show a town, then attach the editor. */
  async show(mapId: MapId, bridge: EditBridge): Promise<void> {
    // A newer request wins; an older one stops after each wait.
    const generation = ++this.loading;
    this.controller?.destroy(); this.controller = undefined;
    this.scenery?.destroy(); this.scenery = undefined;
    this.terrain?.destroy(); this.terrain = undefined;
    const previous = this.loaded;
    if (previous && previous !== mapId) {
      this.regionAssets.release(getMap(previous));
      const manifest = this.cache.json.get(sceneryAnimationManifestKey(previous, this.period)) as SceneryAnimationManifest | undefined;
      if (manifest) for (const asset of Object.values(manifest.assets))
        for (const key of [asset.key, ...(asset.base ? [asset.base.key] : []), ...(asset.overlays ?? []).map(overlay => overlay.key)]) if (this.textures.exists(key)) this.textures.remove(key);
    }
    this.mapId = mapId; this.loaded = mapId;
    await new Promise<void>(resolve => this.regionAssets.load(getMap(mapId), resolve));
    if (generation !== this.loading) return;
    await new Promise<void>(resolve => this.animationAssets.load(mapId, this.period, () => resolve()));
    if (generation !== this.loading) return;
    const scene = getWorldScene(mapId);
    this.terrain = new StreamedWorldTerrain(this, scene, this.period).setDepth(-1e6);
    this.terrainDocument=scene.modularTerrain;
    this.scenery = new WorldScenery(this, mapId, this.period);
    this.navigation = createMapNavigation(mapId);
    this.fit();
    if(!this.terrainEditing)this.controller = new WorldEditController(this, bridge);
  }

  /** The published document changed: bring sprites and navigation up to date. */
  refresh(): void {
    if (!this.navigation) return;
    const scene = getWorldScene(this.mapId);
    this.scenery?.sync(scene.scenery);
    if(this.terrainDocument!==scene.modularTerrain){
      this.terrain?.destroy();
      this.terrain=new StreamedWorldTerrain(this,scene,this.period).setDepth(-1e6);
      this.terrainDocument=scene.modularTerrain;
    }
    this.navigation = this.navigation.withObstacles(sceneNavigationGeometry(scene).barriers);
    this.controller?.documentChanged();
  }
  /** Rebuild from scratch after a whole-world import. */
  rebuild(bridge: EditBridge): Promise<void> { this.loaded = undefined; return this.show(this.mapId, bridge); }

  fit(): void {
    const scene = getWorldScene(this.mapId), camera = this.cameras.main;
    // A hidden page has no size yet; fit once it is shown.
    if (camera.width <= 0 || camera.height <= 0) { this.needsFit = true; return; }
    this.needsFit = false;
    camera.setZoom(Math.min(camera.width / scene.width, camera.height / scene.height) * .96).centerOn(scene.width / 2, scene.height / 2);
  }
  /** Center the view on a problem. */
  focus(point: {x: number; y: number}): void {
    const camera = this.cameras.main;
    camera.setZoom(Math.max(camera.zoom, .8)).centerOn(point.x, point.y);
  }
  previewTerrain(terrain?:ModularTerrain):void{
    const world=getWorldScene(this.mapId);this.terrain?.destroy();
    this.terrain=new StreamedWorldTerrain(this,terrain?{...world,modularTerrain:terrain}:world,this.period).setDepth(-1e6);
    this.terrainDocument=world.modularTerrain;
  }
  setTerrainEditing(active:boolean,bridge:EditBridge):void{
    this.terrainEditing=active;this.controller?.destroy();this.controller=undefined;
    if(!active)this.controller=new WorldEditController(this,bridge);
  }
  get editor(): WorldEditController | undefined { return this.controller; }

  // EditSurface ---------------------------------------------------------------------
  get editMapId(): string { return this.mapId; }
  editScenery(): WorldScenery | undefined { return this.scenery; }
  editNavigation(): NavigationGrid { return this.navigation ?? createMapNavigation(this.mapId); }
  editAnchors(): {kind: 'npc' | 'object'; id: string; x: number; y: number}[] {
    const scene = getWorldScene(this.mapId);
    return [...scene.npcs.map(anchor => ({kind: 'npc' as const, id: anchor.id, x: anchor.x, y: anchor.y})),
      ...scene.objects.map(anchor => ({kind: 'object' as const, id: anchor.id, x: anchor.x, y: anchor.y}))];
  }
  editThumbnail(frame: string): string | undefined { return sceneryThumbnail(this, this.mapId, this.period, frame); }
  editPanning(): boolean { return !!this.pan || (!!this.space?.isDown && !editingControlFocused()); }

  update(time: number, delta: number): void {
    const camera = this.cameras.main, view = camera.worldView;
    if (this.needsFit && camera.width > 0 && this.navigation) this.fit();
    if (this.keys && !editingControlFocused()) {
      const step = delta * .6 / camera.zoom;
      if (this.keys.left.isDown) camera.scrollX -= step;
      if (this.keys.right.isDown) camera.scrollX += step;
      if (this.keys.up.isDown) camera.scrollY -= step;
      if (this.keys.down.isDown) camera.scrollY += step;
    }
    this.terrain?.update(view, camera.zoom);
    this.scenery?.update(time / 1000, view);
    this.drawMarkers();
    this.controller?.update();
  }

  /** Story characters and evidence, which play draws as people and markers. */
  private drawMarkers(): void {
    const g = this.markers, zoom = this.cameras.main.zoom, scene = getWorldScene(this.mapId);
    g.clear();
    let index = 0;
    for (const anchor of this.editAnchors()) {
      const color = anchor.kind === 'npc' ? 0xf3c76a : 0x9fd3e0;
      g.fillStyle(0x132a22, .85).fillCircle(anchor.x, anchor.y - 20, 14 / zoom);
      g.lineStyle(2 / zoom, color, 1).strokeCircle(anchor.x, anchor.y - 20, 14 / zoom);
      let label = this.labels[index];
      if (!label) {
        label = this.add.text(0, 0, '', {fontFamily: 'DM Sans, Arial, sans-serif', fontSize: '13px', color: '#fff', backgroundColor: '#132a22cc', padding: {x: 5, y: 2}}).setOrigin(.5, 0).setDepth(1e7 + 1);
        this.labels[index] = label;
      }
      label.setText(objectLabel(scene, anchor.id)).setPosition(anchor.x, anchor.y - 2).setScale(1 / zoom).setVisible(true);
      index++;
    }
    for (let rest = index; rest < this.labels.length; rest++) this.labels[rest].setVisible(false);
  }
}

