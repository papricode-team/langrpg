// @vitest-environment happy-dom
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {emptyProgress,type AttemptResult} from '../api';
import {miniGameDefinitions} from './catalogue';
import {ScriptedStoryGame,canonicalStoryExercises,scriptedStoryData,type ScriptedStoryId} from './scripted-stories';
import type {MiniGameHost,RoundResult} from './types';

const exById=new Map(canonicalStoryExercises.map(row=>[row.id,row]));
let games:ScriptedStoryGame[],frames:Map<number,FrameRequestCallback>,frameId:number,voices:FakeAudio[];
class FakeAudio {
  volume=1;onended:(()=>void)|null=null;onerror:(()=>void)|null=null;
  play=vi.fn(async()=>{});pause=vi.fn();constructor(readonly src:string){voices.push(this);}
}
const flush=async()=>{for(let index=0;index<24;index++)await Promise.resolve();};
async function advance(ms:number){for(let left=ms;left>0;){const delta=Math.min(100,left);left-=delta;await vi.advanceTimersByTimeAsync(delta);const callbacks=[...frames.values()];frames.clear();for(const callback of callbacks)callback(performance.now());await flush();}}
function receipt(result:RoundResult):AttemptResult {
  const ex=exById.get(result.exerciseId!)!;
  if(result.contentId!==ex.contentId||result.level!=='A2'||result.answerKind)throw Error('Incorrect story context');
  if(result.modality!==ex.mode&&!(ex.mode==='listening'&&result.modality==='recognition'&&result.hinted))throw Error('Unsupported story mode');
  const normalize=(value:string)=>value.trim().toLocaleLowerCase('de').replace(/\.$/,'');
  const correct=[ex.answer,...(ex.acceptedAnswers??[])].some(answer=>normalize(answer)===normalize(result.answer));
  return {attemptId:`receipt-${ex.id}`,correct,xpAdded:0,duplicate:false,correctedAnswer:ex.answer,reason:ex.explanation,progress:emptyProgress()};
}
function setup(id:ScriptedStoryId,extra:Partial<MiniGameHost>={}){
  const root=document.createElement('div');document.body.append(root);const progress=emptyProgress();
  progress.intake={version:1,activeSeconds:0,creditSeconds:0,lastBeatAt:'',wordIds:[...scriptedStoryData.games[id].requiredWordIds]};
  const host={pool:vi.fn(()=>[]),submit:vi.fn(async(result:RoundResult)=>receipt(result)),speak:vi.fn(async()=>{}),speakText:vi.fn(async()=>{}),
    sprites:{has:()=>true,render:(_frame:string,alt:string,size:number)=>{const img=document.createElement('img');img.alt=alt;img.width=size;img.height=size;return img;}},
    audio:{sfx:vi.fn(),stop:vi.fn(),narration:vi.fn()},input:{bind:vi.fn(()=>vi.fn())},end:vi.fn(),expose:vi.fn(),progress:()=>progress,exercises:new Map(),playerName:'Ada',playerId:'tester',silent:false,reducedMotion:true,...extra} as unknown as MiniGameHost;
  const game=new ScriptedStoryGame(miniGameDefinitions.find(row=>row.id===id)!);games.push(game);game.mount(root,host,{level:'A2',seed:13});
  const click=(selector:string)=>{const button=root.querySelector<HTMLButtonElement>(selector);expect(button,selector).not.toBeNull();button!.click();};
  const action=(name:string)=>click(`[data-game-action="${name}"]`);
  const start=async()=>{action('start');await flush();};
  return {root,host,game,click,action,start,progress};
}
async function setFields(context:ReturnType<typeof setup>,index:number){
  const row=scriptedStoryData.games['17-59'].announcements[index];
  for(const key of ['time','platform','destination','status'] as const){
    for(let attempt=0;attempt<8;attempt++){
      if(context.root.querySelector(`[data-board-field="${key}"] strong`)?.textContent===row.fields[key])break;
      context.click(`[data-board-field="${key}"]`);
    }
    expect(context.root.querySelector(`[data-board-field="${key}"] strong`)?.textContent).toBe(row.fields[key]);
  }
}
async function endChorus(){await advance(6000);expect(voices).toHaveLength(4);for(const voice of voices)voice.onended?.();await flush();}
async function gardenToAddresses(context:ReturnType<typeof setup>){
  await context.start();const play=context.root.querySelector<HTMLElement>('.story-play')!;play.scrollTop=600;context.action('ledger-close');expect(play.scrollTop).toBe(0);
  for(const [index,packet]of scriptedStoryData.games['seed-packets'].packets.entries()){
    if(index===11)play.scrollTop=350;
    context.click(`[data-packet="${packet.id}"]`);context.click(`[data-bed="${index}"]`);await flush();
  }
  expect(play.scrollTop).toBe(0);
}
beforeEach(()=>{
  vi.useFakeTimers({toFake:['setTimeout','clearTimeout','performance','Date']});games=[];frames=new Map();frameId=0;voices=[];
  vi.stubGlobal('Audio',FakeAudio);vi.stubGlobal('requestAnimationFrame',(callback:FrameRequestCallback)=>{frames.set(++frameId,callback);return frameId;});vi.stubGlobal('cancelAnimationFrame',(id:number)=>frames.delete(id));
  const storage=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(key:string)=>storage.get(key)??null,setItem:(key:string,value:string)=>storage.set(key,value)});
});
afterEach(()=>{for(const game of games)game.destroy();document.body.replaceChildren();vi.useRealTimers();vi.unstubAllGlobals();});

