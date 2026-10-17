// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fixture from './test-fixtures/content-public.json';
import { emptyProgress, type SessionResult } from './api';
import { setBaseLanguage, setTargetLanguage } from './i18n';
import { contentApi } from './content-api';
import { intakeStatus, missingWordCount, syllabus, syllabusPosition, wordScheduled } from './intake';
import { getSentence } from './translated-sentence';
import { activeCourse, loadServerContent, loadStoryContent, storyContentRemaining, refreshBootstrap, loadQuestGraph, loadDialogueSentence, loadDialogueExercise, loadExercise, loadWords, loadContexts, loadInterior, loadInteriorConversation, loadNpcConversation, loadCinematic, loadMiniGame, loadPlacement, runtimeArray, runtimeObject, runtimeReference } from './content-runtime';
import { mountOptionalPlacement } from './placement-ui';
import { canVoiceDialogue } from './dialogue';
import { emptyMechanics, storyMarks } from './story-mechanics';

const indexes = vi.hoisted(() => ({ lexemeById: new Map(), courseExerciseById: new Map(), courseContextWordIds: {} as Record<string, string[]>, install: vi.fn() }));
const publicSyllabus = vi.hoisted(() => ({ version: '', wordsPerHour: 10, openingWords: 10, bankCap: 15, storyShare: .5, brake: { maxUnsettled: 12, maxDue: 20 }, wordIds: [] as string[], quests: [] }));
vi.mock('./course', () => ({ lexemeById: indexes.lexemeById, courseExerciseById: indexes.courseExerciseById, courseContextWordIds: indexes.courseContextWordIds }));
vi.mock('./expedition-learning', () => ({ installExpeditionBindings: indexes.install }));
vi.mock('./data/syllabus.json', () => ({ default: publicSyllabus }));
type Json = Record<string, unknown>;
const records = new Map(fixture.records.map(record => [record.id, record as unknown as { id: string; kind: string; body: Json; version: number; courseId: string }]));
const bootstrap = records.get(fixture.bootstrapId)!;
const body = bootstrap.body;
let fetcher: ReturnType<typeof vi.fn>;
function list(value: unknown): Json[] { return Array.isArray(value) ? value as Json[] : []; }
function meta(kind: string): Json { return list(body.contexts).find(row => row.kind === kind)!; }
function session(): SessionResult {
  return { token: 'public-session', activeCourseId: fixture.course.id, player: { id: 'public-player', name: 'Ada' }, progress: emptyProgress(), preferences: { baseLanguage: 'tr' }, account: { registered: false, email: '' } } as unknown as SessionResult;
}
beforeEach(async () => {
  indexes.install.mockReset(); indexes.lexemeById.clear(); indexes.courseExerciseById.clear(); contentApi.clear();
  for (const key of Object.keys(indexes.courseContextWordIds)) delete indexes.courseContextWordIds[key];
  runtimeObject('syllabus', syllabus);
  fetcher = vi.fn(async (url: string) => {
    const path = new URL(url, 'https://atlas.example').pathname;
    if (path.endsWith('/bootstrap')) return new Response(JSON.stringify(bootstrap), { status: 200 });
    if (path.endsWith('/sentences') || path.endsWith('/lexemes')) {
      const ids = new URL(url, 'https://atlas.example').searchParams.get('ids')!.split(',');
      return new Response(JSON.stringify({ records: ids.map(id => records.get(id)).filter(Boolean) }), { status: 200 });
    }
    const id = path.split('/').at(-1)!;
    return new Response(JSON.stringify(records.get(id) ?? { error: 'content not found' }), { status: records.has(id) ? 200 : 404 });
  });
  vi.stubGlobal('fetch', fetcher); await setBaseLanguage('tr');
  await loadServerContent(session()); fetcher.mockClear();
});
afterEach(async () => { contentApi.clear(); vi.unstubAllGlobals(); vi.restoreAllMocks(); await setBaseLanguage('en'); setTargetLanguage('de'); });

