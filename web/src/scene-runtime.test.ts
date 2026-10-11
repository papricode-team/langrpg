import {describe,expect,it} from 'vitest';
import baseline from '../../docs/audits/living-world-area-baseline.json';
import lindenCore from '../../docs/audits/lindenhafen-core-v1.json';
import waldruhCore from '../../docs/audits/waldruh-core-v1.json';
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

  it('connects the southern harbor, quay, library and orchard without opening water or planted lots',()=>{
    const scene=sceneDocument.maps.lindenhafen,navigation=createMapNavigation('lindenhafen');
    expect(scene.height).toBeGreaterThanOrEqual(1536);
    expect(scene.coordinateVersion).toBeGreaterThanOrEqual(3);
    for(const [id,x]of [['harbor-court',0],['bridge-quay',768],['library-square',1536],['orchard-path',2304]] as const){
      expect(scene.terrain.find(tile=>tile.id===id)).toMatchObject({x,y:1024,width:768,height:512,pixelDensity:4});
    }
    for(const point of [{x:480,y:1300},{x:1570,y:1260},{x:2160,y:1340},{x:2770,y:1326}])
      expect(navigation.findPath(scene.spawn,point).at(-1)).toEqual(point);
    for(const [x,y1,y2]of [[704,960,1060],[2140,990,1060],[2660,990,1060]])
      expect(navigation.canWalkSegment(x,y1,x,y2)).toBe(true);
    expect(navigation.canWalkSegment(2280,1106,2340,1106)).toBe(true);
    for(const [x,y]of [[900,1300],[1750,1250],[1900,1410],[2500,1210],[2830,1430]])
      expect(navigation.isWalkable(x,y),`${x},${y}`).toBe(false);
  });

  it('preserves Waldruh’s core and connects the detailed mill terraces across the bridge',()=>{
    const core=parseWorldSceneDocument({version:2,maps:{waldruh:waldruhCore}}).maps.waldruh;
    const scene=sceneDocument.maps.waldruh,navigation=createMapNavigation('waldruh');
    for(const key of ['spawn','npcs','objects','entrances','obstacles'] as const)expect(scene[key]).toEqual(core[key]);
    for(const key of ['walkable','scenery','terrain'] as const)expect(scene[key].slice(0,core[key].length)).toEqual(core[key]);
    expect(scene.width).toBeGreaterThanOrEqual(2304);expect(scene.coordinateVersion).toBeGreaterThanOrEqual(2);
    for(const [id,y]of [['mill-supply-terrace',0],['mill-service-yard',512]] as const)
      expect(scene.terrain.find(tile=>tile.id===id)).toMatchObject({x:1536,y,width:768,height:512,pixelDensity:4});
    for(const slot of scene.activities??[]){const point=sceneActivityPoint(scene,slot);expect(navigation.findPath(scene.spawn,point).at(-1),slot.id).toEqual(point);}
    for(const point of [{x:2086,y:338},{x:1856,y:455},{x:2176,y:1000}])expect(navigation.findPath(scene.spawn,point).at(-1)).toEqual(point);
    expect(navigation.canWalkSegment(1520,665,1575,673)).toBe(true);
    expect(navigation.canWalkSegment(2237,538,2269,492)).toBe(true);
    for(const [x,y]of [[1560,785],[1936,210],[1970,720],[2070,830]])expect(navigation.isWalkable(x,y),`${x},${y}`).toBe(false);
    expect(navigation.auditConnectedArea(scene.spawn).connectedCells).toBeGreaterThan(1614);
  });

  it('doubles both Lindenhafen dimensions with complete detailed terrain and connected southern destinations',()=>{
    const scene=sceneDocument.maps.lindenhafen,navigation=createMapNavigation('lindenhafen');
    expect(scene.width).toBeGreaterThanOrEqual(lindenCore.width*2);
    expect(scene.height).toBeGreaterThanOrEqual(lindenCore.height*2);
    expect(scene.coordinateVersion).toBeGreaterThanOrEqual(4);
    for(let y=0;y<scene.height;y+=512)for(let x=0;x<scene.width;x+=768){
      expect(scene.terrain.find(tile=>tile.x===x&&tile.y===y),`${x},${y}`).toMatchObject({width:768,height:512,pixelDensity:4});
    }
    for(const point of [{x:635,y:1737},{x:1180,y:1850},{x:1710,y:1764},{x:2610,y:1893}])
      expect(navigation.findPath(scene.spawn,point).at(-1)).toEqual(point);
    for(const x of [1605,2180,3058])expect(navigation.canWalkSegment(x,1515,x,1548),`southern crossing ${x}`).toBe(true);
    expect(navigation.canWalkSegment(1320,1840,1480,1840)).toBe(true);
    for(const [x,y]of [[900,2000],[1400,1700],[2450,1750],[2100,1800],[2770,1990]])
      expect(navigation.isWalkable(x,y),`${x},${y}`).toBe(false);
    expect(navigation.auditConnectedArea(scene.spawn).connectedCells).toBeGreaterThanOrEqual(1628*2);
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
    expect(navigation.isWalkable(2200,1770)).toBe(false); // Southern planted plot.
  });

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
    expect(audit.connectedArea).toBe(audit.connectedCells*196);
  });
});
