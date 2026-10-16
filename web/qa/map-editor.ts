/**
 * The admin map editor against the checked-in world, with an in-memory server.
 * Nothing is forwarded to the API; reloading the page starts over.
 */
import baseDocument from '../../content/world-seed.json';
import {parseWorldSceneDocument} from '../src/scene-schema';
import {applyEditOps} from '../src/world-edit-ops';

let documentData=parseWorldSceneDocument(baseDocument),revision='draft-0',number=0;
const delay=Number(new URLSearchParams(location.search).get('latency')??'0');
const request:typeof fetch=async(input,init)=>{
  const path=new URL(String(input),location.href).pathname;
  if(delay)await new Promise(resolve=>setTimeout(resolve,delay));
  try{
    if(path==='/api/world-content')return Response.json({document:documentData,contentVersion:revision});
    if(path==='/api/admin/world/status')return Response.json({revision,contentVersion:revision,locks:[]});
    if(path==='/api/admin/world/locks')return Response.json({locks:[]});
    if(path==='/api/admin/world/ops'){
      const {ops}=JSON.parse(String(init?.body)),from=revision;
      documentData=parseWorldSceneDocument(applyEditOps(documentData,ops).document);revision=`draft-${++number}`;
      return Response.json({from,revision,contentVersion:revision,applied:ops,warnings:[]});
    }
    if(path==='/api/admin/world/validate'){parseWorldSceneDocument(JSON.parse(String(init?.body)));return Response.json({valid:true,diagnostics:[]});}
    if(path==='/api/admin/world'){
      if(init?.method==='PUT'){documentData=parseWorldSceneDocument(JSON.parse(String(init.body)));revision=`draft-${++number}`;}
      return Response.json({document:documentData,revision});
    }
    return Response.json({error:'Unavailable in the local map editor.'},{status:404});
  }catch(error){return Response.json({error:error instanceof Error?error.message:String(error)},{status:422});}
};
await import('../src/admin.css');
const {mountMapEditor}=await import('../src/admin-map-editor');
await mountMapEditor(document.querySelector('#editor')!,{token:()=> 'local-draft',selfId:()=> 'local-author',request,localDraft:true});
Object.assign(window,{mapEditorReady:true});
