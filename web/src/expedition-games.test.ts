import { describe, expect, it } from 'vitest';
import { checkExpeditionPlan, expeditionGames, expeditionGameStatus, expeditionNotebook, freshExpeditionPlan, loadExpeditionPlan, saveExpeditionPlan } from './expedition-games';
import type { Level } from './content';

function memoryStorage() { const values = new Map<string,string>(); return { getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);} }; }
describe('ten neighborhood planning games',()=>{
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
