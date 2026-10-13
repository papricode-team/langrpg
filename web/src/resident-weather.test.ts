import {describe,expect,it,vi} from 'vitest';
import {NavigationGrid,createMapNavigation} from './navigation';
import {getWorldScene} from './scene-data';
import type {WorldScene} from './scene-schema';
import {compileResidentActivities,planResidentDay,planResidentWeather,sampleActivityResident,ResidentActivityWorld,type ActivityDay} from './resident-activities';
import {rainForDay,simulationDay,worldRain} from './world-weather';

const time={seed:'0123456789abcdef0123456789abcdef',dayLengthSeconds:720,elapsedSeconds:0};
function fixture(count=1){
  const scene:WorldScene={id:'test',width:600,height:400,coordinateVersion:1,spawn:{x:40,y:100},npcs:[],objects:[],terrain:[],districts:[],
    walkable:[[[14,14],[586,14],[586,386],[14,386]]],obstacles:[],
    scenery:[{id:'awning',asset:'arch',x:360,y:180,width:60,collidable:false}],
    activities:[{id:'shelter',ownerId:'awning',kind:'shelter',offsetX:0,offsetY:20}],residents:[]};
  for(let i=0;i<count;i++){
    scene.scenery.push({id:`bench-${i}`,asset:'bench',x:300,y:80+i*50,width:60,collidable:false});
    scene.activities!.push({id:`seat-${i}`,ownerId:`bench-${i}`,kind:'seat',offsetX:0,offsetY:20});
    scene.residents!.push({id:`reader-${i}`,name:`Reader ${i}`,home:{x:40,y:100+i*50},speed:40,avatar:{hair:'#333333',skin:'#ccaa99',outfit:'#445566'},
      schedule:[{id:'reading',activityId:`seat-${i}`,action:'read',startHour:8,endHour:12,durationSeconds:40,heldObject:'book'}]});
  }
  const nav=new NavigationGrid(scene.walkable,[],scene),residents=compileResidentActivities(scene,nav),dry=planResidentDay(residents,time,0);
  return {scene,nav,residents,dry};
}
function noOverlaps(plan:ActivityDay){
  for(const [i,a] of plan.reservations.entries())for(const b of plan.reservations.slice(i+1)){
    if(Math.hypot(a.point.x-b.point.x,a.point.y-b.point.y)>=16)continue;
    expect(a.start>=b.end||a.end<=b.start,`${a.activityId}/${b.activityId}`).toBe(true);
  }
}
describe('shared weather and resident interruptions',()=>{
  it('reconstructs bounded regional showers from the same seed and civil day',()=>{
    expect(simulationDay({...time,elapsedSeconds:17*30})).toEqual({day:1,seconds:0});
    const forecasts=Array.from({length:20},(_,day)=>rainForDay('lindenhafen',time,day));
    expect(forecasts.some(Boolean)).toBe(true);expect(forecasts.some(rain=>!rain)).toBe(true);
    expect(new Set(forecasts.filter(Boolean).map(rain=>rain!.start)).size).toBeGreaterThan(1);
    for(const [day,rain] of forecasts.entries()){
      expect(rainForDay('lindenhafen',{...time,elapsedSeconds:90000},day)).toEqual(rain);
      if(!rain)continue;
      expect(rain.start).toBeGreaterThanOrEqual(9*30);expect(rain.end).toBeLessThan(17*30);
      // Probe either side of each boundary, without floating-point cancellation
      // from adding then subtracting several days at the exact same instant.
      expect(worldRain('lindenhafen',{...time,elapsedSeconds:day*720+rain.start-210-.001})).toBe(0);
      expect(worldRain('lindenhafen',{...time,elapsedSeconds:day*720+rain.start-210+.001})).toBeGreaterThan(0);
      expect(worldRain('lindenhafen',{...time,elapsedSeconds:day*720+rain.end-210-.001})).toBeGreaterThan(0);
      expect(worldRain('lindenhafen',{...time,elapsedSeconds:day*720+rain.end-210+.001})).toBe(0);
    }
    expect(rainForDay('lindenhafen',time,0,'dry')).toBeUndefined();
    expect(rainForDay('lindenhafen',time,0,'shower')).toEqual({start:277.5,end:307.5});
  });

  it('walks to shelter, releases its seat, and resumes only the uncompleted reading time',()=>{
    const {scene,nav,residents,dry}=fixture(),original=dry.activities[0];
    const rain={start:original.arrival+7.5,end:original.arrival+27.5};
    const plan=planResidentWeather(scene,nav,residents,dry,rain),visit=plan.activities[0];
    expect(visit.weatherOutcome).toBe('resumed');
    const booking=plan.reservations.find(slot=>slot.activityId==='shelter')!;
    expect(booking).toBeDefined();expect(booking.end).toBe(rain.end);
    const seats=plan.reservations.filter(slot=>slot.activityId==='seat-0');
    expect(seats).toHaveLength(2);expect(seats[0].end).toBe(rain.start);expect(seats[1].start).toBe(rain.end);
    expect(sampleActivityResident(residents[0],plan,rain.start)).toMatchObject({x:300,y:100,phase:'travel',action:'shelter',interruption:'rain'});
    expect(sampleActivityResident(residents[0],plan,rain.end-.01)).toMatchObject({x:360,y:200,phase:'act',action:'shelter',activityId:'shelter',heldObject:undefined});
    const reading=visit.phases!.filter(phase=>phase.phase==='act'&&phase.action==='read');
    expect(reading.reduce((sum,phase)=>sum+phase.end-phase.start,0)).toBeCloseTo(40);
    expect(sampleActivityResident(residents[0],plan,reading[1].start+.5)).toMatchObject({phase:'act',action:'read',phaseSeconds:8,resumed:true,heldObject:'book'});
    expect(visit.homeAt).toBeLessThanOrEqual(12*30);
    expect(sampleActivityResident(residents[0],plan,visit.homeAt)).toMatchObject({phase:'home',x:40,y:100});
    noOverlaps(plan);
  });

  it('caps shelter occupancy, uses home as overflow and releases every weather reservation',()=>{
    const {scene,nav,residents,dry}=fixture(3),rain={start:255,end:280};
    const plan=planResidentWeather(scene,nav,residents,dry,rain);
    expect(plan.activities.every(visit=>visit.weatherOutcome==='resumed')).toBe(true);
    expect(plan.reservations.filter(slot=>slot.activityId==='shelter')).toHaveLength(1);
    expect(residents.map(resident=>sampleActivityResident(resident,plan,275)).filter(sample=>sample.phase==='home')).toHaveLength(2);
    expect(plan.reservations.every(slot=>slot.end<=360)).toBe(true);noOverlaps(plan);
    const reversed=compileResidentActivities({...scene,residents:[...scene.residents!].reverse()},nav);
    expect(planResidentWeather(scene,nav,reversed,planResidentDay(reversed,time,0),rain)).toEqual(plan);
  });

  it('uses distinct shelter places and waits to reacquire work occupied by a later visitor',()=>{
    const {scene,nav,residents,dry}=fixture(3),shelter=scene.activities![0];
    shelter.capacity=2;shelter.places=[{x:-15,y:0},{x:15,y:0}];
    const later={...dry.activities[0].reservation,residentId:'later-visitor',taskId:'later-reading',start:275,end:310};
    const plan=planResidentWeather(scene,nav,residents,{...dry,reservations:[...dry.reservations,later]},{start:255,end:280});
    expect(plan.reservations.filter(slot=>slot.activityId==='shelter')).toHaveLength(2);
    const resumed=plan.reservations.find(slot=>slot.residentId===later.residentId);expect(resumed).toEqual(later);
    const original=dry.activities[0];
    const rebooking=plan.reservations.find(slot=>slot.residentId===original.residentId&&slot.activityId===original.destination.activity.id&&slot.start>=280)!;
    expect(rebooking.start).toBe(310);noOverlaps(plan);
  });

  it('cancels unfinished work when rain leaves too little time and never jumps home',()=>{
    const {scene,nav,residents,dry}=fixture(),rain={start:255,end:390};
    const plan=planResidentWeather(scene,nav,residents,dry,rain),visit=plan.activities[0];
    expect(visit.weatherOutcome).toBe('cancelled');expect(visit.homeAt).toBeCloseTo(360);
    expect(visit.phases!.some(phase=>phase.resumed)).toBe(false);
    let before=sampleActivityResident(residents[0],plan,240);
    for(let seconds=240.1;seconds<360.2;seconds+=.1){
      const current=sampleActivityResident(residents[0],plan,seconds);
      expect(nav.isWalkable(current.x,current.y)).toBe(true);
      expect(Math.hypot(current.x-before.x,current.y-before.y)).toBeLessThanOrEqual(4.00001);before=current;
    }
    noOverlaps(plan);
  });

  it('interrupts travel at its current feet and defers a visit that starts during rain',()=>{
    const {scene,nav,residents,dry}=fixture(),original=dry.activities[0];
    const rain={start:original.departure+2,end:original.departure+18};
    const plan=planResidentWeather(scene,nav,residents,dry,rain);
    const before=sampleActivityResident(residents[0],dry,rain.start),after=sampleActivityResident(residents[0],plan,rain.start);
    expect(after.x).toBeCloseTo(before.x);expect(after.y).toBeCloseTo(before.y);expect(after.interruption).toBe('rain');
    const deferred=planResidentWeather(scene,nav,residents,dry,{start:230,end:265});
    expect(deferred.activities[0].weatherOutcome).toBe('deferred');
    expect(sampleActivityResident(residents[0],deferred,260)).toMatchObject({phase:'home',action:'shelter'});
    expect(deferred.activities[0].phases!.filter(phase=>phase.phase==='act'&&phase.action==='read').reduce((sum,phase)=>sum+phase.end-phase.start,0)).toBeCloseTo(40);
  });

  it('keeps a rainy Lindenhafen day continuous, reconstructible and free of per-frame routing',()=>{
    const scene=getWorldScene('lindenhafen'),nav=createMapNavigation('lindenhafen'),world=new ResidentActivityWorld(scene,nav);
    const plan=world.day(time,'shower').plan;expect(plan.activities.some(visit=>visit.weatherOutcome)).toBe(true);noOverlaps(plan);
    const pathfinding=vi.spyOn(nav,'findPath');
    let previous=world.sample(time,'shower');
    for(let tick=1;tick<=1440;tick++){
      const now={...time,elapsedSeconds:tick/2},samples=world.sample(now,'shower');
      for(const [index,sample] of samples.entries()){
        expect(nav.isWalkable(sample.x,sample.y)).toBe(true);
        expect(Math.hypot(sample.x-previous[index].x,sample.y-previous[index].y)).toBeLessThanOrEqual(world.residents[index].spec.speed/2+.001);
      }
      previous=samples;
    }
    // Crossing midnight compiles the next day's plan once; steady sampling does not route.
    pathfinding.mockClear();world.sample({...time,elapsedSeconds:720.25},'shower');expect(pathfinding).not.toHaveBeenCalled();
    const fresh=new ResidentActivityWorld(scene,createMapNavigation('lindenhafen'));
    for(const elapsedSeconds of [70,80,90,110,155,719.9])expect(fresh.sample({...time,elapsedSeconds},'shower')).toEqual(world.sample({...time,elapsedSeconds},'shower'));
  },15000);
});
