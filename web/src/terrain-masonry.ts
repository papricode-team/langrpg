import type {ScenePolygon} from './scene-schema';
import {terrainMaterial} from './terrain-materials';
import {curbStones,paintStoneCourse,type CurbStone} from './terrain-curbs';
import type {TerrainView} from './terrain-residency';

export function terrainMaterialDependencies(ids:string[]):string[]{
 return [...new Set(ids.flatMap(id=>{const edge=terrainMaterial(id)?.edge;return edge?.kind==='curb'?[id,'canal-masonry']:edge?.material?[id,edge.material]:[id];}))];
}
const path=(ctx:CanvasRenderingContext2D,p:ScenePolygon)=>{ctx.beginPath();p.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();};
const capCache=new WeakMap<ScenePolygon,CurbStone[]>();
/** Edge treatment follows the editable polygon, with stone courses projected onto vertical faces. */
export function paintTerrainEdge(ctx:CanvasRenderingContext2D,p:ScenePolygon,kind:'quay',source:(id:string)=>CanvasImageSource|undefined,depth=34,view?:TerrainView):void{
 ctx.save();ctx.lineJoin='round';
 if(kind==='quay'){
  // Normalize winding so only bank faces towards the camera have visible height.
  const area=p.reduce((sum,a,i)=>{const b=p[(i+1)%p.length];return sum+a[0]*b[1]-b[0]*a[1];},0),ring=area>0?p:[...p].reverse();
  const material=terrainMaterial('canal-masonry')!,image=source('canal-masonry');
  let station=0;
  for(let i=0;i<ring.length;i++){
   const a=ring[i],b=ring[(i+1)%ring.length],dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy),start=station;station+=length;
   if(dx<=.01)continue;
   ctx.save();path(ctx,[a,b,[b[0],b[1]+depth],[a[0],a[1]+depth]]);ctx.clip();
   const pattern=image?ctx.createPattern(image,'repeat'):null,s=material.worldSize/material.width;
   // Measure courses along the wall rather than its X projection; near-vertical
   // banks otherwise stretch a single stone into a long featureless stripe.
   if(pattern)pattern.setTransform({a:s*dx/length,b:s*dy/length,c:0,d:s*.7,e:a[0]-start*dx/length,f:a[1]-start*dy/length});
   ctx.fillStyle=pattern??'#30485b';ctx.fillRect(a[0]-1,Math.min(a[1],b[1])-1,dx+2,Math.abs(dy)+depth+2);
   const shade=ctx.createLinearGradient(0,Math.min(a[1],b[1]),0,Math.max(a[1],b[1])+depth);shade.addColorStop(0,'#08182300');shade.addColorStop(1,'#081823a0');ctx.fillStyle=shade;ctx.fillRect(a[0]-1,Math.min(a[1],b[1])-1,dx+2,Math.abs(dy)+depth+2);ctx.restore();
  }
  let caps=capCache.get(p);if(!caps){caps=curbStones(ring);capCache.set(p,caps);}
  const xs=p.map(v=>v[0]),ys=p.map(v=>v[1]);
  paintStoneCourse(ctx,caps,view??{x:Math.min(...xs)-64,y:Math.min(...ys)-64,width:Math.max(...xs)-Math.min(...xs)+128,height:Math.max(...ys)-Math.min(...ys)+128},source);
 }
 ctx.restore();
}
