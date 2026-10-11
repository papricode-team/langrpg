import {describe,expect,it,vi} from 'vitest';
import {NavigationGrid,createMapNavigation} from './navigation';
import {sceneDocument,getWorldScene} from './scene-data';
import {parseWorldSceneDocument,type WorldScene} from './scene-schema';
import {compileResidentActivities,planResidentDay,planResidentExchanges,planResidentWeather,ResidentActivityWorld,sampleActivityResident} from './resident-activities';
import {residentActionPose} from './resident-action-art';

const time={seed:'0123456789abcdef0123456789abcdef',dayLengthSeconds:720,elapsedSeconds:0};
function fixture(count=1){
  const scene:WorldScene={id:'test',width:600,height:400,coordinateVersion:1,spawn:{x:40,y:100},npcs:[],objects:[],terrain:[],districts:[],walkable:[[[14,14],[586,14],[586,386],[14,386]]],obstacles:[],
    scenery:[{id:'stall',asset:'stall',x:300,y:100,width:60,collidable:false},{id:'awning',asset:'arch',x:350,y:180,width:60,collidable:false}],
    activities:[{id:'service',ownerId:'stall',kind:'service',offsetX:0,offsetY:20},{id:'shelter',ownerId:'awning',kind:'shelter',offsetX:0,offsetY:20}],
    residents:[{id:'vendor',name:'Vendor',home:{x:100,y:100},speed:50,avatar:{hair:'#333333',skin:'#ccaa99',outfit:'#445566'},schedule:[{id:'serving',activityId:'service',action:'serve',startHour:8,endHour:12,durationSeconds:70}]}]};
  for(let i=0;i<count;i++){
    scene.activities!.push({id:`queue-${i}`,ownerId:'stall',kind:'wait',offsetX:-40+i*20,offsetY:50});
    scene.residents!.push({id:`customer-${i}`,name:`Customer ${i}`,home:{x:40,y:100+i*20},speed:50,avatar:{hair:'#333333',skin:'#ccaa99',outfit:'#445566'},
      schedule:[{id:'shopping',activityId:`queue-${i}`,action:'wait',startHour:8,endHour:12,durationSeconds:25,exchangeWith:{residentId:'vendor',taskId:'serving'}}]});
  }
  const nav=new NavigationGrid(scene.walkable,[],scene),residents=compileResidentActivities(scene,nav),dry=planResidentDay(residents,time,0);
  return {scene,nav,residents,dry,plan:planResidentExchanges(residents,dry,time)};
}

