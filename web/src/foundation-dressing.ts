import {sceneDocument} from './scene-data';
import type {PlacedScenerySpec} from './placed-scenery';
import type {ScenePolygon,SceneryGeometry} from './scene-schema';
import {groundColorAt,groundWeightsAt,type Ground} from './ground';

type Colour=readonly [number,number,number];
export interface FoundationGround {colour:Colour;vegetation:number;water:number;}
export interface FoundationPatch {
  x:number;y:number;seed:number;soil:Colour;moss:Colour;grass:Colour;
  vegetation:number;growth:boolean;tuft:boolean;
}
const clamp=(n:number,min=0,max=1)=>Math.max(min,Math.min(max,n));
const random=(seed:number,index:number)=>{
  let value=(seed+Math.imul(index+1,0x9e3779b9))|0;
  value=Math.imul(value^(value>>>16),0x21f0aaad);value=Math.imul(value^(value>>>15),0x735a2d97);
  return ((value^(value>>>15))>>>0)/4294967296;
};

const vegetation:Record<string,number>={'meadow':1,'forest-floor':1,'moss':1,'marsh':1,'canal-grass':1,'farmland':.6,'dry-grass':.5};
/** The painted ground under a point: its blended colour, how green it is and how wet. */
export function foundationGround(mapId:string,x:number,y:number,ground:Ground|undefined=sceneDocument.maps[mapId]?.ground):FoundationGround {
  const scene=sceneDocument.maps[mapId];
  if(!ground||!scene)return {colour:[143,132,104],vegetation:.18,water:0};
  const weights=groundWeightsAt(ground,scene.width,scene.height,x,y);
  const share=(test:(id:string)=>number)=>ground.layers.reduce((sum,id,index)=>sum+weights[index]*test(id),0);
  return {colour:groundColorAt(ground,scene.width,scene.height,x,y),vegetation:share(id=>vegetation[id]??0),water:share(id=>id.endsWith('water')?1:0)};
}

/** Uniform spacing avoids piling paint onto every pixel of an alpha contour. */
export function foundationSites(lines:readonly ScenePolygon[]):readonly (readonly [number,number])[] {
  const sites:[number,number][]=[];
  for(const line of lines){
    let until=3;
    for(let i=1;i<line.length;i++){
      const [x,y]=line[i-1],[endX,endY]=line[i],dx=endX-x,dy=endY-y,length=Math.hypot(dx,dy);
      if(length>24){until=3;continue;} // A step between detached silhouettes is not soil.
      let distance=until;
      for(;distance<=length;distance+=8){sites.push([x+dx*distance/length,y+dy*distance/length]);if(sites.length>=96)return sites;}
      until=distance-length;
    }
  }
  return sites;
}

export function foundationPatches(lines:readonly ScenePolygon[],spec:PlacedScenerySpec,geometry:SceneryGeometry|undefined,
  sample:(x:number,y:number)=>FoundationGround):readonly FoundationPatch[] {
  let seed=2166136261;for(const char of spec.id)seed=Math.imul(seed^char.charCodeAt(0),16777619);
  const scale=spec.width/256,door=geometry?.door,reference=256/(geometry?.referenceWidth??256);
  const patches:FoundationPatch[]=foundationSites(lines).flatMap(([x,y],index)=>{
    const ground=sample(spec.x+x*scale,spec.y+(y+4)*scale);
    if(ground.water>.45)return [];
    const [r,g,b]=ground.colour,vegetation=ground.vegetation;
    const doorX=x*(spec.flipX?-1:1);
    const approach=door&&doorX>door.x*reference-8&&doorX<(door.x+door.width)*reference+8;
    const growth=!approach&&random(seed,index*4)>.38;
    return [{x,y,seed:Math.floor(random(seed,index*4+1)*2147483647),vegetation,growth,
      tuft:false,
      soil:[Math.round(clamp(r*.57+23,65,143)),Math.round(clamp(g*.49+19,52,119)),Math.round(clamp(b*.36+12,32,82))] as Colour,
      moss:[Math.round(r*.29+22),Math.round(g*.36+26),Math.round(b*.18+12)] as Colour,
      grass:[Math.round(r*.27+31),Math.round(g*.39+34),Math.round(b*.19+13)] as Colour}];
  });
  // Guarantee a few separated tufts where there is room, with more on planted
  // ground. Repeated buildings keep different, deterministic arrangements.
  const candidates=patches.filter(patch=>patch.growth).sort((a,b)=>(b.vegetation*.6+random(b.seed,4))-(a.vegetation*.6+random(a.seed,4)));
  const mean=candidates.reduce((sum,patch)=>sum+patch.vegetation,0)/Math.max(1,candidates.length);
  const count=Math.round(clamp(2+mean*3+patches.length/30,2,7)),tufts:FoundationPatch[]=[];
  for(const patch of candidates)if(tufts.length<count&&tufts.every(other=>Math.hypot(other.x-patch.x,other.y-patch.y)>18)){
    patch.tuft=true;tufts.push(patch);
  }
  return patches;
}

