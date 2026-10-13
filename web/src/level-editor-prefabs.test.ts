import {describe,expect,it} from 'vitest';
import {sceneDocument} from './scene-data';
import {parseWorldSceneDocument,type ScenePrefab,type WorldSceneDocument} from './scene-schema';
import {LevelEditorHistory,duplicateScenery,editScenery,removeScenery} from './level-editor-model';
import {stampPrefab,previewPrefabUpdate,preservePrefabPlacement,savePrefabFromSelection,detachPrefab,setPrefabLocked,sceneInstanceIds} from './level-editor-prefabs';

const template=():ScenePrefab=>({id:'reading-corner',name:'Reading corner',revision:1,scenery:[
  {id:'bench',asset:'bench',x:0,y:0,width:64},{id:'lamp',asset:'lamp',x:65,y:-12,width:32},
],activities:[{id:'seat',ownerId:'bench',kind:'seat',offsetX:0,offsetY:16,approach:{x:0,y:30}}]});
function fixture(){
  const prefab=template(),document=structuredClone(sceneDocument);document.prefabs=[...(document.prefabs??[]),prefab];
  const result=stampPrefab(document.maps.lindenhafen,prefab,{x:document.maps.lindenhafen.width*.55,y:document.maps.lindenhafen.height*.2});document.maps.lindenhafen=result.scene;
  return {document,scene:result.scene,prefab,ids:result.ids,instance:result.scene.prefabInstances!.at(-1)!};
}
describe('versioned reusable groups',()=>{
  it('stamps usable positions with independent IDs and preserves drafts through one undo',()=>{
    const {document,scene,prefab,instance}=fixture(),history=new LevelEditorHistory(document);
    const second=stampPrefab(scene,prefab,{x:scene.width*.8,y:scene.height*.25});history.edit(second.scene);
    expect(new Set(second.scene.scenery.map(item=>item.id)).size).toBe(second.scene.scenery.length);
    const next=second.scene.prefabInstances!.at(-1)!;expect(next.id).not.toBe(instance.id);
    expect(second.scene.activities!.find(slot=>slot.id===next.activities[0].id)?.ownerId).toBe(next.members[0].id);
    expect(parseWorldSceneDocument(JSON.parse(JSON.stringify(history.document)))).toEqual(history.document);
    history.undo();expect(history.document).toEqual(document);history.redo();expect(history.document.maps.lindenhafen).toEqual(second.scene);
  });
  it('merges a new revision while preserving local property edits and deleted children',()=>{
    const {scene,prefab,ids,instance}=fixture();
    let edited=editScenery(scene,new Set([ids[0]]),{width:80});edited=removeScenery(edited,new Set([ids[1]]));
    const next=structuredClone(prefab);next.revision=2;next.scenery[0].width=100;next.scenery[0].flipX=true;
    next.scenery.push({id:'sign',asset:'sign',x:100,y:0,width:25});
    const update=previewPrefabUpdate(edited,next,instance.id);
    expect(update.scene.scenery.find(item=>item.id===ids[0])).toMatchObject({width:80,flipX:true});
    expect(update.scene.scenery.some(item=>item.id===ids[1])).toBe(false);
    expect(update.added).toHaveLength(1);expect(update.scene.prefabInstances!.at(-1)!.revision).toBe(2);
    expect(update.diagnostics.join(' ')).toMatch(/local width/);
    expect(scene.scenery.find(item=>item.id===ids[0])!.width).toBe(64);
  });
  it('moves placement baselines with a whole group but records individual movement as an override',()=>{
    const {scene,prefab,instance,ids}=fixture();
    const moved=preservePrefabPlacement(scene,{...scene,scenery:scene.scenery.map(item=>ids.includes(item.id)?{...item,x:item.x+100,y:item.y+50}:item)});
    expect(moved.prefabInstances!.at(-1)!.origin).toEqual({x:instance.origin.x+100,y:instance.origin.y+50});
    const next=structuredClone(prefab);next.revision=2;next.scenery[1].x=85;
    const update=previewPrefabUpdate(moved,next,instance.id);
    expect(update.scene.scenery.find(item=>item.id===ids[1])!.x).toBe(instance.origin.x+185);
    const childX=instance.origin.x+80,child=editScenery(scene,new Set([ids[1]]),{x:childX});
    expect(child.prefabInstances!.at(-1)!.origin).toEqual(instance.origin);
    expect(previewPrefabUpdate(child,next,instance.id).scene.scenery.find(item=>item.id===ids[1])!.x).toBe(childX);
  });
  it('retains removed defaults when local content or a doorway depends on them',()=>{
    const {scene,prefab,instance,ids}=fixture();
    scene.entrances!.push({id:'test-door',interiorId:'inn',ownerId:ids[1],offsetX:0,offsetY:20});
    const next={...prefab,revision:2,scenery:prefab.scenery.slice(0,1)};
    const update=previewPrefabUpdate(scene,next,instance.id);
    expect(update.scene.scenery.find(item=>item.id===ids[1])).toBeDefined();
    expect(update.scene.scenery.find(item=>item.id===ids[1])!.groupId).toBeUndefined();
    expect(update.scene.entrances).toEqual(scene.entrances);
    expect(update.scene.prefabInstances!.at(-1)!.members).toHaveLength(1);
  });
  it('duplicates full prefab instances with their overrides and tombstones, while partial copies detach',()=>{
    const {scene,prefab,instance,ids}=fixture();
    const edited=editScenery(scene,new Set([ids[0]]),{width:80});
    const duplicated=duplicateScenery(edited,new Set(ids));
    const copy=duplicated.scene.prefabInstances!.at(-1)!;
    expect(copy.id).not.toBe(instance.id);expect(copy.members[0].base.width).toBe(64);
    expect(copy.members.map(member=>member.id)).toEqual(duplicated.ids);
    const next={...prefab,revision:2,scenery:prefab.scenery.map(item=>({...item,width:100}))};
    expect(previewPrefabUpdate(duplicated.scene,next,copy.id).scene.scenery.find(item=>item.id===copy.members[0].id)!.width).toBe(80);
    const partial=duplicateScenery(edited,new Set([ids[0]]));expect(partial.scene.prefabInstances).toEqual(edited.prefabInstances);
    const deleted=removeScenery(edited,new Set([ids[1]])),tombstoneCopy=duplicateScenery(deleted,new Set([ids[0]]));
    const tombstone=tombstoneCopy.scene.prefabInstances!.at(-1)!;
    expect(previewPrefabUpdate(tombstoneCopy.scene,next,tombstone.id).scene.scenery.some(item=>item.id===tombstone.members[1].id)).toBe(false);
  });
  it('publishes explicit revisions without silently updating other copies',()=>{
    const {document,scene,prefab,instance,ids}=fixture(),second=stampPrefab(scene,prefab,{x:scene.width*.8,y:scene.height*.25});
    document.maps.lindenhafen=editScenery(second.scene,new Set([ids[0]]),{width:96});
    const published=savePrefabFromSelection(document,'lindenhafen',new Set(ids),'Reading corner',instance.id);
    const revised=published.prefabs!.find(item=>item.id===prefab.id)!;
    expect(revised.revision).toBe(2);
    expect(revised.scenery[0].width).toBe(96);
    const other=published.maps.lindenhafen.prefabInstances!.at(-1)!;
    expect(other.revision).toBe(1);
    expect(published.maps.lindenhafen.scenery.find(item=>item.id===other.members[0].id)!.width).toBe(64);
    expect(()=>savePrefabFromSelection(document,'lindenhafen',new Set([ids[0]]),'Broken',instance.id)).toThrow(/whole prefab/);
    expect(detachPrefab(scene,instance.id).scenery).toEqual(scene.scenery);
  });
  it('preserves activity overrides and updates default owner assignment',()=>{
    const {scene,prefab,instance}=fixture(),slotId=instance.activities[0].id;
    scene.activities=scene.activities!.map(slot=>slot.id===slotId?{...slot,capacity:2}:slot);
    const next=structuredClone(prefab);next.revision=2;next.activities[0].ownerId='lamp';next.activities[0].offsetY=40;
    const update=previewPrefabUpdate(scene,next,instance.id),slot=update.scene.activities!.find(slot=>slot.id===slotId)!;
    expect(slot).toMatchObject({ownerId:instance.members[1].id,capacity:2,offsetY:40});
  });
  it('rejects missing catalog versions, duplicate ownership and corrupt baselines',()=>{
    for(const corrupt of [
      (doc:WorldSceneDocument)=>{doc.prefabs=[];},
      (doc:WorldSceneDocument)=>{doc.maps.lindenhafen.prefabInstances![0].revision=99;},
      (doc:WorldSceneDocument)=>{const copy=structuredClone(doc.maps.lindenhafen.prefabInstances![0]);copy.id+='-duplicate';doc.maps.lindenhafen.prefabInstances!.push(copy);},
      (doc:WorldSceneDocument)=>{doc.maps.lindenhafen.prefabInstances![0].members[0].base.width=NaN;},
    ]){const {document}=fixture();corrupt(document);expect(()=>parseWorldSceneDocument(document)).toThrow(/prefab/);}
  });
});

