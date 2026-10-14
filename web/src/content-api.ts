import type { Api } from './api';
import { baseLanguage, onBaseLanguageChange, lexemeMeaning } from './i18n';
import { clearContentCatalog, installContentCatalog, installQuestExercises, quests, npcs, type Chapter, type Exercise, type NPC, type Quest } from './content';
import { clearCourseContent, lexemeById, installCourseExercises, installCourseMetadata, installLexemes, type CourseExercise, type CourseLexeme, type CourseSource, type CourseUnit, type CourseGrammar } from './course';
import { clearQuestGraphs, installQuestGraph } from './quest-graph';
import type { DialogueLine, QuestGraph } from './dialogue';
import type { AlignedLine } from './aligned-line';
import {clearStoryContent,installStorySkeletons} from './story';
import {clearActivityContent} from './activity-engine';
import {clearContextualGrammar} from './contextual-grammar';
import {clearBeginnerContent,installBeginnerExercise} from './beginner-dialogue';
import {clearCinematicContent} from './cinematic-content';
import {clearPlacementDialogue} from './learning-context';
import {clearExpeditionContent} from './expeditions';
import {clearExpeditionGames} from './expedition-games';
import {clearInteriorContent} from './interiors';
import {clearInteriorConversations} from './interior-conversations';
import {clearExpeditionLearning} from './expedition-learning';

type RecordKind = 'graphs' | 'lines' | 'exercises' | 'lexemes' | 'units' | 'expeditions' | 'minigames' | 'narratives';
export interface ContentBootstrap {
  placementExerciseIds?:string[];
  npcs: NPC[]; quests: Quest[]; chapters?: Chapter[];
  units?: CourseUnit[]; grammar?: CourseGrammar[]; edition?: string; sources?: CourseSource[];
  counts?: Record<string, number>;
  [key:string]:unknown;
}
export interface ContentLine extends AlignedLine {
  speaker?: string; clipId?: string; expression?: DialogueLine['expression']; condition?: DialogueLine['condition'];
  addressedTo?: string; variantIds?: string[]; questId?: string; nodeId?: string;
  reply?: { exerciseId: string; correctionLineId?: string; correction?: DialogueLine };
}
export type ContentRequest = Pick<Api, 'request'>;
class LRU<T> {
  private values = new Map<string,T>();
  constructor(private capacity:number) {}
  get(id:string):T|undefined {const value=this.values.get(id);if(value!==undefined){this.values.delete(id);this.values.set(id,value);}return value;}
  set(id:string,value:T):void {this.values.delete(id);this.values.set(id,value);while(this.values.size>this.capacity)this.values.delete(this.values.keys().next().value!);}
  clear():void {this.values.clear();}
}
const capacities:Record<RecordKind,number>={graphs:10,lines:48,exercises:32,lexemes:96,units:24,expeditions:8,minigames:8,narratives:32};
const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function assertID(id:string):void {if(!uuidPattern.test(id))throw new Error('Content requires an opaque UUID.');}
function localizeRecord<T>(value:T):T {
  if(!value||typeof value!=='object')return value;
  const record=value as {support?:Record<string,Record<string,unknown>>};
  const support=record.support?.[baseLanguage()];
  return {...value,...(support??{}),localized:true};
}
function localizeLexeme(value:{id:string}):CourseLexeme {
  const word=value as unknown as CourseLexeme;
  return {...word,english:word.meaning??word.english,localized:true};
}
export class ContentUnavailable extends Error {constructor(readonly id:string){super('This content could not open. Try again.');}}
interface PendingRecord {resolve(value:unknown):void;reject(error:unknown):void;promise:Promise<unknown>;}

