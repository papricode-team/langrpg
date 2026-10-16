import type { Level } from './content';
import type { MapId } from './maps';
import type { Narrative, TranslatedSentence } from './sentence-translations';
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
/** `letter` is Elise's short note, unlocked by finishing the quest; it grows with the player's German.
 * `heading` is the German title, and `evidenceItem` the public id of the inventory item the quest grants. */
export interface StoryClue { questId: string; title: string; heading?: TranslatedSentence & { glosses?: Record<string, string> }; evidenceItem?: string; text: Narrative; lead: Narrative; letter: Narrative; }

export const storyActs = storyText.acts as StoryAct[];
export const storyClues = storyText.clues as StoryClue[];
export const objectStories = storyText.objects as Record<string, { detail: Narrative; secret: Narrative }>;

export function actFor(mapId: MapId): StoryAct { return storyActs.find(act => act.mapId === mapId)!; }
export function clueFor(questId: string): StoryClue | undefined { return storyClues.find(clue => clue.questId === questId); }
export function discoveredClues(completedQuestIds: readonly string[]): StoryClue[] {
  return storyClues.filter(clue => completedQuestIds.includes(clue.questId));
}

/** Short German narration shown in menus and the journal, outside the scene graphs. */
export const journalNarratives = {
  firstPage: [{ german: 'Ein Bahnsteig, ein leerer Brief und eine Stadt, die es geben sollte.', english: 'A platform, a blank letter, and a town that should exist.' }, { german: 'Dein erstes Gespräch ist der Anfang der Spur.', english: 'Your first conversation is the beginning of the trail.' }],
  helping: { german: 'Du hast jeden Hinweis gefunden, weil du jemandem geholfen hast.', english: 'Each one came from helping someone.' },
  waitingPage: [{ german: 'Diese Seite wartet auf ein Gespräch.', english: 'This page is waiting for a conversation.' }],
  observatoryWaiting: [{ german: 'Das Instrument wartet auf eine Antwort von beiden Enden der Strecke.', english: 'The instrument waits for an answer from both ends of the route.' }, { german: 'In seinem Mechanismus ist Platz für etwas, das kein Schlüssel ist.', english: 'Its mechanism has a place for something that is not a key.' }],
  routeRestored: [{ german: 'Eine Strecke ist wiederhergestellt.', english: 'A route restored.' }, { german: 'Ein Versprechen bleibt in Erinnerung.', english: 'A promise remembered.' }],
} satisfies Record<string, Narrative | Narrative[number]>;
