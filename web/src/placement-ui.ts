import './placement-ui.css';
import type {Api,Progress,AttemptResult,CourseLevel} from './api';
import {escapeHtml as e} from './icons';
import {modeFor} from './learning';
import {placementExercises,placementRecommendation,placementDialogue,type PlacementEvidence,type PlacementExercise} from './learning-context';

export interface PlacementResult {level:CourseLevel;answered:number;unaidedCorrect:number;}
interface PlacementOptions {
  api:Pick<Api,'request'>; progress:Progress;
  onComplete:(result:PlacementResult,progress:Progress)=>void;
  onClose:()=>void; speak:(text:string)=>void;
}
export function placementCTAMarkup():string {
  return '<button type="button" class="outline-button" data-action="placement">Find my comfortable German level</button>';
}

/** A short optional sample; every response uses the regular server grader. */
export async function mountOptionalPlacement(host:HTMLElement,options:PlacementOptions):Promise<{destroy():void}> {
  const {quests}=await import('./content');
  const queue=placementExercises(quests.flatMap(quest=>quest.exercises.map(exercise=>({...exercise,level:quest.level})))),results:PlacementEvidence[]=[];
  let index=0,progress=options.progress,busy=false,hinted=false,feedback='',answered=false,disposed=false;
  const startedAt=Date.now();let shownAt=startedAt;
  let pending:{id:string;answer:string;hinted:boolean;responseTimeMs:number}|undefined;
  const finish=()=>{
    if(disposed)return;
    const result={level:placementRecommendation(results),answered:results.length,unaidedCorrect:results.filter(item=>item.correct&&!item.hinted).length};
    host.innerHTML=`<section class="placement-panel" aria-label="Practice starting point"><span class="eyebrow">YOUR PRACTICE STARTING POINT</span><h2>Try ${result.level} practice next</h2><p>This short sample helps choose useful support. Your story route still grows from the clues you discover.</p><p>${result.unaidedCorrect} independent answers from ${result.answered} questions.</p><button class="primary-button" type="button" data-placement="close">Return to the town</button></section>`;
    options.onComplete(result,progress);
  };
  const render=()=>{
    if(disposed)return;
    const exercise:PlacementExercise=queue[index],turn=placementDialogue[exercise.id as keyof typeof placementDialogue];
    host.innerHTML=`<section class="placement-panel" aria-label="Optional German placement"><header><span class="eyebrow">A COMFORTABLE START · ${index+1} / ${queue.length}</span><button type="button" class="text-button" data-placement="close" ${busy?'disabled':''}>Leave</button></header><h2>Find your practice starting point</h2><p>A few short conversations, usually about two minutes. You can leave at any time.</p><blockquote class="placement-dialogue"><strong>${e(turn.speaker)}</strong><p lang="de">${e(turn.german)}</p><button type="button" class="text-button" data-placement="hear">Hear this line</button>${hinted?`<p>${e(turn.english)}</p>`:''}</blockquote><h3>${e(exercise.prompt)}</h3>${exercise.mode==='type'?`<form data-placement-form><label for="placement-answer">Your German answer</label><input id="placement-answer" name="answer" lang="de" autocomplete="off" spellcheck="false" maxlength="240" ${busy||answered?'disabled':''}/><button type="submit" class="primary-button" ${busy||answered?'disabled':''}>${busy?'Saving…':pending?'Retry this save':'Check answer'}</button></form>`:`<div class="placement-options">${(exercise.options??[]).map(option=>`<button type="button" class="outline-button" data-placement="answer" data-answer="${e(option)}" ${busy||answered?'disabled':''}>${e(option)}</button>`).join('')}</div>`}<div class="placement-feedback" role="status">${e(feedback)}</div>${answered?'<button type="button" class="primary-button" data-placement="next">Continue</button>':`<button type="button" class="text-button" data-placement="hint" ${busy?'disabled':''}>A little help</button>${hinted?`<p>${e(exercise.hint)}</p>`:''}`}</section>`;
    if(exercise.mode==='type'&&!busy&&!answered)host.querySelector<HTMLInputElement>('input')?.focus();
  };
  const submit=async(answer:string)=>{
    if(busy||answered||disposed||!answer.trim())return;
    const exercise=queue[index];
    pending??={id:crypto.randomUUID(),answer,hinted,responseTimeMs:Math.min(600000,Math.max(1,Date.now()-shownAt))};
    const attempt=pending;busy=true;render();
    try {
      const result=await options.api.request<AttemptResult>('/attempt',{...attempt,itemId:exercise.itemId,exerciseId:exercise.id,mode:modeFor(exercise),level:exercise.level});
      progress=result.progress;
      results.push({level:exercise.level,correct:result.correct,hinted:attempt.hinted});
      pending=undefined;answered=true;feedback=result.correct?'Saved. This helps us choose useful practice.':result.reason;
    } catch(error) {feedback=`${error instanceof Error?error.message:'The answer could not be saved.'} Retry keeps this same answer.`;}
    finally {busy=false;render();}
  };
  const click=(event:Event)=>{
    const button=(event.target as Element).closest<HTMLButtonElement>('[data-placement]');if(!button)return;
    switch(button.dataset.placement) {
      case 'close':if(!busy){disposed=true;options.onClose();}break;
      case 'hint':if(!busy&&!answered){hinted=true;render();}break;
      case 'hear':options.speak(placementDialogue[queue[index].id as keyof typeof placementDialogue].german);break;
      case 'answer':void submit(pending?.answer??button.dataset.answer??'');break;
      case 'next':if(answered){if(index+1>=queue.length||Date.now()-startedAt>=120000)finish();else{index++;hinted=false;answered=false;feedback='';shownAt=Date.now();render();}}break;
    }
  };
  const form=(event:Event)=>{if((event.target as Element).matches('[data-placement-form]')){event.preventDefault();void submit(pending?.answer??host.querySelector<HTMLInputElement>('input')?.value??'');}};
  host.addEventListener('click',click);host.addEventListener('submit',form);render();
  return {destroy(){disposed=true;host.removeEventListener('click',click);host.removeEventListener('submit',form);}};
}
