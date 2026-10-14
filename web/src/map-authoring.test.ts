import {describe,it,expect} from 'vitest';
import {authoredNavigation,parseMapNavigationDocument,applyAuthoredMapPlacements} from './map-authoring';
import {validateAuthoredReachability,NavigationGrid,createMapNavigation} from './navigation';
import {placedSceneryFootprints} from './placed-scenery';
import {getMap,storyMaps} from './maps';
import {getWorldScene} from './scene-data';

describe('authored map geometry and runtime placement',()=>{
  it('keeps every canonical interaction reachable with the runtime collision grid',()=>{
    // Runtime towns use the expanded canonical scene. The legacy 1536 × 1024
    // importer must not mix retired street corridors with today's prop anchors.
    for(const map of storyMaps){
      const scene=getWorldScene(map.id),grid=createMapNavigation(map.id);
      expect(grid.isWalkable(scene.spawn.x,scene.spawn.y),`${map.id} spawn`).toBe(true);
      for(const target of [...scene.npcs,...scene.objects]){
        const approach=grid.closestPoint(target.x,target.y,scene.spawn);
        expect(Math.hypot(approach.x-target.x,approach.y-target.y),`${map.id}/${target.id} approach`).toBeLessThanOrEqual(120);
        expect(grid.findPath(scene.spawn,approach).length,`${map.id}/${target.id} route`).toBeGreaterThan(0);
      }
    }
  });
  it('rejects invalid coordinates, degenerate or crossed polygons, and duplicate targets',()=>{
    const bad=structuredClone(authoredNavigation);
    bad.maps.lindenhafen.walkable=[[[Infinity,40],[100,40],[100,100],[40,100]]];
    expect(()=>parseMapNavigationDocument(bad)).toThrow('invalid vertex');
    bad.maps.lindenhafen.walkable=[[[40,40],[100,100],[40,100],[100,40]]];
    expect(()=>parseMapNavigationDocument(bad)).toThrow(/area|cross/);
    bad.maps.lindenhafen.walkable=[[[40,40],[100,40],[100,100],[70,40],[40,100]]];
    expect(()=>parseMapNavigationDocument(bad)).toThrow('cross');
    bad.maps.lindenhafen.walkable=[[[40,40],[100,40],[100,100]]];
    bad.maps.lindenhafen.npcs=[{id:'otto',x:50,y:50},{id:'otto',x:60,y:60}];
    expect(()=>parseMapNavigationDocument(bad)).toThrow('duplicate');
  });
  it('rejects a target on a disconnected island even when both endpoints are walkable',()=>{
    const document=structuredClone(authoredNavigation);
    const footprints=placedSceneryFootprints('lindenhafen');
    const open=new NavigationGrid([[[40,40],[document.width-40,40],[document.width-40,document.height-40],[40,document.height-40]]],footprints,document);
    const spawn=open.closestPoint(document.width*.15,document.height*.85),target=open.closestPoint(document.width*.85,document.height*.85);
    const island=(point:{x:number;y:number}):[number,number][]=>[[point.x-20,point.y-20],[point.x+20,point.y-20],[point.x+20,point.y+20],[point.x-20,point.y+20]];
    document.maps.lindenhafen={walkable:[island(spawn),island(target)],obstacles:[],spawn,npcs:[{id:'otto',...target}],objects:[]};
    const separated=new NavigationGrid(document.maps.lindenhafen.walkable,footprints,document);
    expect(separated.isWalkable(spawn.x,spawn.y)).toBe(true);
    expect(separated.isWalkable(target.x,target.y)).toBe(true);
    expect(Math.hypot(spawn.x-target.x,spawn.y-target.y)).toBeGreaterThan(400);
    expect(separated.findPath(spawn,target)).toEqual([]);
    expect(validateAuthoredReachability(parseMapNavigationDocument(document))).toContain('lindenhafen: otto has no reachable interaction approach');
  });
  it('uses edited spawn and NPC/object pixel positions in actual map specifications',()=>{
    const document=structuredClone(authoredNavigation),spec=getMap('lindenhafen');
    document.maps.lindenhafen.spawn={x:800,y:600};
    document.maps.lindenhafen.npcs.find(point=>point.id==='otto')!.x=1200;
    const object=document.maps.lindenhafen.objects[0];object.y=400;
    const edited=applyAuthoredMapPlacements(spec,document);
    expect(edited.spawn).toEqual({x:800/1536,y:600/1024});
    expect(edited.npcs.find(npc=>npc.id==='otto')!.x).toBe(1200/1536);
    expect(edited.objects.find(item=>item.id===object.id)!.y).toBe(400/1024);
    expect(edited.objects.find(item=>item.id===object.id)!.exerciseIds).toEqual(spec.objects.find(item=>item.id===object.id)!.exerciseIds);
  });
});
