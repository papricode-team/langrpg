import {describe,expect,it} from 'vitest';
import terrainFixtures from './data/world-terrain-collision-fixtures.json';
import lindenCore from '../../docs/audits/lindenhafen-core-v1.json';
import waldruhCore from '../../docs/audits/waldruh-core-v1.json';
import {getWorldScene,sceneDocument} from './scene-data';
import {sceneNavigationGeometry} from './scene-navigation';
import {NavigationGrid,PLAYER_RADIUS,createMapNavigation,type MapPoint} from './navigation';
import {parseWorldSceneDocument,type ScenePolygon,type WorldScene} from './scene-schema';
import {applyEditOps,type WorldEditOp} from './world-edit-ops';
import {groundFromHazards} from './ground-convert';
const editScene=(scene:WorldScene,op:{kind:WorldEditOp['kind']}&Record<string,unknown>):WorldScene=>
  applyEditOps({version:4,maps:{[scene.id]:scene}},[{...op,map:scene.id} as unknown as WorldEditOp]).document.maps[scene.id];

const towns=['lindenhafen','waldruh','nebelstadt'] as const;
const point=([x,y]:readonly number[]):MapPoint=>({x,y});
const rectangle=(left:number,top:number,right:number,bottom:number):ScenePolygon=>
  [[left,top],[right,top],[right,bottom],[left,bottom]];

function fixture():WorldScene {
  return {id:'test',kind:'outdoor',width:400,height:320,coordinateVersion:1,
    spawn:{x:40,y:40},npcs:[],objects:[],districts:[],
    ground:groundFromHazards('meadow',[{kind:'water',polygon:rectangle(320,0,350,100)}],400,320),
    scenery:[{id:'tree',asset:'tree',x:100,y:100,width:40,
      collision:{referenceWidth:40,polygons:[rectangle(8,-8,28,8)]}}]};
}
function navigation(scene:WorldScene,radius=PLAYER_RADIUS,terrainOnly=false):NavigationGrid {
  const geometry=sceneNavigationGeometry(scene);
  return new NavigationGrid(geometry.ground,terrainOnly?geometry.terrain:geometry.barriers,scene,{agentRadius:radius});
}
function expectRoute(nav:NavigationGrid,start:MapPoint,end:MapPoint,label:string):void {
  expect(nav.isWalkable(start.x,start.y),`${label}: start`).toBe(true);
  expect(nav.isWalkable(end.x,end.y),`${label}: destination`).toBe(true);
  const route=nav.findPath(start,end);
  expect(route.at(-1),label).toEqual(end);
  let previous=start;
  for(const destination of route){
    expect(nav.canWalkSegment(previous.x,previous.y,destination.x,destination.y),label).toBe(true);
    previous=destination;
  }
}

