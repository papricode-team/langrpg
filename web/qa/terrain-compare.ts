import source from '../src/data/world-scenes.json';
import {parseWorldSceneDocument} from '../src/scene-schema';
import draft from '../src/data/lindenhafen-terrain-rebuild.json';
import {lindenhafenTerrainDocument} from '../src/lindenhafen-terrain-rebuild';
import {terrainMaterialDependencies} from '../src/terrain-masonry';
import {terrainMaterial} from '../src/terrain-materials';
import {terrainFeature,featurePolygon} from '../src/terrain-features';
import {paintModularTerrain} from '../src/modular-terrain-renderer';
import type {ModularTerrain} from '../src/modular-terrain';

const originalDocument=parseWorldSceneDocument(source),world=originalDocument.maps.lindenhafen;
const storageKey='glotworld-lindenhafen-terrain-rebuild-v1';
let documentData=lindenhafenTerrainDocument(originalDocument);
const saved=localStorage.getItem(storageKey);
if(saved){try{documentData=parseWorldSceneDocument(JSON.parse(saved));}catch{console.warn('Saved terrain draft could not be read; showing the checked-in plan.');}}
if(new URLSearchParams(location.search).has('edit')){
 const {mountLocalTerrainEditor}=await import('./local-terrain-editor');await mountLocalTerrainEditor(documentData,storageKey);
}else{
// Both views use the original town coordinate system.
const terrain=documentData.maps.lindenhafen.modularTerrain as ModularTerrain;
const original=document.querySelector<HTMLCanvasElement>('#original')!,components=document.querySelector<HTMLCanvasElement>('#components')!;
const status=document.querySelector('#status')!;
const checked=(id:string)=>document.querySelector<HTMLInputElement>(`#${id}`)!.checked;
const images=new Map<string,HTMLImageElement>();
let oldImages=new Map<string,HTMLImageElement>(),generation=0,ready=false,mode:'whole'|'bridge'|'borders'='whole',zoom=1,offset={x:0,y:0};
const load=async(src:string)=>{const image=new Image();image.src=src;await image.decode();return image;};
const ids=terrainMaterialDependencies([terrain.base,...terrain.surfaces.map(s=>s.material)]);
const detailSize=()=>mode==='borders'?{width:650,height:540}:{width:1000,height:820};
function cameraScale(){const fit=Math.min(original.clientWidth/world.width,original.clientHeight/world.height)*.96;return (mode==='whole'?fit:Math.min(original.clientWidth/detailSize().width,original.clientHeight/detailSize().height))*zoom;}
function render(){
 if(!ready)return;
 const scale=cameraScale();
 const centers=mode==='whole'?[{x:world.width/2,y:world.height/2},{x:draft.width/2,y:draft.height/2}]:mode==='borders'?[{x:680,y:770},{x:680,y:770}]:[{x:1400,y:750},{x:1400,y:750}];
 for(const [index,canvas] of [original,components].entries()){
  const w=canvas.clientWidth,h=canvas.clientHeight,dpr=Math.min(devicePixelRatio,2);
  if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
  const ctx=canvas.getContext('2d')!,center=centers[index],map=index===0?world:draft;
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle='#13212a';ctx.fillRect(0,0,w,h);
  ctx.translate(w/2,h/2);ctx.scale(scale,scale);ctx.translate(-center.x-offset.x,-center.y-offset.y);
  ctx.save();ctx.beginPath();ctx.rect(0,0,map.width,map.height);ctx.clip();
  if(index===0){
   const night=document.querySelector<HTMLSelectElement>('#period')!.value==='night';
   for(const tile of world.terrain){const img=oldImages.get(tile.id);if(!img)continue;const crop=night?(tile.nightCrop??tile.dayCrop):tile.dayCrop;
    if(crop)ctx.drawImage(img,crop.x,crop.y,crop.width,crop.height,tile.x,tile.y,tile.width,tile.height);
    else ctx.drawImage(img,tile.x,tile.y,tile.width,tile.height);
   }
  }else{
   ctx.fillStyle='#263741';ctx.fillRect(0,0,map.width,map.height);
   paintModularTerrain(ctx,{...terrain,base:checked('ground')?terrain.base:'',surfaces:terrain.surfaces.filter(s=>terrainMaterial(s.material)?.blocked?checked('water'):checked('roads')),features:checked('roads')?terrain.features:[]},
    {x:0,y:0,width:map.width,height:map.height},id=>images.get(id),id=>images.get(id));
   if(checked('outlines'))for(const [i,f] of (terrain.features??[]).entries()){
    const art=terrainFeature(f.asset)!;ctx.strokeStyle='#f0c96f';ctx.lineWidth=1.3/scale;ctx.setLineDash([5/scale,4/scale]);ctx.beginPath();
    featurePolygon(f,art.outline).forEach(([x,y],j)=>j?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.stroke();ctx.setLineDash([]);
    const x=f.x+f.width/2,y=f.y+f.width/2,r=10/scale;ctx.fillStyle='#14242f';ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.font=`${12/scale}px system-ui`;ctx.fillStyle='#ffe1a1';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String(i+1),x,y);
   }
  }
  ctx.restore();ctx.strokeStyle='#61717b';ctx.lineWidth=1/scale;ctx.strokeRect(0,0,map.width,map.height);
 }
 status.textContent=`Same scale · ${Math.round(scale*100)}% · ${document.querySelector<HTMLSelectElement>('#period')!.value==='night'?'original night terrain':'original day terrain'}`;
 document.querySelector<HTMLElement>('#pieces')!.hidden=!checked('outlines');
 Object.assign(window,{terrainComparisonState:{scale,mode,zoom,offset:{...offset},sceneryLayers:0,originalTiles:oldImages.size,paintedPieces:checked('roads')?terrain.features!.length:0,worldWidth:draft.width,worldHeight:draft.height,editableShapes:terrain.surfaces.length}});
}
async function loadOriginal(){
 const current=++generation;ready=false;Object.assign(window,{terrainComparisonReady:false});status.textContent='Loading original terrain at native resolution…';
 const night=document.querySelector<HTMLSelectElement>('#period')!.value==='night';
 try{const loaded=await Promise.all(world.terrain.map(async tile=>[tile.id,await load(night?(tile.nightAsset??tile.dayAsset):tile.dayAsset)] as const));
  if(current!==generation)return;oldImages=new Map(loaded);ready=true;render();Object.assign(window,{terrainComparisonReady:true});
 }catch(error){if(current===generation)status.textContent=`Could not load the original terrain: ${error instanceof Error?error.message:String(error)}`;}
}
await Promise.all([...ids.map(async id=>images.set(id,await load(terrainMaterial(id)!.asset))),...(terrain.features??[]).map(async f=>images.set(f.asset,await load(terrainFeature(f.asset)!.asset)))]);
document.querySelector('#changes')!.innerHTML=draft.changes.map(change=>`<li>${change}</li>`).join('');
document.querySelector('#pieces')!.innerHTML=(terrain.features??[]).map((f,i)=>`<span class="piece-label">${i+1}. ${terrainFeature(f.asset)!.name}</span>`).join('');
for(const id of ['ground','water','roads','outlines'])document.querySelector(`#${id}`)!.addEventListener('change',render);
for(const value of ['whole','bridge','borders'] as const)document.querySelector(`#${value}`)!.addEventListener('click',()=>{mode=value;zoom=1;offset={x:0,y:0};for(const id of ['whole','bridge','borders'])document.querySelector(`#${id}`)!.setAttribute('aria-pressed',String(id===mode));render();});
for(const [id,multiplier] of [['in',1.4],['out',1/1.4]] as const)document.querySelector(`#${id}`)!.addEventListener('click',()=>{zoom=Math.max(.5,Math.min(5,zoom*multiplier));render();});
document.querySelector('#period')!.addEventListener('change',()=>void loadOriginal());
for(const canvas of [original,components]){
 let drag:{x:number;y:number;offset:{x:number;y:number};scale:number}|undefined;
 canvas.onpointerdown=e=>{if(e.button!==0||!ready)return;canvas.setPointerCapture(e.pointerId);drag={x:e.clientX,y:e.clientY,offset:{...offset},scale:cameraScale()};};
 canvas.onpointermove=e=>{if(!drag)return;offset={x:drag.offset.x-(e.clientX-drag.x)/drag.scale,y:drag.offset.y-(e.clientY-drag.y)/drag.scale};render();};
 canvas.onpointerup=canvas.onpointercancel=canvas.onlostpointercapture=()=>{drag=undefined;};
}
new ResizeObserver(render).observe(document.querySelector('#comparison')!);
await loadOriginal();

}
