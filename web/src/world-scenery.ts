import type * as Phaser from 'phaser';
import type { MapId } from './maps';
import type { WorldPeriod } from './world-clock';
import { worldAmbient } from './world-lighting';
import { getPlacedScenery, sceneryTextureFor, sceneryTextureKey, type PlacedScenerySpec } from './placed-scenery';
import { isBuildingScenery,sampleSceneryFrame,sampleTreeSway,sceneryBlend,sceneryAnimationManifestKey,type SceneryAnimation,type SceneryAnimationManifest } from './scenery-animation';
import { getSceneryGeometry } from './scene-schema';
import { createDepthSampler, worldDepth, isCharacterOccluded, updateOcclusion, type DepthGeometry, type OcclusionCharacter, type OcclusionCircle, type WorldBounds } from './world-depth';
import type { SceneryOcclusionController } from './scenery-occlusion';
import { BuildingFoundation } from './world-foundations';
import { SceneryContact } from './world-scenery-contact';
import { sceneryContactKind } from './scenery-contact-shape';
import {terrainObject,sampleDetailMotion,ensureTerrainObject,type DetailMotion} from './terrain-objects';
import {foundationGround} from './foundation-dressing';
import {sceneDocument} from './scene-data';
import {terrainFingerprint,type ModularTerrain} from './modular-terrain';
interface AnimatedSprite {
  sprite:Phaser.GameObjects.Sprite;
  scale:number;
  next?:Phaser.GameObjects.Sprite;
  animation?:SceneryAnimation;
  treeSway?:boolean;
  detailMotion?:DetailMotion;
  currentFrame:string;
  nextFrame?:string;
  phaseId:string;
  frames?:Readonly<Record<string,string>>;
  cutout?:SceneryOcclusionController;
  nextCutout?:SceneryOcclusionController;
  foundationSurface?:boolean;
  foundationGrowth?:boolean;
}
interface SceneryLayer {
  spec:PlacedScenerySpec;
  parts:AnimatedSprite[];
  width:number;
  height:number;
  depthAt:(x:number)=>number;
  bounds:WorldBounds;
  circles:readonly OcclusionCircle[];
  visible?:boolean;
  nightTint?:number;
  foundation?:BuildingFoundation|SceneryContact;
}
const noCircles:readonly OcclusionCircle[]=[];
/** Shared "nobody behind this" result. Never pushed to: a match replaces it with a fresh array first. */
const noCovered:OcclusionCharacter[]=[];
export interface SceneryView { x:number;y:number;right:number;bottom:number; }
export interface LampLight { x:number;y:number;footY:number;width:number; }
export type SceneryOcclusionFactory=(scene:Phaser.Scene,sprite:Phaser.GameObjects.Sprite)=>SceneryOcclusionController|undefined;
/** Trees gently sway one stable painting; other scenery uses authored frames. */
export class WorldScenery {
  private layers:SceneryLayer[]=[];
  private visible=true;
  private groundContactVisible=true;
  private groundContactOpacity=1;
  private reducedMotion=false;
  private motionTime=0;
  private opacity=1;
  private occluded=new Map<string,{depth:number;strength:number}>();
  private manifest?:SceneryAnimationManifest;
  private tint?:{scenery:number;light:number;ground:number};
  private previews=new Map<string,{dx:number;dy:number;valid:boolean}>();
  private destroyed=false;
  private loadingDetails=new Set<string>();
  private terrainStamp='';
  constructor(private scene:Phaser.Scene,private mapId:MapId,private period:WorldPeriod='day',private placements:readonly PlacedScenerySpec[]=getPlacedScenery(mapId),private createCutout?:SceneryOcclusionFactory,private terrain:ModularTerrain|undefined=sceneDocument.maps[mapId]?.modularTerrain){
    this.terrainStamp=terrainFingerprint(terrain);
    this.manifest=scene.cache.json.get(sceneryAnimationManifestKey(mapId,period)) as SceneryAnimationManifest|undefined;
    for(const spec of placements)this.addLayer(spec);
    const ambient=worldAmbient(mapId,period);
    this.setAmbientTint(ambient.scenery,ambient.light,ambient.ground);
  }
  /** Build one placed object's sprites. Returns false when its artwork is not loaded. */
  private addLayer(spec:PlacedScenerySpec):boolean{
    const scene=this.scene,mapId=this.mapId,period=this.period,manifest=this.manifest;
    {
      const name=spec.frame??spec.asset;
      const detail=terrainObject(name);
      const authored=manifest?.assets[name];
      const animation=authored&&scene.textures.exists(authored.base?.key??authored.key)?authored:undefined;
      // A custom atlas frame does not change a placement's architectural role.
      const building=isBuildingScenery(spec.asset)||isBuildingScenery(name);
      const tree=spec.asset==='tree'||spec.asset==='cypress';
      const requestedKey=animation?.base?.key??animation?.key??sceneryTextureFor(mapId,spec);
      if(detail&&!scene.textures.exists(requestedKey)){
        if(!this.loadingDetails.has(detail.id)){
          this.loadingDetails.add(detail.id);
          ensureTerrainObject(scene,mapId,detail,loaded=>{this.loadingDetails.delete(detail.id);if(loaded&&!this.destroyed)this.sync(this.placements,this.terrain);});
        }return false;
      }
      const key=scene.textures.exists(requestedKey)?requestedKey:sceneryTextureKey(mapId);
      const frameName=detail?'__BASE':animation?.base?.frame??(animation
        ? building||tree?animation.frames[0]:sampleSceneryFrame(animation,spec.id,0):name);
      if(!scene.textures.exists(key))return false;
      const atlas=scene.textures.get(key);if(!atlas.has(frameName))return false;
      const frame=atlas.get(frameName),base=animation?.base;
      const scale=spec.width/(base?.referenceWidth??animation?.referenceWidth??frame.width);
      const authoredGeometry=getSceneryGeometry(mapId,spec);
      const geometry:DepthGeometry={referenceWidth:authoredGeometry?.referenceWidth??animation?.referenceWidth??frame.width,
        // The collision snapshot and wall line share one reference coordinate
        // frame. Night paintings can have different native crop dimensions.
        sortLine:spec.sortLine??(authoredGeometry?authoredGeometry.sortLine:animation?.sortLine)};
      const sampleDepth=createDepthSampler(spec,geometry);
      const sprite=scene.add.sprite(spec.x,spec.y,key,frameName)
        .setOrigin(detail?.originX??base?.originX??animation?.originX??.5,detail?.originY??base?.originY??animation?.originY??1).setScale(scale)
        .setDepth(worldDepth(spec.depth??sampleDepth(spec.x))).setFlipX(spec.flipX??false);
      if(tree)sprite.setRotation(sampleTreeSway(spec.id,0,period));
      const parts:AnimatedSprite[]=[{sprite,scale,treeSway:tree,detailMotion:spec.motion==='still'?undefined:detail?.motion,animation:building||tree||animation?.base?undefined:animation,currentFrame:frameName,phaseId:spec.id}];
      for(const overlay of animation?.overlays??[]){
        if(!scene.textures.exists(overlay.key))continue;
        const phaseId=`${spec.id}:${overlay.id}`,detailFrame=sampleSceneryFrame(overlay,phaseId,0);
        if(!scene.textures.get(overlay.key).has(detailFrame))continue;
        // Detail offsets belong to the original artwork's coordinates, even
        // when the replacement base has more pixels and its own ground pivot.
        const detailScale=spec.width/overlay.referenceWidth;
        const offsetX=spec.flipX?animation!.width*(1-2*animation!.originX)-overlay.offsetX:overlay.offsetX;
        const detail=scene.add.sprite(spec.x+offsetX*detailScale,spec.y+overlay.offsetY*detailScale,overlay.key,detailFrame)
          .setOrigin(.5,.5).setScale(detailScale).setDepth(sprite.depth).setFlipX(spec.flipX??false);
        parts.push({sprite:detail,scale:detailScale,animation:overlay,currentFrame:detailFrame,phaseId});
      }
      const contactArtwork={frame,referenceWidth:spec.width/scale,originX:sprite.originX,originY:sprite.originY};
      const contactKind=sceneryContactKind(spec),groundAt=(x:number,y:number)=>foundationGround(mapId,x,y,this.terrain);
      const foundation=building?new BuildingFoundation(scene,mapId,spec,authoredGeometry??animation,contactArtwork,groundAt)
        :contactKind?new SceneryContact(scene,mapId,spec,contactKind,contactArtwork,groundAt):undefined;
      // Each narrow strip has its own wall segment depth. This also sorts two
      // characters correctly when they stand on opposite sides of one building.
      // A camera-dependent single depth cannot represent both relationships.
      const segmented=geometry.sortLine&&new Set(geometry.sortLine.map(point=>point[1])).size>1&&spec.depth===undefined;
      const baseParts=segmented?this.segmentPart(parts[0],sampleDepth):[parts[0]];
      const renderedParts=[...baseParts,...parts.slice(1).flatMap(part=>segmented?this.segmentPart(part,sampleDepth):[part])];
      if(foundation?.surface)renderedParts.push(...this.segmentFoundationSurface({sprite:foundation.surface,scale:foundation.surface.scaleX,
        currentFrame:'surface',phaseId:spec.id,foundationSurface:true},baseParts));
      if(foundation?.growth)renderedParts.push(...this.segmentFoundationSurface({sprite:foundation.growth,scale:foundation.growth.scaleX,
        currentFrame:'growth',phaseId:spec.id,foundationSurface:true,foundationGrowth:true},baseParts));
      for(const part of renderedParts)if(part.animation&&part.animation.frames.length>1){
        const source=part.sprite;
        part.next=scene.add.sprite(source.x,source.y,part.animation.key,part.frames?.[part.currentFrame]??part.currentFrame)
          .setOrigin(source.originX,source.originY).setScale(part.scale).setDepth(source.depth).setFlipX(spec.flipX??false).setAlpha(0);
        part.nextFrame=part.currentFrame;
      }
      const originX=spec.flipX?1-sprite.originX:sprite.originX;
      this.layers.push({spec,parts:renderedParts,foundation,width:frame.width*scale,height:frame.height*scale,depthAt:x=>worldDepth(spec.depth??sampleDepth(x)),circles:noCircles,nightTint:animation?.nightTint,
        bounds:{x:spec.x-frame.width*scale*originX,right:spec.x+frame.width*scale*(1-originX),y:spec.y-frame.height*scale*sprite.originY,bottom:spec.y+frame.height*scale*(1-sprite.originY)}});
    }
    return true;
  }
  private destroyLayer(layer:SceneryLayer):void{
    for(const {sprite,next,cutout,nextCutout} of layer.parts){cutout?.configure([]);nextCutout?.configure([]);sprite.destroy();next?.destroy();}
    layer.foundation?.destroy();
  }
  /**
   * Bring the sprites in line with edited placements: rebuild objects that
   * changed, add new ones and drop removed ones. Unchanged objects keep
   * their sprites and animation phase.
   */
  sync(placements:readonly PlacedScenerySpec[],terrain:ModularTerrain|undefined=sceneDocument.maps[this.mapId]?.modularTerrain):void{
    const stamp=terrain===this.terrain?this.terrainStamp:terrainFingerprint(terrain),groundChanged=stamp!==this.terrainStamp;
    this.terrain=terrain;this.terrainStamp=stamp;
    this.placements=placements;
    this.clearPreview();
    const wanted=new Map(placements.map(spec=>[spec.id,spec]));
    const kept:SceneryLayer[]=[];
    for(const layer of this.layers){
      const next=wanted.get(layer.spec.id);
      if(next&&(!groundChanged||!layer.foundation)&&JSON.stringify(next)===JSON.stringify(layer.spec)){kept.push(layer);wanted.delete(layer.spec.id);}
      else this.destroyLayer(layer);
    }
    this.layers=kept;
    for(const spec of wanted.values())this.addLayer(spec);
    this.reapplyTint();
    if(!this.visible)this.setVisible(false);
    this.setAlpha(this.opacity);
    this.setGroundContactVisible(this.groundContactVisible);
  }
  /** Painted bounds of a placed object, in world units. */
  boundsOf(id:string):WorldBounds|undefined{return this.layers.find(layer=>layer.spec.id===id)?.bounds;}
  /** The front-most object whose painting covers a world point. */
  objectAt(x:number,y:number,accept:(spec:PlacedScenerySpec)=>boolean=()=>true):PlacedScenerySpec|undefined{
    let best:SceneryLayer|undefined;
    for(const layer of this.layers){
      const b=layer.bounds;
      if(x<b.x||x>b.right||y<b.y||y>b.bottom||!accept(layer.spec))continue;
      // Objects lower on screen stand in front, as in play.
      if(!best||layer.spec.y>best.spec.y)best=layer;
    }
    return best?.spec;
  }
  /**
   * Move an object's sprites while it is dragged, without changing its
   * placement. Several objects can be previewed at once for a group drag.
   */
  previewMove(id:string,dx:number,dy:number,valid=true):void{
    const layer=this.layers.find(item=>item.spec.id===id);if(!layer)return;
    const before=this.previews.get(id)??{dx:0,dy:0,valid:true};
    layer.foundation?.moveBy(dx-before.dx,dy-before.dy);
    for(const {sprite,next} of layer.parts){
      sprite.setPosition(sprite.x+dx-before.dx,sprite.y+dy-before.dy).setDepth(sprite.depth);
      next?.setPosition(next.x+dx-before.dx,next.y+dy-before.dy);
    }
    this.previews.set(id,{dx,dy,valid});
    if(valid===before.valid)return;
    if(valid)this.reapplyTint();
    else for(const {sprite,next} of layer.parts){sprite.setTint(0xff8a7a);next?.setTint(0xff8a7a);}
  }
  /** Put previewed objects back where their placement says; all of them without an ID. */
  clearPreview(id?:string):void{
    if(!this.previews.size)return;
    for(const [key,preview] of [...this.previews]){
      if(id!==undefined&&key!==id)continue;
      this.previews.delete(key);
      const layer=this.layers.find(item=>item.spec.id===key);if(!layer)continue;
      layer.foundation?.moveBy(-preview.dx,-preview.dy);
      for(const {sprite,next} of layer.parts){sprite.setPosition(sprite.x-preview.dx,sprite.y-preview.dy);next?.setPosition(next.x-preview.dx,next.y-preview.dy);}
    }
    this.reapplyTint();
  }
  /** Keep the current time-of-day light after sprites are rebuilt or a drag ends. */
  private reapplyTint():void{
    const tint=this.tint??worldAmbient(this.mapId,this.period);
    this.setAmbientTint(tint.scenery,tint.light,tint.ground);
  }
  get objectCount(){return this.layers.length;}
  get animatedObjectCount(){return this.layers.filter(item=>item.parts.some(part=>!!part.animation||part.treeSway||part.detailMotion&&part.detailMotion!=='still')).length;}
  occlusionFor(id:string):{depth:number;strength:number}|undefined{return this.occluded.get(id);}
  private segmentPart(part:AnimatedSprite,sampleDepth:(x:number)=>number):AnimatedSprite[]{
    const source=part.sprite,frame=source.frame;
    // Existing outdoor atlases are untrimmed. Keep externally supplied trimmed
    // art intact rather than changing its painted pivot during a runtime split.
    if(!source.texture||typeof frame!=='object'||frame.trimmed||frame.rotated)return[part];
    const count=Math.max(1,Math.ceil(source.displayWidth/8)),result:AnimatedSprite[]=[];
    const originals=part.animation?.frames??[part.currentFrame],texture=source.texture;
    for(let index=0;index<count;index++){
      const left=Math.round(frame.width*index/count),right=Math.round(frame.width*(index+1)/count);
      if(right<=left)continue;
      const frames:Record<string,string>={};
      for(const original of originals){
        const old=texture.get(original),name=`__sort:${original}:${count}:${index}`;
        if(!texture.has(name))texture.add(name,old.sourceIndex,old.cutX+left,old.cutY,right-left,old.cutHeight);
        frames[original]=name;
      }
      const direction=source.flipX?-1:1;
      const x=source.x+((left+right)/2-source.width*source.originX)*part.scale*direction;
      const sprite=this.scene.add.sprite(x,source.y,texture.key,frames[part.currentFrame]).setOrigin(.5,source.originY)
        .setScale(part.scale).setFlipX(source.flipX).setDepth(worldDepth(sampleDepth(x)));
      if(part.foundationSurface)sprite.setBlendMode('MULTIPLY');
      result.push({...part,sprite,frames});
    }
    source.destroy();
    return result;
  }
  /** Share the exact wall-strip boundaries, so a sloping base never hides its
   * own material band or draws it over a character standing in front. */
  private segmentFoundationSurface(part:AnimatedSprite,walls:readonly AnimatedSprite[]):AnimatedSprite[]{
    const source=part.sprite,frame=source.frame,texture=source.texture,result:AnimatedSprite[]=[];
    for(const {sprite:wall} of walls){
      const wallLeft=wall.x-wall.displayWidth*wall.originX;
      // Root collars can be much narrower than the canopy. Intersect their
      // bounds instead of stretching a tiny root decal across the whole tree.
      const left=Math.max(wallLeft,source.x),right=Math.min(wallLeft+wall.displayWidth,source.x+source.displayWidth);
      if(right<=left)continue;
      const start=Math.max(0,Math.floor((left-source.x)/part.scale)),end=Math.min(frame.width,Math.ceil((right-source.x)/part.scale));
      if(end<=start)continue;
      const name=`__contact:${part.currentFrame}:${start}:${end}`;
      if(!texture.has(name))texture.add(name,frame.sourceIndex,frame.cutX+start,frame.cutY,end-start,frame.cutHeight);
      const sprite=this.scene.add.sprite((left+right)/2,source.y,texture.key,name).setOrigin(.5,0)
        .setDisplaySize(right-left,source.displayHeight).setDepth(wall.depth+(part.foundationGrowth ? .2 : .1)).setBlendMode(part.foundationGrowth?'NORMAL':'MULTIPLY');
      result.push({...part,sprite});
    }
    source.destroy();
    return result;
  }
  /** Follow the glass in the scaled painting, rather than a fixed pole offset. */
  get lampLights(): readonly LampLight[] {
    return this.layers.filter(({spec})=>spec.asset==='lamp'||spec.frame==='motion-lamp').map(({spec,parts,height})=>({
      x:spec.x,y:spec.y+height*(.22-parts[0].sprite.originY),footY:spec.y,width:spec.width,
    }));
  }
  setVisible(visible:boolean){
    this.visible=visible;
    // Hidden worlds stop updating while a room is active, so visibility must
    // take effect here instead of waiting for the next scenery update.
    if(!visible)for(const item of this.layers){
      item.visible=false;item.circles=noCircles;
      item.foundation?.setVisible(false);
      for(const {sprite,next} of item.parts){sprite.setVisible(false);next?.setVisible(false);}
    }
  }
  setReducedMotion(reduced:boolean){this.reducedMotion=reduced;}
  /** QA comparison: keep lighting, architecture and navigation fixed. */
  setGroundContactVisible(visible:boolean){
    this.groundContactVisible=visible;
    for(const item of this.layers){
      const shown=visible&&this.visible&&item.visible!==false;
      item.foundation?.setVisible(shown);
      for(const part of item.parts)if(part.foundationSurface)part.sprite.setVisible(shown);
    }
  }
  /** Multiply ground layers crossfade reciprocally while old wall art stays opaque. */
  setGroundContactAlpha(alpha:number){
    this.groundContactOpacity=alpha;
    for(const item of this.layers)item.foundation?.setAlpha(alpha*this.opacity);
  }
  setAlpha(alpha:number){
    this.opacity=alpha;
    for(const {parts,foundation} of this.layers){
      foundation?.setAlpha(alpha*this.groundContactOpacity);
      for(const {sprite,next} of parts){sprite.setAlpha(alpha);next?.setAlpha(0);}
    }
  }
  /** Lanterns keep warm illumination while fixed architecture takes moonlight. */
  setAmbientTint(tint:number,light=0xffffff,ground=tint){
    this.tint={scenery:tint,light,ground};
    for(const {spec,parts,nightTint,foundation} of this.layers){
      foundation?.setTint(ground);
      const emitter=spec.asset==='lamp'||spec.frame==='motion-lamp';
      const appliedTint=emitter?light:nightTint??tint;
      for(const {sprite,next,foundationSurface,foundationGrowth} of parts){sprite.setTint(foundationGrowth?ground:foundationSurface?0xffffff:appliedTint);next?.setTint(appliedTint);}
    }
  }
  update(time:number,view:SceneryView,characters:readonly OcclusionCharacter[]=[],seconds=0){
    if(!this.reducedMotion)this.motionTime=time;
    this.occluded.clear();
    for(const item of this.layers){
      const {spec,parts,width,height}=item;
      // A dragged object is drawn where the pointer took it.
      const offset=this.previews.get(spec.id),x=spec.x+(offset?.dx??0),y=spec.y+(offset?.dy??0);
      const visible=this.visible&&x+width*.7>=view.x&&x-width*.7<=view.right
        &&y+height*.12>=view.y&&y-height*1.1<=view.bottom;
      if(!visible&&item.visible===false)continue;
      item.visible=visible;
      item.foundation?.setVisible(visible&&this.groundContactVisible);
      // Reject distant bodies before evaluating the local wall boundary.
      let covered:OcclusionCharacter[]=noCovered;
      if(visible)for(const character of characters)if(isCharacterOccluded(character,item.bounds,Infinity)&&item.depthAt(character.x)>character.depth){
        if(covered===noCovered)covered=[];
        covered.push(character);
      }
      item.circles=visible&&(covered.length||item.circles.length)?updateOcclusion(item.circles,covered,seconds,this.reducedMotion):noCircles;
      for(const part of parts){
        const partVisible=visible&&(!part.foundationSurface||this.groundContactVisible);
        if(part.sprite.visible!==partVisible)part.sprite.setVisible(partVisible);
        if(part.next&&part.next.visible!==visible)part.next.setVisible(visible);
        if(!visible)continue;
        const partBounds=item.circles.length?part.sprite.getBounds():undefined;
        const circles=partBounds?item.circles.filter(circle=>part.sprite.depth>circle.depth&&circle.x+90>=partBounds.x&&circle.x-90<=partBounds.right
          &&circle.y+90>=partBounds.y&&circle.y-90<=partBounds.bottom):noCircles;
        if(circles.length&&!part.cutout)part.cutout=this.createCutout?.(this.scene,part.sprite);
        part.cutout?.configure(circles);
        if(circles.length&&part.next&&!part.nextCutout)part.nextCutout=this.createCutout?.(this.scene,part.next);
        part.nextCutout?.configure(circles);
        // Canvas has no filter nodes. A bounded fade plus the silhouette keeps
        // the character locatable there, while WebGL gets the local cutout.
        let strength=0;
        for(const circle of circles){
          strength=Math.max(strength,circle.strength);
          const previous=this.occluded.get(circle.id);
          this.occluded.set(circle.id,{depth:Math.max(previous?.depth??0,part.sprite.depth),strength:Math.max(previous?.strength??0,circle.strength)});
        }
        const alpha=this.opacity*(part.cutout?1:1-.75*strength);
        if(part.sprite.alpha!==alpha)part.sprite.setAlpha(alpha);
        if(part.detailMotion){
          const motion=sampleDetailMotion(part.detailMotion,part.phaseId,this.motionTime,this.reducedMotion);
          part.sprite.setRotation(motion.angle).setY(y+motion.y).setAlpha(alpha*motion.alpha);continue;
        }
        // Keeping a single tree painting avoids branches morphing, doubled
        // silhouettes and jumping roots between independently painted poses.
        if(part.treeSway){part.sprite.setRotation(sampleTreeSway(part.phaseId,this.motionTime,this.period));continue;}
        if(!part.animation)continue;
        const blend=sceneryBlend(part.animation,part.phaseId,this.motionTime);
        if(blend.current!==part.currentFrame){part.sprite.setFrame(part.frames?.[blend.current]??blend.current);part.currentFrame=blend.current;}
        // Source-over draws the next frame over this one. Fading both frames
        // makes opaque scenery lose up to 25% coverage midway through a blend.
        if(part.next){
          if(part.nextFrame!==blend.next){part.next.setFrame(part.frames?.[blend.next]??blend.next);part.nextFrame=blend.next;}
          const nextAlpha=this.reducedMotion?0:alpha*blend.alpha;
          if(part.next.alpha!==nextAlpha)part.next.setAlpha(nextAlpha);
        }
      }
    }
  }
  destroy(){
    this.destroyed=true;
    for(const layer of this.layers)this.destroyLayer(layer);
    this.previews.clear();
    this.layers=[];
  }
}
