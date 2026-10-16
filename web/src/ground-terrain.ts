import * as Phaser from 'phaser';
import {MAX_GROUND_LAYERS,groundLayers,type Ground} from './ground';
import {terrainMaterial,terrainMaterialKey} from './terrain-materials';
import {featureBounds,terrainFeature,terrainFeatureKey,type TerrainFeature} from './terrain-features';
import type {WorldScene} from './scene-schema';
import {worldAssetUrl} from './world-asset-url';

/** Materials are redrawn at this power-of-two size so WebGL1 can repeat and mipmap them. */
const MATERIAL_SIZE=1024;
const SHADER_NAME='GroundSplat';
const layerUniforms=Array.from({length:MAX_GROUND_LAYERS},(_,index)=>`uLayer${index}`);

/**
 * Blends up to six tiled materials by the control weights. Each material's brightness raises its weight a
 * little, so a blend reads as stones and grass interlocking rather than a cross-fade.
 */
const FRAGMENT=`
#pragma phaserTemplate(shaderName)
precision mediump float;
uniform sampler2D uControlA;
uniform sampler2D uControlB;
${layerUniforms.map(name=>`uniform sampler2D ${name};`).join('\n')}
uniform vec2 uGrid;
uniform float uCell;
uniform vec3 uScaleA;
uniform vec3 uScaleB;
uniform vec3 uTint;
uniform float uAlpha;
varying vec2 outTexCoord;
float height(vec3 color) { return dot(color, vec3(0.299, 0.587, 0.114)); }
void main() {
  vec2 world = outTexCoord;
  // Canvas textures upload with their first row at the bottom of texture space.
  vec2 control = (world / uCell + 0.5) / uGrid;
  control.y = 1.0 - control.y;
  vec3 a = texture2D(uControlA, control).rgb;
  vec3 b = texture2D(uControlB, control).rgb;
  vec3 c0 = texture2D(uLayer0, world * uScaleA.x).rgb;
  vec3 c1 = texture2D(uLayer1, world * uScaleA.y).rgb;
  vec3 c2 = texture2D(uLayer2, world * uScaleA.z).rgb;
  vec3 c3 = texture2D(uLayer3, world * uScaleB.x).rgb;
  vec3 c4 = texture2D(uLayer4, world * uScaleB.y).rgb;
  vec3 c5 = texture2D(uLayer5, world * uScaleB.z).rgb;
  float total = a.r + a.g + a.b + b.r + b.g + b.b;
  vec3 w = total > 0.0 ? a / total : vec3(1.0, 0.0, 0.0);
  vec3 v = total > 0.0 ? b / total : vec3(0.0);
  vec3 hw = w + 0.35 * vec3(height(c0), height(c1), height(c2)) * step(0.001, w);
  vec3 hv = v + 0.35 * vec3(height(c3), height(c4), height(c5)) * step(0.001, v);
  float top = max(max(max(hw.x, hw.y), hw.z), max(max(hv.x, hv.y), hv.z)) - 0.22;
  hw = max(hw - top, 0.0) * step(0.001, w);
  hv = max(hv - top, 0.0) * step(0.001, v);
  float sum = max(hw.x + hw.y + hw.z + hv.x + hv.y + hv.z, 0.0001);
  vec3 color = (c0 * hw.x + c1 * hw.y + c2 * hw.z + c3 * hv.x + c4 * hv.y + c5 * hv.z) / sum;
  gl_FragColor = vec4(color * uTint * uAlpha, uAlpha);
}`;

const potKey=(id:string)=>`ground-material-${id}`;
let controls=0;

