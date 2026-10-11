import {sceneActivityPlaces, type SceneActivity, type ScenePoint, type SceneResident, type SceneResidentTask, type WorldScene} from './scene-schema';
import type {NavigationGrid} from './navigation';
import {worldDaySeconds,worldStartHour,type WorldSimulationTime} from './shared-world-time';

interface RouteSegment {from:ScenePoint;to:ScenePoint;start:number;duration:number;distance:number;distanceBefore:number;}
interface Route {segments:RouteSegment[];seconds:number;length:number;start:ScenePoint;end:ScenePoint;}
interface Destination {activity:SceneActivity;place:number;point:ScenePoint;outbound:Route;returning:Route;fallback:boolean;seatedOffsetY?:number;}
interface CompiledTask {spec:SceneResidentTask;destinations:Destination[];}
export interface CompiledActivityResident {spec:SceneResident;tasks:CompiledTask[];}
export interface ActivityReservation {residentId:string;taskId:string;activityId:string;place:number;point:ScenePoint;start:number;end:number;}
export interface PlannedActivity {
  residentId:string;task:SceneResidentTask;destination:Destination;
  departure:number;arrival:number;finished:number;homeAt:number;reservation:ActivityReservation;
}
export interface ActivityDay {day:number;activities:PlannedActivity[];reservations:ActivityReservation[];skipped:{residentId:string;taskId:string;reason:string}[];}
export interface ActivityResidentSample extends ScenePoint {
  residentId:string;phase:'home'|'travel'|'act'|'return';action:SceneResidentTask['action'];
  activityId?:string;taskId?:string;place?:number;reservationUntil?:number;
  moving:boolean;velocityX:number;velocityY:number;walkDistance:number;facingLeft?:boolean;
  phaseSeconds:number;
  phaseDurationSeconds?:number;
  /** Bench poses sit back from the walkable arrival anchor onto the furniture. */
  seatedOffsetY?:number;
  heldObject?:SceneResidentTask['heldObject'];
}
const distance=(a:ScenePoint,b:ScenePoint):number=>Math.hypot(a.x-b.x,a.y-b.y);
const hash=(value:string):number=>{let n=2166136261;for(const char of value)n=Math.imul(n^char.charCodeAt(0),16777619)>>>0;return n;};
const compatible:Record<SceneResidentTask['action'],readonly SceneActivity['kind'][]>={
  wait:['wait','seat','shelter'],sit:['seat'],read:['seat'],carry:['pickup'],serve:['service'],work:['work'],greet:['wait','service'],shelter:['shelter'],
};

function route(points:ScenePoint[],speed:number,navigation:NavigationGrid,label:string):Route {
  const result:Route={segments:[],seconds:0,length:0,start:points[0],end:points.at(-1)!};
  let previous=points[0];
  for(const target of points.slice(1)){
    if(!navigation.isWalkable(target.x,target.y))throw Error(`${label}: exact activity position is blocked`);
    const path=navigation.findPath(previous,target);
    if(!path.length)throw Error(`${label}: no route between home and activity`);
    for(const point of path){
      const length=distance(previous,point);
      if(length>.00001){
        const duration=length/speed;
        result.segments.push({from:previous,to:point,start:result.seconds,duration,distance:length,distanceBefore:result.length});
        result.seconds+=duration;result.length+=length;
      }
      previous=point;
    }
  }
  return result;
}

