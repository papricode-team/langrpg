import {roomGameIds} from './room-game-catalogue';
import {miniGameDefinitions} from './minigames/catalogue';
import {afterEach, describe, expect, it} from 'vitest';
import {applyRoomLayout, completeRoomLayout, createRoomLayout} from './room-layout-runtime';
import {parseRoomLayout, roomLayoutFingerprint, roomWallSegments, roomRectangle} from './room-layout';
import {roomLayoutProblems} from './room-layout-validation';
import {getInterior, getInteriorObject, type InteriorSpec} from './interiors';
import {NavigationGrid, PLAYER_RADIUS} from './navigation';
import {applyEditOps, editOpTargets, inverseEditOps, parseEditOps, type WorldEditOp} from './world-edit-ops';
import {replacePublishedWorld, sceneDocument, sceneContentVersion} from './scene-data';
import {parseWorldSceneDocument, type WorldSceneDocument} from './scene-schema';
import {plainGround} from './ground';
import {roomKit} from './room-kit';

const template:InteriorSpec={...getInterior('home'),floorAreas:[roomRectangle(160,300,1216,580)],props:[],objects:[],npcs:[]};
const playable=()=>({...createRoomLayout(template),games:[{id:'test-game',game:'re-ink',x:1100,y:400}]});
const town=():WorldSceneDocument=>({version:4,maps:{test:{id:'test',width:1536,height:1024,coordinateVersion:1,spawn:{x:768,y:800},npcs:[],objects:[],districts:[],ground:plainGround('meadow',1536,1024),scenery:[
  {id:'west-house',asset:'house',x:400,y:500,width:180},{id:'east-house',asset:'house',x:1000,y:500,width:180},
]}}});
const savedDocument=sceneDocument,savedVersion=sceneContentVersion;
afterEach(()=>replacePublishedWorld(savedDocument,savedVersion));