const rgba=(colour:Colour,alpha:number,brightness=1)=>`rgba(${colour.map(c=>Math.round(clamp(c*brightness,0,255))).join(',')},${alpha})`;
export function paintFoundationDressing(context:CanvasRenderingContext2D,patches:readonly FoundationPatch[],layer:'ground'|'growth'):void {
  for(const patch of patches){
    const {x,y,soil,moss,grass,seed,vegetation}=patch;
    if(layer==='ground'){
      context.save();context.translate(x,y+2.2);context.scale(1,.52);
      const radius=5+random(seed,1)*5+vegetation*3;
      const wash=context.createRadialGradient(0,0,0,0,0,radius);
      wash.addColorStop(0,rgba(soil,.34));wash.addColorStop(.5,rgba(soil,.16));wash.addColorStop(1,rgba(soil,0));
      context.fillStyle=wash;context.fillRect(-radius,-radius,radius*2,radius*2);context.restore();
      // Small broken earth grains retain the painted paving underneath.
      for(let i=0;i<7;i++){
        const px=x+(random(seed,i*3+20)-.5)*12,py=y+random(seed,i*3+21)*4;
        context.fillStyle=rgba(soil,.16+random(seed,i*3+22)*.22,.8+random(seed,i+50)*.5);
        context.beginPath();context.ellipse(px,py,.3+random(seed,i+60)*.65,.2+random(seed,i+70)*.3,0,0,Math.PI*2);context.fill();
      }
    }
    if(!patch.growth)continue;
    // Uneven clusters cross the stone/ground seam; never a continuous green rim.
    const coverage=layer==='ground'?7:11;
    for(let i=0;i<coverage;i++){
      const px=x+(random(seed,i*4+100)-.5)*(4+vegetation*4);
      const py=y+(layer==='ground'?2:-1)+(random(seed,i*4+101)-.5)*3;
      context.fillStyle=rgba(moss,.20+random(seed,i*4+102)*.40,.8+random(seed,i+150)*.5);
      context.beginPath();context.ellipse(px,py,.5+random(seed,i*4+103)*1.1,.3+random(seed,i+170)*.7,random(seed,i+190),0,Math.PI*2);context.fill();
    }
    if(layer!=='growth'||!patch.tuft)continue;
    // A handful of tapered, curved blades, with dark roots and sunlit tips.
    for(let i=0;i<6;i++){
      const root=x+(random(seed,i*3+200)-.5)*3,base=y+1+random(seed,i*3+201);
      const lean=(random(seed,i*3+202)-.5)*7,height=3+random(seed,i+230)*4+vegetation*2;
      context.fillStyle=rgba(grass,.90,.65+random(seed,i+250)*.8);
      context.beginPath();context.moveTo(root-.5,base);
      context.quadraticCurveTo(root+lean*.15,base-height*.65,root+lean,base-height);
      context.quadraticCurveTo(root+lean*.55+.3,base-height*.5,root+.55,base);
      context.closePath();context.fill();
    }
  }
}
