import type { Api, AttemptResult, Progress, StoryResult } from './api';
import { quests, npcs, type NPC, type Level, type Exercise } from './content';
import { canVoiceDialogue, conditionMet, dialogueChoices, dialogueLines, dialogueTopics, nodeForStage, storyState, type DialogueEffect, type DialogueNode, type DialogueLine, type DialogueChoice, type QuestGraph } from './dialogue';
import { DialogueView } from './dialogue-view';
import { questGraph } from './quest-graph';
import { localized, localizedExercise, t } from './i18n';
import { residentConversation, earnedTitleGreeting } from './npc-dialogue';
import { lanternRewards } from './lantern-rewards';
import { grammarForQuest, type ContextualGrammar } from './contextual-grammar';
import { beginnerGateChoices, beginnerReplyMeaning, needsBeginnerStorySupport } from './beginner-dialogue';


export interface QuestControllerOptions {
  api: Pick<Api, 'request' | 'storyTransition' | 'inspectStory'> & Partial<Pick<Api, 'story'>>;
  loadGraph?(questId: string): Promise<QuestGraph | undefined>;
  loadSentence?(line: DialogueLine): Promise<DialogueLine>;
  loadExercise?(exerciseId: string): Promise<Exercise>;
  progress(): Progress;
  playerName(): string;
  portrait(id: string, expression?: string): string;
  speak(text: string, speaker: string, clipId: string, rate?: number): void;
  audioEnabled(): boolean;
  beginnerMode?(): boolean;
  setAudioEnabled(enabled: boolean): void;
  glosses?(text: string): Record<string, string> | undefined;
  prepareLine?(line: DialogueLine): DialogueLine;
  grammar?(questId:string): ContextualGrammar | undefined;
  wasHinted?(questId:string): boolean;
  stopSpeech(): void;
  onOpen(speaker: string): void;
  onClose(): void;
  onProgress(progress: Progress): void;
  onInvestigate(graph: QuestGraph): void;
  onComplete(graph: QuestGraph, xpAdded: number, effects?: readonly DialogueEffect[]): void;
  expose(exerciseId: string): void;
  onPractice?(npcId: string): void;
  /** Rounds this character can start now, best first. */
  games?(npcId: string): readonly { id: string; title: string }[];
  onGame?(gameId: string): void;
  onGrammarGuide?(guideId:string): void;
}

interface SceneAttemptInput {
  id: string;
  itemId: string;
  exerciseId: string;
  answer: string;
  hinted: boolean;
  mode: 'recognition' | 'production';
  questId: string;
  sceneAttempt: true;
  guidedChoice?: true;
  responseTimeMs: number;
}

