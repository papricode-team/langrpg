// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Api, AttemptResult, Progress, SessionResult } from './api';
import { emptyProgress } from './api';
import { contentApi, configureContentSession } from './content-api';
import { clearSentences, getSentence, registerSentence } from './translated-sentence';
import { installSentenceTranslations } from './sentence-translations';
import { setBaseLanguage, setTargetLanguage } from './i18n';

const state = vi.hoisted(() => ({
  course: { id: 'english-course', target: 'en', title: 'First conversations', supportLanguages: ['tr', 'de'] },
  collections: {} as Record<string, unknown[]>,
  loadDialogueSentence: vi.fn(), loadExercise: vi.fn(), loadQuestGraph: vi.fn(), loadRestoredWords: vi.fn(), loadUnit: vi.fn(), runtimeReference: vi.fn(),
}));
vi.mock('./content-runtime', () => ({
  get activeCourse() { return state.course; },
  runtimeArray: (key: string) => state.collections[key] ?? [],
  loadDialogueSentence: state.loadDialogueSentence, loadExercise: state.loadExercise, loadQuestGraph: state.loadQuestGraph,
  loadRestoredWords: state.loadRestoredWords, loadUnit: state.loadUnit, runtimeReference: state.runtimeReference,
}));
import { mountCoursePicker, mountCoursePlayer } from './course-player';

let stopTranslations: (() => void) | undefined;
let root: HTMLElement;
const line = { id: 'hello-line', sentenceId: 'hello-sentence', german: 'Your ticket, please.', english: 'Biletiniz, lütfen.', speaker: 'sam', clipId: 'hello' };
const exercise = { id: 'request', itemId: 'request-item', mode: 'type', prompt: 'Ask Sam to repeat.', german: '', english: '', answer: 'EMBEDDED ANSWER', explanation: '', hint: '' };
const graph = { questId: 'quest', level: 'A1', start: 'intro', gateExerciseId: 'request', investigations: [], nodes: [
  { id: 'intro', stage: 'intro', lines: [line], next: 'gate' },
  { id: 'gate', stage: 'gate', lines: [], next: 'choice' },
  { id: 'choice', stage: 'choice', lines: [], choices: [{ id: 'finish-choice', german: 'Thank you.', english: 'Teşekkürler.', next: 'complete', effects: [] }] },
  { id: 'complete', stage: 'complete', lines: [line], terminal: true },
] };

beforeEach(async () => {
  state.course = { id: 'english-course', target: 'en', title: 'First conversations', supportLanguages: ['tr', 'de'] };
  state.collections = { quests: [{ id: 'quest' }], npcs: [{ id: 'sam', name: 'Sam' }], courseUnits: [{ id: 'unit', title: 'Practice', exerciseIds: ['request'] }], courseLexicon: [{ id: 'ticket-word', lemma: 'ticket', english: 'bilet' }] };
  state.loadDialogueSentence.mockReset().mockImplementation(async reference => reference);
  state.loadExercise.mockReset().mockResolvedValue(exercise);
  state.loadQuestGraph.mockReset().mockResolvedValue(graph);
  state.loadRestoredWords.mockReset().mockResolvedValue(undefined);
  state.loadUnit.mockReset().mockResolvedValue(state.collections.courseUnits[0]);
  state.runtimeReference.mockReset().mockImplementation((kind: string, id: string, mode?: string) => {
    const word = state.collections.courseLexicon.find(word => (word as { id: string }).id === id) as { itemId?: string; exerciseIds?: Record<string, string> } | undefined;
    return kind === 'item' ? word?.itemId ?? '' : word?.exerciseIds?.[mode ?? ''] ?? '';
  });
  root = document.createElement('main'); root.className = 'course-player'; document.body.append(root);
  configureContentSession(() => 'token', { accountId: 'player', courseId: state.course.id, supportLanguage: 'tr', contentVersion: 1 });
  registerSentence({ id: line.sentenceId, text: line.german, target: 'en', translations: { tr: { text: 'Biletiniz, lütfen.', words: [{ source: { text: 'ticket', occurrence: 1 }, targets: [{ text: 'Biletiniz', occurrence: 1 }], sourceRange: { start: 5, end: 11 }, targetRanges: [{ start: 0, end: 9 }] }] }, de: { text: 'Ihre Fahrkarte, bitte.', words: [{ source: { text: 'ticket', occurrence: 1 }, targets: [{ text: 'Fahrkarte', occurrence: 1 }], sourceRange: { start: 5, end: 11 }, targetRanges: [{ start: 5, end: 14 }] }] } }, words: [{ source: { text: 'ticket', occurrence: 1 }, range: { start: 5, end: 11 }, lexemeId: 'ticket-word', glosses: { tr: 'bilet', de: 'Fahrkarte' } }] });
  await setBaseLanguage('tr'); setTargetLanguage('en');
  vi.spyOn(contentApi, 'courses').mockResolvedValue({ courses: [state.course] });
  stopTranslations = installSentenceTranslations(root);
});
afterEach(async () => { stopTranslations?.(); clearSentences(); document.body.replaceChildren(); vi.restoreAllMocks(); vi.useRealTimers(); await setBaseLanguage('en'); setTargetLanguage('de'); });

