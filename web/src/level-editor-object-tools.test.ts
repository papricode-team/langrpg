import {describe,expect,it} from 'vitest';
import {copyScenery,pasteScenery,checkClipboard,paletteTemplates,canonSceneryWidth,StrokeSampler,ObjectPaintStroke,type BrushSettings} from './level-editor-object-tools';
import {LevelEditorHistory,editScenery,removeScenery} from './level-editor-model';
import {stampPrefab,previewPrefabUpdate,sceneInstanceIds} from './level-editor-prefabs';
import {emptyEditorView} from './level-editor-selection';
import {sceneryFootprints} from './placed-scenery';
import {buildingBounds} from './building-spacing';
import {polygonsIntersect} from './level-editor-generation';
import {sceneNavigationGeometry} from './scene-navigation';
import {NavigationGrid} from './navigation';
import {getSceneryGeometryMap,type SceneScenery,type ScenePrefab,type WorldScene} from './scene-schema';

const scene=(id='source'):WorldScene=>({id,coordinateVersion:1,width:1000,height:800,spawn:{x:50,y:50},npcs:[],objects:[],walkable:[[[14,14],[140,14],[140,780],[14,780]]],obstacles:[],scenery:[],terrain:[{id:'floor',x:0,y:0,width:1000,height:800,dayAsset:'/assets/floor.webp'}],districts:[]});
const prefab:ScenePrefab={id:'reading',name:'Reading corner',revision:1,scenery:[{id:'bench',asset:'bench',x:0,y:0,width:64},{id:'lamp',asset:'lamp',x:65,y:-12,width:32}],activities:[{id:'seat',ownerId:'bench',kind:'seat',offsetX:0,offsetY:16}]};
const settings:BrushSettings={spacing:70,variation:10,clearance:12,protectPaths:true,radius:4,seed:42,snap:0};
const bounds=(item:SceneScenery)=>({x:item.x-10,y:item.y-40,width:20,height:40});
const template={asset:'tree' as const,frame:'tree',width:60,motion:'tree' as const,thumbnail:'editor-only-thumbnail'};