describe('building room layouts',()=>{
  it('persists a custom floor and travel points through parsing, runtime resolution, and undo',()=>{
    const doc=town(),layout=createRoomLayout(getInterior('home'));
    layout.floors=[{id:'custom-floor',points:[[120,260],[1400,260],[1400,900],[900,900],[900,820],[120,820]]}];
    layout.spawn={x:700,y:750};layout.exit={x:1300,y:820};
    const op:WorldEditOp={kind:'room',map:'test',id:'west-house',layout,expected:roomLayoutFingerprint(null)};
    const next=applyEditOps(doc,parseEditOps([op])).document;
    replacePublishedWorld(parseWorldSceneDocument(JSON.parse(JSON.stringify(next))),'custom-shell');
    const room=getInterior('home--west-house','test');
    expect(room.floorAreas).toEqual(layout.floors.map(f=>f.points));
    expect(room.spawn).toEqual({x:700/1536,y:750/1024});expect(room.exit).toEqual({x:1300/1536,y:820/1024});
    expect(getInterior('home--east-house','test').floorAreas).not.toEqual(room.floorAreas);
    expect(applyEditOps(next,inverseEditOps(doc,op)).document).toEqual(doc);
    const nav=new NavigationGrid(room.floorAreas,[],room,{agentRadius:PLAYER_RADIUS});
    expect(nav.isWalkable(200,850)).toBe(false);expect(nav.isWalkable(1000,850)).toBe(true);
  });
  it('keeps old saved layouts valid and upgrades their shell only in the draft',()=>{
    const base=getInterior('cafe'),layout=createRoomLayout(base);
    delete layout.floors;delete layout.spawn;delete layout.exit;
    const before=roomLayoutFingerprint(layout);
    expect(parseRoomLayout(layout)).toEqual(layout);
    expect(applyRoomLayout(base,layout).floorAreas).toEqual(base.floorAreas);
    expect(applyRoomLayout(base,layout).exit).toEqual(base.exit);
    expect(roomLayoutProblems(base,layout)).toEqual([]);
    const draft=completeRoomLayout(base,layout);
    expect(draft.floors).toHaveLength(base.floorAreas.length);
    expect(roomLayoutProblems(base,draft)).toEqual([]);
    expect(roomLayoutFingerprint(layout)).toBe(before);
  });
  it('refuses empty, crossed, repeated, degenerate and out-of-bounds floor polygons',()=>{
    const layout=playable();
    for(const points of [[],[[0,0],[100,100],[0,100],[100,0]],[[0,0],[100,0],[100,0],[0,100]],[[0,0],[10,0],[20,0]],[[-1,300],[500,300],[500,700]]]) {
      expect(()=>parseRoomLayout({...layout,floors:[{id:'bad-floor',points}]})).toThrow('Room layout');
    }
    expect(()=>parseRoomLayout({...layout,floors:[]})).toThrow('floor shapes');
    expect(()=>parseRoomLayout({...layout,spawn:{x:Infinity,y:500}})).toThrow('entrance');
    expect(()=>parseRoomLayout({...layout,exit:{x:500,y:-1}})).toThrow('exit');
  });
  it('requires custom travel points on clear connected floor, including the player footprint',()=>{
    const layout=playable();
    expect(roomLayoutProblems(template,{...layout,spawn:{x:50,y:50}})[0]).toContain('arrival');
    expect(roomLayoutProblems(template,{...layout,exit:{x:160,y:500}})[0]).toContain('exit');
    const disconnected={...layout,floors:[{id:'left',points:roomRectangle(160,300,600,580)},{id:'right',points:roomRectangle(900,300,450,580)}],spawn:{x:500,y:750},exit:{x:1000,y:750}};
    expect(roomLayoutProblems(template,disconnected)[0]).toContain('Exit');
    disconnected.floors.push({id:'bridge',points:roomRectangle(700,700,260,120)});
    expect(roomLayoutProblems(template,disconnected)).toEqual([]);
  });
  it('moves the outer walls with custom floor corners and opens a gap near a moved exit',()=>{
    const layout=playable();layout.floors=[{id:'floor',points:roomRectangle(200,250,1000,650)}];layout.spawn={x:500,y:800};layout.exit={x:800,y:875};
    const kit=roomKit(applyRoomLayout(template,layout));
    expect(kit.floors[0].polygon).toEqual(layout.floors[0].points);
    const front=kit.walls.filter(w=>w.from[1]===900&&w.to[1]===900);
    expect(front).toHaveLength(2);
    expect(front.every(w=>Math.max(w.from[0],w.to[0])<=745||Math.min(w.from[0],w.to[0])>=855)).toBe(true);
  });
  it('fingerprints upgraded layouts consistently after server field canonicalization',()=>{
    const base=getInterior('home'),original=createRoomLayout(base);
    delete original.floors;delete original.spawn;delete original.exit;
    const layout=completeRoomLayout(base,original),canonical=parseRoomLayout(layout);
    expect(roomLayoutFingerprint(layout)).toBe(roomLayoutFingerprint(canonical));
    const doc=town();doc.maps.test.scenery[0].roomLayout=original;
    const op:WorldEditOp={kind:'room',map:'test',id:'west-house',layout,expected:roomLayoutFingerprint(original)};
    const undo=inverseEditOps(doc,op),next=applyEditOps(doc,parseEditOps([op])).document;
    expect(applyEditOps(next,parseEditOps(undo)).document).toEqual(doc);
  });
  it('offers only registered games without needing authenticated metadata',()=>{
    expect([...roomGameIds].sort()).toEqual(miniGameDefinitions.map(game=>game.id).sort());
  });
  it('cuts horizontal and vertical doors out of the actual collision geometry',()=>{
    for(const vertical of [false,true]){
      const layout=playable();layout.walls=[vertical?{id:'partition',x:800,y:300,width:24,height:580}:{id:'partition',x:160,y:600,width:1216,height:24}];
      const start=vertical?{x:700,y:750}:{x:768,y:750},end=vertical?{x:1000,y:750}:{x:768,y:500};
      const grid=()=>new NavigationGrid(template.floorAreas,roomWallSegments(layout).map(w=>roomRectangle(w.x,w.y,w.width,w.height)),template,{agentRadius:PLAYER_RADIUS});
      expect(grid().findPath(start,end)).toEqual([]);
      layout.doors=[{id:'opening',wallId:'partition',offset:vertical?400:550,width:120}];
      expect(grid().findPath(start,end).length).toBeGreaterThan(0);
      expect(roomWallSegments(layout)).toHaveLength(2);
      expect(roomKit(applyRoomLayout(template,layout)).walls.length).toBeGreaterThan(4);
    }
  });
  it('rejects unknown games, overlapping doors, missing walls, nonfinite positions and duplicate IDs',()=>{
    const layout=playable();
    expect(()=>parseRoomLayout({...layout,games:[{...layout.games[0],game:'unknown'}]})).toThrow('game');
    expect(()=>parseRoomLayout({...layout,games:[{...layout.games[0],x:NaN}]})).toThrow('inside');
    expect(()=>parseRoomLayout({...layout,games:[layout.games[0],layout.games[0]]})).toThrow('unique');
    expect(()=>parseRoomLayout({...layout,doors:[{id:'door',wallId:'absent',offset:0,width:96}]})).toThrow('on its wall');
    layout.walls=[{id:'wall',x:300,y:400,width:400,height:24}];layout.doors=[{id:'a',wallId:'wall',offset:40,width:100},{id:'b',wallId:'wall',offset:100,width:100}];
    expect(()=>parseRoomLayout(layout)).toThrow('overlap');
  });
  it('keeps learning text out of saved placements',()=>{
    const layout=playable();const parsed=parseRoomLayout({...layout,answers:['secret'],games:[{...layout.games[0],dialogue:'secret',answers:['secret']}]});
    expect(JSON.stringify(parsed)).not.toContain('secret');
  });
  it('refuses blocked arrivals, inaccessible games and empty rooms',()=>{
    const layout=playable();expect(roomLayoutProblems(template,layout)).toEqual([]);
    layout.walls=[{id:'wall',x:160,y:600,width:1216,height:24}];expect(roomLayoutProblems(template,layout)[0]).toContain('walking route');
    layout.doors=[{id:'door',wallId:'wall',offset:550,width:120}];expect(roomLayoutProblems(template,layout)).toEqual([]);
    layout.furniture.push({id:'bed',source:'bed',x:768,y:850,width:300});expect(roomLayoutProblems(template,layout)[0]).toContain('arrival');
    expect(roomLayoutProblems(template,{...playable(),games:[]})).toContain('Place at least one game or story station.');
  });
  it('preserves authored stories and NPCs and scales furniture collisions with its size',()=>{
    const source=getInterior('inn'),layout=createRoomLayout(source),f=layout.furniture[0];
    const original=source.props[0];f.x+=100;f.width*=1.5;
    const applied=applyRoomLayout(source,layout).props[0];expect(applied.x).toBe(original.x+100);expect(applied.collision?.width).toBeCloseTo(original.collision!.width*1.5);
    expect(()=>applyRoomLayout(source,{...layout,encounters:[]})).toThrow('story');
    expect(()=>applyRoomLayout(source,{...layout,npcs:[]})).toThrow('characters');
  });
  it('stores a layout only on its building, rejects stale overwrites and undoes it exactly',()=>{
    const doc=town(),layout=createRoomLayout(getInterior('home'));
    const op:WorldEditOp={kind:'room',map:'test',id:'west-house',layout,expected:roomLayoutFingerprint(null)};
    const undo=inverseEditOps(doc,op),next=applyEditOps(doc,parseEditOps([op])).document;
    expect(editOpTargets(op)).toEqual(['west-house']);
    expect(next.maps.test.scenery[0].roomLayout).toEqual(layout);expect(next.maps.test.scenery[1].roomLayout).toBeUndefined();
    expect(doc.maps.test.scenery[0].roomLayout).toBeUndefined();
    expect(()=>applyEditOps(next,[op])).toThrow('changed while');
    expect(applyEditOps(next,undo).document).toEqual(doc);
    expect(parseWorldSceneDocument(JSON.parse(JSON.stringify(next)))).toEqual(next);
    replacePublishedWorld(next,'room-test');
    expect(getInterior('home--west-house','test').layout).toEqual(layout);expect(getInterior('home--east-house','test').layout).toBeUndefined();
  });
  it('resolves a newly placed game from the active building only',()=>{
    const doc=town(),layout=createRoomLayout(getInterior('home'));layout.games.push({id:'new-game',game:'echo-bells',x:700,y:400});
    doc.maps.test.scenery[0].roomLayout=layout;replacePublishedWorld(doc,'game-test');
    expect(getInteriorObject('interior:placed:new-game','home--west-house','test')).toMatchObject({minigame:'echo-bells',gameOnly:true});
    expect(getInteriorObject('interior:placed:new-game','home--east-house','test')).toBeUndefined();
  });
  it('rejects layouts on nonbuildings and layouts for another template',()=>{
    const doc=town(),layout=createRoomLayout(getInterior('library'));
    expect(()=>applyEditOps(doc,[{kind:'room',map:'test',id:'west-house',layout,expected:roomLayoutFingerprint(null)}])).toThrow('template changed');
    doc.maps.test.scenery[0].asset='tree';
    expect(()=>applyEditOps(doc,[{kind:'room',map:'test',id:'west-house',layout,expected:roomLayoutFingerprint(null)}])).toThrow('building');
  });
});