function fixture(stage: 'intro' | 'gate' | 'complete' = 'intro') {
  const progress: Progress = { ...emptyProgress(), story: { flags: {}, nodes: { quest: stage }, inventory: [], reputation: { brassOffice: 0, lamplighters: 0, unwritten: 0 }, bell: 0, day: 1, choices: {}, inspections: {} } };
  const api = { token: 'token', selfId: 'player', request: vi.fn(), expose: vi.fn().mockResolvedValue({ progress }), completeUnit: vi.fn().mockResolvedValue({ progress }), storyTransition: vi.fn().mockImplementation(async input => ({ progress: { ...progress, story: { ...progress.story, nodes: { quest: input.nodeId === 'intro' ? 'gate' : input.nodeId === 'gate' ? 'choice' : 'complete' } } } })) };
  const session = { token: 'token', player: { id: 'player', name: 'Ada' }, progress, preferences: { baseLanguage: 'tr' } } as unknown as SessionResult;
  const mount = () => mountCoursePlayer(root, { api: api as unknown as Api, session });
  const click = (selector: string) => root.querySelector<HTMLButtonElement>(selector)!.click();
  const submit = (answer: string) => { const input = root.querySelector<HTMLInputElement>('[name="answer"]')!; input.value = answer; input.dispatchEvent(new Event('input', { bubbles: true })); input.form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); };
  const result = (correct: boolean, answer = 'Please say it again.'): AttemptResult => ({ attemptId: 'receipt', correct, correctedAnswer: answer, reason: correct ? 'Accepted.' : 'Try again.', duplicate: false, xpAdded: 0, progress: { ...progress, exerciseStats: { request: { attempts: 1, correct: correct ? 1 : 0, unaidedSuccesses: correct ? 1 : 0, lastAttemptAt: '', lastCorrectAt: '' } } } });
  return { progress, api, session, mount, click, submit, result };
}

