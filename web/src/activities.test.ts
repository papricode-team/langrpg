import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountActivity, type ActivityCompletionContext, type ActivityContext, type MountActivityOptions } from './activities';
import { activityScenarios, marketTotal, shuffledDetectiveBoard, type ActivityScenario, type ActivityState } from './activity-engine';
import { emptyProgress } from './api';
import { answerMatches } from './learning';

// A small event-root fixture exercises the actual delegated UI handlers and
// asynchronous save controller without emulating browser layout or drag APIs.
class EventRoot {
  innerHTML='';
  listeners=new Map<string,EventListener>();
  contains(value:unknown){return value!==null&&value!==undefined;}
  querySelectorAll(){return [];}
  addEventListener(type:string,listener:EventListener){this.listeners.set(type,listener);}
  removeEventListener(type:string){this.listeners.delete(type);}
  replaceChildren(){this.innerHTML='';}
  click(act:string,value=''){
    const button={dataset:{act,value},disabled:false,closest(){return this;}};
    this.listeners.get('click')?.({target:button,stopPropagation(){}} as unknown as Event);
  }
}
let saved:Map<string,string>;
beforeEach(()=>{
  saved=new Map();
  vi.stubGlobal('document',{activeElement:null});
  vi.stubGlobal('localStorage',{getItem:(key:string)=>saved.get(key)??null,setItem:(key:string,value:string)=>saved.set(key,value),removeItem:(key:string)=>saved.delete(key)});
});
afterEach(()=>vi.unstubAllGlobals());
const flush=async()=>{for(let i=0;i<6;i++)await Promise.resolve();};
const run=()=>JSON.parse([...saved.values()][0]) as {runId:string;scenarioIds:string[];index:number;state:ActivityState;stage:string;exerciseIds:string[];attemptIds:string[];hinted:boolean;pending?:{context:ActivityContext};};
const scene=()=>activityScenarios.find(scene=>scene.id===run().scenarioIds[run().index])!;

function solveViaControls(root:EventRoot,scenario:ActivityScenario):void {
  const board=scenario.board;
  if(board.kind==='cafe') {
    for(const [id,quantity] of Object.entries(board.goal.items))for(let i=0;i<quantity;i++)root.click('add-item',id);
    for(const step of board.goal.steps)root.click('step',step);
    if(board.goal.venue)root.click('venue',board.goal.venue);
    if(board.goal.service)root.click('service',board.goal.service);
    if(board.goal.slot)root.click('slot',board.goal.slot);
  } else if(board.kind==='market') {
    if(board.trade)root.click('trade');
    const current=run().state;if(current.kind!=='market')throw new Error('Wrong board.');
    for(const [id,quantity] of Object.entries(current.basket))if(!board.goal[id])for(let i=0;i<quantity;i++)root.click('remove-item',id);
    for(const [id,quantity] of Object.entries(board.goal)){
      const state=run().state;if(state.kind!=='market')throw new Error('Wrong board.');
      for(let i=state.basket[id]??0;i<quantity;i++)root.click('add-item',id);
    }
    root.click('payment',board.method);
    const state=run().state;if(state.kind!=='market')throw new Error('Wrong board.');
    let change=board.method==='cash'?board.tender-marketTotal(state):0;
    for(const coin of [1000,500,200,100,50,20,10])while(change>=coin){root.click('coin',String(coin));change-=coin;}
  } else if(board.kind==='detective') {
    for(const slot of board.slots){root.click('select-card',slot.expected);root.click('place-card',slot.id);}
  } else {
    root.click('parcel',board.parcel);root.click('transport',board.transport);
    if(board.departure)root.click('departure',board.departure);
    if(board.help)root.click('help');
    for(const point of board.path.slice(1)){
      const state=run().state;if(state.kind!=='delivery')throw new Error('Wrong board.');
      const dx=point.x-state.position.x,dy=point.y-state.position.y,next=dx>0?1:dx<0?3:dy>0?2:0,turn=(next-state.heading+4)%4;
      root.click('turn',turn===0?'straight':turn===1?'right':turn===2?'back':'left');
    }
  }
}