it('locks copy edits and updates, and unlocks without losing local values',()=>{
  const {scene,instance,ids,prefab}=fixture(),locked=setPrefabLocked(scene,instance.id,true);
  expect(()=>editScenery(locked,new Set(ids),{width:100})).toThrow(/Unlock/);
  expect(()=>removeScenery(locked,new Set(ids))).toThrow(/Unlock/);
  expect(()=>previewPrefabUpdate(locked,{...prefab,revision:2},instance.id)).toThrow(/Unlock/);
  expect(()=>detachPrefab(locked,instance.id)).toThrow(/Unlock/);
  expect(setPrefabLocked(locked,instance.id,false)).toEqual(scene);
});
it('transforms unique doors and independent activities when a default object changes width',()=>{
  const {scene,instance,ids,prefab}=fixture();
  scene.entrances!.push({id:'attached-door',interiorId:'inn',ownerId:ids[0],offsetX:10,offsetY:20,returnOffset:{x:15,y:30}});
  scene.activities!.push({id:'independent-work',ownerId:ids[0],kind:'work',offsetX:10,offsetY:30});
  const revised=structuredClone(prefab);revised.revision++;revised.scenery[0].width=128;revised.scenery[0].flipX=true;
  const update=previewPrefabUpdate(scene,revised,instance.id);
  expect(update.scene.entrances!.at(-1)).toMatchObject({offsetX:-20,offsetY:40,returnOffset:{x:-30,y:60}});
  expect(update.scene.activities!.find(slot=>slot.id==='independent-work')).toMatchObject({offsetX:-20,offsetY:60});
});

