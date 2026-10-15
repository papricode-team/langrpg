import type * as Phaser from 'phaser';
import type {PlacedScenerySpec} from './placed-scenery';
import {sceneryPhase} from './placed-scenery';
import type {ScenePolygon} from './scene-schema';
import {foundationGround} from './foundation-dressing';
import {FOUNDATION_DEPTH,type FoundationArtwork} from './world-foundations';
import {contactMaterial,paintSceneryContact} from './scenery-contact-paint';
import {fallbackSceneryContact,sceneryContactBounds,traceSceneryContact,type SceneryContactKind} from './scenery-contact-shape';

const contours=new WeakMap<Phaser.Textures.Frame,Map<string,readonly ScenePolygon[]>>();
function paintedFeet(art:FoundationArtwork|undefined,kind:SceneryContactKind,flip:boolean):readonly ScenePolygon[]|undefined {
  const frame=art?.frame;
  if(!art||!frame?.source?.image||frame.trimmed||frame.rotated)return;
  const signature=JSON.stringify([kind,flip,art.referenceWidth,art.originX,art.originY]);
  const cache=contours.get(frame)??new Map<string,readonly ScenePolygon[]>();contours.set(frame,cache);
  if(cache.has(signature))return cache.get(signature);
  const density=Math.min(1,384/frame.width,384/frame.height),canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.ceil(frame.width*density));canvas.height=Math.max(1,Math.ceil(frame.height*density));
  const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)return;
  ctx.drawImage(frame.source.image as CanvasImageSource,frame.cutX,frame.cutY,frame.cutWidth,frame.cutHeight,0,0,canvas.width,canvas.height);
  const lines=traceSceneryContact(ctx.getImageData(0,0,canvas.width,canvas.height).data,canvas.width,canvas.height,
    {...art,width:frame.width,height:frame.height},kind,flip);
  if(!lines.length)return;
  cache.set(signature,lines);return lines;
}
interface Entry {key:string;bounds:ReturnType<typeof sceneryContactBounds>;density:number;growth:boolean;users:number;}
const caches=new WeakMap<Phaser.Textures.TextureManager,Map<string,Entry>>();
let sequence=0;
/** Small shared decals for physical contacts; roots never sway with the canopy.
 * Only the coloured collar joins the object's depth-sorted foreground strips. */
export class SceneryContact {
  readonly shadow:Phaser.GameObjects.Image;
  readonly wear:Phaser.GameObjects.Image;
  readonly surface:Phaser.GameObjects.Sprite|undefined=undefined;
  readonly growth?:Phaser.GameObjects.Sprite;
  private cache:Map<string,Entry>;
  private signature:string;
  private entry:Entry;
  constructor(private scene:Phaser.Scene,mapId:string,spec:PlacedScenerySpec,readonly kind:SceneryContactKind,artwork?:FoundationArtwork,sample=(x:number,y:number)=>foundationGround(mapId,x,y)){
    const painted=paintedFeet(artwork,kind,!!spec.flipX),lines=painted??fallbackSceneryContact(kind);
    const ground=sample(spec.x,spec.y-2);
    // Inspect under the hull too: the foot anchor may lie just over the quay edge.
    if(kind==='boat'){
      const samples=[-.22,0,.22].map(x=>sample(spec.x+x*spec.width,spec.y-spec.width*.08));
      ground.water=samples.reduce((sum,sample)=>sum+sample.water,ground.water)/4;
    }
    const material=contactMaterial(ground,Math.floor(sceneryPhase(spec.id)/Math.PI*2)%4);
    const growth=!!painted&&!material.water&&['leaf-tree','conifer','planter','fountain'].includes(kind);
    this.signature=JSON.stringify([mapId,kind,lines,material,growth]);
    this.cache=caches.get(scene.textures)??new Map();caches.set(scene.textures,this.cache);
    let entry=this.cache.get(this.signature);
    if(!entry){
      const bounds=sceneryContactBounds(lines,kind),density=Math.min(.85,192/bounds.width,96/bounds.height);
      const width=Math.ceil(bounds.width*density),height=Math.ceil(bounds.height*density),key=`scenery-contact-${++sequence}`;
      const texture=scene.textures.createCanvas(key,width,height*(growth?3:2));
      if(!texture)throw new Error('Cannot create scenery contact texture');
      const frames=growth?['shadow','wear','growth'] as const:['shadow','wear'] as const;
      frames.forEach((name,index)=>{
        const ctx=texture.context;ctx.save();ctx.beginPath();ctx.rect(0,index*height,width,height);ctx.clip();
        ctx.translate(0,index*height);ctx.scale(density,density);ctx.translate(-bounds.x,-bounds.y);
        paintSceneryContact(ctx,kind,lines,material,name);ctx.restore();texture.add(name,0,0,index*height,width,height);
      });
      texture.refresh();entry={key,bounds,density,growth,users:0};this.cache.set(this.signature,entry);
    }
    this.entry=entry;entry.users++;
    const scale=spec.width/256,{x,y}=entry.bounds;
    const image=(name:string,blend:'MULTIPLY'|'NORMAL')=>scene.add.image(spec.x+x*scale,spec.y+y*scale,entry.key,name)
      .setOrigin(0).setScale(scale/entry.density).setDepth(FOUNDATION_DEPTH).setBlendMode(blend);
    this.shadow=image('shadow','MULTIPLY');this.wear=image('wear','NORMAL');
    if(entry.growth)this.growth=scene.add.sprite(spec.x+x*scale,spec.y+y*scale,entry.key,'growth').setOrigin(0).setScale(scale/entry.density).setBlendMode('NORMAL');
  }
  setVisible(visible:boolean){for(const image of [this.shadow,this.wear])if(image.visible!==visible)image.setVisible(visible);}
  setAlpha(alpha:number){this.shadow.setAlpha(alpha);this.wear.setAlpha(alpha);}
  setTint(tint:number){this.shadow.setTint(tint);this.wear.setTint(tint);}
  moveBy(dx:number,dy:number){for(const image of [this.shadow,this.wear])image.setPosition(image.x+dx,image.y+dy);}
  destroy(){
    this.shadow.destroy();this.wear.destroy();
    if(--this.entry.users===0){this.scene.textures.remove(this.entry.key);this.cache.delete(this.signature);}
  }
}
