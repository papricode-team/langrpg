import Phaser from 'phaser';
import { getMap, type MapId } from './maps';
import { WorldScenery } from './world-scenery';
import { StreamedWorldTerrain } from './streamed-world-terrain';
import { WorldMapAssets } from './world-map-assets';
import { WorldAnimationAssets } from './world-animation-assets';
import { sceneryAnimationManifestKey, type SceneryAnimationManifest } from './scenery-animation';
import { sceneryTextureFor } from './placed-scenery';
import {sceneNavigationGeometry} from './scene-navigation';
import { sceneActivityPlaces, sceneEntrancePoint, type WorldScene, type SceneScenery } from './scene-schema';
import {ResidentActivityWorld} from './resident-activities';
import type {WorldWeatherMode} from './world-weather';
import {NavigationGrid} from './navigation';
import {scenerySelection,sceneryTranslation} from './level-editor-model';
import {marqueeSelection} from './level-editor-selection';
import {paletteTemplates,type PaletteFrame} from './level-editor-object-tools';

export interface EditorCanvasCallbacks {
  select(ids: string[]): void;
  beginDrag(): void;
  cancelDrag(): void;
  drag(positions: Map<string, {x:number;y:number}>, final: boolean): void;
  beginStroke(mode:'brush'|'erase',point:{x:number;y:number},individual:boolean):void;
  stroke(point:{x:number;y:number}):void;
  endStroke(cancelled:boolean):void;
  place(x: number, y: number): void;
  pointer(x: number, y: number): void;
  ready(): void;
  zone(rectangle: {x:number;y:number;width:number;height:number}): void;
}
export interface PaletteItem { asset: SceneScenery['asset']; frame: string; variant: boolean; width: number; motion?:SceneScenery['motion']; thumbnail?: string; }

