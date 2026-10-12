export { miniGameDefinitions, miniGameById } from './catalogue';
export type * from './types';
import { miniGameById } from './catalogue';
import type { MiniGame } from './types';
import type { CourseExercise } from '../course';
const scriptedGames=new Set(['lost-hour','seed-packets','17-59']);
export async function loadMiniGame(id:string):Promise<MiniGame>{
  const definition=miniGameById.get(id);if(!definition)throw new Error('Unknown lantern game.');
  if(scriptedGames.has(id)){const {createScriptedStoryGame}=await import('./scripted-stories');return createScriptedStoryGame(definition);}
  const {RetrievalGame}=await import('./engine');return new RetrievalGame(definition);
}
export async function loadMiniGameExercises(id:string):Promise<CourseExercise[]>{
  return scriptedGames.has(id)?(await import('./scripted-stories')).scriptedStoryExercises:[];
}
