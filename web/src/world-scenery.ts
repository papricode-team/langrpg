import type * as Phaser from 'phaser';
import type { MapId } from './maps';
import type { WorldPeriod } from './world-clock';
import { worldAmbient } from './world-lighting';
import { getPlacedScenery, sceneryTextureFor, sceneryTextureKey, sceneryDepth, type PlacedScenerySpec } from './placed-scenery';
import { isBuildingScenery,sampleSceneryFrame,sceneryBlend,sceneryAnimationManifestKey,type SceneryAnimation,type SceneryAnimationManifest } from './scenery-animation';
interface AnimatedSprite {
  sprite:Phaser.GameObjects.Sprite;
  scale:number;
  next?:Phaser.GameObjects.Sprite;
  animation?:SceneryAnimation;
  currentFrame:string;
  phaseId:string;
}
interface SceneryLayer {
  spec:PlacedScenerySpec;
  parts:AnimatedSprite[];
  width:number;
  height:number;
}
export interface SceneryView { x:number;y:number;right:number;bottom:number; }
export interface LampLight { x:number;y:number;footY:number;width:number; }
/** High resolution building paintings stay fixed while other scenery changes frame. */
export class WorldScenery {
  private layers:SceneryLayer[]=[];
  private visible=true;
  private reducedMotion=false;
  private motionTime=0;
  private opacity=1;
  constructor(private scene:Phaser.Scene,mapId:MapId,period:WorldPeriod='day'){
    const manifest=scene.cache.json.get(sceneryAnimationManifestKey(mapId,period)) as SceneryAnimationManifest|undefined;
    for(const spec of getPlacedScenery(mapId)){
      const name=spec.frame??spec.asset;
      const authored=manifest?.assets[name];
      const animation=authored&&scene.textures.exists(authored.base?.key??authored.key)?authored:undefined;
      const building=isBuildingScenery(name);
      const requestedKey=animation?.base?.key??animation?.key??sceneryTextureFor(mapId,spec);
      const key=scene.textures.exists(requestedKey)?requestedKey:sceneryTextureKey(mapId);
      const frameName=animation?.base?.frame??(animation
        ? building?animation.frames[0]:sampleSceneryFrame(animation,spec.id,0):name);
      if(!scene.textures.exists(key))continue;
      const atlas=scene.textures.get(key);if(!atlas.has(frameName))continue;
      const frame=atlas.get(frameName),base=animation?.base;
      const scale=spec.width/(base?.referenceWidth??animation?.referenceWidth??frame.width);
      const sprite=scene.add.sprite(spec.x,spec.y,key,frameName)
        .setOrigin(base?.originX??animation?.originX??.5,base?.originY??animation?.originY??1).setScale(scale)
        .setDepth(spec.depth??sceneryDepth(spec.y)).setFlipX(spec.flipX??false);
      const parts:AnimatedSprite[]=[{sprite,scale,animation:building||animation?.base?undefined:animation,currentFrame:frameName,phaseId:spec.id}];
      for(const overlay of animation?.overlays??[]){
        if(!scene.textures.exists(overlay.key))continue;
        const phaseId=`${spec.id}:${overlay.id}`,detailFrame=sampleSceneryFrame(overlay,phaseId,0);
        if(!scene.textures.get(overlay.key).has(detailFrame))continue;
        // Detail offsets belong to the original artwork's coordinates, even
        // when the replacement base has more pixels and its own ground pivot.
        const detailScale=spec.width/overlay.referenceWidth;
        const offsetX=spec.flipX?animation!.width*(1-2*animation!.originX)-overlay.offsetX:overlay.offsetX;
        const detail=scene.add.sprite(spec.x+offsetX*detailScale,spec.y+overlay.offsetY*detailScale,overlay.key,detailFrame)
          .setOrigin(.5,.5).setScale(detailScale).setDepth(spec.depth??sceneryDepth(spec.y)).setFlipX(spec.flipX??false);
        parts.push({sprite:detail,scale:detailScale,animation:overlay,currentFrame:detailFrame,phaseId});
      }
      for(const part of parts)if(part.animation&&part.animation.frames.length>1){
        const source=part.sprite;
        part.next=scene.add.sprite(source.x,source.y,part.animation.key,part.currentFrame)
          .setOrigin(source.originX,source.originY).setScale(part.scale).setDepth(source.depth+.001).setFlipX(spec.flipX??false).setAlpha(0);
      }
      this.layers.push({spec,parts,width:frame.width*scale,height:frame.height*scale});
    }
    const ambient=worldAmbient(mapId,period);
    if(ambient.scenery!==0xffffff)this.setAmbientTint(ambient.scenery,ambient.light);
  }
  get objectCount(){return this.layers.length;}
  get animatedObjectCount(){return this.layers.filter(item=>item.parts.some(part=>!!part.animation)).length;}
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
    for(const {spec,parts} of this.layers){
      const emitter=spec.asset==='lamp'||spec.frame==='motion-lamp';
      for(const {sprite,next} of parts){sprite.setTint(emitter?light:tint);next?.setTint(emitter?light:tint);}
    }
  }
  update(time:number,view:SceneryView){
    if(!this.reducedMotion)this.motionTime=time;
    for(const item of this.layers){
      const {spec,parts,width,height}=item;
      const visible=this.visible&&spec.x+width*.7>=view.x&&spec.x-width*.7<=view.right
        &&spec.y+height*.12>=view.y&&spec.y-height*1.1<=view.bottom;
      for(const part of parts){
        part.sprite.setVisible(visible);part.next?.setVisible(visible);if(!visible||!part.animation)continue;
        const blend=sceneryBlend(part.animation,part.phaseId,this.motionTime);
        if(blend.current!==part.currentFrame){part.sprite.setFrame(blend.current);part.currentFrame=blend.current;}
        // Source-over draws the next frame over this one. Fading both frames
        // makes opaque scenery lose up to 25% coverage midway through a blend.
        part.sprite.setAlpha(this.opacity);
        part.next?.setFrame(blend.next).setAlpha(this.reducedMotion?0:this.opacity*blend.alpha);
      }
    }
  }
  destroy(){for(const {parts} of this.layers)for(const {sprite,next} of parts){sprite.destroy();next?.destroy();}this.layers=[];}
}
