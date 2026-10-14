// @vitest-environment happy-dom
import './test-support/expedition-fixtures';
import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
import {emptyProgress,type Api,type AttemptResult,type Progress} from './api';
import manifest from './data/expedition-learning.json';
import {expeditionLearningManifest as runtime,ExpeditionLearning,expeditionRecallReady,type ExpeditionPlanCommand,type ExpeditionPlanResult} from './expedition-learning';
import {expeditionGames,mountExpeditionGame} from './expedition-games';
import {expeditionRegions} from './expeditions';
import {mountExpeditionEncounter,pendingEncounterCommands} from './expedition-encounter';
vi.mock('./minigames/input',()=>({MiniGameInput:class {bind(){return vi.fn();}}}));
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
const readyProgress=(ids:string[]):Progress=>({...emptyProgress(),intake:{version:1,activeSeconds:0,creditSeconds:0,lastBeatAt:'',wordIds:ids}});
const receipt=(id:string,progress:ReturnType<typeof emptyProgress>,correct=false):AttemptResult=>({attemptId:id,correct,progress,xpAdded:0,duplicate:false,correctedAnswer:'Saved',reason:'Server grade'});
function service(ids:string[],request=vi.fn(async(_path:string,body:{id:string})=>receipt(body.id,readyProgress(ids)))){
 let progress=readyProgress(ids);const expose=vi.fn(async()=>({progress}));const onProgress=vi.fn(next=>{progress=next;});
 const api={request,expose,selfId:'player-a',token:'token-a'} as unknown as Api;const learning=new ExpeditionLearning({api,progress:()=>progress,onProgress});return {learning,request,expose,onProgress,api,progress:()=>progress};
}
beforeEach(()=>{pendingEncounterCommands.clear();const values=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value),removeItem:(key:string)=>values.delete(key)});});afterEach(()=>{pendingEncounterCommands.clear();document.body.replaceChildren();vi.unstubAllGlobals();});
describe('authored expedition lexical evidence',()=>{
 it('maps every encounter and all thirty plan scaffolds without fake targets',()=>{
  expect(manifest.encounters).toHaveLength(180);expect(manifest.exercises).toHaveLength(489);
  for(const region of expeditionRegions)for(const encounter of region.encounters){const mapping=manifest.encounters.find(row=>row.encounterId===encounter.id)!;expect(mapping).toBeDefined();expect(mapping.rationale.length).toBeGreaterThan(20);expect(mapping.wordIds).toContain(mapping.targetWordId);for(const mode of ['recognition','listening'] as const){const exercise=manifest.exercises.find(row=>row.id===mapping.exerciseIds[mode])!;expect(exercise.mode).toBe(mode);expect(exercise.answer).toBe(encounter.choices.find(choice=>choice.correct)!.text);}}
  for(const game of expeditionGames)for(const level of ['A1','A2','B1'])for(const field of game.fields){const row=manifest.placements.find(row=>row.mapId===game.id&&row.level===level&&row.fieldId===field.id)!;expect(row).toBeDefined();expect(row.supported).toBe(true);expect(row.labels).toEqual(field.options.map(option=>({value:option.value,label:option.label})));expect(row.wordIds).toContain(row.targetWordId);expect(row.prompt).toBeTruthy();}
  expect(manifest.encounters.find(row=>row.encounterId==='saffroncourt-encounter-salma')!.targetWordId).toBe('hinter-prep');
  expect(manifest.encounters.find(row=>row.encounterId==='saffroncourt-encounter-amina')!.targetWordId).toBe('bevor-conj');
  expect(manifest.encounters.filter(row=>row.mapId==='riverweave').every(row=>!row.wordIds.includes('mai-noun'))).toBe(true);
 });
 it('ships only the runtime fields and preserves every authored context and restoration requirement',()=>{
  expect(runtime.version).toBe(manifest.version);
  expect(runtime.exercises).toEqual(manifest.exercises.map(({id,itemId,mode,level,wordIds,miniGameId,regionId,contentId})=>({id,itemId,mode,level,wordIds,miniGameId,regionId,contentId})));
  expect(runtime.encounters).toEqual(manifest.encounters.map(({encounterId,exerciseIds,audio,supported})=>({encounterId,exerciseIds,audio,supported})));
  expect(runtime.placements).toEqual(manifest.placements.map(({mapId,level,fieldId,exerciseId,prompt})=>({mapId,level,fieldId,exerciseId,prompt})));
  expect(runtime.exercises.every(row=>!('answer' in row)&&!('explanation' in row))).toBe(true);
 });
 it('requires every mapped word, rather than exposure or only the primary word',()=>{
  const row=manifest.exercises[0];expect(expeditionRecallReady(row,emptyProgress())).toBe(false);expect(expeditionRecallReady(row,readyProgress([row.targetWordId]))).toBe(false);expect(expeditionRecallReady(row,readyProgress(row.wordIds))).toBe(true);
 });
 it('sends an actual wrong label/context, honors the server, and retries the immutable command',async()=>{
  const row=manifest.placements[0],invalid=row.labels.find(label=>!row.allowedValues.includes(label.value))!;
  const request=vi.fn().mockRejectedValueOnce(new Error('Offline')).mockImplementation(async(_path:string,body:{id:string})=>receipt(body.id,readyProgress(row.wordIds),false));const {learning}=service(row.wordIds,request);
  const command=learning.create(row.exerciseId,invalid.label,{hinted:false,responseMs:1200,selectedValue:invalid.value});expect(Object.isFrozen(command)).toBe(true);
  await expect(learning.submit(command)).rejects.toThrow('Offline');expect(learning.pendingPlacements()).toBe(1);
  const result=await learning.submit(command);expect(result.correct).toBe(false);expect(request.mock.calls[1][1]).toBe(request.mock.calls[0][1]);
  expect(command).toMatchObject({answer:invalid.label,hinted:true,miniGameId:'neighborhood-boards',regionId:row.mapId,contentId:row.fieldId,selectedValue:invalid.value});
  await learning.submit(command);expect(request).toHaveBeenCalledTimes(2);
 });
 it('keeps unrestored placements exposure-only with an explicit message',async()=>{
  const row=manifest.placements[0],label=row.labels[0];const {learning,request,expose}=service([]);
  const result=await learning.place({mapId:row.mapId,level:row.level as 'A1',fieldId:row.fieldId,value:label.value,label:label.label,responseMs:100});expect(result.status).toBe('exposure');expect(result.message).toContain('Exposure only');expect(expose).toHaveBeenCalledOnce();expect(request).not.toHaveBeenCalled();
 });
 it('coalesces simultaneous retries and retains a successful authoritative receipt',async()=>{
  const row=manifest.placements[0];let finish!:(result:AttemptResult)=>void;const request=vi.fn((_path:string,_body:{id:string})=>new Promise<AttemptResult>(resolve=>{finish=resolve;}));const {learning}=service(row.wordIds,request);const command=learning.create(row.exerciseId,row.labels[0].label,{hinted:true,responseMs:20,selectedValue:row.labels[0].value});
  const first=learning.submit(command),second=learning.submit(command);expect(first).toBe(second);expect(request).toHaveBeenCalledOnce();const result=receipt(command.id,readyProgress(row.wordIds));finish(result);expect(await first).toBe(result);expect(await learning.submit(command)).toBe(result);expect(request).toHaveBeenCalledOnce();
 });
 it('never retries failed evidence under another player and rejects stale in-flight progress',async()=>{
  const row=manifest.placements[0],request=vi.fn().mockRejectedValueOnce(new Error('Offline'));const {learning,api,onProgress}=service(row.wordIds,request);const command=learning.create(row.exerciseId,row.labels[0].label,{hinted:true,responseMs:10,selectedValue:row.labels[0].value});await expect(learning.submit(command)).rejects.toThrow('Offline');api.selfId='player-b';api.token='token-b';expect(learning.pendingPlacements()).toBe(0);await expect(learning.submit(command)).rejects.toThrow('account changed');await learning.retryPlacements();expect(request).toHaveBeenCalledOnce();expect(onProgress).not.toHaveBeenCalled();
  const next=learning.create(row.exerciseId,row.labels[0].label,{hinted:true,responseMs:10,selectedValue:row.labels[0].value});let finish!:(result:AttemptResult)=>void;request.mockImplementationOnce(()=>new Promise<AttemptResult>(resolve=>{finish=resolve;}));const pending=learning.submit(next);api.token='token-c';finish(receipt(next.id,readyProgress(row.wordIds)));await expect(pending).rejects.toThrow('account changed');expect(onProgress).not.toHaveBeenCalled();
 });
 it('ignores a late exposure result after ownership changes',async()=>{
  const {learning,api,expose,onProgress}=service([]);let finish!:(result:{progress:Progress})=>void;expose.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));const pending=learning.expose(manifest.exercises[0].id);api.selfId='player-b';finish({progress:readyProgress(manifest.exercises[0].wordIds)});await pending;expect(onProgress).not.toHaveBeenCalled();
 });
 it('ignores menu, sequence, reset and no-change actions when creating placement attempts',async()=>{
  const game=expeditionGames[0],root=document.createElement('div');document.body.append(root);const onPlacement=vi.fn(async(_context:{fieldId:string;value:number;label:string})=>({message:'Saved'}));const controller=mountExpeditionGame(root,game,{level:'A1',speak:vi.fn(),onComplete:vi.fn(),onPlacement});
  root.querySelector<HTMLButtonElement>('[data-exp-hint]')!.click();root.querySelector<HTMLButtonElement>('[data-exp-zone="gate"]')!.click();root.querySelector<HTMLButtonElement>('[data-exp-token="gate"][data-exp-value="0"]')!.click();root.querySelector<HTMLButtonElement>('[data-exp-add]')!.click();root.querySelector<HTMLButtonElement>('[data-exp-reset]')!.click();expect(onPlacement).not.toHaveBeenCalled();
  root.querySelector<HTMLButtonElement>('[data-exp-token="permission"][data-exp-value="1"]')!.click();await flush();expect(onPlacement).toHaveBeenCalledOnce();expect(onPlacement.mock.calls[0][0]).toMatchObject({fieldId:'permission',value:1,label:game.fields[0].options[1].label});controller.destroy();
 });
 it('does not submit paused placements and excludes paused time from a changed token',async()=>{
  let now=100;const clock=vi.spyOn(performance,'now').mockImplementation(()=>now);const game=expeditionGames[0],root=document.createElement('div');document.body.append(root);const onPlacement=vi.fn(async(_context:{responseMs:number})=>({message:'Saved'}));const controller=mountExpeditionGame(root,game,{level:'A1',speak:vi.fn(),onComplete:vi.fn(),onPlacement});now=150;controller.pause();now=60150;root.querySelector<HTMLButtonElement>('[data-exp-token="permission"][data-exp-value="1"]')!.click();expect(onPlacement).not.toHaveBeenCalled();controller.resume();now=60250;root.querySelector<HTMLButtonElement>('[data-exp-token="permission"][data-exp-value="1"]')!.click();await flush();expect(onPlacement.mock.calls[0][0].responseMs).toBe(150);controller.destroy();clock.mockRestore();
 });
 it('a prior placement receipt cannot hide the restoration gate for another field',async()=>{
  const game=expeditionGames[0],root=document.createElement('div');document.body.append(root);let finish!:(result:{message:string})=>void;const controller=mountExpeditionGame(root,game,{level:'A1',speak:vi.fn(),onComplete:vi.fn(),placementReady:(_level,field)=>field==='permission',onPlacement:()=>new Promise(resolve=>{finish=resolve;})});root.querySelector<HTMLButtonElement>('[data-exp-token="permission"][data-exp-value="1"]')!.click();root.querySelector<HTMLButtonElement>('[data-exp-zone="gate"]')!.click();finish({message:'Supported recognition saved.'});await flush();expect(root.querySelector('.expedition-learning-state')!.textContent).toContain('Exposure only');controller.destroy();
 });
});
describe('immutable full neighborhood agreements',()=>{
 const plan=()=>({mapId:expeditionGames[0].id,level:'A1' as const,values:{...expeditionGames[0].solution},order:expeditionGames[0].steps.map(step=>step.id)});
 const result=(submitted:ReturnType<typeof plan>):ExpeditionPlanResult=>({correct:true,plan:{...submitted,completed:true,attempts:1},progress:emptyProgress()});
 it('a lost response retries the exact frozen ID and snapshot; a changed allocation creates another command',async()=>{
  const draft=plan(),request=vi.fn<(path:string,body:ExpeditionPlanCommand)=>Promise<ExpeditionPlanResult>>().mockRejectedValueOnce(new Error('Response lost')).mockImplementation(async()=>result(draft));const api={request,selfId:'player-a',token:'token-a'} as unknown as Api;const learning=new ExpeditionLearning({api,progress:emptyProgress,onProgress:vi.fn()});await expect(learning.submitPlan(draft)).rejects.toThrow('Response lost');const first=request.mock.calls[0][1];expect(Object.isFrozen(first)).toBe(true);expect(Object.isFrozen(first.values)).toBe(true);expect(Object.isFrozen(first.order)).toBe(true);
  await learning.submitPlan({...draft,values:Object.fromEntries(Object.entries(draft.values).reverse())});expect(request.mock.calls[1][1]).toBe(first);
  draft.values.gate=0;await learning.submitPlan(draft);expect(request.mock.calls[2][1].id).not.toBe(first.id);expect(first.values.gate).toBe(expeditionGames[0].solution.gate);
 });
 it('an account change ignores an old response and a new player cannot reuse its failed ID',async()=>{
  const draft=plan();let finish!:(result:ExpeditionPlanResult)=>void;const request=vi.fn((_path:string,_command:ExpeditionPlanCommand)=>new Promise<ExpeditionPlanResult>(resolve=>{finish=resolve;}));const api={request,selfId:'player-a',token:'token-a'} as unknown as Api,onProgress=vi.fn();const learning=new ExpeditionLearning({api,progress:emptyProgress,onProgress});const old=learning.submitPlan(draft),id=request.mock.calls[0][1].id;api.selfId='player-b';api.token='token-b';finish(result(draft));await expect(old).rejects.toThrow('account changed');expect(onProgress).not.toHaveBeenCalled();const next=learning.submitPlan(draft);expect(request.mock.calls[1][1].id).not.toBe(id);finish(result(draft));await next;expect(onProgress).toHaveBeenCalledOnce();
 });
});
describe('encounter reading and listening controller',()=>{
 function mount(restored=true,reading=true,initialPaused=false){const encounter=expeditionRegions[0].encounters[0],row=manifest.encounters[0],services=service(restored?row.wordIds:[]);const root=document.createElement('div');document.body.append(root);let resolveSpeech!:()=>void;const speak=vi.fn(()=>new Promise<void>(done=>{resolveSpeech=done;}));const saveStory=vi.fn(async(_selected:number,_id:string):Promise<{progress:Progress}>=>({progress:services.progress()}));const controller=mountExpeditionEncounter(root,encounter,{learning:services.learning,progress:services.progress,onProgress:services.onProgress,saveStory,speak,stopSpeech:vi.fn(),silent:false,initialPaused,previouslyAnswered:false});if(reading)root.querySelector<HTMLButtonElement>('[data-enc-mode="recognition"]')!.click();return {root,controller,encounter,row,services,speak,saveStory,finishSpeech:()=>resolveSpeech()};}
 it('hides the German transcript, waits for full audio, and submits listening truthfully',async()=>{
  const {root,controller,encounter,services,finishSpeech}=mount(true,false);expect(root.textContent).not.toContain(encounter.german);expect(root.querySelector('[data-enc-answer]')).toBeNull();root.querySelector<HTMLButtonElement>('[data-enc-mode="listening"]')!.click();expect(root.textContent).not.toContain(encounter.german);root.querySelector<HTMLButtonElement>('[data-enc-answer]')!.click();await flush();expect(services.request).not.toHaveBeenCalled();finishSpeech();await flush();root.querySelector<HTMLButtonElement>('[data-enc-answer]')!.click();await flush();expect(services.request.mock.calls[0][1]).toMatchObject({mode:'listening',hinted:false,contentId:encounter.id});controller.destroy();
 });
 it('listening after a printed cue cannot claim an unaided listening recall',async()=>{
  const {root,controller,services,finishSpeech}=mount();root.querySelector<HTMLButtonElement>('[data-enc-mode="listening"]')!.click();finishSpeech();await flush();root.querySelector<HTMLButtonElement>('[data-enc-answer]')!.click();await flush();expect(services.request.mock.calls[0][1]).toMatchObject({mode:'listening',hinted:true});controller.destroy();
 });
 it('a mount paused during lazy loading starts inert and waits for resume before presentation',async()=>{
  const {root,controller,services,speak}=mount(true,false,true);expect(root.querySelector('[inert]')).not.toBeNull();root.querySelector<HTMLButtonElement>('[data-enc-mode="listening"]')!.click();expect(speak).not.toHaveBeenCalled();expect(services.expose).not.toHaveBeenCalled();expect(services.request).not.toHaveBeenCalled();controller.resume();root.querySelector<HTMLButtonElement>('[data-enc-mode="listening"]')!.click();expect(speak).toHaveBeenCalledOnce();controller.destroy();
 });
 it('a transcript switches to supported recognition and a missing restoration still permits a saved agreement',async()=>{
  const {root,controller,services,saveStory}=mount(false);root.querySelector<HTMLButtonElement>('[data-enc-mode="listening"]')!.click();root.querySelector<HTMLButtonElement>('[data-enc-transcript]')!.click();root.querySelector<HTMLButtonElement>('[data-enc-answer]')!.click();await flush();expect(services.request).not.toHaveBeenCalled();expect(saveStory).toHaveBeenCalledOnce();expect(root.textContent).toContain('exposure only');controller.destroy();
 });
 it('retains a failed learning receipt after story success and retries without duplicating the story command',async()=>{
  const {root,controller,row,services,saveStory}=mount();services.request.mockRejectedValueOnce(new Error('Offline'));root.querySelector<HTMLButtonElement>('[data-enc-answer]')!.click();await flush();expect(saveStory).toHaveBeenCalledOnce();expect(root.querySelector('[data-enc-retry]')).not.toBeNull();const first=services.request.mock.calls[0][1];root.querySelector<HTMLButtonElement>('[data-enc-retry]')!.click();await flush();expect(services.request.mock.calls[1][1]).toBe(first);expect(saveStory).toHaveBeenCalledOnce();expect(pendingEncounterCommands.has(row.encounterId)).toBe(false);controller.destroy();
 });
 it('retries a failed story write with its same ID without repeating saved learning',async()=>{
  const {root,controller,services,saveStory}=mount();saveStory.mockRejectedValueOnce(new Error('Story offline'));root.querySelector<HTMLButtonElement>('[data-enc-answer]')!.click();await flush();const first=saveStory.mock.calls[0];expect(root.querySelector('[data-enc-retry]')).not.toBeNull();root.querySelector<HTMLButtonElement>('[data-enc-retry]')!.click();await flush();expect(saveStory.mock.calls[1]).toEqual(first);expect(services.request).toHaveBeenCalledOnce();controller.destroy();
 });
 it('pausing invalidates an unfinished cue and replay after resume is supported listening',async()=>{
  const {root,controller,services,finishSpeech,speak}=mount(true,false);root.querySelector<HTMLButtonElement>('[data-enc-mode="listening"]')!.click();controller.pause();finishSpeech();await flush();root.querySelector<HTMLButtonElement>('[data-enc-answer]')!.click();expect(services.request).not.toHaveBeenCalled();controller.resume();expect(speak).toHaveBeenCalledTimes(2);finishSpeech();await flush();root.querySelector<HTMLButtonElement>('[data-enc-answer]')!.click();await flush();expect(services.request.mock.calls[0][1]).toMatchObject({mode:'listening',hinted:true});controller.destroy();
 });
 it('finishes submitted writes after close without rebuilding UI or retaining a completed command',async()=>{
  const {root,controller,row,services,saveStory}=mount();let finish!:(result:AttemptResult)=>void;services.request.mockImplementationOnce((_path:string,_body:{id:string})=>new Promise<AttemptResult>(resolve=>{finish=resolve;}));root.querySelector<HTMLButtonElement>('[data-enc-answer]')!.click();const id=services.request.mock.calls[0][1].id;controller.destroy();finish(receipt(id,readyProgress(row.wordIds)));await flush();expect(saveStory).toHaveBeenCalledOnce();expect(root.childElementCount).toBe(0);expect(pendingEncounterCommands.has(row.encounterId)).toBe(false);
 });
 it('ownership changes cannot carry an old learning reply into a new player’s neighborhood',async()=>{
  const {root,controller,row,services,saveStory}=mount();let finish!:(result:AttemptResult)=>void;services.request.mockImplementationOnce(()=>new Promise<AttemptResult>(resolve=>{finish=resolve;}));root.querySelector<HTMLButtonElement>('[data-enc-answer]')!.click();const id=services.request.mock.calls[0][1].id;services.api.selfId='player-b';services.api.token='token-b';finish(receipt(id,readyProgress(row.wordIds)));await flush();expect(saveStory).not.toHaveBeenCalled();expect(services.onProgress).not.toHaveBeenCalled();controller.destroy();const nextRoot=document.createElement('div');document.body.append(nextRoot);const next=mountExpeditionEncounter(nextRoot,expeditionRegions[0].encounters[0],{learning:services.learning,progress:services.progress,onProgress:services.onProgress,saveStory,speak:async()=>{},stopSpeech:vi.fn(),silent:false,previouslyAnswered:false});expect(pendingEncounterCommands.has(row.encounterId)).toBe(false);next.destroy();
 });
});
