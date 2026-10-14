import { describe, expect, it } from 'vitest';
import { emptyProgress, type MemoryItem } from './api';
import { expectedEvidenceCard } from './test-support/activity-solutions';
import {
  activityAudioJobs, activityDefinitions, activityScenarios, applyActivityAction, evaluateActivity, exerciseForScenario,
  initialActivityState, marketTotal, selectActivityScenarios, shuffledDetectiveBoard, shuffledCafeActions, type ActivityAction, type ActivityScenario, type ActivityState,
} from './activity-engine';

/** Solve by the same actions the player can perform, rather than assigning goal state. */
function solve(scene:ActivityScenario):ActivityState {
  let state=initialActivityState(scene);
  const act=(action:ActivityAction)=>{state=applyActivityAction(scene,state,action);};
  const board=scene.board;
  if(board.kind==='cafe') {
    for(const [id,quantity] of Object.entries(board.goal.items)) for(let i=0;i<quantity;i++)act({type:'item',id,delta:1});
    for(const id of board.goal.steps)act({type:'step',id});
    if(board.goal.service)act({type:'service',value:board.goal.service});
    if(board.goal.venue)act({type:'venue',value:board.goal.venue});
    if(board.goal.slot)act({type:'slot',value:board.goal.slot});
  } else if(board.kind==='market') {
    if(board.trade)act({type:'trade'});
    if(state.kind!=='market')throw new Error('Wrong market board.');
    for(const [id,quantity] of Object.entries(state.basket)) if(!board.goal[id]) for(let i=0;i<quantity;i++)act({type:'item',id,delta:-1});
    for(const [id,quantity] of Object.entries(board.goal)) {
      if(state.kind!=='market')throw new Error('Wrong market board.');
      const missing=quantity-(state.basket[id]??0);
      for(let i=0;i<missing;i++)act({type:'item',id,delta:1});
    }
    act({type:'payment',value:board.method});
    if(state.kind!=='market')throw new Error('Wrong market board.');
    let change=board.method==='cash'?board.tender-marketTotal(state):0;
    for(const coin of [1000,500,200,100,50,20,10]) while(change>=coin){act({type:'coin',value:coin});change-=coin;}
    expect(change).toBe(0);
  } else if(board.kind==='detective') {
    for(const slot of board.slots)act({type:'link',slotId:slot.id,cardId:expectedEvidenceCard(scene,slot.id)});
  } else {
    act({type:'parcel',value:board.parcel});act({type:'transport',value:board.transport});
    if(board.departure)act({type:'departure',value:board.departure});
    if(board.help)act({type:'help'});
    for(const point of board.path.slice(1)) {
      if(state.kind!=='delivery')throw new Error('Wrong delivery board.');
      const dx=point.x-state.position.x,dy=point.y-state.position.y,next=dx>0?1:dx<0?3:dy>0?2:0;
      const turn=(next-state.heading+4)%4;
      act({type:'turn',value:turn===0?'straight':turn===1?'right':turn===2?'back':'left'});
    }
  }
  return state;
}

describe('the authored activity catalog',()=>{
  it('has twelve scenes for each playable mechanic, four per level, with valid canonical targets',()=>{
    expect(activityDefinitions.map(definition=>definition.id)).toEqual(['cafe','market','detective','delivery']);
    expect(activityScenarios).toHaveLength(48);
    expect(new Set(activityScenarios.map(scene=>scene.id)).size).toBe(48);
    for(const definition of activityDefinitions) {
      expect(activityScenarios.filter(scene=>scene.activityId===definition.id)).toHaveLength(12);
      for(const level of definition.levels) {
        const pool=activityScenarios.filter(scene=>scene.activityId===definition.id&&scene.level===level);
        expect(pool).toHaveLength(4);
        expect(new Set(pool.map(scene=>scene.exerciseId)).size).toBe(4);
        for(const scene of pool)expect(exerciseForScenario(scene).id).toBe(scene.exerciseId);
      }
    }
  });

  it('can demonstrate every authored scene through player actions and serializes detective proof',()=>{
    for(const scene of activityScenarios) {
      const initial=evaluateActivity(scene,initialActivityState(scene));
      expect(initial.valid,scene.id).toBe(false);
      expect(initial.answer,scene.id).not.toBe(exerciseForScenario(scene).answer);
      const result=evaluateActivity(scene,solve(scene));
      expect(result.feedback,scene.id).toEqual([]);
      expect(result.valid,scene.id).toBe(true);
      if(scene.board.kind==='detective')expect(result.answer,scene.id).toMatch(/^Meine Lösung:/);
      else expect(result.answer,scene.id).toBe(exerciseForScenario(scene).answer);
    }
  });

  it('bundles stable German order, witness and direction audio without duplicate IDs',()=>{
    expect(new Set(activityAudioJobs.map(job=>job.id)).size).toBe(activityAudioJobs.length);
    for(const scene of activityScenarios)expect(activityAudioJobs.some(job=>job.text===scene.german)).toBe(true);
    for(const job of activityAudioJobs){expect(job.id).toMatch(/^[a-z0-9-]{1,100}$/);expect(job.text.trim().length).toBeGreaterThan(3);}
  });
});