describe('authored story boards and authoritative actual placements',()=>{
  it('reads exercises installed after module initialization through the live registry',async()=>{
    const event=scriptedStoryData.games['lost-hour'].events[0],original=event.exerciseId;
    const exercise={...exById.get(original)!,id:'newly-served-clock-exercise'};
    const registry=canonicalStoryExercises as unknown as Array<(typeof canonicalStoryExercises)[number]>;
    registry.push(exercise);exById.set(exercise.id,exercise);event.exerciseId=exercise.id;
    try{
      const context=setup('lost-hour');await context.start();context.click(`[data-clock-card="${event.id}"]`);context.click('[data-clock-slot="0"]');await flush();
      expect(vi.mocked(context.host.submit).mock.calls[0][0]).toMatchObject({exerciseId:exercise.id,answer:'23:00'});
      expect(context.root.querySelector('[data-clock-slot="0"]')?.classList.contains('is-restored')).toBe(true);
    }finally{event.exerciseId=original;registry.splice(registry.indexOf(exercise),1);exById.delete(exercise.id);}
  });
  it('gates supporting words as well as targets and applies the explicit reduced-motion preference',()=>{
    const progress=emptyProgress();progress.intake={version:1,activeSeconds:0,creditSeconds:0,lastBeatAt:'',wordIds:canonicalStoryExercises.filter(row=>row.miniGameId==='lost-hour').map(row=>row.targetWordId)};
    const context=setup('lost-hour',{progress:()=>progress});expect(context.root.textContent).toContain('more restored words');expect(context.root.querySelector('[data-clock-card]')).toBeNull();
    expect(context.root.querySelector('.story-reduced-motion')).not.toBeNull();expect(context.host.submit).not.toHaveBeenCalled();
  });
  it('shows twelve unnumbered perfect-tense cards and submits the actual wrong clock slot',async()=>{
    const context=setup('lost-hour');await context.start();
    expect(context.root.querySelectorAll('[data-clock-card]')).toHaveLength(12);expect(context.root.querySelectorAll('[data-clock-slot]')).toHaveLength(12);
    expect([...context.root.querySelectorAll('[data-clock-card]')].every(button=>!/23:\d\d/.test(button.textContent??''))).toBe(true);
    context.click('[data-clock-card="event-01"]');context.click('[data-clock-slot="6"]');await flush();
    expect(vi.mocked(context.host.submit).mock.calls[0][0]).toMatchObject({exerciseId:'story-lost-hour-event-01',answer:'23:30',modality:'recognition',contentId:'clockmill-before-midnight-v1',hinted:false});
    expect(context.root.querySelector('[data-clock-slot="6"]')?.classList.contains('is-restored')).toBe(false);
    expect(context.root.textContent).toContain('23:00');context.click('[data-clock-slot="0"]');await flush();
    expect(vi.mocked(context.host.submit).mock.calls[1][0]).toMatchObject({answer:'23:00',hinted:true});expect(context.root.querySelector('[data-clock-slot="0"]')?.classList.contains('is-restored')).toBe(true);
  });
  it('restores every canonical clock event and advances its hand only on saved placements',async()=>{
    const context=setup('lost-hour');await context.start();
    for(const [index,event]of scriptedStoryData.games['lost-hour'].events.entries()){
      context.click(`[data-clock-card="${event.id}"]`);context.click(`[data-clock-slot="${index}"]`);await flush();
    }
    expect(context.host.submit).toHaveBeenCalledTimes(12);expect(context.host.end).toHaveBeenCalledWith(expect.objectContaining({gameId:'lost-hour',attempts:12,correct:12}));
    expect(vi.mocked(context.host.submit).mock.calls.every(([result])=>result.answerKind===undefined&&result.level==='A2')).toBe(true);
  });
  it('holds an immutable failed save while time, choices and finish are frozen',async()=>{
    const submit=vi.fn().mockRejectedValueOnce(Error('Offline')).mockImplementation(async(result:RoundResult)=>receipt(result));
    const context=setup('lost-hour',{submit});await context.start();context.click('[data-clock-card="event-01"]');context.click('[data-clock-slot="0"]');await flush();
    const pending=submit.mock.calls[0][0];expect(Object.isFrozen(pending)).toBe(true);const time=context.root.querySelector('[data-story-time]')!.textContent;
    await advance(45000);expect(context.root.querySelector('[data-story-time]')!.textContent).toBe(time);expect(context.root.querySelector<HTMLButtonElement>('[data-game-action="finish"]')!.disabled).toBe(true);
    context.action('save');await flush();expect(submit.mock.calls[1][0]).toBe(pending);expect(context.root.querySelector('[data-story-score]')!.textContent).toBe('1 / 1');
  });
  it('buffers a saved receipt during manual pause and ignores automatic resume',async()=>{
    let resolve!:(result:AttemptResult)=>void;const submit=vi.fn((result:RoundResult)=>new Promise<AttemptResult>(done=>{resolve=()=>done(receipt(result));}));
    const context=setup('lost-hour',{submit});await context.start();context.click('[data-clock-card="event-01"]');context.click('[data-clock-slot="0"]');context.action('pause');resolve({}as AttemptResult);await flush();
    expect(context.root.querySelector('[data-clock-slot="0"]')?.classList.contains('is-restored')).toBe(false);context.game.resume();expect(context.root.classList.contains('story-paused')).toBe(true);
    context.action('pause');expect(context.root.querySelector('[data-clock-slot="0"]')?.classList.contains('is-restored')).toBe(true);
  });
  it('plants twelve actual packet selections, then hides every printed address before production',async()=>{
    const context=setup('seed-packets');await gardenToAddresses(context);
    expect(context.host.submit).toHaveBeenCalledTimes(12);expect(vi.mocked(context.host.submit).mock.calls.every(([result])=>result.hinted&&result.modality==='recognition')).toBe(true);
    expect(context.root.querySelectorAll('[data-packet]')).toHaveLength(0);
    for(const address of scriptedStoryData.games['seed-packets'].addresses)expect(context.root.textContent).not.toContain(address.text);
    expect(context.host.speakText).toHaveBeenLastCalledWith('Am Bahnhof sieben.','/audio/story-seed-address-01.mp3');
    for(const address of scriptedStoryData.games['seed-packets'].addresses){
      const input=context.root.querySelector<HTMLInputElement>('[data-address-input]')!;input.value=address.text;input.dispatchEvent(new Event('input',{bubbles:true}));context.root.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await flush();
    }
    expect(context.host.end).toHaveBeenCalledWith(expect.objectContaining({gameId:'seed-packets',attempts:15,correct:15}));
    expect(context.root.querySelector('.story-play')?.hasAttribute('inert')).toBe(false);expect(context.root.querySelector('.story-complete h3')?.textContent).toBe('The story is saved.');
  });
  it('does not mark a different announcement supported or print it after reading a prior transcript',async()=>{
    const context=setup('17-59');await context.start();await endChorus();context.action('transcript');
    expect(context.root.querySelector('.story-transcript')).not.toBeNull();context.click('[data-announcement="1"]');expect(context.root.querySelector('.story-transcript')).toBeNull();
    await setFields(context,1);context.action('mark-announcement');await flush();
    expect(vi.mocked(context.host.submit).mock.calls[0][0]).toMatchObject({exerciseId:'story-17-59-announcement-02',modality:'listening',hinted:false,answer:'18:05|1|Waldruh|fährt nicht'});
    expect(context.root.querySelector('[data-story-score]')!.textContent).toBe('1 / 1');
  });
  it('requires full audio completion before board answers and gates stale native ended callbacks on pause',async()=>{
    const context=setup('17-59');await context.start();await advance(100);expect(context.root.querySelector<HTMLButtonElement>('[data-game-action="mark-announcement"]')!.disabled).toBe(true);
    const ended=voices[0].onended;context.game.pause();ended?.();await advance(7000);
    expect(voices).toHaveLength(1);expect(voices[0].pause).toHaveBeenCalled();expect(context.root.querySelector<HTMLButtonElement>('[data-game-action="mark-announcement"]')!.disabled).toBe(true);
    context.game.resume();await flush();expect(context.host.speakText).toHaveBeenCalled();await setFields(context,0);context.action('mark-announcement');await flush();expect(vi.mocked(context.host.submit).mock.calls[0][0].hinted).toBe(true);
  });
  it('uses supported recognition in silent mode and rejects the misleading18:00 ticket before saving18:15',async()=>{
    const context=setup('17-59',{silent:true});await context.start();expect(voices).toHaveLength(0);
    for(let index=0;index<4;index++){await setFields(context,index);if(index===3)context.root.querySelector<HTMLElement>('.story-play')!.scrollTop=400;context.action('mark-announcement');await flush();}
    expect(vi.mocked(context.host.submit).mock.calls.slice(0,4).every(([result])=>result.modality==='recognition'&&result.hinted)).toBe(true);
    expect(context.root.querySelector<HTMLElement>('.story-play')!.scrollTop).toBe(0);
    context.root.querySelector<HTMLElement>('.story-play')!.scrollTop=80;
    context.click('[data-ticket="ticket-vii"]');context.action('hand-ticket');await flush();expect(context.host.end).not.toHaveBeenCalled();expect(context.root.textContent).toContain('17:59');
    expect(context.root.querySelector<HTMLElement>('.story-play')!.scrollTop).toBe(80);
    context.click('[data-ticket="ticket-uhr"]');context.action('hand-ticket');await flush();expect(context.host.end).toHaveBeenCalledWith(expect.objectContaining({gameId:'17-59',attempts:6,correct:5}));
    expect(context.root.querySelector('.story-play')?.hasAttribute('inert')).toBe(false);expect(context.root.querySelector('.story-complete h3')?.textContent).toBe('The story is saved.');
  });
  it('lets an in-flight answer save after destroy without changing the closed board',async()=>{
    let resolve!:(receipt:AttemptResult)=>void;let pending!:RoundResult;const submit=vi.fn((result:RoundResult)=>{pending=result;return new Promise<AttemptResult>(done=>resolve=done);});
    const context=setup('lost-hour',{submit});await context.start();context.click('[data-clock-card="event-01"]');context.click('[data-clock-slot="0"]');context.game.destroy();const closed=context.root.innerHTML;resolve(receipt(pending));await flush();
    expect(context.root.innerHTML).toBe(closed);expect(context.host.end).not.toHaveBeenCalled();expect(context.host.audio.stop).toHaveBeenCalled();expect(frames.size).toBe(0);
  });
});
