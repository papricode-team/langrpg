export { miniGameDefinitions, miniGameById } from './catalogue';
export type * from './types';
import { miniGameById } from './catalogue';
import type { MiniGame } from './types';
import type { CourseExercise } from '../course';
const scriptedGames=new Set(['lost-hour','seed-packets','17-59']);
export async function loadMiniGame(id:string):Promise<MiniGame>{
  const definition=miniGameById.get(id);if(!definition)throw new Error('Unknown lantern game.');
  if(scriptedGames.has(id)){const {createScriptedStoryGame,loadScriptedStoryContent}=await import('./scripted-stories');await loadScriptedStoryContent(id as import('./scripted-stories').ScriptedStoryId);return createScriptedStoryGame(definition);}
  const {RetrievalGame,loadLoopingTape}=await import('./engine');if(definition.mechanic==='tape')await loadLoopingTape();return new RetrievalGame(definition);
}
export async function loadMiniGameExercises(id:string):Promise<CourseExercise[]>{
  if(!scriptedGames.has(id))return [];
  const module=await import('./scripted-stories');await module.loadScriptedStoryContent(id as import('./scripted-stories').ScriptedStoryId);return module.scriptedStoryExercises;
}
