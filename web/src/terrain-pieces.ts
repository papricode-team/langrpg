/** Construction pieces share 256-unit cells and 96-unit connectors. Art stays world aligned. */
import polygonClipping from 'polygon-clipping';
import type {ScenePolygon} from './scene-schema';
import type {TerrainSurface} from './modular-terrain';

export const TERRAIN_CELL=256;
export const terrainPieceStyles=[
  {id:'cobble',name:'Cobbled road',material:'cobble',edge:'limestone',kind:'road'},
  {id:'brick',name:'Brick road',material:'brick',edge:'limestone',kind:'road'},
  {id:'slate',name:'Slate road',material:'slate',edge:'rock',kind:'road'},
  {id:'earth',name:'Earth path',material:'earth',edge:'gravel',kind:'road'},
  {id:'gravel',name:'Gravel path',material:'gravel',edge:'earth',kind:'road'},
  {id:'timber',name:'Boardwalk / bridge',material:'timber',edge:'limestone',kind:'road'},
  {id:'canal',name:'Stone canal',material:'deep-water',edge:'limestone',kind:'water'},
  {id:'pond',name:'Rock-lined stream',material:'shallow-water',edge:'rock',kind:'water'},
] as const;
export const terrainPieceShapes=[
  {id:'straight-ns',name:'Straight ↕',ports:5},{id:'straight-ew',name:'Straight ↔',ports:10},
  {id:'bend-ne',name:'Bend ↗',ports:3},{id:'bend-es',name:'Bend ↘',ports:6},
  {id:'bend-sw',name:'Bend ↙',ports:12},{id:'bend-wn',name:'Bend ↖',ports:9},
  {id:'tee-nes',name:'Junction →',ports:7},{id:'tee-esw',name:'Junction ↓',ports:14},
  {id:'tee-swn',name:'Junction ←',ports:13},{id:'tee-wne',name:'Junction ↑',ports:11},
  {id:'cross',name:'Crossroads',ports:15},
  {id:'end-n',name:'End ↑',ports:1},{id:'end-e',name:'End →',ports:2},
  {id:'end-s',name:'End ↓',ports:4},{id:'end-w',name:'End ←',ports:8},
  {id:'round',name:'Round plaza / pond',ports:0},{id:'square',name:'Square plaza / pool',ports:0},
  {id:'plaza',name:'Open plaza / basin',ports:15},
] as const;
export const terrainPieces=terrainPieceStyles.flatMap(style=>terrainPieceShapes.map(shape=>({
  id:`${style.id}-${shape.id}`,name:`${style.name} · ${shape.name}`,style:style.id,shape:shape.id,
  kind:style.kind,ports:shape.ports,asset:`/assets/terrain-pieces/${style.id}-${shape.id}.webp`,
  thumbnail:`/assets/terrain-pieces/${style.id}-${shape.id}-thumb.webp`,
})));
type Shape=typeof terrainPieceShapes[number];
const rect=(x:number,y:number,w:number,h:number):[number,number][]=>[[x,y],[x+w,y],[x+w,y+h],[x,y+h]];
const circle=(r:number):[number,number][]=>Array.from({length:64},(_,i)=>[128+r*Math.cos(i*Math.PI/32),128+r*Math.sin(i*Math.PI/32)]);
function outline(shape:Shape,width:number):ScenePolygon{
  const half=width/2;
  if(shape.id==='round')return circle(84+(width-96)/2);
  if(shape.id==='square')return rect(32-(width-96)/2,32-(width-96)/2,192+width-96,192+width-96);
  if(shape.id.startsWith('bend-')){
    // A genuine quarter-circle bend. Its endpoints have the same tangent and width as straights.
    const points:[number,number][]=[];
    for(const [r,start,end] of [[120+half,Math.PI/2,Math.PI],[120-half,Math.PI,Math.PI/2]])
      for(let i=0;i<=32;i++){const a=start+(end-start)*i/32;points.push([248+r*Math.cos(a),8+r*Math.sin(a)]);}
    const turns=({'bend-ne':0,'bend-es':1,'bend-sw':2,'bend-wn':3} as Record<string,number>)[shape.id];
    const guarded=polygonClipping.union([points],[rect(128-half,0,width,16)],[rect(240,128-half,16,width)])[0][0].slice(0,-1);
    return guarded.map(point=>{let [x,y]=point;for(let i=0;i<turns;i++)[x,y]=[256-y,x];return [Math.round(x*1e6)/1e6,Math.round(y*1e6)/1e6] as const;});
  }
  const paths:[number,number][][]=[shape.id==='plaza'?rect(32-(width-96)/2,32-(width-96)/2,192+width-96,192+width-96):circle(half)];
  if(shape.ports&1)paths.push(rect(128-half,0,width,128));
  if(shape.ports&2)paths.push(rect(128,128-half,128,width));
  if(shape.ports&4)paths.push(rect(128-half,128,width,128));
  if(shape.ports&8)paths.push(rect(0,128-half,128,width));
  return polygonClipping.union([paths[0]],...paths.slice(1).map(path=>[path])).at(0)![0].slice(0,-1);
}
/** Two independent editable layers: edging below, road or blocked water above. */
export function terrainPieceSurfaces(pieceId:string,x=0,y=0,groupId=`piece-${pieceId}`):TerrainSurface[]{
  const piece=terrainPieces.find(piece=>piece.id===pieceId);
  if(!piece)throw new Error(`Unknown terrain piece: ${pieceId}`);
  const style=terrainPieceStyles.find(style=>style.id===piece.style)!,shape=terrainPieceShapes.find(shape=>shape.id===piece.shape)!;
  const translate=(polygon:ScenePolygon)=>polygon.map(([a,b])=>[a+x,b+y] as const);
  return [
    {id:`${groupId}-edge`,groupId,material:style.edge,blocked:false,polygon:translate(outline(shape,120))},
    {id:`${groupId}-surface`,groupId,material:style.material,blocked:style.kind==='water',polygon:translate(outline(shape,96))},
  ];
}
