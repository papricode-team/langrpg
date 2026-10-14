import type { Api, AttemptResult, Progress } from '../api';
import {getContentClient} from '../content-api';
import type { CourseExercise, CourseLexeme } from '../course';
import { gameItemPool } from './pool';
import { MiniGameInput } from './input';
import { SpriteLibrary } from './sprite-library';
import type { MiniGameHost, RoundResult, RoundSummary } from './types';
import audioData from './audio-data.json';

interface AttemptBody {
  id:string;exerciseId:string;itemId:string;answer:string;mode:string;hinted:boolean;
  responseTimeMs:number;miniGameId:string;answerKind?:string;contextExerciseId?:string;
  contentId?:string;regionId?:string;level?:string;selectedValue?:number;
}
interface BatchResponse {
  results: (Omit<AttemptResult,'progress'> & {error?:string;status?:number})[]; progress:Progress;
}
export interface HostOptions {
  api:Api; gameId:string; lexicon:readonly CourseLexeme[]; exercises:readonly CourseExercise[];
  progress:()=>Progress; onProgress:(progress:Progress)=>void; onEnd:(summary:RoundSummary)=>void;
  playerName:string; silent:boolean; muted:boolean; reducedMotion:boolean; narration:(active:boolean)=>void;
}
/** Compound answers share a request. A failed save retries the identical receipt ID. */
export class AttemptBatcher {
  private queue:{body:AttemptBody;resolve:(value:AttemptResult)=>void;reject:(error:Error)=>void}[]=[];
  private timer?:ReturnType<typeof setTimeout>;
  private bodies=new WeakMap<RoundResult,AttemptBody>();
  private pending=new WeakMap<RoundResult,Promise<AttemptResult>>();
  private receipts=new WeakMap<RoundResult,AttemptResult>();
  private flushing=false;
  private closed=false;
  private owner:string;private token:string;
  constructor(private options:HostOptions){this.owner=options.api.selfId;this.token=options.api.token;}
  submit(result:RoundResult):Promise<AttemptResult>{
    if(this.closed)return Promise.reject(new Error('The mini-game has closed.'));
    const receipt=this.receipts.get(result);if(receipt)return Promise.resolve(receipt);
    const pending=this.pending.get(result);if(pending)return pending;
    const captured={...result};
    const request=this.prepareBody(result,captured).then(body=>new Promise<AttemptResult>((resolve,reject)=>{
      this.queue.push({body,resolve,reject});
      if(this.closed||this.queue.length>=30)void this.flush();
      else this.timer??=setTimeout(()=>void this.flush(),40);
    }));
    this.pending.set(result,request);
    void request.then(receipt=>{this.receipts.set(result,receipt);this.pending.delete(result);},()=>this.pending.delete(result));
    return request;
  }
  private async prepareBody(result:RoundResult,captured:RoundResult):Promise<AttemptBody>{
    const existing=this.bodies.get(result);if(existing)return existing;
    const word=this.options.lexicon.find(word=>word.id===captured.lexemeId);
    const exerciseId=captured.exerciseId??word?.exerciseIds?.[captured.modality]?.[0];
    if(!exerciseId)throw new Error('The practice record could not open. Try again.');
    const exercise=this.options.exercises.find(exercise=>exercise.id===exerciseId)??(await getContentClient().exercises([exerciseId]))[0];
    if(this.options.api.selfId!==this.owner||this.options.api.token!==this.token)throw new Error('The player account changed before this answer was saved.');
    const body={id:crypto.randomUUID(),exerciseId,itemId:exercise.itemId,answer:captured.answer||'__timeout__',mode:captured.modality,hinted:captured.hinted,responseTimeMs:Math.min(600000,Math.max(0,Math.round(captured.responseMs))),miniGameId:this.options.gameId,answerKind:captured.answerKind,contextExerciseId:captured.contextExerciseId,contentId:captured.contentId,regionId:captured.regionId,level:captured.level,selectedValue:captured.selectedValue};
    this.bodies.set(result,body);return body;
  }
  private async flush(){
    if(this.flushing)return;
    if(this.timer!==undefined){clearTimeout(this.timer);this.timer=undefined;}
    const entries=this.queue.splice(0,30);if(!entries.length)return;
    if(this.options.api.selfId!==this.owner||this.options.api.token!==this.token){for(const entry of [...entries,...this.queue.splice(0)])entry.reject(new Error('The player account changed before this answer was saved.'));return;}
    this.flushing=true;
    try{
      const response=await this.options.api.request<BatchResponse>('/attempt',entries.map(entry=>entry.body));
      if(response.progress.revision>=this.options.progress().revision)this.options.onProgress(response.progress);
      for(const entry of entries){
        const result=response.results.find(result=>result.attemptId===entry.body.id);
        if(!result||result.error||(result.status!==undefined&&result.status!==200)||typeof result.correct!=='boolean')entry.reject(new Error(result?.error??'The answer could not be saved.'));
        else entry.resolve({...result,progress:response.progress});
      }
    }catch(error){for(const entry of entries)entry.reject(error instanceof Error?error:new Error('The connection was interrupted.'));}
    finally{this.flushing=false;}
    if(this.queue.length)this.timer=setTimeout(()=>void this.flush(),this.closed?0:40);
  }
  /** Answers already made still commit when the dialog closes. */
  destroy(){this.closed=true;if(this.timer!==undefined){clearTimeout(this.timer);this.timer=undefined;}void this.flush();}
}

