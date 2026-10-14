import data from './data/expedition-learning-runtime.json';
import { introducedWords } from './intake';
import type { Api, AttemptResult, Progress } from './api';
import type { Level } from './content';
import type { ServerExpeditionPlan } from './expedition-games';
import { activeCourse } from './content-runtime';

export const expeditionLearningManifest=data;
export const encounterLearning=new Map(data.encounters.map(row=>[row.encounterId,row]));
export const placementLearning=new Map(data.placements.map(row=>[`${row.mapId}:${row.level}:${row.fieldId}`,row]));
export type ExpeditionLearningExercise=typeof data.exercises[number];
const exercises=new Map(data.exercises.map(row=>[row.id,row]));
/** Register only the binding and exercises fetched for the current encounter. */
export function installExpeditionBindings(binding: unknown, records: readonly { id: string; itemId: string; mode: string }[]): void {
 if (!binding || typeof binding !== 'object') return;
 const mapping = binding as typeof data.encounters[number];
 encounterLearning.set(mapping.encounterId, mapping);
 for (const record of records) {
  const mode = record.mode === 'choice' ? 'recognition' : record.mode === 'listen' ? 'listening' : record.mode;
  exercises.set(record.id, { ...record, mode } as ExpeditionLearningExercise);
 }
}
export interface ExpeditionAttempt {
 id:string;exerciseId:string;itemId:string;answer:string;mode:'recognition'|'listening';hinted:boolean;responseTimeMs:number;
 miniGameId:'expedition-encounters'|'neighborhood-boards';regionId:string;contentId:string;level:Level;selectedValue?:number;
}
export interface ExpeditionPlanCommand {id:string;mapId:string;level:Level;values:Readonly<Record<string,number>>;order:readonly string[];}
export interface ExpeditionPlanResult {correct:boolean;plan:ServerExpeditionPlan;progress:Progress;agreement?:string;}
export function expeditionRecallReady(exercise:Pick<ExpeditionLearningExercise,'wordIds'>,progress:Progress):boolean {
 const restored=introducedWords(progress);return exercise.wordIds.length>0&&exercise.wordIds.every(id=>restored.has(id));
}
/** Receipts outlive dialogs. Every retry submits the same immutable command. */
export class ExpeditionLearning {
 private receipts=new WeakMap<ExpeditionAttempt,AttemptResult>();
 private inFlight=new WeakMap<ExpeditionAttempt,Promise<AttemptResult>>();
 private failed=new Set<ExpeditionAttempt>();
 private owners=new WeakMap<ExpeditionAttempt,()=>boolean>();
 private plans=new Map<string,{command:ExpeditionPlanCommand;isCurrent:()=>boolean;pending?:Promise<ExpeditionPlanResult>}>();
 constructor(private options:{api:Api;progress:()=>Progress;onProgress:(progress:Progress)=>void}){}
 captureOwner(){const owner=this.options.api.selfId,token=this.options.api.token,courseId=activeCourse?.id;return ()=>this.options.api.selfId===owner&&this.options.api.token===token&&(!courseId||activeCourse?.id===courseId);}
 private owns(command:ExpeditionAttempt){return this.owners.get(command)?.()===true;}
 ready(exerciseId:string){const exercise=exercises.get(exerciseId);return !!exercise&&expeditionRecallReady(exercise,this.options.progress());}
 pendingPlacements(){for(const command of this.failed)if(!this.owns(command))this.failed.delete(command);return [...this.failed].filter(command=>command.miniGameId==='neighborhood-boards').length;}
 create(exerciseId:string,answer:string,context:{hinted:boolean;responseMs:number;selectedValue?:number}):ExpeditionAttempt {
  const exercise=exercises.get(exerciseId);if(!exercise)throw new Error('Unknown expedition recall.');
  const command=Object.freeze({id:crypto.randomUUID(),exerciseId,itemId:exercise.itemId,answer,mode:exercise.mode as 'recognition'|'listening',hinted:exercise.miniGameId==='neighborhood-boards'||context.hinted,responseTimeMs:Math.max(0,Math.min(600000,Math.round(context.responseMs))),miniGameId:exercise.miniGameId as ExpeditionAttempt['miniGameId'],regionId:exercise.regionId,contentId:exercise.contentId,level:exercise.level as Level,...(context.selectedValue!==undefined?{selectedValue:context.selectedValue}:{})});this.owners.set(command,this.captureOwner());return command;
 }
 async expose(exerciseId:string){const exercise=exercises.get(exerciseId);if(!exercise)return;const current=this.captureOwner();try{const result=await this.options.api.expose({wordIds:exercise.wordIds});if(current())this.options.onProgress(result.progress);}catch{/* Exposure does not block a neighborhood agreement. */}}
 submit(command:ExpeditionAttempt):Promise<AttemptResult>{
  if(!this.owns(command)){this.failed.delete(command);return Promise.reject(new Error('The player account changed before this answer was saved.'));}
  const saved=this.receipts.get(command);if(saved)return Promise.resolve(saved);
  const pending=this.inFlight.get(command);if(pending)return pending;
  if(!this.ready(command.exerciseId))return Promise.reject(new Error('Exposure only: restore the words in this message before it can count as recall.'));
  const request=this.options.api.request<AttemptResult>('/attempt',command).then(result=>{if(!this.owns(command))throw new Error('The player account changed before this answer was saved.');this.receipts.set(command,result);this.failed.delete(command);this.options.onProgress(result.progress);return result;},error=>{if(this.owns(command))this.failed.add(command);throw error;}).finally(()=>this.inFlight.delete(command));
  this.inFlight.set(command,request);return request;
 }
 async place(context:{mapId:string;level:Level;fieldId:string;value:number;label:string;responseMs:number}){
  const mapping=placementLearning.get(`${context.mapId}:${context.level}:${context.fieldId}`);if(!mapping)throw new Error('This planning token has no authored recall mapping.');
  if(!this.ready(mapping.exerciseId)){await this.expose(mapping.exerciseId);return {status:'exposure' as const,message:'Exposure only · restore the words in this instruction to save supported recognition.'};}
  const command=this.create(mapping.exerciseId,context.label,{hinted:true,responseMs:context.responseMs,selectedValue:context.value});
  const result=await this.submit(command);return {status:'saved' as const,correct:result.correct,message:result.correct?'Supported recognition saved.':'Recognition saved · listen to the agreement and revise this token.'};
 }
 async retryPlacements(){this.pendingPlacements();const commands=[...this.failed].filter(command=>command.miniGameId==='neighborhood-boards');const result=await Promise.allSettled(commands.map(command=>this.submit(command)));const failures=result.filter(entry=>entry.status==='rejected');if(failures.length)throw new Error(`${failures.length} learning answers still need a connection. Retry keeps their original IDs.`);return commands.length;}
 submitPlan(plan:{mapId:string;level:Level;values:Record<string,number>;order:string[]}):Promise<ExpeditionPlanResult>{
  for(const [key,entry] of this.plans)if(!entry.isCurrent())this.plans.delete(key);
  const snapshot={mapId:plan.mapId,level:plan.level,values:Object.fromEntries(Object.entries(plan.values).sort(([a],[b])=>a.localeCompare(b))),order:[...plan.order]},key=JSON.stringify(snapshot);
  let entry=this.plans.get(key);
  if(!entry){const command=Object.freeze({...snapshot,id:crypto.randomUUID(),values:Object.freeze(snapshot.values),order:Object.freeze(snapshot.order)});entry={command,isCurrent:this.captureOwner()};this.plans.set(key,entry);}
  if(entry.pending)return entry.pending;
  const receipt=entry;
  receipt.pending=this.options.api.request<ExpeditionPlanResult>('/expedition/plan',receipt.command).then(result=>{if(!receipt.isCurrent())throw new Error('The player account changed before this agreement was saved.');if(this.plans.get(key)===receipt)this.plans.delete(key);this.options.onProgress(result.progress);return result;}).finally(()=>{receipt.pending=undefined;});
  return receipt.pending;
 }
}