it('keeps prefab-owned scenery when its former scatter batch regenerates',async()=>{
  const {generateScatter}=await import('./level-editor-generation');
  const {scene,ids}=fixture();
  scene.scenery=scene.scenery.map(item=>ids.includes(item.id)?{...item,generatorId:'old-scatter'}:item);
  const proposal=generateScatter(scene,{id:'old-scatter',seed:42,rulesVersion:1,palette:['tree'],polygon:[[scene.width*.75,scene.height*.35],[scene.width*.95,scene.height*.35],[scene.width*.95,scene.height*.55],[scene.width*.75,scene.height*.55]]},[{asset:'tree',frame:'tree',variant:false,width:80}],{count:1,minSpacing:70,clearance:12,minScale:1,maxScale:1});
  expect(proposal.removedIds.some(id=>ids.includes(id))).toBe(false);
});

it('never reuses deleted prefab child or activity IDs for newly placed objects',()=>{
  const {scene,ids,prefab}=fixture(),duplicated=duplicateScenery(scene,new Set(ids));
  const copy=duplicated.scene.prefabInstances!.at(-1)!,deletedId=copy.members[0].id;
  const removed=removeScenery(duplicated.scene,new Set([deletedId]));
  expect(sceneInstanceIds(removed).has(copy.activities[0].id)).toBe(true);
  const fresh=duplicateScenery(removed,new Set([ids[0]]));
  expect(fresh.ids[0]).not.toBe(deletedId);
  const updated=previewPrefabUpdate(fresh.scene,{...prefab,revision:2},copy.id);
  expect(updated.scene.scenery.some(item=>item.id===deletedId)).toBe(false);
  expect(updated.scene.scenery.find(item=>item.id===fresh.ids[0])).toEqual(fresh.scene.scenery.find(item=>item.id===fresh.ids[0]));
});
