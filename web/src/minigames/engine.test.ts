// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyProgress, type AttemptResult } from '../api';
import {quests,type Exercise} from '../content';
import {courseContextWordIds} from '../course';
import publicFixture from '../test-fixtures/content-public.json';
import loopData from './loop-data.json';
import { RetrievalGame } from './engine';
import { miniGameDefinitions } from './catalogue';
import { loadMiniGame } from './index';
import type { GameItem, MiniGameDefinition, MiniGameHost, MiniGameOptions, RoundResult } from './types';

const scene = vi.hoisted(() => ({feedback:vi.fn(),pause:vi.fn(),resume:vi.fn(),destroy:vi.fn()} as {feedback:()=>void;pause:()=>void;resume:()=>void;destroy:()=>void;onFrame?:(callback:(now:number)=>void)=>()=>void}));
vi.mock('./scene',()=>({mountMiniGameScene:()=>scene}));
let frames:Map<number,FrameRequestCallback>,frameId:number,games:RetrievalGame[];
const flush=async()=>{for(let index=0;index<32;index++)await Promise.resolve();};
async function advance(ms:number){
  for(let left=ms;left>0;){const delta=Math.min(100,left);left-=delta;await vi.advanceTimersByTimeAsync(delta);const pending=[...frames.values()];frames.clear();for(const callback of pending)callback(performance.now());await flush();}
}
const item=(lemma:string,extra:Partial<GameItem>={}):GameItem=>({lexemeId:`${lemma.toLowerCase()}-noun`,lemma,english:lemma,article:'der',plural:`${lemma}e`,topic:'food',level:'A1',pos:'noun',audio:'',exerciseIds:{recognition:'',listening:'',production:''},stability:0,due:{recognition:false,listening:false,production:false},seen:{recognition:false,listening:false,production:false},recalls:{recognition:0,listening:0,production:0},...extra});
const foods=[item('Kaffee'),item('Tee',{article:'die'}),item('Brot',{article:'das'}),item('Wasser')];
const receipt=(result:RoundResult,correct=true):AttemptResult=>({attemptId:`attempt-${result.lexemeId}`,correct,xpAdded:0,duplicate:false,correctedAnswer:result.answer,reason:'Saved',progress:emptyProgress()});
function publicStoryExercise(prefix: string, mode: string): Exercise & { wordIds: string[]; questId: string; audio: { path: string } } {
  const record = publicFixture.records.find(record => record.kind === 'exercise' && (record.body as { mode?: string }).mode === mode && (record.body as { audio?: { path?: string } }).audio?.path?.startsWith(`/audio/${prefix}`));
  expect(record, `public ${prefix} ${mode} exercise`).toBeDefined();
  const body = record!.body as unknown as Exercise & { sentenceId: string; wordIds: string[]; questId: string; audio: { path: string } };
  const sentence = publicFixture.records.find(record => record.id === body.sentenceId)?.body as { text?: string } | undefined;
  return { ...body, id: record!.id, answer: '', explanation: '', english: '', german: sentence?.text ?? '' };
}
function setup(id='departure-board',extra:Partial<MiniGameHost>={},opts:Partial<MiniGameOptions>={},definition:Partial<MiniGameDefinition>={}){
  const root=document.createElement('div');document.body.append(root);
  const host={pool:vi.fn(()=>foods.map(food=>({...food}))),submit:vi.fn(async(result:RoundResult)=>receipt(result)),speak:vi.fn(async()=>{}),speakText:vi.fn(async()=>{}),sprites:{has:vi.fn(()=>false),preload:vi.fn(async()=>{}),render:vi.fn((_frame:string,alt:string)=>{const image=document.createElement('img');image.alt=alt;return image;})},audio:{sfx:vi.fn(),stop:vi.fn()},input:{bind:vi.fn(()=>vi.fn())},end:vi.fn(),expose:vi.fn(),progress:()=>emptyProgress(),exercises:new Map(),playerName:'Ada',silent:false,reducedMotion:true,...extra} as unknown as MiniGameHost;
  // Lifecycle cases use a plain choice profile; physical boards have separate
  // integration coverage below and their own widget tests.
  const game=new RetrievalGame({...miniGameDefinitions.find(game=>game.id===id)!,...(id==='departure-board'?{mechanic:'pictures' as const,seconds:90}:{}),...definition});games.push(game);
  game.mount(root,host,{level:'A1',seed:13,...opts});
  const click=(action:string)=>root.querySelector<HTMLButtonElement>(`[data-game-action="${action}"]`)!.click();
  const choose=(answer:string)=>{const button=[...root.querySelectorAll<HTMLButtonElement>('[data-game-option]')].find(button=>button.querySelector('.minigame-object-label')?.textContent===answer)!;expect(button,`choice ${answer}`).toBeDefined();button.click();button.click();};
  const start=async()=>{click('start');await flush();};
  return {root,host,game,click,choose,start};
}
beforeEach(()=>{
  vi.useFakeTimers({toFake:['setTimeout','clearTimeout','performance','Date']});frames=new Map();frameId=0;games=[];
  vi.stubGlobal('requestAnimationFrame',(callback:FrameRequestCallback)=>{frames.set(++frameId,callback);return frameId;});
  vi.stubGlobal('cancelAnimationFrame',(id:number)=>frames.delete(id));
  const storage=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(key:string)=>storage.get(key)??null,setItem:(key:string,value:string)=>storage.set(key,value)});
  vi.clearAllMocks();
});
afterEach(()=>{for(const game of games)game.destroy();document.body.replaceChildren();vi.useRealTimers();vi.unstubAllGlobals();});

