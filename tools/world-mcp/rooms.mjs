/** Room authoring for MCP. All writes become ordinary, fingerprint-checked world edit operations. */
import '../../scripts/register-content-loader.mjs';
import {randomUUID} from 'node:crypto';
import sharp from 'sharp';
const {getInterior} = await import('../../web/src/interiors.ts');
const {sceneEntrances, buildingRoomKind} = await import('../../web/src/scene-schema.ts');
const {roomKinds} = await import('../../web/src/room-kind.ts');
const {buildingRooms, parseRoomLayout, roomLayoutFingerprint, roomFurnitureAssets, roomRectangle, roomLevelName} = await import('../../web/src/room-layout.ts');
const {createRoomLayout, completeRoomLayout, additionalRoomTemplate, applyRoomLayout} = await import('../../web/src/room-layout-runtime.ts');
const {roomLayoutProblems} = await import('../../web/src/room-layout-validation.ts');
const {copyRoomLayout, pasteRoomLayout} = await import('../../web/src/admin-room-copy.ts');
const {roomGameIds, roomGameLabel} = await import('../../web/src/room-game-catalogue.ts');
const {NavigationGrid, PLAYER_RADIUS} = await import('../../web/src/navigation.ts');

const text={type:'string'},number={type:'number'},point={type:'object',required:['x','y'],additionalProperties:false,properties:{x:{type:'number',minimum:0,maximum:1536},y:{type:'number',minimum:0,maximum:1024}}};
const level={type:'integer',minimum:-15,maximum:15};
const draft={type:'string',description:'A pulled world file. Omit only to intentionally publish to the live world.'};
const address={town:text,building:{type:'string',description:'Scenery owner ID from list_buildings, not the interior ID.'},draft};
const expected={type:'string',description:'Fingerprint returned by get_building. Required to refuse stale edits.'};
const room={type:'string',description:'Room ID from get_building; main is the entrance room.'};
const group={type:'string',enum:['walls','doors','furniture','games','encounters','npcs']};
const action=(name,properties,required=[])=>({type:'object',additionalProperties:false,required:['action',...required],properties:{action:{const:name},...properties}});
const actions=[
  action('add_room',{id:text,name:text,level,from:room,at:point,backAt:point},['id','name']),
  action('add_floor',{id:text,name:text,level,from:room,at:point,backAt:point},['id','name','level']),
  action('update_room',{room,name:text,level},['room']),
  action('move_floor',{level,toLevel:level},['level','toLevel']),
  action('remove_room',{room},['room']),
  action('remove_floor',{level},['level']),
  action('set_shell',{room,spawn:point,exit:point,floors:{type:'array',minItems:1,maxItems:32,items:{type:'object',additionalProperties:false,required:['id','points'],properties:{id:text,points:{type:'array',minItems:3,maxItems:32,items:{type:'array',minItems:2,maxItems:2,items:number}}}}}},['room']),
  action('put_component',{room,group,component:{type:'object',description:'New component, or patch merged into the component with this id. See list_room_catalogue for fields.',required:['id'],properties:{id:text}}},['room','group','component']),
  action('remove_component',{room,group,id:text},['room','group','id']),
  action('connect_rooms',{from:room,to:room,id:text,backId:text,at:point,backAt:point},['from','to']),
  action('disconnect_rooms',{room,id:text},['room','id']),
];
export const roomTools=[
  {name:'list_buildings',description:'List every enterable building in a town, including default interiors, its owner ID, room/floor counts and layout fingerprint. Works on a draft or the live world.',inputSchema:{type:'object',required:['town'],properties:{town:text,draft}}},
  {name:'list_room_catalogue',description:'Public room templates, furniture, games, component fields, coordinate conventions and limits for edit_building. No private learning content.',inputSchema:{type:'object',properties:{}}},
  {name:'get_building',description:'Inspect a building before editing. Returns the saved fingerprint, all room names/floors/connections and editable layout. Optional room limits layout to that room. Default interiors are expanded so every component has an ID. Story placements expose IDs and positions only.',inputSchema:{type:'object',required:['town','building'],properties:{...address,room}}},
  {name:'edit_building',description:`Edit a building with an atomic batch of up to 100 actions. Use a draft from pull_world, then audit_building/view_room and push_world. Without draft this publishes immediately through the normal locks and validation. expected is the fingerprint from get_building.
add_room connects a new blank room to from (default main), on its floor unless level is given. add_floor creates a landing on a new level. Both make paired doors or stairs automatically; at/backAt optionally position the endpoints. connect_rooms also creates both endpoints. Moving a room or floor converts doors/stairs on both ends. remove_room/remove_floor delete their connections; the remaining graph must stay connected. The main room/floor cannot be removed or moved.
set_shell replaces floor polygons and/or entrance (spawn)/town exit. put_component adds or patches by ID; remove_component removes a component (wall openings and attached games are removed with their parent). NPCs and required story stations can be moved, not removed. Use list_room_catalogue for fields. Final geometry, collisions and walking routes must be valid; no partial writes on failure.`,inputSchema:{type:'object',required:['town','building','expected','actions'],properties:{...address,expected,actions:{type:'array',minItems:1,maxItems:100,items:{oneOf:actions}}}}},
  {name:'copy_building_layout',description:'Duplicate a room or entire floor within a building, or copy between buildings/towns in the same draft/world. Independent identities, shapes, entrance/exit, furniture and public games are copied; story characters/dialogue stay at source. Floor copies keep internal doors and receive stairs on a new free level; room copies connect on destinationRoom’s level. Both sourceExpected and expected fingerprints are required. Returns the new room IDs. Source is unchanged.',inputSchema:{type:'object',required:['town','building','expected','sourceTown','sourceBuilding','sourceExpected','sourceRoom','scope'],properties:{...address,expected,sourceTown:text,sourceBuilding:text,sourceExpected:expected,sourceRoom:room,scope:{type:'string',enum:['room','floor']},destinationRoom:room}}},
  {name:'audit_building',description:'Validate all rooms, floor shapes, reciprocal doors/stairs, collision clearances and routes to entrances, exits and games in one building. Read-only; an empty problems list means the layout is valid.',inputSchema:{type:'object',required:['town','building'],properties:address}},
  {name:'render_room',description:'Labelled PNG floor plan with component IDs, collision footprints, game/story/NPC markers and entrances, exits, doors and stairs. Use get_building for exact editable coordinates; view_room shows the artwork.',inputSchema:{type:'object',required:['town','building'],properties:{...address,room,labels:{type:'boolean',default:true}}}},
  {name:'view_room',description:'Preview a room using the game’s own interior renderer, including its custom floor, walls, furniture, doors and stairs. Read-only; uses the draft when given.',inputSchema:{type:'object',required:['town','building'],properties:{...address,room}}},
];

