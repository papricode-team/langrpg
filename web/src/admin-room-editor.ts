import './room-editor.css';
import {NavigationGrid, PLAYER_RADIUS} from './navigation';
import {escapeHtml as escape} from './icons';
import type {InteriorSpec} from './interiors';
import {applyRoomLayout, completeRoomLayout, createRoomLayout, additionalRoomTemplate} from './room-layout-runtime';
import {roomLevelName, roomLinkDirection, buildingRooms, roomFurnitureAssets, roomRectangle, roomFloorProblem, type RoomFloorShape, type RoomLayout, type RoomPlacement, type RoomLink} from './room-layout';
import {roomLayoutProblems} from './room-layout-validation';
import {paintRoomKit, roomKit, roomMaterials} from './room-kit';
import {roomGameIds, roomGameLabel} from './room-game-catalogue';
import {terrainMaterial} from './terrain-materials';
import {worldAssetUrl} from './world-asset-url';
import type {SceneryAnimationManifest} from './scenery-animation';
import fixtureFrames from './data/room-kit-furniture.json';
import {copyRoomLayout, pasteRoomLayout, parseRoomLayoutCopy, roomCopyStorageKey, type RoomLayoutCopy} from './admin-room-copy';

let roomCopy:RoomLayoutCopy|undefined;
let copyStorageUnavailable=false;
function readRoomCopy():RoomLayoutCopy|undefined {
  if(copyStorageUnavailable)return roomCopy;
  let saved:string|null;
  try {saved=localStorage.getItem(roomCopyStorageKey);}catch {copyStorageUnavailable=true;return roomCopy;}
  try {roomCopy=saved?parseRoomLayoutCopy(JSON.parse(saved)):undefined;}catch {roomCopy=undefined;}
  return roomCopy;
}

type Group = 'links' | 'floors' | 'portals' | 'walls' | 'doors' | 'furniture' | 'games' | 'encounters' | 'npcs';
type Selection = {group:Group;id:string};
type Tool = 'stairs' | 'link' | 'floor' | 'entrance' | 'exit' | 'select' | 'wall' | 'door' | 'furniture' | 'game';
interface Atlas {frames:Record<string,{frame:{x:number;y:number;w:number;h:number}}>}

