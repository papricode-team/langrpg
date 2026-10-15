import {describe,expect,it} from 'vitest';
import {NavigationGrid,createMapNavigation} from './navigation';
import {sceneDocument,getWorldScene} from './scene-data';
import {parseWorldSceneDocument,type SceneResident,type WorldScene} from './scene-schema';
import {compileResidentActivities,planResidentDay,ResidentActivityWorld,sampleActivityResident} from './resident-activities';
import {applyEditOps,type WorldEditOp} from './world-edit-ops';
const editScene=(scene:WorldScene,op:{kind:WorldEditOp['kind']}&Record<string,unknown>):WorldScene=>
  applyEditOps({version:3,maps:{[scene.id]:scene}},[{...op,map:scene.id} as unknown as WorldEditOp]).document.maps[scene.id];
import {sceneNavigationGeometry} from './scene-navigation';

const time={seed:'0123456789abcdef0123456789abcdef',dayLengthSeconds:720,elapsedSeconds:0};
const actor=(id:string):SceneResident=>({id,name:id,home:{x:40,y:100},speed:50,avatar:{hair:'#333333',skin:'#ccaa99',outfit:'#445566'},schedule:[{id:'reading',activityId:'seat',action:'read',startHour:8,endHour:9,durationSeconds:20,heldObject:'book',fallbackActivityId:'waiting'}]});
function fixture(){
  const scene:WorldScene={id:'test',width:600,height:400,coordinateVersion:1,spawn:{x:40,y:100},npcs:[],objects:[],terrain:[{id:'floor',x:0,y:0,width:600,height:400,dayAsset:'/assets/floor.webp'}],districts:[],walkable:[],obstacles:[],navigation:{model:'clear-land',terrainCollision:[]},
    scenery:[{id:'bench',asset:'bench',x:100,y:100,width:60,collision:{referenceWidth:60,polygons:[]}},{id:'sign',asset:'sign',x:180,y:100,width:30,collision:{referenceWidth:30,polygons:[]}}],
    activities:[{id:'seat',ownerId:'bench',kind:'seat',offsetX:0,offsetY:20,approach:{x:0,y:35},exit:{x:15,y:35}},{id:'waiting',ownerId:'sign',kind:'wait',offsetX:0,offsetY:20}],residents:[actor('anne'),actor('ben')]};
  const geometry=sceneNavigationGeometry(scene),nav=new NavigationGrid(geometry.ground,geometry.barriers,scene);return {scene,nav};
}
describe('authored resident activities',()=>{
  it('takes at least one second on every leg, including short approach and exit turns',()=>{
    const {scene,nav}=fixture();
    const residents=compileResidentActivities(scene,nav);
    for(const resident of residents)for(const task of resident.tasks)for(const destination of task.destinations){
      for(const route of [destination.outbound,destination.returning])for(const segment of route.segments){
        expect(segment.duration).toBeGreaterThanOrEqual(1);
        expect(segment.distance/segment.duration).toBeLessThanOrEqual(resident.spec.speed);
      }
    }
  });
  it('reserves positions, uses a fallback when full and releases every visit on return',()=>{
    const {scene,nav}=fixture(),residents=compileResidentActivities(scene,nav),day=planResidentDay(residents,time,0);
    expect(day.activities).toHaveLength(2);expect(day.skipped).toEqual([]);
    expect(day.activities.filter(activity=>activity.destination.fallback)).toHaveLength(1);
    for(const planned of day.activities){
      const resident=residents.find(resident=>resident.spec.id===planned.residentId)!;
      expect(sampleActivityResident(resident,day,planned.departure).phase).toBe('travel');
      const acting=sampleActivityResident(resident,day,planned.arrival+.01);
      expect(acting.phase).toBe('act');expect(acting.activityId).toBe(planned.destination.activity.id);
      expect(acting.heldObject).toBe(planned.destination.fallback?undefined:'book');
      expect(sampleActivityResident(resident,day,planned.homeAt)).toMatchObject({phase:'home',x:resident.spec.home.x,y:resident.spec.home.y});
      expect(planned.reservation.end).toBe(planned.homeAt);
    }
  });
  it('honors explicit capacity and never overlaps physically coincident slots',()=>{
    const {scene,nav}=fixture();scene.activities![0].capacity=2;scene.activities![0].places=[{x:-14,y:0},{x:14,y:0}];
    const day=planResidentDay(compileResidentActivities(scene,nav),time,0);
    expect(day.activities.every(activity=>!activity.destination.fallback)).toBe(true);
    expect(new Set(day.activities.map(activity=>activity.destination.place)).size).toBe(2);
    const overlap=structuredClone(scene);overlap.activities![1]={...overlap.activities![0],id:'waiting',kind:'wait'};
    overlap.residents!.push(actor('chris'),actor('dora'));
    const crowded=planResidentDay(compileResidentActivities(overlap,nav),time,0);
    expect(crowded.activities).toHaveLength(2);expect(crowded.skipped).toHaveLength(2);
  });
  it('reconstructs identically for late joins, reordered authoring and repeated sampling',()=>{
    const {scene,nav}=fixture(),a=new ResidentActivityWorld(scene,nav),b=new ResidentActivityWorld({...scene,residents:[...scene.residents!].reverse()},nav);
    for(const elapsedSeconds of [0,35,45,70,719.9,720,721,504002]){
      const now={...time,elapsedSeconds};expect(a.day(now)).toEqual(b.day(now));expect(a.sample(now)).toEqual(b.sample(now));
      expect(new ResidentActivityWorld(scene,nav).sample(now)).toEqual(a.sample(now));
    }
  });
  it('walks the complete dry authored Lindenhafen day without jumps or blocked feet',()=>{
    const scene=getWorldScene('lindenhafen'),nav=createMapNavigation('lindenhafen', {agentRadius:0}),world=new ResidentActivityWorld(scene,nav);
    expect(world.residents).toHaveLength(12);
    let previous=world.sample(time,'dry');
    for(let tick=1;tick<=2880;tick++){
      const samples=world.sample({...time,elapsedSeconds:tick/4},'dry');
      for(const [i,sample] of samples.entries()){
        expect(nav.isWalkable(sample.x,sample.y)).toBe(true);
        expect(Math.hypot(sample.x-previous[i].x,sample.y-previous[i].y)).toBeLessThanOrEqual(world.residents[i].spec.speed/4+.001);
      }
      previous=samples;
    }
    const day=world.day(time,'dry').plan;
    expect(day.skipped).toEqual([]);
    for(const reservation of day.reservations)for(const other of day.reservations){
      if(reservation===other||Math.hypot(reservation.point.x-other.point.x,reservation.point.y-other.point.y)>=16)continue;
      expect(reservation.start>=other.end||reservation.end<=other.start).toBe(true);
    }
  },30000);
  it('validates references, home connectivity, task kinds and feasible travel windows',()=>{
    const {scene,nav}=fixture();
    for(const mutate of [
      (draft:WorldScene)=>{draft.residents![0].home={x:0,y:0};},
      (draft:WorldScene)=>{draft.residents![0].schedule[0].activityId='gone';},
      (draft:WorldScene)=>{draft.residents![0].schedule[0].action='work';},
      (draft:WorldScene)=>{draft.residents![0].schedule[0].endHour=8.1;},
      (draft:WorldScene)=>{draft.activities![0].capacity=2;},
    ]){const draft=structuredClone(scene);mutate(draft);expect(()=>compileResidentActivities(draft,nav)).toThrow();}
    const document=structuredClone(sceneDocument);document.maps.lindenhafen.residents![0].schedule[0].activityId='gone';
    expect(()=>parseWorldSceneDocument(document)).toThrow(/missing activity/);
  });
  it('protects referenced objects and carries all capacity positions with object transforms',()=>{
    const {scene}=fixture();expect(()=>editScene(scene,{kind:'remove',id:'bench'})).toThrow(/Change their schedule/);
    scene.activities![0].capacity=2;scene.activities![0].places=[{x:-14,y:0},{x:14,y:0}];
    const edited=editScene(editScene(scene,{kind:'update',id:'bench',width:120}),{kind:'update',id:'bench',flipX:true});
    expect(edited.activities![0].places).toEqual([{x:28,y:0},{x:-28,y:0}]);
  });
});
