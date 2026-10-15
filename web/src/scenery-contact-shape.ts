import type {PlacedScenerySpec} from './placed-scenery';
import type {ScenePolygon} from './scene-schema';

export type SceneryContactKind='leaf-tree'|'conifer'|'post'|'bench'|'market'|'planter'|'fountain'|'boat';
export function sceneryContactKind(spec:Pick<PlacedScenerySpec,'asset'>):SceneryContactKind|undefined {
  switch(spec.asset){
    case 'tree':return 'leaf-tree';
    case 'cypress':return 'conifer';
    case 'lamp':case 'sign':return 'post';
    case 'bench':return 'bench';
    case 'stall':return 'market';
    case 'planter':return 'planter';
    case 'fountain':return 'fountain';
    case 'boat':return 'boat';
    default:return undefined;
  }
}
export interface ContactArtworkSize {width:number;height:number;referenceWidth:number;originX:number;originY:number;}
const lowerBand:Record<SceneryContactKind,number>={
  'leaf-tree':.10,conifer:.065,post:.065,bench:.22,market:.17,planter:.16,fountain:.22,boat:.32,
};
/** The long bottom-hull edge connects perspective bench feet. Its slope keeps
 * the higher end grounded without mistaking the seat between legs for a foot. */
function benchBaseline(rows:readonly number[],height:number):(x:number)=>number {
  const hull:[number,number][]=[];
  rows.forEach((y,x)=>{
    if(y<0)return;
    while(hull.length>1){
      const a=hull[hull.length-2],b=hull[hull.length-1];
      if((b[0]-a[0])*(y-b[1])-(b[1]-a[1])*(x-b[0])<0)break;
      hull.pop();
    }
    hull.push([x,y]);
  });
  let baseline:(x:number)=>number=()=>Math.max(...rows)-height*lowerBand.bench,longest=rows.length*.3;
  for(let i=1;i<hull.length;i++){
    const [x,y]=hull[i-1],[endX,endY]=hull[i],span=endX-x;
    if(span<=longest||Math.abs(endY-y)>height*.65)continue;
    longest=span;
    baseline=column=>column<x-rows.length*.05||column>endX+rows.length*.05
      ?Infinity:y+(column-x)*(endY-y)/span-height*.12;
  }
  return baseline;
}
/** Lower opaque islands locate actual feet, not the canopy, sign board or bench seat.
 * Separate islands stay separate so nothing is painted across the air between legs. */
export function traceSceneryContact(pixels:Uint8ClampedArray,width:number,height:number,art:ContactArtworkSize,
  kind:SceneryContactKind,flipX=false):readonly ScenePolygon[] {
  const rows=Array.from({length:width},(_,x)=>{
    let y=height-1;while(y>=0&&pixels[(y*width+x)*4+3]<128)y--;return y;
  });
  const lowest=Math.max(...rows),cutoff=lowest-height*lowerBand[kind],scale=256/art.referenceWidth;
  const baseline=kind==='bench'?benchBaseline(rows,height):()=>cutoff;
  const lines:[number,number][][]=[];let line:[number,number][]=[];
  for(let x=0;x<width;x++){
    const row=rows[x];
    if(row<0||row<baseline(x)){if(line.length>1)lines.push(line);line=[];continue;}
    line.push([((x+.5)/width-art.originX)*art.width*scale*(flipX?-1:1),((row+1)/height-art.originY)*art.height*scale]);
  }
  if(line.length>1)lines.push(line);
  return lines;
}
export function fallbackSceneryContact(kind:SceneryContactKind):readonly ScenePolygon[] {
  const ellipse=(x:number,y:number,rx:number,ry:number):ScenePolygon=>Array.from({length:17},(_,i)=>{
    const a=i/16*Math.PI*2;return [x+Math.cos(a)*rx,y+Math.sin(a)*ry] as const;
  });
  switch(kind){
    case 'leaf-tree':case 'conifer':return [ellipse(0,-2,16,5)];
    case 'post':return [ellipse(0,-3,38,9)];
    case 'bench':return [ellipse(-75,-14,14,5),ellipse(75,-3,14,5)];
    case 'market':return [ellipse(0,-12,100,16)];
    case 'planter':return [ellipse(0,-12,65,14)];
    case 'fountain':return [ellipse(0,-22,95,24)];
    case 'boat':return [ellipse(0,-25,108,28)];
  }
}

export function sceneryContactBounds(lines:readonly ScenePolygon[],kind:SceneryContactKind){
  const points=lines.flat(),extra=kind==='leaf-tree'?[[120,42],[-96,-26]]:kind==='conifer'?[[88,34],[-64,-20]]:[];
  const all=[...points,...extra],margin=kind==='boat'?24:16;
  const x=Math.floor(Math.min(...all.map(p=>p[0]))-margin),y=Math.floor(Math.min(...all.map(p=>p[1]))-margin);
  return {x,y,width:Math.ceil(Math.max(...all.map(p=>p[0]))+margin-x),height:Math.ceil(Math.max(...all.map(p=>p[1]))+margin-y)};
}
