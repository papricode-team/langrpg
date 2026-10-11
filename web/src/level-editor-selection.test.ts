import {describe,it,expect} from 'vitest';
import {sceneDocument} from './scene-data';
import {assertEditorViewEditable,districtForScenery,emptyEditorView,lockedScenery,marqueeSelection,readEditorView,writeEditorView} from './level-editor-selection';
import {duplicateScenery,editScenery,LevelEditorHistory} from './level-editor-model';

const fixture=()=>{
  const world=structuredClone(sceneDocument.maps.lindenhafen);
  world.scenery=[{id:'bench',asset:'bench',x:100,y:100,width:50,groupId:'corner'},{id:'lamp',asset:'lamp',x:200,y:100,width:20,groupId:'corner'},{id:'tree',asset:'tree',x:300,y:100,width:50}];
  world.activities=[{id:'seat',ownerId:'bench',kind:'seat',offsetX:0,offsetY:20}];world.entrances=[];world.prefabInstances=[];
  world.districts=[{id:'garden',label:'Garden',polygon:[[0,0],[220,0],[220,150],[0,150]]}];
  return world;
};
const bounds=(item:{x:number;y:number;width:number})=>({x:item.x-item.width/2,y:item.y-60,width:item.width,height:60});
describe('editor selection and local view safeguards',()=>{
  it('box-selects both drag directions, expands groups and skips hidden children',()=>{
    const world=fixture();
    expect(marqueeSelection(world,{x:80,y:45},{x:110,y:70},bounds,new Set())).toEqual(['bench','lamp']);
    expect(marqueeSelection(world,{x:110,y:70},{x:80,y:45},bounds,new Set(['lamp']))).toEqual(['bench']);
    expect(marqueeSelection(world,{x:80,y:45},{x:110,y:70},bounds,new Set(),true)).toEqual(['bench']);
    expect(marqueeSelection(world,{x:0,y:0},{x:500,y:200},bounds,new Set(['bench','lamp']))).toEqual(['tree']);
  });
  it('blocks indirect group and activity edits to locked objects without blocking independent copies',()=>{
    const world=fixture(),view=emptyEditorView();view.locked.add('bench');
    expect(()=>assertEditorViewEditable(world,editScenery(world,new Set(['bench','lamp']),{width:70}),view)).toThrow('bench');
    const changed=structuredClone(world);changed.activities![0].offsetX=25;
    expect(()=>assertEditorViewEditable(world,changed,view)).toThrow('bench');
    const deleted=structuredClone(world);deleted.scenery=deleted.scenery.filter(item=>item.id!=='bench');
    expect(()=>assertEditorViewEditable(world,deleted,view)).toThrow('bench');
    expect(()=>assertEditorViewEditable(world,duplicateScenery(world,new Set(['bench'])).scene,view)).not.toThrow();
  });
  it('keeps view aids outside scene history and composes them with saved prefab locks',()=>{
    const world=fixture(),document={...structuredClone(sceneDocument),maps:{...sceneDocument.maps,lindenhafen:world}},history=new LevelEditorHistory(document),view=emptyEditorView();
    view.hidden.add('bench');view.locked.add('tree');
    history.edit(editScenery(world,new Set(['lamp']),{x:220}));history.undo();
    expect(history.document).toEqual(document);expect(readEditorView(writeEditorView(view))).toEqual(view);
    world.prefabInstances=[{id:'copy',prefabId:'template',revision:1,origin:{x:0,y:0},activities:[],locked:true,members:[{id:'lamp',key:'lamp',base:world.scenery[1]}]}];
    expect(lockedScenery(world,view)).toEqual(new Set(['tree','lamp']));
  });
  it('recovers from malformed preferences and filters by logical foot position including edges',()=>{
    expect(readEditorView('{bad')).toEqual(emptyEditorView());
    expect(readEditorView('{"version":1,"hidden":["bench",9],"locked":null}').hidden).toEqual(new Set(['bench']));
    const world=fixture();expect(districtForScenery(world,world.scenery[0])).toBe('garden');
    expect(districtForScenery(world,{...world.scenery[0],x:220})).toBe('garden');
    expect(districtForScenery(world,world.scenery[2])).toBe('');
  });
});
