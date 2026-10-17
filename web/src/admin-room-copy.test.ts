import {describe,expect,it} from 'vitest';
import {copyRoomLayout,parseRoomLayoutCopy,pasteRoomLayout,nextCopyFloor} from './admin-room-copy';
import {additionalRoomTemplate,applyRoomLayout,createRoomLayout} from './room-layout-runtime';
import {buildingRooms,parseRoomLayout,roomLayoutFingerprint,type RoomLayout} from './room-layout';
import {roomLayoutProblems} from './room-layout-validation';
import {getInterior} from './interiors';
import {roomKinds} from './room-kind';

const point=(layout:RoomLayout)=>({...layout.spawn!});
const home=()=>createRoomLayout(getInterior('home'));
function connected() {
  const main=home(),blank=()=>createRoomLayout(additionalRoomTemplate(getInterior('home')));
  const a=blank(),b=blank(),cellar=blank();a.level=1;b.level=1;cellar.level=-1;
  main.rooms=[{id:'a',name:'Study',layout:a},{id:'b',name:'Bedroom',layout:b},{id:'cellar',name:'Cellar',layout:cellar}];
  const pair=(from:RoomLayout,fromId:string,to:RoomLayout,toId:string,tag:string)=>{
    const kind=(from.level ?? 0)!==(to.level ?? 0)?{kind:'stairs' as const}:{};
    (from.links ??= []).push({id:tag+'-out',...point(from),targetRoom:toId,targetDoor:tag+'-in',...kind});
    (to.links ??= []).push({id:tag+'-in',...point(to),targetRoom:fromId,targetDoor:tag+'-out',...kind});
  };
  pair(main,'main',a,'a','upper');pair(a,'a',b,'b','bedroom');pair(main,'main',cellar,'cellar','lower');
  a.walls=[{id:'wall',x:200,y:300,width:300,height:24}];a.doors=[{id:'opening',wallId:'wall',width:96,offset:100}];
  return main;
}

