import { contentApi, type ContentCourse } from './content-api';
import { activeCourse, loadDialogueSentence, loadExercise, loadQuestGraph, loadRestoredWords, loadUnit, runtimeArray, runtimeReference } from './content-runtime';
import { baseLanguage, baseLanguageNames, isBaseLanguage, setBaseLanguage, t } from './i18n';
import { escapeHtml as e } from './icons';
import { renderTranslatedSentence } from './translated-sentence';
import type { Api, AttemptResult, Progress, SessionResult } from './api';
import type { Quest, Exercise, NPC } from './content';
import type { CourseLexeme, CourseUnit } from './course';
import type { DialogueLine, DialogueNode, DialogueChoice, QuestGraph, StoryStage } from './dialogue';
import './course-player.css';

/** ContentRuntime has already configured the session, including content version. */
export async function mountCoursePicker(root: HTMLElement, api: Api): Promise<void> {
  const token = api.token;
  const response = await contentApi.courses<{ courses: ContentCourse[] }>();
  if (!root.isConnected || token !== api.token) return;
  const courses: ContentCourse[] = Array.isArray(response) ? response as ContentCourse[] : response.courses;
  if (!courses?.length) return;
  root.innerHTML = `<div class="course-picker"><label>${e(t('Choose a course'))}<select name="course">${courses.map(course => `<option value="${e(course.id)}" ${course.id === activeCourse?.id ? 'selected' : ''}>${e(course.title)}</option>`).join('')}</select></label><label>${e(t('I speak'))}<select name="support"></select></label><button type="button" class="outline-button">${e(t('Switch course'))}</button><p role="status"></p></div>`;
  const choice = root.querySelector<HTMLSelectElement>('[name="course"]')!, support = root.querySelector<HTMLSelectElement>('[name="support"]')!, status = root.querySelector<HTMLElement>('[role="status"]')!;
  const update = () => {
    const course = courses.find(course => course.id === choice.value); if (!course) return;
    support.innerHTML = course.supportLanguages.map(language => `<option value="${e(language)}" ${language === baseLanguage() ? 'selected' : ''}>${e(isBaseLanguage(language) ? baseLanguageNames[language] : language)}</option>`).join('');
  };
  choice.onchange = update; update();
  root.querySelector<HTMLButtonElement>('button')!.onclick = async event => {
    const button = event.currentTarget as HTMLButtonElement;
    const courseId = choice.value, language = support.value;
    if (courseId === activeCourse?.id && language === baseLanguage()) return;
    button.disabled = choice.disabled = support.disabled = true; status.textContent = t('Saving…');
    root.dispatchEvent(new CustomEvent('course-session-changing', { bubbles: true }));
    try {
      await contentApi.activate(courseId, language);
      if (isBaseLanguage(language)) await setBaseLanguage(language);
      location.reload();
    } catch (error) {
      if (!root.isConnected) return;
      status.textContent = error instanceof Error ? error.message : String(error);
      button.disabled = choice.disabled = support.disabled = false;
      root.dispatchEvent(new CustomEvent('course-session-restored', { bubbles: true }));
    }
  };
}

type AttemptInput = Readonly<{ id: string; exerciseId: string; itemId: string; answer: string; responseTimeMs: number; mode: 'production'; hinted: boolean; questId?: string; sceneAttempt?: true }>;
type TransitionInput = Parameters<Api['storyTransition']>[0];

