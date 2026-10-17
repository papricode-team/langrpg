import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PassThrough} from 'node:stream';
import {createWorldTools,serveMCP} from '../tools/world-mcp/server.mjs';
import './register-content-loader.mjs';
const {plainGround}=await import('../web/src/ground.ts');
const {applyEditOps,parseEditOps}=await import('../web/src/world-edit-ops.ts');
const {parseWorldSceneDocument}=await import('../web/src/scene-schema.ts');
const document=()=>({version:4,maps:{lindenhafen:{id:'lindenhafen',width:1536,height:1024,coordinateVersion:1,spawn:{x:768,y:850},npcs:[],objects:[],districts:[],ground:plainGround('meadow',1536,1024),scenery:[
  {id:'source-house',asset:'house',x:300,y:500,width:180},
  {id:'target-library',asset:'archive',x:900,y:500,width:180},
  {id:'inn',asset:'house',frame:'house-inn',interior:{kind:'inn'},x:1200,y:500,width:180},
]}}});
const decode=result=>{assert.ok(!result.isError,result.content[0].text);return JSON.parse(result.content[0].text);};
async function fixture(run){
  const folder=await mkdtemp(join(tmpdir(),'mcp-rooms-')),draft=join(folder,'draft.json');
  let live=document(),revision=1;const published=[];
  const client={origin:'lindenhafen',status:async()=>({revision:String(revision),locks:[]}),export:async()=>({document:structuredClone(live),revision:String(revision)}),applyOps:async ops=>{
    published.push(ops);live=applyEditOps(live,parseEditOps(ops)).document;revision++;return {revision:String(revision),applied:ops,warnings:[]};
  }};
  await writeFile(draft,JSON.stringify({format:'glotworld-world/1',revision:'1',document:live,story:{keep:'source story'}}));
  const world=createWorldTools(client),args={town:'lindenhafen',building:'source-house',draft};
  const call=async(name,extra={})=>decode(await world.call(name,{...args,...extra}));
  const edit=async(actions,extra={})=>{const current=await call('get_building',extra);return call('edit_building',{...extra,expected:current.fingerprint,actions});};
  try{await run({world,args,call,edit,draft,published});}finally{await rm(folder,{recursive:true,force:true});}
}

test('MCP discovers every default building and authors individual components, custom shells and paired floors',()=>fixture(async({call,edit,draft,published})=>{
  const buildings=await call('list_buildings');assert.equal(buildings.buildings.length,3);assert.ok(buildings.buildings.every(b=>b.rooms===1&&!b.custom));
  const catalogue=await call('list_room_catalogue');assert.equal(catalogue.templates.length,9);assert.ok(catalogue.furniture.includes('bed'));assert.ok(catalogue.games.some(g=>g.id==='re-ink'));
  const result=await edit([
    {action:'add_floor',id:'up',name:'Upstairs',level:1},
    {action:'add_room',id:'study',name:'Study',from:'up'},
    {action:'set_shell',room:'study',floors:[{id:'custom',points:[[160,300],[1376,300],[1376,900],[900,900],[900,850],[160,850]]}],spawn:{x:600,y:750},exit:{x:650,y:800}},
    {action:'put_component',room:'study',group:'walls',component:{id:'wall',x:300,y:350,width:400,height:24}},
    {action:'put_component',room:'study',group:'doors',component:{id:'opening',wallId:'wall',offset:100,width:96}},
    {action:'put_component',room:'study',group:'furniture',component:{id:'chair',source:'cafe-table',x:500,y:600,width:140}},
    {action:'put_component',room:'study',group:'games',component:{id:'writing',game:'re-ink',x:1100,y:400}},
    {action:'put_component',room:'study',group:'furniture',component:{id:'chair',x:520}},
  ]);
  assert.equal(result.rooms.length,3);
  const building=await call('get_building');assert.equal(building.fingerprint,result.fingerprint);
  const study=await call('get_building',{room:'study'});assert.equal(study.layout.furniture[0].x,520);assert.equal(study.layout.rooms,undefined);
  assert.equal(study.layout.links[0].kind,undefined);assert.equal(building.layout.links[0].kind,'stairs');
  assert.deepEqual((await call('audit_building')).problems,[]);
  const saved=JSON.parse(await readFile(draft,'utf8'));assert.equal(saved.revision,'1');assert.deepEqual(saved.story,{keep:'source story'});assert.equal(published.length,0);
  parseWorldSceneDocument(saved.document);
  await edit([{action:'move_floor',level:1,toLevel:-1}]);assert.equal((await call('get_building',{room:'study'})).layout.level,-1);
  await edit([{action:'update_room',room:'study',name:'Downstairs study',level:0}]);assert.equal((await call('get_building',{room:'study'})).layout.links[0].kind,'stairs');
  await edit([{action:'connect_rooms',from:'main',to:'study',id:'direct',backId:'return',at:{x:650,y:750},backAt:{x:700,y:750}}]);
  await edit([{action:'disconnect_rooms',room:'main',id:'direct'},{action:'remove_component',room:'study',group:'walls',id:'wall'}]);assert.equal((await call('get_building',{room:'study'})).layout.doors.length,0);
}));