/** A building's private layout draft. The enclosing editor owns publication and undo across saves. */
export function openRoomEditor(baseTemplate: InteriorSpec, initial: RoomLayout | undefined,
  save: (layout: RoomLayout) => Promise<boolean> | boolean, title = baseTemplate.name): {destroy():void} {
  const previousFocus = document.activeElement as HTMLElement | null;
  const dialog = document.createElement('dialog');
  dialog.className = 'room-editor'; dialog.setAttribute('aria-label',`Edit room — ${title}`);
  dialog.innerHTML = `<header><div><h2>${escape(title)}</h2><p class="re-current-room"></p></div><div class="re-history"><button data-command="undo">Undo</button><button data-command="redo">Redo</button></div><button data-command="cancel">Cancel</button><button class="re-save" data-command="save">Save layout</button></header>
    <div class="re-body"><aside class="re-library"><label>Building floor<select data-level-picker></select></label><div class="re-floor-actions"><button data-command="add-upstairs">Add floor above</button><button data-command="add-downstairs">Add floor below</button></div><label>Room<select data-room-picker></select></label><label>Room name<input data-room-name maxlength="60"></label><label>Room floor<input data-room-level type="number" min="-15" max="15" step="1" title="0 = ground floor; negative numbers = basements"></label><button data-command="add-room">Add room</button><button data-command="remove-room">Remove room</button><h3>Reuse a layout</h3><div class="re-copy-actions"><button data-command="duplicate-room">Duplicate room</button><button data-command="duplicate-floor">Duplicate floor</button><button data-command="copy-room">Copy room</button><button data-command="copy-floor">Copy floor</button></div><p data-copy-summary></p><button data-command="paste-layout">Paste copied layout</button><p>Copy here, then open another building to paste. Rooms join the current floor; floors get a new floor with stairs. Copies include shapes, furniture and games. Story characters and dialogue stay in the original building.</p><h3>Place a component</h3><div class="re-tools">${(['select','floor','entrance','exit','wall','door','link','stairs','furniture','game'] as Tool[]).map(t=>`<button data-tool="${t}" aria-pressed="${t==='select'}">${t==='select'?'Select / move':t==='link'?'Room door':t==='floor'?'Floor shape':t.charAt(0).toUpperCase()+t.slice(1)}</button>`).join('')}</div>
    <label>Connection destination<select data-room-target></select></label><label>Furniture<select data-library="furniture">${roomFurnitureAssets.map(id=>`<option value="${id}"${id==='cafe-table'?' selected':''}>${escape(id.replaceAll('-',' '))}</option>`).join('')}</select></label>
    <label>Game<select data-library="game">${roomGameIds.map(id=>`<option value="${id}">${escape(roomGameLabel(id))}</option>`).join('')}</select></label>
    <label class="re-check"><input type="checkbox" data-snap checked> Snap to 16 px grid</label><p>Click to place. Drag to move. Place a door on a wall to cut an opening.</p><p>Select a floor and drag its corners to reshape it. Add corners in the inspector. Entrance and Exit place the travel points. Room door connects rooms on this floor. Stairs connects to another floor. Both add a matching endpoint in the destination room.</p></aside>
    <main><div class="re-canvas-wrap"><canvas width="1536" height="1024" tabindex="0" aria-label="Room layout canvas"></canvas></div><div class="re-hint" role="status">Select a component or choose something to place.</div></main>
    <aside class="re-inspector"><div class="re-properties"></div><h3>Components</h3><div class="re-components"></div></aside></div>
    <footer><span class="re-status" aria-live="polite">Changes stay in this draft until you save.</span><span>Drag · Delete · ⌘/Ctrl Z</span></footer>`;
  document.body.append(dialog); dialog.showModal();
  const canvas = dialog.querySelector('canvas')!, context = canvas.getContext('2d')!;
  let template=baseTemplate, activeRoom='main';
  let building=initial ? completeRoomLayout(template,initial) : createRoomLayout(template);
  for(const room of building.rooms ?? []) room.layout=completeRoomLayout(additionalRoomTemplate(template),room.layout);
  let layout=building, tool:Tool='select', selected:Selection|undefined;
  const snapshot=():RoomLayout=>{if(activeRoom==='main')building=layout;else building.rooms!.find(r=>r.id===activeRoom)!.layout=layout;return structuredClone(building);};
  const switchRoom=(id:string)=>{snapshot();activeRoom=id;const room=building.rooms?.find(r=>r.id===id);if(!room)activeRoom='main';layout=room?.layout ?? building;template=room?additionalRoomTemplate(baseTemplate):baseTemplate;selected=undefined;tool='select';};
  let busy=false, dead=false, dirty=false;
  let clipboard=readRoomCopy();
  const undo:RoomLayout[]=[], redo:RoomLayout[]=[];
  const images = new Map<string,HTMLImageElement>(), atlases = new Map<string,Atlas>();
  let animations:SceneryAnimationManifest|undefined, stills:SceneryAnimationManifest|undefined;
  const groups:Group[]=['floors','links','walls','doors','furniture','games','encounters','npcs','portals'];
  const components = (group:Group) => group==='portals' ? [{id:'entrance',...layout.spawn!},{id:'exit',...layout.exit!}] : group==='floors' ? layout.floors! : group==='links' ? layout.links ?? [] : layout[group];
  const status = (text:string,error=false) => { const el=dialog.querySelector<HTMLElement>('.re-status')!;el.textContent=text;el.classList.toggle('re-error',error); };
  const doorPosition=(room:RoomLayout, main=false)=>{
    const spec=applyRoomLayout(main?baseTemplate:additionalRoomTemplate(baseTemplate),room);
    const obstacles=spec.props.flatMap(p=>p.collision?[roomRectangle(p.x+p.collision.offsetX,p.y+p.collision.offsetY,p.collision.width,p.collision.height)]:[]);
    const navigation=new NavigationGrid(spec.floorAreas,[...(spec.barriers ?? []),...obstacles],spec,{agentRadius:PLAYER_RADIUS});
    const spawn=room.spawn!;
    return navigation.closestPoint(spawn.x+120*((room.links?.length ?? 0)+1),spawn.y,spawn);
  };
  const checkpoint = () => {undo.push(snapshot());if(undo.length>80)undo.shift();redo.length=0;dirty=true;};
  const current = () => selected ? components(selected.group).find(v=>v.id===selected!.id) : undefined;
  const name = (group:Group, id:string) => {
    const item=components(group).find(v=>v.id===id)!;
    if(group==='furniture') {const f=item as RoomLayout['furniture'][number];return f.source.startsWith('original:') ? template.props.find(p=>p.id===f.source.slice(9))?.asset ?? f.source : f.source;}
    if(group==='games') return roomGameLabel((item as RoomLayout['games'][number]).game);
    if(group==='encounters') return template.objects.find(o=>o.id===id)?.label ?? id;
    if(group==='links'){const link=item as RoomLink;return `${link.kind==='stairs'?`Stairs ${roomLinkDirection(layout,link,building)}`:'Door'} to ${buildingRooms(building).find(r=>r.id===link.targetRoom)?.name ?? 'room'}`;}
    if(group==='npcs') return id;
    if(group==='floors') return `Floor shape ${layout.floors!.findIndex(f=>f.id===id)+1}`;
    if(group==='portals') return id==='entrance'?'Entrance':'Town exit';
    return group==='walls'?'Wall':'Door opening';
  };
  const position = (selection:Selection):RoomPlacement => {
    const item = components(selection.group).find(v=>v.id===selection.id)!;
    if(selection.group==='floors') {const points=(item as RoomFloorShape).points;return {id:item.id,x:(Math.min(...points.map(p=>p[0]))+Math.max(...points.map(p=>p[0])))/2,y:(Math.min(...points.map(p=>p[1]))+Math.max(...points.map(p=>p[1])))/2};}
    if(selection.group!=='doors')return item as RoomPlacement;
    const door=item as RoomLayout['doors'][number], wall=layout.walls.find(w=>w.id===door.wallId)!;
    return {id:door.id,x:wall.x+(wall.width>=wall.height?door.offset+door.width/2:wall.width/2),y:wall.y+(wall.height>wall.width?door.offset+door.width/2:wall.height/2)};
  };
  const removable = () => selected && !(selected.group==='portals' || selected.group==='floors' && layout.floors!.length===1 || selected.group==='npcs' || selected.group==='encounters' && !template.objects.find(o=>o.id===selected!.id)?.gameOnly);
  const render = () => {
    if(dead)return;
    snapshot();
    const rooms=buildingRooms(building);
    dialog.querySelector('.re-current-room')!.textContent=`${rooms.find(r=>r.id===activeRoom)!.name} · ${roomLevelName(layout.level ?? 0)}`;
    const levels=[...new Set(rooms.map(r=>r.layout.level ?? 0))].sort((a,b)=>a-b);
    dialog.querySelector<HTMLSelectElement>('[data-level-picker]')!.innerHTML=levels.map(level=>`<option value="${level}"${level===(layout.level ?? 0)?' selected':''}>${roomLevelName(level)}</option>`).join('');
    dialog.querySelector<HTMLSelectElement>('[data-room-picker]')!.innerHTML=levels.map(level=>`<optgroup label="${roomLevelName(level)}">${rooms.filter(r=>(r.layout.level ?? 0)===level).map(r=>`<option value="${escape(r.id)}"${r.id===activeRoom?' selected':''}>${escape(r.name)}</option>`).join('')}</optgroup>`).join('');
    const roomLevel=dialog.querySelector<HTMLInputElement>('[data-room-level]')!;roomLevel.value=String(layout.level ?? 0);roomLevel.disabled=activeRoom==='main';
    dialog.querySelector<HTMLButtonElement>('[data-command="add-upstairs"]')!.disabled=rooms.length>=16 || Math.max(...levels)>=15;
    dialog.querySelector<HTMLButtonElement>('[data-command="add-downstairs"]')!.disabled=rooms.length>=16 || Math.min(...levels)<=-15;
    const destination=dialog.querySelector<HTMLSelectElement>('[data-room-target]')!, previous=destination.value;
    destination.innerHTML=rooms.filter(r=>r.id!==activeRoom && (tool!=='stairs' || (r.layout.level ?? 0)!==(layout.level ?? 0)) && (tool!=='link' || (r.layout.level ?? 0)===(layout.level ?? 0))).map(r=>`<option value="${escape(r.id)}">${escape(r.name)} · ${roomLevelName(r.layout.level ?? 0)}</option>`).join('');
    if([...destination.options].some(o=>o.value===previous))destination.value=previous;
    const roomName=dialog.querySelector<HTMLInputElement>('[data-room-name]')!;roomName.value=rooms.find(r=>r.id===activeRoom)!.name;roomName.disabled=activeRoom==='main';
    dialog.querySelector<HTMLButtonElement>('[data-command="remove-room"]')!.disabled=activeRoom==='main';
    dialog.querySelector<HTMLButtonElement>('[data-command="add-room"]')!.disabled=rooms.length>=16;
    dialog.querySelector<HTMLButtonElement>('[data-command="duplicate-room"]')!.disabled=rooms.length>=16;
    dialog.querySelector<HTMLButtonElement>('[data-command="duplicate-floor"]')!.disabled=rooms.length+rooms.filter(r=>(r.layout.level ?? 0)===(layout.level ?? 0)).length>16;
    dialog.querySelector<HTMLButtonElement>('[data-command="paste-layout"]')!.disabled=!clipboard || rooms.length+clipboard.rooms.length>16;
    dialog.querySelector('[data-copy-summary]')!.textContent=clipboard?`${clipboard.label} · ${clipboard.rooms.length} room${clipboard.rooms.length===1?'':'s'} copied${rooms.length+clipboard.rooms.length>16?' — not enough room slots (maximum 16)':''}`:'No layout copied yet.';
    const item=current();
    const props=dialog.querySelector<HTMLElement>('.re-properties')!;
    if (item && selected?.group==='floors') {
      const floor=item as RoomFloorShape;
      props.innerHTML=`<h3>${escape(name('floors',floor.id))}</h3><p>Drag the numbered corners, or set their coordinates below. Drag the floor itself to move the whole shape.</p><div class="re-corners">${floor.points.map((p,index)=>`<fieldset><legend>Corner ${index+1}</legend>${(['X','Y'] as const).map((axis,a)=>`<label>${axis}<input type="number" step="1" data-corner="${index}" data-axis="${a}" value="${Math.round(p[a])}"></label>`).join('')}<button data-insert-corner="${index}"${floor.points.length>=32?' disabled':''}>Add after ${index+1}</button><button data-remove-corner="${index}"${floor.points.length<=3?' disabled':''}>Remove corner ${index+1}</button></fieldset>`).join('')}</div>${removable()?'<button data-command="remove">Remove floor</button>':''}`;
    } else props.innerHTML=item&&selected?`<h3>${escape(name(selected.group,selected.id).replaceAll('-',' '))}</h3>${(selected.group==='doors'?['offset','width']:['x','y',...('width' in item?['width']:[]),...('height' in item?['height']:[])]).map(key=>`<label>${key.charAt(0).toUpperCase()+key.slice(1)}<input data-property="${key}" type="number" step="1" value="${Math.round(Number((item as unknown as Record<string,unknown>)[key]))}"></label>`).join('')}${selected.group==='links'?'<button data-command="visit-room">Edit destination room</button>':''}${selected.group==='walls'?'<button data-command="rotate">Rotate wall</button>':''}${removable()?'<button data-command="remove">Remove component</button>':selected.group==='portals'?'<p>Place on clear floor with a route to the other travel point.</p>':'<p>Story content stays in the room. Drag to reposition it.</p>'}`:'<h3>Your room</h3><p>Select a component to change its position or size.</p>';
    dialog.querySelector('.re-components')!.innerHTML=groups.flatMap(group=>components(group).map(item=>`<button data-component="${escape(item.id)}" data-group="${group}" aria-pressed="${selected?.id===item.id}">${escape(name(group,item.id).replaceAll('-',' '))}</button>`)).join('');
    for(const b of dialog.querySelectorAll<HTMLButtonElement>('[data-command="undo"],[data-command="redo"]'))b.disabled=busy||!(b.dataset.command==='undo'?undo:redo).length;
    for(const b of dialog.querySelectorAll<HTMLButtonElement>('[data-tool]'))b.setAttribute('aria-pressed',String(tool===b.dataset.tool));
    draw();
  };
  const draw = () => {
    let spec:InteriorSpec;
    try {spec=applyRoomLayout(template,layout,building);}catch(error){status(String((error as Error).message),true);return;}
    const floorError=layout.floors!.map(f=>roomFloorProblem(f.points)).find(Boolean);
    if(floorError) status(floorError,true);
    // Keep invalid in-progress corners visible without passing crossed polygons to the painter.
    const preview={...spec,floorAreas:spec.floorAreas.filter(points=>!roomFloorProblem(points))};
    paintRoomKit(context,preview,id=>images.get(id));
    const sprite=(asset:string,x:number,y:number,width:number) => {
      const animation=stills?.assets[asset]??animations?.assets[asset];
      const atlas=animation&&atlases.get(animation.key),image=animation&&images.get(animation.key),frame=animation&&atlas?.frames[animation.frames[0]]?.frame;
      if(!animation||!image||!frame) {context.fillStyle='#c9b48b';context.fillRect(x-width/2,y-30,width,30);return;}
      const scale=width/animation.referenceWidth,w=frame.w*scale,h=frame.h*scale;
      context.drawImage(image,frame.x,frame.y,frame.w,frame.h,x-w*animation.originX,y-h*animation.originY,w,h);
    };
    for(const prop of [...spec.props].sort((a,b)=>a.y-b.y))sprite(prop.asset,prop.x,prop.y,prop.width);
    for(const f of roomKit(preview).fixtures){const image=images.get('room-kit-furniture'),frame=fixtureFrames[f.kind];if(image)context.drawImage(image,frame.x,frame.y,frame.width,frame.height,f.x,f.y+f.height-f.width*frame.height/frame.width,f.width,f.width*frame.height/frame.width);}
    if(dialog.querySelector<HTMLInputElement>('[data-snap]')!.checked){context.strokeStyle='#ffffff0d';context.lineWidth=1;context.beginPath();for(let x=0;x<1536;x+=16){context.moveTo(x,0);context.lineTo(x,1024);}for(let y=0;y<1024;y+=16){context.moveTo(0,y);context.lineTo(1536,y);}context.stroke();}
    for(const wall of layout.walls){context.strokeStyle=selected?.id===wall.id?'#ffdb7a':'#d8c7a199';context.lineWidth=selected?.id===wall.id?5:2;context.strokeRect(wall.x,wall.y,wall.width,wall.height);}
    const marker=(x:number,y:number,label:string,color:string,radius=12)=>{context.beginPath();context.arc(x,y,radius,0,Math.PI*2);context.fillStyle=color;context.fill();context.strokeStyle='#172c33';context.lineWidth=3;context.stroke();context.font='bold 18px sans-serif';context.lineWidth=5;context.strokeText(label,x+18,y+6);context.fillStyle='#fff';context.fillText(label,x+18,y+6);};
    for(const floor of layout.floors!) {
      context.beginPath();floor.points.forEach(([x,y],i)=>i?context.lineTo(x,y):context.moveTo(x,y));context.closePath();
      context.strokeStyle=roomFloorProblem(floor.points)?'#ed7967':selected?.id===floor.id?'#ffdb7a':'#b9d3b688';context.lineWidth=selected?.id===floor.id?4:2;context.stroke();
      if(selected?.id===floor.id) floor.points.forEach(([x,y],i)=>marker(x,y,String(i+1),'#ffdb7a',12));
    }
    for(const group of groups)for(const item of components(group)){
      if(group==='walls'||group==='floors')continue;
      const p=position({group,id:item.id});
      if(group==='doors'){
        const d=layout.doors.find(d=>d.id===item.id)!,w=layout.walls.find(w=>w.id===d.wallId)!;
        context.fillStyle='#8ac9c2';context.fillRect(w.x+(w.width>=w.height?d.offset:0),w.y+(w.height>w.width?d.offset:0),w.width>=w.height?d.width:w.width,w.height>w.width?d.width:w.height);
      }
      marker(p.x,p.y,selected?.id===item.id||(group==='portals'||group==='links')?name(group,item.id):group==='games'?'Game':group==='encounters'?'◆':group==='npcs'?'Person':'',selected?.id===item.id?'#ffdb7a':group==='games'?'#a4c4ff':group==='encounters'?'#dcb5e8':'#88c5b3',selected?.id===item.id?16:9);
    }

  };
  const uid=(prefix:string)=>`${prefix}-${crypto.randomUUID().slice(0,8)}`;
  const point=(event:PointerEvent)=>{const r=canvas.getBoundingClientRect();return {x:(event.clientX-r.left)*1536/r.width,y:(event.clientY-r.top)*1024/r.height};};
  const snap=(v:number)=>dialog.querySelector<HTMLInputElement>('[data-snap]')!.checked?Math.round(v/16)*16:Math.round(v);
  const hit=(p:{x:number;y:number}):Selection|undefined=>{
    for(const group of [...groups].reverse())for(const item of [...components(group)].reverse()){
      if(group==='floors')continue;
      const at=position({group,id:item.id});
      if(Math.hypot(at.x-p.x,at.y-p.y)<24)return {group,id:item.id};
    }
    for(const w of [...layout.walls].reverse())if(p.x>=w.x&&p.x<=w.x+w.width&&p.y>=w.y&&p.y<=w.y+w.height)return {group:'walls',id:w.id};
    for(const f of [...layout.furniture].reverse())if(Math.abs(p.x-f.x)<f.width/2&&p.y<=f.y&&p.y>=f.y-Math.min(f.width,160))return {group:'furniture',id:f.id};
    for(const floor of [...layout.floors!].reverse()) {
      let inside=false;const points=floor.points;
      for(let i=0,j=points.length-1;i<points.length;j=i++) {const a=points[i],b=points[j];if((a[1]>p.y)!==(b[1]>p.y)&&p.x<(b[0]-a[0])*(p.y-a[1])/(b[1]-a[1])+a[0])inside=!inside;}
      if(inside)return {group:'floors',id:floor.id};
    }
    return undefined;
  };
  let drag:{start:{x:number;y:number};origin:RoomPlacement;before:RoomLayout;buildingBefore:RoomLayout;changed:boolean;corner?:number}|undefined;
  canvas.addEventListener('pointerdown',event=>{
    if(busy||event.button!==0)return;
    canvas.focus();const p=point(event),x=Math.max(0,Math.min(1536,snap(p.x))),y=Math.max(0,Math.min(1024,snap(p.y)));
    if(tool==='select'){
      const floor=selected?.group==='floors'?current() as RoomFloorShape:undefined;
      const corner=floor?.points.findIndex(v=>Math.hypot(v[0]-p.x,v[1]-p.y)<24) ?? -1;
      if(corner<0)selected=hit(p);
      if(selected)drag={start:p,origin:position(selected),before:structuredClone(layout),buildingBefore:snapshot(),changed:false,...(corner>=0?{corner}:{})};
      canvas.setPointerCapture(event.pointerId);render();return;
    }
    if(tool==='entrance'||tool==='exit'){
      checkpoint();layout[tool==='entrance'?'spawn':'exit']={x,y};selected={group:'portals',id:tool};tool='select';status('Travel point moved. Save checks that it is on reachable floor.');render();return;
    }
    if(tool==='link'||tool==='stairs'){
      const target=dialog.querySelector<HTMLSelectElement>('[data-room-target]')!.value;
      const destination=buildingRooms(building).find(r=>r.id===target);
      if(!destination || target===activeRoom){status(tool==='stairs'?'Add another floor, then choose a stair destination.':'Add another room on this floor, then choose a door destination.',true);return;}
      const stairs=tool==='stairs';
      if(stairs!==((layout.level ?? 0)!==(destination.layout.level ?? 0))){status('Use stairs between floors and room doors on the same floor.',true);return;}
      checkpoint();const id=uid('link'),back=uid('link');
      (layout.links ??= []).push({id,x,y,targetRoom:target,targetDoor:back,...(stairs?{kind:'stairs' as const}:{})});
      (destination.layout.links ??= []).push({id:back,...doorPosition(destination.layout,target==='main'),targetRoom:activeRoom,targetDoor:id,...(stairs?{kind:'stairs' as const}:{})});
      selected={group:'links',id};tool='select';status(stairs?'Stairs connected. Switch floors to position the other landing.':'Connected rooms. Switch rooms to position the matching doorway.');render();return;
    }
    if(tool==='door'){
      const wall=layout.walls.find(w=>p.x>=w.x-12&&p.x<=w.x+w.width+12&&p.y>=w.y-12&&p.y<=w.y+w.height+12);
      if(!wall||Math.max(wall.width,wall.height)<96){status('Click a wall at least 96 pixels long to place a doorway.',true);return;}
      const offset=Math.max(0,Math.min(Math.max(wall.width,wall.height)-96,snap((wall.width>=wall.height?p.x-wall.x:p.y-wall.y)-48)));
      if(layout.doors.some(d=>d.wallId===wall.id&&d.offset<offset+96&&d.offset+d.width>offset)){status('That doorway overlaps another opening.',true);return;}
      checkpoint();const id=uid('door');layout.doors.push({id,wallId:wall.id,offset,width:96});selected={group:'doors',id};
    }else{
      checkpoint();const id=uid(tool);
      if(tool==='floor'){layout.floors!.push({id,points:roomRectangle(Math.min(x,1216),Math.min(y,784),320,240)});selected={group:'floors',id};tool='select';}
      if(tool==='wall'){layout.walls.push({id,x:Math.min(x,1216),y:Math.min(y,1000),width:320,height:24});selected={group:'walls',id};}
      if(tool==='furniture'){layout.furniture.push({id,source:dialog.querySelector<HTMLSelectElement>('[data-library="furniture"]')!.value,x,y,width:140});selected={group:'furniture',id};}
      if(tool==='game'){layout.games.push({id,game:dialog.querySelector<HTMLSelectElement>('[data-library="game"]')!.value,x,y:Math.min(y,950)});selected={group:'games',id};}
    }
    status('Component placed. Choose Select / move to reposition it.');render();
  });
  canvas.addEventListener('pointermove',event=>{
    if(!drag||!selected||busy)return;
    const p=point(event);if(!drag.changed&&Math.hypot(p.x-drag.start.x,p.y-drag.start.y)<4)return;
    if(!drag.changed){undo.push(drag.buildingBefore);redo.length=0;dirty=true;drag.changed=true;}
    const item=current()!;
    if(selected.group==='floors'){
      const floor=item as RoomFloorShape, original=drag.before.floors!.find(f=>f.id===floor.id)!;
      if(drag.corner!==undefined)floor.points[drag.corner]=[Math.max(0,Math.min(1536,snap(p.x))),Math.max(0,Math.min(1024,snap(p.y)))];
      else {
        const xs=original.points.map(p=>p[0]),ys=original.points.map(p=>p[1]);
        const dx=Math.max(-Math.min(...xs),Math.min(1536-Math.max(...xs),snap(p.x-drag.start.x))),dy=Math.max(-Math.min(...ys),Math.min(1024-Math.max(...ys),snap(p.y-drag.start.y)));
        floor.points=original.points.map(v=>[v[0]+dx,v[1]+dy]);
      }
    }else if(selected.group==='doors'){
      const door=item as RoomLayout['doors'][number],wall=layout.walls.find(w=>w.id===door.wallId)!;
      door.offset=Math.max(0,Math.min(Math.max(wall.width,wall.height)-door.width,snap(wall.width>=wall.height?p.x-wall.x-door.width/2:p.y-wall.y-door.width/2)));
    }else{
      const placed=(selected.group==='portals'?layout[selected.id==='entrance'?'spawn':'exit']!:item) as RoomPlacement;placed.x=Math.max(0,Math.min(1536-('width'in item&&selected.group==='walls'?Number(item.width):0),snap(drag.origin.x+p.x-drag.start.x)));placed.y=Math.max(0,Math.min(1024-('height'in item?Number(item.height):0),snap(drag.origin.y+p.y-drag.start.y)));
    }
    if(selected.group==='furniture'){const moved=current() as RoomPlacement;for(const game of layout.games.filter(g=>g.furnitureId===moved.id)){const original=drag.before.games.find(g=>g.id===game.id)!;game.x=original.x+moved.x-drag.origin.x;game.y=original.y+moved.y-drag.origin.y;}}
    draw();
  });
  const stopDrag=()=>{if(drag?.changed)status('Layout updated. Save checks the walking routes.');drag=undefined;render();};
  canvas.addEventListener('pointerup',stopDrag);canvas.addEventListener('pointercancel',stopDrag);
  const remove=()=>{if(!selected||!removable()||busy)return;checkpoint();const {group,id}=selected;if(group==='links'){const link=layout.links!.find(d=>d.id===id)!;const other=buildingRooms(building).find(r=>r.id===link.targetRoom);if(other)other.layout.links=other.layout.links?.filter(d=>d.id!==link.targetDoor);}layout={...layout,[group]:components(group).filter(v=>v.id!==id),...(group==='walls'?{doors:layout.doors.filter(d=>d.wallId!==id)}:{}),...(group==='furniture'?{games:layout.games.filter(g=>g.furnitureId!==id)}:{})};selected=undefined;render();};
  const history=(back:boolean)=>{const source=back?undo:redo,target=back?redo:undo;if(!source.length||busy)return;target.push(snapshot());building=source.pop()!;const room=building.rooms?.find(r=>r.id===activeRoom);if(!room)activeRoom='main';layout=room?.layout ?? building;template=room?additionalRoomTemplate(baseTemplate):baseTemplate;selected=undefined;dirty=true;render();};
  const destroy=()=>{if(dead)return;dead=true;dialog.close();dialog.remove();window.removeEventListener('keydown',keys,true);window.removeEventListener('storage',refreshCopy);previousFocus?.focus();};
  const cancel=()=>{if(!busy&&(!dirty||confirm('Discard this building layout draft?')))destroy();};
  dialog.addEventListener('cancel',event=>{event.preventDefault();cancel();});
  dialog.addEventListener('click',async event=>{
    const button=(event.target as HTMLElement).closest<HTMLButtonElement>('button');if(!button||busy)return;
    if(button.dataset.insertCorner!==undefined||button.dataset.removeCorner!==undefined){
      const floor=current() as RoomFloorShape;if(selected?.group!=='floors')return;
      checkpoint();
      if(button.dataset.insertCorner!==undefined){const i=Number(button.dataset.insertCorner),a=floor.points[i],b=floor.points[(i+1)%floor.points.length];floor.points.splice(i+1,0,[(a[0]+b[0])/2,(a[1]+b[1])/2]);}
      else floor.points.splice(Number(button.dataset.removeCorner),1);
      render();return;
    }
    if(button.dataset.tool){tool=button.dataset.tool as Tool;status(tool==='door'?'Click a wall to cut a doorway.':tool==='select'?'Drag components to move them.':`Click the room to place ${tool}.`);render();return;}
    if(button.dataset.component){selected={group:button.dataset.group as Group,id:button.dataset.component};tool='select';render();return;}
    switch(button.dataset.command){
      case 'copy-room':
      case 'copy-floor':
      case 'duplicate-room':
      case 'duplicate-floor':
      case 'paste-layout':{
        try {
          const command=button.dataset.command;
          const scope=command.endsWith('floor')?'floor':'room';
          const source=command==='paste-layout'?readRoomCopy():copyRoomLayout(baseTemplate,snapshot(),activeRoom,scope,`${title} · ${scope==='floor'?roomLevelName(layout.level ?? 0):buildingRooms(building).find(r=>r.id===activeRoom)!.name}`);
          if(!source)throw new Error('Copy a room or floor first.');
          if(command.startsWith('copy-')) {
            roomCopy=clipboard=source;
            let persisted=true;try{localStorage.setItem(roomCopyStorageKey,JSON.stringify(source));}catch{persisted=false;copyStorageUnavailable=true;}
            status(`Copied ${source.rooms.length} room${source.rooms.length===1?'':'s'}. Open another building and paste${persisted?'': ' in this tab'}.`);
          } else {
            const pasted=pasteRoomLayout(snapshot(),source,activeRoom,doorPosition);
            checkpoint();building=pasted.building;activeRoom='main';layout=building;
            switchRoom(pasted.roomId);
            status(`${source.scope==='floor'?'Floor':'Room'} copied and connected. Customize this independent layout, then save.`);
          }
          render();
        }catch(error){status((error as Error).message,true);}
        break;
      }
      case 'visit-room':{const link=layout.links?.find(d=>d.id===selected?.id);if(link){switchRoom(link.targetRoom);render();}break;}
      case 'add-upstairs':
      case 'add-downstairs':
      case 'add-room':{
        if((building.rooms?.length ?? 0)>=15)return;
        const levels=buildingRooms(building).map(r=>r.layout.level ?? 0);
        const level=button.dataset.command==='add-upstairs'?Math.max(...levels)+1:button.dataset.command==='add-downstairs'?Math.min(...levels)-1:layout.level ?? 0;
        if(level < -15 || level > 15)return;
        checkpoint();snapshot();const id=uid('room'), child=createRoomLayout(additionalRoomTemplate(baseTemplate));
        if(level!==0)child.level=level;
        const stairs=level!==(layout.level ?? 0);
        child.walls=[];child.furniture=[];
        const out=uid('link'),back=uid('link');
        (layout.links ??= []).push({id:out,...doorPosition(layout,activeRoom==='main'),targetRoom:id,targetDoor:back,...(stairs?{kind:'stairs' as const}:{})});
        child.links=[{id:back,...doorPosition(child),targetRoom:activeRoom,targetDoor:out,...(stairs?{kind:'stairs' as const}:{})}];
        (building.rooms ??= []).push({id,name:stairs?`${roomLevelName(level)} landing`:`Room ${building.rooms!.length+2}`,layout:child});
        switchRoom(id);status(stairs?'Floor added with a stair connection. Move the landing and shape this room.':'Room added and connected. Move its doorway, shape the floor, and add furniture or games.');render();break;
      }
      case 'remove-room':{
        if(activeRoom==='main')return;
        checkpoint();snapshot();
        for(const room of buildingRooms(building))room.layout.links=room.layout.links?.filter(d=>d.targetRoom!==activeRoom);
        building.rooms=building.rooms!.filter(r=>r.id!==activeRoom);
        activeRoom='main';layout=building;template=baseTemplate;selected=undefined;status('Room and its connecting doors removed.');render();break;
      }
      case 'cancel':cancel();break;
      case 'undo':history(true);break;
      case 'redo':history(false);break;
      case 'remove':remove();break;
      case 'rotate':{const wall=current() as RoomLayout['walls'][number];checkpoint();[wall.width,wall.height]=[wall.height,wall.width];wall.x=Math.min(wall.x,1536-wall.width);wall.y=Math.min(wall.y,1024-wall.height);render();break;}
      case 'save':{
        const problems=roomLayoutProblems(baseTemplate,snapshot());
        if(problems.length){status(problems[0],true);return;}
        busy=true;dialog.querySelectorAll<HTMLButtonElement|HTMLInputElement|HTMLSelectElement>('button,input,select').forEach(el=>el.disabled=true);status('Saving room layout…');
        try{if(await save(snapshot())){destroy();return;}status('The room could not be saved. Your draft is still open.',true);}catch(error){status((error as Error).message,true);}
        busy=false;dialog.querySelectorAll<HTMLButtonElement|HTMLInputElement|HTMLSelectElement>('button,input,select').forEach(el=>el.disabled=false);render();break;
      }
    }
  });
  dialog.addEventListener('change',event=>{
    const input=event.target as HTMLInputElement;
    if(busy)return;
    if(input.matches('[data-level-picker]')){const room=buildingRooms(building).find(r=>(r.layout.level ?? 0)===Number(input.value));if(room)switchRoom(room.id);render();return;}
    if(input.matches('[data-room-level]')){
      const level=Number(input.value);if(activeRoom==='main'||!input.value.trim()||!Number.isInteger(level)||level < -15 || level > 15){status('Choose a whole-number floor between −15 and 15.',true);render();return;}
      checkpoint();layout.level=level;snapshot();
      // Moving a room changes both ends of each connection in the same undo step.
      for(const room of buildingRooms(building))for(const link of room.layout.links ?? []){
        const other=buildingRooms(building).find(r=>r.id===link.targetRoom);
        if(other && (other.layout.level ?? 0)!==(room.layout.level ?? 0))link.kind='stairs';else delete link.kind;
      }
      status('Room moved. Connections now use stairs between floors and doors on the same floor.');render();return;
    }
    if(input.matches('[data-room-picker]')){switchRoom(input.value);render();return;}
    if(input.matches('[data-room-name]')){const room=building.rooms?.find(r=>r.id===activeRoom);if(room && input.value.trim()){checkpoint();room.name=input.value.trim();render();}return;}
    if(input.matches('[data-room-target]')){const target=buildingRooms(building).find(r=>r.id===input.value);tool=(target?.layout.level ?? 0)===(layout.level ?? 0)?'link':'stairs';render();return;}
    if(input.dataset.corner!==undefined){
      if(selected?.group!=='floors'||busy)return;const value=Number(input.value);if(!Number.isFinite(value))return;
      checkpoint();(current() as RoomFloorShape).points[Number(input.dataset.corner)][Number(input.dataset.axis)]=value;render();
    }else if(input.dataset.property){const item=current();if(!item||busy)return;const value=Number(input.value);if(!Number.isFinite(value))return;checkpoint();const key=input.dataset.property;if(selected?.group==='furniture' && (key==='x'||key==='y'))for(const game of layout.games.filter(g=>g.furnitureId===item.id))game[key]+=value-(item as RoomPlacement)[key];Object.assign(selected?.group==='portals'?layout[selected.id==='entrance'?'spawn':'exit']!:item,{[key]:value});render();}
    else if(input.dataset.library){tool=input.dataset.library as Tool;render();}else draw();
  });
  const keys=(event:KeyboardEvent)=>{
    // Capture before the map's keyboard listeners so room edits never move/delete a building.
    event.stopImmediatePropagation();
    if((event.target as HTMLElement).matches('input,select,textarea'))return;
    if(event.key==='Escape'){event.preventDefault();cancel();}
    if(event.key==='Delete'||event.key==='Backspace'){event.preventDefault();remove();}
    if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='z'){event.preventDefault();history(!event.shiftKey);}
  };
  const refreshCopy=()=>{clipboard=readRoomCopy();if(!busy)render();};
  window.addEventListener('storage',refreshCopy);
  window.addEventListener('keydown',keys,true);
  render();canvas.focus();
  const image=async(key:string,url:string)=>{const img=new Image();img.src=worldAssetUrl(url);await img.decode();if(!dead)images.set(key,img);};
  void (async()=>{
    const json=async<T>(url:string):Promise<T>=>{const r=await fetch(worldAssetUrl(url));if(!r.ok)throw new Error('Could not load room artwork.');return r.json() as Promise<T>;};
    try{
      [animations,stills]=await Promise.all([json<SceneryAnimationManifest>('/assets/interior-animations.json'),json<SceneryAnimationManifest>('/assets/interior-stills.json')]);
      const keys=new Set([...Object.values(animations.assets),...Object.values(stills.assets)].map(a=>a.key));
      const results=await Promise.allSettled([...roomMaterials.map(id=>image(id,terrainMaterial(id)!.asset)),image('room-kit-furniture','/assets/room-kit-furniture.webp'),...Array.from(keys).map(async key=>{const [,atlas]=await Promise.all([image(key,`/assets/${key}.webp`),json<Atlas>(`/assets/${key}.json`)]);atlases.set(key,atlas);})]);
      if(results.some(r=>r.status==='rejected'))status('Some artwork could not load. Component positions are still editable.',true);
      if(!dead){dialog.dataset.artReady='true';draw();}
    }catch(error){if(!dead)status((error as Error).message,true);}
  })();
  return {destroy};
}