describe('clipboard and painting tools',()=>{
  it('offers registered but unused artwork with supported roles and useful default sizes',()=>{
    const source=scene();source.scenery=[{id:'variant',asset:'planter',frame:'garden-1',variant:true,x:200,y:200,width:45}];
    const palette=paletteTemplates(source,[{frame:'planter',variant:false},{frame:'garden-1',variant:true},{frame:'lamp',variant:false},{frame:'unknown',variant:false}]);
    expect(palette).toHaveLength(3);expect(palette[0]).toMatchObject({asset:'planter',width:40,variant:false});expect(palette[2]).toMatchObject({asset:'lamp',motion:'lamp',width:34});
  });
  it('authors unused native storefronts at their own aspect ratio without borrowing another house width',()=>{
    const source=scene();source.scenery=[{id:'old-house',asset:'house',frame:'house-1',x:200,y:200,width:350}];
    const palette=paletteTemplates(source,[{frame:'house-bakery',variant:false,referenceWidth:1247,height:1162},
      {frame:'house-grocery',variant:false,referenceWidth:1242,height:1037},
      {frame:'house-1',variant:false,referenceWidth:1200,height:1200}]);
    expect(palette).toHaveLength(3);expect(palette[2].width).toBe(350);
    expect(palette[0].width*1162/1247).toBeCloseTo(201.6,1);
    expect(palette[1].width*1037/1242).toBeCloseTo(201.6,1);
    expect(palette[0].width).not.toBe(palette[1].width);
  });
  it('excludes paintings too small for the minimum physical size and keeps borderline art inside both limits',()=>{
    const palette=paletteTemplates(scene(),[{frame:'house-tiny',variant:false,referenceWidth:200,height:300},
      {frame:'house-small',variant:false,referenceWidth:480,height:480},{frame:'tree',variant:false,referenceWidth:677,height:691}]);
    expect(palette.map(item=>item.frame)).toEqual(['house-small','tree']);
    expect(palette[0].width*480/480).toBeGreaterThanOrEqual(2.6*72);
    expect(480/palette[0].width).toBeGreaterThanOrEqual(2.5);
    expect(canonSceneryWidth('house',1000,NaN)).toBeUndefined();
  });
  it('keeps new door-bearing cottages large enough to enter while respecting the house height range',()=>{
    const palette=paletteTemplates(scene(),[{frame:'house-inn',variant:false,referenceWidth:1248,height:1163,doorHeight:440}]);
    expect(palette[0].width*440/1248).toBeGreaterThanOrEqual(1.1*72);
    expect(palette[0].width*1163/1248).toBeLessThanOrEqual(3*72);
    expect(canonSceneryWidth('house',1200,1200,200)).toBeUndefined();
  });
  it('pastes a snapshot across maps with independent IDs, activity owners and no duplicated doors or schedules',()=>{
    const source=scene();source.scenery=[{id:'bench',asset:'bench',x:200,y:300,width:64,groupId:'corner',depth:305,generatorId:'old-zone'},{id:'lamp',asset:'lamp',x:265,y:288,width:32,groupId:'corner'}];
    source.activities=[{id:'seat',ownerId:'bench',kind:'seat',offsetX:0,offsetY:16,capacity:2,places:[{x:-14,y:0},{x:14,y:0}]}];
    source.entrances=[{id:'door',ownerId:'lamp',interiorId:'inn',offsetX:0,offsetY:30}];
    const clip=copyScenery(source,new Set(['bench','lamp']));source.scenery[0].x=777;
    const target=scene('target');target.scenery=[{id:'target-bench-1',asset:'tree',x:50,y:600,width:60}];
    const result=pasteScenery(target,clip,{x:512,y:448},16),items=result.scene.scenery.filter(item=>result.ids.includes(item.id));
    expect(items[0]).toMatchObject({id:'target-bench-2',x:512,y:448,depth:453});
    expect(items[1].x-items[0].x).toBe(65);expect(items[1].y-items[0].y).toBe(-12);
    expect(items[0].generatorId).toBeUndefined();expect(items[0].groupId).toBe(items[1].groupId);
    expect(result.scene.activities![0]).toMatchObject({ownerId:items[0].id,places:[{x:-14,y:0},{x:14,y:0}]});
    expect(result.scene.entrances).toBeUndefined();expect(result.scene.residents).toBeUndefined();expect(target.scenery).toHaveLength(1);
    const second=pasteScenery(result.scene,clip,{x:800,y:600});expect(new Set(second.scene.scenery.map(item=>item.id)).size).toBe(5);
  });
  it('retains full prefab overrides and deleted-child records but detaches partial copies',()=>{
    const stamped=stampPrefab(scene(),prefab,{x:200,y:300});
    const partial=copyScenery(stamped.scene,new Set([stamped.ids[0]]));expect(partial.prefabInstances).toEqual([]);
    let edited=editScenery(stamped.scene,new Set([stamped.ids[0]]),{width:80});
    edited=removeScenery(edited,new Set([stamped.ids[1]]));edited.prefabInstances![0].locked=true;
    const clip=copyScenery(edited,new Set([stamped.ids[0]]));
    const result=pasteScenery(scene('target'),clip,{x:500,y:400}),instance=result.scene.prefabInstances![0];
    expect(instance.locked).toBeUndefined();expect(instance.members).toHaveLength(2);
    expect(sceneInstanceIds(result.scene).has(instance.members[1].id)).toBe(true);
    const revised={...prefab,revision:2,scenery:prefab.scenery.map(item=>({...item,width:100}))};
    const update=previewPrefabUpdate(result.scene,revised,instance.id);
    expect(update.scene.scenery.find(item=>item.id===result.ids[0])!.width).toBe(80);
    expect(update.scene.scenery.some(item=>item.id===instance.members[1].id)).toBe(false);
    expect(()=>checkClipboard(clip,[],[prefab])).toThrow(/matching artwork/);
    expect(()=>checkClipboard(clip,prefab.scenery,[])).toThrow(/no longer/);
    expect(()=>checkClipboard(clip,prefab.scenery,[prefab])).not.toThrow();
  });
  it('clamps pasted layouts rigidly and rejects layouts that cannot fit a smaller map',()=>{
    const source=scene();source.scenery=[{id:'a',asset:'tree',x:100,y:100,width:60},{id:'b',asset:'tree',x:800,y:200,width:60}];
    const clip=copyScenery(source,new Set(['a','b'])),result=pasteScenery(scene('target'),clip,{x:-1000,y:-1000});
    expect(result.scene.scenery[1].x-result.scene.scenery[0].x).toBe(700);
    expect(result.scene.scenery[0].x).toBe(-60);
    expect(()=>pasteScenery({...scene('small'),width:300},clip,{x:50,y:50})).toThrow(/too far apart/);
  });
  it('samples long, segmented and bent pointer movement consistently without unbounded work',()=>{
    const a=new StrokeSampler(20),b=new StrokeSampler(20);
    expect([...a.move({x:0,y:0}),...a.move({x:100,y:0})]).toEqual([0,7,13,48,100].flatMap(x=>b.move({x,y:0})));
    const bend=new StrokeSampler(20);expect(bend.move({x:0,y:0})).toEqual([{x:0,y:0}]);expect(bend.move({x:10,y:0})).toEqual([]);
    expect(bend.move({x:10,y:30})).toEqual([{x:10,y:10},{x:10,y:30}]);expect(bend.move({x:10,y:30})).toEqual([]);
    const bounded=new StrokeSampler(8);expect([...bounded.move({x:0,y:0}),...bounded.move({x:1000000,y:0})]).toHaveLength(300);expect(bounded.full).toBe(true);
  });
  it('paints a deterministic, editable stroke with spacing and path protection in one reversible command',()=>{
    const source=scene(),view=emptyEditorView();source.scenery=[{id:'existing',asset:'tree',x:470,y:600,width:60}];
    const a=new ObjectPaintStroke(source,'brush',template,settings,view,bounds),b=new ObjectPaintStroke(source,'brush',template,settings,view,bounds);
    for(const x of [50,820])a.move({x,y:600});for(const x of [50,120,300,410,700,820])b.move({x,y:600});
    expect(a.scene).toEqual(b.scene);expect(a.changedIds.size).toBeGreaterThan(4);expect(a.summary).toContain('paths');expect(a.summary).toContain('existing');
    for(const item of a.scene.scenery.filter(item=>a.changedIds.has(item.id))){expect(item.x).toBeGreaterThan(140);expect(item.width).toBeGreaterThanOrEqual(54);expect(item.width).toBeLessThanOrEqual(66);expect('thumbnail' in item).toBe(false);}
    const history=new LevelEditorHistory({version:2,maps:{source}});history.begin();history.preview(a.scene);history.commit();history.undo();expect(history.document.maps.source).toEqual(source);expect(history.canUndo).toBe(false);
    history.redo();expect(history.document.maps.source).toEqual(a.scene);
    history.begin();history.preview(source);history.cancel();expect(history.document.maps.source).toEqual(a.scene);
  });
  it('sweeps fast erase gestures across artwork while keeping locks, hidden children, pins, doors and resident tasks',()=>{
    const source=scene();source.scenery=['ordinary','locked','hidden','pinned','door','reader','group-lamp'].map((id,i)=>({id,asset:'bench',x:200+i*100,y:200,width:60,...(id==='pinned'?{pinned:true}:{}),...(id==='reader'||id==='group-lamp'?{groupId:'reading'}:{})}));
    source.entrances=[{id:'inn-door',ownerId:'door',interiorId:'inn',offsetX:0,offsetY:20}];
    source.activities=[{id:'seat',ownerId:'reader',kind:'seat',offsetX:0,offsetY:20}];
    source.residents=[{id:'anne',name:'Anne',home:{x:50,y:50},speed:60,avatar:{hair:'#333333',skin:'#ccaabb',outfit:'#556677'},schedule:[{id:'reading',activityId:'seat',action:'read',startHour:9,endHour:12,durationSeconds:20}]}];
    const view={hidden:new Set(['hidden']),locked:new Set(['locked'])};
    const stroke=new ObjectPaintStroke(source,'erase',undefined,settings,view,bounds);stroke.move({x:150,y:170});stroke.move({x:950,y:170});
    expect([...stroke.changedIds]).toEqual(['ordinary']);expect(stroke.summary).toContain('inn-door');expect(stroke.summary).toContain('Anne/reading');expect(source.scenery).toHaveLength(7);
    const child=new ObjectPaintStroke(source,'erase',undefined,settings,view,bounds,true);child.move({x:800,y:170});
    expect([...child.changedIds]).toEqual(['group-lamp']);
    const hiddenGroup=structuredClone(source);hiddenGroup.scenery[0].groupId='reading';view.hidden.add('reader');
    const safe=new ObjectPaintStroke(hiddenGroup,'erase',undefined,settings,view,bounds);safe.move({x:200,y:170});expect(safe.changedIds.size).toBe(0);
  });
  it('paints on clear grass and rejects water even with street protection disabled',()=>{
    const source=scene();source.walkable=[];source.navigation={model:'clear-land',terrainCollision:[{id:'pond',kind:'water',polygon:[[500,300],[700,300],[700,500],[500,500]]}]};
    const grass=new ObjectPaintStroke(source,'brush',template,{...settings,variation:0},emptyEditorView(),bounds);grass.move({x:300,y:400});
    expect(grass.changedIds.size).toBe(1);expect(grass.scene.scenery[0].collision?.polygons.length).toBeGreaterThan(0);
    const water=new ObjectPaintStroke(grass.scene,'brush',template,{...settings,protectPaths:false},emptyEditorView(),bounds);water.move({x:600,y:400});
    expect(water.changedIds.size).toBe(0);expect(water.summary).toContain('solid terrain');
  });
  it('rejects an object foundation even when its owner anchor is far away',()=>{
    const source=scene();source.walkable=[];source.navigation={model:'clear-land',terrainCollision:[]};
    source.scenery=[{id:'offset-foundation',asset:'house',x:300,y:500,width:60,collision:{referenceWidth:60,polygons:[[[200,-50],[360,-50],[360,50],[200,50]]]}}];
    const stroke=new ObjectPaintStroke(source,'brush',template,settings,emptyEditorView(),bounds);stroke.move({x:580,y:500});
    expect(stroke.changedIds.size).toBe(0);expect(stroke.summary).toContain('existing objects');
  });
  it('keeps roofs and natural gaps clear while allowing nearby decorative painting',()=>{
    const source=scene('lindenhafen');source.walkable=[];source.navigation={model:'clear-land',terrainCollision:[]};
    const inn={id:'inn',asset:'house' as const,frame:'house-inn',x:500,y:400,width:220};source.scenery=[inn];
    const manifest=getSceneryGeometryMap(source.id),candidate={...inn,id:'candidate',y:560};
    const bases=sceneryFootprints([inn,candidate],manifest);
    expect(polygonsIntersect(bases[0],bases[1])).toBe(false);
    expect(buildingBounds(candidate,manifest.assets['house-inn'])!.top).toBeLessThan(buildingBounds(inn,manifest.assets['house-inn'])!.bottom);
    const paintSettings={...settings,variation:0,clearance:0,protectPaths:false};
    for(const y of [560,620]){
      const crowded=new ObjectPaintStroke(source,'brush',inn,paintSettings,emptyEditorView(),bounds);crowded.move({x:500,y});
      expect(crowded.changedIds.size).toBe(0);expect(crowded.summary).toContain('existing objects');
    }
    const spaced=new ObjectPaintStroke(source,'brush',inn,paintSettings,emptyEditorView(),bounds);spaced.move({x:500,y:650});
    expect(spaced.changedIds.size).toBe(1);
    const decoration=new ObjectPaintStroke(source,'brush',template,paintSettings,emptyEditorView(),bounds);decoration.move({x:500,y:560});
    expect(decoration.changedIds.size).toBe(1);
  });
  it('moves, resizes, mirrors and copies the brush collider together with its owner',()=>{
    const source=scene();source.walkable=[];source.navigation={model:'clear-land',terrainCollision:[]};
    const stroke=new ObjectPaintStroke(source,'brush',template,{...settings,variation:0},emptyEditorView(),bounds);stroke.move({x:300,y:400});
    const item=stroke.scene.scenery[0],before=sceneryFootprints([item])[0];
    const moved=editScenery(stroke.scene,stroke.changedIds,{x:650,y:600,width:120,flipX:true}),owner=moved.scenery[0];
    expect(owner.collision).toEqual(item.collision);
    expect(sceneryFootprints([owner])[0]).toEqual(before.map(([x,y])=>[650-(x-300)*2,600+(y-400)*2]));
    const geometry=sceneNavigationGeometry(moved),grid=new NavigationGrid(geometry.ground,geometry.barriers,moved);
    expect(grid.isWalkable(300,400)).toBe(true);expect(grid.isWalkable(650,596)).toBe(false);
    const copy=pasteScenery(moved,copyScenery(moved,stroke.changedIds),{x:850,y:500}).scene.scenery[1];
    expect(copy.collision).toEqual(owner.collision);
    expect(sceneryFootprints([copy])[0]).toEqual(sceneryFootprints([owner])[0].map(([x,y])=>[x+200,y-100]));
  });
});