test('MCP copies rooms and complete floors across building types with independent IDs and undoable room operations',()=>fixture(async({call,edit,draft,world,args})=>{
  await edit([{action:'add_floor',id:'up',name:'Upper floor',level:1},{action:'add_room',id:'study',name:'Study',from:'up'},{action:'put_component',room:'study',group:'games',component:{id:'ink',game:'re-ink',x:1100,y:400}}]);
  const source=await call('get_building'),target=await call('get_building',{building:'target-library'}),before=structuredClone(source.layout);
  const copied=await call('copy_building_layout',{building:'target-library',expected:target.fingerprint,sourceTown:'lindenhafen',sourceBuilding:'source-house',sourceExpected:source.fingerprint,sourceRoom:'up',scope:'floor'});
  assert.equal(copied.addedRooms.length,2);assert.ok(!copied.addedRooms.includes('up'));
  const next=await call('get_building',{building:'target-library'});assert.equal(next.layout.links[0].kind,'stairs');assert.equal(next.layout.rooms[0].layout.links[0].targetRoom,next.layout.rooms[1].id);
  assert.deepEqual(next.layout.rooms.map(r=>r.layout.kind),['library','library']);
  await edit([{action:'update_room',room:copied.firstRoom,name:'Independent'}],{building:'target-library'});
  assert.deepEqual((await call('get_building')).layout,before);
  const mainCopy=await call('copy_building_layout',{expected:source.fingerprint,sourceTown:'lindenhafen',sourceBuilding:'source-house',sourceExpected:source.fingerprint,sourceRoom:'main',scope:'room'});
  assert.equal(mainCopy.addedRooms.length,1);const independent=await call('get_building',{room:mainCopy.firstRoom});assert.ok(independent.layout.games.length);assert.ok(independent.layout.furniture.every(f=>!f.source.startsWith('original:')));
  const png=await world.call('render_room',{...args,building:'target-library',room:copied.firstRoom});assert.ok(!png.isError,png.content[0].text);assert.equal(png.content[0].type,'image');assert.equal(Buffer.from(png.content[0].data,'base64').subarray(1,4).toString(),'PNG');
  const reset=await world.call('apply_edits',{draft,ops:[{kind:'room',map:'lindenhafen',id:'source-house',expected:mainCopy.fingerprint,layout:before}]});assert.ok(!reset.isError,reset.content[0].text);assert.deepEqual((await call('get_building')).layout,before);
}));

