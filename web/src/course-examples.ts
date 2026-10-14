import type {Exercise} from './content';
import {getContentClient,toDialogueLine} from './content-api';
import {renderAlignedLine} from './aligned-line';
import {localizedExercise,supportText} from './i18n';
import {escapeHtml} from './icons';
import {renderNarrative,type Narrative,type TranslatedSentence} from './sentence-translations';

/** The selected example keeps its exact authored support and alignment. */
export async function loadExerciseExample(exercise:Exercise|undefined):Promise<Narrative|undefined> {
  if(!exercise)return;
  if(exercise.exampleLineId){
    const [line]=await getContentClient().lines([exercise.exampleLineId]);
    const value=toDialogueLine(line);
    return [{german:value.german,english:value.english,localized:true,aligned:line}];
  }
  return [{german:exercise.german,english:localizedExercise(exercise).english,localized:true,aligned:exercise.aligned}];
}

/** Grammar examples expose the same support they already show beneath German. */
export function renderCourseExample(example:TranslatedSentence):string {
  if(example.aligned)return renderAlignedLine(example.aligned,{showMeaning:true});
  const meaning=supportText(example);
  return `${renderNarrative([example])}<span class="caption" lang="${meaning.lang}">${escapeHtml(meaning.text)}</span>`;
}