/** Resolve authored objects and route geometry once. No pathfinding in frame updates. */
export function compileResidentActivities(scene:WorldScene,navigation:NavigationGrid):CompiledActivityResident[] {
  return [...(scene.residents??[])].sort((a,b)=>a.id.localeCompare(b.id)).map(spec=>{
    if(!navigation.isWalkable(spec.home.x,spec.home.y)||!navigation.findPath(scene.spawn,spec.home).length)throw Error(`${spec.id}: home must be on spawn-connected ground`);
    const tasks=spec.schedule.map(task=>{
      const destinations=[task.activityId,task.fallbackActivityId].filter((id):id is string=>!!id).flatMap((id,index)=>{
        const activity=scene.activities?.find(activity=>activity.id===id);
        if(!activity)throw Error(`${spec.id}/${task.id}: missing activity ${id}`);
        if(index===0&&!compatible[task.action].includes(activity.kind))throw Error(`${spec.id}/${task.id}: ${task.action} cannot use ${activity.kind}`);
        if(index>0&&!['wait','seat','shelter'].includes(activity.kind))throw Error(`${spec.id}/${task.id}: fallback needs a waiting, seating or shelter position`);
        if((activity.capacity??1)!==(activity.places?.length??1))throw Error(`${id}: capacity needs distinct authored places`);
        const owner=scene.scenery.find(item=>item.id===activity.ownerId)!;
        const resolve=(offset:ScenePoint|undefined,feet:ScenePoint):ScenePoint=>offset?{x:owner.x+offset.x,y:owner.y+offset.y}:feet;
        return sceneActivityPlaces(scene,activity).map((point,place)=>({activity,point,place,fallback:index>0,
          ...(activity.kind==='seat'&&owner.asset==='bench'?{seatedOffsetY:-activity.offsetY}:{}),
          outbound:route([spec.home,resolve(activity.approach,point),point],spec.speed,navigation,`${spec.id}/${task.id}`),
          returning:route([point,resolve(activity.exit,point),spec.home],spec.speed,navigation,`${spec.id}/${task.id}`)}));
      });
      const budget=(task.endHour-task.startHour)*worldDaySeconds/24;
      if(!destinations.some(destination=>!destination.fallback&&destination.outbound.seconds+task.durationSeconds+destination.returning.seconds<=budget))throw Error(`${spec.id}/${task.id}: time window is too short for travel, action and return home`);
      return {spec:task,destinations};
    });
    return {spec,tasks};
  });
}

function earliestReservation(point:ScenePoint,start:number,duration:number,latest:number,reservations:ActivityReservation[]):number|undefined {
  let candidate=start;
  const conflicts=reservations.filter(item=>distance(item.point,point)<16).sort((a,b)=>a.start-b.start||a.residentId.localeCompare(b.residentId));
  for(const conflict of conflicts){
    if(candidate+duration<=conflict.start)break;
    if(candidate<conflict.end&&candidate+duration>conflict.start)candidate=conflict.end;
  }
  return candidate+duration<=latest+.00001?candidate:undefined;
}

/** A whole shared day has a bounded, order-independent reservation plan.
 * Residents wait at home when full, use an authored fallback, or skip a block.
 * Every accepted activity returns home before its window closes. */
export function planResidentDay(residents:readonly CompiledActivityResident[],time:WorldSimulationTime,day:number):ActivityDay {
  const result:ActivityDay={day,activities:[],reservations:[],skipped:[]},secondsPerHour=time.dayLengthSeconds/24;
  const requests=residents.flatMap(resident=>resident.tasks.map(task=>({resident,task,priority:hash(`${time.seed}:${day}:${resident.spec.id}:${task.spec.id}`)})))
    .sort((a,b)=>a.task.spec.startHour-b.task.spec.startHour||a.priority-b.priority||a.resident.spec.id.localeCompare(b.resident.spec.id)||a.task.spec.id.localeCompare(b.task.spec.id));
  const homeAt=new Map<string,number>();
  for(const {resident,task,priority} of requests){
    const start=Math.max(task.spec.startHour*secondsPerHour,homeAt.get(resident.spec.id)??0),end=task.spec.endHour*secondsPerHour;
    let accepted:PlannedActivity|undefined;
    for(const fallback of [false,true]){
      const candidates=task.destinations.filter(destination=>destination.fallback===fallback).flatMap(destination=>{
        const duration=destination.outbound.seconds+task.spec.durationSeconds+destination.returning.seconds;
        const jitter=Math.min((priority%3000)/1000,Math.max(0,end-start-duration));
        const departure=earliestReservation(destination.point,start+jitter,duration,end,result.reservations);
        return departure===undefined?[]:[{destination,departure,duration}];
      }).sort((a,b)=>a.departure-b.departure||a.destination.place-b.destination.place);
      const choice=candidates[0];if(!choice)continue;
      const {destination,departure,duration}=choice,arrival=departure+destination.outbound.seconds,finished=arrival+task.spec.durationSeconds;
      const reservation:ActivityReservation={residentId:resident.spec.id,taskId:task.spec.id,activityId:destination.activity.id,place:destination.place,point:destination.point,start:departure,end:departure+duration};
      accepted={residentId:resident.spec.id,task:task.spec,destination,departure,arrival,finished,homeAt:departure+duration,reservation};break;
    }
    if(accepted){result.activities.push(accepted);result.reservations.push(accepted.reservation);homeAt.set(resident.spec.id,accepted.homeAt);}
    else result.skipped.push({residentId:resident.spec.id,taskId:task.spec.id,reason:'No position is free long enough within the schedule window.'});
  }
  return result;
}