test('MCP refuses invalid/stale/partial edits, protects story and serializes simultaneous writes to a draft',()=>fixture(async({world,args,call,edit,draft})=>{
  const original=await readFile(draft,'utf8'),initial=await call('get_building');
  for(const actions of [
    [{action:'add_room',id:'one',name:'One'},{action:'set_shell',room:'one',spawn:{x:0,y:0}}],
    [{action:'put_component',room:'main',group:'games',component:{id:'bad',game:'not-a-game',x:300,y:400}}],
    [{action:'remove_room',room:'main'}],
    [{action:'set_shell',room:'main',floors:[{id:'invalid',points:[[0,0],[100,100],[0,100],[100,0]]}]}],
    [{action:'put_component',room:'main',group:'furniture',component:{id:'typo',widht:140}}],
  ]){const failed=await world.call('edit_building',{...args,expected:initial.fingerprint,actions});assert.equal(failed.isError,true);assert.equal(await readFile(draft,'utf8'),original);}
  const inn=await call('get_building',{building:'inn'}),npc=inn.layout.npcs[0];
  const protectedResult=await world.call('edit_building',{...args,building:'inn',expected:inn.fingerprint,actions:[{action:'remove_component',room:'main',group:'npcs',id:npc.id}]});assert.equal(protectedResult.isError,true);assert.equal(await readFile(draft,'utf8'),original);
  const results=await Promise.all(['a','b'].map(id=>world.call('edit_building',{...args,expected:initial.fingerprint,actions:[{action:'add_room',id,name:id}]})));
  assert.equal(results.filter(r=>!r.isError).length,1);assert.match(results.find(r=>r.isError).content[0].text,/changed/);
  const before=await readFile(draft,'utf8');const stale=await world.call('copy_building_layout',{...args,expected:(await call('get_building')).fingerprint,sourceTown:'lindenhafen',sourceBuilding:'source-house',sourceExpected:'old',sourceRoom:'main',scope:'room'});assert.equal(stale.isError,true);assert.equal(await readFile(draft,'utf8'),before);
  const current=await call('get_building');await edit([{action:'remove_room',room:current.layout.rooms[0].id}]);assert.equal((await call('get_building')).rooms.length,1);
  await edit([{action:'add_floor',id:'upper',name:'Upper',level:1},{action:'add_room',id:'other',name:'Other',from:'upper'}]);await edit([{action:'remove_floor',level:1}]);assert.equal((await call('get_building')).rooms.length,1);
}));

test('live room authoring submits one normal fingerprint-checked operation and invalidates the world cache',()=>fixture(async({world,published})=>{
  const args={town:'lindenhafen',building:'source-house'},before=decode(await world.call('get_building',args));
  const result=decode(await world.call('edit_building',{...args,expected:before.fingerprint,actions:[{action:'add_room',id:'new',name:'New room'}]}));
  assert.equal(published.length,1);assert.equal(published[0].length,1);assert.equal(published[0][0].kind,'room');assert.equal(published[0][0].expected,before.fingerprint);
  assert.equal(decode(await world.call('get_building',args)).fingerprint,result.fingerprint);
}));

test('MCP stdio advertises room capabilities and handles room inspection without private story text',()=>fixture(async({world,args})=>{
  const input=new PassThrough(),output=new PassThrough(),lines=[];output.on('data',chunk=>lines.push(...chunk.toString().trim().split('\n')));serveMCP(world,input,output);
  input.write(JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'})+'\n');
  input.write(JSON.stringify({jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'get_building',arguments:{...args,building:'inn'}}})+'\n');
  for(let i=0;i<100&&lines.length<2;i++)await new Promise(resolve=>setTimeout(resolve,20));
  const replies=lines.map(line=>JSON.parse(line));
  const names=replies.find(r=>r.id===1).result.tools.map(t=>t.name);for(const name of ['list_buildings','list_room_catalogue','get_building','edit_building','copy_building_layout','audit_building','render_room','view_room'])assert.ok(names.includes(name));
  const inspection=decode(replies.find(r=>r.id===2).result);assert.ok(inspection.layout.npcs.length);assert.ok(!JSON.stringify(inspection).includes('exerciseIds'));input.end();
}));