function mount(root:EventRoot,override:Partial<MountActivityOptions>={}){
  const progress=emptyProgress();
  const submit=vi.fn<MountActivityOptions['submit']>(async(exercise,answer,_hinted,_mode,context)=>({correct:answerMatches(exercise,answer),progress,xpAdded:0,attemptId:context!.attemptId}));
  const complete=vi.fn<MountActivityOptions['complete']>(async()=>({progress,xpAdded:20}));
  const onProgress=vi.fn(),speak=vi.fn();
  const controller=mountActivity(root as unknown as HTMLElement,{id:'cafe',level:'A1',progress,sessionKey:'test-player',submit,complete,onProgress,speak,...override});
  return {controller,submit,complete,onProgress,speak};
}

describe('playable mission controller',()=>{
  it('keeps shuffled evidence and slots stable through placement, reset, pause and reopening',async()=>{
    const root=new EventRoot(),{controller}=mount(root,{id:'detective'});
    const current=scene(),board=current.board;
    if(board.kind!=='detective')throw new Error('Wrong board.');
    const order=(element:EventRoot,act:string)=>Array.from(element.innerHTML.matchAll(new RegExp(`<button[^>]*data-act="${act}"[^>]*data-value="([^"]+)"`,'g')),match=>match[1]);
    const cards=order(root,'select-card'),slots=order(root,'place-card');
    const expected=shuffledDetectiveBoard(board,`${run().runId}:${current.id}`);
    expect(cards).toEqual(expected.cards.map(card=>card.id));
    expect(slots).toEqual(expected.slots.map(slot=>slot.id));
    const unchanged=(element:EventRoot)=>{
      expect(order(element,'select-card')).toEqual(cards);
      expect(order(element,'place-card')).toEqual(slots);
    };
    root.click('select-card',cards[0]);unchanged(root);
    root.click('place-card',slots[0]);unchanged(root);
    const linked=run().state;
    controller.pause();controller.resume();unchanged(root);
    controller.destroy();
    const resumed=new EventRoot();mount(resumed,{id:'detective'});unchanged(resumed);
    expect(run().state).toEqual(linked);
    resumed.click('reset-board');unchanged(resumed);
    expect(run().state).toEqual({kind:'detective',links:{}});
    solveViaControls(resumed,current);resumed.click('submit');await flush();
    expect(run().stage).toBe('scene-complete');
    resumed.click('next');await flush();
    const next=scene();
    if(next.board.kind!=='detective')throw new Error('Wrong board.');
    const nextLayout=shuffledDetectiveBoard(next.board,`${run().runId}:${next.id}`);
    expect(order(resumed,'select-card')).toEqual(nextLayout.cards.map(card=>card.id));
    expect(order(resumed,'place-card')).toEqual(nextLayout.slots.map(slot=>slot.id));
  });

  it('keeps panel and reference navigation separate from saved actions and learning assistance',()=>{
    const root=new EventRoot(),onSceneVisible=vi.fn(),{controller,submit}=mount(root,{onSceneVisible});
    const board=scene().board;
    if(board.kind!=='cafe')throw new Error('Wrong board.');
    root.click('add-item',board.stock[0]);
    const before=run();
    root.click('panel','kitchen');root.click('guide');root.click('guide');
    expect(run()).toEqual(before);
    expect(submit).not.toHaveBeenCalled();expect(onSceneVisible).toHaveBeenCalledTimes(1);
    root.click('hint');
    expect(run().hinted).toBe(true);expect(run().state).toEqual(before.state);
    expect(root.innerHTML).toContain('aria-label="Mission help"');
    controller.pause();controller.resume();
    expect(run().state).toEqual(before.state);expect(onSceneVisible).toHaveBeenCalledTimes(1);
  });

  it('speaks the turn from the current heading after a courier backtracks',()=>{
    const root=new EventRoot(),{speak}=mount(root,{id:'delivery'}),board=scene().board,state=run().state;
    if(board.kind!=='delivery'||state.kind!=='delivery')throw new Error('Wrong board.');
    const next=board.path[1],dx=next.x-state.position.x,dy=next.y-state.position.y;
    const heading=dx>0?1:dx<0?3:dy>0?2:0,turn=(heading-state.heading+4)%4;
    root.click('turn',turn===0?'straight':turn===1?'right':turn===3?'left':'back');
    root.click('turn','back');root.click('speak-current-direction');
    expect((run().state as {position:unknown}).position).toEqual(board.start);
    expect(speak).toHaveBeenLastCalledWith('Kehre um.');
    expect(run().hinted).toBe(false);
  });

  it('submits actual wrong actions, retries the scene, and sends exactly three fresh correct proofs to completion',async()=>{
    const root=new EventRoot(),{controller,submit,complete}=mount(root);
    root.click('submit');await flush();
    expect(submit).toHaveBeenCalledTimes(1);expect(run().stage).toBe('playing');expect(run().exerciseIds).toEqual([]);
    expect(submit.mock.calls[0][1]).toMatch(/^Meine Lösung:/);expect(run().hinted).toBe(true);
    for(let round=0;round<3;round++){
      const current=scene();solveViaControls(root,current);root.click('submit');await flush();
      expect(run().stage).toBe('scene-complete');
      const call=submit.mock.calls.at(-1)!;
      expect(call[1]).toBe(call[0].answer);expect(call[3]).toBe('recognition');
      expect(call[4]?.runId).toBe(run().runId);expect(call[4]?.scenarioId).toBe(current.id);
      if(call[0].mode!=='choice')expect(call[2]).toBe(true);
      root.click('next');await flush();
    }
    expect(complete).toHaveBeenCalledTimes(1);expect(run().stage).toBe('complete');
    const context=complete.mock.calls[0][0];
    expect(context.exerciseIds).toHaveLength(3);expect(context.attemptIds).toHaveLength(3);
    expect(new Set(context.exerciseIds).size).toBe(3);expect(new Set(context.attemptIds).size).toBe(3);
    expect(context.attemptIds).not.toContain(submit.mock.calls[0][4]!.attemptId);
    controller.destroy();expect(root.listeners.size).toBe(0);expect(root.innerHTML).toBe('');
  });

  it('locks a failed pending save and retries with the same immutable answer and id',async()=>{
    const root=new EventRoot();let first=true;
    const send=vi.fn<MountActivityOptions['submit']>(async(exercise,answer,_hinted,_mode,context)=>{if(first){first=false;throw new Error('Offline');}return {correct:answerMatches(exercise,answer),progress:emptyProgress(),xpAdded:0,attemptId:context!.attemptId};});
    mount(root,{submit:send});solveViaControls(root,scene());root.click('submit');await flush();
    const before=run();expect(before.pending).toBeDefined();expect(root.innerHTML).toContain('Retry this save');
    root.click('reset-board');root.click('add-item','tea');expect(run().state).toEqual(before.state);
    root.click('submit');await flush();
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0][1]).toBe(send.mock.calls[1][1]);expect(send.mock.calls[0][4]).toEqual(send.mock.calls[1][4]);
    expect(run().stage).toBe('scene-complete');expect(run().pending).toBeUndefined();
  });

  it('restores a half-built task after leaving, pauses without losing state, and resets with a new run ID',()=>{
    const root=new EventRoot(),{controller}=mount(root),current=scene();
    if(current.board.kind!=='cafe')throw new Error('Wrong board.');
    root.click('add-item',current.board.stock[0]);root.click('hint');
    const before=run();controller.pause();expect(root.innerHTML).toContain('YOUR PLACE IS KEPT');
    controller.resume();expect(run().state).toEqual(before.state);controller.destroy();
    const resumed=new EventRoot(),mounted=mount(resumed);
    expect(run().runId).toBe(before.runId);expect(run().state).toEqual(before.state);expect(run().hinted).toBe(true);
    mounted.controller.reset();expect(run().runId).not.toBe(before.runId);expect(run().exerciseIds).toEqual([]);
  });

  it('records a late server response after closing without rebuilding the destroyed UI',async()=>{
    const root=new EventRoot();let resolve!: (value:{correct:boolean;progress:ReturnType<typeof emptyProgress>;xpAdded:number;attemptId:string})=>void;
    const request=new Promise<{correct:boolean;progress:ReturnType<typeof emptyProgress>;xpAdded:number;attemptId:string}>(done=>{resolve=done;});
    const {controller,onProgress}=mount(root,{submit:async()=>request});
    solveViaControls(root,scene());root.click('submit');const pending=run().pending!;
    controller.destroy();resolve({correct:true,progress:emptyProgress(),xpAdded:0,attemptId:pending.context.attemptId});await flush();
    expect(onProgress).toHaveBeenCalled();expect(root.innerHTML).toBe('');expect(run().stage).toBe('scene-complete');
  });

  it('retries failed mission completion with the same three evidence IDs',async()=>{
    const root=new EventRoot();let first=true;const contexts:ActivityCompletionContext[]=[];
    mount(root,{complete:async context=>{contexts.push(context);if(first){first=false;throw new Error('Busy harbor');}return {progress:emptyProgress(),xpAdded:20};}});
    for(let round=0;round<3;round++){solveViaControls(root,scene());root.click('submit');await flush();root.click('next');await flush();}
    expect(run().stage).toBe('scene-complete');expect(contexts).toHaveLength(1);
    root.click('next');await flush();expect(run().stage).toBe('complete');expect(contexts[0]).toEqual(contexts[1]);
  });

  it('plays all four boards through accessible button handlers without drag input',async()=>{
    for(const id of ['market','detective','delivery'] as const){
      saved.clear();const root=new EventRoot(),{submit}=mount(root,{id,level:'B1'});
      solveViaControls(root,scene());root.click('submit');await flush();
      expect(submit).toHaveBeenCalledTimes(1);expect(run().stage,id).toBe('scene-complete');
    }
  });

  it('reports only the scene actually displayed and does not expose future scenes or repeat on every click',async()=>{
    const root=new EventRoot(),onSceneVisible=vi.fn(),{controller}=mount(root,{onSceneVisible});
    const first=scene().exerciseId;
    expect(onSceneVisible.mock.calls[0]).toEqual([first,{activityId:'cafe',level:'A1',scenarioId:scene().id}]);
    root.click('hint');controller.pause();controller.resume();expect(onSceneVisible).toHaveBeenCalledTimes(1);
    solveViaControls(root,scene());root.click('submit');await flush();root.click('next');await flush();
    expect(onSceneVisible.mock.calls.map(call=>call[0])).toEqual([first,scene().exerciseId]);
    expect(onSceneVisible.mock.calls[1][1]).toEqual({activityId:'cafe',level:'A1',scenarioId:scene().id});
    expect(onSceneVisible).toHaveBeenCalledTimes(2);
  });

  it('does not report the hidden scenario text when reopening a saved discovery screen',async()=>{
    const root=new EventRoot(),{controller}=mount(root);
    solveViaControls(root,scene());root.click('submit');await flush();controller.destroy();
    const resumed=new EventRoot(),onSceneVisible=vi.fn();mount(resumed,{onSceneVisible});
    expect(run().stage).toBe('scene-complete');expect(onSceneVisible).not.toHaveBeenCalled();
    resumed.click('next');await flush();
    expect(onSceneVisible.mock.calls).toEqual([[scene().exerciseId,{activityId:'cafe',level:'A1',scenarioId:scene().id}]]);
  });
});