describe('server record adapters', () => {
  it('retains the original authored audio requirement after a runtime value is substituted', async () => {
    const record = [...records.values()].find(record => record.kind === 'sentence' && String(record.body.text).includes('{name}'))!;
    expect(record).toBeDefined();
    const line = await loadDialogueSentence({ id: 'runtime-name', sentenceId: record.id, speaker: 'otto', clipId: '', german: '', english: '' });
    expect(line.audioRequires).toBe(true);
    const prepared = { ...line, german: line.german.replaceAll('{name}', 'Ada') };
    expect(canVoiceDialogue(prepared.german, prepared.audioRequires)).toBe(false);
    expect(canVoiceDialogue('Willkommen!', false)).toBe(true);
  });
  it('loads eight JSON placement questions by UUID and renders each without a quest bank or grading secrets', async () => {
    const questions = await loadPlacement();
    expect(questions).toHaveLength(8);
    expect(questions.map(question => question.exercise.level)).toEqual(['A1', 'A1', 'A1', 'A2', 'A2', 'A2', 'B1', 'B1']);
    for (const { exercise, turn } of questions) {
      expect(exercise.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(turn.sentenceId).toMatch(/^[0-9a-f-]{36}$/);
      expect(turn.german.trim()).not.toBe('');
      expect(exercise.answer).toBe(''); expect(exercise.explanation).toBe('');
      expect(runtimeObject('placementDialogue')[exercise.id]).toEqual(turn);
    }
    const paths = fetcher.mock.calls.map(([url]) => new URL(String(url), 'https://atlas.example').pathname);
    expect(paths.filter(path => path.includes('/contexts/'))).toHaveLength(1);
    expect(paths.filter(path => path.includes('/exercises/'))).toHaveLength(8);
    expect(paths.some(path => path.includes('/graphs/'))).toBe(false);
    const host = document.createElement('div'), progress = emptyProgress(), onComplete = vi.fn();
    const request = vi.fn(async () => ({ correct: true }));
    const controller = await mountOptionalPlacement(host, { api: { request: request as never }, progress, questions, speak: vi.fn(), onClose: vi.fn(), onComplete });
    for (let index = 0; index < 8; index++) {
      expect(host.querySelector('.placement-dialogue .translated-sentence')?.textContent).toBe(questions[index].turn.german);
      const input = host.querySelector<HTMLInputElement>('#placement-answer');
      if (input) { input.value = 'a diagnostic reply'; host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); }
      else host.querySelector<HTMLButtonElement>('[data-placement="answer"]')!.click();
      for (let tick = 0; tick < 5; tick++) await Promise.resolve();
      host.querySelector<HTMLButtonElement>('[data-placement="next"]')!.click();
    }
    expect(request.mock.calls.map(call => (call as unknown as [string, { exerciseId: string; preview: boolean }])[1])).toEqual(questions.map(question => expect.objectContaining({ exerciseId: question.exercise.id, preview: true })));
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ answered: 8 }), progress);
    controller.destroy();
  });
  it('loads the emitted public bootstrap as metadata without requesting sentences or exercises', () => {
    expect(activeCourse?.id).toBe(fixture.course.id);
    expect(runtimeArray<Json>('quests')[0].id).toBe(list(body.quests)[0].id);
    expect(runtimeArray<Json>('quests')[0].title).toBe((list(body.quests)[0].support as Record<string, Json>).tr.title);
    expect(runtimeArray<Json>('quests')[0].exercises).toEqual([]);
    expect(runtimeArray<Json>('npcs')[0].id).toBe(list(body.npcs)[0].worldId);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('recognises the lamp by the public item IDs the bootstrap publishes', async () => {
    const lampId = '0880094a-ead5-5816-b362-c4a58ac7c12b', updated = structuredClone(bootstrap);
    updated.body.storyItems = { lamp: [lampId] };
    fetcher.mockResolvedValueOnce(new Response(JSON.stringify(updated), { status: 200 }));
    await loadServerContent(session());
    const carrying = (inventory: string[]) => storyMarks('lindenhafen', { ...emptyProgress(), story: { ...emptyProgress().story!, inventory } }, emptyMechanics(), 'Ada').lamp;
    expect(carrying([lampId])).toBe(true);
    expect(carrying(['registered-lamp'])).toBe(true);
    expect(carrying(['4d1e2ce2-0000-5000-8000-000000000000'])).toBe(false);
  });
  it('counts the public syllabus total and registers only fetched word positions until the course changes', async () => {
    const updated = structuredClone(bootstrap);
    updated.body.syllabus = { ...(updated.body.syllabus as Json), wordIds: [], totalWords: 6000 };
    fetcher.mockResolvedValueOnce(new Response(JSON.stringify(updated), { status: 200 }));
    await loadServerContent(session());
    const progress = emptyProgress();
    progress.intake = { version: 1, activeSeconds: 0, creditSeconds: 3600, lastBeatAt: '', wordIds: ['opening-one', 'opening-two'] };
    expect(syllabus.wordIds).toEqual([]);
    expect(intakeStatus(progress)).toMatchObject({ introduced: 2, remaining: 5998, pending: 8 });
    expect(wordScheduled(fixture.lexemeId)).toBe(false);
    const lexical = structuredClone(records.get(fixture.lexemeId)!); lexical.body.syllabusIndex = 7;
    fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ records: [lexical] }), { status: 200 }));
    await loadWords([fixture.lexemeId]);
    expect(syllabusPosition.size).toBe(1); expect(syllabusPosition.get(fixture.lexemeId)).toBe(7);
    expect(wordScheduled(fixture.lexemeId)).toBe(true);
    expect(missingWordCount([fixture.lexemeId, 'unserved-bank-word'], progress)).toBe(1);
    progress.intake.wordIds.push(fixture.lexemeId);
    expect(missingWordCount([fixture.lexemeId], progress)).toBe(0);
    const switched = session(); switched.token = 'new-course-session';
    (switched as SessionResult & { activeCourseId: string }).activeCourseId = 'new-course';
    await loadServerContent(switched);
    expect(syllabusPosition.size).toBe(0); expect(wordScheduled(fixture.lexemeId)).toBe(false);
  });
  it('pages story records in bounded slices and preserves hydrated sentences and quest exercises', async () => {
    const quest = runtimeArray<Json>('quests')[0];
    const retainedExercises = quest.exercises as unknown[]; retainedExercises.push({ id: 'already-loaded' });
    const first = await loadStoryContent();
    expect(first.loaded).toBeLessThanOrEqual(12); expect(first.remaining).toBeGreaterThan(0);
    const requested = fetcher.mock.calls.map(([url]) => new URL(String(url), 'https://atlas.example').searchParams.get('ids')!.split(','));
    expect(requested).toHaveLength(1); expect(requested[0]).toHaveLength(12);
    const sentence = getSentence(requested[0][0]); expect(sentence?.text).toBeTruthy();
    await loadStoryContent(24);
    expect(getSentence(requested[0][0])).toBe(sentence);
    expect(quest.exercises).toBe(retainedExercises);
    expect(retainedExercises).toEqual([{ id: 'already-loaded' }]);
    expect(storyContentRemaining).toBeLessThan(first.remaining);
    for (const [url] of fetcher.mock.calls) expect(new URL(String(url), 'https://atlas.example').searchParams.get('ids')!.split(',').length).toBeLessThanOrEqual(12);
  });
  it('refreshes unlocked bootstrap metadata without resetting cached learning or quest identities', async () => {
    await loadStoryContent();
    const quest = runtimeArray<Json>('quests')[0], units = runtimeArray<Json>('courseUnits');
    const exercises = quest.exercises as unknown[]; exercises.push({ id: 'existing' });
    Object.assign(units[0], { exerciseIds: ['served-exercise'], wordIds: ['served-word'] });
    await refreshBootstrap();
    expect(runtimeArray<Json>('quests')[0]).toBe(quest); expect(quest.exercises).toBe(exercises);
    expect(units[0].exerciseIds).toEqual(['served-exercise']); expect(units[0].wordIds).toEqual(['served-word']);
    expect(fetcher.mock.calls.filter(([url]) => String(url).endsWith('/bootstrap'))).toHaveLength(1);
  });
  it('localizes dictionary metadata translations when a support object omits the field', async () => {
    const updated = structuredClone(bootstrap), unit = list(updated.body.units)[0];
    unit.support = { tr: { title: 'Destek nesnesindeki başlık' } };
    unit.titleTranslations = { tr: 'Sözlük başlığı' };
    unit.summaryTranslations = { tr: 'Sözlükteki Türkçe özet', de: 'Deutsche Zusammenfassung' };
    fetcher.mockResolvedValueOnce(new Response(JSON.stringify(updated), { status: 200 }));
    await refreshBootstrap();
    const localized = runtimeArray<Json>('courseUnits')[0];
    expect(localized.title).toBe('Destek nesnesindeki başlık');
    expect(localized.summary).toBe('Sözlükteki Türkçe özet');
    expect((localized.support as Record<string, Json>).tr).not.toHaveProperty('summary');
    await setBaseLanguage('de');
    fetcher.mockResolvedValueOnce(new Response(JSON.stringify(updated), { status: 200 }));
    await refreshBootstrap();
    expect(runtimeArray<Json>('courseUnits')[0].summary).toBe('Deutsche Zusammenfassung');
  });
  it('loads translated supported choices before returning a dialogue gate', async () => {
    const manifest = list(body.contexts).find(row => row.kind === 'beginnerChoices')!;
    const exercise = await loadDialogueExercise(String(manifest.ownerId));
    const replies = runtimeObject<Record<string, unknown[]>>('beginnerGateTranslations')[exercise.id];
    expect(replies).toHaveLength(2);
    expect(replies.every(row => Array.isArray(row) && typeof row[0] === 'string' && row[0] && typeof row[1] === 'string' && row[1])).toBe(true);
  });
  it('keeps graph reads separate from lazy current-sentence reads and preserves compiled metadata', async () => {
    const questId = String(list(body.quests)[0].id), graph = (await loadQuestGraph(questId))!;
    expect(graph.nodes[0].lines[0].german).toBe('');
    expect(fetcher.mock.calls).toHaveLength(1); expect(String(fetcher.mock.calls[0][0])).toContain('/graphs/');
    const hydrated = await loadDialogueSentence(graph.nodes[0].lines[0]);
    const id = (hydrated as typeof hydrated & { sentenceId: string }).sentenceId;
    expect(hydrated.german).toBe(getSentence(id)?.text);
    expect(hydrated.english).toBe(getSentence(id)?.translations.tr?.text);
    expect(getSentence(id)?.words).toBeDefined();
    await loadDialogueSentence(graph.nodes[0].lines[0]); expect(fetcher.mock.calls).toHaveLength(2);
  });
  it('adapts public exercises and generic lexical forms without exposing local grading targets', async () => {
    const graph = (await loadQuestGraph(String(list(body.quests)[0].id)))!;
    const exercise = await loadExercise(graph.gateExerciseId);
    expect(exercise.answer).toBe(''); expect(exercise.explanation).toBe(''); expect(exercise.acceptedAnswers).toBeUndefined();
    expect(runtimeArray<Json>('quests')[0].exercises).toEqual([exercise]);
    await Promise.all([loadWords([fixture.lexemeId]), loadWords([fixture.lexemeId])]);
    const words = runtimeArray<Json>('courseLexicon'); expect(words.filter(word => word.id === fixture.lexemeId)).toHaveLength(1);
    const lexical = records.get(fixture.lexemeId)!.body;
    expect(words[0].english).toBe((lexical.meanings as Json).tr);
    expect(words[0].surfaceForms).toEqual(lexical.forms);
    expect(runtimeReference('item', fixture.lexemeId)).toBe(lexical.itemId);
    expect(runtimeReference('exercise', fixture.lexemeId, 'production')).toBe((lexical.exerciseIds as Json).production);
    expect(indexes.lexemeById.get(fixture.lexemeId)).toBe(words[0]);
  });
  it.each(['f4974bda-2400-570c-9737-50cb9c9239a3', '811ad618-21c8-58a2-971e-fcdc597b50f5', 'bc31c0f1-924f-5500-9801-c0cb8d86bf97'])('registers the fetched contextual vocabulary for canonical exercise %s', async id => {
    const exercise = await loadExercise(id), served = records.get(id)!.body;
    expect(served.wordIds).toHaveLength(id === 'f4974bda-2400-570c-9737-50cb9c9239a3' ? 4 : id === '811ad618-21c8-58a2-971e-fcdc597b50f5' ? 5 : 10);
    expect((exercise as typeof exercise & { wordIds: string[] }).wordIds).toEqual(served.wordIds);
    expect(indexes.courseContextWordIds[id]).toEqual(served.wordIds);
    expect((runtimeObject<Json>('courseData').contextWordIds as Json)[id]).toEqual(served.wordIds);
    expect(exercise.answer).toBe(''); expect(exercise.acceptedAnswers).toBeUndefined();
    expect(fetcher.mock.calls.some(([url]) => String(url).endsWith(`/exercises/${id}`))).toBe(true);
  });
  it('hydrates per-room word cards while preserving geometry object references', async () => {
    const interiorMeta = meta('interior'), data = records.get(String(interiorMeta.id))!.body.data as Json;
    const object = { id: String(list(data.objects)[0].id), vocabulary: [], exerciseIds: [] };
    const room = { id: String(data.id), objects: [object], width: 1536 };
    runtimeArray<Json>('interiors').splice(0, runtimeArray('interiors').length, room);
    await loadInterior(String(data.id));
    expect(runtimeArray<Json>('interiors')[0]).toBe(room);
    expect(list(room.objects)[0]).toBe(object);
    const vocabulary = list(list(room.objects)[0].vocabulary);
    expect(vocabulary.length).toBeGreaterThan(0); expect(vocabulary[0].german).toBeTruthy(); expect(vocabulary[0].english).toBeTruthy();
    expect(vocabulary[0].sentenceId).toBeTruthy();
  });
  it('loads the current interior turn and its choices while retaining earlier hydrated nodes', async () => {
    const objectId = 'interior:cafe:coffee';
    await loadInteriorConversation(objectId);
    const conversation = runtimeArray<Json>('interiorConversations').find(row => row.objectId === objectId)!;
    const startId = String(conversation.start), first = (conversation.nodes as Record<string, Json>)[startId];
    expect(Object.keys(conversation.nodes as Json)).toEqual([startId]);
    expect((first.line as Json).german).toBeTruthy(); expect((first.line as Json).sentenceId).toBeTruthy();
    const choice = list(first.choices)[0], nextId = String(choice.next);
    expect((choice.line as Json).german).toBeTruthy();
    await loadInteriorConversation(objectId, nextId);
    expect(runtimeArray<Json>('interiorConversations').find(row => row.objectId === objectId)).toBe(conversation);
    expect(Object.keys(conversation.nodes as Json).sort()).toEqual([startId, nextId].sort());
    expect((conversation.nodes as Record<string, Json>)[startId]).toBe(first);
    const before = fetcher.mock.calls.length; await loadInteriorConversation(objectId, nextId);
    expect(fetcher.mock.calls).toHaveLength(before);
    await loadInterior('cafe');
    expect(runtimeObject<Json>('interiorMeanings').Kaffee).toBe('kahve');
    expect(runtimeObject<Json>('interiorMeanings').Milch).toBe('süt');
    expect(runtimeObject<Json>('interiorMeanings')).not.toHaveProperty('tr');
    await loadInterior('inn');
    const extra = runtimeObject<Json>('extraInteriorExamples').Bett as Json;
    expect(extra.german).toBeTruthy(); expect(extra.sentenceId).toBeTruthy();
    for (const [url] of fetcher.mock.calls.filter(([url]) => String(url).includes('/sentences?'))) expect(new URL(String(url), 'https://atlas.example').searchParams.get('ids')!.split(',').length).toBeLessThanOrEqual(12);
  });
  it('does not install withheld interior Turkish meanings during an English support session', async () => {
    await setBaseLanguage('en');
    const changed = session(); changed.preferences.baseLanguage = 'en';
    await loadServerContent(changed);
    const factsMeta = list(body.contexts).find(row => row.kind === 'interiorWordFacts' && row.ownerId === 'cafe')!;
    const facts = structuredClone(records.get(String(factsMeta.id))!);
    (facts.body.data as Json).meanings = {};
    fetcher.mockResolvedValueOnce(new Response(JSON.stringify(facts), { status: 200 }));
    await loadContexts('interiorWordFacts', 'cafe');
    expect(runtimeObject<Json>('interiorMeanings')).toEqual({});
  });
  it('selects NPC speech by current manifest conditions and hydrates title, routines and cinematic registries', async () => {
    const greeting = meta('npcGreeting'), title = meta('npcTitleGreeting'), progress = emptyProgress();
    await loadNpcConversation(String(greeting.ownerId), String(greeting.level), progress, String(title.title));
    const lines = runtimeArray<Json>(`greetings:${greeting.worldId}:${greeting.level}`);
    expect(lines[0].german).toBeTruthy(); expect(lines[0].sentenceId).toBeTruthy();
    expect(runtimeObject<Json>('titleGreetings')[`${title.worldId}:${title.title}`]).toBeTruthy();
    const routine = meta('npcRoutine'); await loadContexts('npcRoutine', String(routine.ownerId));
    expect(list(runtimeObject<Json>('npcRoutines')[String(routine.worldId)])[0].german).toBeTruthy();
    const cinema = meta('cinematic'); await loadCinematic(String(cinema.scene), String(cinema.worldId));
    expect(runtimeArray<Json>(`cinematic:${cinema.worldId}:${cinema.scene}:`)[0].german).toBeTruthy();
  });
  it('loads activity arrays and contextual grammar using their emitted UUID references', async () => {
    await loadContexts('grammar'); await loadContexts('questGrammar'); await loadContexts('activityDefinitions'); await loadContexts('activityInventory'); await loadContexts('activityScenario'); await loadContexts('activityDiscovery');
    const guide = runtimeArray<Json>('courseGrammar')[0]; expect(guide.explanation).toBeTruthy(); expect(guide.id).toBe(meta('grammar').id);
    const note = runtimeObject<Json>('contextualGrammar')[String(meta('questGrammar').ownerId)] as Json;
    expect(note.german).toBeTruthy(); expect(note.guideId).toBeTruthy();
    expect(runtimeArray<Json>('activityDefinitions')[0].id).toBe('cafe');
    expect((runtimeObject<Json>('activityInventory').coffee as Json).german).toBeTruthy();
    expect(runtimeArray<Json>('activityScenarios')[0].german).toBeTruthy();
    expect(runtimeObject<Json>('activityDiscoveries')[String(meta('activityDiscovery').ownerId)]).toBeTruthy();
  });
  it('does not let a prior session bootstrap populate a newly activated course', async () => {
    let resolve!: (response: Response) => void;
    fetcher.mockImplementationOnce(() => new Promise<Response>(done => { resolve = done; }));
    const old = loadServerContent(session());
    const updated = session(); (updated as SessionResult & { activeCourseId: string }).activeCourseId = 'different-course'; updated.token = 'new-token';
    await loadServerContent(updated);
    resolve(new Response(JSON.stringify(bootstrap), { status: 200 }));
    await expect(old).rejects.toMatchObject({ name: 'AbortError' });
    expect(activeCourse?.id).toBe(fixture.course.id);
  });
  it('preserves dense static NPC and interior arrays when switching from German to English', async () => {
    const interior = { id: 'cafe', objects: [{ id: 'coffee-counter', x: .4, y: .5 }], width: 1536 };
    runtimeArray<Json>('interiors').splice(0, runtimeArray('interiors').length, interior);
    const nextCourse = { id: 'english-proof-course', target: 'en', title: 'First conversations', supportLanguages: ['tr', 'de'] };
    const nextBootstrap = { ...bootstrap, courseId: nextCourse.id, body: { course: nextCourse, npcs: [{ id: 'sam-uuid', worldId: 'sam', name: 'Sam' }], quests: [], units: [], contexts: [], acts: [], clues: [], objects: {}, journalNarratives: {} } };
    fetcher.mockResolvedValueOnce(new Response(JSON.stringify(nextBootstrap), { status: 200 }));
    const next = session(); (next as SessionResult & { activeCourseId: string }).activeCourseId = nextCourse.id;
    await loadServerContent(next);
    expect(runtimeArray<Json>('npcs').map(npc => npc.id)).toEqual(['sam']);
    expect(runtimeArray<Json>('interiors')).toEqual([interior]);
    expect(Object.keys(runtimeArray<Json>('interiors'))).toEqual(['0']);
    expect(runtimeArray<Json>('interiors')[0].objects).toEqual([{ id: 'coffee-counter', x: .4, y: .5 }]);
    expect(activeCourse?.target).toBe('en');
  });
  it('keeps the minigame catalogue live and installs authorized scripts, exercises and audio into stable registries', async () => {
    const catalogue = await import('./minigames/catalogue');
    const metadata = list(body.minigames)[0], gameId = String(metadata.worldId), gameRecord = records.get(String(metadata.id))!;
    const graphRecord = records.get(String(list(body.quests)[0].graphId))!;
    const firstLine = list(list(graphRecord.body.nodes)[0].lines)[0], sentenceId = String(firstLine.sentenceId), exerciseId = String(graphRecord.body.gateExerciseId);
    const retained = {}; runtimeObject<Json>('miniGameScripts').games = { [gameId]: retained };
    catalogue.miniGameById.clear();
    fetcher.mockImplementation(async (url: string) => {
      const path = new URL(url, 'https://atlas.example').pathname;
      if (path.endsWith(`/minigames/${metadata.id}`)) return new Response(JSON.stringify({ ...gameRecord, body: { ...gameRecord.body, scripts: { intro: { sentenceId } }, exerciseIds: [exerciseId], audio: { clips: [{ id: 'authorized-clip', sentenceId, path: '/audio/authorized.ogg' }] } } }), { status: 200 });
      if (path.endsWith('/sentences')) return new Response(JSON.stringify({ records: [records.get(sentenceId)] }), { status: 200 });
      const record = records.get(path.split('/').at(-1)!);
      return new Response(JSON.stringify(record ?? { error: 'content not found' }), { status: record ? 200 : 404 });
    });
    await loadMiniGame(gameId);
    expect(catalogue.miniGameById.get(gameId)?.instruction).toBeTruthy();
    expect((runtimeObject<Json>('miniGameScripts').games as Json)[gameId]).toBe(retained);
    expect((retained as Json).intro).toHaveProperty('german');
    expect(runtimeArray<Json>('canonicalStoryExercises').find(exercise => exercise.id === exerciseId)).toHaveProperty('mode', 'production');
    expect(runtimeArray<Json>('scriptedStoryExercises').find(exercise => exercise.id === exerciseId)).toHaveProperty('answer', '');
    expect(list(runtimeObject<Json>('miniGameAudio').clips)[0]).toMatchObject({ id: 'authorized-clip', text: getSentence(sentenceId)?.text, path: '/audio/authorized.ogg' });
  });
});