describe('café consequences',()=>{
  const scene=activityScenarios.find(scene=>scene.id==='cafe-a1-milk-and-secrets')!;
  it('never gives away the recipe in the action palette, and changes replay layouts',()=>{
    for(const scenario of activityScenarios.filter(scenario=>scenario.board.kind==='cafe')) {
      if(scenario.board.kind!=='cafe')throw new Error('Wrong board.');
      const board=scenario.board,original=[...board.actions],layouts=new Set<string>();
      for(let retry=0;retry<40;retry++) {
        const seed=`retry-${retry}`,actions=shuffledCafeActions(board,seed);
        expect(shuffledCafeActions(board,seed)).toEqual(actions);
        expect([...actions].sort()).toEqual([...original].sort());
        expect(actions.filter(action=>board.goal.steps.includes(action))).not.toEqual(board.goal.steps);
        layouts.add(actions.join(','));
      }
      expect(layouts.size).toBeGreaterThan(1);expect(board.actions).toEqual(original);
    }
  });
  it('rejects the wrong quantity, missing milk and wrong cooking sequence even if one feature is right',()=>{
    const complete=solve(scene);
    expect(complete.kind).toBe('cafe');
    expect(evaluateActivity(scene,applyActivityAction(scene,complete,{type:'item',id:'milk',delta:-1})).valid).toBe(false);
    expect(evaluateActivity(scene,applyActivityAction(scene,complete,{type:'item',id:'coffee',delta:1})).valid).toBe(false);
    expect(evaluateActivity(scene,applyActivityAction(scene,complete,{type:'undo-step'})).valid).toBe(false);
  });
  it('allows an honest retry and ignores impossible inventory actions',()=>{
    const initial=initialActivityState(scene);
    expect(applyActivityAction(scene,initial,{type:'item',id:'not-on-the-counter',delta:1})).toBe(initial);
    expect(applyActivityAction(scene,initial,{type:'item',id:'coffee',delta:Number.NaN})).toBe(initial);
    const wrong=applyActivityAction(scene,solve(scene),{type:'item',id:'tea',delta:1});
    expect(evaluateActivity(scene,wrong).valid).toBe(false);
    expect(evaluateActivity(scene,applyActivityAction(scene,wrong,{type:'item',id:'tea',delta:-1})).valid).toBe(true);
  });
});

describe('market arithmetic and exchanges',()=>{
  it('requires correct cash change and the requested payment method',()=>{
    const scene=activityScenarios.find(scene=>scene.id==='market-a1-two-apples')!,state=solve(scene);
    expect(state.kind).toBe('market');
    if(state.kind!=='market')return;
    expect(marketTotal(state)).toBe(240);
    expect(state.changeCoins.reduce((sum,coin)=>sum+coin,0)).toBe(260);
    expect(evaluateActivity(scene,applyActivityAction(scene,state,{type:'coin',value:10})).valid).toBe(false);
    expect(evaluateActivity(scene,applyActivityAction(scene,state,{type:'payment',value:'card'})).valid).toBe(false);
  });
  it('rejects buying substitute goods without actually performing the promised exchange',()=>{
    const scene=activityScenarios.find(scene=>scene.id==='market-a2-a-good-exchange')!;
    let state=initialActivityState(scene);
    state=applyActivityAction(scene,state,{type:'item',id:'meat',delta:-1});
    for(let i=0;i<2;i++)state=applyActivityAction(scene,state,{type:'item',id:'vegetables',delta:1});
    state=applyActivityAction(scene,state,{type:'coin',value:200});
    expect(evaluateActivity(scene,state).feedback).toContain('Use the agreed exchange offer; buying new goods does not complete the trade.');
    expect(evaluateActivity(scene,solve(scene)).valid).toBe(true);
  });
  it('keeps counts bounded and resets change when the basket changes',()=>{
    const scene=activityScenarios.find(scene=>scene.id==='market-a1-two-apples')!;
    let state=solve(scene);
    for(let i=0;i<40;i++)state=applyActivityAction(scene,state,{type:'item',id:'apple',delta:1});
    if(state.kind!=='market')throw new Error('Wrong board.');
    expect(state.basket.apple).toBe(9);expect(state.changeCoins).toEqual([]);
    expect(evaluateActivity(scene,state).valid).toBe(false);
  });
});

