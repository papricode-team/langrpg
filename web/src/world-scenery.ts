import type * as Phaser from 'phaser';
import type { MapId } from './maps';
import type { WorldPeriod } from './world-clock';
import { getPlacedScenery, sceneryTextureFor, sceneryDepth, type PlacedScenerySpec } from './placed-scenery';
import { sampleSceneryFrame,sceneryAnimationManifestKey,type SceneryAnimation,type SceneryAnimationManifest } from './scenery-animation';
interface SceneryLayer {
  spec:PlacedScenerySpec;
  sprite:Phaser.GameObjects.Sprite;
  animation?:SceneryAnimation;
  currentFrame:string;
  width:number;
  height:number;
}
export interface SceneryView { x:number;y:number;right:number;bottom:number; }
/** Each upright object plays ImageGen-authored raster frames. Foundations, scale
 * and camera orientation stay fixed; there are no meshes or procedural overlays. */
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
      const animation=authored&&scene.textures.exists(authored.key)?authored:undefined;
      const key=animation?.key??sceneryTextureFor(mapId,spec);
      const frameName=animation?sampleSceneryFrame(animation,spec.id,0):name;
      if(!scene.textures.exists(key))continue;
      const atlas=scene.textures.get(key);if(!atlas.has(frameName))continue;
      const frame=atlas.get(frameName),scale=spec.width/(animation?.referenceWidth??frame.width);
      const sprite=scene.add.sprite(spec.x,spec.y,key,frameName)
        .setOrigin(animation?.originX??.5,animation?.originY??1).setScale(scale)
        .setDepth(spec.depth??sceneryDepth(spec.y)).setFlipX(spec.flipX??false);
      this.layers.push({spec,sprite,animation,currentFrame:frameName,width:frame.width*scale,height:frame.height*scale});
    }
  }
  get objectCount(){return this.layers.length;}
  get animatedObjectCount(){return this.layers.filter(item=>!!item.animation).length;}
  setVisible(visible:boolean){
    this.visible=visible;
    // Hidden worlds stop updating while a room is active, so visibility must
    // take effect here instead of waiting for the next scenery update.
    if(!visible)for(const {sprite} of this.layers)sprite.setVisible(false);
  }
  setReducedMotion(reduced:boolean){this.reducedMotion=reduced;}
  update(time:number,view:SceneryView){
    if(!this.reducedMotion)this.motionTime=time;
    for(const item of this.layers){
      const {spec,sprite,width,height,animation}=item;
      const visible=this.visible&&spec.x+width*.7>=view.x&&spec.x-width*.7<=view.right
        &&spec.y+height*.12>=view.y&&spec.y-height*1.1<=view.bottom;
      sprite.setVisible(visible);if(!visible||!animation)continue;
      const frame=sampleSceneryFrame(animation,spec.id,this.motionTime);
      if(frame!==item.currentFrame){sprite.setFrame(frame);item.currentFrame=frame;}
    }
  }
  destroy(){for(const {sprite} of this.layers)sprite.destroy();this.layers=[];}
}