/** The shared graph, authoring ranges and grading API drive every target language. */
export async function mountCoursePlayer(root: HTMLElement, options: { api: Api; session: SessionResult; isActive?: () => boolean; onAccessRequired?: () => void; onAccount?: () => void; onLogout?: () => void | Promise<void> }): Promise<void> {
  const course = activeCourse!;
  if (!course) throw new Error('No active course is loaded.');
  const token = options.api.token;
  let progress = options.session.progress, graph: QuestGraph | undefined, node: DialogueNode | undefined, index = 0;
  let line: DialogueLine | undefined, exercise: Exercise | undefined, choices: DialogueChoice[] = [];
  let busy = false, hinted = false, feedback = '', generation = 0, operation = 0, wordsGeneration = 0, switching = false;
  let typed = '', recordedAnswer: string | undefined, answerShown = false, pendingAttempt: AttemptInput | undefined;
  let pendingTransition: { key: string; input: TransitionInput } | undefined;
  let startedAt = performance.now(), proof: string | undefined, practiceUnit: CourseUnit | undefined, practiceIndex = 0;
  let practiceWord: CourseLexeme | undefined;
  let wordReturn: { line?: DialogueLine; exercise?: Exercise; choices: DialogueChoice[]; proof?: string; hinted: boolean; typed: string; recordedAnswer?: string; answerShown: boolean; pendingAttempt?: AttemptInput; practiceUnit?: CourseUnit; practiceIndex: number } | undefined;
  let replay = false;
  root.innerHTML = `<header class="course-player-heading"><span>THE LANTERN ATLAS</span><h1>${e(course.title)}</h1><div class="course-account-actions">${options.onAccount ? `<button type="button" class="text-button" data-account>${e(options.session.account?.registered ? t('Account') : t('Save my adventure'))}</button>` : ''}${options.onLogout ? `<button type="button" class="text-button" data-logout>${e(t('Log out'))}</button>` : ''}</div><div data-picker></div></header><section data-journey></section><section data-words></section>`;
  root.querySelector<HTMLButtonElement>('[data-account]')?.addEventListener('click', () => options.onAccount?.());
  root.querySelector<HTMLButtonElement>('[data-logout]')?.addEventListener('click', () => { void options.onLogout?.(); });
  const journey = root.querySelector<HTMLElement>('[data-journey]')!, words = root.querySelector<HTMLElement>('[data-words]')!;
  const live = () => root.isConnected && !switching && options.api.token === token && activeCourse?.id === course.id;
  const current = (epoch: number) => live() && generation === epoch;
  let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  let heartbeatBlocked = false;
  let lastActivity: boolean | undefined;
  const playActive = () => options.isActive?.() ?? (!document.hidden && !document.querySelector<HTMLDialogElement>('#account-dialog')?.open);
  const heartbeat = () => {
    if (!live() || heartbeatBlocked || typeof options.api.accessHeartbeat !== 'function') return;
    const active = playActive(); lastActivity = active;
    void options.api.accessHeartbeat(active).catch(error => {
      if (live() && error && typeof error === 'object' && 'status' in error && error.status === 403) { heartbeatBlocked = true; stopHeartbeat(); options.onAccessRequired?.(); }
    });
  };
  const startHeartbeat = () => { if (heartbeatTimer === undefined) { heartbeat(); heartbeatTimer = setInterval(heartbeat, 20000); } };
  const stopHeartbeat = () => { if (heartbeatTimer !== undefined) clearInterval(heartbeatTimer); heartbeatTimer = undefined; };
  const cleanupHeartbeat = () => { stopHeartbeat(); heartbeatObserver.disconnect(); document.removeEventListener('visibilitychange', heartbeat); window.removeEventListener('beforeunload', cleanupHeartbeat); };
  const heartbeatObserver = new MutationObserver(() => {
    if (!root.isConnected || !journey.isConnected || options.api.token !== token || activeCourse?.id !== course.id) { cleanupHeartbeat(); return; }
    if (live() && lastActivity !== playActive()) heartbeat();
  });
  heartbeatObserver.observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['open', 'hidden'] });
  document.addEventListener('visibilitychange', heartbeat); window.addEventListener('beforeunload', cleanupHeartbeat);
  startHeartbeat();
  const attempted = () => !!exercise && (recordedAnswer !== undefined || (progress.exerciseStats[exercise.id]?.attempts ?? 0) > 0);
  const atEnd = () => !node?.lines.length || index === node.lines.length - 1;
  const practicing = () => !!practiceUnit || !!practiceWord;
  const gate = () => practicing() || (!replay && node?.stage === 'gate' && atEnd());
  const accept = (next: Progress) => { progress = next; void refreshWords().catch(error => { if (live()) { feedback = error instanceof Error ? error.message : String(error); render(); } }); };

  async function refreshWords() {
    const epoch = ++wordsGeneration, snapshot = progress;
    await loadRestoredWords(snapshot);
    if (!live() || epoch !== wordsGeneration) return;
    const restored = new Set([...Object.keys(snapshot.words), ...(snapshot.intake?.wordIds ?? [])]);
    const lexicon = runtimeArray<CourseLexeme>('courseLexicon').filter(word => restored.has(word.id));
    words.innerHTML = `<h2>${e(t('Restored words'))}</h2><div class="course-word-list">${lexicon.map(word => `<article><strong lang="${e(course.target)}">${e(word.lemma)}</strong><p lang="${e(baseLanguage())}">${e(word.english)}</p><small>${e(String(snapshot.words[word.id]?.directAttempts ?? 0))}</small><button type="button" class="outline-button" data-word="${e(word.id)}" ${runtimeReference('exercise', word.id, 'production') ? '' : 'disabled'}>${e(t('Practice'))}</button></article>`).join('')}</div>`;
  }
  function speak(text: string) {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const language = typeof course!.voice === 'string' ? course!.voice : course!.target;
    const utterance = new SpeechSynthesisUtterance(text); utterance.lang = language;
    const voices = window.speechSynthesis.getVoices();
    utterance.voice = voices.find(voice => voice.lang === language) ?? voices.find(voice => voice.lang.startsWith(course!.target)) ?? null;
    utterance.rate = .82; window.speechSynthesis.speak(utterance);
  }
  function render() {
    if (!root.isConnected) return;
    const focused = journey.contains(document.activeElement) ? document.activeElement as HTMLElement : undefined;
    const focusedAction = focused?.dataset.action, focusedAnswer = focused?.getAttribute('name') === 'answer';
    const source = line ? renderTranslatedSentence(line, options.session.player.name) : '';
    const speaker = line ? runtimeArray<NPC>('npcs').find(npc => npc.id === line!.speaker)?.name ?? line.speaker : '';
    const canAdvance = practicing() ? !!proof : !!node && (node.terminal || !gate() || !!proof);
    const status = feedback || (busy && !node ? t('Saving…') : '');
    journey.setAttribute('aria-busy', String(busy));
    journey.innerHTML = `<div class="course-player-progress"><span>${progress.xp} XP</span>${line ? `<span>${index + 1} / ${node?.lines.length || 1}</span>` : ''}</div>${line ? `<h2>${e(speaker)}</h2><p class="course-current-line">${source}</p><button type="button" class="text-button" data-action="listen" ${busy ? 'disabled' : ''}>${e(t('Listen again'))}</button>` : ''}${gate() && exercise ? `<form data-answer-form><label for="course-answer">${e(exercise.prompt)}</label><input id="course-answer" name="answer" lang="${e(course!.target)}" autocomplete="off" autocapitalize="off" spellcheck="false" required maxlength="240" aria-describedby="course-feedback" value="${e(typed)}" ${busy ? 'disabled' : ''}><button class="primary-button" type="submit" ${busy ? 'disabled' : ''}>${e(busy ? t('Saving…') : t('Check answer'))}</button><button type="button" class="text-button" data-action="reveal" aria-expanded="${answerShown}" ${attempted() && !busy ? '' : 'disabled'}>${e(answerShown ? t('Hide exact answer') : t('Show exact answer'))}</button>${attempted() ? '' : `<small>${e(t('Make your first attempt to unlock the answer.'))}</small>`}</form>${answerShown && recordedAnswer !== undefined ? `<aside class="course-model-answer"><strong>${e(t('Exact answer'))}</strong><p lang="${e(course!.target)}">${e(recordedAnswer)}</p><button type="button" data-action="use-answer" ${busy ? 'disabled' : ''}>${e(t('Use this answer'))}</button><small>${e(t('You can use this reply to continue. This counts as assisted practice.'))}</small></aside>` : ''}` : ''}<p id="course-feedback" role="status">${e(status)}</p>${choices.length ? `<div class="course-choices">${choices.map(choice => `<article>${renderTranslatedSentence(choice, options.session.player.name)}<button type="button" class="outline-button" data-choice="${e(choice.id)}" ${busy ? 'disabled' : ''}>${e(t('Say it'))}</button></article>`).join('')}</div>` : canAdvance ? `<button type="button" class="primary-button" data-action="next" ${busy ? 'disabled' : ''}>${e(t('Continue'))}</button>` : ''}${node?.terminal || practiceUnit ? runtimeArray<CourseUnit>('courseUnits').map(unit => `<button type="button" class="outline-button" data-unit="${e(unit.id)}" ${busy ? 'disabled' : ''}>${e(unit.title)}</button>`).join('') : ''}`;
    if (focusedAnswer) journey.querySelector<HTMLInputElement>('[name="answer"]')?.focus();
    else if (focusedAction) journey.querySelector<HTMLButtonElement>(`[data-action="${focusedAction}"]`)?.focus();
  }
  function resetExercise() { typed = ''; recordedAnswer = undefined; answerShown = false; pendingAttempt = undefined; proof = undefined; startedAt = performance.now(); }
  async function prepare() {
    const epoch = ++generation; line = undefined; choices = []; exercise = undefined; resetExercise(); feedback = '';
    const reference = node?.lines[index];
    const loadedLine = reference ? await loadDialogueSentence(reference) : undefined;
    if (!current(epoch)) return;
    line = loadedLine;
    if (!replay && node?.stage === 'gate' && atEnd() && graph) {
      const loadedExercise = await loadExercise(graph.gateExerciseId); if (!current(epoch)) return; exercise = loadedExercise;
    }
    if (atEnd() && node?.choices?.length) {
      const loadedChoices = await Promise.all(node.choices.map(async choice => {
        const sentence = await loadDialogueSentence({ ...choice, speaker: '', clipId: '' });
        return { ...choice, german: sentence.german, english: sentence.english };
      }));
      if (!current(epoch)) return; choices = loadedChoices;
    }
    const nextLine = node?.lines[index + 1];
    if (nextLine) void loadDialogueSentence(nextLine).catch(() => {});
  }
  async function transition(stage: StoryStage, extra: { attemptId?: string; choiceId?: string } = {}) {
    const epoch = generation, key = JSON.stringify([graph!.questId, stage, extra]);
    const nodeId = node?.stage === stage ? node.id : graph!.nodes.find(node => node.stage === stage)?.id ?? stage;
    if (pendingTransition?.key !== key) pendingTransition = { key, input: Object.freeze({ id: crypto.randomUUID(), questId: graph!.questId, nodeId, ...extra }) };
    const result = await options.api.storyTransition(pendingTransition.input);
    if (!current(epoch)) return false;
    pendingTransition = undefined; accept(result.progress); return true;
  }
  async function next(choiceId?: string) {
    if (practiceWord) {
      if (!proof) return;
      practiceWord = undefined; generation++;
      if (wordReturn) {
        ({ line, exercise, choices, proof, hinted, typed, recordedAnswer, answerShown, pendingAttempt, practiceUnit, practiceIndex } = wordReturn);
        wordReturn = undefined; feedback = ''; startedAt = performance.now();
      } else await prepare();
      return;
    }
    if (practiceUnit) {
      if (!proof) return;
      if (practiceIndex + 1 < practiceUnit.exerciseIds.length) {
        const epoch = ++generation, nextIndex = practiceIndex + 1;
        const loaded = await loadExercise(practiceUnit.exerciseIds[nextIndex]); if (!current(epoch)) return;
        practiceIndex = nextIndex; exercise = loaded; hinted = false; resetExercise(); feedback = ''; return;
      }
      const epoch = generation, result = await options.api.completeUnit(practiceUnit.id);
      if (!current(epoch)) return; accept(result.progress); practiceUnit = undefined; exercise = undefined; resetExercise(); return;
    }
    if (!graph || !node) return;
    if (index + 1 < node.lines.length) { index++; await prepare(); return; }
    if (node.terminal) { replay = true; index = 0; node = graph.nodes.find(node => node.id === graph!.start); hinted = false; await prepare(); return; }
    const choice = choiceId ? node.choices?.find(choice => choice.id === choiceId) : undefined;
    if (node.choices?.length && !choice) return;
    if (!replay) {
      if (node.stage === 'intro' && !await transition('intro')) return;
      if (node.stage === 'gate' && (!proof || !await transition('gate', { attemptId: proof }))) return;
      if (node.stage === 'choice' && !await transition('choice', { choiceId })) return;
    }
    const destination = choice?.next ?? node.next;
    const nextNode = graph.nodes.find(nextNode => nextNode.id === destination);
    if (!nextNode) return;
    node = nextNode; index = 0; await prepare();
  }
  async function reveal() {
    if (!exercise || !attempted()) return;
    if (answerShown) { answerShown = false; return; }
    const epoch = generation;
    const result = await options.api.request<AttemptResult>('/attempt', { recover: true, exerciseId: exercise.id });
    if (!current(epoch)) return; recordedAnswer = result.correctedAnswer; accept(result.progress);
    hinted = true; answerShown = true;
    void options.api.expose({ exerciseId: exercise.id }).catch(() => {});
  }
  async function practice(id: string) {
    const epoch = ++generation, unit = await loadUnit(id); if (!current(epoch)) return;
    if (!unit.exerciseIds.length) return;
    const loaded = await loadExercise(unit.exerciseIds[0]); if (!current(epoch)) return;
    practiceWord = undefined; wordReturn = undefined;
    practiceUnit = unit; practiceIndex = 0; line = undefined; choices = []; exercise = loaded; hinted = false; resetExercise(); feedback = '';
  }
  async function practiceRestoredWord(id: string) {
    const word = runtimeArray<CourseLexeme>('courseLexicon').find(word => word.id === id);
    const exerciseId = runtimeReference('exercise', id, 'production'); if (!word || !exerciseId) return;
    const epoch = ++generation, loaded = await loadExercise(exerciseId); if (!current(epoch)) return;
    if (!practiceWord) wordReturn = { line, exercise, choices, proof, hinted, typed, recordedAnswer, answerShown, pendingAttempt, practiceUnit, practiceIndex };
    practiceWord = word; practiceUnit = undefined; line = undefined; choices = []; exercise = loaded; hinted = false; resetExercise(); feedback = '';
  }
  function perform(work: () => Promise<void>) {
    if (busy || !live()) return;
    const id = ++operation; busy = true; render();
    void work().catch(error => { if (live() && id === operation) feedback = error instanceof Error ? error.message : String(error); }).finally(() => {
      if (!live() || id !== operation) return; busy = false; render();
    });
  }
  root.addEventListener('course-session-changing', () => { switching = true; generation++; operation++; busy = true; stopHeartbeat(); render(); });
  root.addEventListener('course-session-restored', () => { switching = false; busy = false; startHeartbeat(); render(); });
  journey.addEventListener('input', event => { if (event.target instanceof HTMLInputElement && event.target.name === 'answer') typed = event.target.value; });
  words.addEventListener('click', event => {
    const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('[data-word]') : null;
    if (!button || button.disabled || !button.dataset.word) return;
    perform(() => practiceRestoredWord(button.dataset.word!));
  });
  journey.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-action],[data-unit],[data-choice],[data-sentence-word-index]') : null;
    if (!target || target instanceof HTMLButtonElement && target.disabled) return;
    if (target.hasAttribute('data-sentence-word-index')) {
      hinted = true; if (exercise) void options.api.expose({ exerciseId: exercise.id }).catch(() => {}); return;
    }
    const action = target.dataset.action;
    perform(async () => {
      if (action === 'listen' && line) speak(line.german);
      if (action === 'next' || target.dataset.choice) await next(target.dataset.choice);
      if (action === 'reveal') await reveal();
      if (action === 'use-answer' && recordedAnswer !== undefined) { typed = recordedAnswer; hinted = true; }
      if (target.dataset.unit) await practice(target.dataset.unit);
    });
  });
  journey.addEventListener('submit', event => {
    if (!(event.target instanceof HTMLFormElement)) return; event.preventDefault();
    if (busy || !exercise || !live()) return;
    const submitted = String(new FormData(event.target).get('answer') ?? '').trim(); if (!submitted) return;
    typed = submitted;
    const epoch = generation;
    pendingAttempt ??= Object.freeze({ id: crypto.randomUUID(), exerciseId: exercise.id, itemId: exercise.itemId, answer: submitted, responseTimeMs: Math.max(0, Math.min(600000, Math.round(performance.now() - startedAt))), mode: 'production', hinted, ...(practicing() ? {} : { questId: graph!.questId, sceneAttempt: true as const }) });
    const input = pendingAttempt;
    perform(async () => {
      const result = await options.api.request<AttemptResult>('/attempt', input);
      if (!current(epoch)) return;
      pendingAttempt = undefined; accept(result.progress); recordedAnswer = result.correctedAnswer; feedback = result.reason;
      if (result.correct) proof = result.attemptId || input.id;
    });
  });
  busy = true; render();
  try {
    await mountCoursePicker(root.querySelector<HTMLElement>('[data-picker]')!, options.api);
    if (!live()) return;
    await refreshWords(); if (!live()) return;
    const quest = runtimeArray<Quest>('quests').find(quest => !progress.completedQuestIds.includes(quest.id)) ?? runtimeArray<Quest>('quests')[0];
    if (!quest) { feedback = t('No conversations are available.'); return; }
    graph = await loadQuestGraph(quest.id); if (!live() || !graph) return;
    replay = progress.completedQuestIds.includes(graph.questId);
    const stage = replay ? 'intro' : progress.story?.nodes[graph.questId] ?? 'intro';
    node = graph.nodes.find(node => node.id === stage || node.stage === stage) ?? graph.nodes[0];
    await prepare();
  } catch (error) { if (live()) feedback = error instanceof Error ? error.message : String(error); }
  finally { if (live()) { busy = false; render(); } }
}