export function createMiniGameHost(options:HostOptions):MiniGameHost & {destroy():void}{
  const batcher=new AttemptBatcher(options), sprites=new SpriteLibrary();
  let speech:HTMLAudioElement|undefined, settle:(()=>void)|undefined, alive=true, generation=0;
  let speechNarrating=false,externalNarration=false;
  const syncNarration=()=>options.narration(alive&&(speechNarrating||externalNarration));
  const effects=new Set<HTMLAudioElement>();
  const clips=new Map(audioData.clips.map(clip=>[clip.text,clip.path]));
  let context:AudioContext|undefined,analyser:AnalyserNode|undefined;
  const stop=()=>{
    generation++;
    if(speech){speech.onended=null;speech.onerror=null;speech.pause();speech=undefined;}
    const interrupted=settle;settle=undefined;interrupted?.();
    if('speechSynthesis'in window)window.speechSynthesis.cancel();
    for(const effect of effects)effect.pause();effects.clear();
    speechNarrating=false;syncNarration();
  };
  const speakText=(text:string,path?:string,rate=1):Promise<void>=>{
    stop();
    if(!alive)return Promise.reject(new Error('The mini-game has closed.'));
    if(options.silent)return Promise.reject(new Error('Listening is paused in silent mode.'));
    const version=generation;
    return new Promise((resolve,reject)=>{
      const finish=()=>{if(version!==generation)return;speech=undefined;settle=undefined;speechNarrating=false;syncNarration();resolve();};
      const fail=()=>{if(version!==generation)return;speech=undefined;settle=undefined;speechNarrating=false;syncNarration();reject(new Error('Audio could not play. Replay or open the word card.'));};
      settle=()=>reject(new Error('Speech interrupted.'));
      speechNarrating=true;syncNarration();
      path??=clips.get(text);
      if(path){
        const audio=new Audio(path);speech=audio;audio.playbackRate=rate;audio.onended=finish;audio.onerror=fail;
        if(options.gameId==='looping-tape')try{context??=new AudioContext();analyser=context.createAnalyser();analyser.fftSize=256;const source=context.createMediaElementSource(audio);source.connect(analyser);analyser.connect(context.destination);void context.resume();}catch{analyser=undefined;}
        void audio.play().catch(fail);
      }
      else if('speechSynthesis'in window){
        const utterance=new SpeechSynthesisUtterance(text);utterance.lang='de-DE';utterance.rate=.82*rate;utterance.onend=finish;utterance.onerror=fail;
        window.speechSynthesis.speak(utterance);
      }else fail();
    });
  };
  return {
    pool:query=>gameItemPool(options.lexicon,options.progress(),query),
    submit:result=>batcher.submit(result),sprites,input:new MiniGameInput(),
    speak:(item,rate)=>speakText(item.article?`${item.article} ${item.articleForm??item.lemma}`:item.lemma,item.audio,rate),speakText,
    audio:{sfx(name){if(options.silent||options.muted||!alive)return;const audio=new Audio(`/audio/ui/${name}.ogg`);audio.volume=.28;effects.add(audio);audio.onended=()=>effects.delete(audio);audio.onerror=()=>effects.delete(audio);void audio.play().catch(()=>effects.delete(audio));},stop,narration(active){externalNarration=active;syncNarration();},waveform(){if(!speech||!analyser)return;const data=new Uint8Array(analyser.fftSize);analyser.getByteTimeDomainData(data);return data;},positionMs:()=>speech?speech.currentTime*1000:undefined},
    end:summary=>options.onEnd(summary),
    expose:wordIds=>{void options.api.expose({wordIds}).then(result=>options.onProgress(result.progress)).catch(()=>{});},
    progress:options.progress,exercises:new Map(options.exercises.map(exercise=>[exercise.id,exercise])),
    playerName:options.playerName,playerId:options.api.selfId,silent:options.silent,reducedMotion:options.reducedMotion,
    destroy(){alive=false;externalNarration=false;stop();batcher.destroy();void context?.close();},
  };
}