describe('evidence reconstruction',()=>{
  it('checks completeness locally while leaving complete but incorrect links for server grading',()=>{
    const scene=activityScenarios.find(scene=>scene.activityId==='detective')!,board=scene.board;
    if(board.kind!=='detective')throw new Error('Wrong board.');
    expect(board.slots.every(slot=>!('expected' in slot))).toBe(true);
    let state=solve(scene);
    if(state.kind!=='detective')throw new Error('Wrong board.');
    const [first,second]=board.slots;
    state={...state,links:{...state.links,[first.id]:state.links[second.id],[second.id]:state.links[first.id]}};
    const ready=evaluateActivity(scene,state);
    expect(ready.valid).toBe(true);expect(ready.feedback).toEqual([]);
    expect(ready.answer).toMatch(/^Meine Lösung:/);
    expect(ready.answer).not.toBe(exerciseForScenario(scene).answer);
    expect(evaluateActivity(scene,applyActivityAction(scene,state,{type:'unlink',slotId:first.id})).valid).toBe(false);
  });

  it('varies each independent evidence palette without needing the answer key',()=>{
    for(const scene of activityScenarios.filter(scene=>scene.activityId==='detective')) {
      if(scene.board.kind!=='detective')throw new Error('Wrong board.');
      const original=structuredClone(scene.board),layouts=new Set<string>();
      for(let attempt=0;attempt<100;attempt++) {
        const seed=`run-${attempt}:${scene.id}`,board=shuffledDetectiveBoard(scene.board,seed);
        expect(shuffledDetectiveBoard(scene.board,seed)).toEqual(board);
        expect([...board.cards].sort((a,b)=>a.id.localeCompare(b.id))).toEqual([...original.cards].sort((a,b)=>a.id.localeCompare(b.id)));
        expect([...board.slots].sort((a,b)=>a.id.localeCompare(b.id))).toEqual([...original.slots].sort((a,b)=>a.id.localeCompare(b.id)));
        layouts.add(JSON.stringify([board.cards.map(card=>card.id),board.slots.map(slot=>slot.id)]));
        expect(board.slots.every(slot=>!('expected' in slot))).toBe(true);
        const shuffledScene={...scene,board};
        expect(evaluateActivity(shuffledScene,solve(shuffledScene)).valid).toBe(true);
      }
      expect(layouts.size).toBeGreaterThan(1);
      expect(scene.board).toEqual(original);
    }
  });

  it('needs all links, prevents duplicate placement, and permits moving the same slip',()=>{
    const scene=activityScenarios.find(scene=>scene.id==='detective-b1-a-timetable-disagrees')!,board=scene.board;
    if(board.kind!=='detective')throw new Error('Wrong board.');
    let state=solve(scene);
    state=applyActivityAction(scene,state,{type:'link',slotId:board.slots[1].id,cardId:expectedEvidenceCard(scene,board.slots[0].id)});
    if(state.kind!=='detective')throw new Error('Wrong board.');
    expect(state.links[board.slots[0].id]).toBeUndefined();
    expect(Object.values(state.links).filter(value=>value===expectedEvidenceCard(scene,board.slots[0].id))).toHaveLength(1);
    expect(evaluateActivity(scene,state).valid).toBe(false);
    state=applyActivityAction(scene,state,{type:'link',slotId:board.slots[0].id,cardId:expectedEvidenceCard(scene,board.slots[0].id)});
    state=applyActivityAction(scene,state,{type:'link',slotId:board.slots[1].id,cardId:expectedEvidenceCard(scene,board.slots[1].id)});
    expect(evaluateActivity(scene,state).valid).toBe(true);
  });
});