describe('English course proof flow', () => {
  it('shows a loading status and no Continue control before the saved graph is ready', async () => {
    const f = fixture('gate'); let resolve!: (value: typeof graph) => void;
    state.loadQuestGraph.mockImplementationOnce(() => new Promise<typeof graph>(done => { resolve = done; }));
    const mounting = f.mount();
    await vi.waitFor(() => expect(state.loadQuestGraph).toHaveBeenCalled());
    expect(root.querySelector('[data-journey]')?.getAttribute('aria-busy')).toBe('true');
    expect(root.querySelector('#course-feedback')?.textContent).toBeTruthy();
    expect(root.querySelector('[data-action="next"]')).toBeNull();
    resolve(graph); await mounting;
    expect(root.querySelector('[name="answer"]')).not.toBeNull();
    expect(root.querySelector('[data-journey]')?.getAttribute('aria-busy')).toBe('false');
  });
  it('preserves fetched sentences when mounting the course picker', async () => {
    await mountCoursePicker(root, { token: 'token', selfId: 'player' } as Api);
    expect(getSentence(line.sentenceId)?.text).toBe(line.german);
  });
  it.each(['tr', 'de'] as const)('renders authored highlighting with %s support and English source language', async language => {
    await setBaseLanguage(language);
    const f = fixture(); await f.mount();
    const word = root.querySelector<HTMLButtonElement>('.sentence-word')!;
    expect(word.closest('[lang]')?.getAttribute('lang')).toBe('en');
    expect(word.getAttribute('aria-pressed')).toBe('false'); word.click();
    expect(document.querySelector('[role="tooltip"] mark')?.textContent).toBe(language === 'tr' ? 'Biletiniz' : 'Fahrkarte');
    expect(root.querySelector('.course-current-line')?.textContent).toBe('Your ticket, please.');
  });
  it('enables answer reveal only after a recorded attempt and uses recorded feedback', async () => {
    const f = fixture('gate'); f.api.request.mockResolvedValue(f.result(false)); await f.mount();
    const reveal = () => root.querySelector<HTMLButtonElement>('[data-action="reveal"]')!;
    expect(reveal().disabled).toBe(true); reveal().click(); expect(f.api.request).not.toHaveBeenCalled();
    expect(root.textContent).not.toContain('EMBEDDED ANSWER');
    f.submit('first try');
    expect(root.querySelector<HTMLInputElement>('[name="answer"]')!.disabled).toBe(true);
    await vi.waitFor(() => expect(reveal().disabled).toBe(false));
    expect(root.querySelector('.course-model-answer')).toBeNull();
    reveal().click(); await vi.waitFor(() => expect(root.querySelector('.course-model-answer p')?.textContent).toBe('Please say it again.'));
    f.click('[data-action="use-answer"]'); await vi.waitFor(() => expect(root.querySelector<HTMLInputElement>('[name="answer"]')!.value).toBe('Please say it again.'));
    expect(f.api.request).toHaveBeenCalledTimes(2);
    expect(f.api.request.mock.calls[1]).toEqual(['/attempt', { recover: true, exerciseId: 'request' }]);
    f.click('[data-action="reveal"]');
    await vi.waitFor(() => expect(root.querySelector('.course-model-answer')).toBeNull());
    expect(f.api.request).toHaveBeenCalledTimes(2);
    expect(root.querySelector<HTMLInputElement>('[name="answer"]')!.lang).toBe('en');
  });
  it('retries the complete immutable request after a lost response, despite later assistance and edits', async () => {
    const f = fixture('gate'); f.api.request.mockRejectedValueOnce(new Error('response lost')).mockResolvedValueOnce(f.result(false)); await f.mount();
    f.submit('original reply'); await vi.waitFor(() => expect(root.querySelector('#course-feedback')?.textContent).toBe('response lost'));
    const first = structuredClone(f.api.request.mock.calls[0]);
    expect(first[1]).toMatchObject({ answer: 'original reply', hinted: false, mode: 'production', questId: 'quest', sceneAttempt: true });
    // The pending receipt remains the retry body after the learner changes the form.
    f.submit('changed reply'); await vi.waitFor(() => expect(f.api.request).toHaveBeenCalledTimes(2));
    expect(f.api.request.mock.calls[1]).toEqual(first);
  });
  it('recovers reveal eligibility after reload without recording another graded attempt', async () => {
    const f = fixture('gate'); f.session.progress.exerciseStats.request = { attempts: 1, correct: 0, unaidedSuccesses: 0, lastAttemptAt: '', lastCorrectAt: '' };
    f.api.request.mockResolvedValueOnce(f.result(false)); await f.mount();
    f.click('[data-action="reveal"]'); await vi.waitFor(() => expect(root.querySelector('.course-model-answer p')).not.toBeNull());
    expect(f.api.request.mock.calls[0]).toEqual(['/attempt', { recover: true, exerciseId: 'request' }]);
  });
  it('restores a persisted node UUID directly into the gate instead of replaying locked intro sentences', async () => {
    const f = fixture('gate'), nodeId = '5844243e-d880-5fdd-a71f-65c61abb1048';
    f.session.progress.story!.nodes.quest = nodeId as 'gate';
    state.loadQuestGraph.mockResolvedValueOnce({ ...graph, nodes: graph.nodes.map(node => node.stage === 'gate' ? { ...node, id: nodeId } : node) });
    await f.mount();
    expect(root.querySelector('[name="answer"]')).not.toBeNull();
    expect(root.querySelector('.course-current-line')).toBeNull();
    expect(state.loadDialogueSentence).not.toHaveBeenCalled();
    expect(state.loadExercise).toHaveBeenCalledWith('request');
  });
  it('practices one restored lexical UUID and returns to the conversation without completing a unit', async () => {
    const f = fixture('complete'), exerciseId = 'b75bcd68-373f-5da3-af76-60f2609ba26a';
    Object.assign(state.collections.courseLexicon[0] as object, { itemId: 'ticket-item', exerciseIds: { production: exerciseId } });
    f.progress.intake = { version: 1, activeSeconds: 0, creditSeconds: 0, lastBeatAt: '', wordIds: ['ticket-word'] };
    const drill = { ...exercise, id: exerciseId, itemId: 'ticket-item', prompt: 'Write the English word for bilet.', kind: 'word', targetWordId: 'ticket-word' };
    state.loadExercise.mockResolvedValueOnce(drill);
    const unseen = { attempts: 0, correct: 0, unaidedSuccesses: 0, status: 'unseen' as const, dueAt: '', stabilityDays: 0 };
    const receipt = f.result(true, 'ticket');
    receipt.progress = { ...f.progress, exerciseStats: { [exerciseId]: { attempts: 1, correct: 1, unaidedSuccesses: 1, lastAttemptAt: '', lastCorrectAt: '' } }, words: { 'ticket-word': {
      wordId: 'ticket-word', stabilityDays: 1, difficulty: 5, repetitions: 1, lapses: 0, lastSeenAt: '2026-10-14T10:00:00Z', dueAt: '2026-10-15T10:00:00Z', modeStats: {}, exposures: 0, contextExposures: 0, directAttempts: 1, mastery: 'learning',
      evidence: { recognition: { ...unseen }, listening: { ...unseen }, production: { attempts: 1, correct: 1, unaidedSuccesses: 1, status: 'learning', dueAt: '2026-10-15T10:00:00Z', stabilityDays: 1 } },
    } } };
    f.api.request.mockResolvedValueOnce(receipt);
    await f.mount();
    expect(root.querySelector('.course-current-line')?.textContent).toBe(line.german);
    f.click('[data-word="ticket-word"]');
    await vi.waitFor(() => expect(root.querySelector('[name="answer"]')).not.toBeNull());
    expect(state.loadExercise).toHaveBeenCalledExactlyOnceWith(exerciseId);
    expect(state.loadUnit).not.toHaveBeenCalled();
    expect(root.querySelector<HTMLButtonElement>('[data-action="reveal"]')!.disabled).toBe(true);
    f.submit('ticket');
    await vi.waitFor(() => expect(root.querySelector('[data-action="next"]')).not.toBeNull());
    const input = f.api.request.mock.calls[0][1];
    expect(input).toMatchObject({ exerciseId, itemId: 'ticket-item', answer: 'ticket', mode: 'production', hinted: false });
    expect(input).not.toHaveProperty('questId'); expect(input).not.toHaveProperty('sceneAttempt');
    await vi.waitFor(() => expect(root.querySelector('.course-word-list .caption')?.textContent).toBe('1'));
    f.click('[data-action="next"]');
    await vi.waitFor(() => expect(root.querySelector('[name="answer"]')).toBeNull());
    expect(root.querySelector('.course-current-line')?.textContent).toBe(line.german);
    expect(f.api.completeUnit).not.toHaveBeenCalled(); expect(f.api.storyTransition).not.toHaveBeenCalled();
    expect(receipt.progress.words['ticket-word'].evidence.recognition.unaidedSuccesses).toBe(0);
    expect(receipt.progress.words['ticket-word'].evidence.production.unaidedSuccesses).toBe(1);
  });
  it('persists exact-answer assistance for the lexical drill after its first recorded attempt', async () => {
    const f = fixture('complete'), exerciseId = 'ticket-production';
    Object.assign(state.collections.courseLexicon[0] as object, { exerciseIds: { production: exerciseId } });
    f.progress.intake = { version: 1, activeSeconds: 0, creditSeconds: 0, lastBeatAt: '', wordIds: ['ticket-word'] };
    state.loadExercise.mockResolvedValueOnce({ ...exercise, id: exerciseId });
    f.api.request.mockResolvedValue({ ...f.result(false, 'ticket'), progress: { ...f.progress, exerciseStats: { [exerciseId]: { attempts: 1, correct: 0, unaidedSuccesses: 0, lastAttemptAt: '', lastCorrectAt: '' } } } });
    await f.mount(); f.click('[data-word="ticket-word"]');
    await vi.waitFor(() => expect(root.querySelector('[name="answer"]')).not.toBeNull());
    f.submit('my first try');
    await vi.waitFor(() => expect(root.querySelector<HTMLButtonElement>('[data-action="reveal"]')!.disabled).toBe(false));
    f.click('[data-action="reveal"]');
    await vi.waitFor(() => expect(root.querySelector('.course-model-answer p')?.textContent).toBe('ticket'));
    expect(f.api.request.mock.calls[1]).toEqual(['/attempt', { recover: true, exerciseId }]);
    f.submit('ticket');
    await vi.waitFor(() => expect(f.api.request).toHaveBeenCalledTimes(3));
    expect(f.api.request.mock.calls[2][1]).toMatchObject({ exerciseId, hinted: true });
    expect(f.api.request.mock.calls[2][1]).not.toHaveProperty('sceneAttempt');
  });
  it('disables controls during transitions, retries a transition receipt, then sends the authored choice ID', async () => {
    const f = fixture('gate'); f.api.request.mockResolvedValueOnce(f.result(true)); await f.mount();
    f.submit('Please say it again.'); await vi.waitFor(() => expect(root.querySelector('[data-action="next"]')).not.toBeNull());
    f.api.storyTransition.mockRejectedValueOnce(new Error('transition lost'));
    f.click('[data-action="next"]'); await vi.waitFor(() => expect(root.querySelector('#course-feedback')?.textContent).toBe('transition lost'));
    const first = structuredClone(f.api.storyTransition.mock.calls[0][0]);
    f.click('[data-action="next"]'); await vi.waitFor(() => expect(root.querySelector('[data-choice="finish-choice"]')).not.toBeNull());
    expect(f.api.storyTransition.mock.calls[1][0]).toEqual(first);
    f.click('[data-choice="finish-choice"]'); await vi.waitFor(() => expect(f.api.storyTransition).toHaveBeenCalledTimes(3));
    expect(f.api.storyTransition.mock.calls[2][0]).toMatchObject({ nodeId: 'choice', choiceId: 'finish-choice' });
  });
  it('ignores old attempt results when the course session changes', async () => {
    const f = fixture('gate'); let resolve!: (result: AttemptResult) => void;
    f.api.request.mockImplementationOnce(() => new Promise<AttemptResult>(done => { resolve = done; })); await f.mount();
    f.submit('first try'); root.dispatchEvent(new CustomEvent('course-session-changing', { bubbles: true }));
    resolve(f.result(false, 'OLD COURSE ANSWER')); await Promise.resolve(); await Promise.resolve();
    expect(root.textContent).not.toContain('OLD COURSE ANSWER');
    expect(root.querySelector<HTMLInputElement>('[name="answer"]')!.disabled).toBe(true);
  });
  it('credits visible trial play and stops the heartbeat on switching or unmount', async () => {
    vi.useFakeTimers(); vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    const f = fixture('gate'), heartbeat = vi.fn().mockResolvedValue({ access: {} });
    Object.assign(f.api, { accessHeartbeat: heartbeat }); await f.mount();
    expect(heartbeat).toHaveBeenCalledWith(true);
    await vi.advanceTimersByTimeAsync(20000); expect(heartbeat).toHaveBeenCalledTimes(2);
    root.dispatchEvent(new CustomEvent('course-session-changing', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(20000); expect(heartbeat).toHaveBeenCalledTimes(2);
    root.dispatchEvent(new CustomEvent('course-session-restored', { bubbles: true }));
    expect(heartbeat).toHaveBeenCalledTimes(3);
    root.remove(); await Promise.resolve(); await vi.advanceTimersByTimeAsync(20000);
    expect(heartbeat).toHaveBeenCalledTimes(3);
  });
  it('marks play inactive while the account dialog is open and resumes immediately when it closes', async () => {
    vi.useFakeTimers(); vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    const f = fixture('gate'), heartbeat = vi.fn().mockResolvedValue({ access: {} });
    Object.assign(f.api, { accessHeartbeat: heartbeat });
    const dialog = document.createElement('dialog'); dialog.id = 'account-dialog'; document.body.append(dialog);
    await mountCoursePlayer(root, { api: f.api as unknown as Api, session: f.session, isActive: () => !document.hidden && !dialog.open });
    expect(heartbeat.mock.calls.at(-1)).toEqual([true]);
    dialog.setAttribute('open', ''); await Promise.resolve();
    expect(heartbeat.mock.calls.at(-1)).toEqual([false]);
    await vi.advanceTimersByTimeAsync(20000); expect(heartbeat.mock.calls.at(-1)).toEqual([false]);
    dialog.removeAttribute('open'); await Promise.resolve();
    expect(heartbeat.mock.calls.at(-1)).toEqual([true]);
    expect(heartbeat.mock.calls.map(([active]) => active)).toEqual([true, false, false, true]);
  });
});
