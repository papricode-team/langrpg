import type * as Phaser from 'phaser';
import type { MapId } from './maps';
import type { WorldPeriod } from './world-clock';
import { worldAmbient } from './world-lighting';
import { getPlacedScenery, sceneryTextureFor, sceneryTextureKey, sceneryDepth, type PlacedScenerySpec } from './placed-scenery';
import { isBuildingScenery,sampleSceneryFrame,sceneryAnimationManifestKey,type SceneryAnimation,type SceneryAnimationManifest } from './scenery-animation';
interface AnimatedSprite {
  sprite:Phaser.GameObjects.Sprite;
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
/** Buildings keep a static base. Only their separate detail sprites change frame. */
export class WorldScenery {
  private layers:SceneryLayer[]=[];
  private visible=true;
  private reducedMotion=false;
  private motionTime=0;
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
      const frame=atlas.get(frameName),scale=spec.width/(animation?.referenceWidth??frame.width);
      const sprite=scene.add.sprite(spec.x,spec.y,key,frameName)
        .setOrigin(animation?.originX??.5,animation?.originY??1).setScale(scale)
        .setDepth(spec.depth??sceneryDepth(spec.y)).setFlipX(spec.flipX??false);
      const parts:AnimatedSprite[]=[{sprite,animation:building||animation?.base?undefined:animation,currentFrame:frameName,phaseId:spec.id}];
      for(const overlay of animation?.overlays??[]){
        if(!scene.textures.exists(overlay.key))continue;
        const phaseId=`${spec.id}:${overlay.id}`,detailFrame=sampleSceneryFrame(overlay,phaseId,0);
        if(!scene.textures.get(overlay.key).has(detailFrame))continue;
        // Phaser flips within the base rectangle, whose pivot need not be centered.
        const offsetX=spec.flipX?frame.width*(1-2*(animation?.originX??.5))-overlay.offsetX:overlay.offsetX;
        const detail=scene.add.sprite(spec.x+offsetX*scale,spec.y+overlay.offsetY*scale,overlay.key,detailFrame)
          .setOrigin(.5,.5).setScale(scale).setDepth(spec.depth??sceneryDepth(spec.y)).setFlipX(spec.flipX??false);
        parts.push({sprite:detail,animation:overlay,currentFrame:detailFrame,phaseId});
      }
      this.layers.push({spec,parts,width:frame.width*scale,height:frame.height*scale});
    }
    const ambient=worldAmbient(mapId,period);
    if(ambient.scenery!==0xffffff)this.setAmbientTint(ambient.scenery,ambient.light);
  }
  get objectCount(){return this.layers.length;}
  get animatedObjectCount(){return this.layers.filter(item=>item.parts.some(part=>!!part.animation)).length;}
  setVisible(visible:boolean){
    this.visible=visible;
    // Hidden worlds stop updating while a room is active, so visibility must
    // take effect here instead of waiting for the next scenery update.
    if(!visible)for(const {parts} of this.layers)for(const {sprite} of parts)sprite.setVisible(false);
  }
  setReducedMotion(reduced:boolean){this.reducedMotion=reduced;}
  /** Lanterns keep warm illumination while fixed architecture takes moonlight. */
  setAmbientTint(tint:number,light=0xffffff){
    for(const {spec,parts} of this.layers){
      const emitter=spec.asset==='lamp'||spec.frame==='motion-lamp';
      for(const {sprite} of parts)sprite.setTint(emitter?light:tint);
    }
  }
  update(time:number,view:SceneryView){
    if(!this.reducedMotion)this.motionTime=time;
    for(const item of this.layers){
      const {spec,parts,width,height}=item;
      const visible=this.visible&&spec.x+width*.7>=view.x&&spec.x-width*.7<=view.right
        &&spec.y+height*.12>=view.y&&spec.y-height*1.1<=view.bottom;
      for(const part of parts){
        part.sprite.setVisible(visible);if(!visible||!part.animation)continue;
        const frame=sampleSceneryFrame(part.animation,part.phaseId,this.motionTime);
        if(frame!==part.currentFrame){part.sprite.setFrame(frame);part.currentFrame=frame;}
      }
    }
  }
  destroy(){for(const {parts} of this.layers)for(const {sprite} of parts)sprite.destroy();this.layers=[];}
}