/** The editor renders through the same WorldScenery implementation as play. */
export class LevelEditorCanvas extends Phaser.Scene {
  world!: WorldScene;
  selected = new Set<string>();
  editable = true;
  placing = false;
  panMode = false;
  spacePan = false;
  boxMode = false;
  paintMode?:'brush'|'erase';
  paintRadius=32;
  private painting=false;
  private cursorPoint?:{x:number;y:number};
  hidden = new Set<string>();
  locked = new Set<string>();
  zoneMode = false;
  gridVisible = false;
  navigationVisible = false;
  period: 'day' | 'night' = 'day';
  snap = 0;
  private residentHour?:number;
  private residentWeather:WorldWeatherMode='regional';
  private residentGuide?:{world:WorldScene;simulation:ResidentActivityWorld};
  private guideWorld?:WorldScene;
  showResidentGuide(hour:number|undefined,weather:WorldWeatherMode='regional'):void{
    this.residentWeather=weather;
    if(hour!==undefined){const world=this.guideWorld??this.world;this.residentGuide={world,simulation:this.residentSimulation(world)};}
    this.residentHour=hour;this.drawGuides();
  }
  private residentSimulation(world:WorldScene):ResidentActivityWorld{
    const geometry=sceneNavigationGeometry(world);
    return new ResidentActivityWorld(world,new NavigationGrid(geometry.ground,geometry.barriers,world));
  }
  private scenery?: WorldScenery;
  private terrain?: StreamedWorldTerrain;
  private guides!: Phaser.GameObjects.Graphics;
  private regionAssets!: WorldMapAssets;
  private animationAssets!: WorldAnimationAssets;
  private loadedMap?: MapId;
  private authoredPreview?:WorldScene;
  private generationPreview: readonly SceneScenery[] = [];
  private previewRemoved = new Set<string>();
  private drawingZone?: {start:{x:number;y:number};end:{x:number;y:number}};
  private marquee?: {start:{x:number;y:number};end:{x:number;y:number};initial:Set<string>;individual:boolean};
  private dragState?: { start: {x:number;y:number}; positions: Map<string,{x:number;y:number}>; pan?: {x:number;y:number;scrollX:number;scrollY:number} };
  constructor(private callbacks: EditorCanvasCallbacks) { super('level-editor'); }
  create(): void {
    this.game.canvas.tabIndex=0;
    this.game.canvas.setAttribute('aria-label','World canvas. F frames selection; hold Space and drag to pan.');
    this.cameras.main.setBackgroundColor('#c8d0bc');
    this.guides = this.add.graphics().setDepth(100000);
    this.regionAssets = new WorldMapAssets(this, false); this.animationAssets = new WorldAnimationAssets(this, false);
    this.input.mouse?.disableContextMenu();
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => this.startPointer(pointer));
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => this.movePointer(pointer));
    this.input.on('pointerup', () => this.endPointer());
    this.input.on('pointerupoutside', () => this.endPointer());
    this.input.on('wheel', (pointer: Phaser.Input.Pointer, _objects: unknown[], _x: number, y: number) => {
      this.cancelGesture();
      const camera = this.cameras.main, before = camera.getWorldPoint(pointer.x, pointer.y);
      camera.setZoom(Phaser.Math.Clamp(camera.zoom * (y > 0 ? .9 : 1.1), .12, 3));
      const after = camera.getWorldPoint(pointer.x, pointer.y);
      camera.scrollX += before.x - after.x; camera.scrollY += before.y - after.y;
      this.drawGuides();
    });
    this.callbacks.ready();
  }
  async loadWorld(world: WorldScene): Promise<void> {
    const previous = this.loadedMap, id = world.id as MapId;
    this.scenery?.destroy(); this.scenery = undefined;
    this.terrain?.destroy(); this.terrain = undefined;
    if (previous && previous !== id) {
      this.regionAssets.release(getMap(previous));
      for (const period of ['day','night'] as const) {
        const manifest = this.cache.json.get(sceneryAnimationManifestKey(previous, period)) as SceneryAnimationManifest | undefined;
        if (manifest) {
          const keys = new Set(Object.values(manifest.assets).flatMap(asset => [asset.key, ...(asset.base ? [asset.base.key] : []), ...(asset.overlays ?? []).map(overlay => overlay.key)]));
          for (const key of keys) if (this.textures.exists(key)) this.textures.remove(key);
        }
      }
    }
    this.world = world; this.loadedMap = id;
    await new Promise<void>(resolve => this.regionAssets.load(getMap(id), resolve));
    await new Promise<void>(resolve => this.animationAssets.load(id, this.period, () => resolve()));
    this.terrain = new StreamedWorldTerrain(this, world, this.period).setDepth(-1000);
    this.cameras.main.removeBounds();
    this.paint(world);
    if (previous !== id) this.fit();
  }
  paint(world: WorldScene): void {
    this.world = world;
    this.guideWorld=this.authoredPreview??(this.generationPreview.length||this.previewRemoved.size?{...world,scenery:[...world.scenery.filter(item=>!this.previewRemoved.has(item.id)),...this.generationPreview]}:world);
    this.scenery?.destroy();
    this.scenery = new WorldScenery(this, world.id as MapId, this.period, [...world.scenery.filter(item=>!this.previewRemoved.has(item.id)),...this.generationPreview].filter(item=>!this.hidden.has(item.id)));
    this.drawGuides();
  }
  preview(items: readonly SceneScenery[], removedIds: readonly string[] = [], authoredPreview?:WorldScene): void { this.authoredPreview=authoredPreview; this.generationPreview = items; this.previewRemoved=new Set(removedIds); if (this.world) this.paint(this.world); }
  cancelGesture():boolean {
    const pending=!!this.dragState||!!this.drawingZone||!!this.marquee||this.painting;
    if(this.painting){this.painting=false;this.callbacks.endStroke(true);}
    if(this.dragState&&!this.dragState.pan){this.dragState=undefined;this.callbacks.cancelDrag();}
    this.dragState=undefined;this.drawingZone=undefined;this.marquee=undefined;this.zoneMode=false;this.drawGuides();return pending;
  }
  centerPoint():{x:number;y:number}{const camera=this.cameras.main;return camera.getWorldPoint(camera.width/2,camera.height/2);}
  fit(): void {
    if (!this.world) return;
    const camera = this.cameras.main;
    camera.setZoom(Math.min(camera.width / this.world.width, camera.height / this.world.height) * .95).centerOn(this.world.width / 2, this.world.height / 2);
    this.drawGuides();
  }
  zoom(factor: number): void { this.cameras.main.setZoom(Phaser.Math.Clamp(this.cameras.main.zoom * factor,.12,3)); this.drawGuides(); }
  frameSelection(ids:ReadonlySet<string>=this.selected):void {
    const rectangles=this.world.scenery.filter(item=>ids.has(item.id)).map(item=>this.bounds(item));
    if(!rectangles.length)return;
    const left=Math.min(...rectangles.map(b=>b.x)),right=Math.max(...rectangles.map(b=>b.x+b.width));
    const top=Math.min(...rectangles.map(b=>b.y)),bottom=Math.max(...rectangles.map(b=>b.y+b.height)),camera=this.cameras.main;
    camera.setZoom(Math.min(2,camera.width/(right-left+96),camera.height/(bottom-top+96))*.95).centerOn((left+right)/2,(top+bottom)/2);
    this.drawGuides();
  }
  frameDistrict(id:string):void {
    const district=this.world?.districts.find(district=>district.id===id);
    if(!district){this.fit();return;}
    const xs=district.polygon.map(point=>point[0]),ys=district.polygon.map(point=>point[1]);
    const left=Math.min(...xs),right=Math.max(...xs),top=Math.min(...ys),bottom=Math.max(...ys),camera=this.cameras.main;
    camera.setZoom(Math.min(3,camera.width/(right-left+96),camera.height/(bottom-top+96))*.95).centerOn((left+right)/2,(top+bottom)/2);
    this.drawGuides();
  }
  palette(): PaletteItem[] {
    if (!this.world) return [];
    const items: PaletteItem[] = [], seen = new Set<string>();
    const manifest=this.cache.json.get(sceneryAnimationManifestKey(this.world.id as MapId,this.period)) as SceneryAnimationManifest|undefined;
    const sourceFor=(frame:string,variant:boolean)=>{
      const animation=manifest?.assets[frame],key=animation?.base?.key??animation?.key;
      if(key&&this.textures.exists(key)){
        const name=animation!.base?.frame??animation!.frames[0];
        if(this.textures.get(key).has(name))return {key,name,referenceWidth:animation!.base?.referenceWidth??animation!.referenceWidth};
      }
      return {key:sceneryTextureFor(this.world.id as MapId,{id:'',asset:'tree',frame,x:0,y:0,width:1,variant}),name:frame};
    };
    const add = (item: PaletteItem): void => {
      const key = `${item.variant}:${item.frame}`; if (seen.has(key)) return; seen.add(key);
      const {key:texture,name}=sourceFor(item.frame,item.variant);
      if (this.textures.exists(texture) && this.textures.get(texture).has(name)) {
        const frame = this.textures.getFrame(texture,name), source = frame.source.image as HTMLImageElement;
        const canvas = document.createElement('canvas'); canvas.width=88; canvas.height=58;
        const scale = Math.min(84/frame.cutWidth,56/frame.cutHeight);
        canvas.getContext('2d')?.drawImage(source,frame.cutX,frame.cutY,frame.cutWidth,frame.cutHeight,(88-frame.cutWidth*scale)/2,58-frame.cutHeight*scale,frame.cutWidth*scale,frame.cutHeight*scale);
        item.thumbnail = canvas.toDataURL();
        items.push(item);
      }
    };
    const registered=[false,true].flatMap(variant=>{
      const key=sceneryTextureFor(this.world.id as MapId,{id:'',asset:'tree',x:0,y:0,width:1,variant});
      return this.textures.exists(key)?this.textures.get(key).getFrameNames().map(frame=>({frame,variant})):[];
    });
    const frames:PaletteFrame[]=[...registered,...Object.keys(manifest?.assets??{}).map(frame=>({frame,variant:false}))].map(({frame,variant})=>{
      const source=sourceFor(frame,variant);
      if(!this.textures.exists(source.key)||!this.textures.get(source.key).has(source.name))return {frame,variant};
      const native=this.textures.getFrame(source.key,source.name);
      return {frame,variant,referenceWidth:source.referenceWidth??native.width,height:native.height,doorHeight:manifest?.assets[frame]?.door?.height};
    });
    for(const template of paletteTemplates(this.world,frames))add({...template,frame:template.frame??template.asset,variant:!!template.variant});
    return items.sort((a,b) => a.asset.localeCompare(b.asset) || a.frame.localeCompare(b.frame));
  }
  bounds(spec: SceneScenery): { x:number;y:number;width:number;height:number } {
    const manifest = this.cache.json.get(sceneryAnimationManifestKey(this.world.id as MapId,this.period)) as SceneryAnimationManifest | undefined;
    const animation = manifest?.assets[spec.frame ?? spec.asset];
    const key = animation?.base?.key ?? animation?.key ?? sceneryTextureFor(this.world.id as MapId,spec);
    const name = animation?.base?.frame ?? animation?.frames[0] ?? spec.frame ?? spec.asset;
    const frame = this.textures.exists(key) && this.textures.get(key).has(name) ? this.textures.getFrame(key,name) : undefined;
    const height = spec.width * (frame ? frame.height/frame.width : .75);
    const originX = animation?.base?.originX ?? animation?.originX ?? .5;
    const originY = animation?.base?.originY ?? animation?.originY ?? 1;
    return { x:spec.x-spec.width*originX,y:spec.y-height*originY,width:spec.width,height };
  }
  drawGuides(): void {
    if (!this.guides || !this.world) return;
    const world=this.guideWorld??this.world;
    const g = this.guides, zoom = this.cameras.main.zoom; g.clear();
    if (this.gridVisible) {
      g.lineStyle(.7/zoom,0xffffff,.2);
      for(let x=0;x<=world.width;x+=64)g.lineBetween(x,0,x,world.height);
      for(let y=0;y<=world.height;y+=64)g.lineBetween(0,y,world.width,y);
    }
    const polygon = (points: readonly (readonly [number,number])[], color:number, alpha:number) => {
      const vertices=points.map(([x,y])=>new Phaser.Math.Vector2(x,y));g.fillStyle(color,alpha).fillPoints(vertices,true);g.lineStyle(1/zoom,color,.85).strokePoints(vertices,true);
    };
    if (this.navigationVisible) {
      const geometry=sceneNavigationGeometry(world);
      for (const area of geometry.ground) polygon(area,0x65bf9d,.12);
      for (const obstacle of geometry.barriers) polygon(obstacle,0xe6785f,.26);
      for (const target of world.npcs) g.lineStyle(1.5/zoom,0x67b4e6,1).strokeCircle(target.x,target.y,8/zoom);
      for (const target of world.objects) g.lineStyle(1.5/zoom,0xf0bc60,1).strokeRect(target.x-5/zoom,target.y-5/zoom,10/zoom,10/zoom);
      g.fillStyle(0xffffff,1).fillCircle(world.spawn.x,world.spawn.y,5/zoom);
      for(const district of world.districts)polygon(district.polygon,0xe6d48f,.04);
      for(const slot of world.activities??[])for(const point of sceneActivityPlaces(world,slot))g.lineStyle(1.5/zoom,0xbda2ea,1).strokeCircle(point.x,point.y,7/zoom);
      for(const door of world.entrances??[]){
        const point=sceneEntrancePoint(world,door),back=sceneEntrancePoint(world,door,true),owner=world.scenery.find(item=>item.id===door.ownerId)!;
        g.lineStyle(1/zoom,0x5be0e6,.7).lineBetween(owner.x,owner.y,point.x,point.y);
        g.lineStyle(2/zoom,0x5be0e6,1).strokeRect(point.x-6/zoom,point.y-8/zoom,12/zoom,16/zoom);
        g.lineStyle(1/zoom,0xc5f08b,1).strokeCircle(back.x,back.y,10/zoom);
      }
    }
    if(this.residentHour!==undefined){
      try{
        if(this.residentGuide?.world!==world)this.residentGuide={world,simulation:this.residentSimulation(world)};
        const samples=this.residentGuide.simulation.sample({seed:'0123456789abcdef0123456789abcdef',dayLengthSeconds:720,elapsedSeconds:((this.residentHour-7+24)%24)*30},this.residentWeather);
        for(const sample of samples){
          if(sample.exchange&&sample.residentId<sample.exchange.partnerId){const partner=samples.find(item=>item.residentId===sample.exchange!.partnerId)!;g.lineStyle(2/zoom,0xeea87a,.9).lineBetween(sample.x,sample.y,partner.x,partner.y);}
          g.fillStyle(sample.exchange?0xeea87a:sample.interruption==='rain'?0xbda2ea:sample.phase==='home'?0x88988a:sample.phase==='act'?0xf4bd61:0x75cbe0,.9).fillCircle(sample.x,sample.y,6/zoom);
          if(sample.phase==='act')g.lineStyle(2/zoom,0xf4bd61,1).strokeCircle(sample.x,sample.y,11/zoom);
        }
      }catch{this.residentGuide=undefined;}
    }
    for (const spec of world.scenery) if (this.selected.has(spec.id)&&!this.hidden.has(spec.id)) {
      const b=this.bounds(spec);g.lineStyle(2/zoom,this.locked.has(spec.id)?0xeaa27a:0xf7e8a0,1).strokeRect(b.x-2,b.y-2,b.width+4,b.height+4);
      g.fillStyle(0xf7e8a0,1).fillCircle(spec.x,spec.y,3/zoom);
    }
    for(const spec of world.scenery)if(this.previewRemoved.has(spec.id)){const b=this.bounds(spec);g.lineStyle(1.5/zoom,0xf78b69,.8).strokeRect(b.x,b.y,b.width,b.height);}
    if(this.drawingZone){const {start,end}=this.drawingZone;g.lineStyle(2/zoom,0xaedc74,1).fillStyle(0xaedc74,.16).fillRect(Math.min(start.x,end.x),Math.min(start.y,end.y),Math.abs(end.x-start.x),Math.abs(end.y-start.y)).strokeRect(Math.min(start.x,end.x),Math.min(start.y,end.y),Math.abs(end.x-start.x),Math.abs(end.y-start.y));}
    if(this.marquee){const {start,end}=this.marquee;g.lineStyle(1.5/zoom,0xffedaa,1).fillStyle(0xffedaa,.12).fillRect(Math.min(start.x,end.x),Math.min(start.y,end.y),Math.abs(end.x-start.x),Math.abs(end.y-start.y)).strokeRect(Math.min(start.x,end.x),Math.min(start.y,end.y),Math.abs(end.x-start.x),Math.abs(end.y-start.y));}
    for (const spec of this.generationPreview) {const b=this.bounds(spec);g.lineStyle(1.5/zoom,0xb2e575,.85).strokeRect(b.x,b.y,b.width,b.height);}
    if(this.paintMode&&this.cursorPoint)g.lineStyle(1.5/zoom,this.paintMode==='erase'?0xf78b69:0xb2e575,1).strokeCircle(this.cursorPoint.x,this.cursorPoint.y,this.paintRadius);
  }
  private startPointer(pointer: Phaser.Input.Pointer): void {
    if (!this.world || !this.editable) return;
    this.game.canvas.focus({preventScroll:true});
    const point=this.cameras.main.getWorldPoint(pointer.x,pointer.y);
    if(this.panMode||this.spacePan||pointer.rightButtonDown()||pointer.middleButtonDown()) {
      this.dragState={start:point,positions:new Map(),pan:{x:pointer.x,y:pointer.y,scrollX:this.cameras.main.scrollX,scrollY:this.cameras.main.scrollY}};return;
    }
    if(this.zoneMode){this.drawingZone={start:point,end:point};return;}
    if(this.paintMode){this.painting=true;this.callbacks.beginStroke(this.paintMode,point,(pointer.event as MouseEvent).altKey);return;}
    if(this.placing) {this.callbacks.place(point.x,point.y);return;}
    const candidate=this.boxMode?undefined:[...this.world.scenery].filter(item=>!this.hidden.has(item.id)).sort((a,b)=>(b.depth??b.y)-(a.depth??a.y)).find(spec=>{
      const b=this.bounds(spec);return point.x>=b.x&&point.x<=b.x+b.width&&point.y>=b.y&&point.y<=b.y+b.height;
    });
    const shift=(pointer.event as MouseEvent).shiftKey;
    if(candidate) {
      const ids=scenerySelection(this.world,candidate.id,(pointer.event as MouseEvent).altKey).filter(id=>!this.hidden.has(id));
      if(shift) {const remove=ids.every(id=>this.selected.has(id));for(const id of ids)if(remove)this.selected.delete(id);else this.selected.add(id);}
      else if(!this.selected.has(candidate.id)||(pointer.event as MouseEvent).altKey)this.selected=new Set(ids);
      this.callbacks.select([...this.selected]); this.drawGuides();
      if([...this.selected].some(id=>this.locked.has(id))||this.world.prefabInstances?.some(instance=>instance.locked&&instance.members.some(member=>this.selected.has(member.id))))return;
      const positions=new Map(this.world.scenery.filter(spec=>this.selected.has(spec.id)).map(spec=>[spec.id,{x:spec.x,y:spec.y}]));
      this.dragState={start:point,positions};this.callbacks.beginDrag();
    } else {this.marquee={start:point,end:point,initial:shift?new Set(this.selected):new Set(),individual:(pointer.event as MouseEvent).altKey};this.drawGuides();}
  }
  private movePointer(pointer: Phaser.Input.Pointer): void {
    if(!this.world||!this.editable)return;
    const point=this.cameras.main.getWorldPoint(pointer.x,pointer.y);this.cursorPoint=point;this.callbacks.pointer(point.x,point.y);
    if(this.painting){this.callbacks.stroke(point);this.drawGuides();return;}
    if(this.paintMode)this.drawGuides();
    if(this.marquee){this.marquee.end=point;this.drawGuides();return;}
    if(this.drawingZone){this.drawingZone.end={x:Phaser.Math.Clamp(point.x,0,this.world.width),y:Phaser.Math.Clamp(point.y,0,this.world.height)};this.drawGuides();return;}
    const drag=this.dragState;if(!drag)return;
    if(drag.pan) {this.cameras.main.scrollX=drag.pan.scrollX-(pointer.x-drag.pan.x)/this.cameras.main.zoom;this.cameras.main.scrollY=drag.pan.scrollY-(pointer.y-drag.pan.y)/this.cameras.main.zoom;return;}
    const dx=point.x-drag.start.x,dy=point.y-drag.start.y;
    const moved=sceneryTranslation(this.world,drag.positions,dx,dy,this.snap);
    this.callbacks.drag(moved,false);
  }
  private endPointer(): void {
    if(this.painting){this.painting=false;this.callbacks.endStroke(false);return;}
    if(this.marquee){const {start,end,initial,individual}=this.marquee;this.marquee=undefined;
      const ids=Math.hypot(end.x-start.x,end.y-start.y)*this.cameras.main.zoom>=4?marqueeSelection(this.world,start,end,item=>this.bounds(item),this.hidden,individual):[];
      this.selected=new Set([...initial,...ids]);this.callbacks.select([...this.selected]);this.drawGuides();return;
    }
    if(this.drawingZone){const {start,end}=this.drawingZone;this.drawingZone=undefined;this.zoneMode=false;this.callbacks.zone({x:Math.max(0,Math.min(start.x,end.x)),y:Math.max(0,Math.min(start.y,end.y)),width:Math.abs(end.x-start.x),height:Math.abs(end.y-start.y)});this.drawGuides();return;}
    if(this.dragState&&!this.dragState.pan)this.callbacks.drag(new Map(),true);this.dragState=undefined; }
  update(time: number): void {
    this.scenery?.update(time/1000,this.cameras.main.worldView);
    this.terrain?.update(this.cameras.main.worldView,this.cameras.main.zoom);
  }
}
