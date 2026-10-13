import {expect,it} from 'vitest';
import {getWorldScene} from './scene-data';
import {createMapNavigation} from './navigation';
import {ResidentActivityWorld} from './resident-activities';

it('runs Waldruh’s work, supply exchange and evening visits continuously on connected ground',()=>{
  const scene=getWorldScene('waldruh'),nav=createMapNavigation('waldruh', {agentRadius:0}),world=new ResidentActivityWorld(scene,nav);
  const time={seed:'0123456789abcdef0123456789abcdef',dayLengthSeconds:720,elapsedSeconds:0};
  expect(world.residents).toHaveLength(2);
  const dry=world.day(time,'dry').plan;
  expect(dry.activities).toHaveLength(8);expect(dry.skipped).toEqual([]);expect(dry.exchanges).toHaveLength(1);
  for(const weather of ['dry','shower'] as const){
    let previous=world.sample(time,weather);
    for(let tick=1;tick<=1440;tick++){
      const current=world.sample({...time,elapsedSeconds:tick/2},weather);
      for(const [i,sample]of current.entries()){
        expect(nav.isWalkable(sample.x,sample.y),sample.residentId).toBe(true);
        expect(Math.hypot(sample.x-previous[i].x,sample.y-previous[i].y)).toBeLessThanOrEqual(world.residents[i].spec.speed/2+.001);
      }
      previous=current;
    }
  }
},30000);
