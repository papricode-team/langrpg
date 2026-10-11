import type * as Phaser from 'phaser';
import type {SceneTerrain, WorldScene} from './scene-schema';
import {sceneTerrainImage} from './scene-terrain';
import {TerrainResidency, visibleTerrain, type TerrainAsset, type TerrainView} from './terrain-residency';
import {worldAssetUrl} from './world-asset-url';

const pools = new WeakMap<Phaser.Scene, TerrainResidency>();
export function terrainResidency(scene: Phaser.Scene): TerrainResidency {
  let pool = pools.get(scene);
  if (!pool) {
    pool = new TerrainResidency({
      exists: key => scene.textures.exists(key),
      pixels: key => {const image = scene.textures.get(key).getSourceImage() as {width:number;height:number};return image.width*image.height;},
      remove: key => {if (scene.textures.exists(key)) scene.textures.remove(key);},
      load: asset => new Promise<boolean>(resolve => {
        if (scene.textures.exists(asset.key)) {resolve(true);return;}
        const event = `filecomplete-image-${asset.key}`;
        let finished = false;
        const done = (ready:boolean):void => {
          if (finished) return; finished = true;
          scene.load.off(event, loaded); scene.load.off('loaderror', failed); scene.events.off('shutdown', shutdown);
          resolve(ready);
        };
        const loaded = ():void => done(true);
        const failed = (file: {key:string}):void => {if (file.key === asset.key) done(false);};
        const shutdown = ():void => done(false);
        scene.load.once(event, loaded);scene.load.on('loaderror', failed);scene.events.once('shutdown', shutdown);
        scene.load.image(asset.key, worldAssetUrl(asset.asset));
        if (!scene.load.isLoading()) scene.load.start();
      }),
    });
    pools.set(scene, pool);
    scene.events.once('shutdown', () => {pool!.dispose();pools.delete(scene);});
  }
  return pool;
}

interface DisplayedTile {image:Phaser.GameObjects.Image; key:string; density:number;}
/** View-local terrain. Overview images cover loading detail without stretching the core. */
export class StreamedWorldTerrain {
  private root: Phaser.GameObjects.Container;
  private images = new Map<string, DisplayedTile>();
  private pool: TerrainResidency;
  private lastView: TerrainView = {x:0,y:0,width:0,height:0};
  private wanted: SceneTerrain[] = [];
  private tint = 0xffffff;
  private enabled = true;
  destroyed = false;
  constructor(private scene: Phaser.Scene, private world: WorldScene, readonly period: 'day'|'night') {
    this.root = scene.add.container(0,0).setDepth(-1000);
    this.pool = terrainResidency(scene);
  }
  get alpha():number {return this.root.alpha;}
  get visible():boolean {return this.root.visible;}
  get nativeSize():{width:number;height:number} {
    const density = this.images.size ? Math.min(...[...this.images.values()].map(tile=>tile.density)) : 0;
    return {width: this.world.width*density,height: this.world.height*density};
  }
  get ready():boolean {
    return visibleTerrain(this.world.terrain,this.lastView).every(tile => this.images.has(tile.id));
  }
  private preview(tile:SceneTerrain):TerrainAsset|undefined {
    const asset = this.period === 'night' && tile.nightAsset ? tile.nightPreviewAsset : tile.dayPreviewAsset;
    return asset ? {key:asset.replace(/^\/assets\//,'').replace(/\.[^.]+$/,''),asset} : undefined;
  }
  update(view:TerrainView, zoom=1):void {
    if (this.destroyed || !this.enabled) return;
    this.lastView = {...view};
    const visible = visibleTerrain(this.world.terrain,view);
    // Prefetch lightweight overviews one short walk ahead. Detail is limited
    // to the actual view plus a small margin; fit-to-world uses overviews.
    this.wanted = visibleTerrain(this.world.terrain,view,192);
    let pixelsLeft = 32*1024*1024;
    const detailed = new Set<string>();
    if (zoom > 1) for (const tile of visibleTerrain(this.world.terrain,view,48)) {
      const pixels = tile.width*tile.height*(tile.pixelDensity ?? 1)**2;
      if (pixels <= pixelsLeft) {detailed.add(tile.id);pixelsLeft-=pixels;}
    }
    const assets:TerrainAsset[] = [];
    const wantedIds = new Set(this.wanted.map(tile => tile.id));
    for (const [id,display] of this.images) if (!wantedIds.has(id)) {display.image.destroy();this.images.delete(id);}
    for (const [index,tile] of this.wanted.entries()) {
      const detail = sceneTerrainImage(tile,this.period), preview = this.preview(tile);
      if (preview) assets.push({...preview,priority: visible.some(value=>value.id===tile.id)?index:index+100});
      if (!preview || detailed.has(tile.id)) assets.push({...detail,priority:index+200});
      const useDetail = (!preview || detailed.has(tile.id)) && this.scene.textures.exists(detail.key);
      const key = useDetail ? detail.key : preview?.key;
      const existing = this.images.get(tile.id);
      if (!key || !this.scene.textures.exists(key)) continue;
      if (existing?.key === key) continue;
      existing?.image.destroy();
      const crop = useDetail ? detail.crop : undefined;
      const frame = crop ? `terrain-${crop.x}-${crop.y}-${crop.width}-${crop.height}` : undefined;
      if (crop && frame) {
        const texture = this.scene.textures.get(key);
        if (!texture.has(frame)) texture.add(frame,0,crop.x,crop.y,crop.width,crop.height);
      }
      const image = this.scene.add.image(tile.x,tile.y,key,frame).setOrigin(0)
        .setDisplaySize(tile.width,tile.height).setTint(this.tint);
      this.root.add(image);this.images.set(tile.id,{image,key,density:useDetail ? tile.pixelDensity ?? 1 : 1});
    }
    // Destroy or replace rendered images before releasing their texture lease.
    for (const display of this.images.values()) if (!assets.some(asset=>asset.key===display.key)) {
      // Keep the old detail until a requested overview is ready after zooming out.
      const tile = this.world.terrain.find(value=>this.images.get(value.id)===display)!;
      const source = sceneTerrainImage(tile,this.period);
      assets.push({key:display.key,asset:source.asset,priority:500});
    }
    this.pool.retain(this,assets);
  }
  setDepth(depth:number):this {this.root.setDepth(depth);return this;}
  setAlpha(alpha:number):this {this.root.setAlpha(alpha);return this;}
  setTint(tint:number):this {this.tint=tint;for(const value of this.images.values())value.image.setTint(tint);return this;}
  setVisible(visible:boolean):this {
    this.root.setVisible(visible);this.enabled=visible;
    if (!visible) {for(const value of this.images.values())value.image.destroy();this.images.clear();this.pool.release(this);}
    return this;
  }
  destroy():void {
    if (this.destroyed) return;this.destroyed=true;
    this.root.destroy();this.images.clear();this.pool.release(this);
  }
}