/** Loads a material once and keeps a repeating power-of-two copy for every ground in the game. */
function materialTexture(scene:Phaser.Scene,id:string,ready:()=>void):boolean{
  if(scene.textures.exists(potKey(id)))return true;
  const material=terrainMaterial(id);if(!material)return false;
  const source=terrainMaterialKey(id);
  const finish=():void=>{
    if(scene.textures.exists(potKey(id))||!scene.textures.exists(source))return;
    const canvas=scene.textures.createCanvas(potKey(id),MATERIAL_SIZE,MATERIAL_SIZE);
    if(!canvas)return;
    canvas.context.drawImage(scene.textures.get(source).getSourceImage() as CanvasImageSource,0,0,MATERIAL_SIZE,MATERIAL_SIZE);
    canvas.refresh();
    canvas.setWrap(Phaser.Textures.WrapMode.REPEAT,Phaser.Textures.WrapMode.REPEAT);
    ready();
  };
  if(scene.textures.exists(source)){finish();return scene.textures.exists(potKey(id));}
  scene.load.once(`filecomplete-image-${source}`,finish);
  scene.load.image(source,worldAssetUrl(material.asset));
  if(!scene.load.isLoading())scene.load.start();
  return false;
}

/**
 * A town's painted ground: one shader quad over the whole town, plus feature art above it. Painting
 * re-uploads only the two small control textures.
 */
