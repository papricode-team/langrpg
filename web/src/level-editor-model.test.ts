import { describe, expect, it } from 'vitest';
import { duplicateScenery, removeScenery, editScenery, groupScenery, ungroupScenery, scenerySelection, sceneryTranslation, LevelEditorHistory, makeDraft, nextSceneryId, readDraft } from './level-editor-model';
import type { WorldSceneDocument } from './scene-schema';

const fixture = (): WorldSceneDocument => ({ version: 2, maps: { lindenhafen: {
  id: 'lindenhafen', coordinateVersion: 1, width: 1536, height: 1024, spawn: { x: 100, y: 100 }, npcs: [], objects: [],
  walkable: [[[14,14],[1500,14],[1500,1000],[14,1000]]], obstacles: [],
  terrain: [{ id: 'core', x: 0, y: 0, width: 1536, height: 1024, dayAsset: '/assets/lindenhafen-terrain.webp' }], districts: [],
  scenery: [{ id: 'lindenhafen-tree-1', asset: 'tree', x: 100, y: 200, width: 80, pinned: true, generatorId: 'trees' }],
} } });

describe('level editor commands', () => {
  it('records an entire drag as one reversible command without changing source data', () => {
    const source = fixture(), history = new LevelEditorHistory(source);
    history.begin();
    for (const x of [120, 150, 180]) history.preview({ ...history.document.maps.lindenhafen, scenery: [{ ...source.maps.lindenhafen.scenery[0], x }] });
    history.commit(); expect(history.document.maps.lindenhafen.scenery[0].x).toBe(180);
    expect(source.maps.lindenhafen.scenery[0].x).toBe(100);
    history.undo(); expect(history.document.maps.lindenhafen.scenery[0].x).toBe(100); expect(history.canUndo).toBe(false);
    history.redo(); expect(history.document.maps.lindenhafen.scenery[0].x).toBe(180);
  });
  it('assigns unique duplicate IDs and detaches generator ownership while retaining prop settings', () => {
    const source = fixture().maps.lindenhafen;
    const duplicated = duplicateScenery(source, new Set(['lindenhafen-tree-1']));
    expect(duplicated.ids).toEqual(['lindenhafen-tree-2']);
    expect(duplicated.scene.scenery[1]).toMatchObject({ x: 124, y: 224, pinned: true });
    expect(duplicated.scene.scenery[1].generatorId).toBeUndefined();
    expect(nextSceneryId(duplicated.scene, 'tree')).toBe('lindenhafen-tree-3');
  });
  it('cancels preview edits and clears redo when a new command branches history', () => {
    const history = new LevelEditorHistory(fixture()), source = history.document.maps.lindenhafen;
    history.begin(); history.preview({ ...source, scenery: [] }); history.cancel(); expect(history.document.maps.lindenhafen.scenery).toHaveLength(1);
    history.edit({ ...source, scenery: [] }); history.undo();
    history.edit({ ...source, scenery: [{ ...source.scenery[0], width: 120 }] }); expect(history.canRedo).toBe(false);
  });
  it('roundtrips drafts with their originating revision and rejects malformed drafts', () => {
    const draft = makeDraft(fixture(), 'original-revision');
    expect(readDraft(JSON.stringify(draft))).toEqual(draft);
    expect(() => readDraft('{"version":99}')).toThrow('unsupported');
  });
  it('copies activity slots with a duplicate and leaves unique room entrances on their original owner',()=>{
    const source=fixture().maps.lindenhafen;
    source.activities=[{id:'shelter',ownerId:source.scenery[0].id,kind:'shelter',offsetX:4,offsetY:24,capacity:2}];
    source.entrances=[{id:'cafe-door',interiorId:'cafe',ownerId:source.scenery[0].id,offsetX:12,offsetY:32}];
    const copy=duplicateScenery(source,new Set([source.scenery[0].id]));
    expect(copy.scene.activities).toHaveLength(2);
    expect(copy.scene.activities![1]).toMatchObject({ownerId:copy.ids[0],offsetX:4,offsetY:24,capacity:2});
    expect(copy.scene.entrances).toEqual(source.entrances);
    expect(()=>removeScenery(source,new Set([source.scenery[0].id]))).toThrow('cafe-door');
    expect(removeScenery(copy.scene,new Set(copy.ids)).activities).toEqual(source.activities);
  });
  it('scales and mirrors doorway and activity offsets with their object in one undoable edit',()=>{
    const document=fixture(),source=document.maps.lindenhafen,id=source.scenery[0].id;
    source.activities=[{id:'seat',ownerId:id,kind:'seat',offsetX:5,offsetY:10,approach:{x:5,y:20},exit:{x:10,y:20}}];
    source.entrances=[{id:'door',ownerId:id,interiorId:'inn',offsetX:12,offsetY:30,returnOffset:{x:15,y:35}}];
    const history=new LevelEditorHistory(document);
    history.edit(editScenery(history.document.maps.lindenhafen,new Set([id]),{width:160,flipX:true}));
    expect(history.document.maps.lindenhafen.activities![0]).toMatchObject({offsetX:-10,offsetY:20,approach:{x:-10,y:40},exit:{x:-20,y:40}});
    expect(history.document.maps.lindenhafen.entrances![0]).toMatchObject({offsetX:-24,offsetY:60,returnOffset:{x:-30,y:70}});
    history.undo();expect(history.document).toEqual(document);
  });
  it('selects and duplicates groups independently, with a rigid edge-clamped translation',()=>{
    const source=fixture().maps.lindenhafen;
    source.scenery.push({id:'bench',asset:'bench',x:160,y:210,width:80});
    const ids=new Set(source.scenery.map(item=>item.id)),grouped=groupScenery(source,ids);
    expect(scenerySelection(grouped,'bench')).toEqual([...ids]);
    expect(scenerySelection(grouped,'bench',true)).toEqual(['bench']);
    const positions=new Map(grouped.scenery.map(item=>[item.id,{x:item.x,y:item.y}]));
    const moved=sceneryTranslation(grouped,positions,-9999,33,16);
    expect(moved.get('bench')!.x-moved.get('lindenhafen-tree-1')!.x).toBe(60);
    expect(moved.get('bench')!.y-moved.get('lindenhafen-tree-1')!.y).toBe(10);
    const duplicated=duplicateScenery(grouped,ids),copy=duplicated.scene.scenery.filter(item=>duplicated.ids.includes(item.id));
    expect(copy[0].groupId).toBe(copy[1].groupId);expect(copy[0].groupId).not.toBe(grouped.scenery[0].groupId);
    expect(ungroupScenery(grouped,new Set(['bench'])).scenery.every(item=>!item.groupId)).toBe(true);
  });
});