describe('delivery navigation',()=>{
  it('blocks walls without losing the parcel and requires the real recipient and connection',()=>{
    const scene=activityScenarios.find(scene=>scene.id==='delivery-a1-left-to-the-pharmacy')!;
    let state=initialActivityState(scene);
    state=applyActivityAction(scene,state,{type:'parcel',value:'Ada'});
    const blocked=applyActivityAction(scene,state,{type:'turn',value:'straight'});
    if(blocked.kind!=='delivery'||state.kind!=='delivery')throw new Error('Wrong board.');
    expect(blocked.position).toEqual(state.position);expect(blocked.parcel).toBe('Ada');expect(blocked.lastEvent).toContain('blocks');
    const complete=solve(scene);
    expect(evaluateActivity(scene,applyActivityAction(scene,complete,{type:'parcel',value:'Marta'})).valid).toBe(false);
    expect(evaluateActivity(scene,applyActivityAction(scene,complete,{type:'transport',value:'bus'})).valid).toBe(false);
  });
  it('requires help before a damaged crossing and a correct departure for the connection',()=>{
    const scene=activityScenarios.find(scene=>scene.id==='delivery-b1-ask-for-help')!,board=scene.board;
    if(board.kind!=='delivery')throw new Error('Wrong board.');
    let state=initialActivityState(scene);
    for(const point of board.path.slice(1)) {
      if(state.kind!=='delivery')throw new Error('Wrong board.');
      const dx=point.x-state.position.x,dy=point.y-state.position.y,next=dx>0?1:dx<0?3:dy>0?2:0,turn=(next-state.heading+4)%4;
      const before=state;
      state=applyActivityAction(scene,state,{type:'turn',value:turn===0?'straight':turn===1?'right':turn===2?'back':'left'});
      if(point.x===board.checkpoint.x&&point.y===board.checkpoint.y){if(state.kind!=='delivery')throw new Error('Wrong board.');expect(state.position).toEqual(before.position);expect(state.lastEvent).toContain('needs help');break;}
    }
    expect(evaluateActivity(scene,solve(scene)).valid).toBe(true);
    const train=activityScenarios.find(scene=>scene.id==='delivery-a2-twenty-minutes')!;
    expect(evaluateActivity(train,applyActivityAction(train,solve(train),{type:'departure',value:'09:40'})).valid).toBe(false);
  });
});

describe('adaptive mission selection',()=>{
  const remembered=(itemId:string,dueAt:string):MemoryItem=>({itemId,dueAt,lastSeenAt:'2026-10-01T00:00:00Z',stabilityDays:10,difficulty:5,repetitions:5,lapses:0,modeStats:{}});
  it('selects three unique scenes and favors due/new language before comfortable language',()=>{
    const progress=emptyProgress(),pool=activityScenarios.filter(scene=>scene.activityId==='cafe'&&scene.level==='A1'),now=Date.parse('2026-10-09T00:00:00Z');
    for(const scene of pool){const id=exerciseForScenario(scene).itemId;progress.items[id]=remembered(id,'2026-11-01T00:00:00Z');}
    const due=exerciseForScenario(pool[0]).itemId;progress.items[due].dueAt='2026-10-01T00:00:00Z';
    delete progress.items[exerciseForScenario(pool[1]).itemId];
    const selected=selectActivityScenarios('cafe','A1',progress,'mission-seed',now);
    expect(selected.familiar).toBe(false);expect(selected.scenarios).toHaveLength(3);
    expect(selected.scenarios.slice(0,2).map(scene=>scene.id)).toEqual([pool[0].id,pool[1].id]);
    expect(new Set(selected.scenarios.map(scene=>scene.id)).size).toBe(3);
    expect(selectActivityScenarios('cafe','A1',progress,'mission-seed',now)).toEqual(selected);
  });
  it('marks a fully comfortable pool as resting so another run requires an explicit choice',()=>{
    const progress=emptyProgress(),now=Date.parse('2026-10-09T00:00:00Z');
    for(const scene of activityScenarios.filter(scene=>scene.activityId==='market'&&scene.level==='B1')){const id=exerciseForScenario(scene).itemId;progress.items[id]=remembered(id,'2026-11-01T00:00:00Z');}
    expect(selectActivityScenarios('market','B1',progress,'seed',now).familiar).toBe(true);
  });
});
