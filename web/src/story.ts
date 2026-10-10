import type { Level } from './content';
import type { MapId } from './maps';
import type { Narrative } from './sentence-translations';
import storyText from './data/story-text.json';

export interface StoryAct {
  mapId: MapId;
  level: Level;
  number: string;
  title: string;
  premise: Narrative;
  introduction: Narrative[];
  goal: Narrative;
  cliffhanger: Narrative;
}
/** `letter` is Elise's short note, unlocked by finishing the quest; it grows with the player's German. */
export interface StoryClue { questId: string; title: string; text: Narrative; lead: Narrative; letter: Narrative; }

export const storyActs = storyText.acts as StoryAct[];
export const storyClues = storyText.clues as StoryClue[];
export const objectStories = storyText.objects as Record<string, { detail: Narrative; secret: Narrative }>;

export function actFor(mapId: MapId): StoryAct { return storyActs.find(act => act.mapId === mapId)!; }
export function clueFor(questId: string): StoryClue | undefined { return storyClues.find(clue => clue.questId === questId); }
export function discoveredClues(completedQuestIds: readonly string[]): StoryClue[] {
  return storyClues.filter(clue => completedQuestIds.includes(clue.questId));
}