describe('coordinated resident exchanges',()=>{
  it('reserves both physical positions, faces partners and transfers a parcel once on the shared clock',()=>{
    const {residents,plan}=fixture(),exchange=plan.exchanges[0];expect(exchange).toBeDefined();
    const customer=residents.find(item=>item.spec.id==='customer-0')!,vendor=residents.find(item=>item.spec.id==='vendor')!;
    expect(plan.reservations).toHaveLength(2);
    const before=sampleActivityResident(vendor,plan,exchange.handover-.001),waiting=sampleActivityResident(customer,plan,exchange.handover-.001);
    expect(before).toMatchObject({phase:'act',facingLeft:true,heldObject:'parcel',exchange:{stage:'handover',speaking:true,german:'Hier, bitte.'}});
    expect(waiting).toMatchObject({phase:'act',facingLeft:false,heldObject:undefined,exchange:{stage:'handover',speaking:false}});
    const after=sampleActivityResident(customer,plan,exchange.handover);
    expect(after).toMatchObject({heldObject:'parcel',exchange:{stage:'thanks',speaking:true,german:'Danke!'}});
    expect(sampleActivityResident(vendor,plan,exchange.handover).heldObject).toBeUndefined();
    expect(after.exchange!.id).toBe(before.exchange!.id);
    expect(residentActionPose(after,true)).toEqual({frame:'carry',bakedObject:'parcel'});
    const returning=sampleActivityResident(customer,plan,exchange.end+.01);expect(returning).toMatchObject({phase:'return',heldObject:'parcel'});
    expect(returning.exchange).toBeUndefined();expect(residentActionPose(returning,true)?.bakedObject).toBe('parcel');
    const home=sampleActivityResident(customer,plan,exchange.customerHomeAt);expect(home.phase).toBe('home');expect(home.heldObject).toBeUndefined();
    for(const participant of [exchange.vendor,exchange.customer]){
      expect(plan.reservations.some(booking=>booking.residentId===participant.residentId&&booking.start<=exchange.start&&booking.end>=exchange.end)).toBe(true);
    }
  });

  it('queues distinct customer positions behind one vendor and skips visits that cannot fit',()=>{
    const {plan}=fixture(4);expect(plan.exchanges).toHaveLength(2);expect(plan.skipped).toHaveLength(2);
    const sorted=[...plan.exchanges].sort((a,b)=>a.start-b.start);expect(sorted[1].start).toBeGreaterThanOrEqual(sorted[0].end);
    for(const [i,a] of plan.reservations.entries())for(const b of plan.reservations.slice(i+1))if(Math.hypot(a.point.x-b.point.x,a.point.y-b.point.y)<16)expect(a.start>=b.end||a.end<=b.start).toBe(true);
  });

  it('waits through rain for the real resumed service and cancels when the vendor cannot return',()=>{
    const {scene,nav,residents,dry}=fixture(2),rain={start:250,end:285};
    const weather=planResidentWeather(scene,nav,residents,dry,rain),plan=planResidentExchanges(residents,weather,time,rain);
    expect(plan.exchanges.length).toBeGreaterThan(0);
    for(const exchange of plan.exchanges){
      const visit=plan.activities.find(item=>item.residentId===exchange.customer.residentId)!;
      expect(visit.departure).toBeGreaterThanOrEqual(rain.end);
      expect(sampleActivityResident(residents.find(item=>item.spec.id==='vendor')!,plan,exchange.start)).toMatchObject({phase:'act',resumed:true,exchange:{id:exchange.id}});
    }
    const storm={start:240,end:390};
    const cancelled=planResidentExchanges(residents,planResidentWeather(scene,nav,residents,dry,storm),time,storm);
    expect(cancelled.exchanges).toEqual([]);expect(cancelled.skipped).toHaveLength(2);
    expect(sampleActivityResident(residents.find(item=>item.spec.id==='customer-0')!,cancelled,300).phase).toBe('home');
  });

  it('honors customer-position reservations separately from vendor exchange locks',()=>{
    const {residents,dry,plan}=fixture();const first=plan.exchanges[0];
    const occupied={residentId:'earlier-visitor',taskId:'waiting',activityId:'queue-0',point:first.customer.point,place:0,start:240,end:270};
    const booked=planResidentExchanges(residents,{...dry,reservations:[...dry.reservations,occupied]},time);
    expect(booked.exchanges).toHaveLength(1);
    expect(booked.activities.find(item=>item.residentId==='customer-0')!.departure).toBe(270);
  });

  it('reconstructs late joins and reordered authors without frame routing or changing event IDs',()=>{
    const {scene,nav}=fixture(4),a=new ResidentActivityWorld(scene,nav),b=new ResidentActivityWorld({...scene,residents:[...scene.residents!].reverse()},nav);
    const first=a.day(time,'dry').plan;expect(b.day(time,'dry').plan).toEqual(first);
    const routing=vi.spyOn(nav,'findPath');routing.mockClear();
    for(let seconds=235;seconds<=365;seconds+=.25){
      const now={...time,elapsedSeconds:seconds-210};expect(a.sample(now,'dry')).toEqual(b.sample(now,'dry'));
    }
    expect(routing).not.toHaveBeenCalled();
    expect(new ResidentActivityWorld(scene,nav).day(time,'dry').plan.exchanges).toEqual(first.exchanges);
    expect(a.day({...time,elapsedSeconds:720},'dry').plan.exchanges[0].id).not.toBe(first.exchanges[0].id);
  });

  it('rejects missing partners, self service, impossible timing and distant or coincident positions',()=>{
    const {scene,nav}=fixture();
    for(const mutate of [
      (draft:WorldScene)=>{draft.residents![1].schedule[0].exchangeWith!.residentId='missing';},
      (draft:WorldScene)=>{draft.residents![1].schedule[0].exchangeWith!.residentId='customer-0';},
      (draft:WorldScene)=>{draft.residents![1].schedule[0].startHour=10;},
      (draft:WorldScene)=>{draft.activities![2].offsetX=-200;},
      (draft:WorldScene)=>{draft.activities![2].offsetX=0;draft.activities![2].offsetY=20;},
    ]){const draft=structuredClone(scene);mutate(draft);expect(()=>compileResidentActivities(draft,nav)).toThrow(/exchange/);}
    const document=structuredClone(sceneDocument);document.maps.lindenhafen.residents=scene.residents;document.maps.lindenhafen.activities=scene.activities;document.maps.lindenhafen.scenery.push(...scene.scenery);
    document.maps.lindenhafen.residents![1].schedule[0].exchangeWith!.taskId='missing';
    expect(()=>parseWorldSceneDocument(document)).toThrow(/missing or invalid service/);
  });

  it('authors two real Lindenhafen exchanges with continuous travel and compatible service',()=>{
    const scene=getWorldScene('lindenhafen'),nav=createMapNavigation('lindenhafen'),world=new ResidentActivityWorld(scene,nav);
    const plan=world.day(time,'dry').plan;expect(plan.exchanges).toHaveLength(2);expect(plan.skipped).toEqual([]);
    let previous=world.sample(time,'dry');
    for(let tick=1;tick<=1440;tick++){
      const samples=world.sample({...time,elapsedSeconds:tick/2},'dry');
      for(const [i,sample] of samples.entries()){
        expect(nav.isWalkable(sample.x,sample.y)).toBe(true);expect(Math.hypot(sample.x-previous[i].x,sample.y-previous[i].y)).toBeLessThanOrEqual(world.residents[i].spec.speed/2+.001);
      }previous=samples;
    }
  });

  it('never schedules a ghost exchange across varied regional forecasts',()=>{
    const scene=getWorldScene('lindenhafen'),world=new ResidentActivityWorld(scene,createMapNavigation('lindenhafen'));
    let cancelled=0;
    for(let day=0;day<8;day++){
      const plan=world.day({...time,elapsedSeconds:day*720}).plan;cancelled+=plan.skipped.length;
      for(const exchange of plan.exchanges)for(const seconds of [exchange.start+.001,exchange.handover-.001,exchange.handover,exchange.end-.001]){
        const samples=[exchange.customer,exchange.vendor].map(participant=>sampleActivityResident(world.residents.find(item=>item.spec.id===participant.residentId)!,plan,seconds));
        expect(samples.every(sample=>sample.phase==='act'&&sample.exchange?.id===exchange.id&&sample.interruption===undefined)).toBe(true);
        expect(samples.filter(sample=>sample.exchange?.speaking)).toHaveLength(1);
        expect(samples.filter(sample=>sample.heldObject==='parcel')).toHaveLength(seconds>=exchange.start+(exchange.end-exchange.start)*.5?1:0);
      }
    }
    expect(cancelled).toBeGreaterThan(0);
  });
});
