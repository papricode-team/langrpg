import {describe,expect,it} from 'vitest';
import baseline from '../../docs/audits/living-world-area-baseline.json';
import lindenCore from '../../docs/audits/lindenhafen-core-v1.json';
import {parseWorldSceneDocument,sceneActivityPoint} from './scene-schema';
import {sceneDocument} from './scene-data';
import {getMap,type MapId} from './maps';
import {NavigationGrid,createMapNavigation} from './navigation';
import {getPlacedScenery,sceneryFootprints} from './placed-scenery';
import {buildingEntrances,createInteriorNavigation} from './interiors';
import {explorationZoom} from './world-camera';
import {createWorldResidents} from './world-life';

describe('canonical scenes in the game runtime',()=>{
  it('preserves the original connected areas while allowing authored expansions',()=>{
    for(const measured of baseline.maps){
      const id=measured.id as MapId,scene=sceneDocument.maps[id];
      const audit=createMapNavigation(id).auditConnectedArea(scene.spawn);
      expect(audit.connectedCells,id).toBeGreaterThanOrEqual(measured.spawnConnectedCells);
      expect(audit.connectedArea,id).toBeGreaterThanOrEqual(measured.approxConnectedArea);
      expect(getPlacedScenery(id)).toBe(scene.scenery);
    }
  });

  it('keeps the Lindenhafen core intact and connects the promenade, parcel, garden and canal activities',()=>{
    const core=parseWorldSceneDocument({version:2,maps:{lindenhafen:lindenCore}}).maps.lindenhafen;
    const original=new NavigationGrid(core.walkable,[...core.obstacles,...sceneryFootprints(core.scenery)],core);
    expect(original.auditConnectedArea(core.spawn).connectedCells).toBe(1628);
    const scene=sceneDocument.maps.lindenhafen,navigation=createMapNavigation('lindenhafen');
    for(const key of ['spawn','npcs','objects','entrances','obstacles'] as const)expect(scene[key]).toEqual(core[key]);
    expect(scene.walkable.slice(0,core.walkable.length)).toEqual(core.walkable);
    expect(scene.scenery.slice(0,core.scenery.length)).toEqual(core.scenery);
    expect(scene.terrain.slice(0,core.terrain.length)).toEqual(core.terrain);
    expect(scene.width).toBeGreaterThanOrEqual(core.width*2);
    for(const slot of scene.activities??[]){
      const point=sceneActivityPoint(scene,slot);
      expect(navigation.isWalkable(point.x,point.y),slot.id).toBe(true);
      const path=navigation.findPath(scene.spawn,point);
      expect(path.at(-1),slot.id).toEqual(point);
    }
    expect(navigation.findPath(scene.spawn,{x:2915,y:239}).at(-1)).toEqual({x:2915,y:239});
    expect(navigation.findPath(scene.spawn,{x:2894,y:810}).at(-1)).toEqual({x:2894,y:810});
    expect(navigation.findPath({x:2488,y:736},{x:2669,y:863}).at(-1)).toEqual({x:2669,y:863});
    expect(navigation.isWalkable(2645,742)).toBe(false); // Planted central island.
    expect(navigation.auditConnectedArea(scene.spawn).connectedCells).toBeGreaterThanOrEqual(1628*2);
    // The canal bridge joins the old core, and both district boundaries have
    // collision-safe crossings rather than isolated reachable endpoints.
    for(const point of [{x:1760,y:679},{x:2010,y:790},{x:2330,y:730}]){
      expect(navigation.findPath(scene.spawn,point).at(-1)).toEqual(point);
    }
    expect(navigation.canWalkSegment(1930,498,1930,536)).toBe(true);
    expect(navigation.canWalkSegment(2285,729,2330,729)).toBe(true);
    expect(navigation.canWalkSegment(1505,683,1580,683)).toBe(true);
    expect(navigation.isWalkable(1600,760)).toBe(false); // Canal water.
    expect(navigation.isWalkable(2040,650)).toBe(false); // Planted island.
    expect(navigation.isWalkable(2200,1600)).toBe(false); // Unauthored south.
  });

  it('keeps core anchors, doorways, scenery and resident paths fixed when map bounds double',()=>{
    const original=sceneDocument.maps.lindenhafen;
    const before=getMap('lindenhafen'),doors=buildingEntrances('lindenhafen');
    const routes=createWorldResidents('lindenhafen');
    try{
      sceneDocument.maps.lindenhafen={...structuredClone(original),width:3072,height:2048,coordinateVersion:2};
      const expanded=getMap('lindenhafen');
      expect(expanded.width).toBe(3072);expect(expanded.height).toBe(2048);
      expect(expanded.spawn.x*expanded.width).toBe(before.spawn.x*before.width);
      for(const npc of before.npcs){
        const next=expanded.npcs.find(item=>item.id===npc.id)!;
        expect(next.x*expanded.width).toBe(npc.x*before.width);
        expect(next.y*expanded.height).toBe(npc.y*before.height);
      }
      for(const door of buildingEntrances('lindenhafen')){
        const old=doors.find(item=>item.id===door.id)!;
        expect(door.x*expanded.width).toBe(old.x*before.width);
        expect(door.y*expanded.height).toBe(old.y*before.height);
      }
      expect(getPlacedScenery('lindenhafen')).toEqual(original.scenery);
      expect(createWorldResidents('lindenhafen')).toEqual(routes);
      expect(createInteriorNavigation('cafe').width).toBe(1536);
      expect(createInteriorNavigation('cafe').height).toBe(1024);
      expect(explorationZoom(1920,1080,1,false,132,expanded).zoom).toBe(explorationZoom(1920,1080,1,false,132,before).zoom);
    }finally{sceneDocument.maps.lindenhafen=original;}
  });

  it('uses edited scenery anchors for both visible objects and movement barriers',()=>{
    const original=sceneDocument.maps.lindenhafen;
    try{
      const edited=structuredClone(original);
      const lamp=edited.scenery.find(item=>item.asset==='lamp')!;
      lamp.x=2000;lamp.y=1600;
      edited.width=3072;edited.height=2048;
      edited.walkable=[[[16,16],[3056,16],[3056,2032],[16,2032]]];
      sceneDocument.maps.lindenhafen=edited;
      expect(getPlacedScenery('lindenhafen').find(item=>item.id===lamp.id)?.x).toBe(2000);
      const navigation=createMapNavigation('lindenhafen');
      expect(navigation.isWalkable(2000,1598)).toBe(false);
      expect(navigation.isWalkable(2000,1640)).toBe(true);
      expect(sceneryFootprints([lamp])[0].every(([x])=>x>1900)).toBe(true);
    }finally{sceneDocument.maps.lindenhafen=original;}
  });

  it('routes beyond the old footprint and excludes disconnected land from the area audit',()=>{
    const navigation=new NavigationGrid([
      [[40,40],[2000,40],[2000,100],[40,100]],
      [[2100,40],[2200,40],[2200,140],[2100,140]],
    ],[],{width:3072,height:2048});
    expect(navigation.findPath({x:60,y:60},{x:1900,y:60})).toEqual([{x:1900,y:60}]);
    expect(navigation.findPath({x:60,y:60},{x:2150,y:70})).toEqual([]);
    const audit=navigation.auditConnectedArea({x:60,y:60});
    expect(audit.connectedCells).toBeLessThan(audit.totalWalkableCells);
    expect(audit.connectedArea).toBe(audit.connectedCells*196);
  });
});