describe('independent room and floor copies',()=>{
  it.each(roomKinds)('copies %s furniture and public games into another building without source story data',kind=>{
    const template=getInterior(kind),source=createRoomLayout(template),before=structuredClone(source);
    const copy=copyRoomLayout(template,source,'main','room','Source');
    const targetTemplate=getInterior(kind==='home'?'library':'home'),target=createRoomLayout(targetTemplate);
    const pasted=pasteRoomLayout(target,copy,'main',point),room=pasted.building.rooms![0].layout;
    expect(roomLayoutProblems(targetTemplate,pasted.building)).toEqual([]);
    expect(room.kind).toBe(target.kind);expect(room.encounters).toEqual([]);expect(room.npcs).toEqual([]);
    expect(room.furniture.every(f=>!f.source.startsWith('original:'))).toBe(true);
    expect(room.games.map(g=>g.game)).toEqual(template.objects.filter(o=>o.minigame).map(o=>o.minigame));
    const original=applyRoomLayout(template,source),applied=applyRoomLayout(additionalRoomTemplate(targetTemplate),room);
    expect(applied.props.filter(p=>room.furniture.some(f=>f.id===p.id)).map(p=>[p.asset,p.x,p.y,p.width,p.collision])).toEqual(original.props.map(p=>[p.asset,p.x,p.y,p.width,p.collision]));
    expect(applied.props.length).toBe(original.props.length+room.games.filter(g=>!g.furnitureId).length);
    expect(applied.objects.every(o=>o.gameOnly && !o.prompt && !o.description && !o.exerciseIds.length)).toBe(true);
    room.floors![0].points[0][0]+=10;room.furniture[0].x+=50;
    expect(source).toEqual(before);expect(target.rooms).toBeUndefined();
    expect(copy.rooms[0].layout.furniture[0].x).toBe(before.furniture[0].x);
  });
  it('remaps every identity, partition opening and internal door while dropping external stairs',()=>{
    const source=connected(),before=structuredClone(source),copy=copyRoomLayout(getInterior('home'),source,'a','floor','Upper floor');
    expect(copy.rooms).toHaveLength(2);
    expect(copy.rooms[0].layout.links).toHaveLength(1);
    const pasted=pasteRoomLayout(source,copy,'main',point),added=pasted.building.rooms!.slice(3),[a,b]=added;
    expect(added.map(r=>r.layout.level)).toEqual([2,2]);
    expect(a.layout.links!.find(l=>l.kind!=='stairs')!.targetRoom).toBe(b.id);
    expect(b.layout.links![0].targetRoom).toBe(a.id);
    expect(a.layout.doors[0].wallId).toBe(a.layout.walls[0].id);
    expect(a.layout.doors[0].wallId).not.toBe('wall');
    expect(a.layout.links!.find(l=>l.kind==='stairs')!.targetRoom).toBe('main');
    expect(roomLayoutProblems(getInterior('home'),pasted.building)).toEqual([]);
    const allIds=added.flatMap(r=>[r.id,...[r.layout.floors!,r.layout.links!,r.layout.walls,r.layout.doors].flat().map(c=>c.id)]);
    expect(new Set(allIds).size).toBe(allIds.length);expect(source).toEqual(before);
    const again=pasteRoomLayout(pasted.building,copy,'main',point);
    expect(again.building.rooms!.slice(5).map(r=>r.name)).toEqual(['Study copy 2','Bedroom copy 2']);
  });
  it('reconnects disconnected parts of a floor whose original route crossed a different floor',()=>{
    const source=connected(),a=source.rooms![0].layout,b=source.rooms![1].layout;
    a.links=a.links!.filter(l=>l.targetRoom!=='b');
    b.links![0]={id:'b-main',...point(b),kind:'stairs',targetRoom:'main',targetDoor:'main-b'};
    source.links!.push({id:'main-b',...point(source),kind:'stairs',targetRoom:'b',targetDoor:'b-main'});
    const copy=copyRoomLayout(getInterior('home'),source,'a','floor','Split floor');
    const next=pasteRoomLayout(source,copy,'main',point).building;
    expect(next.rooms!.slice(3).every(r=>r.layout.links!.some(l=>l.targetRoom==='main'))).toBe(true);
    expect(()=>parseRoomLayout(next)).not.toThrow();
  });
  it('copies a main floor without nesting the building and copies rooms on the selected destination floor',()=>{
    const source=connected(),copy=copyRoomLayout(getInterior('home'),source,'main','floor','Ground floor');
    expect(copy.rooms).toHaveLength(1);expect(copy.rooms[0].layout.rooms).toBeUndefined();
    copy.scope='room';const result=pasteRoomLayout(source,copy,'cellar',point);
    const room=result.building.rooms!.at(-1)!;
    expect(room.layout.level).toBe(-1);expect(room.layout.links![0].kind).toBeUndefined();
    expect(room.layout.games.every(g=>room.layout.furniture.some(f=>f.id===g.furnitureId))).toBe(true);
    const roundtrip=parseRoomLayout(JSON.parse(JSON.stringify(result.building)));
    expect(roomLayoutFingerprint(roundtrip)).toBe(roomLayoutFingerprint(result.building));
  });
  it('rejects bad or oversized copies atomically and strips unexpected private fields',()=>{
    const source=home(),copy=copyRoomLayout(getInterior('home'),source,'main','room','Home'),before=structuredClone(source);
    const bad=structuredClone(copy);bad.rooms[0].layout.links=[{id:'bad',x:600,y:750,targetRoom:'missing',targetDoor:'gone'}];
    expect(()=>pasteRoomLayout(source,bad,'main',point)).toThrow('invalid');
    bad.rooms[0].layout.links=[];bad.rooms[0].layout.furniture[0].source='original:missing';
    expect(()=>parseRoomLayoutCopy(bad)).toThrow('invalid');
    const full=home();full.rooms=Array.from({length:15},(_,i)=>({id:`r${i}`,name:'Room',layout:home()}));
    expect(()=>pasteRoomLayout(full,copy,'main',point)).toThrow('16 rooms');
    const dirty={...copy,answers:['secret'],rooms:copy.rooms.map(r=>({...r,layout:{...r.layout,furniture:r.layout.furniture.map(f=>({...f,footprint:f.footprint?{...f.footprint,answers:['secret']}:f.footprint})),answers:['secret']}}))};
    expect(JSON.stringify(parseRoomLayoutCopy(dirty))).not.toContain('secret');expect(source).toEqual(before);
  });
  it('validates attached games and portable footprints and scales a copied footprint',()=>{
    const source=home(),copy=copyRoomLayout(getInterior('home'),source,'main','room','Home'),layout=copy.rooms[0].layout;
    const furniture=layout.furniture[0],template=additionalRoomTemplate(getInterior('home'));
    const before=applyRoomLayout(template,layout).props[0];furniture.width*=2;
    expect(applyRoomLayout(template,layout).props[0].collision!.width).toBeCloseTo(before.collision!.width*2);
    expect(()=>parseRoomLayout({...layout,games:[{...layout.games[0],furnitureId:'missing'}]},true)).toThrow('existing furniture');
    expect(()=>parseRoomLayout({...layout,furniture:[{...furniture,footprint:{...furniture.footprint,referenceWidth:0}}]},true)).toThrow('collision footprint');
    expect(()=>parseRoomLayout({...layout,games:[layout.games[0],{...layout.games[0],id:'second'}]},true)).toThrow('existing furniture');
  });
  it('finds a spare floor at the upper boundary',()=>{
    const building=connected();building.rooms![0].layout.level=15;
    expect(nextCopyFloor(building)).toBe(2);
  });
  it('preserves an interaction near the top edge of a custom floor',()=>{
    const template=getInterior('home'),source=home();source.encounters[0].y=32;
    const copy=copyRoomLayout(template,source,'main','room','Top edge');
    const room=pasteRoomLayout(home(),copy,'main',point).building.rooms![0].layout;
    expect(room.games[0]).toMatchObject({y:0,approachOffsetY:32});
    expect(applyRoomLayout(additionalRoomTemplate(template),room).objects[0].y*template.height).toBe(32);
    expect(()=>parseRoomLayout({...room,games:[{...room.games[0],approachOffsetY:-1}]},true)).toThrow('approach offsets');
  });
});