/** Authenticated slices are held only in memory and never shared across owners or languages. */
export class ContentClient {
  private caches=new Map<RecordKind,LRU<unknown>>(Object.entries(capacities).map(([kind,capacity])=>[kind as RecordKind,new LRU(capacity)]));
  private pending=new Map<string,Promise<unknown>>();
  private batches=new Map<'lines'|'lexemes',Map<string,PendingRecord>>();
  private batchScheduled=new Set<string>();
  private scope=''; private generation=0;
  private bootstrapValue?:ContentBootstrap; private bootstrapPromise?:Promise<ContentBootstrap>;
  private removeLanguageListener:()=>void;
  private listeners=new Set<()=>void>();
  private clearListeners=new Set<()=>void>();
  constructor(private api:ContentRequest,private options:{owner?:()=>string;language?:()=>string;clearRegistries?:boolean}={}) {
    this.removeLanguageListener=onBaseLanguageChange(()=>this.clear());
  }
  onClear(listener:()=>void):()=>void {this.clearListeners.add(listener);return()=>this.clearListeners.delete(listener);}
  get revision():number {this.checkScope();return this.generation;}
  onChange(listener:()=>void):()=>void {this.listeners.add(listener);return()=>this.listeners.delete(listener);}
  private changed():void {for(const listener of this.listeners)listener();}
  private currentScope():string {return `${this.options.owner?.()??'session'}:${this.options.language?.()??baseLanguage()}`;}
  private checkScope():void {const scope=this.currentScope();if(scope!==this.scope){this.clear();this.scope=scope;}}
  clear():void {
    this.generation++;this.scope='';this.bootstrapValue=undefined;this.bootstrapPromise=undefined;this.pending.clear();
    for(const cache of this.caches.values())cache.clear();
    for(const batch of this.batches.values())for(const [id,pending] of batch)pending.reject(new ContentUnavailable(id));
    this.batches.clear();this.batchScheduled.clear();
    for(const listener of this.clearListeners)listener();
    if(this.options.clearRegistries!==false){clearContentCatalog();clearCourseContent();clearQuestGraphs();clearStoryContent();clearActivityContent();clearContextualGrammar();clearBeginnerContent();clearCinematicContent();clearPlacementDialogue();clearExpeditionContent();clearExpeditionGames();clearInteriorContent();clearInteriorConversations();clearExpeditionLearning();}
  }
  destroy():void {this.clear();this.removeLanguageListener();this.listeners.clear();this.clearListeners.clear();}
  peek<T>(kind:RecordKind,id:string):T|undefined {this.checkScope();return this.caches.get(kind)!.get(id) as T|undefined;}
  async bootstrap(refresh=false):Promise<ContentBootstrap> {
    this.checkScope();if(refresh){this.bootstrapValue=undefined;this.bootstrapPromise=undefined;}if(this.bootstrapValue)return this.bootstrapValue;
    const generation=this.generation;
    this.bootstrapPromise??=this.api.request<ContentBootstrap>('/content/bootstrap').then(value=>{
      if(generation!==this.generation)throw new ContentUnavailable('bootstrap');
      value={...value,quests:value.quests.map(quest=>localizeRecord(quest))};
      this.bootstrapValue=value;
      if(this.options.clearRegistries!==false){installContentCatalog(value);installCourseMetadata(value);installStorySkeletons((value.narratives??[]) as Parameters<typeof installStorySkeletons>[0]);}
      this.changed();return value;
    }).catch(error=>{if(generation===this.generation)this.bootstrapPromise=undefined;throw error;});
    return this.bootstrapPromise;
  }
  private async single<T>(kind:RecordKind,id:string):Promise<T> {
    this.checkScope();assertID(id);const cached=this.peek<T>(kind,id);if(cached)return cached;
    const key=`${kind}:${id}`,existing=this.pending.get(key);if(existing)return existing as Promise<T>;
    const generation=this.generation;
    const request=this.api.request<T>(`/content/${kind}/${id}`).then(value=>{
      if(generation!==this.generation)throw new ContentUnavailable(id);
      const localized=kind==='lines'?value:localizeRecord(value);
      this.caches.get(kind)!.set(id,localized);return localized;
    }).finally(()=>{if(this.pending.get(key)===request)this.pending.delete(key);});
    this.pending.set(key,request);return request;
  }
  private batched<T extends {id:string}>(kind:'lines'|'lexemes',ids:readonly string[]):Promise<T[]> {
    this.checkScope();const unique=[...new Set(ids)];for(const id of unique)assertID(id);
    return Promise.all(unique.map(id=>{
      const cached=this.peek<T>(kind,id);if(cached)return Promise.resolve(cached);
      const key=`${kind}:${id}`,existing=this.pending.get(key);if(existing)return existing as Promise<T>;
      let resolve!:(value:unknown)=>void,reject!:(error:unknown)=>void;
      const promise=new Promise<unknown>((yes,no)=>{resolve=yes;reject=no;});
      const batch=this.batches.get(kind)??new Map<string,PendingRecord>();batch.set(id,{resolve,reject,promise});this.batches.set(kind,batch);this.pending.set(key,promise);
      if(!this.batchScheduled.has(kind)){this.batchScheduled.add(kind);queueMicrotask(()=>void this.flushBatch(kind));}
      return promise as Promise<T>;
    }));
  }
  private async flushBatch(kind:'lines'|'lexemes'):Promise<void> {
    this.batchScheduled.delete(kind);const batch=this.batches.get(kind);if(!batch?.size)return;
    this.batches.delete(kind);const generation=this.generation,entries=[...batch],cap=kind==='lines'?12:24;
    // Independent network batches are capped by the server contract. Missing and locked IDs are indistinguishable.
    await Promise.all(entries.reduce<Array<typeof entries>>((chunks,entry,index)=>{if(index%cap===0)chunks.push([]);chunks.at(-1)!.push(entry);return chunks;},[]).map(async chunk=>{
      try {
        const response=await this.api.request<Record<string,{id:string}[]>>(`/content/${kind}?ids=${chunk.map(([id])=>id).join(',')}`);
        if(generation!==this.generation)throw new ContentUnavailable(chunk[0][0]);
        const records=response[kind]??[],byID=new Map(records.map(record=>[record.id,record]));
        for(const [id,pending] of chunk){const value=byID.get(id);if(value){const record=kind==='lexemes'?localizeLexeme(value):value;this.caches.get(kind)!.set(id,record);pending.resolve(record);}else pending.reject(new ContentUnavailable(id));}
      } catch(error) {for(const [,pending] of chunk)pending.reject(error);}
      finally {for(const [id,record] of chunk)if(this.pending.get(`${kind}:${id}`)===record.promise)this.pending.delete(`${kind}:${id}`);}
    }));
  }
  async graph(id:string):Promise<QuestGraph> {
    const graph=await this.single<QuestGraph>('graphs',id);
    for(const node of graph.nodes){node.lineIds??=(node.lines??[]).map(line=>typeof line==='string'?line:line.id);node.lines=(node.lines??[]).filter(line=>typeof line!=='string'&&!!line.german);}
    for(const topic of graph.topics??[]){topic.lineIds??=(topic.lineRefs??topic.lines??[]).map(line=>typeof line==='string'?line:line.id);topic.lines=(topic.lines??[]).filter(line=>typeof line!=='string'&&!!line.german);}
    return this.options.clearRegistries===false?graph:installQuestGraph(graph);
  }
  lines(ids:readonly string[]):Promise<ContentLine[]> {return this.batched<ContentLine>('lines',ids);}
  async exercises(ids:readonly string[]):Promise<Exercise[]> {
    const exercises=await Promise.all([...new Set(ids)].map(id=>this.single<Exercise>('exercises',id)));
    if(this.options.clearRegistries!==false){
      for(const exercise of exercises)installBeginnerExercise(exercise);
      installCourseExercises(exercises.filter((exercise):exercise is CourseExercise=>'unitId' in exercise));
      for(const quest of quests)installQuestExercises(quest.id,exercises.filter(exercise=>quest.exerciseIds?.includes(exercise.id)));
      this.changed();
    }
    return exercises;
  }
  async lexemes(ids:readonly string[]):Promise<CourseLexeme[]> {const words=await this.batched<CourseLexeme>('lexemes',ids);if(this.options.clearRegistries!==false){installLexemes(words);this.changed();}return words;}
  async unit(id:string):Promise<CourseUnit> {
    const raw=await this.single<CourseUnit>('units',id);
    const {hydrateNarrative}=await import('./content-narratives');
    const unit=await hydrateNarrative(raw);
    if(this.options.clearRegistries!==false){const guides=(unit as CourseUnit&{grammar?:CourseGrammar[]}).grammar?.map(guide=>({...localizeRecord(guide),explanation:guide.instruction??guide.explanation??''}));installCourseMetadata({units:[unit],grammar:guides});}
    return unit;
  }
  expedition<T extends {id?:string}=Record<string,unknown>>(id:string):Promise<T> {return this.single<T>('expeditions',id);}
  minigame<T extends {id?:string}=Record<string,unknown>>(id:string):Promise<T> {return this.single<T>('minigames',id);}
  narrative<T extends {id?:string}=Record<string,unknown>>(id:string):Promise<T> {return this.single<T>('narratives',id);}
}
let activeClient:ContentClient|undefined;
export function configureContentClient(api:ContentRequest,options?:ConstructorParameters<typeof ContentClient>[1]):ContentClient {activeClient?.destroy();return activeClient=new ContentClient(api,options);}
export function getContentClient():ContentClient {if(!activeClient)throw new Error('The content session is not ready.');return activeClient;}
export function contentMeanings(line:AlignedLine|undefined):Record<string,string> {
  const meanings:Record<string,string>={};
  for(const id of Object.values(line?.glosses??{})){const word=lexemeById.get(id);if(word)meanings[id]=lexemeMeaning(word);}
  return meanings;
}
export function toDialogueLine(line:ContentLine):DialogueLine {
  const support=line.support[baseLanguage()]??line.support.en;
  return {id:line.id,speaker:npcs.find(npc=>npc.contentId===line.speaker)?.id??line.speaker??'',german:line.de.text,english:support?.text??'',clipId:line.clipId??line.id,aligned:line,localized:true,expression:line.expression,condition:line.condition,addressedTo:npcs.find(npc=>npc.contentId===line.addressedTo)?.id??line.addressedTo,variantIds:line.variantIds,
    ...(line.reply?{reply:{exerciseId:line.reply.exerciseId,correctionLineId:line.reply.correctionLineId,correction:line.reply.correction}}:{})};
}
