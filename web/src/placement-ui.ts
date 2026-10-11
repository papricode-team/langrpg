import './placement-ui.css';
import type {Api,Progress,CourseLevel} from './api';
import {escapeHtml as e} from './icons';
import {attemptFeedback,modeFor} from './learning';
import {placementExercises,placementRecommendation,placementDialogue,type PlacementEvidence,type PlacementExercise} from './learning-context';
import {localized,localizedExercise,t} from './i18n';

export interface PlacementResult {level:CourseLevel;answered:number;unaidedCorrect:number;}
interface PlacementOptions {
  api:Pick<Api,'request'>; progress:Progress;
  onComplete:(result:PlacementResult,progress:Progress)=>void;
  onClose:()=>void; speak:(text:string)=>void;
}
export function placementCTAMarkup():string {
  return `<button type="button" class="outline-button" data-action="placement">${e(t('Find my comfortable German level'))}</button>`;
}

/** A short diagnostic sample uses the server grader without recording recall. */
export async function mountOptionalPlacement(host:HTMLElement,options:PlacementOptions):Promise<{destroy():void}> {
  const {quests}=await import('./content');
  const queue=placementExercises(quests.flatMap(quest=>quest.exercises.map(exercise=>({...exercise,level:quest.level})))),results:PlacementEvidence[]=[];
  const progress=options.progress;
  let index=0,busy=false,hinted=false,feedback='',answered=false,disposed=false;
  const startedAt=Date.now();let shownAt=startedAt;
  let pending:{id:string;answer:string;hinted:boolean;responseTimeMs:number}|undefined;
  const finish=()=>{
    if(disposed)return;
    const result={level:placementRecommendation(results),answered:results.length,unaidedCorrect:results.filter(item=>item.correct&&!item.hinted).length};
    host.innerHTML=`<section class="placement-panel" aria-label="${e(t('Practice starting point'))}"><span class="eyebrow">${e(t('YOUR PRACTICE STARTING POINT'))}</span><h2>${e(t('Try {level} practice next',{level:result.level}))}</h2><p>${e(t('This short sample helps choose useful support. Your story route still grows from the clues you discover.'))}</p><p>${e(t('{correct} independent answers from {answered} questions.',{correct:result.unaidedCorrect,answered:result.answered}))}</p><button class="primary-button" type="button" data-placement="close">${e(t('Return to the town'))}</button></section>`;
    options.onComplete(result,progress);
  };
  const render=()=>{
    if(disposed)return;
    const exercise:PlacementExercise=localizedExercise(queue[index]),turn=placementDialogue[exercise.id as keyof typeof placementDialogue];
    host.innerHTML=`<section class="placement-panel" aria-label="${e(t('Optional German placement'))}"><header><span class="eyebrow">${e(t('A COMFORTABLE START · {current} / {total}',{current:index+1,total:queue.length}))}</span><button type="button" class="text-button" data-placement="close" ${busy?'disabled':''}>${e(t('Leave'))}</button></header><h2>${e(t('Find your practice starting point'))}</h2><p>${e(t('A few short conversations, usually about two minutes. You can leave at any time.'))}</p><blockquote class="placement-dialogue"><strong>${e(turn.speaker)}</strong><p lang="de">${e(turn.german)}</p><button type="button" class="text-button" data-placement="hear">${e(t('Hear this line'))}</button>${hinted?`<p>${e(localized(turn))}</p>`:''}</blockquote><h3>${e(exercise.prompt)}</h3>${exercise.mode==='type'?`<form data-placement-form><label for="placement-answer">${e(t('Your German answer'))}</label><input id="placement-answer" name="answer" lang="de" autocomplete="off" spellcheck="false" maxlength="240" ${busy||answered?'disabled':''}/><button type="submit" class="primary-button" ${busy||answered?'disabled':''}>${e(busy?t('Saving…'):pending?t('Retry this save'):t('Check answer'))}</button></form>`:`<div class="placement-options">${(exercise.options??[]).map(option=>`<button type="button" class="outline-button" data-placement="answer" data-answer="${e(option)}" ${busy||answered?'disabled':''}>${e(option)}</button>`).join('')}</div>`}<div class="placement-feedback" role="status">${e(feedback)}</div>${answered?`<button type="button" class="primary-button" data-placement="next">${e(t('Continue'))}</button>`:`<button type="button" class="text-button" data-placement="hint" ${busy?'disabled':''}>${e(t('A little help'))}</button>${hinted?`<p>${e(exercise.hint)}</p>`:''}`}</section>`;
    if(exercise.mode==='type'&&!busy&&!answered)host.querySelector<HTMLInputElement>('input')?.focus();
  };
  const submit=async(answer:string)=>{
    if(busy||answered||disposed||!answer.trim())return;
    const exercise=queue[index];
    pending??={id:crypto.randomUUID(),answer,hinted,responseTimeMs:Math.min(600000,Math.max(1,Date.now()-shownAt))};
    const attempt=pending;busy=true;render();
    try {
      const result=await options.api.request<{correct:boolean;reason?:string}>('/attempt',{...attempt,itemId:exercise.itemId,exerciseId:exercise.id,mode:modeFor(exercise),level:exercise.level,preview:true});
      results.push({level:exercise.level,correct:result.correct,hinted:attempt.hinted});
      pending=undefined;answered=true;feedback=result.correct?t('This helps us choose useful practice.'):attemptFeedback(exercise,attempt.answer,result.reason)||t('We will choose more support for this kind of phrase.');
    } catch(error) {feedback=`${error instanceof Error?error.message:t('The answer could not be saved.')} ${t('Retry keeps this same answer.')}`;}
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
