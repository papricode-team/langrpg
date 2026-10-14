import {describe,expect,it} from 'vitest';
import {defaultEditorLayers,editorArtworkView,editorHiddenScenery,editorSceneryLayer,editorSceneryVisible} from './level-editor-layers';
import {marqueeSelection} from './level-editor-selection';
import type {SceneScenery,WorldScene} from './scene-schema';

const items:SceneScenery[]=[
  {id:'inn',asset:'stall',frame:'house-inn',x:100,y:100,width:80,groupId:'garden'},
  {id:'tree',asset:'tree',frame:'tree-2',x:120,y:100,width:80,groupId:'garden'},
  {id:'planter',asset:'planter',x:140,y:100,width:80},
  {id:'lamp',asset:'lamp',x:160,y:100,width:20},
];

describe('editor inspection layers',()=>{
  it('classifies painted alternate buildings and vegetation separately from other props',()=>{
    expect(editorSceneryLayer(items[0])).toBe('buildings');
    for(const asset of ['house','archive','cafe','station','workshop','greenhouse'] as const)expect(editorSceneryLayer({...items[0],asset,frame:undefined})).toBe('buildings');
    for(const asset of ['tree','cypress','planter'] as const)expect(editorSceneryLayer({...items[0],asset,frame:undefined})).toBe('vegetation');
    expect(editorSceneryLayer(items[3])).toBe('props');
  });

  it('keeps object-level hiding intact when showing all artwork or isolating terrain',()=>{
    const hidden=new Set(['lamp']),layers={...defaultEditorLayers(),vegetation:false,story:true};
    const all=editorArtworkView(layers);
    expect(items.filter(item=>editorSceneryVisible(item,all,hidden)).map(item=>item.id)).toEqual(['inn','tree','planter']);
    expect(all.story).toBe(true);
    const terrain=editorArtworkView(layers,true);
    expect(terrain.terrain).toBe(true);
    expect(items.some(item=>editorSceneryVisible(item,terrain,hidden))).toBe(false);
    expect(terrain.story).toBe(false);
    expect(layers).toEqual({...defaultEditorLayers(),vegetation:false,story:true});
    expect([...hidden]).toEqual(['lamp']);
  });

  it('excludes a hidden category from box selection even when visible children belong to its group',()=>{
    const world={scenery:items} as WorldScene,layers={...defaultEditorLayers(),buildings:false},hidden=new Set(['lamp']);
    const excluded=editorHiddenScenery(items,layers,hidden);
    const selected=marqueeSelection(world,{x:50,y:50},{x:200,y:150},item=>({x:item.x-10,y:item.y-10,width:20,height:20}),excluded);
    expect(selected).toEqual(['tree','planter']);
    expect(editorSceneryVisible(items[0],layers,hidden)).toBe(false);
    expect([...hidden]).toEqual(['lamp']);
  });

  it('starts with all artwork visible and every inspection guide off',()=>{
    expect(defaultEditorLayers()).toEqual({terrain:true,buildings:true,vegetation:true,props:true,
      story:false,activities:false,ground:false,collision:false,districts:false});
  });
});
