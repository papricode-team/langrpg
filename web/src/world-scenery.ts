import type * as Phaser from 'phaser';
import type { MapId } from './maps';
import type { WorldPeriod } from './world-clock';
import { worldAmbient } from './world-lighting';
import { getPlacedScenery, sceneryTextureFor, sceneryTextureKey, type PlacedScenerySpec } from './placed-scenery';
import { isBuildingScenery,sampleSceneryFrame,sampleTreeSway,sceneryBlend,sceneryAnimationManifestKey,type SceneryAnimation,type SceneryAnimationManifest } from './scenery-animation';
import { getSceneryGeometry } from './scene-schema';
import { depthAt, worldDepth, isCharacterOccluded, updateOcclusion, type DepthGeometry, type OcclusionCharacter, type OcclusionCircle, type WorldBounds } from './world-depth';
import type { SceneryOcclusionController } from './scenery-occlusion';
interface AnimatedSprite {
  sprite:Phaser.GameObjects.Sprite;
  scale:number;
  next?:Phaser.GameObjects.Sprite;
  animation?:SceneryAnimation;
  treeSway?:boolean;
  currentFrame:string;
  phaseId:string;
  frames?:Readonly<Record<string,string>>;
  cutout?:SceneryOcclusionController;
  nextCutout?:SceneryOcclusionController;
}
interface SceneryLayer {
  spec:PlacedScenerySpec;
  parts:AnimatedSprite[];
  width:number;
  height:number;
  geometry:DepthGeometry;
  bounds:WorldBounds;
  circles:OcclusionCircle[];
  nightTint?:number;
}
export interface SceneryView { x:number;y:number;right:number;bottom:number; }
export interface LampLight { x:number;y:number;footY:number;width:number; }
export type SceneryOcclusionFactory=(scene:Phaser.Scene,sprite:Phaser.GameObjects.Sprite)=>SceneryOcclusionController|undefined;
/** Trees gently sway one stable painting; other scenery uses authored frames. */
export class WorldScenery {
  private layers:SceneryLayer[]=[];
  private visible=true;
  private reducedMotion=false;
  private motionTime=0;
  private opacity=1;
  private occluded=new Map<string,{depth:number;strength:number}>();
  constructor(private scene:Phaser.Scene,mapId:MapId,private period:WorldPeriod='day',placements:readonly PlacedScenerySpec[]=getPlacedScenery(mapId),private createCutout?:SceneryOcclusionFactory){
    const manifest=scene.cache.json.get(sceneryAnimationManifestKey(mapId,period)) as SceneryAnimationManifest|undefined;
    for(const spec of placements){
      const name=spec.frame??spec.asset;
      const authored=manifest?.assets[name];
      const animation=authored&&scene.textures.exists(authored.base?.key??authored.key)?authored:undefined;
      const building=isBuildingScenery(name);
      const tree=spec.asset==='tree'||spec.asset==='cypress';
      const requestedKey=animation?.base?.key??animation?.key??sceneryTextureFor(mapId,spec);
      const key=scene.textures.exists(requestedKey)?requestedKey:sceneryTextureKey(mapId);
      const frameName=animation?.base?.frame??(animation
        ? building||tree?animation.frames[0]:sampleSceneryFrame(animation,spec.id,0):name);
      if(!scene.textures.exists(key))continue;
      const atlas=scene.textures.get(key);if(!atlas.has(frameName))continue;
      const frame=atlas.get(frameName),base=animation?.base;
      const scale=spec.width/(base?.referenceWidth??animation?.referenceWidth??frame.width);
      const authoredGeometry=getSceneryGeometry(mapId,spec);
      const geometry:DepthGeometry={referenceWidth:authoredGeometry?.referenceWidth??animation?.referenceWidth??frame.width,
        // The collision snapshot and wall line share one reference coordinate
        // frame. Night paintings can have different native crop dimensions.
        sortLine:spec.sortLine??(authoredGeometry?authoredGeometry.sortLine:animation?.sortLine)};
      const sprite=scene.add.sprite(spec.x,spec.y,key,frameName)
        .setOrigin(base?.originX??animation?.originX??.5,base?.originY??animation?.originY??1).setScale(scale)
        .setDepth(spec.depth!==undefined?worldDepth(spec.depth):worldDepth(depthAt(spec,spec.x,geometry))).setFlipX(spec.flipX??false);
      if(tree)sprite.setRotation(sampleTreeSway(spec.id,0,period));
      const parts:AnimatedSprite[]=[{sprite,scale,treeSway:tree,animation:building||tree||animation?.base?undefined:animation,currentFrame:frameName,phaseId:spec.id}];
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
      // Each narrow strip has its own wall segment depth. This also sorts two
      // characters correctly when they stand on opposite sides of one building.
      // A camera-dependent single depth cannot represent both relationships.
      const segmented=geometry.sortLine&&new Set(geometry.sortLine.map(point=>point[1])).size>1&&spec.depth===undefined;
      const renderedParts=segmented?parts.flatMap(part=>this.segmentPart(part,spec,geometry)):parts;
      for(const part of renderedParts)if(part.animation&&part.animation.frames.length>1){
        const source=part.sprite;
        part.next=scene.add.sprite(source.x,source.y,part.animation.key,part.frames?.[part.currentFrame]??part.currentFrame)
          .setOrigin(source.originX,source.originY).setScale(part.scale).setDepth(source.depth).setFlipX(spec.flipX??false).setAlpha(0);
      }
      const originX=spec.flipX?1-sprite.originX:sprite.originX;
      this.layers.push({spec,parts:renderedParts,width:frame.width*scale,height:frame.height*scale,geometry,circles:[],nightTint:animation?.nightTint,
        bounds:{x:spec.x-frame.width*scale*originX,right:spec.x+frame.width*scale*(1-originX),y:spec.y-frame.height*scale*sprite.originY,bottom:spec.y+frame.height*scale*(1-sprite.originY)}});
    }
    const ambient=worldAmbient(mapId,period);
    this.setAmbientTint(ambient.scenery,ambient.light);
  }
  get objectCount(){return this.layers.length;}
  get animatedObjectCount(){return this.layers.filter(item=>item.parts.some(part=>!!part.animation||part.treeSway)).length;}
  occlusionFor(id:string):{depth:number;strength:number}|undefined{return this.occluded.get(id);}
  private segmentPart(part:AnimatedSprite,spec:PlacedScenerySpec,geometry:DepthGeometry):AnimatedSprite[]{
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
        .setScale(part.scale).setFlipX(source.flipX).setDepth(worldDepth(depthAt(spec,x,geometry)));
      result.push({...part,sprite,frames});
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
    if(!visible)for(const {parts} of this.layers)for(const {sprite,next} of parts){sprite.setVisible(false);next?.setVisible(false);}
  }
  setReducedMotion(reduced:boolean){this.reducedMotion=reduced;}
  setAlpha(alpha:number){this.opacity=alpha;for(const {parts} of this.layers)for(const {sprite,next} of parts){sprite.setAlpha(alpha);next?.setAlpha(0);}}
  /** Lanterns keep warm illumination while fixed architecture takes moonlight. */
  setAmbientTint(tint:number,light=0xffffff){
    for(const {spec,parts,nightTint} of this.layers){
      const emitter=spec.asset==='lamp'||spec.frame==='motion-lamp';
      const appliedTint=emitter?light:nightTint??tint;
      for(const {sprite,next} of parts){sprite.setTint(appliedTint);next?.setTint(appliedTint);}
    }
  }
  update(time:number,view:SceneryView,characters:readonly OcclusionCharacter[]=[],seconds=0){
    if(!this.reducedMotion)this.motionTime=time;
    this.occluded.clear();
    for(const item of this.layers){
      const {spec,parts,width,height}=item;
      const visible=this.visible&&spec.x+width*.7>=view.x&&spec.x-width*.7<=view.right
        &&spec.y+height*.12>=view.y&&spec.y-height*1.1<=view.bottom;
      const covered=visible?characters.filter(character=>isCharacterOccluded(character,item.bounds,
        spec.depth!==undefined?worldDepth(spec.depth):worldDepth(depthAt(spec,character.x,item.geometry)))):[];
      item.circles=visible?updateOcclusion(item.circles,covered,seconds,this.reducedMotion):[];
      for(const part of parts){
        part.sprite.setVisible(visible);part.next?.setVisible(visible);if(!visible)continue;
        const partBounds=item.circles.length?part.sprite.getBounds():undefined;
        const circles=partBounds?item.circles.filter(circle=>part.sprite.depth>circle.depth&&circle.x+90>=partBounds.x&&circle.x-90<=partBounds.right
          &&circle.y+90>=partBounds.y&&circle.y-90<=partBounds.bottom):[];
        if(circles.length&&!part.cutout)part.cutout=this.createCutout?.(this.scene,part.sprite);
        part.cutout?.configure(circles);
        if(circles.length&&part.next&&!part.nextCutout)part.nextCutout=this.createCutout?.(this.scene,part.next);
        part.nextCutout?.configure(circles);
        // Canvas has no filter nodes. A bounded fade plus the silhouette keeps
        // the character locatable there, while WebGL gets the local cutout.
        const alpha=this.opacity*(part.cutout?1:1-.75*Math.max(0,...circles.map(circle=>circle.strength)));
        part.sprite.setAlpha(alpha);
        for(const circle of circles){
          const previous=this.occluded.get(circle.id);
          this.occluded.set(circle.id,{depth:Math.max(previous?.depth??0,part.sprite.depth),strength:Math.max(previous?.strength??0,circle.strength)});
        }
        // Keeping a single tree painting avoids branches morphing, doubled
        // silhouettes and jumping roots between independently painted poses.
        if(part.treeSway){part.sprite.setRotation(sampleTreeSway(part.phaseId,this.motionTime,this.period));continue;}
        if(!part.animation)continue;
        const blend=sceneryBlend(part.animation,part.phaseId,this.motionTime);
        if(blend.current!==part.currentFrame){part.sprite.setFrame(part.frames?.[blend.current]??blend.current);part.currentFrame=blend.current;}
        // Source-over draws the next frame over this one. Fading both frames
        // makes opaque scenery lose up to 25% coverage midway through a blend.
        part.next?.setFrame(part.frames?.[blend.next]??blend.next).setAlpha(this.reducedMotion?0:alpha*blend.alpha);
      }
    }
  }
  destroy(){for(const {parts} of this.layers)for(const {sprite,next} of parts){sprite.destroy();next?.destroy();}this.layers=[];}
}
