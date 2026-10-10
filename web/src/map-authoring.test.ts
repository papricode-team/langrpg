import {describe,it,expect} from 'vitest';
import {authoredNavigation,parseMapNavigationDocument,applyAuthoredMapPlacements} from './map-authoring';
import {validateAuthoredReachability} from './navigation';
import {getMap} from './maps';

describe('authored map geometry and runtime placement',()=>{
  it('keeps every authored interaction reachable with the runtime collision grid',()=>{
    expect(validateAuthoredReachability(authoredNavigation)).toEqual([]);
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
    document.maps.lindenhafen={walkable:[[[40,40],[140,40],[140,140],[40,140]],[[300,40],[400,40],[400,140],[300,140]]],obstacles:[],spawn:{x:60,y:60},npcs:[{id:'otto',x:350,y:70}],objects:[]};
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
