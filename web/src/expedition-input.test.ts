// @vitest-environment happy-dom
import './test-support/expedition-fixtures';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {emptyProgress,type Api} from './api';
import {ExpeditionLearning} from './expedition-learning';
import expeditionLearningManifest from './data/expedition-learning.json';
import {expeditionRegions} from './expeditions';
import {expeditionGames,mountExpeditionGame} from './expedition-games';
import {mountExpeditionEncounter,pendingEncounterCommands} from './expedition-encounter';

const key=(name:string)=>{const event=new KeyboardEvent('keydown',{key:name,bubbles:true,cancelable:true});(document.activeElement??document.body).dispatchEvent(event);return event;};
const dialog=()=>{const outer=document.createElement('dialog');outer.open=true;const root=document.createElement('div');outer.append(root);document.body.append(outer);return root;};
beforeEach(()=>{vi.stubGlobal('requestAnimationFrame',vi.fn(()=>1));vi.stubGlobal('cancelAnimationFrame',vi.fn());const values=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value)});});
afterEach(()=>{pendingEncounterCommands.clear();document.body.replaceChildren();vi.unstubAllGlobals();});

describe('shared expedition controller input',()=>{
 it('arrows and Enter can choose the initial listening mode without a mouse or a printed cue',()=>{
  const root=dialog(),encounter=expeditionRegions[0].encounters[0],mapping=expeditionLearningManifest.encounters[0],progress={...emptyProgress(),intake:{version:1,wordIds:mapping.wordIds,activeSeconds:0,creditSeconds:0,lastBeatAt:''}};
  const learning=new ExpeditionLearning({api:{selfId:'player',token:'session',expose:vi.fn(async()=>({progress}))} as unknown as Api,progress:()=>progress,onProgress:vi.fn()}),speak=vi.fn(()=>new Promise<void>(()=>{}));
  const controller=mountExpeditionEncounter(root,encounter,{learning,progress:()=>progress,onProgress:vi.fn(),saveStory:async()=>({progress}),speak,stopSpeech:vi.fn(),silent:false,previouslyAnswered:false});
  expect(root.querySelector('[data-enc-answer]')).toBeNull();key('ArrowDown');expect(document.activeElement).toBe(root.querySelector('[data-enc-mode="recognition"]'));key('ArrowDown');expect(document.activeElement).toBe(root.querySelector('[data-enc-mode="listening"]'));key('Enter');expect(speak).toHaveBeenCalledOnce();expect(root.textContent).not.toContain(encounter.german);controller.destroy();expect(key('ArrowDown').defaultPrevented).toBe(false);
 });
 it('the plan exposes zones and sequence controls to arrows and submits each digit placement once',()=>{
  const root=dialog(),game=expeditionGames[0],onPlacement=vi.fn(async(_context:{value:number})=>({message:'Saved'}));const controller=mountExpeditionGame(root,game,{level:'A1',speak:vi.fn(),onComplete:vi.fn(),onPlacement});
  const targets=root.querySelectorAll('[data-game-action]');expect(targets.length).toBeGreaterThan(game.fields.length+game.steps.length);key('ArrowDown');expect(document.activeElement).toBe(root.querySelector('[data-exp-level="A1"]'));
  const token=[...root.querySelectorAll<HTMLButtonElement>('[data-exp-token]')].find(button=>button.dataset.expValue==='1')!;token.focus();const position=[...root.querySelectorAll('[data-exp-token]')].indexOf(token);key(String(position+1));expect(onPlacement).toHaveBeenCalledOnce();expect(onPlacement.mock.calls[0][0].value).toBe(1);
  controller.pause();document.body.focus();key('ArrowDown');expect(root.contains(document.activeElement)).toBe(false);controller.destroy();expect(key('ArrowDown').defaultPrevented).toBe(false);
 });
});
