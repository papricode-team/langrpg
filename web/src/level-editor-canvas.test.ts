import {afterEach,describe,expect,it,vi} from 'vitest';
import {LevelEditorCanvas,type EditorCanvasCallbacks} from './level-editor-canvas';
import {NavigationGrid} from './navigation';
import {ResidentActivityWorld} from './resident-activities';
import {defaultEditorLayers} from './level-editor-layers';
import type {ScenePolygon,SceneScenery,WorldScene} from './scene-schema';

const {paintedPlacements}=vi.hoisted(()=>({paintedPlacements:[] as (readonly SceneScenery[])[]}));
vi.mock('phaser',()=>({default:{Scene:class {},Math:{Vector2:class {
  constructor(public x:number,public y:number){}
}}}}));
vi.mock('./world-scenery',()=>({WorldScenery:class {
  constructor(_scene:unknown,_id:unknown,_period:unknown,placements:readonly SceneScenery[]){paintedPlacements.push(placements);}
  destroy(){return undefined;}
}}));
afterEach(()=>{vi.restoreAllMocks();paintedPlacements.length=0;});

const time={seed:'0123456789abcdef0123456789abcdef',dayLengthSeconds:720,elapsedSeconds:0};
const groundColor=0x65bf9d,barrierColor=0xe6785f;
class GuideGraphics {
  polygons:{color:number;points:ScenePolygon}[]=[];
  circles:{x:number;y:number;radius:number}[]=[];
  private color=0;
  clear(){this.polygons=[];this.circles=[];return this;}
  fillStyle(color:number){this.color=color;return this;}
  fillPoints(points:{x:number;y:number}[]){this.polygons.push({color:this.color,points:points.map(point=>[point.x,point.y])});return this;}
  fillCircle(x:number,y:number,radius:number){this.circles.push({x,y,radius});return this;}
  lineStyle(){return this;} strokePoints(){return this;} strokeCircle(){return this;}
  fillRect(){return this;} strokeRect(){return this;} lineBetween(){return this;}
}
const ownedBlocker=(id:string,x:number,y:number):SceneScenery=>({id,asset:'house',x,y,width:40,
  collision:{referenceWidth:40,polygons:[[[-20,-50],[20,-50],[20,50],[-20,50]]]}});
function fixture(){
  const world:WorldScene={id:'editor-test',width:400,height:300,coordinateVersion:1,spawn:{x:40,y:140},
    navigation:{model:'clear-land',terrainCollision:[{id:'pond',kind:'water',polygon:[[160,80],[200,80],[200,200],[160,200]]}]},
    walkable:[],obstacles:[],terrain:[{id:'floor',x:0,y:0,width:400,height:300,dayAsset:'/assets/floor.webp'}],districts:[],npcs:[],
    objects:[{id:'crate',x:250,y:140,collision:{referenceWidth:1,polygons:[[[-20,-50],[20,-50],[20,50],[-20,50]]]}}],
    scenery:[ownedBlocker('shed',110,140),{id:'meeting-sign',asset:'sign',x:350,y:140,width:10,collidable:false}],
    activities:[{id:'meeting',ownerId:'meeting-sign',kind:'wait',offsetX:0,offsetY:0}],
    residents:[{id:'anne',name:'Anne',home:{x:40,y:140},speed:50,avatar:{hair:'#333333',skin:'#ccaa99',outfit:'#445566'},
      schedule:[{id:'visit',activityId:'meeting',action:'wait',startHour:8,endHour:12,durationSeconds:20}]}]};
  const callbacks:EditorCanvasCallbacks={select:vi.fn(),beginDrag:vi.fn(),cancelDrag:vi.fn(),drag:vi.fn(),
    beginStroke:vi.fn(),stroke:vi.fn(),endStroke:vi.fn(),place:vi.fn(),pointer:vi.fn(),ready:vi.fn(),zone:vi.fn()};
  const canvas=new LevelEditorCanvas(callbacks),graphics=new GuideGraphics();
  Object.assign(canvas,{world,guides:graphics,cameras:{main:{zoom:1}},cache:{json:{get:()=>undefined}},textures:{exists:()=>false}});
  canvas.navigationVisible=true;
  canvas.paint(world);
  const overlayNavigation=()=>new NavigationGrid(graphics.polygons.filter(shape=>shape.color===groundColor).map(shape=>shape.points),
    graphics.polygons.filter(shape=>shape.color===barrierColor).map(shape=>shape.points),world);
  return {canvas,world,graphics,overlayNavigation,callbacks};
}
function expectClearResidentRoutes(simulation:ResidentActivityWorld,navigation:NavigationGrid){
  const plan=simulation.day(time,'dry').plan;
  expect(plan.skipped).toEqual([]);
  expect(plan.activities).toHaveLength(1);
  const visit=plan.activities[0];
  for(const route of [visit.destination.outbound,visit.destination.returning])for(const segment of route.segments){
    expect(navigation.canWalkSegment(segment.from.x,segment.from.y,segment.to.x,segment.to.y)).toBe(true);
  }
  // Sample the resident's real compiled trip, including arrival, acting and return.
  for(let seconds=visit.departure;seconds<=visit.homeAt;seconds+=.1){
    const sample=simulation.sample({...time,elapsedSeconds:seconds-7*30},'dry')[0];
    expect(navigation.isWalkable(sample.x,sample.y)).toBe(true);
  }
  return visit;
}

