import type { Level } from './content';
import type { MapId } from './maps';
import type { Narrative } from './sentence-translations';
import { getContentClient } from './content-api';
import { hydrateNarrative } from './content-narratives';

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

export const storyActs: StoryAct[] = [];
export const storyClues: StoryClue[] = [];
export const objectStories: Record<string, { detail: Narrative; secret: Narrative }> = {};
export const journalNarratives = {
  firstPage: [] as Narrative, helping: { german: '', english: '' }, waitingPage: [] as Narrative,
  observatoryWaiting: [] as Narrative, routeRestored: [] as Narrative,
};
interface NarrativeSkeleton { id: string; kind: string; mapId?: MapId; questId?: string; objectId?: string; title?: string; }
const skeletons: NarrativeSkeleton[] = [];
const loaded = new Set<string>();
const pending = new Map<string, Promise<void>>();
const actMetadata: {mapId: MapId; level: Level; number: string}[] = [
  {mapId:'lindenhafen',level:'A1',number:'I'}, {mapId:'waldruh',level:'A2',number:'II'}, {mapId:'nebelstadt',level:'B1',number:'III'},
];

export function installStorySkeletons(values: readonly NarrativeSkeleton[]): void {
  skeletons.splice(0, skeletons.length, ...values);
  for (const metadata of actMetadata) if (!storyActs.some(act => act.mapId === metadata.mapId)) {
    const skeleton = values.find(item => item.kind === 'act' && item.mapId === metadata.mapId);
    storyActs.push({...metadata,title:skeleton?.title??'',premise:[],introduction:[],goal:[],cliffhanger:[]});
  }
}
export function installStoryText(value: {acts?: StoryAct[]; clues?: StoryClue[]; objects?: typeof objectStories; journal?: Partial<typeof journalNarratives>}): void {
  if (value.acts) storyActs.splice(0, storyActs.length, ...value.acts);
  if (value.clues) storyClues.splice(0, storyClues.length, ...value.clues);
  if (value.objects) Object.assign(objectStories, value.objects);
  if (value.journal) Object.assign(journalNarratives, value.journal);
}
export function clearStoryContent(): void {
  storyActs.splice(0); storyClues.splice(0); skeletons.splice(0); loaded.clear(); pending.clear();
  for (const key of Object.keys(objectStories)) delete objectStories[key];
  Object.assign(journalNarratives, {firstPage:[],helping:{german:'',english:''},waitingPage:[],observatoryWaiting:[],routeRestored:[]});
}
async function loadRecord(id: string): Promise<void> {
  if (loaded.has(id)) return;
  if (pending.has(id)) return pending.get(id);
  const owner = getContentClient();
  const request = owner.narrative<Record<string,unknown>>(id).then(hydrateNarrative).then(record => {
    if (owner !== getContentClient()) return;
    if (record.kind === 'act') {
      const act = record as unknown as StoryAct, index = storyActs.findIndex(value => value.mapId === act.mapId);
      if (index < 0) storyActs.push(act); else storyActs[index] = act;
    } else if (record.kind === 'clue') {
      const clue = record as unknown as StoryClue, index = storyClues.findIndex(value => value.questId === clue.questId);
      if (index < 0) storyClues.push(clue); else storyClues[index] = clue;
    } else if (record.kind === 'object' && typeof record.objectId === 'string') {
      objectStories[record.objectId] = record as unknown as typeof objectStories[string];
    } else if (record.kind === 'journal' && typeof record.key === 'string' && record.key in journalNarratives) {
      Object.assign(journalNarratives, {[record.key]: record.lines});
    }
    loaded.add(id);
  }).finally(() => { if (pending.get(id) === request) pending.delete(id); });
  pending.set(id, request);
  return request;
}
/** The account's current act and already earned clues; future prose stays on the server. */
export async function loadStoryContent(mapId: MapId, completedQuestIds: readonly string[] = []): Promise<void> {
  const bootstrap = await getContentClient().bootstrap();
  installStorySkeletons((bootstrap.narratives ?? []) as NarrativeSkeleton[]);
  const visible = skeletons.filter(value => value.kind === 'act' && value.mapId === mapId
    || value.kind === 'clue' && !!value.questId && completedQuestIds.includes(value.questId)
    || value.kind === 'journal' && (!value.mapId || value.mapId === mapId));
  for (const value of visible) await loadRecord(value.id);
}
export async function loadObjectStory(id: string): Promise<void> {
  const value = skeletons.find(value => value.kind === 'object' && value.objectId === id);
  if (value) await loadRecord(value.id);
}
export function actFor(mapId: MapId): StoryAct {
  return storyActs.find(act => act.mapId === mapId) ?? {mapId,level:'A1',number:'I',title:'',premise:[],introduction:[],goal:[],cliffhanger:[]};
}
export function clueFor(questId: string): StoryClue | undefined { return storyClues.find(clue => clue.questId === questId); }
export function discoveredClues(completedQuestIds: readonly string[]): StoryClue[] { return storyClues.filter(clue => completedQuestIds.includes(clue.questId)); }
