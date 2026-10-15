import {terrainDistrict,districtDocument} from '../src/terrain-district';
import baseDocument from '../src/data/world-scenes.json';
import {parseWorldSceneDocument} from '../src/scene-schema';
import {terrainMaterials} from '../src/terrain-materials';
import {terrainFeatures} from '../src/terrain-features';
import {terrainObject,sampleDetailMotion} from '../src/terrain-objects';
import {paintModularTerrain} from '../src/modular-terrain-renderer';
import {sceneNavigationGeometry} from '../src/scene-navigation';
import {NavigationGrid,PLAYER_RADIUS} from '../src/navigation';
import {applyEditOps} from '../src/world-edit-ops';

const storageKey='glotworld-bridgewater-draft-v1';
let documentData=districtDocument(parseWorldSceneDocument(baseDocument));
const saved=localStorage.getItem(storageKey);
if(saved){try{documentData=parseWorldSceneDocument(JSON.parse(saved));}catch{document.querySelector('#status')!.textContent='Saved draft could not be read; showing the original layout.';}}
if(new URLSearchParams(location.search).has('edit')){
  // This transport is scoped to this editor instance; it never forwards an API request.
  let revision='draft-0',number=0;
  const request:typeof fetch=async(input,init)=>{
    const path=new URL(String(input),location.href).pathname;
    try{
      if(path==='/api/world-content')return Response.json({document:documentData,contentVersion:revision});
      if(path==='/api/admin/world/status')return Response.json({revision,contentVersion:revision,locks:[]});
      if(path==='/api/admin/world/locks')return Response.json({locks:[]});
      if(path==='/api/admin/world/ops'){
        const {ops}=JSON.parse(String(init?.body)),from=revision;
        const result=applyEditOps(documentData,ops),next=parseWorldSceneDocument(result.document);
        localStorage.setItem(storageKey,JSON.stringify(next));documentData=next;revision=`draft-${++number}`;
        return Response.json({from,revision,contentVersion:revision,applied:ops,warnings:[]});
      }
      if(path==='/api/admin/world/validate'){parseWorldSceneDocument(JSON.parse(String(init?.body)));return Response.json({valid:true,diagnostics:['Local schema validation only. Publication runs the full story and navigation compiler.']});}
      if(path==='/api/admin/world'){
        if(init?.method==='PUT'){const next=parseWorldSceneDocument(JSON.parse(String(init.body)));localStorage.setItem(storageKey,JSON.stringify(next));documentData=next;revision=`draft-${++number}`;}
        return Response.json({document:documentData,revision});
      }
      return Response.json({error:'This action is unavailable in the local terrain study.'},{status:404});
    }catch(error){return Response.json({error:error instanceof Error?error.message:String(error)},{status:422});}
  };
  await import('../src/admin.css');
  const {mountMapEditor}=await import('../src/admin-map-editor');
  document.querySelector('style')!.remove();
  document.body.innerHTML='<div style="padding:10px 20px;background:#182b35;color:#e5d2ae">Bridgewater local draft · <a href="/qa/terrain-district.html">Walk through the saved layout</a> · <a href="/qa/terrain-kit.html">Asset library</a> · <button id="restore-district">Restore original layout</button></div><div id="editor" style="height:calc(100vh - 48px);display:flex;flex-direction:column;overflow:hidden"></div>';
  document.querySelector('#restore-district')!.addEventListener('click',()=>{if(confirm('Discard your local layout edits and restore the original study?')){localStorage.removeItem(storageKey);location.reload();}});
  await mountMapEditor(document.querySelector('#editor')!,{token:()=> 'local-draft',selfId:()=> 'local-author',request,localDraft:true});
  document.querySelector<HTMLButtonElement>('#map-fit')!.click();
  Object.assign(window,{districtEditorReady:true});
}else{
  const world=documentData.maps.lindenhafen,terrain=world.modularTerrain!,canvas=document.querySelector<HTMLCanvasElement>('#world')!,ctx=canvas.getContext('2d')!,status=document.querySelector('#status')!;
  const width=world.width,height=world.height;canvas.width=width*1.5;canvas.height=height*1.5;
  const image=async(src:string)=>{const i=new Image();i.src=src;await i.decode();return i;};
  const materials=new Map(await Promise.all(terrainMaterials.map(async a=>[a.id,await image(a.asset)] as const)));
  const pieces=new Map(await Promise.all(terrainFeatures.filter(a=>terrain.features?.some(f=>f.asset===a.id)).map(async a=>[a.id,await image(a.asset)] as const)));
  const manifest=await fetch('/assets/lindenhafen-day-animations.json').then(r=>r.json());
  const keys=[...new Set(world.scenery.filter(s=>!terrainObject(s.frame)).map(s=>manifest.assets[s.frame??s.asset].base.key))] as string[];
  const atlases=new Map(await Promise.all(keys.map(async key=>[key,{image:await image(`/assets/${key}.webp`),data:await fetch(`/assets/${key}.json`).then(r=>r.json())}] as const)));
  const details=new Map(await Promise.all([...new Set(world.scenery.map(s=>s.frame).filter(id=>terrainObject(id)))].map(async id=>[id,await image(terrainObject(id)!.asset)] as const)));
  const ground=document.createElement('canvas');ground.width=canvas.width;ground.height=canvas.height;const g=ground.getContext('2d')!;g.scale(1.5,1.5);
  paintModularTerrain(g,terrain,{x:0,y:0,width,height},id=>materials.get(id),id=>pieces.get(id));
  const geometry=sceneNavigationGeometry(world),navigation=new NavigationGrid(geometry.ground,geometry.barriers,{width,height},{agentRadius:PLAYER_RADIUS});
  let actor={...world.spawn},route:{x:number;y:number}[]=[],last=0;
  const routeResults=terrainDistrict.routes.map(r=>{const path=navigation.findPath(r.from,r.to);return {id:r.id,startWalkable:navigation.isWalkable(r.from.x,r.from.y),endWalkable:navigation.isWalkable(r.to.x,r.to.y),reachable:path.length>0&&Math.hypot(path.at(-1)!.x-r.to.x,path.at(-1)!.y-r.to.y)<12,path};});
  status.textContent='Click the paving to walk. Water and stone faces block movement.';
  const pause=document.querySelector<HTMLInputElement>('#pause')!;pause.checked=matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.querySelector('#reset')!.addEventListener('click',()=>{actor={...world.spawn};route=[];});
  canvas.onclick=event=>{const box=canvas.getBoundingClientRect(),scale=Math.min(box.width/width,box.height/height),x=(event.clientX-box.left-(box.width-width*scale)/2)/scale,y=(event.clientY-box.top-(box.height-height*scale)/2)/scale;
    if(!navigation.isWalkable(x,y)){status.textContent='That spot is water, a wall or an occupied footprint.';return;}
    const path=navigation.findPath(actor,{x,y});if(!path.length||Math.hypot(path.at(-1)!.x-x,path.at(-1)!.y-y)>12){status.textContent='There is no connected walking route to that spot.';return;}route=path;status.textContent='Walking along the connected paving…';};
  const scenery=[...world.scenery].sort((a,b)=>a.y-b.y);
  function draw(ms:number){const dt=Math.min(.05,(ms-last)/1000);last=ms;
    if(route.length){const next=route[0],distance=Math.hypot(next.x-actor.x,next.y-actor.y),step=dt*130;if(distance<=step){actor={...next};route.shift();if(!route.length)status.textContent='Arrived. Choose another spot to walk to.';}else{actor.x+=(next.x-actor.x)*step/distance;actor.y+=(next.y-actor.y)*step/distance;}}
    ctx.setTransform(1,0,0,1,0,0);ctx.drawImage(ground,0,0);ctx.scale(1.5,1.5);
    if(document.querySelector<HTMLInputElement>('#boundaries')!.checked){ctx.fillStyle='#df80634a';ctx.strokeStyle='#f9b386';ctx.lineWidth=1;for(const poly of geometry.barriers){ctx.beginPath();poly.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fill();ctx.stroke();}}
    for(const s of scenery){const detail=terrainObject(s.frame);let img:HTMLImageElement,frame,originX=.5,originY=1,referenceWidth;
      if(detail){img=details.get(s.frame)!;frame={x:0,y:0,w:detail.width,h:detail.height};originX=detail.originX;originY=detail.originY;referenceWidth=detail.width;}
      else{const a=manifest.assets[s.frame??s.asset],atlas=atlases.get(a.base.key)!;img=atlas.image;frame=atlas.data.frames[a.base.frame].frame;originX=a.originX;originY=a.originY;referenceWidth=a.referenceWidth;}
      const motion=sampleDetailMotion(detail?.motion??'still',s.id,ms/1000,pause.checked),scale=s.width/referenceWidth,w=frame.w*scale,h=frame.h*scale;
      ctx.save();ctx.translate(s.x,s.y+motion.y);ctx.rotate(motion.angle);ctx.scale(s.flipX?-1:1,1);ctx.globalAlpha=motion.alpha;ctx.drawImage(img,frame.x,frame.y,frame.w,frame.h,-w*originX,-h*originY,w,h);ctx.restore();
    }
    if(route.length){ctx.strokeStyle='#edcf87b0';ctx.lineWidth=2;ctx.setLineDash([5,7]);ctx.beginPath();ctx.moveTo(actor.x,actor.y);for(const p of route)ctx.lineTo(p.x,p.y);ctx.stroke();ctx.setLineDash([]);}
    ctx.fillStyle='#152832';ctx.strokeStyle='#f1d492';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(actor.x,actor.y,12,7,0,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle='#f1d492';ctx.beginPath();ctx.arc(actor.x,actor.y-5,4,0,Math.PI*2);ctx.fill();requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);Object.assign(window,{districtReady:true,districtRoutes:routeResults,districtWorld:world,districtNavigation:navigation});
}
