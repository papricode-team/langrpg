import './test-support/expedition-fixtures';
import { describe, expect, it } from 'vitest';
import { checkExpeditionPlan, expeditionGames, expeditionGameStatus, expeditionNotebook, freshExpeditionPlan, loadExpeditionPlan, saveExpeditionPlan, shuffledExpeditionSteps, expeditionGameAudioJobs, expeditionAgreement } from './expedition-games';
import type { Level } from './content';

function memoryStorage() { const values = new Map<string,string>(); return { getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);} }; }
describe('ten neighborhood planning games',()=>{
  it('accepts two or three meaningful allocations per scaffold while keeping hard constraints',()=>{
    const variants:Record<string,Record<string,number>[]>={
      saffroncourt:[{arrival:16},{arrival:18}],rainmarket:[{end:19},{start:19}],windplain:[{water:5},{food:3}],
      riverweave:[{veg:3}],terracielo:[{pickup:14},{pickup:16}],sunpatch:[{broadcast:6}],kigalights:[{edit:17}],
      cedarbay:[{time:12},{time:13}],seoulsteps:[{end:20},{start:20}],dunegarden:[{shared:5,young:2},{shared:5,trees:2}],
    };
    for(const game of expeditionGames) {
      const valid:Record<string,number>[]=[];
      const visit=(index:number,values:Record<string,number>)=>{
        if(index===game.fields.length){if(!game.validate(values).length)valid.push({...values});return;}
        for(const option of game.fields[index].options)visit(index+1,{...values,[game.fields[index].id]:option.value});
      };
      visit(0,{});
      expect(valid.length,game.id).toBe(variants[game.id].length+1);
      for(const level of ['A1','A2','B1'] as const)for(const change of [{},...variants[game.id]]) {
        const plan=freshExpeditionPlan(game,level);plan.values={...game.solution,...change};plan.order=game.steps.map(step=>step.id);
        expect(checkExpeditionPlan(game,plan).correct,`${game.id}:${level}:${JSON.stringify(change)}`).toBe(true);
        expect(expeditionAgreement(game,plan.values).length).toBeGreaterThan(30);
      }
    }
    const garden=expeditionGames.find(game=>game.id==='dunegarden')!;
    expect(garden.validate({...garden.solution,shared:6,young:2,trees:2})).not.toEqual([]);
    const camp=expeditionGames.find(game=>game.id==='windplain')!;
    expect(camp.validate({...camp.solution,water:5,food:3})).not.toEqual([]);
    const studio=expeditionGames.find(game=>game.id==='kigalights')!;
    expect(studio.validate({...studio.solution,entrance:1,edit:17})).not.toEqual([]);
  });
  it('varies the pieces on replay without printing a complete solution',()=>{
    for(const game of expeditionGames) {
      const original=game.steps.map(step=>step.id),layouts=new Set<string>();
      for(let retry=0;retry<40;retry++) {
        const seed=`run-${retry}`,pieces=shuffledExpeditionSteps(game,seed);
        expect(shuffledExpeditionSteps(game,seed)).toEqual(pieces);
        expect(pieces.map(piece=>piece.id)).not.toEqual(original);
        expect(pieces.map(piece=>piece.id).sort()).toEqual([...original].sort());
        layouts.add(pieces.map(piece=>piece.id).join(','));
      }
      expect(layouts.size).toBeGreaterThan(1);expect(game.steps.map(step=>step.id)).toEqual(original);
    }
    expect(expeditionGameAudioJobs).toHaveLength(30);
    expect(new Set(expeditionGameAudioJobs.map(job=>job.id)).size).toBe(30);
  });
  it('requires a workable resource plan and a fully assembled sequence in every region and scaffold',()=>{
    expect(expeditionGames).toHaveLength(10);
    expect(new Set(expeditionGames.map(game=>game.id)).size).toBe(10);
    for(const game of expeditionGames) for(const level of ['A1','A2','B1'] as Level[]) {
      const fresh=freshExpeditionPlan(game,level);
      expect(checkExpeditionPlan(game,fresh).correct,`${game.id} should need player actions`).toBe(false);
      fresh.values={...game.solution};
      expect(checkExpeditionPlan(game,fresh).correct,`${game.id} should require sequence`).toBe(false);
      fresh.order=game.steps.map(step=>step.id);
      expect(checkExpeditionPlan(game,fresh).correct,`${game.id} authored solution`).toBe(true);
      fresh.order.reverse();
      expect(checkExpeditionPlan(game,fresh).correct,`${game.id} rejects reversed sequence`).toBe(false);
    }
  });
  it('includes fares in the floating market budget and cargo in ferry capacity',()=>{
    const market=expeditionGames.find(game=>game.id==='riverweave')!;
    const plan=freshExpeditionPlan(market,'A2'); plan.values={...market.solution,route:7};plan.order=market.steps.map(step=>step.id);
    expect(checkExpeditionPlan(market,plan).feedback.join(' ')).toContain('Fahrpreis');
    const ferry=expeditionGames.find(game=>game.id==='cedarbay')!;
    const ferryPlan=freshExpeditionPlan(ferry,'A1');ferryPlan.values={...ferry.solution,people:5};ferryPlan.order=ferry.steps.map(step=>step.id);
    expect(checkExpeditionPlan(ferry,ferryPlan).feedback.join(' ')).toContain('sechs Plätze');
  });
  it('preserves incomplete work by level without manufacturing completion',()=>{
    const storage=memoryStorage(),game=expeditionGames[0],plan=freshExpeditionPlan(game,'A1');
    plan.values.permission=1;plan.order=['workshop','gate'];plan.attempts=2;
    saveExpeditionPlan(game,plan,storage);
    expect(loadExpeditionPlan(game,'A1',storage)).toEqual(plan);
    expect(loadExpeditionPlan(game,'B1',storage).order).toEqual([]);
    plan.completed=true;saveExpeditionPlan(game,plan,storage);
    expect(loadExpeditionPlan(game,'A1',storage).completed).toBe(false);
    plan.values={...game.solution};plan.order=game.steps.map(step=>step.id);saveExpeditionPlan(game,plan,storage);
    expect(loadExpeditionPlan(game,'A1',storage).completed).toBe(true);
  });
  it('sanitizes stale ids, duplicate steps, and invalid resource values',()=>{
    const game=expeditionGames[0],storage=memoryStorage();
    storage.setItem(`atlas.expedition.plan.v1.${game.id}.A1`,JSON.stringify({version:1,level:'A1',values:{permission:999,gate:0,recipient:2},order:['workshop','workshop','invented','gate'],completed:true,attempts:-10}));
    const plan=loadExpeditionPlan(game,'A1',storage);
    expect(plan.values.permission).toBe(0);expect(plan.order).toEqual(['workshop','gate']);expect(plan.attempts).toBe(0);expect(plan.completed).toBe(false);
  });
  it('keeps games and notebook playable when the browser blocks the default storage getter',()=>{
    const game=expeditionGames[0],plan=freshExpeditionPlan(game,'A1');
    const original=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
    Object.defineProperty(globalThis,'localStorage',{configurable:true,get:()=>{throw new Error('Storage access blocked');}});
    try {
      expect(loadExpeditionPlan(game,'A1')).toEqual(plan);
      expect(()=>saveExpeditionPlan(game,plan)).not.toThrow();
      expect(expeditionGameStatus(game.id,'A1')).toBe('new');
      expect(expeditionNotebook()).toBe('');
      const provided=memoryStorage();
      plan.values.permission=1;
      saveExpeditionPlan(game,plan,provided);
      expect(loadExpeditionPlan(game,'A1',provided)).toEqual(plan);
    } finally {
      if(original) Object.defineProperty(globalThis,'localStorage',original);
      else Reflect.deleteProperty(globalThis,'localStorage');
    }
  });
  it('starts a fresh plan and continues play when storage methods reject reads or writes',()=>{
    const game=expeditionGames[0],plan=freshExpeditionPlan(game,'B1');
    const blocked={getItem:()=>{throw new Error('Read blocked');},setItem:()=>{throw new Error('Write blocked');}};
    expect(loadExpeditionPlan(game,'B1',blocked)).toEqual(plan);
    expect(()=>saveExpeditionPlan(game,plan,blocked)).not.toThrow();
  });
});