describe('connected building rooms',()=>{
  const connected=()=>{
    const main=createRoomLayout(getInterior('home')), child=playable();
    main.links=[{id:'to-study',x:700,y:750,targetRoom:'study',targetDoor:'to-main'}];
    child.links=[{id:'to-main',x:500,y:750,targetRoom:'main',targetDoor:'to-study'}];
    child.spawn={x:600,y:750};child.exit={x:600,y:800};
    main.rooms=[{id:'study',name:'Study',layout:child}];
    return main;
  };
  it('persists separate layouts, games and door endpoints within one building and undoes the whole edit',()=>{
    const layout=connected(),doc=town();
    expect(roomLayoutProblems(getInterior('home'),layout)).toEqual([]);
    const op:WorldEditOp={kind:'room',map:'test',id:'west-house',layout,expected:roomLayoutFingerprint(null)};
    const next=parseWorldSceneDocument(JSON.parse(JSON.stringify(applyEditOps(doc,parseEditOps([op])).document)));
    replacePublishedWorld(next,'connected-rooms');
    const child=getInterior('home--west-house::study','test');
    expect(child.name).toBe('Study');
    expect(child.layout).toEqual(layout.rooms![0].layout);
    expect(child.objects.map(o=>o.id)).toEqual(['interior:placed:test-game']);
    expect(child.floorAreas).toEqual(layout.rooms![0].layout.floors!.map(f=>f.points));
    expect(child.npcs).toEqual([]);
    expect(getInterior('home--west-house','test').objects).not.toEqual(child.objects);
    expect(()=>getInterior('home--east-house::study','test')).toThrow('Unknown room');
    expect(applyEditOps(next,inverseEditOps(doc,op)).document).toEqual(doc);
  });
  it('rejects dangling, one-way, self, duplicate and disconnected room connections',()=>{
    const layout=connected();
    const bad=structuredClone(layout);bad.rooms![0].layout.links=[];
    expect(()=>parseRoomLayout(bad)).toThrow('matching door');
    expect(()=>parseRoomLayout({...layout,links:[{...layout.links![0],targetRoom:'missing'}]})).toThrow('matching door');
    expect(()=>parseRoomLayout({...layout,links:[{...layout.links![0],targetRoom:'main'}]})).toThrow('matching door');
    expect(()=>parseRoomLayout({...layout,rooms:[...layout.rooms!,layout.rooms![0]]})).toThrow('unique ID');
    const disconnected=structuredClone(layout);disconnected.links=[];disconnected.rooms![0].layout.links=[];
    expect(()=>parseRoomLayout(disconnected)).toThrow('connect every room');
    const nested=structuredClone(layout);nested.rooms![0].layout.rooms=[];
    expect(()=>parseRoomLayout(nested)).toThrow('nested');
  });
  it('validates both ends of every door and permits a connected hallway without a game',()=>{
    const layout=connected();layout.rooms![0].layout.games=[];
    expect(roomLayoutProblems(getInterior('home'),layout)).toEqual([]);
    layout.rooms![0].layout.links![0].x=0;
    expect(roomLayoutProblems(getInterior('home'),layout)[0]).toContain('Study: Room doors');
  });
  it('strips private content from nested rooms and keeps fingerprints stable through parsing',()=>{
    const layout=connected();
    const parsed=parseRoomLayout({...layout,rooms:layout.rooms!.map(r=>({...r,answers:['secret'],layout:{...r.layout,answers:['secret']}}))});
    expect(JSON.stringify(parsed)).not.toContain('secret');
    expect(roomLayoutFingerprint(parsed)).toBe(roomLayoutFingerprint(layout));
  });
});

