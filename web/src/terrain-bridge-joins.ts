import polygonClipping from 'polygon-clipping';
import {surfaceAt,type ModularTerrain} from './modular-terrain';
import type {ScenePolygon} from './scene-schema';
import {featureBounds,featurePolygon,terrainFeature,type TerrainFeature} from './terrain-features';
import type {TerrainView} from './terrain-residency';

type Point=readonly [number,number];
interface FloorJoin {polygon:ScenePolygon;inner:Point;outer:Point;mouth:ScenePolygon;}
// Native-image coordinates, traced only over the horizontal entrance paving.
// Parapets, end pillars and vertical masonry keep the source painting's alpha.
export const bridgeFloorJoins:readonly FloorJoin[]=[
  {polygon:[[0,.22],[.18,.12],[.235,.17],[.10,.265],[.075,.235],[.035,.23],[.02,.25]],
    inner:[.13,.225],outer:[.08,.185],mouth:[[.04,.225],[.17,.145],[.10,.19]]},
  {polygon:[[.84,.77],[.94,.68],[1,.73],[1,.82],[.92,.90],[.87,.89],[.82,.82]],
    inner:[.90,.77],outer:[.94,.80],mouth:[[.89,.855],[.985,.755],[.94,.81]]},
];
const path=(ctx:CanvasRenderingContext2D,points:ScenePolygon)=>{
  ctx.moveTo(...points[0]);for(const point of points.slice(1))ctx.lineTo(...point);ctx.closePath();
};
export function bridgeJoinMask(terrain:ModularTerrain,feature:TerrainFeature):number{
  if(feature.asset!=='canal-arch-bridge')return 0;
  return bridgeFloorJoins.reduce((mask,join,i)=>mask|(featurePolygon(feature,join.mouth).every(([x,y])=>surfaceAt(terrain,x,y)?.material==='town-cobble')?1<<i:0),0);
}
// The original HD asset stays untouched. Cache native-resolution floor masks per
// source and supported entrance; never soften a bridge over unprepared ground.
const cache=new WeakMap<object,Map<number,HTMLCanvasElement>>();
function joinedBridge(image:CanvasImageSource,mask:number):CanvasImageSource{
  if(!mask)return image;
  let variants=cache.get(image);if(!variants){variants=new Map();cache.set(image,variants);}
  const cached=variants.get(mask);if(cached)return cached;
  const art=terrainFeature('canal-arch-bridge')!,canvas=document.createElement('canvas');
  canvas.width=art.width;canvas.height=art.height;
  const ctx=canvas.getContext('2d')!;ctx.drawImage(image,0,0,canvas.width,canvas.height);
  ctx.scale(canvas.width,canvas.height);
  bridgeFloorJoins.forEach((join,i)=>{
    if(!(mask&(1<<i)))return;
    ctx.save();ctx.beginPath();path(ctx,join.polygon);ctx.clip();
    const gradient=ctx.createLinearGradient(...join.inner,...join.outer);
    gradient.addColorStop(0,'#0000');gradient.addColorStop(1,'#000');
    ctx.globalCompositeOperation='destination-out';ctx.fillStyle=gradient;ctx.fillRect(0,0,1,1);ctx.restore();
  });
  variants.set(mask,canvas);return canvas;
}

/** Generated road curbs must not run across a painted bridge's mouth. */
export function clipBridgeClearance(ctx:CanvasRenderingContext2D,terrain:ModularTerrain,view:TerrainView):void{
  const outlines=(terrain.features??[]).filter(f=>f.asset==='canal-arch-bridge').map(f=>
    [featurePolygon(f,terrainFeature(f.asset)!.outline).map(([x,y]):[number,number]=>[x,y])]);
  if(!outlines.length)return;
  const clear=polygonClipping.union(outlines[0],...outlines.slice(1));
  ctx.beginPath();ctx.rect(view.x-64,view.y-64,view.width+128,view.height+128);
  for(const polygon of clear)for(const ring of polygon)path(ctx,ring);
  ctx.clip('evenodd');
}

export function paintJoinedBridge(ctx:CanvasRenderingContext2D,terrain:ModularTerrain,feature:TerrainFeature,image:CanvasImageSource):void{
  const bounds=featureBounds(feature),mask=bridgeJoinMask(terrain,feature);
  // Local contact darkness follows the pier feet and arch underside, not the
  // rectangular image bounds or the flat deck entrances.
  const foot=featurePolygon(feature,[[.04,.43],[.24,.61],[.27,.64],[.41,.55],[.45,.57],[.54,.67],[.60,.82],[.76,.91],[.89,.88]]);
  ctx.save();const matrix=ctx.getTransform(),scale=Math.hypot(matrix.a,matrix.b);
  ctx.filter=`blur(${4*scale}px)`;ctx.strokeStyle='#03152280';ctx.lineWidth=feature.width*.018;ctx.lineCap='round';ctx.lineJoin='round';
  ctx.beginPath();foot.forEach(([x,y],i)=>i?ctx.lineTo(x,y+3):ctx.moveTo(x,y+3));ctx.stroke();ctx.restore();
  ctx.drawImage(joinedBridge(image,mask),bounds.x,bounds.y,bounds.width,bounds.height);
}