/** Owns the scene cursor; authoritative effects are returned by the server. */
export class QuestController {
  private view: DialogueView;
  private graph?: QuestGraph;
  private node?: DialogueNode;
  private index = 0;
  private hinted = false;
  private translated = false;
  private translationLine = '';
  private wordlight = false;
  private grammarShown = false;
  private answerShown = false;
  private busy = false;
  private replay = false;
  private beginner = false;
  private error = '';
  private artifact?: { objectId: string; german: string; english: string; locked?: boolean };
  private pending?: { id: string; key: string; attempt?: Readonly<SceneAttemptInput> };
  private generation = 0;
  private startedAt = 0;
  private gateProof?: string;
  private replyCorrection?: DialogueLine;
  private topic?: { id: string; lines: DialogueLine[]; returnTo: number };
  private ambient?: { npc: NPC; lines: ReturnType<typeof residentConversation> };
  private loadedLines = new Map<string, DialogueLine>();
  private loadedExercises = new Map<string, Exercise>();
  private loading = new Map<string, { rerender: boolean; voice: boolean; rate?: number }>();
  private exactAnswers = new Map<string, string>();
  constructor(private options: QuestControllerOptions) {
    this.view = new DialogueView({ action: action => void this.action(action), choice: id => void this.choose(id), answer: answer => void this.answer(answer), gloss: () => { this.translated = true; this.hint(); this.render(); } });
  }
  get isOpen(): boolean { return !this.view.host.hidden; }
  /** The delegated sentence tooltip reports assistance without replacing its DOM. */
  recordWordHelp(): void { this.hint(); }
  refreshAudio() { if (this.isOpen) this.render(); }
  async open(questId: string): Promise<void> {
    const generation = ++this.generation;
    this.view.close(); this.graph = undefined; this.node = undefined;
    this.loadedLines.clear(); this.loadedExercises.clear(); this.loading.clear(); this.exactAnswers.clear();
    const graph = this.options.loadGraph ? await this.options.loadGraph(questId) : questGraph(questId);
    if (!graph || generation !== this.generation) return;
    this.topic = undefined; this.graph = graph; this.replay = this.options.progress().completedQuestIds.includes(questId); this.answerShown = false; this.replyCorrection = undefined;
    // Keep an open conversation in the same format when learning evidence changes.
    this.beginner = this.options.beginnerMode?.() ?? needsBeginnerStorySupport(this.options.progress());
    this.ambient = undefined;
    this.hinted = this.beginner || (this.options.wasHinted?.(questId)??false); this.translated = false; this.grammarShown = false; this.error = ''; this.artifact = undefined; this.pending = undefined; this.busy = false; this.gateProof = undefined;
    const state = storyState(this.options.progress().story), stage = this.replay ? 'intro' : state.nodes[questId] ?? 'intro';
    this.node = nodeForStage(graph, stage); this.index = 0;
    this.options.onOpen(quests.find(q => q.id === questId)?.npcId ?? '');
    const repliesDone = graph.nodes.flatMap(node => node.lines).every(line => !line.reply || state.flags[`reply:${line.reply.exerciseId}`]);
    if (!this.replay && stage === 'intro' && this.allInspected() && repliesDone) {
      await this.transition('intro');
      if (generation !== this.generation || this.graph !== graph) return;
      if (this.error) this.index = dialogueLines(this.node!,state).length-1;
      else this.node = nodeForStage(graph, 'gate');
    }
    this.startedAt = performance.now(); this.render(true);
  }
  async inspect(questId: string, objectId: string): Promise<boolean> {
    const generation = ++this.generation;
    this.view.close();
    const graph = this.options.loadGraph ? await this.options.loadGraph(questId) : questGraph(questId), artifact = graph?.investigations.find(item => item.objectId === objectId);
    if (generation !== this.generation) return false;
    if (!graph || !artifact) return false;
    // A locked door explains what opens it; nothing is recorded until it opens.
    const locked = artifact.lock && !conditionMet(artifact.lock.condition, storyState(this.options.progress().story)) ? artifact.lock : undefined;
    this.topic = undefined; this.replyCorrection = undefined; this.ambient = undefined; this.graph = graph; this.node = undefined; this.index = 0; this.answerShown = false;
    this.artifact = locked ? { objectId: artifact.objectId, german: locked.reason.german ?? '', english: locked.reason.english, locked: true } : artifact;
    this.beginner = this.options.beginnerMode?.() ?? needsBeginnerStorySupport(this.options.progress());
    this.translated = false; this.hinted = false; this.busy = false; this.error = ''; this.pending = undefined;
    this.replay = (this.options.progress().story?.inspections?.[questId] ?? []).includes(objectId) || this.options.progress().completedQuestIds.includes(questId);
    this.options.onOpen(''); this.view.host.classList.add('investigation-artifact'); this.render(true); return true;
  }
  greet(npc: NPC, level: Level) {
    this.generation++; this.topic = undefined; this.replyCorrection = undefined; this.graph = undefined; this.node = undefined; this.artifact = undefined; this.answerShown = false;
    this.ambient = { npc, lines: residentConversation(npc, level, storyState(this.options.progress().story)) };
    this.beginner = this.options.beginnerMode?.() ?? needsBeginnerStorySupport(this.options.progress());
    const greeting = earnedTitleGreeting(npc,lanternRewards(this.options.progress()).title);
    if (greeting) this.ambient.lines.unshift(greeting);
    this.index = 0; this.translated = false; this.error = ''; this.busy = false; this.render(true);
  }
  /** A character who hosts a round offers it as the conversation closes. */
  private gameChoices(npcId: string): DialogueChoice[] {
    const lines = ['Spielen wir eine Runde!', 'Noch ein Spiel, bitte!'];
    return (this.options.games?.(npcId) ?? []).slice(0, 2).map((game, index) => ({ id: `game:${game.id}`, german: lines[index], english: t('Play {game}', { game: game.title }), next: '', effects: [] }));
  }
  private allInspected() {
    return this.graph!.investigations.every(item => (this.options.progress().story?.inspections?.[this.graph!.questId] ?? []).includes(item.objectId));
  }
  private hint() { this.hinted = true; if (this.graph && !this.replay) this.options.expose(this.graph.gateExerciseId); }
  private translationVisible(line: DialogueLine): boolean {
    const key = JSON.stringify([line.id, line.clipId, line.german, line.english, this.options.playerName()]);
    // Each newly displayed line starts without a meaning, including corrections and simpler variants.
    if (this.translationLine !== key) this.translated = false;
    this.translationLine = key;
    return this.translated;
  }
  private load(key: string, run: () => Promise<unknown>, rerender = true, voice = false, rate?: number): void {
    const pending = this.loading.get(key);
    if (pending) {
      // Continue may reach a line before its speculative request finishes.
      if (rerender) Object.assign(pending, { rerender, voice, rate });
      return;
    }
    const generation = this.generation;
    const request = { rerender, voice, rate };
    this.loading.set(key, request);
    void run().catch(error => {
      if (request.rerender && generation === this.generation && !(error instanceof DOMException && error.name === 'AbortError')) this.error = error instanceof Error ? error.message : t('The route could not save. Try again.');
    }).finally(() => {
      if (generation !== this.generation) return;
      this.loading.delete(key);
      if (request.rerender) this.render(request.voice, request.rate);
    });
  }
  private line(source: DialogueLine, voice = false, rate?: number): DialogueLine | undefined {
    if (!this.options.loadSentence) return source;
    const loaded = this.loadedLines.get(source.id);
    if (loaded) return loaded;
    if (this.error) return source;
    const generation = this.generation;
    this.load(`sentence:${source.id}`, async () => { const line = await this.options.loadSentence!(source); if (generation === this.generation) this.loadedLines.set(source.id, line); }, true, voice, rate);
    return undefined;
  }
  private exercise(id: string): Exercise | undefined {
    if (!this.options.loadExercise) return quests.flatMap(quest => quest.exercises).find(exercise => exercise.id === id);
    const loaded = this.loadedExercises.get(id);
    if (loaded) return loaded;
    if (this.error) return undefined;
    const generation = this.generation;
    this.load(`exercise:${id}`, async () => { const exercise = await this.options.loadExercise!(id); if (generation === this.generation) this.loadedExercises.set(id, exercise); });
    return undefined;
  }
  private async recoverAnswer(id: string): Promise<void> {
    if (!this.exactAnswers.has(id) && !this.options.progress().exerciseStats[id]?.attempts) return;
    const generation = this.generation;
    const result = await this.options.api.request<AttemptResult>('/attempt', { recover: true, exerciseId: id });
    if (generation !== this.generation) return;
    this.options.onProgress(result.progress);
    if (result.correctedAnswer) this.exactAnswers.set(id, result.correctedAnswer);
  }
  private hydrateChoices(rows: DialogueChoice[]): { choices: DialogueChoice[]; loading: boolean } {
    let loading = false;
    const choices = rows.map(choice => {
      if (!this.options.loadSentence || !('sentenceId' in choice)) return choice;
      const line = this.line({ ...choice, speaker: '', clipId: '' });
      if (!line) { loading = true; return choice; }
      return { ...choice, german: line.german, english: line.english };
    });
    return { choices, loading };
  }
  private speakLine(line: Pick<DialogueLine, 'german' | 'speaker' | 'clipId' | 'audioRequires'>, rate?: number) {
    if (!canVoiceDialogue(line.german, line.audioRequires)) { this.options.stopSpeech(); return; }
    if (this.options.audioEnabled()) this.options.speak(line.german, line.speaker, line.clipId, rate);
  }
  private render(voice = false, rate?: number, focusGate = voice) {
    const powers = lanternRewards(this.options.progress());
    const audioEnabled = this.options.audioEnabled();
    if (this.ambient) {
      const { npc, lines } = this.ambient, source = this.line(lines[this.index], voice, rate), atEnd = this.index === lines.length - 1;
      if (!source) return;
      const line = { ...(this.options.prepareLine?.(source) ?? source), audioRequires: source.audioRequires || !canVoiceDialogue(source.german) };
      this.view.render({ audioEnabled, title: t('A CONVERSATION IN THE TOWN'), line, name: this.options.playerName(), npc, portrait: this.options.portrait(npc.id,line.expression ?? 'neutral'), index:this.index,total:lines.length,help:this.translationVisible(line),busy:false,glosses:this.options.glosses?.(line.german)??{},powers,wordlight:this.wordlight,choices:atEnd?[...this.gameChoices(npc.id),{id:'practice',german:'Ich möchte üben.',english:'I would like to practise.',next:'',effects:[]},{id:'leave',german:'Bis später!',english:'See you later!',next:'',effects:[]}]:[] });
      if (voice) { this.options.onOpen(npc.id); this.speakLine({ ...line, speaker: npc.id }, rate); }
      return;
    }
    const graph = this.graph; if (!graph) return;
    const state = storyState(this.options.progress().story), lines = this.artifact ? [{ ...this.artifact, id: this.artifact.objectId, speaker: 'Evidence', german: this.artifact.german, english: this.artifact.english, clipId: `artifact-${graph.questId}-${this.artifact.objectId}` }] : this.topic ? this.topic.lines.filter(line => conditionMet(line.condition, state)) : dialogueLines(this.node!, state);
    const source = lines[this.index]; if (!source) return;
    const presented = this.line(this.replyCorrection ?? source, voice, rate);
    if (!presented) return;
    // Later stages are unreadable until the server accepts the transition.
    const next = lines[this.index + 1];
    if (next && this.options.loadSentence && !this.loadedLines.has(next.id)) {
      const generation = this.generation;
      this.load(`sentence:${next.id}`, async () => { const line = await this.options.loadSentence!(next); if (generation === this.generation) this.loadedLines.set(next.id, line); }, false);
    }
    const line = { ...(this.options.prepareLine?.(presented) ?? presented), audioRequires: presented.audioRequires || !canVoiceDialogue(presented.german) };
    const atEnd = this.index === lines.length - 1;
    const gateId = !this.replay && this.node?.stage === 'gate' && atEnd ? graph.gateExerciseId : undefined;
    const gateSource = gateId ? this.exercise(gateId) : undefined;
    const gate = gateSource && localizedExercise(gateSource);
    const replyId = !this.replay && !this.artifact && source.reply && !state.flags[`reply:${source.reply.exerciseId}`] ? source.reply.exerciseId : undefined;
    const reply = replyId ? this.exercise(replyId) : undefined;
    const guidedGate = gate && this.beginner && beginnerGateChoices(gate.id).length > 0;
    if (this.beginner && !this.replay) this.hinted = true;
    const topicMenu = !this.topic && !this.artifact && !guidedGate && !reply && atEnd && this.node?.stage === 'intro' ? this.topicChoices(graph, state) : [];
    const choiceRows = guidedGate ? beginnerGateChoices(gate.id) : topicMenu.length ? topicMenu : reply ? (reply.options ?? []).map(german => ({ id: german, german, ...(reply.optionSentenceIds?.[german] ? { sentenceId: reply.optionSentenceIds[german] } : {}), english: this.beginner ? beginnerReplyMeaning(german) ?? '' : '', next: '', effects: [] })) : !this.artifact && atEnd ? dialogueChoices(this.node!, state) : [];
    const { choices, loading: choicesLoading } = this.hydrateChoices(choiceRows);
    this.view.render({ audioEnabled, title: this.artifact?.locked ? t('LOCKED') : this.artifact ? t('READ THE EVIDENCE') : localized(quests.find(q => q.id === graph.questId)?.title ?? ''), line, name: this.options.playerName(), npc: npcs.find(npc => npc.id === line.speaker), portrait: this.artifact ? '' : this.options.portrait(line.speaker,line.expression ?? 'neutral'), index: this.index, total: lines.length, help: this.translationVisible(line), busy: this.busy || !!(gateId && !gate) || !!(replyId && !reply) || choicesLoading, error: this.error, glosses: { ...(this.options.glosses?.(line.german) ?? {}), ...localizedGlosses(line.glosses ?? {}) }, powers,wordlight:this.wordlight, grammar: gate && !guidedGate ? this.options.grammar?.(graph.questId) ?? grammarForQuest(graph.questId) : undefined, grammarShown:this.grammarShown, answerShown:this.answerShown, exactAnswer:this.exactAnswers.get(graph.gateExerciseId), answerAvailable:this.exactAnswers.has(graph.gateExerciseId) || !!this.options.progress().exerciseStats[graph.gateExerciseId]?.attempts, choices, gate: guidedGate ? undefined : gate, choicePrompt: guidedGate ? localized(graph.gatePrompt) : undefined, gatePrompt: localized(graph.gatePrompt), advanceLabel: this.topic ? t('Back to the conversation') : this.artifact?.locked ? t('Keep exploring') : this.artifact ? this.replay ? t('Return to the investigation') : t('Record this evidence') : atEnd && this.node?.stage === 'intro' && !this.replay ? t('Examine the evidence') : atEnd && this.node?.terminal ? t('Keep exploring') : t('Continue') });
    if (voice) { this.options.onOpen(line.speaker === 'Evidence' ? '' : line.speaker); this.speakLine(line, rate); }
    if (gate && focusGate) { this.startedAt = performance.now(); if (!guidedGate) this.view.focusGate(); }
  }
  /** Optional questions replace the continue button until the player moves on. */
  private topicChoices(graph: QuestGraph, state: ReturnType<typeof storyState>) {
    const topics = dialogueTopics(graph, state);
    if (!topics.length) return [];
    const continueEnglish = !this.replay && !this.allInspected() ? t('Examine the evidence') : t('Continue');
    return [
      ...topics.map(topic => ({ ...topic, id: `topic:${topic.id}`, german: topic.german, english: topic.english, next: '', effects: [] })),
      { id: 'topic-continue', german: 'Weiter.', english: continueEnglish, next: '', effects: [], localized: true },
    ];
  }
  private async action(action: string) {
    const generation = this.generation;
    if (action === 'close') { this.close(); return; }
    if (action === 'audio') {
      const enabled = !this.options.audioEnabled();
      this.options.setAudioEnabled(enabled);
      if (!enabled) this.options.stopSpeech();
      this.render(enabled, undefined, false);
      return;
    }
    if (action === 'slow' && lanternRewards(this.options.progress()).echo) { this.render(true,.65); return; }
    if (action === 'wordlight' && lanternRewards(this.options.progress()).wordlight) { this.wordlight = !this.wordlight; if (this.wordlight) this.hint(); this.render(); return; }
    if (this.ambient) {
      if (action === 'translate') { this.translated = !this.translated; this.render(); }
      if (action === 'listen') this.render(true);
      if (action === 'next' && this.index + 1 < this.ambient.lines.length) { this.index++; this.translated = false; this.render(true); }
      return;
    }
    if (!this.graph || this.busy) return;
    if ((action === 'show-answer' || action === 'use-answer') && this.node?.stage === 'gate' && !this.replay) {
      const ex = this.exercise(this.graph.gateExerciseId);
      if (!ex || !this.exactAnswers.has(ex.id) && !this.options.progress().exerciseStats[ex.id]?.attempts) return;
      if (action === 'show-answer') {
        if (!this.answerShown) {
          this.busy = true; this.error = ''; this.render();
          try { await this.recoverAnswer(ex.id); }
          catch (error) { if (generation === this.generation) this.error = error instanceof Error ? error.message : t('The route could not save. Try again.'); }
          finally { if (generation === this.generation) { this.busy = false; this.render(); } }
          if (generation !== this.generation || this.error || !this.exactAnswers.has(ex.id)) return;
        }
        this.answerShown = !this.answerShown;
        if (this.answerShown) this.hint();
        this.render();
        if (this.answerShown) this.view.revealGateAnswer();
      } else if (this.answerShown) {
        this.hint(); this.view.fillGate(this.exactAnswers.get(ex.id)!);
      }
      return;
    }
    if (action === 'grammar' && this.node?.stage === 'gate') { const note = this.options.grammar?.(this.graph.questId) ?? grammarForQuest(this.graph.questId); this.grammarShown = !this.grammarShown; this.hint(); this.render(); if(note && this.grammarShown) this.speakLine({ ...note, speaker: quests.find(q=>q.id===this.graph!.questId)!.npcId }); return; }
    if (action === 'guide') { const note = grammarForQuest(this.graph.questId); if(note) this.options.onGrammarGuide?.(note.guideId); return; }
    if (action === 'translate') { this.translated = !this.translated; if (this.translated) this.hint(); this.render(); return; }
    if (action === 'hint') { this.hint(); const ex = this.exercise(this.graph.gateExerciseId); if (!ex) return; this.error = localizedExercise(ex).hint; this.render(); return; }
    if (action === 'listen') { this.render(true); return; }
    if (action !== 'next') return;
    if (this.topic) {
      const lines = this.topic.lines.filter(line => conditionMet(line.condition, storyState(this.options.progress().story)));
      if (this.index + 1 < lines.length) { this.index++; this.translated = false; this.render(true); return; }
      this.index = this.topic.returnTo; this.topic = undefined; this.translated = false; this.error = ''; this.render(false); return;
    }
    const current = this.node && dialogueLines(this.node, storyState(this.options.progress().story))[this.index];
    if (!this.replay && current?.reply && !this.options.progress().story?.flags[`reply:${current.reply.exerciseId}`]) return;
    if (this.artifact?.locked) { this.close(); return; }
    if (this.artifact) {
      if (!this.replay) {
        const key = `inspect:${this.graph.questId}:${this.artifact.objectId}`;
        await this.command(key, () => this.options.api.inspectStory({ id: this.commandId(key), questId: this.graph!.questId, objectId: this.artifact!.objectId }));
        if (generation !== this.generation || this.error || !this.graph) return;
      }
      const graph = this.graph; this.close(); this.options.onInvestigate(graph); return;
    }
    const lines = dialogueLines(this.node!, storyState(this.options.progress().story));
    if (this.index + 1 < lines.length) { this.index++; this.translated = false; this.error = ''; this.render(true); return; }
    if (this.node!.stage === 'intro' && !this.replay && !this.allInspected()) { const graph = this.graph; this.close(); this.options.onInvestigate(graph); return; }
    if (this.node!.terminal) { this.close(); return; }
    const next = this.node!.next;
    if (!next) return;
    if (!this.replay && this.node!.stage === 'intro') { await this.transition('intro'); if (generation !== this.generation || this.error || !this.graph) return; }
    this.node = this.graph.nodes.find(node => node.id === next)!; this.index = 0; this.translated = false; this.error = ''; this.render(true);
  }
  private commandId(key: string) { if (this.pending?.key !== key) this.pending = { key, id: crypto.randomUUID() }; return this.pending.id; }
  private attemptInput(key: string, input: Omit<SceneAttemptInput, 'id' | 'responseTimeMs'>): Readonly<SceneAttemptInput> {
    const id = this.commandId(key);
    // A lost response must retry the exact body stored with this action ID.
    return this.pending!.attempt ??= Object.freeze({ id, ...input, responseTimeMs: Math.min(600000, Math.round(performance.now() - this.startedAt)) });
  }
  private async command(key: string, send: () => Promise<StoryResult>) {
    const generation = this.generation; this.busy = true; this.error = ''; this.commandId(key); this.render();
    try { const result = await send(); if (generation !== this.generation) return; this.options.onProgress(result.progress); this.pending = undefined; }
    catch (error) { if (generation === this.generation) this.error = error instanceof Error ? error.message : t('The route could not save. Try again.'); }
    finally { if (generation === this.generation) { this.busy = false; this.render(); } }
  }
  private async transition(stage: 'intro' | 'gate' | 'choice', extra?: { attemptId?: string; choiceId?: string }) {
    const nodeId = this.node?.stage === stage ? this.node.id : this.graph!.nodes.find(node => node.stage === stage)?.id ?? stage;
    const questId = this.graph!.questId, key = `${questId}:${nodeId}:${extra?.choiceId ?? extra?.attemptId ?? ''}`;
    await this.command(key, () => this.options.api.storyTransition({ id: this.commandId(key), questId, nodeId, ...extra }));
  }
  private async answer(answer: string, guidedChoice = false) {
    if (!this.graph || this.busy || !answer.trim() || this.node?.stage !== 'gate') return;
    const graph = this.graph, ex = this.exercise(graph.gateExerciseId), generation = this.generation;
    if (!ex) return;
    if (this.beginner && beginnerGateChoices(ex.id).length > 0 && (!guidedChoice || !beginnerGateChoices(ex.id).some(choice => choice.id === answer))) return;
    if (this.gateProof) {
      await this.transition('gate', { attemptId: this.gateProof });
      if (generation === this.generation && !this.error && this.graph === graph) { this.node = nodeForStage(graph, 'choice'); this.index = 0; this.translated = false; this.render(true); }
      return;
    }
    const key = `answer:${graph.questId}:${answer.trim()}:${this.hinted}:${guidedChoice}`;
    const input = this.attemptInput(key, { itemId: ex.itemId, exerciseId: ex.id, answer: answer.trim(), hinted: this.hinted || guidedChoice, mode: guidedChoice ? 'recognition' : 'production', questId: graph.questId, sceneAttempt: true, ...(guidedChoice ? { guidedChoice: true } : {}) });
    this.busy = true; this.error = ''; this.render();
    try {
      const result = await this.options.api.request<AttemptResult>('/attempt', input);
      if (generation !== this.generation) return;
      this.options.onProgress(result.progress);
      this.pending = undefined;
      if (result.correctedAnswer) this.exactAnswers.set(ex.id, result.correctedAnswer);
      if (!result.correct) { this.error = guidedChoice ? t('Try another reply. {meaning}', { meaning: localized({ german: result.correctedAnswer ?? '', english: ex.english }) }) : result.reason || t('Try again.'); return; }
      this.gateProof = result.attemptId || input.id;
      this.busy = false;
      await this.transition('gate', { attemptId: this.gateProof });
      if (this.error || generation !== this.generation) return;
      this.node = nodeForStage(graph, 'choice'); this.index = 0; this.translated = false; this.render(true);
    } catch (error) { if (generation === this.generation) this.error = error instanceof Error ? error.message : t('Your reply could not save. Try again.'); }
    finally { if (generation === this.generation) { this.busy = false; this.render(); } }
  }
  private async choose(id: string) {
    if (this.ambient) { const npcId = this.ambient.npc.id; this.close(); if (id === 'practice') this.options.onPractice?.(npcId); else if (id.startsWith('game:')) this.options.onGame?.(id.slice(5)); return; }
    if (!this.graph || this.busy || !this.node) return;
    if (id === 'topic-continue') { await this.action('next'); return; }
    if (id.startsWith('topic:') && this.node.stage === 'intro') {
      const state = storyState(this.options.progress().story), topic = dialogueTopics(this.graph, state).find(item => `topic:${item.id}` === id);
      if (!topic) return;
      this.topic = { id: topic.id, lines: topic.lines, returnTo: this.index }; this.index = 0; this.translated = false; this.error = '';
      this.render(true); return;
    }
    if (!this.replay && this.node.stage === 'gate' && this.beginner && beginnerGateChoices(this.graph.gateExerciseId).length > 0) { await this.answer(id, true); return; }
    const source = dialogueLines(this.node, storyState(this.options.progress().story))[this.index];
    if (!this.replay && source?.reply && !this.options.progress().story?.flags[`reply:${source.reply.exerciseId}`]) {
      await this.reply(id, source); return;
    }
    const choice = dialogueChoices(this.node, storyState(this.options.progress().story)).find(choice => choice.id === id); if (!choice) return;
    const graph = this.graph, generation = this.generation;
    if (!this.replay) {
      const before = this.options.progress().xp;
      await this.transition('choice', { choiceId: id }); if (generation !== this.generation || this.graph !== graph) return;
      // A choice the server already saved (a lost response, or a retry under a new action ID) is
      // rejected as complete; resync and finish the scene with the choice the server recorded.
      const saved = this.error ? await this.savedChoice(graph.questId) : id;
      if (generation !== this.generation || this.graph !== graph || saved === undefined) return;
      const recorded = dialogueChoices(this.node!, storyState(this.options.progress().story)).find(item => item.id === saved) ?? choice;
      // The server has saved the choice, so the scene moves on before the town reacts; a failing
      // reaction must not leave the player on a choice the server will now reject as complete.
      this.node = graph.nodes.find(node => node.id === recorded.next)!; this.index = 0; this.translated = false; this.error = ''; this.render(true);
      try { this.options.onComplete(graph, this.options.progress().xp - before, recorded.effects); }
      catch (error) { console.error('The scene was saved, but the town could not react to it.', error); }
      return;
    }
    this.node = this.graph.nodes.find(node => node.id === choice.next)!; this.index = 0; this.translated = false; this.error = ''; this.render(true);
  }
  /** The choice the server saved for a completed scene, after refreshing progress; undefined while the scene is open. */
  private async savedChoice(questId: string): Promise<string | undefined> {
    if (!this.options.api.story) return undefined;
    const generation = this.generation; this.busy = true; this.render();
    try {
      const result = await this.options.api.story();
      if (generation !== this.generation) return undefined;
      this.options.onProgress(result.progress);
    } catch { return undefined; }
    finally { if (generation === this.generation) { this.busy = false; this.render(); } }
    if (!this.options.progress().completedQuestIds.includes(questId)) return undefined;
    this.pending = undefined;
    return this.options.progress().story?.choices[questId] ?? '';
  }
  private async reply(answer: string, source: DialogueLine) {
    const graph = this.graph!, exercise = this.exercise(source.reply!.exerciseId);
    if (!exercise || !exercise.options?.includes(answer)) return;
    const generation = this.generation, key = `reply:${graph.questId}:${answer}:${this.hinted}`;
    const input = this.attemptInput(key, { itemId: exercise.itemId, exerciseId: exercise.id, answer, hinted: this.hinted || !!this.options.progress().story?.flags[`reply-help:${exercise.id}`], mode: 'recognition', questId: graph.questId, sceneAttempt: true });
    this.busy = true; this.error = ''; this.render();
    try {
      const result = await this.options.api.request<AttemptResult>('/attempt', input);
      if (generation !== this.generation) return;
      this.options.onProgress(result.progress);
      this.pending = undefined;
      if (result.correct) { this.replyCorrection = undefined; this.index++; this.translated = false; }
      else { this.hinted = true; this.replyCorrection = source.reply!.correction; }
      this.busy = false; this.render(true);
    } catch (error) { if (generation === this.generation) this.error = error instanceof Error ? error.message : t('Your reply could not save. Try again.'); }
    finally { if (generation === this.generation) { this.busy = false; this.render(); } }
  }
  close() { this.generation++; this.topic = undefined; this.replyCorrection = undefined; this.view.close(); this.view.host.classList.remove('investigation-artifact'); this.graph = undefined; this.node = undefined; this.artifact = undefined; this.ambient = undefined; this.wordlight = false; this.busy = false; this.options.stopSpeech(); this.options.onClose(); }
  destroy() { this.close(); this.view.destroy(); }
}

/** Story glosses are authored in English; show the support-language gloss, or none (never a wrong one). */
function localizedGlosses(glosses: Readonly<Record<string, string>>): Record<string, string> {
  return Object.fromEntries(Object.entries(glosses).map(([word, gloss]) => [word, localized(gloss)]));
}