function sampleRoute(route:Route,seconds:number):Pick<ActivityResidentSample,'x'|'y'|'velocityX'|'velocityY'|'moving'|'walkDistance'|'facingLeft'> {
  const index=route.segments.findIndex(segment=>seconds<segment.start+segment.duration),segment=route.segments[index];
  if(!segment)return {...route.end,moving:false,velocityX:0,velocityY:0,walkDistance:route.length};
  const t=Math.max(0,Math.min(1,(seconds-segment.start)/segment.duration));
  const velocityX=(segment.to.x-segment.from.x)/segment.duration,velocityY=(segment.to.y-segment.from.y)/segment.duration;
  const direction=route.segments.slice(0,index+1).reverse().find(s=>Math.abs(s.to.x-s.from.x)>Math.abs(s.to.y-s.from.y)*.25);
  return {x:segment.from.x+(segment.to.x-segment.from.x)*t,y:segment.from.y+(segment.to.y-segment.from.y)*t,
    moving:true,velocityX,velocityY,walkDistance:segment.distanceBefore+segment.distance*t,...(direction?{facingLeft:direction.to.x<direction.from.x}:{})};
}

export function sampleActivityResident(resident:CompiledActivityResident,plan:ActivityDay,seconds:number):ActivityResidentSample {
  const active=plan.activities.find(activity=>activity.residentId===resident.spec.id&&seconds>=activity.departure&&seconds<activity.homeAt);
  const base:ActivityResidentSample={residentId:resident.spec.id,...resident.spec.home,phase:'home',action:'wait',moving:false,velocityX:0,velocityY:0,walkDistance:0,phaseSeconds:0};
  if(!active)return base;
  const {destination,task}=active;
  const action=destination.fallback?destination.activity.kind==='seat'?'sit':destination.activity.kind==='shelter'?'shelter':'wait':task.action;
  Object.assign(base,{taskId:task.id,activityId:destination.activity.id,place:destination.place,reservationUntil:active.reservation.end,action});
  if(seconds<active.arrival)return {...base,...sampleRoute(destination.outbound,seconds-active.departure),phase:'travel',phaseSeconds:seconds-active.departure};
  const heldObject=destination.fallback?undefined:task.heldObject;
  if(seconds<active.finished){
    let approach:RouteSegment|undefined;
    for(let index=destination.outbound.segments.length-1;index>=0;index--)if(Math.abs(destination.outbound.segments[index].to.x-destination.outbound.segments[index].from.x)>.05){approach=destination.outbound.segments[index];break;}
    return {...base,...destination.point,phase:'act',phaseSeconds:seconds-active.arrival,phaseDurationSeconds:task.durationSeconds,
      ...(['sit','read'].includes(action)&&destination.seatedOffsetY!==undefined?{seatedOffsetY:destination.seatedOffsetY}:{}),
      heldObject,facingLeft:task.facing?task.facing==='left':approach?approach.to.x<approach.from.x:false};
  }
  return {...base,...sampleRoute(destination.returning,seconds-active.finished),phase:'return',phaseSeconds:seconds-active.finished,heldObject:action==='carry'?heldObject:undefined};
}

/** Cache only the most recent two days; a late join reconstructs directly. */
export class ResidentActivityWorld {
  readonly residents:CompiledActivityResident[];
  private plans=new Map<string,ActivityDay>();
  constructor(scene:WorldScene,navigation:NavigationGrid){this.residents=compileResidentActivities(scene,navigation);}
  day(time:WorldSimulationTime):{plan:ActivityDay;seconds:number} {
    const absolute=Math.max(0,time.elapsedSeconds)+worldStartHour*time.dayLengthSeconds/24,day=Math.floor(absolute/time.dayLengthSeconds);
    const key=`${time.seed}:${time.dayLengthSeconds}:${day}`;
    let plan=this.plans.get(key);
    if(!plan){plan=planResidentDay(this.residents,time,day);this.plans.set(key,plan);if(this.plans.size>2)this.plans.delete(this.plans.keys().next().value!);}
    return {plan,seconds:absolute-day*time.dayLengthSeconds};
  }
  sample(time:WorldSimulationTime):ActivityResidentSample[] {
    const {plan,seconds}=this.day(time);return this.residents.map(resident=>sampleActivityResident(resident,plan,seconds));
  }
}