describe('clear-land editor guides',()=>{
  it('shows open land with no street whitelist, while water and owned objects remain blocked',()=>{
    const {graphics,overlayNavigation}=fixture(),navigation=overlayNavigation();
    expect(graphics.polygons.filter(shape=>shape.color===groundColor)).toHaveLength(1);
    expect(graphics.polygons.filter(shape=>shape.color===barrierColor)).toHaveLength(3);
    expect(navigation.isWalkable(40,240)).toBe(true);
    expect(navigation.isWalkable(180,140)).toBe(false);
    expect(navigation.isWalkable(110,140)).toBe(false);
    expect(navigation.isWalkable(250,140)).toBe(false);
    expect(navigation.findPath({x:40,y:140},{x:350,y:140}).length).toBeGreaterThan(0);
  });

  it('plans resident guides across clear land and around the same water and object barriers',()=>{
    const {canvas,graphics,overlayNavigation}=fixture(),sample=vi.spyOn(ResidentActivityWorld.prototype,'sample');
    canvas.showResidentGuide(9,'dry');
    expect(sample).toHaveBeenCalledTimes(1);
    expect(graphics.circles.filter(circle=>circle.radius===6)).toHaveLength(1);
    const simulation=sample.mock.contexts[0] as ResidentActivityWorld;
    const visit=expectClearResidentRoutes(simulation,overlayNavigation());
    expect(visit.destination.outbound.length).toBeGreaterThan(310);
    expect(simulation.sample({...time,elapsedSeconds:visit.arrival-7*30+.01},'dry')[0]).toMatchObject({phase:'act',x:350,y:140});
  });

  it('updates navigation and resident routes when a scatter preview removes and adds solid scenery',()=>{
    const {canvas,overlayNavigation}=fixture(),sample=vi.spyOn(ResidentActivityWorld.prototype,'sample');
    canvas.showResidentGuide(9,'dry');
    const original=sample.mock.contexts[0] as ResidentActivityWorld;
    canvas.preview([ownedBlocker('preview-shed',310,140)],['shed']);
    const navigation=overlayNavigation();
    expect(navigation.isWalkable(110,140)).toBe(true);
    expect(navigation.isWalkable(310,140)).toBe(false);
    expect(navigation.isWalkable(180,140)).toBe(false);
    expect(navigation.isWalkable(250,140)).toBe(false);
    const originalRoute=original.day(time,'dry').plan.activities[0].destination.outbound;
    expect(originalRoute.segments.some(segment=>!navigation.canWalkSegment(segment.from.x,segment.from.y,segment.to.x,segment.to.y))).toBe(true);
    const updated=sample.mock.contexts.at(-1) as ResidentActivityWorld;
    expectClearResidentRoutes(updated,navigation);
  });
});

describe('editor canvas inspection layers',()=>{
  it('hides an artwork category from rendering and editing without changing its collision or scene data',()=>{
    const {canvas,world,graphics}=fixture(),before=structuredClone(world),setVisible=vi.fn();
    Object.assign(canvas,{terrain:{setVisible}});
    canvas.hidden=new Set(['meeting-sign']);canvas.selected=new Set(['shed']);
    canvas.setLayers({...defaultEditorLayers(),terrain:false,buildings:false,collision:true});
    expect(paintedPlacements.at(-1)).toEqual([]);
    expect(canvas.selected.size).toBe(0);
    expect(canvas.hiddenScenery()).toEqual(new Set(['meeting-sign','shed']));
    expect(graphics.polygons.filter(shape=>shape.color===barrierColor)).toHaveLength(3);
    expect(setVisible).toHaveBeenLastCalledWith(false);
    canvas.paint({...world,id:'another-map'});
    expect(canvas.layers.terrain).toBe(false);
    expect(canvas.layers.buildings).toBe(false);
    expect(world).toEqual(before);
  });

  it('controls walkable ground and collision independently',()=>{
    const {canvas,graphics}=fixture();
    canvas.setLayers({...defaultEditorLayers(),ground:true});
    expect(graphics.polygons.filter(shape=>shape.color===groundColor)).toHaveLength(1);
    expect(graphics.polygons.filter(shape=>shape.color===barrierColor)).toHaveLength(0);
    canvas.setLayers({...defaultEditorLayers(),collision:true});
    expect(graphics.polygons.filter(shape=>shape.color===groundColor)).toHaveLength(0);
    expect(graphics.polygons.filter(shape=>shape.color===barrierColor)).toHaveLength(3);
  });

  it('does not select or begin dragging an object in a hidden layer',()=>{
    const {canvas,callbacks}=fixture();
    Object.assign(canvas,{game:{canvas:{focus:vi.fn()}},cameras:{main:{zoom:1,getWorldPoint:(x:number,y:number)=>({x,y})}}});
    canvas.setLayers({...defaultEditorLayers(),buildings:false});
    const pointer={x:110,y:130,rightButtonDown:()=>false,middleButtonDown:()=>false,event:{}};
    const gestures=canvas as unknown as {startPointer(pointer:unknown):void;endPointer():void};
    gestures.startPointer(pointer);gestures.endPointer();
    expect(callbacks.select).toHaveBeenLastCalledWith([]);
    expect(callbacks.beginDrag).not.toHaveBeenCalled();
    expect(canvas.selected.size).toBe(0);
  });
});