export class GroundTerrain {
  private shader?:Phaser.GameObjects.Shader;
  private controlA:Phaser.Textures.CanvasTexture;
  private controlB:Phaser.Textures.CanvasTexture;
  private features=new Map<string,{image:Phaser.GameObjects.Image;feature:TerrainFeature}>();
  private ground?:Ground;
  private tint=[1,1,1];
  private alphaValue=1;
  private depth=-1000;
  private shown=true;
  destroyed=false;
  constructor(private scene:Phaser.Scene,private world:WorldScene,readonly period:'day'|'night'='day'){
    const id=++controls;
    this.controlA=scene.textures.createCanvas(`ground-control-${id}-a`,1,1)!;
    this.controlB=scene.textures.createCanvas(`ground-control-${id}-b`,1,1)!;
    this.apply(world);
  }
  get alpha():number{return this.alphaValue;}
  get visible():boolean{return this.shown;}
  get ready():boolean{
    return !!this.shader&&this.layerIds.every(id=>this.scene.textures.exists(potKey(id)))
      &&[...this.features.values()].every(({feature})=>this.scene.textures.exists(terrainFeatureKey(feature.asset)));
  }
  get nativeSize():{width:number;height:number}{return {width:this.world.width*MATERIAL_SIZE/256,height:this.world.height*MATERIAL_SIZE/256};}
  private get layerIds():string[]{return this.ground?.layers??[];}
  /** The camera view does not matter: the shader covers the town and the GPU draws what is on screen. */
  update(_view?:unknown,_zoom?:number):void{}
  setWorld(world:WorldScene):this{
    if(this.destroyed||world===this.world)return this;
    this.world=world;this.apply(world);return this;
  }
  private apply(world:WorldScene):void{
    const ground=world.ground;
    if(ground!==this.ground){this.ground=ground;this.upload(ground);}
    this.syncFeatures(ground.features??[]);
  }
  private upload(ground:Ground):void{
    const {columns,rows,layers}=groundLayers(ground,this.world.width,this.world.height);
    for(const [texture,offset] of [[this.controlA,0],[this.controlB,3]] as const){
      if(texture.width!==columns||texture.height!==rows)texture.setSize(columns,rows);
      const image=texture.context.createImageData(columns,rows),pixels=image.data;
      for(let index=0;index<columns*rows;index++){
        for(let channel=0;channel<3;channel++)pixels[index*4+channel]=layers[offset+channel]?.[index]??0;
        pixels[index*4+3]=255;
      }
      texture.context.putImageData(image,0,0);texture.refresh();
    }
    const missing=ground.layers.filter(id=>!materialTexture(this.scene,id,()=>{if(!this.destroyed)this.bind();}));
    if(!missing.length||!this.shader)this.bind();
  }
  /** Points the shader at the current materials; layers still loading draw as the first material. */
  private bind():void{
    const ground=this.ground;if(!ground||this.destroyed)return;
    const ids=ground.layers.map(id=>this.scene.textures.exists(potKey(id))?id:undefined);
    const fallback=ids.find(Boolean);
    if(!fallback)return;
    const textures=[this.controlA.key,this.controlB.key,...Array.from({length:MAX_GROUND_LAYERS},(_,index)=>potKey(ids[index]??fallback))];
    const scales=Array.from({length:MAX_GROUND_LAYERS},(_,index)=>1/(terrainMaterial(ground.layers[index]??fallback)?.worldSize??256));
    const {columns,rows}=groundLayers(ground,this.world.width,this.world.height);
    if(!this.shader){
      this.shader=this.scene.add.shader({name:SHADER_NAME,fragmentSource:FRAGMENT,setupUniforms:(set:(name:string,value:unknown)=>void)=>{
        set('uControlA',0);set('uControlB',1);
        layerUniforms.forEach((name,index)=>set(name,index+2));
        set('uGrid',this.grid);set('uCell',this.ground?.cell??8);
        set('uScaleA',this.scales.slice(0,3));set('uScaleB',this.scales.slice(3,6));
        set('uTint',this.tint);set('uAlpha',this.alphaValue);
      }},0,0,this.world.width,this.world.height,textures)
        .setOrigin(0).setDepth(this.depth).setVisible(this.shown);
    } else {this.shader.setTextures(textures);this.shader.setSize(this.world.width,this.world.height);}
    this.shader.setTextureCoordinates(0,0,this.world.width,0,0,this.world.height,this.world.width,this.world.height);
    this.grid=[columns,rows];this.scales=scales;
  }
  private grid:[number,number]=[1,1];
  private scales:number[]=Array(MAX_GROUND_LAYERS).fill(1/256);
  private syncFeatures(features:readonly TerrainFeature[]):void{
    const wanted=new Set(features.map(feature=>feature.id));
    for(const [id,shown]of this.features)if(!wanted.has(id)){shown.image.destroy();this.features.delete(id);}
    features.forEach((feature,order)=>{
      const art=terrainFeature(feature.asset);if(!art)return;
      const key=terrainFeatureKey(feature.asset),bounds=featureBounds(feature);
      let shown=this.features.get(feature.id);
      const place=():void=>{
        if(this.destroyed||!this.scene.textures.exists(key))return;
        if(!shown){shown={image:this.scene.add.image(0,0,key).setOrigin(0),feature};this.features.set(feature.id,shown);}
        if(shown.image.texture.key!==key)shown.image.setTexture(key);
        shown.feature=feature;
        shown.image.setPosition(bounds.x,bounds.y).setDisplaySize(bounds.width,bounds.height).setDepth(this.depth+.001*(order+1))
          .setAlpha(this.alphaValue).setVisible(this.shown).setTint(Phaser.Display.Color.GetColor(this.tint[0]*255,this.tint[1]*255,this.tint[2]*255));
      };
      if(this.scene.textures.exists(key))place();
      else{this.scene.load.once(`filecomplete-image-${key}`,place);this.scene.load.image(key,worldAssetUrl(art.asset));if(!this.scene.load.isLoading())this.scene.load.start();}
    });
  }
  setDepth(depth:number):this{this.depth=depth;this.shader?.setDepth(depth);let order=1;for(const {image}of this.features.values())image.setDepth(depth+.001*order++);return this;}
  setAlpha(alpha:number):this{this.alphaValue=alpha;for(const {image}of this.features.values())image.setAlpha(alpha);return this;}
  setTint(tint:number):this{
    this.tint=[(tint>>16&255)/255,(tint>>8&255)/255,(tint&255)/255];
    for(const {image}of this.features.values())image.setTint(tint);
    return this;
  }
  setVisible(visible:boolean):this{this.shown=visible;this.shader?.setVisible(visible);for(const {image}of this.features.values())image.setVisible(visible);return this;}
  destroy():void{
    if(this.destroyed)return;this.destroyed=true;
    this.shader?.destroy();for(const {image}of this.features.values())image.destroy();this.features.clear();
    this.scene.textures.remove(this.controlA);this.scene.textures.remove(this.controlB);
  }
}