describe('shared mini-game lifecycle and authoritative evidence',()=>{
  it('blames a small pool, not silent mode, when a reading game has too few words',()=>{
    const {root}=setup('brass-stamp',{silent:true,pool:vi.fn(()=>[])});
    expect(root.textContent).toContain('These words are still returning.');
    expect(root.textContent).not.toContain('silent mode');
  });
  it('keeps a fetched UUID workshop sentence eligible for the workbench after its lexical rounds', async () => {
    const exercise = publicStoryExercise('a1-workshop-', 'sentence');
    const restored = { ...emptyProgress(), intake: { version: 1, activeSeconds: 0, creditSeconds: 0, lastBeatAt: '', wordIds: [...exercise.wordIds] } };
    const pool = () => [item('Lampe', { lexemeId: exercise.wordIds[0] }), item('Tisch', { lexemeId: exercise.wordIds[1] })];
    const { root, host, start, click } = setup('workbench', { pool, progress: () => restored, exercises: new Map([[exercise.id, exercise]]) }, {}, { questIds: [exercise.questId] });
    await start();
    for (let round = 0; round < 2; round++) {
      for (const word of ['Lampe', 'Tisch']) [...root.querySelectorAll<HTMLButtonElement>('[data-game-option]')].find(button => button.textContent?.includes(word))!.click();
      click('serve'); await flush(); await advance(650);
    }
    expect(root.querySelector('.minigame-story-prompt')?.textContent).toBe(exercise.prompt);
    for (const token of exercise.tokens!) [...root.querySelectorAll<HTMLButtonElement>('[data-game-option]')].find(button => button.querySelector('.minigame-object-label')?.textContent === token)!.click();
    click('check'); await flush();
    expect(vi.mocked(host.submit).mock.calls.at(-1)?.[0]).toMatchObject({ exerciseId: exercise.id, modality: 'production', answer: exercise.tokens!.join(' '), hinted: true });
    expect(vi.mocked(host.submit).mock.calls.at(-1)?.[0].answerKind).toBeUndefined();
  });
  it('plays the fetched kettle listening exercise only while all its canonical word references are restored', async () => {
    const exercise = publicStoryExercise('a1-cafe-', 'listen');
    const progress = { ...emptyProgress(), intake: { version: 1, activeSeconds: 0, creditSeconds: 0, lastBeatAt: '', wordIds: [...exercise.wordIds] } };
    const pool = () => [item('Regen', { lexemeId: exercise.wordIds[0] }), item('Sonne', { lexemeId: exercise.wordIds[1] })];
    const first = setup('kettle-forecast', { pool, progress: () => progress, exercises: new Map([[exercise.id, exercise]]) }, {}, { questIds: [exercise.questId] });
    await first.start();
    expect(first.host.speakText).toHaveBeenCalledWith(exercise.german, exercise.audio.path);
    first.choose(exercise.options![0]); await flush();
    expect(vi.mocked(first.host.submit).mock.calls[0][0]).toMatchObject({ exerciseId: exercise.id, modality: 'listening', answer: exercise.options![0] });
    first.game.destroy();
    const missing = { ...progress, intake: { ...progress.intake, wordIds: exercise.wordIds.slice(1) } };
    const second = setup('kettle-forecast', { pool, progress: () => missing, exercises: new Map([[exercise.id, exercise]]) }, {}, { questIds: [exercise.questId] });
    await second.start();
    expect(second.host.speakText).not.toHaveBeenCalled();
    expect(second.root.querySelector('.minigame-story-prompt')).toBeNull();
  });
  it('uses the canonical recording reference to grade a fetched tape transcription', async () => {
    const exercise = publicStoryExercise('b1-witness-', 'type');
    const progress = { ...emptyProgress(), intake: { version: 1, activeSeconds: 0, creditSeconds: 0, lastBeatAt: '', wordIds: [...exercise.wordIds] } };
    const clip = { ...loopData.clips[0], exerciseId: exercise.id, text: exercise.german, path: exercise.audio.path }; loopData.clips.push(clip);
    try {
      const { root, host, start } = setup('looping-tape', { pool: () => [item('sicher', { lexemeId: exercise.wordIds[0], pos: 'adj', level: 'B1' })], progress: () => progress, exercises: new Map([[exercise.id, exercise]]) }, { level: 'B1' }, { questIds: [exercise.questId] });
      await start();
      expect(host.speakText).toHaveBeenCalledWith(exercise.german, clip.path);
      expect(root.querySelector('.minigame-scaffold')).toBeNull();
      root.querySelector<HTMLInputElement>('input')!.value = 'A recorded attempt';
      root.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); await flush();
      expect(vi.mocked(host.submit).mock.calls[0][0]).toMatchObject({ exerciseId: exercise.id, modality: 'production', answer: 'A recorded attempt', hinted: true });
    } finally { loopData.clips.splice(loopData.clips.indexOf(clip), 1); }
  });
  it('assembles a fetched council sentence by its canonical quest membership', async () => {
    const exercise = publicStoryExercise('b1-council-', 'sentence');
    const progress = { ...emptyProgress(), intake: { version: 1, activeSeconds: 0, creditSeconds: 0, lastBeatAt: '', wordIds: [...exercise.wordIds] } };
    const { root, host, start, click } = setup('seven-chairs', { pool: () => [item('Rat', { lexemeId: exercise.wordIds[0], level: 'B1' })], progress: () => progress, exercises: new Map([[exercise.id, exercise]]) }, { level: 'B1' }, { questIds: [exercise.questId] });
    await start();
    expect(root.querySelector('.minigame-story-prompt')?.textContent).toBe(exercise.prompt);
    for (const token of exercise.tokens!) [...root.querySelectorAll<HTMLButtonElement>('[data-game-option]')].find(button => button.querySelector('.minigame-object-label')?.textContent === token)!.click();
    click('check'); await flush();
    expect(vi.mocked(host.submit).mock.calls[0][0]).toMatchObject({ exerciseId: exercise.id, modality: 'production', answer: exercise.tokens!.join(' '), hinted: true });
  });
  it('does not put two spellings of the same number into indistinguishable catching lanes',async()=>{
    const pool=[item('hundert',{lexemeId:'hundert-num',pos:'num'}),item('einhundert',{lexemeId:'einhundert-num',pos:'num'}),item('zwei',{lexemeId:'zwei-num',pos:'num'})];
    const {root,start}=setup('numbered-apples',{pool:()=>pool});await start();
    const digits=[...root.querySelectorAll('.catching-digit')].map(digit=>digit.textContent);
    expect(new Set(digits).size).toBe(digits.length);expect(digits).toEqual(expect.arrayContaining(['100','2']));
  });
  it('grades the apple actually caught in the chosen lane, including a distractor',async()=>{
    const pool=[item('sieben',{lexemeId:'sieben-num',pos:'num'}),item('zwei',{lexemeId:'zwei-num',pos:'num'}),item('drei',{lexemeId:'drei-num',pos:'num'})];
    const {root,host,start}=setup('numbered-apples',{pool:()=>pool});await start();
    const wrong=[...root.querySelectorAll<HTMLElement>('.catching-apple')].find(apple=>apple.querySelector('.catching-digit')?.textContent!=='7')!;
    const digit=wrong.querySelector('.catching-digit')!.textContent;
    root.querySelector<HTMLButtonElement>(`[data-catch-lane="${wrong.style.getPropertyValue('--lane')}"]`)!.click();await advance(2800);
    expect(host.submit).toHaveBeenCalledOnce();
    expect(vi.mocked(host.submit).mock.calls[0][0]).toMatchObject({answer:digit==='2'?'zwei':'drei',lexemeId:'sieben-num',modality:'listening',answerKind:'lexeme'});
  });
  it('holds falling apples until speech ends and freezes them while paused',async()=>{
    let resolve!:()=>void;const speak=vi.fn(()=>new Promise<void>(done=>resolve=done));
    const pool=[item('sieben',{lexemeId:'sieben-num',pos:'num'}),item('zwei',{lexemeId:'zwei-num',pos:'num'})];
    const {root,host,game,start}=setup('numbered-apples',{pool:()=>pool,speak});await start();await advance(3000);expect(host.submit).not.toHaveBeenCalled();
    expect(root.querySelector<HTMLButtonElement>('[data-catch-lane]')!.disabled).toBe(true);resolve();await flush();
    const apple=[...root.querySelectorAll<HTMLElement>('.catching-apple')].find(apple=>apple.querySelector('.catching-digit')?.textContent==='7')!;
    root.querySelector<HTMLButtonElement>(`[data-catch-lane="${apple.style.getPropertyValue('--lane')}"]`)!.click();await advance(1000);game.pause();await advance(3000);expect(host.submit).not.toHaveBeenCalled();game.resume();await advance(1800);
    expect(host.submit).toHaveBeenCalledOnce();expect(vi.mocked(host.submit).mock.calls[0][0].answer).toBe('sieben');
  });
  it('submits the four actual selected departure fields after the whole announcement',async()=>{
    const pool=[item('sieben',{lexemeId:'sieben-num',pos:'num'}),item('zwei',{lexemeId:'zwei-num',pos:'num'}),item('Bahnhof',{lexemeId:'bahnhof-noun'}),item('Hotel',{lexemeId:'hotel-noun'}),item('pünktlich',{lexemeId:'puenktlich-adj',pos:'adj'}),item('Verspätung',{lexemeId:'verspaetung-noun'})];
    const {root,host,start}=setup('departure-board',{pool:()=>pool},{},{mechanic:'board'});await start();
    expect(host.speak).toHaveBeenCalledTimes(4);
    const values=[...root.querySelectorAll<HTMLOutputElement>('[data-flap-value]')].map(output=>output.textContent!);
    root.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await flush();
    expect(host.submit).toHaveBeenCalledTimes(4);
    const answers=vi.mocked(host.submit).mock.calls.map(([answer])=>answer);
    expect(answers.map(answer=>answer.answer)).toEqual([values[0]==='07:00'?'sieben':'zwei',values[1]==='7'?'sieben':'zwei',values[2],values[3]]);
    expect(answers.every(answer=>answer.answerKind==='lexeme'&&answer.modality==='listening')).toBe(true);
    expect(root.querySelector('[data-game-score]')?.textContent).toBe('4 / 4');
  });
  it('stops a compound announcement from starting later speech after closing',async()=>{
    let resolve!:()=>void;const speak=vi.fn(()=>new Promise<void>(done=>resolve=done));
    const pool=[item('sieben',{lexemeId:'sieben-num',pos:'num'}),item('zwei',{lexemeId:'zwei-num',pos:'num'})];
    const {root,host,game,start}=setup('departure-board',{pool:()=>pool,speak},{},{mechanic:'board'});await start();
    expect(root.querySelector<HTMLButtonElement>('[data-game-action="departure-confirm"]')!.disabled).toBe(true);
    game.destroy();resolve();await flush();expect(speak).toHaveBeenCalledOnce();expect(host.speakText).toHaveBeenCalledOnce();expect(host.submit).not.toHaveBeenCalled();
  });
  it('lets controller letter buttons produce German with shift, spaces, umlauts and correction',async()=>{
    const {root,host,start,click}=setup('word-chain');await start();click('keyboard');
    const key=(value:string)=>root.querySelector<HTMLButtonElement>(`[data-game-key="${value}"]`)!.click();
    for(const letter of ['d','e','r','space','shift','k','a','f','f','e','e','ü','backspace'])key(letter);
    expect(root.querySelector<HTMLInputElement>('input')!.value).toBe('Der Kaffee');
    root.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await flush();
    expect(vi.mocked(host.submit).mock.calls[0][0]).toMatchObject({answer:'Der Kaffee',modality:'production',hinted:false});
  });
  it('keeps a manual pause through an automatic visibility resume',async()=>{
    const {root,game,start,click}=setup('departure-board',{}, {},{modalities:['recognition']});await start();click('pause');game.pause();game.resume();
    expect(root.classList.contains('minigame-paused')).toBe(true);click('pause');expect(root.classList.contains('minigame-paused')).toBe(false);
  });
  it('keeps an ambiguous failed save immutable when the response timer expires',async()=>{
    const submit=vi.fn(async(result:RoundResult)=>{void result;throw new Error('Connection interrupted');});
    const {root,start,choose,click}=setup('departure-board',{submit},{},{modalities:['recognition']});
    await start();choose('Kaffee');await flush();const pending=submit.mock.calls[0][0];
    await advance(20000);expect(submit).toHaveBeenCalledTimes(1);
    click('save');await flush();expect(submit.mock.calls[1][0]).toBe(pending);expect(root.querySelector('[data-game-score]')?.textContent).toBe('0 / 0');
  });

  it('lets a previously exposed Re-ink word advance to unaided edges instead of revealing it forever',async()=>{
    const word=item('Kaffee',{seen:{recognition:true,listening:true,production:true},recalls:{recognition:1,listening:1,production:0}});
    const {root,host,start}=setup('re-ink',{pool:()=>[word]});await start();
    expect(root.querySelector('.minigame-ink')?.textContent).not.toBe('Kaffee');
    root.querySelector<HTMLInputElement>('input')!.value='Kaffee';root.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await flush();
    expect(vi.mocked(host.submit).mock.calls[0][0]).toMatchObject({hinted:false,answer:'Kaffee'});
  });
  it('registers all eighteen catalogue games as independent lifecycle controllers',async()=>{
    expect(miniGameDefinitions).toHaveLength(30);expect(new Set(miniGameDefinitions.map(game=>game.id)).size).toBe(30);
    for(const definition of miniGameDefinitions){const game=await loadMiniGame(definition.id);expect(game.id).toBe(definition.id);expect(game.title).toBe(definition.title);expect(game.modalities).toEqual(definition.modalities);expect(game.levels).toEqual(definition.levels);}
    await expect(loadMiniGame('unknown')).rejects.toThrow('Unknown lantern game');
  });

  it('lets an answer change during the confirm window and grades only the final selection',async()=>{
    const {root,host,start}=setup('departure-board',{}, {},{modalities:['recognition']});await start();
    const buttons=[...root.querySelectorAll<HTMLButtonElement>('[data-game-option]')];buttons[0].click();
    await advance(200);expect(host.submit).not.toHaveBeenCalled();buttons[1].click();await advance(300);
    expect(host.submit).toHaveBeenCalledOnce();expect(vi.mocked(host.submit).mock.calls[0][0].answer).toBe(buttons[1].querySelector('.minigame-object-label')!.textContent);
  });

  it('pauses timers and pending confirmation without committing an answer',async()=>{
    const {root,host,game,start,choose}=setup('departure-board',{}, {},{modalities:['recognition']});await start();
    root.querySelector<HTMLButtonElement>('[data-game-option]')!.click();game.pause();await advance(2000);
    expect(host.submit).not.toHaveBeenCalled();expect(root.querySelector('[data-game-time]')?.textContent).toBe('90s');
    expect(scene.pause).toHaveBeenCalledOnce();game.resume();expect(scene.resume).toHaveBeenCalledOnce();
    await advance(500);choose('Kaffee');await flush();expect(host.submit).toHaveBeenCalledOnce();
    expect(vi.mocked(host.submit).mock.calls[0][0].responseMs).toBe(500);
  });

  it('waits for the whole listening cue, and treats a replay as assistance',async()=>{
    let finishSpeech!:()=>void;const speak=vi.fn(()=>new Promise<void>(resolve=>{finishSpeech=resolve;}));
    const {root,host,start,choose,click}=setup('departure-board',{speak});await start();choose('Kaffee');
    expect(host.submit).not.toHaveBeenCalled();expect(root.textContent).toContain('Listen to the whole word first');
    finishSpeech();await flush();click('replay');choose('Kaffee');expect(host.submit).not.toHaveBeenCalled();
    finishSpeech();await flush();choose('Kaffee');await flush();
    expect(vi.mocked(host.submit).mock.calls[0][0]).toMatchObject({modality:'listening',hinted:true,answer:'Kaffee'});
  });

  it('retries an ambiguous save with the same immutable evidence object and no extra credit',async()=>{
    const submit=vi.fn().mockRejectedValueOnce(new Error('Offline')).mockImplementation(async(result:RoundResult)=>receipt(result,false));
    const {root,host,start,choose,click}=setup('departure-board',{submit},{},{modalities:['recognition']});await start();choose('Kaffee');await flush();
    const original=submit.mock.calls[0][0];expect(root.textContent).toContain('Retry saving this answer');expect(root.querySelector('[data-game-score]')!.textContent).toBe('0 / 0');
    expect([...root.querySelectorAll<HTMLButtonElement>('[data-game-option]')].every(button=>button.disabled)).toBe(true);
    click('save');await flush();expect(submit.mock.calls[1][0]).toBe(original);expect(root.querySelector('[data-game-score]')!.textContent).toBe('0 / 1');
    expect(host.audio.sfx).toHaveBeenLastCalledWith('miss');expect(root.textContent).toContain('returns in two turns');
  });

  it('makes clarification an exposed, supported recognition answer',async()=>{
    const {host,start,choose,click}=setup();await start();click('clarify');choose('Kaffee');await flush();
    expect(host.expose).toHaveBeenCalledWith(['kaffee-noun']);
    expect(vi.mocked(host.submit).mock.calls[0][0]).toMatchObject({modality:'recognition',hinted:true});
  });

  it('counts compound item and quantity recalls only after all authoritative responses arrive',async()=>{
    const numbers=[item('eins',{lexemeId:'eins-num',pos:'num'}),item('zwei',{lexemeId:'zwei-num',pos:'num'}),item('drei',{lexemeId:'drei-num',pos:'num'})];
    const pool=vi.fn(query=>query?.topics?foods:[...foods,...numbers]);
    let first=true;const submit=vi.fn(async(result:RoundResult)=>{if(first&&result.lexemeId==='tee-noun')throw new Error('Sibling unavailable');return receipt(result);});
    const {root,host,start,click}=setup('tray-rush',{pool,submit});await start();
    for(const lemma of ['Kaffee','Tee']){const button=[...root.querySelectorAll<HTMLButtonElement>('[data-game-option]')].find(button=>button.querySelector('.minigame-object-label')?.textContent===lemma)!;button.click();}
    root.querySelector<HTMLButtonElement>('[data-game-quantity="0:1"]')!.click();root.querySelector<HTMLButtonElement>('[data-game-quantity="1:1"]')!.click();root.querySelector<HTMLButtonElement>('[data-game-quantity="1:1"]')!.click();
    click('serve');await flush();expect(submit).toHaveBeenCalledTimes(4);expect(root.querySelector('[data-game-score]')!.textContent).toBe('0 / 0');
    const evidence=submit.mock.calls.map(call=>call[0]);expect(evidence.map(result=>result.lexemeId)).toEqual(['kaffee-noun','zwei-num','tee-noun','drei-num']);expect(evidence.map(result=>result.answer)).toEqual(['Kaffee','zwei','Tee','drei']);
    first=false;click('save');await flush();expect(root.querySelector('[data-game-score]')!.textContent).toBe('4 / 4');
    for(let index=0;index<4;index++)expect(submit.mock.calls[4+index][0]).toBe(evidence[index]);expect(host.audio.sfx).toHaveBeenLastCalledWith('bell');
  });

  it('records production scaffold assistance and keeps unaided spelling distinct',async()=>{
    const pool=()=>[item('Kaffee',{sprite:'kaffee',recalls:{recognition:0,listening:0,production:1}})];
    const {root,host,start}=setup('word-chain',{pool});await start();root.querySelector<HTMLInputElement>('input')!.value='Kaffee';
    root.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await flush();
    expect(vi.mocked(host.submit).mock.calls[0][0]).toMatchObject({modality:'production',hinted:true,answer:'Kaffee'});
  });

  it('cancels scene, input, confirmation and animation work when destroyed',async()=>{
    const {root,host,game,start}=setup('departure-board',{}, {},{modalities:['recognition']});await start();
    root.querySelector<HTMLButtonElement>('[data-game-option]')!.click();game.destroy();await advance(2000);
    expect(host.submit).not.toHaveBeenCalled();expect(scene.destroy).toHaveBeenCalled();expect(frames.size).toBe(0);
    expect(vi.mocked(host.input.bind).mock.results[0].value).toHaveBeenCalled();
  });

  it('retests a miss after two other cues and marks that retry supported',async()=>{
    let first=true;const submit=vi.fn(async(result:RoundResult)=>{const correct=!first;first=false;return receipt(result,correct);});
    const {root,start,choose}=setup('departure-board',{submit},{},{modalities:['recognition']});await start();
    choose('Kaffee');await flush();await advance(1600);choose('Tee');await flush();await advance(650);choose('Brot');await flush();await advance(650);
    expect(root.querySelector('.minigame-cue')?.textContent).toBe('Kaffee');choose('Kaffee');await flush();
    expect(submit.mock.calls.map(call=>call[0].lexemeId)).toEqual(['kaffee-noun','tee-noun','brot-noun','kaffee-noun']);
    expect(submit.mock.calls[0][0].hinted).toBe(false);expect(submit.mock.calls[3][0].hinted).toBe(true);
  });

  it('reports a closed round once and lets an in-flight answer settle after destroy without rebuilding UI',async()=>{
    let resolve!:(value:AttemptResult)=>void;const submit=vi.fn((result:RoundResult)=>{void result;return new Promise<AttemptResult>(done=>{resolve=done;});});
    const {root,host,game,start,choose}=setup('departure-board',{submit},{},{modalities:['recognition']});await start();choose('Kaffee');
    game.destroy();const closedMarkup=root.innerHTML;
    // The answer was still saving when the round closed, so the summary does not count it.
    expect(host.end).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({attempts:0,correct:0}));
    resolve(receipt(submit.mock.calls[0][0]));await flush();await advance(2000);
    expect(root.innerHTML).toBe(closedMarkup);expect(scene.feedback).not.toHaveBeenCalled();expect(host.end).toHaveBeenCalledOnce();
  });

  it('does not report a round that never started, or one already finished, when it is closed',async()=>{
    const idle=setup('departure-board',{},{},{modalities:['recognition']});idle.game.destroy();expect(idle.host.end).not.toHaveBeenCalled();
    const done=setup('departure-board',{},{},{modalities:['recognition']});await done.start();done.click('finish');done.game.destroy();
    expect(done.host.end).toHaveBeenCalledOnce();
  });

  it('can still finish after a save fails, and says which answers were not counted',async()=>{
    const submit=vi.fn(async()=>{throw new Error('The town is offline.');});
    const {root,host,start,choose,click}=setup('departure-board',{submit},{},{modalities:['recognition']});await start();choose('Kaffee');await flush();
    expect(root.textContent).toContain('The town is offline.');expect(root.querySelector('[data-game-action="save"]')).not.toBeNull();
    click('finish');
    expect(host.end).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({attempts:0}));
    expect(root.textContent).toContain('The ink remembers.');expect(root.textContent).toContain('1 answer could not be saved and was not counted.');
  });

  it('finishes on time after a failed save instead of waiting for a retry forever',async()=>{
    const submit=vi.fn(async()=>{throw new Error('The town is offline.');});
    const {root,host,start,choose}=setup('departure-board',{submit},{},{modalities:['recognition'],seconds:5});await start();choose('Kaffee');await flush();
    await advance(6000);
    expect(host.end).toHaveBeenCalledOnce();expect(root.textContent).toContain('could not be saved');
  });

  it('runs the round clock on the shared mini-game loop when the scene provides one',async()=>{
    const callbacks=new Set<(now:number)=>void>();
    scene.onFrame=vi.fn((callback:(now:number)=>void)=>{callbacks.add(callback);return()=>callbacks.delete(callback);});
    try{
      const {root,game,start}=setup('departure-board',{},{},{modalities:['recognition'],seconds:30});await start();
      expect(scene.onFrame).toHaveBeenCalledOnce();expect(callbacks.size).toBe(1);expect(frames.size).toBe(0);
      for(let step=0;step<20;step++){await vi.advanceTimersByTimeAsync(100);for(const callback of callbacks)callback(performance.now());}
      expect(root.querySelector('[data-game-time]')?.textContent).toBe('28s');
      game.destroy();expect(callbacks.size).toBe(0);
    }finally{delete scene.onFrame;}
  });

  it('does not start another cue after a completed round is finished during its feedback delay',async()=>{
    const {root,host,start,choose,click}=setup('departure-board',{}, {},{modalities:['recognition']});await start();choose('Kaffee');await flush();click('finish');
    expect(host.end).toHaveBeenCalledOnce();expect(root.textContent).toContain('The ink remembers.');await advance(1000);
    expect(root.textContent).toContain('The ink remembers.');expect(root.querySelector('[data-game-option]')).toBeNull();expect(host.end).toHaveBeenCalledOnce();
  });

  it('gives Re-ink a fading word even when the noun has a painted sprite',async()=>{
    const {root,start}=setup('re-ink',{pool:()=>[item('Kaffee',{sprite:'kaffee'})]});await start();
    expect(root.querySelector('.minigame-ink')?.textContent).toBe('Kaffee');await advance(1500);
    expect(root.querySelector('.minigame-ink')?.classList.contains('fading')).toBe(true);
  });

  it('does not run down the answer timer while a listening cue is still playing',async()=>{
    const {host,start}=setup('departure-board',{speak:vi.fn(()=>new Promise<void>(()=>{}))});await start();await advance(12500);
    expect(host.submit).not.toHaveBeenCalled();
  });

  it('keeps listening picture answers out of text and accessible image labels',async()=>{
    const pool=()=>foods.map(food=>({...food,sprite:food.lexemeId}));
    const {root,start}=setup('lantern-lighting',{pool});await start();
    expect(root.querySelector('.minigame-cue')).toBeNull();
    for(const button of root.querySelectorAll('[data-game-option]')){
      expect(button.getAttribute('aria-label')).toMatch(/^Option \d+$/);
      expect(button.querySelector('img')?.alt).toMatch(/^Option \d+$/);
      expect(button.querySelector('.minigame-object-label')?.textContent).toBe('');
    }
  });

  it('switches Brass Stamp to an attested plural at A2 and records the tested form',async()=>{
    const {root,host,start,choose}=setup('brass-stamp',{}, {level:'A2'});await start();
    choose('der');await flush();await advance(650);choose('die');await flush();await advance(650);
    expect(root.querySelector('.minigame-rule')?.textContent).toBe('Plural');choose('Brote');await flush();
    expect(vi.mocked(host.submit).mock.calls[2][0]).toMatchObject({lexemeId:'brot-noun',modality:'recognition',answer:'Brote',answerKind:'plural'});
  });

  it('uses authoritative B1 case choices only when every mapped word has been restored',async()=>{
    const restored={...emptyProgress(),intake:{version:1,activeSeconds:0,creditSeconds:0,lastBeatAt:'',wordIds:['kaffee-noun']}};
    const grammar:Exercise&{wordIds:string[];kind:string}={id:'case-grammar',itemId:'case-memory',kind:'grammar',mode:'choice',prompt:'Choose the dative article',german:'mit ___ Kaffee',english:'with coffee',answer:'dem',options:['der','dem','den'],hint:'',explanation:'Mit takes the dative.',wordIds:['kaffee-noun']};
    const hidden={...grammar,id:'unseen-case',german:'UNINTRODUCED CASE',wordIds:['new-noun']};
    const {root,host,start,choose}=setup('brass-stamp',{progress:()=>restored,exercises:new Map([[grammar.id,grammar],[hidden.id,hidden]])},{level:'B1'});await start();
    choose('der');await flush();await advance(650);
    expect(root.textContent).toContain(grammar.german);expect(root.textContent).not.toContain('UNINTRODUCED CASE');choose('dem');await flush();
    expect(vi.mocked(host.submit).mock.calls[1][0]).toMatchObject({exerciseId:grammar.id,modality:'recognition',answer:'dem'});
    expect(vi.mocked(host.submit).mock.calls[1][0].answerKind).toBeUndefined();
  });

  it('uses an eligible story exercise and never displays another scene or unrestored words',async()=>{
    const restored={...emptyProgress(),intake:{version:1,activeSeconds:0,creditSeconds:0,lastBeatAt:'',wordIds:['kaffee-noun']}};
    const base:Exercise&{wordIds:string[]}={id:'a2-broken-clock-exercise-1',itemId:'scene-memory',mode:'choice',prompt:'Restore the clockmill log',german:'Gestern habe ich Kaffee gekocht.',english:'Yesterday I made coffee.',answer:'Ich habe Kaffee gekocht.',options:['Ich habe Kaffee gekocht.','Morgen koche ich Kaffee.'],hint:'',explanation:'The log records yesterday.',wordIds:['kaffee-noun']};
    const hidden={...base,id:'a2-broken-clock-exercise-2',german:'UNRESTORED FORM',wordIds:['unknown-verb']};
    const otherScene={...base,id:'a1-cafe-exercise-1',german:'OTHER SCENE'};
    const {root,host,start,choose}=setup('lost-hour',{progress:()=>restored,exercises:new Map([base,hidden,otherScene].map(exercise=>[exercise.id,exercise]))},{level:'A2',fixedPool:['kaffee-noun']});await start();
    expect(root.textContent).toContain(base.german);expect(root.textContent).not.toContain('UNRESTORED FORM');expect(root.textContent).not.toContain('OTHER SCENE');
    choose(base.answer);await flush();expect(vi.mocked(host.submit).mock.calls[0][0]).toMatchObject({exerciseId:base.id,modality:'recognition',answer:base.answer});
    expect(vi.mocked(host.submit).mock.calls[0][0].answerKind).toBeUndefined();
  });

  it('grades the kettle’s first two cues and keeps the learner’s name outside lexical evidence',async()=>{
    const pool=()=>[item('Regen',{lexemeId:'regen-noun'}),item('Sonne',{lexemeId:'sonne-noun'})];
    const {root,host,start,choose}=setup('kettle-forecast',{pool,playerName:'Mara'});await start();
    choose('Regen');await flush();await advance(650);choose('Sonne');await flush();await advance(650);
    expect(root.textContent).toContain('Correct your name on the receipt.');expect(host.submit).toHaveBeenCalledTimes(2);
    root.querySelector<HTMLInputElement>('input')!.value='Mara';root.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await flush();await advance(650);
    expect(host.submit).toHaveBeenCalledTimes(2);expect(host.end).toHaveBeenCalledWith(expect.objectContaining({attempts:2,correct:2}));
  });

  it('plays an eligible tape sentence, marks its actual loop position, then grades supported transcription',async()=>{
    const authored=quests.find(quest=>quest.id==='b1-witness')!.exercises.find(exercise=>exercise.id==='b1-witness-exercise-3')!;
    const exercise:Exercise&{wordIds:string[]}={...authored,wordIds:courseContextWordIds[authored.id]};
    const restored={...emptyProgress(),intake:{version:1,activeSeconds:0,creditSeconds:0,lastBeatAt:'',wordIds:exercise.wordIds}};
    let finishSpeech!:()=>void;const speakText=vi.fn(()=>new Promise<void>(resolve=>{finishSpeech=resolve;}));
    const {root,host,start,click}=setup('looping-tape',{pool:()=>[item('sicher',{lexemeId:'sicher-adj',pos:'adj',level:'B1'})],progress:()=>restored,exercises:new Map([[exercise.id,exercise]]),speakText,audio:{sfx:vi.fn(),stop:vi.fn(),positionMs:()=>3500}},{level:'B1'});await start();
    expect(speakText).toHaveBeenCalledWith(exercise.german,`/audio/minigames/loop-${exercise.id}.mp3`);
    click('mark-loop');expect(root.textContent).toContain('The cough repeats here');
    root.querySelector<HTMLInputElement>('input')!.value=exercise.answer;root.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await flush();
    expect(host.submit).not.toHaveBeenCalled();
    finishSpeech();await flush();root.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await flush();
    expect(vi.mocked(host.submit).mock.calls[0][0]).toMatchObject({exerciseId:exercise.id,modality:'production',hinted:true,answer:exercise.answer});
  });
});
