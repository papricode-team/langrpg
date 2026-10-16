import * as Phaser from 'phaser';
import {MAX_GROUND_LAYERS,groundColorPixels,groundLayers,type Ground} from './ground';
import {terrainMaterial,terrainMaterialKey} from './terrain-materials';
import {featureBounds,terrainFeature,terrainFeatureKey,type TerrainFeature} from './terrain-features';
import type {WorldScene} from './scene-schema';
import {worldAssetUrl} from './world-asset-url';
import {QUALITY_SWAP_EVENT} from './texture-frame';

/** Materials are redrawn at this power-of-two size so WebGL1 can repeat and mipmap them. */
const MATERIAL_SIZE=1024;
const SHADER_NAME='GroundSplat';
const layerUniforms=Array.from({length:MAX_GROUND_LAYERS},(_,index)=>`uLayer${index}`);

/** Width of the kerb stones along paving, and of the coping and wall face along water, in world units. */
export const KERB_WIDTH=10,COPING_WIDTH=9,WALL_DEPTH=10;

/**
 * Blends up to six tiled materials by the control weights. Ground materials (grass, earth) blend with each
 * other by height, so they read as interlocking rather than a cross-fade. Paving and water are built, not
 * grown: their outline is the half-weight contour, found from the weights' gradient, and is drawn crisp with
 * a row of kerb stones (paving) or a coping and wall face (water) in the masonry material.
 */
const FRAGMENT=`
#pragma phaserTemplate(shaderName)
precision highp float;
uniform sampler2D uControlA;
uniform sampler2D uControlB;
${layerUniforms.map(name=>`uniform sampler2D ${name};`).join('\n')}
uniform sampler2D uMasonry;
uniform vec2 uGrid;
uniform float uCell;
uniform vec3 uScaleA;
uniform vec3 uScaleB;
uniform vec3 uPaveA;
uniform vec3 uPaveB;
uniform vec3 uWaterA;
uniform vec3 uWaterB;
uniform vec3 uTint;
uniform float uAlpha;
varying vec2 outTexCoord;
const float KERB = ${KERB_WIDTH.toFixed(1)};
const float COPING = ${COPING_WIDTH.toFixed(1)};
const float WALL = ${WALL_DEPTH.toFixed(1)};
float height(vec3 color) { return dot(color, vec3(0.299, 0.587, 0.114)); }
vec2 controlAt(vec2 world) {
  // Canvas textures upload with their first row at the bottom of texture space.
  vec2 control = (world / uCell + 0.5) / uGrid;
  return vec2(control.x, 1.0 - control.y);
}
/** Share of the weight held by the masked layers. */
float share(vec2 world, vec3 maskA, vec3 maskB) {
  vec2 control = controlAt(world);
  vec3 a = texture2D(uControlA, control).rgb;
  vec3 b = texture2D(uControlB, control).rgb;
  float total = a.r + a.g + a.b + b.r + b.g + b.b;
  return total > 0.0 ? (dot(a, maskA) + dot(b, maskB)) / total : 0.0;
}
/** Signed distance in world units to the half-share contour, positive inside. */
float contour(vec2 world, vec3 maskA, vec3 maskB, float here) {
  float d = uCell * 0.75;
  vec2 g = vec2(share(world + vec2(d, 0.0), maskA, maskB) - share(world - vec2(d, 0.0), maskA, maskB),
                share(world + vec2(0.0, d), maskA, maskB) - share(world - vec2(0.0, d), maskA, maskB)) / (2.0 * d);
  return (here - 0.5) / max(length(g), 0.0004);
}
/** Height-weighted blend of the layers in mask; empty masks fall back to the plain blend. */
vec3 blend(vec3 w, vec3 v, vec3 c0, vec3 c1, vec3 c2, vec3 c3, vec3 c4, vec3 c5, vec3 maskA, vec3 maskB) {
  vec3 mw = w * maskA, mv = v * maskB;
  if (mw.x + mw.y + mw.z + mv.x + mv.y + mv.z < 0.001) { mw = w; mv = v; }
  vec3 hw = mw + 0.35 * vec3(height(c0), height(c1), height(c2)) * step(0.001, mw);
  vec3 hv = mv + 0.35 * vec3(height(c3), height(c4), height(c5)) * step(0.001, mv);
  float top = max(max(max(hw.x, hw.y), hw.z), max(max(hv.x, hv.y), hv.z)) - 0.22;
  hw = max(hw - top, 0.0) * step(0.001, mw);
  hv = max(hv - top, 0.0) * step(0.001, mv);
  float sum = max(hw.x + hw.y + hw.z + hv.x + hv.y + hv.z, 0.0001);
  return (c0 * hw.x + c1 * hw.y + c2 * hw.z + c3 * hv.x + c4 * hv.y + c5 * hv.z) / sum;
}
void main() {
  vec2 world = outTexCoord;
  vec2 control = controlAt(world);
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
  vec3 builtA = clamp(uPaveA + uWaterA, 0.0, 1.0), builtB = clamp(uPaveB + uWaterB, 0.0, 1.0);
  vec3 color = blend(w, v, c0, c1, c2, c3, c4, c5, 1.0 - builtA, 1.0 - builtB);
  vec3 masonry = texture2D(uMasonry, world / 96.0).rgb;

  float pave = dot(w, uPaveA) + dot(v, uPaveB);
  if (pave > 0.02) {
    float inside = contour(world, uPaveA, uPaveB, pave);
    vec3 paving = blend(w, v, c0, c1, c2, c3, c4, c5, uPaveA, uPaveB);
    // A raised row of pale kerb stones: lit along its outer top edge, a shaded joint against the paving,
    // and a short shadow cast on the ground outside it.
    if (inside < 0.0) color *= 1.0 - 0.32 * smoothstep(-6.0, 0.0, inside);
    vec3 stone = mix(masonry * 1.3, vec3(0.74, 0.71, 0.64), 0.55);
    float light = 0.9 + 0.22 * smoothstep(0.0, 1.5, inside) * (1.0 - smoothstep(1.5, 3.5, inside)) - 0.22 * smoothstep(KERB - 2.5, KERB, inside);
    vec3 kerb = stone * light;
    color = mix(color, kerb, smoothstep(-0.6, 0.6, inside));
    color = mix(color, paving * 0.82, smoothstep(KERB - 0.5, KERB + 0.5, inside));
    color = mix(color, paving, smoothstep(KERB + 0.5, KERB + 3.0, inside));
  }

  float wet = dot(w, uWaterA) + dot(v, uWaterB);
  if (wet > 0.02) {
    float inside = contour(world, uWaterA, uWaterB, wet);
    vec3 water = blend(w, v, c0, c1, c2, c3, c4, c5, uWaterA, uWaterB);
    // Water darkens in the wall's shade; the wall face is masonry in shadow; the coping is lit stone.
    water *= mix(0.62, 1.0, smoothstep(WALL, WALL + 26.0, inside));
    vec3 wall = masonry * mix(0.5, 0.72, smoothstep(0.0, WALL, inside));
    vec3 coping = masonry * (0.95 + 0.2 * smoothstep(-COPING, 0.0, inside));
    coping *= 1.0 - 0.4 * (1.0 - smoothstep(0.0, 1.2, abs(inside + COPING)));
    color = mix(color, coping, smoothstep(-COPING - 0.6, -COPING + 0.6, inside));
    color = mix(color, wall, smoothstep(-0.6, 0.6, inside));
    color = mix(color, water, smoothstep(WALL - 0.8, WALL + 0.8, inside));
  }
  gl_FragColor = vec4(color * uTint * uAlpha, uAlpha);
}`;
/** The stone drawn for kerbs, copings and canal walls. */
const MASONRY='canal-masonry';
const groupMask=(ground:Ground,group:string,offset:number)=>
  [0,1,2].map(channel=>terrainMaterial(ground.layers[offset+channel]??'')?.group===group?1:0);