export function buildingState(scene,id) {
  const entrance=sceneEntrances(scene).find(e=>e.ownerId===id);
  if(!entrance)throw new Error(`No enterable building ${id} in ${scene.id}. Use list_buildings.`);
  const template=getInterior(buildingRoomKind(entrance.owner));
  const layout=entrance.owner.roomLayout?completeRoomLayout(template,entrance.owner.roomLayout):createRoomLayout(template);
  for(const child of layout.rooms ?? [])child.layout=completeRoomLayout(additionalRoomTemplate(template),child.layout);
  return {entrance,template,layout,fingerprint:roomLayoutFingerprint(entrance.owner.roomLayout)};
}
const choose=(layout,id='main')=>{
  const entry=buildingRooms(layout).find(r=>r.id===id);
  if(!entry)throw new Error(`No room ${id}. Read get_building for room IDs.`);
  return entry;
};
const fresh=prefix=>`${prefix}-${randomUUID().slice(0,8)}`;
const checkExpected=(actual,expected)=>{if(typeof expected!=='string'||actual!==expected)throw new Error('The building changed or its fingerprint is missing. Read get_building again before editing.');};
const checkLevel=n=>{if(!Number.isInteger(n)||n < -15||n > 15)throw new Error('Choose a whole-number floor between -15 and 15.');};
export function connectionPoint(template,layout,main) {
  layout=parseRoomLayout({...layout,rooms:undefined},true);
  const spec=applyRoomLayout(main?template:additionalRoomTemplate(template),layout);
  const obstacles=spec.props.flatMap(p=>p.collision?[roomRectangle(p.x+p.collision.offsetX,p.y+p.collision.offsetY,p.collision.width,p.collision.height)]:[]);
  const nav=new NavigationGrid(spec.floorAreas,[...(spec.barriers ?? []),...obstacles],spec,{agentRadius:PLAYER_RADIUS});
  return nav.closestPoint(layout.spawn.x+120*((layout.links?.length ?? 0)+1),layout.spawn.y,layout.spawn);
}
function connect(layout,template,{from='main',to,id=fresh('link'),backId=fresh('link'),at,backAt}) {
  if(from===to)throw new Error('Connect two different rooms.');
  const a=choose(layout,from).layout,b=choose(layout,to).layout;
  const kind=(a.level ?? 0)!==(b.level ?? 0)?{kind:'stairs'}:{};
  (a.links ??= []).push({id,...(at ?? connectionPoint(template,a,from==='main')),targetRoom:to,targetDoor:backId,...kind});
  (b.links ??= []).push({id:backId,...(backAt ?? connectionPoint(template,b,to==='main')),targetRoom:from,targetDoor:id,...kind});
}
function disconnect(layout,room,id) {
  const source=choose(layout,room).layout,link=source.links?.find(l=>l.id===id);
  if(!link)throw new Error(`No connection ${id} in ${room}.`);
  source.links=source.links.filter(l=>l!==link);
  const target=choose(layout,link.targetRoom).layout;
  target.links=target.links.filter(l=>l.id!==link.targetDoor);
}
const fields={walls:['id','x','y','width','height'],doors:['id','wallId','offset','width'],furniture:['id','x','y','source','width','footprint'],games:['id','x','y','game','furnitureId','approachOffsetY'],encounters:['id','x','y'],npcs:['id','x','y']};
export function editBuilding(state,edits) {
  if(!Array.isArray(edits)||!edits.length||edits.length>100)throw new Error('Supply 1–100 room actions.');
  const layout=structuredClone(state.layout);
  for(const edit of edits) {
    const schema=actions.find(s=>s.properties.action.const===edit?.action);
    if(!schema || schema.required.some(k=>edit[k]===undefined) || Object.keys(edit).some(k=>!Object.hasOwn(schema.properties,k)))throw new Error('Unknown action, missing required fields or unexpected fields. See edit_building’s action schema.');
    switch(edit.action) {
      case 'add_floor':case 'add_room':{
        if(buildingRooms(layout).length>=16)throw new Error('A building can have up to 16 rooms.');
        if(typeof edit.id!=='string'||!/^[a-zA-Z0-9_-]{1,40}$/.test(edit.id)||buildingRooms(layout).some(r=>r.id===edit.id))throw new Error('Choose a unique room ID (1–40 letters, digits, dashes or underscores).');
        const from=edit.from ?? 'main',targetLevel=edit.level ?? choose(layout,from).layout.level ?? 0;checkLevel(targetLevel);
        if(edit.action==='add_floor'&&buildingRooms(layout).some(r=>(r.layout.level ?? 0)===targetLevel))throw new Error('That floor already exists. Use add_room to extend it.');
        const child=createRoomLayout(additionalRoomTemplate(state.template));child.walls=[];child.furniture=[];child.level=targetLevel;
        (layout.rooms ??= []).push({id:edit.id,name:edit.name,layout:child});
        connect(layout,state.template,{...edit,from,to:edit.id,id:undefined});break;
      }
      case 'update_room':{
        const entry=choose(layout,edit.room);
        if(edit.room==='main'&&(edit.name!==undefined||edit.level!==undefined&&edit.level!==0))throw new Error('The main room keeps its name and ground floor.');
        if(edit.name!==undefined)entry.name=edit.name;
        if(edit.level!==undefined){checkLevel(edit.level);entry.layout.level=edit.level;}break;
      }
      case 'move_floor':{
        checkLevel(edit.level);checkLevel(edit.toLevel);
        if(edit.level===0)throw new Error('The main floor stays at level 0.');
        const rooms=buildingRooms(layout).filter(r=>(r.layout.level ?? 0)===edit.level);
        if(!rooms.length)throw new Error('That floor does not exist.');
        for(const r of rooms)r.layout.level=edit.toLevel;break;
      }
      case 'remove_floor':case 'remove_room':{
        if(edit.action==='remove_floor')checkLevel(edit.level);
        const ids=edit.action==='remove_room'?[choose(layout,edit.room).id]:buildingRooms(layout).filter(r=>(r.layout.level ?? 0)===edit.level).map(r=>r.id);
        if(!ids.length||ids.includes('main'))throw new Error('Choose an existing secondary room or floor; keep the main room.');
        layout.rooms=layout.rooms.filter(r=>!ids.includes(r.id));
        for(const r of buildingRooms(layout))r.layout.links=r.layout.links?.filter(l=>!ids.includes(l.targetRoom));break;
      }
      case 'set_shell':{
        const target=choose(layout,edit.room).layout;
        for(const key of ['floors','spawn','exit'])if(edit[key]!==undefined)target[key]=structuredClone(edit[key]);break;
      }
      case 'put_component':case 'remove_component':{
        if(!Object.hasOwn(fields,edit.group))throw new Error('Choose a component group from list_room_catalogue.');
        const target=choose(layout,edit.room).layout,list=target[edit.group],id=edit.component?.id ?? edit.id,index=list.findIndex(p=>p.id===id);
        if(edit.action==='put_component') {
          if(!edit.component||typeof edit.component!=='object'||Object.keys(edit.component).some(k=>!fields[edit.group].includes(k)))throw new Error('Use only the component fields in list_room_catalogue.');
          const previous=list[index],next={...previous,...structuredClone(edit.component)};
          if(previous&&edit.group==='furniture')for(const game of target.games.filter(g=>g.furnitureId===id)){game.x+=next.x-previous.x;game.y+=next.y-previous.y;}
          if(index<0)list.push(next);else list[index]=next;
        }else{
          if(index<0)throw new Error(`No component ${id} in ${edit.group}.`);
          list.splice(index,1);
          if(edit.group==='walls')target.doors=target.doors.filter(d=>d.wallId!==id);
          if(edit.group==='furniture')target.games=target.games.filter(g=>g.furnitureId!==id);
        }break;
      }
      case 'connect_rooms':connect(layout,state.template,edit);break;
      case 'disconnect_rooms':disconnect(layout,edit.room,edit.id);break;
    }
  }
  for(const entry of buildingRooms(layout))for(const link of entry.layout.links ?? []) {
    if((choose(layout,link.targetRoom).layout.level ?? 0)!==(entry.layout.level ?? 0))link.kind='stairs';else delete link.kind;
  }
  return parseRoomLayout(layout);
}
function summary(state) {
  return {building:state.entrance.ownerId,interior:state.entrance.interiorId,kind:state.layout.kind,fingerprint:state.fingerprint,
    rooms:buildingRooms(state.layout).map(r=>({id:r.id,name:r.name,level:r.layout.level ?? 0,floor:roomLevelName(r.layout.level ?? 0),connections:r.layout.links ?? [],components:Object.fromEntries(Object.keys(fields).map(g=>[g,r.layout[g].length]))}))};
}
export function createRoomHandlers({town,json,applyOperations,viewRoom}) {
  const state=async args=>{const {scene}=await town(args.town,args.draft);return buildingState(scene,args.building);};
  const commit=async(args,current,layout)=>{
    checkExpected(current.fingerprint,args.expected);
    const problems=roomLayoutProblems(current.template,layout);if(problems.length)throw new Error(`Building was not changed: ${problems.join('\n')}`);
    const result=await applyOperations({draft:args.draft,ops:[{kind:'room',map:args.town,id:args.building,expected:args.expected,layout}]});
    return json({...JSON.parse(result.content[0].text),...summary({...current,layout,fingerprint:roomLayoutFingerprint(layout)})});
  };
  return {
    async list_buildings(args){const {scene}=await town(args.town,args.draft);return json({town:scene.id,buildings:sceneEntrances(scene).map(e=>({building:e.ownerId,interior:e.interiorId,kind:buildingRoomKind(e.owner),custom:!!e.owner.roomLayout,fingerprint:roomLayoutFingerprint(e.owner.roomLayout),rooms:1+(e.owner.roomLayout?.rooms?.length ?? 0),levels:[...new Set([0,...(e.owner.roomLayout?.rooms ?? []).map(r=>r.layout.level ?? 0)])].sort((a,b)=>a-b)}))});},
    async list_room_catalogue(){return json({templates:roomKinds,furniture:roomFurnitureAssets,games:roomGameIds.map(id=>({id,label:roomGameLabel(id)})),componentFields:fields,
      conventions:{canvas:{width:1536,height:1024},positions:'Room pixels: x east, y south. Furniture/game positions are foot anchors; walls use top-left plus width/height. A game interaction is 64px below its anchor unless approachOffsetY is set.',floor:'floors: [{id,points:[[x,y],...]}], 3–32 corners per polygon. spawn and exit: {x,y}.',doors:'Partition openings: {id,wallId,offset,width}; width >= 64. For travel between rooms use connect_rooms.',furniture:'{id,source,x,y,width}, source from furniture above. Keep original:* sources only in their source main room. Optional footprint preserves collision when copying.',games:'{id,game,x,y}; optional furnitureId attaches to existing furniture; moving/removing that furniture also moves/removes its game.',story:'Move existing encounters/npcs by id,x,y. Required story stations and characters cannot be removed. Learning content is never stored in layouts.'},limits:{rooms:16,floors:[-15,15],componentsPerGroup:128,floorShapes:32,connectionsPerRoom:64}});},
    async get_building(args){const s=await state(args);return json({...summary(s),layout:args.room?{...choose(s.layout,args.room).layout,rooms:undefined}:s.layout});},
    async edit_building(args){const s=await state(args);checkExpected(s.fingerprint,args.expected);return commit(args,s,editBuilding(s,args.actions));},
    async copy_building_layout(args){
      if(!['room','floor'].includes(args.scope))throw new Error('Choose room or floor as the copy scope.');
      const source=await state({town:args.sourceTown,building:args.sourceBuilding,draft:args.draft}),target=await state(args);
      checkExpected(source.fingerprint,args.sourceExpected);checkExpected(target.fingerprint,args.expected);
      if(typeof args.sourceRoom!=='string')throw new Error('Choose a sourceRoom.');
      const copy=copyRoomLayout(source.template,source.layout,args.sourceRoom,args.scope,`${args.sourceTown}/${args.sourceBuilding}`);
      const pasted=pasteRoomLayout(target.layout,copy,args.destinationRoom ?? 'main',(layout,main)=>connectionPoint(target.template,layout,main));
      const result=await commit(args,target,pasted.building),value=JSON.parse(result.content[0].text);
      return json({...value,addedRooms:pasted.building.rooms.slice(target.layout.rooms?.length ?? 0).map(r=>r.id),firstRoom:pasted.roomId});
    },
    async audit_building(args){const s=await state(args);return json({...summary(s),problems:roomLayoutProblems(s.template,s.layout)});},
    async render_room(args){const s=await state(args),entry=choose(s.layout,args.room);return {content:[{type:'image',mimeType:'image/png',data:(await roomPlanPNG(s,entry,args.labels!==false)).toString('base64')},{type:'text',text:`${args.building} / ${entry.id} · ${roomLevelName(entry.layout.level ?? 0)}. Blue: floor. Brown: solid collision. Green: arrival/exit. Purple: games. Orange: story. Red: characters. Teal: doors/stairs. Component IDs match get_building.`}]};},
    async view_room(args){const s=await state(args),entry=choose(s.layout,args.room);const spec=applyRoomLayout(entry.id==='main'?s.template:additionalRoomTemplate(s.template),entry.layout,s.layout);return {content:[{type:'image',mimeType:'image/png',data:(await viewRoom(spec)).toString('base64')}]};},
  };
}
const xml=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
async function roomPlanPNG(state,entry,labels) {
  const layout=entry.layout,spec=applyRoomLayout(entry.id==='main'?state.template:additionalRoomTemplate(state.template),layout,state.layout),parts=[];
  const polygon=(points,color)=>parts.push(`<polygon points="${points.map(p=>p.join(',')).join(' ')}" fill="${color}" stroke="#85969f" stroke-width="2"/>`);
  const label=(x,y,text,color)=>{if(labels)parts.push(`<text x="${x+10}" y="${y-10}" fill="${color}" stroke="#17262d" stroke-width="3" paint-order="stroke" font-size="16">${xml(text)}</text>`);};
  const marker=(p,color,text)=>{parts.push(`<circle cx="${p.x}" cy="${p.y}" r="8" fill="${color}"/>`);label(p.x,p.y,text,color);};
  for(const f of layout.floors) {polygon(f.points,'#526d7c');label(f.points[0][0],f.points[0][1],f.id,'#cfe7ff');}
  for(const p of spec.barriers ?? [])polygon(p,'#846c52');
  for(const p of spec.props)if(p.collision)polygon(roomRectangle(p.x+p.collision.offsetX,p.y+p.collision.offsetY,p.collision.width,p.collision.height),'#846c52');
  for(const g of ['walls','furniture','games','encounters','npcs'])for(const p of layout[g])marker(p,{walls:'#e0c69d',furniture:'#dbcdb6',games:'#d9b0ff',encounters:'#ffb65b',npcs:'#ff9a90'}[g],p.id);
  for(const p of layout.links ?? [])marker(p,'#89e5de',`${p.id}: ${p.kind ?? 'door'} → ${p.targetRoom}`);
  for(const d of layout.doors){const w=layout.walls.find(w=>w.id===d.wallId),horizontal=w.width>=w.height;marker({x:w.x+(horizontal?d.offset+d.width/2:w.width/2),y:w.y+(horizontal?w.height/2:d.offset+d.width/2)},'#89e5de',d.id);}
  marker(layout.spawn,'#b4f29a','entrance');marker(layout.exit,'#b4f29a','town exit');
  return sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1536" height="1024" font-family="sans-serif"><rect width="1536" height="1024" fill="#17262d"/>${parts.join('')}</svg>`)).png().toBuffer();
}
