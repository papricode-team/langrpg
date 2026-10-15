import type {ScenePolygon} from './scene-schema';
import {terrainMaterial} from './terrain-materials';

export function terrainMaterialDependencies(ids:string[]):string[]{
 return [...new Set(ids.flatMap(id=>{const edge=terrainMaterial(id)?.edge;return edge?.material?[id,edge.material]:[id];}))];
}
const path=(ctx:CanvasRenderingContext2D,p:ScenePolygon)=>{ctx.beginPath();p.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();};
/** Edge treatment follows the editable polygon, with stone courses projected onto vertical faces. */
export function paintTerrainEdge(ctx:CanvasRenderingContext2D,p:ScenePolygon,kind:'curb'|'quay',source:(id:string)=>CanvasImageSource|undefined,depth=34):void{
 ctx.save();ctx.lineJoin='round';
 if(kind==='quay'){
  // Normalize winding so only bank faces towards the camera have visible height.
  const area=p.reduce((sum,a,i)=>{const b=p[(i+1)%p.length];return sum+a[0]*b[1]-b[0]*a[1];},0),ring=area>0?p:[...p].reverse();
  const material=terrainMaterial('canal-masonry')!,image=source('canal-masonry');
  for(let i=0;i<ring.length;i++){
   const a=ring[i],b=ring[(i+1)%ring.length],dx=b[0]-a[0],dy=b[1]-a[1];
   if(dx<=.01)continue;
   ctx.save();path(ctx,[a,b,[b[0],b[1]+depth],[a[0],a[1]+depth]]);ctx.clip();
   const pattern=image?ctx.createPattern(image,'repeat'):null,s=material.worldSize/material.width;
   if(pattern)pattern.setTransform({a:s,b:s*dy/dx,c:0,d:s*.7,e:0,f:a[1]-a[0]*dy/dx});
   ctx.fillStyle=pattern??'#30485b';ctx.fillRect(a[0]-1,Math.min(a[1],b[1])-1,dx+2,Math.abs(dy)+depth+2);
   const shade=ctx.createLinearGradient(0,Math.min(a[1],b[1]),0,Math.max(a[1],b[1])+depth);shade.addColorStop(0,'#08182300');shade.addColorStop(1,'#081823a0');ctx.fillStyle=shade;ctx.fillRect(a[0]-1,Math.min(a[1],b[1])-1,dx+2,Math.abs(dy)+depth+2);ctx.restore();
  }
 }
 path(ctx,p);ctx.strokeStyle='#142936';ctx.lineWidth=kind==='quay'?12:10;ctx.stroke();
 ctx.strokeStyle='#6d8391';ctx.lineWidth=kind==='quay'?8:6;ctx.stroke();
 ctx.strokeStyle='#263f51';ctx.lineWidth=kind==='quay'?7:5;ctx.setLineDash([1.2,11]);ctx.stroke();ctx.setLineDash([]);
 ctx.restore();
}