/** Built water (canals, harbours) gets a coping and wall; streams and ponds keep their natural edge. */
const wallMask=(ground:Ground,offset:number)=>
  [0,1,2].map(channel=>terrainMaterial(ground.layers[offset+channel]??'')?.walled?1:0);

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
    const paint=():void=>{
      canvas.context.clearRect(0,0,MATERIAL_SIZE,MATERIAL_SIZE);
      canvas.context.drawImage(scene.textures.get(source).getSourceImage() as CanvasImageSource,0,0,MATERIAL_SIZE,MATERIAL_SIZE);
      canvas.refresh();
    };
    paint();
    canvas.setWrap(Phaser.Textures.WrapMode.REPEAT,Phaser.Textures.WrapMode.REPEAT);
    // The material first arrives at Low quality; repaint the shared copy when a sharper one replaces it.
    const textures=scene.textures;
    const repaint=(key:string):void=>{
      if(!textures.exists(potKey(id)))textures.off(QUALITY_SWAP_EVENT,repaint);
      else if(key===source&&textures.exists(source))paint();
    };
    textures.on(QUALITY_SWAP_EVENT,repaint);
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
  /** Without WebGL the ground shows as its blended material colours. */
  private flat?:Phaser.GameObjects.Image;
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
    if(this.flat)return true;
    return !!this.shader&&[...this.layerIds,MASONRY].every(id=>this.scene.textures.exists(potKey(id)))
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
    if(this.scene.game.renderer.type!==Phaser.WEBGL){this.drawFlat(ground);return;}
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
    const missing=[...ground.layers,MASONRY].filter(id=>!materialTexture(this.scene,id,()=>{if(!this.destroyed)this.bind();}));
    if(!missing.length||!this.shader)this.bind();
  }
  private drawFlat(ground:Ground):void{
    const {columns,rows,pixels}=groundColorPixels(ground,this.world.width,this.world.height);
    if(this.controlA.width!==columns||this.controlA.height!==rows)this.controlA.setSize(columns,rows);
    const image=this.controlA.context.createImageData(columns,rows);image.data.set(pixels);
    this.controlA.context.putImageData(image,0,0);this.controlA.refresh();
    const cell=ground.cell;
    this.flat??=this.scene.add.image(0,0,this.controlA.key).setOrigin(0).setDepth(this.depth).setVisible(this.shown);
    this.flat.setTexture(this.controlA.key).setPosition(-cell/2,-cell/2).setDisplaySize(this.world.width+cell,this.world.height+cell)
      .setAlpha(this.alphaValue).setTint(Phaser.Display.Color.GetColor(this.tint[0]*255,this.tint[1]*255,this.tint[2]*255));
  }
  /** Points the shader at the current materials; layers still loading draw as the first material. */
  private bind():void{
    const ground=this.ground;if(!ground||this.destroyed)return;
    const ids=ground.layers.map(id=>this.scene.textures.exists(potKey(id))?id:undefined);
    const fallback=ids.find(Boolean);
    if(!fallback)return;
    const masonry=this.scene.textures.exists(potKey(MASONRY))?potKey(MASONRY):potKey(fallback);
    const textures=[this.controlA.key,this.controlB.key,...Array.from({length:MAX_GROUND_LAYERS},(_,index)=>potKey(ids[index]??fallback)),masonry];
    const scales=Array.from({length:MAX_GROUND_LAYERS},(_,index)=>1/(terrainMaterial(ground.layers[index]??fallback)?.worldSize??256));
    const {columns,rows}=groundLayers(ground,this.world.width,this.world.height);
    if(!this.shader){
      this.shader=this.scene.add.shader({name:SHADER_NAME,fragmentSource:FRAGMENT,setupUniforms:(set:(name:string,value:unknown)=>void)=>{
        set('uControlA',0);set('uControlB',1);
        layerUniforms.forEach((name,index)=>set(name,index+2));
        set('uMasonry',MAX_GROUND_LAYERS+2);
        set('uPaveA',this.masks.pave.slice(0,3));set('uPaveB',this.masks.pave.slice(3,6));
        set('uWaterA',this.masks.water.slice(0,3));set('uWaterB',this.masks.water.slice(3,6));
        set('uGrid',this.grid);set('uCell',this.ground?.cell??8);
        set('uScaleA',this.scales.slice(0,3));set('uScaleB',this.scales.slice(3,6));
        set('uTint',this.tint);set('uAlpha',this.alphaValue);
      }},0,0,this.world.width,this.world.height,textures)
        .setOrigin(0).setDepth(this.depth).setVisible(this.shown);
    } else {this.shader.setTextures(textures);this.shader.setSize(this.world.width,this.world.height);}
    this.shader.setTextureCoordinates(0,0,this.world.width,0,0,this.world.height,this.world.width,this.world.height);
    this.grid=[columns,rows];this.scales=scales;
    this.masks={pave:[...groupMask(ground,'Paving',0),...groupMask(ground,'Paving',3)],water:[...wallMask(ground,0),...wallMask(ground,3)]};
  }
  private grid:[number,number]=[1,1];
  private scales:number[]=Array(MAX_GROUND_LAYERS).fill(1/256);
  private masks={pave:Array(MAX_GROUND_LAYERS).fill(0) as number[],water:Array(MAX_GROUND_LAYERS).fill(0) as number[]};
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
  setDepth(depth:number):this{this.depth=depth;this.shader?.setDepth(depth);this.flat?.setDepth(depth);let order=1;for(const {image}of this.features.values())image.setDepth(depth+.001*order++);return this;}
  setAlpha(alpha:number):this{this.alphaValue=alpha;this.flat?.setAlpha(alpha);for(const {image}of this.features.values())image.setAlpha(alpha);return this;}
  setTint(tint:number):this{
    this.tint=[(tint>>16&255)/255,(tint>>8&255)/255,(tint&255)/255];
    this.flat?.setTint(tint);
    for(const {image}of this.features.values())image.setTint(tint);
    return this;
  }
  setVisible(visible:boolean):this{this.shown=visible;this.shader?.setVisible(visible);this.flat?.setVisible(visible);for(const {image}of this.features.values())image.setVisible(visible);return this;}
  destroy():void{
    if(this.destroyed)return;this.destroyed=true;
    this.shader?.destroy();this.flat?.destroy();for(const {image}of this.features.values())image.destroy();this.features.clear();
    this.scene.textures.remove(this.controlA);this.scene.textures.remove(this.controlB);
  }
}
