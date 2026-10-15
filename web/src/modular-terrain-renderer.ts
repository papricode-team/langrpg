import type * as Phaser from 'phaser';
import type {ModularTerrain} from './modular-terrain';
import type {ScenePolygon,WorldScene} from './scene-schema';
import {terrainMaterial,terrainMaterialKey} from './terrain-materials';
import {terrainFeature,terrainFeatureKey,featureBounds} from './terrain-features';
import type {TerrainView} from './terrain-residency';
import type {TerrainResidency} from './terrain-residency';
import {paintTerrainEdge,terrainMaterialDependencies} from './terrain-masonry';
import {paintRoadCurbs} from './terrain-curbs';
import {clipBridgeClearance,paintJoinedBridge} from './terrain-bridge-joins';
const CHUNK=256;
let sequence=0;
interface Chunk {key:string;image:Phaser.GameObjects.Image;}
/** One world-space pattern origin across every chunk and surface prevents join seams. */
export function paintModularTerrain(context:CanvasRenderingContext2D,terrain:ModularTerrain,view:TerrainView,
  source:(id:string)=>CanvasImageSource|undefined,
  featureSource:(id:string)=>CanvasImageSource|undefined=()=>undefined):void{
  const fill=(id:string,shape?:ScenePolygon)=>{
    const material=terrainMaterial(id);if(!material)return;
    context.save();
    if(shape){context.beginPath();shape.forEach(([x,y],index)=>index?context.lineTo(x,y):context.moveTo(x,y));context.closePath();context.clip();}
    const image=source(id),pattern=image?context.createPattern(image,'repeat'):null;
    if(pattern)pattern.setTransform({a:material.worldSize/material.width,b:0,c:0,d:material.worldSize/material.height,e:0,f:0});
    context.fillStyle=pattern??material.color;
    context.fillRect(view.x,view.y,view.width,view.height);
    context.restore();
  };
  fill(terrain.base);
  for(const surface of terrain.surfaces){
    const p=surface.polygon;
    if(Math.max(...p.map(v=>v[0]))<view.x||Math.min(...p.map(v=>v[0]))>view.x+view.width
      ||Math.max(...p.map(v=>v[1]))<view.y||Math.min(...p.map(v=>v[1]))>view.y+view.height)continue;
    fill(surface.material,p);
  }
  // Borders follow the final road silhouette, including gardens painted over paving.
  // Draw after the ground so grass cannot bury the raised stones around its islands.
  context.save();clipBridgeClearance(context,terrain,view);
  paintRoadCurbs(context,terrain,view,source);
  context.restore();
  for(const surface of terrain.surfaces){
    const edge=terrainMaterial(surface.material)?.edge;
    if(edge?.kind==='quay')paintTerrainEdge(context,surface.polygon,'quay',source,edge.height,view);
  }
  for(const feature of terrain.features??[]){
    const bounds=featureBounds(feature);
    if(bounds.x+bounds.width<view.x||bounds.x>view.x+view.width||bounds.y+bounds.height<view.y||bounds.y>view.y+view.height)continue;
    const image=featureSource(feature.asset);
    if(image){
      if(feature.asset==='canal-arch-bridge')paintJoinedBridge(context,terrain,feature,image);
      else context.drawImage(image,bounds.x,bounds.y,bounds.width,bounds.height);
    }
  }
}
/** Cache only visible composed chunks. Source art is shared through terrain residency. */
export class ModularTerrainRenderer {
  private chunks=new Map<string,Chunk>();
  private prefix=`modular-${sequence++}-`;
  private stamp='';
  private settledView='';
  private tint=0xffffff;
  private alive=true;
  private enabled=true;
  private root:Phaser.GameObjects.Container;
  private density=1;
  private visibleMaterials:string[]=[];
  private visibleFeatures:string[]=[];
  constructor(private scene:Phaser.Scene,private world:WorldScene,private pool:TerrainResidency){this.root=scene.add.container(0,0).setDepth(-1000);}
  get alpha():number{return this.root.alpha;}
  get visible():boolean{return this.root.visible;}
  get ready():boolean{return this.chunks.size>0&&this.visibleMaterials.every(id=>this.scene.textures.exists(terrainMaterialKey(id)))&&this.visibleFeatures.every(id=>this.scene.textures.exists(terrainFeatureKey(id)));}
  get nativeSize(){return {width:this.world.width*this.density,height:this.world.height*this.density};}
  private materials(view:TerrainView):string[]{return [...new Set([this.world.modularTerrain!.base,...this.world.modularTerrain!.surfaces.filter(surface=>{
    const xs=surface.polygon.map(p=>p[0]),ys=surface.polygon.map(p=>p[1]);
    return Math.max(...xs)>=view.x-CHUNK&&Math.min(...xs)<=view.x+view.width+CHUNK&&Math.max(...ys)>=view.y-CHUNK&&Math.min(...ys)<=view.y+view.height+CHUNK;
  }).map(surface=>surface.material)])];}
  setWorld(world:WorldScene):void{if(world.modularTerrain!==this.world.modularTerrain){this.world=world;this.clear();}}
  update(view:TerrainView,zoom=1):void{
    if(!this.alive||!this.enabled)return;
    const viewKey=`${view.x}:${view.y}:${view.width}:${view.height}:${zoom}`;
    if(viewKey===this.settledView)return;
    const ids=terrainMaterialDependencies(this.materials(view));this.visibleMaterials=ids;
    const features=[...new Set((this.world.modularTerrain!.features??[]).filter(feature=>{
      const b=featureBounds(feature);return b.x+b.width>=view.x-CHUNK&&b.x<=view.x+view.width+CHUNK&&b.y+b.height>=view.y-CHUNK&&b.y<=view.y+view.height+CHUNK;
    }).map(feature=>feature.asset))];this.visibleFeatures=features;
    this.pool.retain(this,[...ids.map(id=>({key:terrainMaterialKey(id),asset:terrainMaterial(id)!.asset})),...features.map(id=>({key:terrainFeatureKey(id),asset:terrainFeature(id)!.asset}))]);
    const x0=Math.max(0,Math.floor(view.x/CHUNK)),y0=Math.max(0,Math.floor(view.y/CHUNK));
    const x1=Math.min(Math.ceil(this.world.width/CHUNK),Math.ceil((view.x+view.width)/CHUNK)),y1=Math.min(Math.ceil(this.world.height/CHUNK),Math.ceil((view.y+view.height)/CHUNK));
    const count=Math.max(1,(x1-x0)*(y1-y0));
    // At most 32 megapixels of composed terrain, independent of map area.
    const density=Math.min(4,Math.max(1,Math.ceil(zoom*2)),Math.max(1,Math.floor(Math.sqrt(32*1024*1024/(count*CHUNK*CHUNK)))));
    const stamp=`${density}:${ids.filter(id=>this.scene.textures.exists(terrainMaterialKey(id))).join(',')}:${features.filter(id=>this.scene.textures.exists(terrainFeatureKey(id))).join(',')}`;
    if(stamp!==this.stamp){this.clear();this.stamp=stamp;this.density=density;}
    const wanted=new Set<string>();
    for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){
      const id=`${x}-${y}`;wanted.add(id);if(this.chunks.has(id))continue;
      const width=Math.min(CHUNK,this.world.width-x*CHUNK),height=Math.min(CHUNK,this.world.height-y*CHUNK);
      const key=this.prefix+id,texture=this.scene.textures.createCanvas(key,width*density+2,height*density+2);if(!texture)continue;
      const context=texture.context;context.translate(1,1);context.scale(density,density);context.translate(-x*CHUNK,-y*CHUNK);
      paintModularTerrain(context,this.world.modularTerrain!,{x:x*CHUNK-1/density,y:y*CHUNK-1/density,width:width+2/density,height:height+2/density},id=>{
        const key=terrainMaterialKey(id);return this.scene.textures.exists(key)?this.scene.textures.get(key).getSourceImage() as HTMLImageElement:undefined;
      },id=>{
        const key=terrainFeatureKey(id);return this.scene.textures.exists(key)?this.scene.textures.get(key).getSourceImage() as HTMLImageElement:undefined;
      });
      texture.refresh();texture.add('visible',0,1,1,width*density,height*density);
      const image=this.scene.add.image(x*CHUNK,y*CHUNK,key,'visible').setOrigin(0).setDisplaySize(width,height).setTint(this.tint);
      this.root.add(image);this.chunks.set(id,{key,image});
    }
    for(const [id,chunk]of this.chunks)if(!wanted.has(id)){chunk.image.destroy();this.scene.textures.remove(chunk.key);this.chunks.delete(id);}
    if(this.ready)this.settledView=viewKey;
  }
  private clear():void{for(const chunk of this.chunks.values()){chunk.image.destroy();this.scene.textures.remove(chunk.key);}this.chunks.clear();this.stamp='';this.settledView='';}
  setDepth(depth:number):this{this.root.setDepth(depth);return this;}
  setAlpha(alpha:number):this{this.root.setAlpha(alpha);return this;}
  setTint(tint:number):this{this.tint=tint;for(const chunk of this.chunks.values())chunk.image.setTint(tint);return this;}
  setVisible(visible:boolean):this{this.enabled=visible;this.root.setVisible(visible);if(!visible){this.clear();this.pool.release(this);}return this;}
  destroy():void{if(!this.alive)return;this.alive=false;this.clear();this.root.destroy();this.pool.release(this);}
}
