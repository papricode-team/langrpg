import {sceneActivityPlaces, type SceneActivity, type ScenePoint, type SceneResident, type SceneResidentTask, type WorldScene} from './scene-schema';
import type {NavigationGrid} from './navigation';
import { npcTravelSeconds } from './npc-motion';
import {worldDaySeconds,type WorldSimulationTime} from './shared-world-time';
import {rainForDay,simulationDay,type RainWindow,type WorldWeatherMode} from './world-weather';

interface RouteSegment {from:ScenePoint;to:ScenePoint;start:number;duration:number;distance:number;distanceBefore:number;}
interface Route {segments:RouteSegment[];seconds:number;length:number;start:ScenePoint;end:ScenePoint;}
interface Destination {activity:SceneActivity;place:number;point:ScenePoint;outbound:Route;returning:Route;fallback:boolean;seatedOffsetY?:number;}
interface CompiledTask {spec:SceneResidentTask;destinations:Destination[];}
export interface CompiledActivityResident {spec:SceneResident;tasks:CompiledTask[];}
export interface ActivityReservation {residentId:string;taskId:string;activityId:string;place:number;point:ScenePoint;start:number;end:number;}
export interface PlannedActivity {
  residentId:string;task:SceneResidentTask;destination:Destination;
  departure:number;arrival:number;finished:number;homeAt:number;reservation:ActivityReservation;
  /** Weather adds physical detours while retaining completed action time. */
  phases?:ActivityPhase[];
  weatherOutcome?:'resumed'|'cancelled'|'deferred';
}
interface ActivityPhase {
  start:number;end:number;phase:ActivityResidentSample['phase'];action:SceneResidentTask['action'];
  route?:Route;point?:ScenePoint;activityId?:string;place?:number;reservationUntil?:number;
  phaseOffset?:number;phaseDurationSeconds?:number;interruption?:'rain';resumed?:boolean;
  heldObject?:SceneResidentTask['heldObject'];facingLeft?:boolean;seatedOffsetY?:number;
}
export interface ActivityExchange {
  id:string;start:number;handover:number;end:number;customerHomeAt:number;
  vendor:{residentId:string;taskId:string;point:ScenePoint};customer:{residentId:string;taskId:string;point:ScenePoint};
}
export interface ActivityDay {day:number;activities:PlannedActivity[];reservations:ActivityReservation[];exchanges:ActivityExchange[];skipped:{residentId:string;taskId:string;reason:string}[];}
export interface ActivityResidentSample extends ScenePoint {
  residentId:string;phase:'home'|'travel'|'act'|'return';action:SceneResidentTask['action'];
  activityId?:string;taskId?:string;place?:number;reservationUntil?:number;
  moving:boolean;velocityX:number;velocityY:number;walkDistance:number;facingLeft?:boolean;
  phaseSeconds:number;
  /** Time since this arrival; action progress may predate a rain interruption. */
  segmentSeconds?:number;
  phaseDurationSeconds?:number;
  /** Bench poses sit back from the walkable arrival anchor onto the furniture. */
  seatedOffsetY?:number;
  heldObject?:SceneResidentTask['heldObject'];
  interruption?:'rain';resumed?:boolean;
  exchange?:{id:string;partnerId:string;stage:'greeting'|'request'|'handover'|'thanks';speaking:boolean;german:string;english:string};
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
        const duration=npcTravelSeconds(length,speed);
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
  const residents=[...(scene.residents??[])].sort((a,b)=>a.id.localeCompare(b.id)).map(spec=>{
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
  for(const customer of residents)for(const task of customer.tasks)if(task.spec.exchangeWith){
    const partner=task.spec.exchangeWith,vendor=residents.find(item=>item.spec.id===partner.residentId);
    const service=vendor?.tasks.find(item=>item.spec.id===partner.taskId);
    if(!service||service.spec.action!=='serve'||service.spec.exchangeWith||vendor===customer||task.spec.action!=='wait'||task.spec.fallbackActivityId||task.spec.heldObject)throw Error(`${customer.spec.id}/${task.spec.id}: exchange needs another resident's service block and a plain waiting visit`);
    const feasible=task.destinations.some(place=>place.activity.kind==='wait'&&!place.fallback&&service.destinations.some(counter=>{
      if(counter.fallback||distance(place.point,counter.point)<16||distance(place.point,counter.point)>96)return false;
      const vendorArrival=service.spec.startHour*worldDaySeconds/24+counter.outbound.seconds;
      const start=Math.max(task.spec.startHour*worldDaySeconds/24+place.outbound.seconds,vendorArrival);
      return start+task.spec.durationSeconds<=Math.min(vendorArrival+service.spec.durationSeconds,task.spec.endHour*worldDaySeconds/24-place.returning.seconds);
    }));
    if(!feasible)throw Error(`${customer.spec.id}/${task.spec.id}: exchange needs distinct nearby positions and enough shared service time for travel and return`);
  }
  return residents;
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
  const result:ActivityDay={day,activities:[],reservations:[],exchanges:[],skipped:[]},secondsPerHour=time.dayLengthSeconds/24;
  // Customers are scheduled after weather has established their vendor's availability.
  const requests=residents.flatMap(resident=>resident.tasks.filter(task=>!task.spec.exchangeWith).map(task=>({resident,task,priority:hash(`${time.seed}:${day}:${resident.spec.id}:${task.spec.id}`)})))
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

function destinationAction(destination:Destination,task:SceneResidentTask):SceneResidentTask['action'] {
  return destination.fallback?destination.activity.kind==='seat'?'sit':destination.activity.kind==='shelter'?'shelter':'wait':task.action;
}
function dryPhases(activity:PlannedActivity):ActivityPhase[] {
  const {destination,task,departure,arrival,finished,homeAt}=activity,action=destinationAction(destination,task);
  const heldObject=destination.fallback?undefined:task.heldObject;
  const common={activityId:destination.activity.id,place:destination.place,reservationUntil:homeAt};
  return [
    {...common,start:departure,end:arrival,phase:'travel',action,route:destination.outbound},
    {...common,start:arrival,end:finished,phase:'act',action,point:destination.point,heldObject,phaseDurationSeconds:task.durationSeconds,
      facingLeft:task.facing?task.facing==='left':sampleRoute(destination.outbound,Math.max(0,destination.outbound.seconds-.00001)).facingLeft??false,
      ...(['sit','read'].includes(action)?{seatedOffsetY:destination.seatedOffsetY}:{})},
    {...common,start:finished,end:homeAt,phase:'return',action,route:destination.returning,heldObject:action==='carry'?heldObject:undefined},
  ];
}
function activityAccess(scene:WorldScene,activity:SceneActivity,kind:'approach'|'exit',point:ScenePoint):ScenePoint {
  const offset=activity[kind],owner=scene.scenery.find(item=>item.id===activity.ownerId)!;
  return offset?{x:owner.x+offset.x,y:owner.y+offset.y}:point;
}

/** Replan only interrupted visits. All work happens once per shared day, not per
 * frame. Original bookings end at interruption; resumed work must reacquire its
 * place. Shelter overflow goes home, and no detour can overrun the task window. */
export function planResidentWeather(scene:WorldScene,navigation:NavigationGrid,residents:readonly CompiledActivityResident[],dry:ActivityDay,rain:RainWindow,dayLengthSeconds=worldDaySeconds):ActivityDay {
  const affected=new Set(dry.activities.filter(item=>item.destination.activity.kind!=='shelter'&&item.departure<rain.end&&item.finished>rain.start));
  const result:ActivityDay={day:dry.day,activities:[],exchanges:[],skipped:[...dry.skipped],reservations:dry.reservations.filter(reservation=>!dry.activities.some(item=>affected.has(item)&&item.reservation===reservation))};
  // Install every pre-rain booking before allocating shelters or resumed work.
  const prefixes=new Map<PlannedActivity,ActivityReservation>();
  for(const item of affected)if(item.departure<rain.start){
    const prefix={...item.reservation,end:rain.start};prefixes.set(item,prefix);result.reservations.push(prefix);
  }
  for(const item of dry.activities){
    if(!affected.has(item)){result.activities.push(item);continue;}
    const resident=residents.find(resident=>resident.spec.id===item.residentId)!,spec=resident.spec;
    const {destination,task}=item,action=destinationAction(destination,task);
    const deferred=item.departure>=rain.start,interruptedAt=deferred?item.departure:rain.start;
    const interrupted=deferred?{...spec.home,phase:'home' as const}:sampleActivityResident(resident,dry,interruptedAt);
    const completed=Math.max(0,Math.min(task.durationSeconds,interruptedAt-item.arrival));
    const remaining=deferred?task.durationSeconds:task.durationSeconds-completed;
    // Stow books and tools during the detour; collected parcels remain carried.
    const heldObject=!deferred&&interrupted.phase==='act'&&!destination.fallback&&task.heldObject==='parcel'?'parcel' as const:undefined;
    const deadline=task.endHour*dayLengthSeconds/24;
    const prefixPhases=deferred?[]:dryPhases(item).filter(phase=>phase.start<interruptedAt)
      .map(phase=>({...phase,end:Math.min(phase.end,interruptedAt),reservationUntil:rain.start,
        ...(phase.phase==='act'?{phaseDurationSeconds:Math.min(phase.end,interruptedAt)-phase.start}:{})}));
    const origin:ScenePoint={x:interrupted.x,y:interrupted.y};
    const from=interrupted.phase==='act'?[origin,activityAccess(scene,destination.activity,'exit',origin)]:[origin];
    const shelters=deferred?[]:(scene.activities??[]).filter(activity=>activity.kind==='shelter').flatMap(activity=>sceneActivityPlaces(scene,activity).flatMap((point,place)=>{
      try {
        const outward=route([...from,activityAccess(scene,activity,'approach',point),point],spec.speed,navigation,`${spec.id}/rain`);
        // A shelter reached only after the shower stops is an unnecessary detour.
        return interruptedAt+outward.seconds>=rain.end?[]:[{activity,place,point,outward}];
      } catch { return []; } // A disconnected shelter is not a usable alternative.
    })).sort((a,b)=>a.outward.seconds-b.outward.seconds||a.activity.id.localeCompare(b.activity.id)||a.place-b.place);
    const homeRoute=route([...from,spec.home],spec.speed,navigation,`${spec.id}/rain-home`);
    const choices=[...shelters,undefined];
    let accepted=false;
    for(const shelter of choices){
      const point=shelter?.point??spec.home,outward=shelter?.outward??homeRoute;
      const shelterAt=interruptedAt+outward.seconds;
      const exit=shelter?activityAccess(scene,shelter.activity,'exit',point):point;
      const toHome=route([point,exit,spec.home],spec.speed,navigation,`${spec.id}/rain-return`);
      if(shelterAt+toHome.seconds>deadline+.00001)continue;
      const resume=route([point,exit,activityAccess(scene,destination.activity,'approach',destination.point),destination.point],spec.speed,navigation,`${spec.id}/rain-resume`);
      const duration=resume.seconds+remaining+destination.returning.seconds;
      const resumeAt=earliestReservation(destination.point,Math.max(shelterAt,rain.end),duration,deadline,result.reservations);
      // If work no longer fits, leave shelter in time to reach home even when
      // rain continues. Home is the private overflow destination, never a slot.
      const leaveAt=resumeAt??Math.max(shelterAt,Math.min(rain.end,deadline-toHome.seconds));
      if(shelter&&earliestReservation(point,interruptedAt,leaveAt-interruptedAt,leaveAt,result.reservations)===undefined)continue;
      const phases:ActivityPhase[]=[...prefixPhases];
      const weather={action:'shelter' as const,interruption:'rain' as const,heldObject,
        ...(shelter?{activityId:shelter.activity.id,place:shelter.place,reservationUntil:leaveAt}:{})};
      if(outward.seconds>0)phases.push({...weather,start:interruptedAt,end:shelterAt,phase:'travel',route:outward});
      phases.push({...weather,start:shelterAt,end:leaveAt,phase:shelter?'act':'home',point});
      let homeAt:number;
      if(resumeAt!==undefined){
        const arrived=resumeAt+resume.seconds,finished=arrived+remaining;homeAt=finished+destination.returning.seconds;
        const common={activityId:destination.activity.id,place:destination.place,reservationUntil:homeAt,resumed:!deferred,action};
        phases.push({...common,start:resumeAt,end:arrived,phase:'travel',route:resume,heldObject},
          {...dryPhases(item)[1],...common,start:arrived,end:finished,phaseOffset:deferred?0:completed},
          {...dryPhases(item)[2],...common,start:finished,end:homeAt});
        result.reservations.push({...item.reservation,start:resumeAt,end:homeAt});
      }else{
        homeAt=leaveAt+toHome.seconds;
        if(toHome.seconds>0)phases.push({...weather,activityId:undefined,place:undefined,reservationUntil:undefined,start:leaveAt,end:homeAt,phase:'return',route:toHome});
      }
      if(shelter)result.reservations.push({residentId:spec.id,taskId:task.id,activityId:shelter.activity.id,place:shelter.place,point,start:interruptedAt,end:leaveAt});
      const reservation=prefixes.get(item)??{...item.reservation,end:item.departure};
      result.activities.push({...item,reservation,homeAt,phases:phases.filter(phase=>phase.end>phase.start),weatherOutcome:resumeAt===undefined?'cancelled':deferred?'deferred':'resumed'});
      accepted=true;break;
    }
    // The original feasible route guarantees enough time to return home. Keep
    // invalid geometry explicit rather than silently teleporting a resident.
    if(!accepted)throw Error(`${spec.id}/${task.id}: rain response cannot return home inside its schedule window`);
  }
  return result;
}

/** Allocate a customer only inside a vendor's actual, weather-adjusted service.
 * The service booking holds the vendor's feet; an exchange lock prevents two
 * separate customer positions from engaging the same vendor simultaneously. */
export function planResidentExchanges(residents:readonly CompiledActivityResident[],base:ActivityDay,time:WorldSimulationTime,rain?:RainWindow):ActivityDay {
  const result:ActivityDay={...base,activities:[...base.activities],reservations:[...base.reservations],skipped:[...base.skipped],exchanges:[]};
  const hour=time.dayLengthSeconds/24;
  const requests=residents.flatMap(resident=>resident.tasks.filter(task=>task.spec.exchangeWith).map(task=>({resident,task,priority:hash(`${time.seed}:${base.day}:${resident.spec.id}:${task.spec.id}`)})))
    .sort((a,b)=>a.task.spec.startHour-b.task.spec.startHour||a.priority-b.priority||a.resident.spec.id.localeCompare(b.resident.spec.id)||a.task.spec.id.localeCompare(b.task.spec.id));
  for(const {resident,task} of requests){
    const partner=task.spec.exchangeWith!,vendor=base.activities.find(item=>item.residentId===partner.residentId&&item.task.id===partner.taskId&&!item.destination.fallback);
    const windows=vendor?(vendor.phases??dryPhases(vendor)).filter(phase=>phase.phase==='act'&&phase.action==='serve'&&!phase.interruption):[];
    const candidates=task.destinations.filter(place=>!place.fallback&&vendor&&distance(place.point,vendor.destination.point)>=16&&distance(place.point,vendor.destination.point)<=96).flatMap(destination=>windows.flatMap(window=>{
      const duration=task.spec.durationSeconds,outbound=destination.outbound.seconds,returning=destination.returning.seconds;
      const latest=Math.min(window.end-duration,task.spec.endHour*hour-duration-returning);
      let arrival=Math.max(window.start,task.spec.startHour*hour+outbound);
      for(let attempt=0;attempt<result.reservations.length+result.exchanges.length+3&&arrival<=latest+.00001;attempt++){
        const departure=earliestReservation(destination.point,arrival-outbound,outbound+duration+returning,latest+duration+returning,result.reservations);
        if(departure===undefined)return [];
        arrival=departure+outbound;
        const conflict=result.exchanges.find(exchange=>exchange.vendor.residentId===partner.residentId&&arrival<exchange.end&&arrival+duration>exchange.start);
        if(conflict){arrival=conflict.end;continue;}
        // Keep an uninterrupted exchange: wait at home through a forecast shower.
        if(rain&&departure<rain.end&&arrival+duration>rain.start){arrival=rain.end+outbound;continue;}
        return [{destination,departure,arrival,finished:arrival+duration,homeAt:arrival+duration+returning}];
      }
      return [];
    })).sort((a,b)=>a.arrival-b.arrival||a.destination.place-b.destination.place);
    const accepted=candidates[0];
    if(!accepted||!vendor){result.skipped.push({residentId:resident.spec.id,taskId:task.spec.id,reason:'No shared service time is available after travel, weather and existing customers.'});continue;}
    const {destination,departure,arrival,finished,homeAt}=accepted;
    const reservation:ActivityReservation={residentId:resident.spec.id,taskId:task.spec.id,activityId:destination.activity.id,place:destination.place,point:destination.point,start:departure,end:homeAt};
    const visit:PlannedActivity={...accepted,residentId:resident.spec.id,task:task.spec,reservation};
    visit.phases=dryPhases(visit).map(phase=>phase.phase==='return'?{...phase,action:'carry',heldObject:'parcel'}:phase);
    result.activities.push(visit);result.reservations.push(reservation);
    result.exchanges.push({id:`${time.seed}:${base.day}:${partner.residentId}:${partner.taskId}:${resident.spec.id}:${task.spec.id}`,start:arrival,handover:arrival+(finished-arrival)*.75,end:finished,customerHomeAt:homeAt,
      vendor:{residentId:partner.residentId,taskId:partner.taskId,point:vendor.destination.point},customer:{residentId:resident.spec.id,taskId:task.spec.id,point:destination.point}});
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

function sampleSoloActivity(resident:CompiledActivityResident,plan:ActivityDay,seconds:number):ActivityResidentSample {
  const active=plan.activities.find(activity=>activity.residentId===resident.spec.id&&seconds>=activity.departure&&seconds<activity.homeAt);
  const base:ActivityResidentSample={residentId:resident.spec.id,...resident.spec.home,phase:'home',action:'wait',moving:false,velocityX:0,velocityY:0,walkDistance:0,phaseSeconds:0};
  if(!active)return base;
  const {destination,task}=active;
  if(active.phases){
    const phase=active.phases.find(phase=>seconds>=phase.start&&seconds<phase.end);
    if(!phase)return base;
    const {start,route:travel,point,end,phaseOffset,...state}=phase;
    return {...base,...state,...(travel?sampleRoute(travel,seconds-start):point),taskId:task.id,
      phaseSeconds:seconds-start+(phaseOffset??0),segmentSeconds:seconds-start,phaseDurationSeconds:phase.phaseDurationSeconds??end-start};
  }
  const action=destinationAction(destination,task);
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

export function sampleActivityResident(resident:CompiledActivityResident,plan:ActivityDay,seconds:number):ActivityResidentSample {
  const sample=sampleSoloActivity(resident,plan,seconds);
  const exchange=plan.exchanges.find(item=>seconds>=item.start&&seconds<item.end&&(item.customer.residentId===sample.residentId||item.vendor.residentId===sample.residentId));
  if(!exchange)return sample;
  const duration=exchange.end-exchange.start,progress=(seconds-exchange.start)/duration;
  const vendor=sample.residentId===exchange.vendor.residentId,partner=vendor?exchange.customer:exchange.vendor;
  const stage=progress<.2?'greeting':progress<.5?'request':seconds<exchange.handover?'handover':'thanks';
  const lines={greeting:['Guten Tag!','Hello!'],request:['Ein Paket, bitte.','A parcel, please.'],handover:['Hier, bitte.','Here you are.'],thanks:['Danke!','Thank you!']};
  const [german,english]=lines[stage],speaking=vendor?(stage==='greeting'||stage==='handover'):(stage==='request'||stage==='thanks');
  const start=exchange.start+duration*({greeting:0,request:.2,handover:.5,thanks:.75}[stage]);
  const heldObject=vendor&&stage==='handover'||!vendor&&stage==='thanks'?'parcel' as const:undefined;
  return {...sample,action:heldObject?'carry':speaking?'greet':'wait',heldObject,facingLeft:partner.point.x<sample.x,phaseSeconds:seconds-start,segmentSeconds:seconds-start,
    phaseDurationSeconds:duration*({greeting:.2,request:.3,handover:.25,thanks:.25}[stage]),exchange:{id:exchange.id,partnerId:partner.residentId,stage,speaking,german,english}};
}

/** Cache only two day/preview plans; a late join reconstructs directly. */
export class ResidentActivityWorld {
  readonly residents:CompiledActivityResident[];
  private plans=new Map<string,ActivityDay>();
  private scene:WorldScene;
  private navigation:NavigationGrid;
  constructor(scene:WorldScene,navigation:NavigationGrid){this.scene=scene;this.navigation=navigation;this.residents=compileResidentActivities(scene,navigation);}
  day(time:WorldSimulationTime,weather:WorldWeatherMode='regional'):{plan:ActivityDay;seconds:number} {
    const {day,seconds}=simulationDay(time);
    const key=`${time.seed}:${time.dayLengthSeconds}:${day}:${weather}`;
    let plan=this.plans.get(key);
    if(!plan){
      plan=planResidentDay(this.residents,time,day);
      const rain=rainForDay(this.scene.id,time,day,weather);
      if(rain)plan=planResidentWeather(this.scene,this.navigation,this.residents,plan,rain,time.dayLengthSeconds);
      plan=planResidentExchanges(this.residents,plan,time,rain);
      this.plans.set(key,plan);if(this.plans.size>2)this.plans.delete(this.plans.keys().next().value!);
    }
    return {plan,seconds};
  }
  sample(time:WorldSimulationTime,weather:WorldWeatherMode='regional'):ActivityResidentSample[] {
    const {plan,seconds}=this.day(time,weather);return this.residents.map(resident=>sampleActivityResident(resident,plan,seconds));
  }
}
