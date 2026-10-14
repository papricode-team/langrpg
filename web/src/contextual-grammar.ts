import type { CourseGrammar } from './course';
import { localizedGrammar } from './i18n.ts';
import { getContentClient } from './content-api';
import { hydrateNarrative } from './content-narratives';
import type { TranslatedSentence } from './sentence-translations';

export interface ContextualGrammar {
  guideId: string; german: string; english: string; clipId: string;
  title?: string; explanation?: string; note?: string;
  aligned?: TranslatedSentence['aligned']; localized?: boolean;
}
interface GrammarNarrative {
  id:string; questId:string; guideId:string; line:TranslatedSentence; clipId:string;
  title?:string; instruction?:string; note?:string;
}
const notes=new Map<string,ContextualGrammar>();
export function installContextualGrammar(questId:string,note:ContextualGrammar):void {notes.set(questId,{...note});}
export function clearContextualGrammar():void {notes.clear();}
/** Fetch only the help note for the currently open, entitled conversation. */
export async function loadContextualGrammar(questId:string):Promise<void> {
  if(notes.has(questId))return;
  const client=getContentClient(),bootstrap=await client.bootstrap();
  const record=(bootstrap.narratives as {id:string;kind:string;questId?:string}[]|undefined)?.find(value=>value.kind==='contextual-grammar'&&value.questId===questId);
  if(!record)return;
  const value=await hydrateNarrative(await client.narrative<GrammarNarrative>(record.id));
  if(client!==getContentClient())return;
  installContextualGrammar(questId,{...value.line,guideId:value.guideId,clipId:value.clipId,title:value.title,explanation:value.instruction,note:value.note});
}
export function grammarForQuest(questId:string,guides?:readonly CourseGrammar[]):ContextualGrammar|undefined {
  const note=notes.get(questId);if(!note)return;
  const found=guides?.find(guide=>guide.id===note.guideId),guide=found?localizedGrammar(found):undefined;
  return {...note,title:guide?.title??note.title,explanation:guide?.explanation??note.explanation,...(guide?.note?{note:guide.note}:{})};
}
