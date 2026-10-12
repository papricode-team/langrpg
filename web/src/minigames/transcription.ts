import type { Exercise } from '../content';
import type { GameItem, RoundResult } from './types';
const words=(text:string)=>text.normalize('NFC').match(/\p{L}+(?:['’-]\p{L}+)*/gu)??[];
/** Submit what was typed, including inflections; only the server accepts a form. */
export function transcriptionResults(exercise:Exercise&{wordIds?:string[]},answer:string,pool:readonly GameItem[],hinted:boolean,responseMs:number):RoundResult[]{
  const expected=words(exercise.answer),actual=words(answer),context=new Set(exercise.wordIds??[]),seen=new Set<string>();
  const eligible=pool.filter(item=>context.has(item.lexemeId)&&['noun','verb','adj','adv'].includes(item.pos));
  return expected.flatMap((token,index)=>{
    const normalized=token.toLocaleLowerCase('de');
    const candidates=eligible.filter(item=>[item.lemma,...(item.surfaceForms??[])].some(form=>form.toLocaleLowerCase('de')===normalized));
    // Ambiguous homographs supply sentence evidence only; no invented lexical proof.
    if(candidates.length!==1)return[];
    const item=candidates[0],assisted=hinted||seen.has(item.lexemeId);seen.add(item.lexemeId);
    return[{lexemeId:item.lexemeId,modality:'production',hinted:assisted,responseMs,answer:actual[index]??'__timeout__',answerKind:'surface',contextExerciseId:exercise.id}];
  });
}
