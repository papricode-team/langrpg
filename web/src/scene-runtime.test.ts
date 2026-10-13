import {describe,expect,it} from 'vitest';
import baseline from '../../docs/audits/living-world-area-baseline.json';
import lindenCore from '../../docs/audits/lindenhafen-core-v1.json';
import waldruhCore from '../../docs/audits/waldruh-core-v1.json';
import {sceneActivityPoint,sceneEntrancePoint} from './scene-schema';
import {sceneDocument} from './scene-data';
import {getMap,type MapId} from './maps';
import {NavigationGrid,createMapNavigation} from './navigation';
import {getPlacedScenery,sceneryFootprints} from './placed-scenery';
import {buildingEntrances,createInteriorNavigation} from './interiors';
import {explorationZoom} from './world-camera';
import {createWorldResidents} from './world-life';
import {miniGameById} from './minigames/catalogue';

describe('canonical scenes in the game runtime',()=>{
  it('binds authored mini-game hosts to installed games without moving their feet',()=>{
    for(const id of ['lindenhafen','waldruh','nebelstadt'] as const){
      const map=getMap(id),scene=sceneDocument.maps[id];
      for(const kind of ['npcs','objects'] as const)for(const host of map[kind]){
        if(!host.minigame)continue;
        expect(miniGameById.has(host.minigame),host.id).toBe(true);
        expect(scene[kind].find(anchor=>anchor.id===host.id)?.minigame,host.id).toBe(host.minigame);
      }
    }
  });
  it('preserves the original connected areas while allowing authored expansions',()=>{
    for(const measured of baseline.maps.filter(map=>map.id in sceneDocument.maps)){
      const id=measured.id as MapId,scene=sceneDocument.maps[id];
      const audit=createMapNavigation(id).auditConnectedArea(scene.spawn);
      expect(audit.cellSize).toBe(8);
      expect(audit.connectedArea,id).toBeGreaterThanOrEqual(measured.approxConnectedArea);
      expect(getPlacedScenery(id)).toBe(scene.scenery);
    }
  });

  it('limits travel to three composed towns with complete detailed terrain at their planned sizes',()=>{
    expect(Object.keys(sceneDocument.maps).sort()).toEqual(['lindenhafen','nebelstadt','waldruh']);
    for(const [id,width,height]of [['lindenhafen',2304,1536],['waldruh',2304,1024],['nebelstadt',2304,1024]] as const){
      const scene=sceneDocument.maps[id];
      expect([scene.width,scene.height]).toEqual([width,height]);
      expect(scene.terrain).toHaveLength(width/768*height/512);
      for(let y=0;y<height;y+=512)for(let x=0;x<width;x+=768){
        expect(scene.terrain.find(tile=>tile.x===x&&tile.y===y),`${id}: ${x},${y}`).toMatchObject({width:768,height:512,pixelDensity:4});
      }
    }
  });

  it('preserves story interaction anchors while composing the core towns',()=>{
    for(const [id,core]of [['lindenhafen',lindenCore],['waldruh',waldruhCore]] as const){
      const scene=sceneDocument.maps[id];
      expect(scene.spawn).toEqual(core.spawn);
      for(const key of ['npcs','objects'] as const){
        expect(scene[key].map(({id,x,y})=>({id,x,y}))).toEqual(core[key].map(({id,x,y})=>({id,x,y})));
      }
    }
    expect(sceneDocument.maps.lindenhafen.activities!.length).toBeGreaterThanOrEqual(43);
    expect(sceneDocument.maps.lindenhafen.residents?.length).toBeGreaterThanOrEqual(12);
  });

  it('connects physical activities and both ends of every building entrance',()=>{
    for(const id of ['lindenhafen','waldruh','nebelstadt'] as const){
      const scene=sceneDocument.maps[id],navigation=createMapNavigation(id);
      for(const slot of scene.activities??[]){
        const point=sceneActivityPoint(scene,slot);
        expect(navigation.isWalkable(point.x,point.y),slot.id).toBe(true);
        expect(navigation.findPath(scene.spawn,point).at(-1),slot.id).toEqual(point);
      }
      for(const door of scene.entrances??[])for(const returning of [false,true]){
        const point=sceneEntrancePoint(scene,door,returning);
        expect(navigation.findPath(scene.spawn,point).at(-1),`${door.id}: ${returning?'return':'door'}`).toEqual(point);
      }
      const audit=navigation.auditReachability(scene.spawn);
      expect(audit.walkableSamples,id).toBeGreaterThan(0);
      expect(audit.reachableRatio,id).toBeGreaterThanOrEqual(.995);
    }
  },15000);

  it('keeps core anchors, doorways, scenery and resident paths fixed when map bounds double',()=>{
    const original=sceneDocument.maps.lindenhafen;
    const before=getMap('lindenhafen'),doors=buildingEntrances('lindenhafen');
    const routes=createWorldResidents('lindenhafen');
    try{
      sceneDocument.maps.lindenhafen={...structuredClone(original),width:original.width*2,height:original.height*2,coordinateVersion:original.coordinateVersion+1};
      const expanded=getMap('lindenhafen');
      expect(expanded.width).toBe(original.width*2);expect(expanded.height).toBe(original.height*2);
      // Normalized coordinates round differently for non-power-of-two bounds.
      // Compare physical anchors to sub-pixel precision after denormalizing.
      expect(expanded.spawn.x*expanded.width).toBeCloseTo(before.spawn.x*before.width,10);
      expect(expanded.spawn.y*expanded.height).toBeCloseTo(before.spawn.y*before.height,10);
      for(const npc of before.npcs){
        const next=expanded.npcs.find(item=>item.id===npc.id)!;
        expect(next.x*expanded.width).toBeCloseTo(npc.x*before.width,10);
        expect(next.y*expanded.height).toBeCloseTo(npc.y*before.height,10);
      }
      for(const door of buildingEntrances('lindenhafen')){
        const old=doors.find(item=>item.id===door.id)!;
        expect(door.x*expanded.width).toBeCloseTo(old.x*before.width,10);
        expect(door.y*expanded.height).toBeCloseTo(old.y*before.height,10);
      }
      expect(getPlacedScenery('lindenhafen')).toEqual(original.scenery);
      expect(createWorldResidents('lindenhafen')).toEqual(routes.map(route=>({
        ...route,cycleSeconds:expect.closeTo(route.cycleSeconds,10),phaseSeconds:expect.closeTo(route.phaseSeconds,10),
        segments:route.segments.map(segment=>({
          ...segment,
          from:{x:expect.closeTo(segment.from.x,10),y:expect.closeTo(segment.from.y,10)},
          to:{x:expect.closeTo(segment.to.x,10),y:expect.closeTo(segment.to.y,10)},
          startSeconds:expect.closeTo(segment.startSeconds,10),durationSeconds:expect.closeTo(segment.durationSeconds,10),
          velocityX:expect.closeTo(segment.velocityX,10),velocityY:expect.closeTo(segment.velocityY,10),
        })),
      })));
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
    expect(audit.connectedArea).toBe(audit.connectedCells*audit.cellSize**2);
  });
});
