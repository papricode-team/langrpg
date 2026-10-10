import type { Api, AttemptResult, Progress, StoryResult } from './api';
import { quests, npcs, vocabulary, type NPC, type Level } from './content';
import { dialogueChoices, dialogueLines, nodeForStage, personalized, storyState, type DialogueNode, type DialogueLine, type QuestGraph } from './dialogue';
import { DialogueView } from './dialogue-view';
import { questGraph } from './quest-graph';
import { gradeFeedback } from './learning';
import { residentConversation, earnedTitleGreeting } from './npc-dialogue';
import { lanternRewards } from './lantern-rewards';
import { grammarForQuest, type ContextualGrammar } from './contextual-grammar';
import { beginnerGateChoices, beginnerReplyMeaning } from './beginner-dialogue';

const glossary: Record<string, string> = {
  ich:'I', du:'you', wir:'we', sie:'she / they / formal you', ihr:'her / their / you (plural)',
  der:'the (masculine)', die:'the (feminine / plural)', das:'the (neuter)', den:'the (accusative masculine)',
  ein:'a / one', eine:'a / one', einen:'a (accusative masculine)', ist:'is', sind:'are', hat:'has', haben:'have',
  bitte:'please', hilfe:'help', helfen:'to help', namen:'names', name:'name', adresse:'address', adressen:'addresses',
  fahrkarte:'ticket', zug:'train', bahnsteig:'platform', stadt:'town', städte:'towns', brief:'letter',
  lampe:'lamp', laterne:'lantern', glocke:'bell', siegel:'seal', schlüssel:'key', beweise:'evidence',
  heute:'today', morgen:'tomorrow / morning', gestern:'yesterday', zuerst:'first', dann:'then',
  hier:'here', dort:'there', noch:'still / yet', wieder:'again', gemeinsam:'together',
  fragen:'to ask', prüfen:'to check', öffnen:'to open', geschlossen:'closed', verloren:'lost',
  vergessen:'forgotten / to forget', auslöschen:'to erase', vertrauen:'trust', versprechen:'promise',
  amt:'office', messingamt:'Brass Office', rat:'council', kreis:'circle', stimmen:'voices',
  unterschrift:'signature', nachfolge:'succession / successor', bewohner:'residents',
  verbindung:'connection', strecke:'route', garten:'garden', sturm:'storm', zeugin:'witness',
};
for (const word of vocabulary) glossary[word.german.replace(/^(der|die|das) /, '').toLocaleLowerCase('de')] ??= word.english;