describe('clear land and owned collision',()=>{
  it('uses clear land in every town and gives every building and object its own collision',()=>{
    for(const id of towns){
      const scene=getWorldScene(id),geometry=sceneNavigationGeometry(scene);
      expect(geometry.ground,id).toEqual([rectangle(0,0,scene.width,scene.height)]);
      for(const owner of [...scene.scenery,...scene.objects]){
        expect(owner.collision,`${id}: ${owner.id}`).toBeDefined();
        expect(owner.collision!.referenceWidth,owner.id).toBeGreaterThan(0);
        expect(Array.isArray(owner.collision!.polygons),owner.id).toBe(true);
      }
    }
  });

  it('opens clear grass and bare ground outside the old core street whitelist',()=>{
    for(const [id,core] of [['lindenhafen',lindenCore],['waldruh',waldruhCore]] as const){
      const oldStreets=new NavigationGrid(core.walkable.map(polygon=>polygon.map(([x,y])=>[x,y] as const)),[],core);
      const clearTerrain=navigation(getWorldScene(id),0,true);
      const opened=terrainFixtures[id].land.filter(([x,y])=>x<core.width&&y<core.height&&!oldStreets.isWalkable(x,y));
      expect(opened.length,id).toBeGreaterThan(0);
      for(const [x,y] of opened)expect(clearTerrain.isWalkable(x,y),`${id}: ${x},${y}`).toBe(true);
    }
  });

  for(const id of towns){
    it(`classifies painted clear land and terrain hazards in ${id}`,()=>{
      // Art fixtures describe terrain. A separately placed tree or building
      // may stand on that land, so object collision is audited independently.
      const terrain=navigation(getWorldScene(id),0,true);
      for(const [x,y] of terrainFixtures[id].land)expect(terrain.isWalkable(x,y),`${id} land ${x},${y}`).toBe(true);
      for(const [x,y] of terrainFixtures[id].blocked)expect(terrain.isWalkable(x,y),`${id} hazard ${x},${y}`).toBe(false);
    });

    it(`keeps painted stairs and bridges usable with a ${PLAYER_RADIUS}-unit body in ${id}`,()=>{
      const scene=getWorldScene(id),terrain=navigation(scene,PLAYER_RADIUS,true),runtime=createMapNavigation(id);
      for(const [from,to] of terrainFixtures[id].crossings){
        const start=point(from),end=point(to),label=`${id}: ${from.join(',')} to ${to.join(',')}`;
        expectRoute(terrain,start,end,label);
        // Authored props can occupy a fixture's exact pixel. Their nearest
        // reachable player approach must still stay beside the crossing.
        const approachStart=runtime.closestPoint(start.x,start.y,scene.spawn);
        const approachEnd=runtime.closestPoint(end.x,end.y,scene.spawn);
        expect(Math.hypot(approachStart.x-start.x,approachStart.y-start.y),label).toBeLessThanOrEqual(80);
        expect(Math.hypot(approachEnd.x-end.x,approachEnd.y-end.y),label).toBeLessThanOrEqual(80);
        expectRoute(runtime,approachStart,approachEnd,label);
      }
    },30000);
  }

  it('moves, scales, mirrors and removes the owner footprint without leaving an invisible wall',()=>{
    const original=fixture();
    expect(navigation(original).isWalkable(118,100)).toBe(false);
    expect(navigation(original).isWalkable(88,100)).toBe(true);
    const moved=editScene(original,{kind:'move',id:'tree',x:200,y:200}),movedNavigation=navigation(moved);
    expect(movedNavigation.isWalkable(118,100)).toBe(true);
    expect(movedNavigation.isWalkable(218,200)).toBe(false);
    expect(movedNavigation.isWalkable(244,200)).toBe(true);
    const scaled=editScene(moved,{kind:'update',id:'tree',width:80});
    expect(navigation(scaled).isWalkable(244,200)).toBe(false);
    const mirrored=editScene(scaled,{kind:'update',id:'tree',flipX:true}),mirroredNavigation=navigation(mirrored);
    expect(mirroredNavigation.isWalkable(168,200)).toBe(false);
    expect(mirroredNavigation.isWalkable(244,200)).toBe(true);
    const removedNavigation=navigation(editScene(mirrored,{kind:'remove',id:'tree'}));
    expect(removedNavigation.isWalkable(168,200)).toBe(true);
    expect(removedNavigation.isWalkable(330,50)).toBe(false);
  });

  it('carries interactive object collision with its anchor and leaves no blocker after deletion',()=>{
    const scene=fixture();
    scene.objects=[{id:'crate',x:80,y:270,collision:{referenceWidth:1,polygons:[rectangle(-8,-8,8,8)]}}];
    expect(navigation(scene).isWalkable(80,270)).toBe(false);
    scene.objects[0].x=280;
    const moved=navigation(scene);
    expect(moved.isWalkable(80,270)).toBe(true);
    expect(moved.isWalkable(280,270)).toBe(false);
    scene.objects=[];
    expect(navigation(scene).isWalkable(280,270)).toBe(true);
  });

  it('uses the same owned blocker for held movement and click routing',()=>{
    const nav=navigation(fixture()),start={x:70,y:100},end={x:150,y:100};
    expect(nav.canWalkSegment(start.x,start.y,end.x,end.y)).toBe(false);
    const stopped=nav.move(start,{x:80,y:0});
    expect(stopped.x).toBeLessThan(99);
    expect(nav.isWalkable(stopped.x,stopped.y)).toBe(true);
    expectRoute(nav,start,end,'route around tree');
    expect(nav.findPath(start,end).length).toBeGreaterThan(1);
  });

  it('reads painted water as blocked ground',()=>{
    expect(navigation(fixture(),0,true).isWalkable(335,50)).toBe(false);
    expect(navigation(fixture(),0,true).isWalkable(335,160)).toBe(true);
    expect(parseWorldSceneDocument(structuredClone(sceneDocument)).maps.nebelstadt.ground.layers).toContain('deep-water');
  });
});