describe('building floors and stair landings',()=>{
  const multilevel=()=>{
    const main=createRoomLayout(getInterior('home')),up=playable(),down=playable();
    up.level=1;down.level=-1;
    main.rooms=[{id:'up',name:'Study',layout:up},{id:'down',name:'Cellar',layout:down}];
    main.links=[{id:'upstairs',kind:'stairs' as const,x:600,y:750,targetRoom:'up',targetDoor:'landing'},
      {id:'downstairs',kind:'stairs' as const,x:1000,y:750,targetRoom:'down',targetDoor:'landing'}];
    up.links=[{id:'landing',kind:'stairs' as const,x:500,y:750,targetRoom:'main',targetDoor:'upstairs'}];
    down.links=[{id:'landing',kind:'stairs' as const,x:900,y:750,targetRoom:'main',targetDoor:'downstairs'}];
    return main;
  };
  it('saves upstairs and basement layouts, resolves stair directions, and undoes the whole building',()=>{
    const layout=multilevel(),doc=town();expect(roomLayoutProblems(getInterior('home'),layout)).toEqual([]);
    const op:WorldEditOp={kind:'room',map:'test',id:'west-house',layout,expected:roomLayoutFingerprint(null)};
    const next=applyEditOps(doc,parseEditOps([op])).document;
    replacePublishedWorld(parseWorldSceneDocument(JSON.parse(JSON.stringify(next))),'stairs');
    expect(getInterior('home--west-house','test').stairDirections).toEqual({upstairs:'up',downstairs:'down'});
    expect(getInterior('home--west-house::up','test')).toMatchObject({name:'Study · Floor 1',layout:{level:1},stairDirections:{landing:'down'}});
    expect(getInterior('home--west-house::down','test')).toMatchObject({name:'Cellar · Basement 1',layout:{level:-1},stairDirections:{landing:'up'}});
    expect(getInterior('home--east-house','test').layout).toBeUndefined();
    expect(applyEditOps(next,inverseEditOps(doc,op)).document).toEqual(doc);
    expect(roomLayoutFingerprint(parseRoomLayout(layout))).toBe(roomLayoutFingerprint(layout));
  });
  it('requires paired stairs across floors and ordinary doors on the same floor',()=>{
    for(const level of [NaN,Infinity,1.5,-16,16]){const layout=multilevel();layout.rooms![0].layout.level=level;expect(()=>parseRoomLayout(layout)).toThrow('whole-number');}
    expect(()=>parseRoomLayout({...multilevel(),level:1})).toThrow('ground floor');
    const door=multilevel();delete door.links![0].kind;delete door.rooms![0].layout.links![0].kind;
    expect(()=>parseRoomLayout(door)).toThrow('use stairs between different floors');
    const same=multilevel();same.rooms![0].layout.level=0;expect(()=>parseRoomLayout(same)).toThrow('doors between rooms on the same floor');
    const mismatched=multilevel();delete mismatched.links![0].kind;expect(()=>parseRoomLayout(mismatched)).toThrow('same door or stairs type');
    const invalid=multilevel();(invalid.links![0] as {kind:string}).kind='lift';expect(()=>parseRoomLayout(invalid)).toThrow('choose a door or stairs');
  });
  it('rejects blocked stair landings and keeps old layouts unchanged',()=>{
    const layout=multilevel();layout.rooms![0].layout.links![0].x=0;
    expect(roomLayoutProblems(getInterior('home'),layout)[0]).toContain('Study: Stair landings');
    const legacy=createRoomLayout(getInterior('home'));
    expect(parseRoomLayout(legacy)).toEqual(legacy);expect(parseRoomLayout(legacy).level).toBeUndefined();
  });
  it('keeps stairs inside the floor instead of cutting an exterior doorway',()=>{
    const layout=multilevel();layout.links![0].x=1200;layout.links![0].y=875;
    layout.floors=[{id:'floor',points:roomRectangle(160,300,1216,600)}];
    const room=applyRoomLayout(getInterior('home'),layout);
    const front=roomKit(room).walls.filter(w=>w.from[1]===900 && w.to[1]===900);
    expect(front.some(w=>Math.min(w.from[0],w.to[0])<=1200 && Math.max(w.from[0],w.to[0])>=1200)).toBe(true);
  });
});
