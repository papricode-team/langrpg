import {parseWorldSceneDocument,type WorldSceneDocument} from '../src/scene-schema';
import {applyEditOps} from '../src/world-edit-ops';
/** The preview editor can only save its own local draft; no backend requests are forwarded. */
export async function mountLocalTerrainEditor(initial:WorldSceneDocument,storageKey:string){
 let documentData=initial,revision='draft-0',number=0;
 const request:typeof fetch=async(input,init)=>{
  const path=new URL(String(input),location.href).pathname;
  try{
   if(path==='/api/world-content')return Response.json({document:documentData,contentVersion:revision});
   if(path==='/api/admin/world/status')return Response.json({revision,contentVersion:revision,locks:[]});
   if(path==='/api/admin/world/locks')return Response.json({locks:[]});
   if(path==='/api/admin/world/ops'){
    const {ops}=JSON.parse(String(init?.body)),from=revision;
    const next=parseWorldSceneDocument(applyEditOps(documentData,ops).document);
    localStorage.setItem(storageKey,JSON.stringify(next));documentData=next;revision=`draft-${++number}`;
    return Response.json({from,revision,contentVersion:revision,applied:ops,warnings:[]});
   }
   if(path==='/api/admin/world/validate'){parseWorldSceneDocument(JSON.parse(String(init?.body)));return Response.json({valid:true,diagnostics:['Local schema validation only; publication also requires story and navigation checks.']});}
   if(path==='/api/admin/world'){
    if(init?.method==='PUT'){const next=parseWorldSceneDocument(JSON.parse(String(init.body)));localStorage.setItem(storageKey,JSON.stringify(next));documentData=next;revision=`draft-${++number}`;}
    return Response.json({document:documentData,revision});
   }
   return Response.json({error:'Unavailable in the local terrain draft.'},{status:404});
  }catch(error){return Response.json({error:error instanceof Error?error.message:String(error)},{status:422});}
 };
 await import('../src/admin.css');
 const {mountMapEditor}=await import('../src/admin-map-editor');
 document.querySelector('style')?.remove();
 document.body.innerHTML='<div style="padding:10px 20px;background:#182b35;color:#e5d2ae">Lindenhafen terrain draft · <a href="/qa/terrain-compare.html">Compare saved terrain</a> · <button id="restore-terrain">Restore checked-in plan</button></div><div id="editor" style="height:calc(100vh - 48px);display:flex;flex-direction:column;overflow:hidden"></div>';
 document.querySelector('#restore-terrain')!.addEventListener('click',()=>{if(confirm('Discard local terrain edits and restore the checked-in plan?')){localStorage.removeItem(storageKey);location.reload();}});
 await mountMapEditor(document.querySelector('#editor')!,{token:()=> 'local-draft',selfId:()=> 'local-author',request,localDraft:true});
 document.querySelector<HTMLButtonElement>('#map-fit')!.click();Object.assign(window,{terrainRebuildEditorReady:true});
}