export interface QuestControllerOptions {
  api: Pick<Api, 'request' | 'storyTransition' | 'inspectStory'>;
  progress(): Progress;
  playerName(): string;
  portrait(id: string): string;
  speak(text: string, speaker: string, clipId: string, personalized: boolean, rate?: number): void;
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
  onComplete(graph: QuestGraph, xpAdded: number): void;
  expose(exerciseId: string): void;
  onPractice?(npcId: string): void;
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
  private wordlight = false;
  private grammarShown = false;
  private answerShown = false;
  private busy = false;
  private replay = false;
  private beginner = false;
  private error = '';
  private artifact?: { objectId: string; german: string; english: string };
  private pending?: { id: string; key: string; attempt?: Readonly<SceneAttemptInput> };
  private generation = 0;
  private startedAt = 0;
  private gateProof?: string;
  private replyCorrection?: DialogueLine;
  private ambient?: { npc: NPC; lines: ReturnType<typeof residentConversation> };
  constructor(private options: QuestControllerOptions) {
    this.view = new DialogueView({ action: action => void this.action(action), choice: id => void this.choose(id), answer: answer => void this.answer(answer), gloss: () => this.hint() });
  }
  get isOpen(): boolean { return !this.view.host.hidden; }
  refreshAudio() { if (this.isOpen) this.render(); }
  async open(questId: string): Promise<void> {
    const graph = questGraph(questId); if (!graph) return;
    this.generation++; this.graph = graph; this.replay = this.options.progress().completedQuestIds.includes(questId); this.answerShown = false; this.replyCorrection = undefined;
    // Keep an open conversation in the same format when the opening timer ends.
    this.beginner = graph.level === 'A1' && (this.options.beginnerMode?.() ?? true);
    const generation = this.generation;
    this.ambient = undefined;
    this.hinted = this.beginner || (this.options.wasHinted?.(questId)??false); this.translated = false; this.grammarShown = false; this.error = ''; this.artifact = undefined; this.pending = undefined; this.busy = false; this.gateProof = undefined;
    const state = storyState(this.options.progress().story), stage = this.replay ? 'intro' : state.nodes[questId] ?? 'intro';
    this.node = nodeForStage(graph, stage); this.index = 0;
    this.options.onOpen(quests.find(q => q.id === questId)!.npcId);
    const repliesDone = graph.nodes.flatMap(node => node.lines).every(line => !line.reply || state.flags[`reply:${line.reply.exerciseId}`]);
    if (!this.replay && stage === 'intro' && this.allInspected() && repliesDone) {
      await this.transition('intro');
      if (generation !== this.generation || this.graph !== graph) return;
      if (this.error) this.index = dialogueLines(this.node!,state).length-1;
      else this.node = nodeForStage(graph, 'gate');
    }
    this.startedAt = performance.now(); this.render(true);
  }
  inspect(questId: string, objectId: string) {
    const graph = questGraph(questId), artifact = graph?.investigations.find(item => item.objectId === objectId);
    if (!graph || !artifact) return false;
    this.generation++; this.replyCorrection = undefined; this.ambient = undefined; this.graph = graph; this.node = undefined; this.artifact = artifact; this.index = 0; this.answerShown = false;
    this.beginner = graph.level === 'A1' && (this.options.beginnerMode?.() ?? true);
    this.translated = false; this.hinted = false; this.busy = false; this.error = ''; this.pending = undefined;
    this.replay = (this.options.progress().story?.inspections?.[questId] ?? []).includes(objectId) || this.options.progress().completedQuestIds.includes(questId);
    this.options.onOpen(''); this.view.host.classList.add('investigation-artifact'); this.render(true); return true;
  }
  greet(npc: NPC, level: Level) {
    this.generation++; this.replyCorrection = undefined; this.graph = undefined; this.node = undefined; this.artifact = undefined; this.answerShown = false;
    this.ambient = { npc, lines: residentConversation(npc, level, storyState(this.options.progress().story)) };
    this.beginner = level === 'A1' && (this.options.beginnerMode?.() ?? true);
    const greeting = earnedTitleGreeting(npc,lanternRewards(this.options.progress()).title);
    if (greeting) this.ambient.lines.unshift(greeting);
    this.index = 0; this.translated = false; this.error = ''; this.busy = false; this.render(true);
  }
  private allInspected() {
    return this.graph!.investigations.every(item => (this.options.progress().story?.inspections?.[this.graph!.questId] ?? []).includes(item.objectId));
  }
  private hint() { this.hinted = true; if (this.graph && !this.replay) this.options.expose(this.graph.gateExerciseId); }
  private render(voice = false, rate?: number, focusGate = voice) {
    const powers = lanternRewards(this.options.progress());
    const audioEnabled = this.options.audioEnabled();
    if (this.ambient) {
      const { npc, lines } = this.ambient, source = lines[this.index], line = this.options.prepareLine?.(source) ?? source, atEnd = this.index === lines.length - 1;
      this.view.render({ audioEnabled, title: 'A CONVERSATION IN THE TOWN', line, name: this.options.playerName(), npc, portrait: this.options.portrait(npc.id), index:this.index,total:lines.length,help:this.translated || this.beginner,busy:false,glosses:this.options.glosses?.(line.german)??glossary,powers,wordlight:this.wordlight,choices:atEnd?[{id:'practice',german:'Ich möchte üben.',english:'I would like to practise.',next:'',effects:[]},{id:'leave',german:'Bis später!',english:'See you later!',next:'',effects:[]}]:[] });
      if (voice) { this.options.onOpen(npc.id); if (audioEnabled) this.options.speak(line.german,npc.id,line.clipId,false,rate); }
      return;
    }
    const graph = this.graph; if (!graph) return;
    const state = storyState(this.options.progress().story), lines = this.artifact ? [{ id: this.artifact.objectId, speaker: 'Evidence', german: this.artifact.german, english: this.artifact.english, clipId: `artifact-${graph.questId}-${this.artifact.objectId}` }] : dialogueLines(this.node!, state);
    const source = lines[this.index]; if (!source) return;
    const presented = this.replyCorrection ?? source;
    const line = this.options.prepareLine?.(presented) ?? presented;
    const atEnd = this.index === lines.length - 1;
    const gate = !this.replay && this.node?.stage === 'gate' && atEnd ? quests.find(q => q.id === graph.questId)!.exercises.find(ex => ex.id === graph.gateExerciseId) : undefined;
    const reply = !this.replay && !this.artifact && source.reply && !state.flags[`reply:${source.reply.exerciseId}`] ? quests.find(q => q.id === graph.questId)!.exercises.find(ex => ex.id === source.reply!.exerciseId) : undefined;
    const guidedGate = gate && this.beginner;
    const choices = guidedGate ? beginnerGateChoices(gate.id) : reply ? (reply.options ?? []).map(german => ({ id: german, german, english: this.beginner ? beginnerReplyMeaning(german) ?? '' : '', next: '', effects: [] })) : !this.artifact && atEnd ? dialogueChoices(this.node!, state) : [];
    this.view.render({ audioEnabled, title: this.artifact ? 'READ THE EVIDENCE' : quests.find(q => q.id === graph.questId)!.title, line, name: this.options.playerName(), npc: npcs.find(npc => npc.id === line.speaker), portrait: this.artifact ? '' : this.options.portrait(line.speaker), index: this.index, total: lines.length, help: this.translated || this.beginner, busy: this.busy, error: this.error, glosses: { ...(this.options.glosses?.(line.german) ?? glossary), ...line.glosses }, powers,wordlight:this.wordlight, grammar: gate && !guidedGate ? this.options.grammar?.(graph.questId) ?? grammarForQuest(graph.questId) : undefined, grammarShown:this.grammarShown, answerShown:this.answerShown, choices, gate: guidedGate ? undefined : gate, choicePrompt: guidedGate ? graph.gatePrompt : undefined, gatePrompt: graph.gatePrompt, advanceLabel: this.artifact ? this.replay ? 'Return to the investigation' : 'Record this evidence' : atEnd && this.node?.stage === 'intro' && !this.replay ? 'Examine the evidence' : atEnd && this.node?.terminal ? 'Keep exploring' : 'Continue' });
    if (voice) { this.options.onOpen(line.speaker === 'Evidence' ? '' : line.speaker); if (audioEnabled) this.options.speak(personalized(line.german, this.options.playerName()), line.speaker, line.clipId, line.german.includes('{name}'),rate); }
    if (gate && focusGate) { this.startedAt = performance.now(); if (!guidedGate) this.view.focusGate(); }
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
      if (action === 'translate') { this.translated = true; this.render(); }
      if (action === 'listen') this.render(true);
      if (action === 'next' && this.index + 1 < this.ambient.lines.length) { this.index++; this.translated = false; this.render(true); }
      return;
    }
    if (!this.graph || this.busy) return;
    if ((action === 'show-answer' || action === 'use-answer') && this.node?.stage === 'gate' && !this.replay) {
      const ex = quests.find(q => q.id === this.graph!.questId)!.exercises.find(ex => ex.id === this.graph!.gateExerciseId)!;
      if (action === 'show-answer') {
        this.answerShown = !this.answerShown;
        if (this.answerShown) this.hint();
        this.render();
        if (this.answerShown) this.view.revealGateAnswer();
      } else if (this.answerShown) {
        this.view.fillGate(ex.answer);
      }
      return;
    }
    if (action === 'grammar' && this.node?.stage === 'gate') { const note = this.options.grammar?.(this.graph.questId) ?? grammarForQuest(this.graph.questId); this.grammarShown = !this.grammarShown; this.hint(); this.render(); if(note && this.grammarShown) this.options.speak(note.german,quests.find(q=>q.id===this.graph!.questId)!.npcId,note.clipId,false); return; }
    if (action === 'guide') { const note = grammarForQuest(this.graph.questId); if(note) this.options.onGrammarGuide?.(note.guideId); return; }
    if (action === 'translate') { this.translated = true; this.hint(); this.render(); return; }
    if (action === 'hint') { this.hint(); const ex = quests.find(q => q.id === this.graph!.questId)!.exercises.find(ex => ex.id === this.graph!.gateExerciseId)!; this.error = ex.hint; this.render(); return; }
    if (action === 'listen') { this.render(true); return; }
    if (action !== 'next') return;
    const current = this.node && dialogueLines(this.node, storyState(this.options.progress().story))[this.index];
    if (!this.replay && current?.reply && !this.options.progress().story?.flags[`reply:${current.reply.exerciseId}`]) return;
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
    try { const result = await send(); this.options.onProgress(result.progress); if (generation !== this.generation) return; this.pending = undefined; }
    catch (error) { if (generation === this.generation) this.error = error instanceof Error ? error.message : 'The route could not save. Try again.'; }
    finally { if (generation === this.generation) { this.busy = false; this.render(); } }
  }
  private async transition(nodeId: 'intro' | 'gate' | 'choice', extra?: { attemptId?: string; choiceId?: string }) {
    const questId = this.graph!.questId, key = `${questId}:${nodeId}:${extra?.choiceId ?? extra?.attemptId ?? ''}`;
    await this.command(key, () => this.options.api.storyTransition({ id: this.commandId(key), questId, nodeId, ...extra }));
  }
  private async answer(answer: string, guidedChoice = false) {
    if (!this.graph || this.busy || !answer.trim() || this.node?.stage !== 'gate') return;
    const graph = this.graph, ex = quests.find(q => q.id === graph.questId)!.exercises.find(ex => ex.id === graph.gateExerciseId)!, generation = this.generation;
    if (this.beginner && (!guidedChoice || !beginnerGateChoices(ex.id).some(choice => choice.id === answer))) return;
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
      this.options.onProgress(result.progress);
      if (generation !== this.generation) return;
      this.pending = undefined;
      if (!result.correct) { this.error = guidedChoice ? `Try another reply. ${ex.english}` : result.reason || gradeFeedback(ex, answer); return; }
      this.gateProof = result.attemptId || input.id;
      this.busy = false;
      await this.transition('gate', { attemptId: this.gateProof });
      if (this.error || generation !== this.generation) return;
      this.node = nodeForStage(graph, 'choice'); this.index = 0; this.translated = false; this.render(true);
    } catch (error) { if (generation === this.generation) this.error = error instanceof Error ? error.message : 'Your reply could not save. Try again.'; }
    finally { if (generation === this.generation) { this.busy = false; this.render(); } }
  }
  private async choose(id: string) {
    if (this.ambient) { const npcId = this.ambient.npc.id; this.close(); if (id === 'practice') this.options.onPractice?.(npcId); return; }
    if (!this.graph || this.busy || !this.node) return;
    if (!this.replay && this.node.stage === 'gate' && this.beginner) { await this.answer(id, true); return; }
    const source = dialogueLines(this.node, storyState(this.options.progress().story))[this.index];
    if (!this.replay && source?.reply && !this.options.progress().story?.flags[`reply:${source.reply.exerciseId}`]) {
      await this.reply(id, source); return;
    }
    const choice = dialogueChoices(this.node, storyState(this.options.progress().story)).find(choice => choice.id === id); if (!choice) return;
    const graph = this.graph, generation = this.generation;
    if (!this.replay) {
      const before = this.options.progress().xp;
      await this.transition('choice', { choiceId: id }); if (generation !== this.generation || this.error || this.graph !== graph) return;
      this.options.onComplete(graph, this.options.progress().xp - before);
    }
    this.node = this.graph.nodes.find(node => node.id === choice.next)!; this.index = 0; this.translated = false; this.error = ''; this.render(true);
  }
  private async reply(answer: string, source: DialogueLine) {
    const graph = this.graph!, exercise = quests.find(q => q.id === graph.questId)!.exercises.find(ex => ex.id === source.reply!.exerciseId)!;
    if (!exercise.options?.includes(answer)) return;
    const generation = this.generation, key = `reply:${graph.questId}:${answer}:${this.hinted}`;
    const input = this.attemptInput(key, { itemId: exercise.itemId, exerciseId: exercise.id, answer, hinted: this.hinted || !!this.options.progress().story?.flags[`reply-help:${exercise.id}`], mode: 'recognition', questId: graph.questId, sceneAttempt: true });
    this.busy = true; this.error = ''; this.render();
    try {
      const result = await this.options.api.request<AttemptResult>('/attempt', input);
      this.options.onProgress(result.progress);
      if (generation !== this.generation) return;
      this.pending = undefined;
      if (result.correct) { this.replyCorrection = undefined; this.index++; this.translated = false; }
      else { this.hinted = true; this.replyCorrection = source.reply!.correction; }
      this.busy = false; this.render(true);
    } catch (error) { if (generation === this.generation) this.error = error instanceof Error ? error.message : 'Your reply could not save. Try again.'; }
    finally { if (generation === this.generation) { this.busy = false; this.render(); } }
  }
  close() { this.generation++; this.replyCorrection = undefined; this.view.close(); this.view.host.classList.remove('investigation-artifact'); this.graph = undefined; this.node = undefined; this.artifact = undefined; this.ambient = undefined; this.wordlight = false; this.busy = false; this.options.stopSpeech(); this.options.onClose(); }
  destroy() { this.close(); this.view.destroy(); }
}
