import { contentApi, configureContentSession, getSentence, type ContentCourse, type ContentRecord } from './content-api';
import type { AuthoredSentence } from './translated-sentence';
import { baseLanguage, installContentTranslations, setTargetLanguage } from './i18n';
import type { SessionResult, Progress } from './api';
import type { Exercise, Quest } from './content';
import type { CourseExercise, CourseLexeme, CourseUnit } from './course';
import { conditionMet, storyState, type DialogueCondition, type DialogueLine, type QuestGraph } from './dialogue';
import type { PlacementQuestion } from './learning-context';
import { installStoryItems } from './story-items';

type JsonObject = Record<string, unknown>;
const values = new Map<string, unknown>();
let revision = 0;
let contentOwner = '';
export let activeCourse: ContentCourse | undefined;
export let contentCounts: Record<string, number> = {};
let bootstrapData: JsonObject = {};
const graphIds = new Map<string, string>();
const contexts = new Map<string, JsonObject>();
const exerciseCache = new Map<string, Exercise>();
const resolvedContexts = new Set<string>();
const narrativePending = new Map<string, Promise<StoryContentPage>>();
const contextPending = new Map<string, Promise<unknown>>();
const omittedStorySentences = new Set<string>();
export let storyContentRemaining = 0;
export interface StoryContentPage { loaded: number; remaining: number; }
const expeditionIds = new Map<string, string>();
const minigameIds = new Map<string, string>();
export function runtimeArray<T = unknown>(key: string, initial: T[] = []): T[] {
  if (!values.has(key)) values.set(key, initial);
  return values.get(key) as T[];
}
export function runtimeObject<T extends object = JsonObject>(key: string, initial: T = {} as T): T {
  if (!values.has(key)) values.set(key, initial);
  return values.get(key) as T;
}
/** Derived drill identities are explicit UUIDs in the served lexical record. */
export function runtimeReference(kind: 'item' | 'exercise', wordId: string, mode?: string): string {
  const word = runtimeArray<JsonObject>('courseLexicon').find(word => word.id === wordId);
  if (!word) return '';
  if (kind === 'item') return String(word.itemId ?? '');
  return String(data(word.exerciseIds)[mode ?? ''] ?? '');
}
function collection(key: string, rows: unknown[]): void { const array = runtimeArray(key); array.splice(0, array.length, ...rows); }
function object(key: string, value: JsonObject): void { const target = runtimeObject(key); for (const field of Object.keys(target)) delete target[field]; Object.assign(target, value); }
function rows(value: unknown): JsonObject[] { return Array.isArray(value) ? value.filter((entry): entry is JsonObject => !!entry && typeof entry === 'object') : []; }
function data(value: unknown): JsonObject { return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : {}; }
function support(value: unknown): string { const entry = data(value)[baseLanguage()]; return typeof entry === 'string' ? entry : String(data(entry).text ?? ''); }
function narrativeReference(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(narrativeReference);
  if (!value || typeof value !== 'object') return value;
  const source = localizeMetadata(value as JsonObject);
  const materialized = Object.fromEntries(Object.entries(source).map(([key, entry]) => [key, narrativeReference(entry)]));
  if (typeof source.sentenceId === 'string') {
    const sentence = getSentence(source.sentenceId);
    return { ...materialized, german: sentence?.text ?? '', english: sentence ? support(sentence.translations) : '', text: sentence?.text ?? '', translations: sentence?.translations, target: sentence?.target };
  }
  return materialized;
}
function sentenceIds(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(sentenceIds);
  if (!value || typeof value !== 'object') return [];
  const entry = value as JsonObject;
  return [...(typeof entry.sentenceId === 'string' ? [entry.sentenceId] : []), ...Object.entries(entry).filter(([key]) => key !== 'sentenceId').flatMap(([,child]) => sentenceIds(child))];
}
export async function hydrateNarratives<T>(value: T): Promise<T> {
  const generation = revision, missing = [...new Set(sentenceIds(value))].filter(id => !getSentence(id));
  for (let offset = 0; offset < missing.length; offset += 12) await contentApi.sentences(missing.slice(offset, offset + 12));
  if (generation !== revision) throw new DOMException('Course changed', 'AbortError');
  return narrativeReference(value) as T;
}
/** Special items and endings keep their English title for menus; the German heading and story are sentences. */
async function storyPanelNarrative(entry: JsonObject): Promise<JsonObject> {
  return { ...entry, ...(entry.heading ? { heading: await hydrateNarratives(entry.heading) } : {}), ...(entry.story ? { story: await hydrateNarratives(entry.story) } : {}) };
}
function localizeMetadata(value: JsonObject): JsonObject {
  const translated = { ...data(data(value.support)[baseLanguage()]) };
  const pairs: [string, string][] = [];
  for (const field of ['title', 'subtitle', 'summary', 'prompt', 'hint', 'role', 'gatePrompt', 'description', 'teachingNotes', 'note', 'instruction']) {
    const languageText = support(value[`${field}Translations`]);
    if (languageText && typeof translated[field] !== 'string') translated[field] = languageText;
    if (typeof value[field] === 'string' && typeof translated[field] === 'string') pairs.push([String(value[field]), String(translated[field])]);
  }
  if (pairs.length) installContentTranslations(pairs);
  return { ...value, ...translated };
}
function mergeCollection(key: string, incoming: JsonObject[], identity = 'id'): void {
  const existing = runtimeArray<JsonObject>(key);
  const next = incoming.map(row => {
    const retained = existing.find(item => item[identity] === row[identity]);
    if (!retained) return row;
    Object.assign(retained, row); return retained;
  });
  existing.splice(0, existing.length, ...next);
}
function installStoryMetadata(): void {
  mergeCollection('storyActs', rows(narrativeReference(bootstrapData.acts)).map(row => ({ premise: [], introduction: [], goal: [], cliffhanger: [], ...row })), 'mapId');
  mergeCollection('storyClues', rows(narrativeReference(bootstrapData.clues)).map(row => ({ text: [], lead: [], letter: [], ...row })), 'questId');
  object('objectStories', data(narrativeReference(bootstrapData.objects)));
  object('journalNarratives', { firstPage: [], helping: { german: '', english: '' }, waitingPage: [], observatoryWaiting: [], routeRestored: [], ...data(narrativeReference(bootstrapData.journalNarratives)) });
  storyContentRemaining = [...new Set(sentenceIds(storyReferences()))].filter(id => !getSentence(id) && !omittedStorySentences.has(id)).length;
}
function updateBootstrap(body: JsonObject): void {
  mergeCollection('npcs', rows(body.npcs).map(row => ({ greeting: '', ...localizeMetadata(row), id: row.worldId ?? row.id })));
  collection('chapters', rows(narrativeReference(body.chapters)));
  mergeCollection('quests', rows(body.quests).map(row => {
    const id = String(row.id), retained = runtimeArray<Quest>('quests').find(quest => quest.id === id);
    graphIds.set(id, String(row.graphId ?? id));
    return { story: retained?.story ?? [], objectives: retained?.objectives ?? [], exercises: retained?.exercises ?? [], ...localizeMetadata(row), ...(row.story ? { story: narrativeReference(row.story) } : {}), npcId: row.npcWorldId ?? row.npcId };
  }));
  mergeCollection('courseUnits', rows(body.units).map(row => {
    const retained = runtimeArray<JsonObject>('courseUnits').find(unit => unit.id === row.id);
    return { exerciseIds: [], wordIds: [], grammarIds: [], requiredItemIds: [], requiredWordIds: [], requiredExerciseIds: [], reward: 0, summary: '', ...retained, ...localizeMetadata(row) };
  }));
  collection('courseSources', rows(body.sources));
  installStoryMetadata();
  contexts.clear();
  for (const row of rows(body.contexts)) contexts.set(String(row.id), row);
  expeditionIds.clear(); minigameIds.clear();
  for (const row of rows(body.expeditions)) expeditionIds.set(String(row.worldId), String(row.id));
  for (const row of rows(body.minigames)) minigameIds.set(String(row.worldId), String(row.id));
  collection('miniGameDefinitions', rows(body.minigames).map(row => ({ ...localizeMetadata(row), id: row.worldId ?? row.id, contentId: row.id })));
  Object.assign(runtimeObject('courseData'), { edition: body.edition ?? '', sources: runtimeArray('courseSources'), lexicon: runtimeArray('courseLexicon'), units: runtimeArray('courseUnits'), grammar: runtimeArray('courseGrammar') });
  contentCounts = data(body.counts) as Record<string, number>;
  installStoryItems(body.storyItems);
  if (Object.keys(data(body.syllabus)).length) object('syllabus', data(body.syllabus));
}
async function syncMiniGameCatalogue(generation = revision): Promise<void> {
  const module = await import('./minigames/catalogue');
  if (generation !== revision) throw new DOMException('Course changed', 'AbortError');
  module.miniGameById.clear();
  for (const game of runtimeArray<import('./minigames/types').MiniGameDefinition>('miniGameDefinitions')) module.miniGameById.set(game.id, game);
}
export async function loadServerContent(session: SessionResult): Promise<ContentCourse> {
  contentOwner = session.player.id;
  const generation = ++revision; activeCourse = undefined; storyContentRemaining = 0; graphIds.clear(); contexts.clear(); exerciseCache.clear(); resolvedContexts.clear(); contextPending.clear(); narrativePending.clear(); omittedStorySentences.clear(); expeditionIds.clear(); minigameIds.clear();
  const resetIntake = import('./intake').then(intake => { if (generation === revision) intake.clearSyllabusWords(); });
  for (const [key, value] of values) {
    if (Array.isArray(value)) { if (!['interiors', 'npcs'].includes(key)) value.splice(0); }
    else if (value instanceof Map) value.clear();
    else if (value && typeof value === 'object' && !['courseData', 'miniGameScripts'].includes(key)) for (const field of Object.keys(value)) delete (value as JsonObject)[field];
  }
  const courseData = runtimeObject('courseData');
  Object.assign(courseData, { edition: '', sources: runtimeArray('courseSources'), lexicon: runtimeArray('courseLexicon'), units: runtimeArray('courseUnits'), grammar: runtimeArray('courseGrammar') });
  for (const field of ['contextWordIds', 'activityWordIds', 'npcWordIds', 'referenceCoverage']) {
    const retained = data(courseData[field]); for (const key of Object.keys(retained)) delete retained[key]; courseData[field] = retained;
  }
  const miniScripts = runtimeObject('miniGameScripts'), games = data(miniScripts.games); miniScripts.games = games;
  for (const game of Object.values(games)) for (const key of Object.keys(data(game))) delete data(game)[key];
  miniScripts.exercises = []; miniScripts.audio = [];
  configureContentSession(() => session.token, { accountId: session.player.id, courseId: (session as SessionResult & { activeCourseId?: string }).activeCourseId, supportLanguage: session.preferences.baseLanguage });
  const result = await contentApi.bootstrap<JsonObject>();
  await resetIntake;
  if (generation !== revision) throw new DOMException('Course changed', 'AbortError');
  const body = data(result.body ?? result.bootstrap ?? result);
  const course = data(result.course ?? body.course) as unknown as ContentCourse;
  if (!course.id || !course.target) throw new Error('The server did not return an active course.');
  activeCourse = course; setTargetLanguage(course.target);
  configureContentSession(() => session.token, { accountId: session.player.id, courseId: course.id, supportLanguage: session.preferences.baseLanguage, contentVersion: String(result.version ?? 1) });
  const indexes = await import('./course');
  if (generation !== revision) throw new DOMException('Course changed', 'AbortError');
  indexes.lexemeById.clear(); indexes.courseExerciseById.clear();
  bootstrapData = body; updateBootstrap(body);
  await syncMiniGameCatalogue(generation);
  return course;
}
function storyReferences(): JsonObject {
  // Journal text and the current act come first; later pages preserve their resolved records.
  return { journalNarratives: bootstrapData.journalNarratives, acts: bootstrapData.acts, clues: bootstrapData.clues, objects: bootstrapData.objects, questStories: rows(bootstrapData.quests).map(quest => quest.story) };
}
export async function loadStoryContent(pageSize = 12): Promise<StoryContentPage> {
  const generation = revision, key = 'story';
  const inFlight = narrativePending.get(key); if (inFlight) return inFlight;
  const limit = Number.isFinite(pageSize) ? Math.max(1, Math.min(24, Math.floor(pageSize))) : 12;
  const ids = [...new Set(sentenceIds(storyReferences()))].filter(id => !getSentence(id) && !omittedStorySentences.has(id)).slice(0, limit);
  const pending = (async () => {
    let loaded = 0;
    for (let offset = 0; offset < ids.length; offset += 12) {
      const batch = ids.slice(offset, offset + 12), records = await contentApi.sentences(batch);
      if (generation !== revision) throw new DOMException('Course changed', 'AbortError');
      loaded += records.length;
      for (const id of batch) if (!getSentence(id)) omittedStorySentences.add(id);
    }
    await Promise.all([loadContexts('specialItem'), loadContexts('storyEnding')]);
    if (generation !== revision) throw new DOMException('Course changed', 'AbortError');
    installStoryMetadata();
    for (const quest of runtimeArray<Quest>('quests')) {
      const metadata = rows(bootstrapData.quests).find(row => row.id === quest.id);
      if (metadata?.story) quest.story = narrativeReference(metadata.story) as Quest['story'];
    }
    return { loaded, remaining: storyContentRemaining };
  })().finally(() => { if (generation === revision) narrativePending.delete(key); });
  narrativePending.set(key, pending); return pending;
}
export async function refreshServerContent(): Promise<void> {
  const generation = revision; contentApi.invalidate('bootstrap');
  const result = await contentApi.bootstrap<JsonObject>();
  if (generation !== revision) throw new DOMException('Course changed', 'AbortError');
  bootstrapData = data(result.body ?? result); omittedStorySentences.clear(); updateBootstrap(bootstrapData);
  await syncMiniGameCatalogue(generation);
}
export const refreshBootstrap = refreshServerContent;
function normalizeGraph(body: JsonObject): QuestGraph {
  const line = (value: JsonObject): DialogueLine => ({ german: '', english: '', ...value, variants: rows(value.variants).map(variant => ({ german: '', english: '', ...variant })), ...(value.reply ? { reply: { ...data(value.reply), correction: line(data(data(value.reply).correction)) } } : {}) }) as unknown as DialogueLine;
  return { ...body, gatePrompt: support(body.gatePromptTranslations) || body.gatePrompt || '', investigations: rows(body.investigations).map(value => ({ german: '', english: '', ...value })), nodes: rows(body.nodes).map(node => ({ ...node, lines: rows(node.lines).map(line), choices: rows(node.choices).map(value => ({ german: '', english: '', ...value })) })), topics: rows(body.topics).map(topic => ({ german: '', english: '', ...topic, lines: rows(topic.lines).map(line) })) } as unknown as QuestGraph;
}
export async function loadQuestGraph(questId: string): Promise<QuestGraph | undefined> {
  const generation = revision;
  const cached = runtimeArray<QuestGraph>('questGraphs').find(graph => graph.questId === questId);
  if (cached) return cached;
  const record = await contentApi.graph<JsonObject>(graphIds.get(questId) ?? questId), graph = normalizeGraph(record.body);
  if (generation !== revision) throw new DOMException('Course changed', 'AbortError');
  const retained = runtimeArray<QuestGraph>('questGraphs').find(row => row.questId === questId);
  if (retained) return retained;
  runtimeArray<QuestGraph>('questGraphs').push(graph);
  return graph;
}
export async function loadDialogueSentence(line: DialogueLine): Promise<DialogueLine> {
  const generation = revision;
  const sentenceId = (line as DialogueLine & { sentenceId?: string }).sentenceId;
  if (!sentenceId) return line;
  let sentence = getSentence(sentenceId);
  if (!sentence) { await contentApi.sentences([sentenceId]); sentence = getSentence(sentenceId); }
  if (generation !== revision) throw new DOMException('Course changed', 'AbortError');
  if (!sentence) throw new Error('This sentence is not available yet.');
  installContentTranslations([[sentence.text, support(sentence.translations)]]);
  return { ...line, text: sentence.text, german: sentence.text, english: support(sentence.translations), translations: sentence.translations, sentenceId, target: sentence.target, audioRequires: line.audioRequires || sentence.audioRequires || /\{[^{}]+\}/.test(sentence.text) } as DialogueLine;
}
export async function loadExercise(id: string): Promise<Exercise> {
  const generation = revision;
  const cached = exerciseCache.get(id); if (cached) return cached;
  const record = await contentApi.exercise<JsonObject>(id), body = localizeMetadata(record.body);
  if (generation !== revision) throw new DOMException('Course changed', 'AbortError');
  const mode = ({ recognition: 'choice', listening: 'listen', production: 'type' } as Record<string, string>)[String(body.mode)] ?? body.mode;
  let sentence: AuthoredSentence | undefined;
  if (body.sentenceId && (mode === 'listen' || mode === 'choice')) { await contentApi.sentences([String(body.sentenceId)]); sentence = getSentence(String(body.sentenceId)); }
  if (generation !== revision) throw new DOMException('Course changed', 'AbortError');
  const existing = exerciseCache.get(id); if (existing) return existing;
  const exercise = { german: sentence?.text ?? '', english: sentence ? support(sentence.translations) : '', answer: '', explanation: '', hint: '', ...body, id: record.id, mode, ...(sentence ? { text: sentence.text, translations: sentence.translations } : {}) } as unknown as Exercise;
  exerciseCache.set(id, exercise); runtimeArray<Exercise>('courseExercises').push(exercise);
  const module = await import('./course');
  if (generation !== revision) throw new DOMException('Course changed', 'AbortError');
  module.courseExerciseById.set(id, exercise as CourseExercise);
  if (Array.isArray(body.wordIds)) {
    const wordIds = body.wordIds.filter((value): value is string => typeof value === 'string');
    const courseData = runtimeObject('courseData'), contextWords = data(courseData.contextWordIds);
    contextWords[id] = wordIds; courseData.contextWordIds = contextWords;
    if (module.courseContextWordIds) module.courseContextWordIds[id] = wordIds;
  }
  const quest = runtimeArray<Quest>('quests').find(quest => quest.id === body.questId); if (quest && !quest.exercises.some(row => row.id === id)) quest.exercises.push(exercise);
  return exercise;
}
/** A story gate and its supported replies become available together. */
export async function loadDialogueExercise(id: string): Promise<Exercise> {
  const exercise = await loadExercise(id);
  await loadContexts('beginnerChoices', id);
  return exercise;
}
/** The diagnostic manifest authorizes just eight exercises and their authored cues. */
export async function loadPlacement(): Promise<PlacementQuestion[]> {
  const generation = revision;
  const manifest = matchingContexts('placement', activeCourse?.id)[0];
  if (!manifest) throw new Error('The placement sample is unavailable.');
  const value = await loadContext<JsonObject>(manifest[0]), questions = rows(value.questions);
  if (generation !== revision) throw new DOMException('Course changed', 'AbortError');
  if (questions.length !== 8 || new Set(questions.map(question => question.exerciseId)).size !== 8) throw new Error('The placement sample is incomplete.');
  const loaded = await Promise.all(questions.map(async question => {
    const turn = data(question.turn);
    if (!turn.sentenceId || !turn.german || !turn.speaker || !['A1', 'A2', 'B1'].includes(String(question.level))) throw new Error('The placement sample is incomplete.');
    const exercise = await loadExercise(String(question.exerciseId));
    return { exercise: { ...exercise, level: question.level }, turn } as unknown as PlacementQuestion;
  }));
  if (generation !== revision) throw new DOMException('Course changed', 'AbortError');
  const dialogue = runtimeObject('placementDialogue');
  for (const question of loaded) dialogue[question.exercise.id] = question.turn;
  return loaded;
}
export async function loadUnit(id: string, progress?: Progress): Promise<CourseUnit> {
  const generation = revision;
  const record = await contentApi.unit<JsonObject>(id), unit = localizeMetadata(record.body) as unknown as CourseUnit;
  if (generation !== revision) throw new DOMException('Course changed', 'AbortError');
  const target = runtimeArray<CourseUnit>('courseUnits').find(row => row.id === id);
  if (target) Object.assign(target, unit); else runtimeArray<CourseUnit>('courseUnits').push(unit);
  await loadWords(unit.wordIds ?? []);
  // A route is practised in small batches. Load the first reachable exercises only.
  const pending = (unit.exerciseIds ?? []).filter(id => {
    if (!progress) return !exerciseCache.has(id);
    const stats = progress.exerciseStats[id], exercise = exerciseCache.get(id) as CourseExercise | undefined;
    const lexical = exercise ? exercise.kind === 'word' || !!exercise.targetWordId : (unit.requiredWordIds?.length ?? 0) > 0;
    return !stats || (lexical ? stats.unaidedSuccesses < 1 : stats.correct < 1);
  });
  for (const exerciseId of pending.slice(0, 8)) { try { await loadExercise(exerciseId); } catch (error) { if (!(error instanceof Error && 'status' in error && error.status === 404)) throw error; } }
  return unit;
}
export async function loadWords(ids: readonly string[]): Promise<void> {
  const generation = revision, existing = new Set(runtimeArray<CourseLexeme>('courseLexicon').map(word => word.id));
  const missing = [...new Set(ids)].filter(id => !existing.has(id));
  for (let offset = 0; offset < missing.length; offset += 24) {
    const records = await contentApi.lexemes<JsonObject>(missing.slice(offset, offset + 24));
    if (generation !== revision) throw new DOMException('Course changed', 'AbortError');
    for (const record of records) {
      if (runtimeArray<CourseLexeme>('courseLexicon').some(word => word.id === record.id)) continue;
      const body = record.body, morphology = data(body.morphology), word = { ...body, ...morphology, id: record.id, english: support(body.meanings), surfaceForms: body.forms ?? [], meaning: support(body.meanings) } as unknown as CourseLexeme;
      runtimeArray<CourseLexeme>('courseLexicon').push(word);
      const module = await import('./course');
      if (generation !== revision) throw new DOMException('Course changed', 'AbortError');
      module.lexemeById.set(record.id, word);
      if (typeof body.syllabusIndex === 'number') {
        const intake = await import('./intake');
        if (generation !== revision) throw new DOMException('Course changed', 'AbortError');
        intake.registerSyllabusWord(record.id, body.syllabusIndex);
      }
      upsert('vocabulary', { id: record.id, german: [word.article, word.lemma].filter(Boolean).join(' '), english: word.english, level: word.level, example: '', exampleSentenceId: body.exampleSentenceId });
    }
  }
}
export async function loadRestoredWords(progress: Progress): Promise<void> { await loadWords(progress.intake?.wordIds ?? Object.keys(progress.words)); }
function upsert(key: string, entry: JsonObject, identity = 'id'): void {
  const collection = runtimeArray<JsonObject>(key), match = collection.find(row => row[identity] === entry[identity]);
  if (match) Object.assign(match, entry); else collection.push(entry);
}
export async function loadContext<T = JsonObject>(id: string): Promise<T> {
  const existing = contextPending.get(id); if (existing) return existing as Promise<T>;
  const generation = revision;
  const promise = (async () => {
    const record = await contentApi.request<ContentRecord<JsonObject>>(`contexts/${encodeURIComponent(id)}`);
    if (generation !== revision) throw new DOMException('Course changed', 'AbortError');
    return hydrateNarratives(record.body.data);
  })().finally(() => { if (generation === revision) contextPending.delete(id); });
  contextPending.set(id, promise); return promise as Promise<T>;
}
export interface ContextPage { loaded: number; remaining: number; }
interface ContextFilter { progress?: Progress; title?: string; mapId?: string; scene?: string; ending?: string; limit?: number; }
function matchingContexts(category: string, ownerId?: string, level?: string, filter: ContextFilter = {}): [string, JsonObject][] {
  return [...contexts].filter(([, meta]) => (meta.category ?? meta.kind) === category
    && (!ownerId || meta.ownerId === ownerId || meta.worldId === ownerId)
    && (!level || !meta.level || meta.level === level)
    && (!filter.title || meta.title === filter.title)
    && (!filter.mapId || meta.mapId === filter.mapId || meta.worldId === filter.mapId)
    && (!filter.scene || meta.scene === filter.scene)
    && (filter.ending === undefined || String(meta.ending ?? '') === filter.ending)
    && (!filter.progress || conditionMet(meta.condition as DialogueCondition | undefined, storyState(filter.progress.story))));
}
export async function loadContexts(category: string, ownerId?: string, level?: string, filter: ContextFilter = {}): Promise<ContextPage> {
  const generation = revision;
  const selected = matchingContexts(category, ownerId, level, filter).filter(([id]) => !resolvedContexts.has(id));
  const limit = Math.max(1, Math.min(24, filter.limit ?? 12));
  let loaded = 0;
  for (const [id, meta] of selected.slice(0, limit)) {
    let value: unknown;
    try { value = await loadContext<unknown>(id); }
    catch (error) { if (error instanceof Error && 'status' in error && error.status === 404) continue; throw error; }
    if (generation !== revision) throw new DOMException('Course changed', 'AbortError');
    const entry = data(value);
    if (category === 'grammar') upsert('courseGrammar', { ...entry, id, explanation: entry.teachingNotes ?? '' });
    else if (category === 'interiorConversation') {
      const existing = runtimeArray<JsonObject>('interiorConversations').find(conversation => conversation.objectId === entry.objectId);
      upsert('interiorConversations', { ...entry, nodes: { ...data(existing?.nodes), ...data(entry.nodes) } }, 'objectId');
    }
    else if (category === 'interiorWordFacts') {
      Object.assign(runtimeObject('interiorMeanings'), data(data(entry.meanings)[baseLanguage()]));
      Object.assign(runtimeObject('extraInteriorExamples'), data(entry.examples));
    }
    else if (category === 'questGrammar') runtimeObject('contextualGrammar')[String(meta.ownerId)] = { ...entry, explanation: entry.teachingNotes ?? '' };
    else if (category === 'npcGreeting') upsert(`greetings:${entry.speaker ?? meta.worldId}:${meta.level ?? 'A1'}`, { ...entry, condition: meta.condition ?? entry.when, german: entry.german ?? '', english: entry.english ?? '' }, 'sentenceId');
    else if (category === 'npcTitleGreeting') runtimeObject('titleGreetings')[`${entry.speaker ?? meta.worldId}:${entry.title ?? meta.title}`] = entry;
    else if (category === 'ambientCallback') upsert('ambientCallbacks', { ...entry, when: meta.condition ?? entry.when, npc: entry.npc ?? meta.worldId }, 'sentenceId');
    else if (category === 'activityDiscovery') runtimeObject('activityDiscoveries')[String(meta.ownerId)] = entry;
    else if (category === 'beginnerChoices') runtimeObject('beginnerGateTranslations')[String(meta.ownerId)] = rows(value).map(line => [line.german, line.english, line.sentenceId]);
    else if (category === 'interior') {
      const room = runtimeArray<JsonObject>('interiors').find(room => room.id === entry.id);
      if (room) {
        const previousObjects = rows(room.objects);
        for (const object of rows(entry.objects)) {
          const previous = previousObjects.find(row => row.id === object.id);
          if (previous) Object.assign(previous, object);
        }
        Object.assign(room, entry, { objects: rows(entry.objects).map(object => previousObjects.find(row => row.id === object.id) ?? object) });
      } else upsert('interiors', entry);
      for (const object of rows(entry.objects)) {
        for (const exerciseId of (Array.isArray(object.exerciseIds) ? object.exerciseIds as string[] : []).slice(0, 2)) {
          try { const exercise = await loadExercise(exerciseId); upsert('interiorExercises', exercise as unknown as JsonObject); }
          catch (error) { if (!(error instanceof Error && 'status' in error && error.status === 404)) throw error; }
        }
        for (const word of rows(object.vocabulary)) { const sentence = getSentence(String(word.sentenceId)); if (sentence) word.english = support(sentence.translations); }
      }
    } else if (category === 'activityInventory') Object.assign(runtimeObject('activityInventory'), entry);
    else if (category === 'activityScenario') { upsert('activityScenarios', entry); if (entry.exerciseId) await loadExercise(String(entry.exerciseId)); }
    else if (category === 'activityDefinitions') collection('activityDefinitions', rows(value));
    else if (category === 'specialItem') {
      const panels = runtimeObject('specialItems'), story = await storyPanelNarrative(entry);
      for (const key of [entry.id, entry.worldId, meta.worldId, meta.ownerId]) if (typeof key === 'string') panels[key] = story;
    }
    else if (category === 'storyEnding') runtimeObject('storyEndings')[String(meta.worldId ?? meta.ownerId ?? entry.id)] = await storyPanelNarrative(entry);
    else if (category === 'expeditionGame') {
      const presenter = await import('./expedition-games');
      if (generation !== revision) throw new DOMException('Course changed', 'AbortError');
      upsert('expeditionGames', presenter.serverExpeditionGame(entry as unknown as import('./expedition-games').ExpeditionGame, `${contentOwner}:${activeCourse?.id ?? ''}`) as unknown as JsonObject);
      const installer = await import('./expedition-learning');
      const placements = rows(entry.placements);
      for (const placement of placements) if (placement.exerciseId) {
        try { const exercise = await loadExercise(String(placement.exerciseId)); installer.installExpeditionBindings({ placements: [placement] }, [exercise]); }
        catch (error) { if (!(error instanceof Error && 'status' in error && error.status === 404)) throw error; }
      }
    } else if (category === 'npcRoutine') runtimeObject('npcRoutines')[String(entry.npcId ?? meta.worldId)] = rows(entry.beats);
    else if (category === 'cinematic') collection(`cinematic:${entry.mapId ?? meta.worldId}:${entry.kind ?? meta.scene}:${entry.ending ?? ''}`, rows(entry.beats));
    else if (category === 'mapObject') {
      runtimeObject('mapObjects')[String(entry.id ?? meta.worldId)] = entry;
      const maps = await import('./maps');
      if (generation !== revision) throw new DOMException('Course changed', 'AbortError');
      const map = maps.storyMaps.find(map => map.id === entry.mapId);
      const object = map?.objects.find(object => object.id === entry.id); if (object) Object.assign(object, entry);
    }
    if (generation !== revision) throw new DOMException('Course changed', 'AbortError');
    resolvedContexts.add(id); loaded++;
  }
  return { loaded, remaining: Math.max(0, selected.length - loaded) };
}
export async function loadInterior(id: string): Promise<void> { await loadContexts('interior', id); await loadContexts('interiorWordFacts', id); }
export function invalidateContext(category: string, ownerId?: string): void {
  for (const [id] of matchingContexts(category, ownerId)) {
    resolvedContexts.delete(id); contextPending.delete(id); contentApi.invalidate(`contexts/${id}`);
  }
}
export async function loadInteriorConversation(objectId: string, nodeId?: string): Promise<void> {
  const generation = revision;
  const entries = matchingContexts('interiorConversation', objectId);
  const target = nodeId ?? String(entries[0]?.[1].startNodeId ?? '');
  const entry = entries.find(([, meta]) => meta.nodeId === target);
  if (!entry || resolvedContexts.has(entry[0])) return;
  const value = data(await loadContext(entry[0]));
  if (generation !== revision) throw new DOMException('Course changed', 'AbortError');
  const existing = runtimeArray<JsonObject>('interiorConversations').find(conversation => conversation.objectId === value.objectId);
  upsert('interiorConversations', { ...value, nodes: { ...data(existing?.nodes), ...data(value.nodes) } }, 'objectId');
  resolvedContexts.add(entry[0]);
}
export async function loadActivity(id: string, level: string): Promise<void> {
  await loadContexts('activityInventory'); await loadContexts('activityDefinitions'); await loadContexts('activityDiscovery', `${id}:${level}`, level); await loadContexts('activityScenario', id, level);
}
export async function loadNpcConversation(id: string, level: string, progress: Progress, title?: string): Promise<void> {
  await loadContexts('npcGreeting', id, level, { progress });
  await loadContexts('ambientCallback', id, level, { progress });
  if (title) await loadContexts('npcTitleGreeting', id, undefined, { progress, title });
}
export async function loadRegionContent(mapId: string): Promise<void> {
  await loadContexts('expeditionGame', mapId);
  await loadContexts('mapObject', undefined, undefined, { mapId });
  const maps = await import('./maps'), map = maps.storyMaps.find(map => map.id === mapId);
  for (const npc of map?.npcs ?? []) await loadContexts('npcRoutine', npc.id);
}
export async function loadCinematic(kind: string, mapId?: string, ending = ''): Promise<void> {
  await loadContexts('cinematic', undefined, undefined, { ...(mapId ? { mapId } : {}), scene: kind, ending, limit: 1 });
}
export async function loadExpeditionEncounter(worldId: string): Promise<JsonObject | undefined> {
  const generation = revision, id = expeditionIds.get(worldId); if (!id) return undefined;
  const record = await contentApi.expedition<JsonObject>(id), body = data(await hydrateNarratives(record.body));
  if (generation !== revision) throw new DOMException('Course changed', 'AbortError');
  if (body.learning) {
    const binding = data(body.learning), exercises: Exercise[] = [];
    for (const exerciseId of Object.values(data(binding.exerciseIds))) if (typeof exerciseId === 'string') {
      try { exercises.push(await loadExercise(exerciseId)); }
      catch (error) { if (!(error instanceof Error && 'status' in error && error.status === 404)) throw error; }
    }
    if (generation !== revision) throw new DOMException('Course changed', 'AbortError');
    const installer = await import('./expedition-learning'); installer.installExpeditionBindings(binding, exercises);
  }
  const sentence = getSentence(String(body.sentenceId));
  return { ...body, worldId, german: sentence?.text ?? '', translation: sentence ? support(sentence.translations) : '' };
}
export async function loadMiniGame(worldId: string): Promise<JsonObject | undefined> {
  const generation = revision, id = minigameIds.get(worldId); if (!id) return undefined;
  const record = await contentApi.minigame<JsonObject>(id), body = data(await hydrateNarratives(record.body));
  if (generation !== revision) throw new DOMException('Course changed', 'AbortError');
  upsert('miniGameDefinitions', { ...localizeMetadata(body), id: worldId, contentId: record.id });
  await syncMiniGameCatalogue(generation);
  if (body.scripts) {
    const scripts = runtimeObject('miniGameScripts');
    const games = data(scripts.games); scripts.games = games;
    const retained = data(games[worldId]); Object.assign(retained, data(body.scripts)); games[worldId] = retained;
  }
  for (const exerciseId of (Array.isArray(body.exerciseIds) ? body.exerciseIds as string[] : []).slice(0, 24)) {
    try {
      const exercise = await loadExercise(exerciseId);
      if (generation !== revision) throw new DOMException('Course changed', 'AbortError');
      upsert('scriptedStoryExercises', exercise as unknown as JsonObject);
      upsert('canonicalStoryExercises', { ...exercise, mode: ({ choice: 'recognition', listen: 'listening', type: 'production', sentence: 'production' } as Record<string, string>)[exercise.mode] ?? exercise.mode });
    } catch (error) { if (!(error instanceof Error && 'status' in error && error.status === 404)) throw error; }
  }
  if (body.loopData) {
    const loops = runtimeObject('loopData'), incoming = data(body.loopData), clips = Array.isArray(loops.clips) ? loops.clips as unknown[] : [];
    Object.assign(loops, incoming); clips.splice(0, clips.length, ...rows(incoming.clips)); loops.clips = clips;
  }
  const audio = data(body.audio), clips = rows(audio.clips);
  const audioData = runtimeObject('miniGameAudio');
  if (!Array.isArray(audioData.clips)) audioData.clips = [];
  for (const clip of clips) {
    const sentence = getSentence(String(clip.sentenceId)); if (!sentence) continue;
    const existing = (audioData.clips as JsonObject[]).find(row => row.id === clip.id);
    const entry = { ...clip, text: sentence.text };
    if (existing) Object.assign(existing, entry); else (audioData.clips as JsonObject[]).push(entry);
  }
  return body;
}

/**
 * An admin hid or restored a story line. Fetch the scene's dialogue again and
 * swap it in place, so code that reads the cached graph never finds it missing.
 */
export async function refreshQuestGraph(graphId: string, questId?: string): Promise<void> {
  const quests = new Set([...graphIds].filter(([, id]) => id === graphId).map(([quest]) => quest));
  if (questId) quests.add(questId);
  const generation = revision, graphs = runtimeArray<QuestGraph>('questGraphs');
  const cached = graphs.filter(graph => quests.has(graph.questId));
  contentApi.invalidate(`graphs/${encodeURIComponent(graphId)}`);
  if (!cached.length) return;
  const record = await contentApi.graph<JsonObject>(graphId), next = normalizeGraph(record.body);
  if (generation !== revision) return;
  for (const graph of cached) { const index = graphs.indexOf(graph); if (index >= 0) graphs[index] = next; }
}
