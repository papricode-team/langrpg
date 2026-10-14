import type { Api, AttemptResult, Progress, StoryResult } from './api';
import { quests, npcs, type NPC, type Level } from './content';
import { getContentClient, toDialogueLine, contentMeanings, type ContentClient } from './content-api';
import { conditionMet, dialogueChoices, dialogueLines, dialogueTopics, nodeForStage, personalized, storyState, type DialogueEffect, type DialogueNode, type DialogueLine, type QuestGraph } from './dialogue';
import { DialogueView } from './dialogue-view';
import {lexemeById} from './course';
import { questGraph } from './quest-graph';
import { attemptFeedback } from './learning';
import { localized, localizedExercise, t } from './i18n';

import { lanternRewards } from './lantern-rewards';
import { grammarForQuest, loadContextualGrammar, type ContextualGrammar } from './contextual-grammar';
import { beginnerGateChoices, beginnerReplyMeaning, beginnerReplyContent, installBeginnerLines, needsBeginnerStorySupport } from './beginner-dialogue';


export interface QuestControllerOptions {
  api: Pick<Api, 'request' | 'storyTransition' | 'inspectStory'>;
  content?: ContentClient;
  onError?(message:string): void;
  progress(): Progress;
  playerName(): string;
  portrait(id: string, expression?: string): string;
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
  onComplete(graph: QuestGraph, xpAdded: number, effects?: readonly DialogueEffect[]): void;
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
  private translationLine = '';
  private wordlight = false;
  private grammarShown = false;
  private answerShown = false;
  private busy = false;
  private replay = false;
  private beginner = false;
  private error = '';
  private artifact?: { objectId: string; german: string; english: string; aligned?:DialogueLine['aligned'] };
  private pending?: { id: string; key: string; attempt?: Readonly<SceneAttemptInput> };
  private generation = 0;
  private startedAt = 0;
  private gateProof?: string;
  private replyCorrection?: DialogueLine;
  private topic?: { id: string; lines: DialogueLine[]; returnTo: number };
  private ambient?: { npc: NPC; lines: DialogueLine[] };
  constructor(private options: QuestControllerOptions) {
    this.view = new DialogueView({ action: action => void this.action(action), choice: id => void this.choose(id), answer: answer => void this.answer(answer), gloss: () => { this.translated = true; this.hint(); this.render(); } });
  }
  get isOpen(): boolean { return !this.view.host.hidden; }
  refreshAudio() { if (this.isOpen) this.render(); }
  private get content():ContentClient {return this.options.content??getContentClient();}
  private async prepareGlosses(line:{aligned?:DialogueLine['aligned']}):Promise<void> {
    const missing=[...new Set(Object.values(line.aligned?.glosses??{}))].filter(id=>!lexemeById.has(id));
    if(missing.length)await this.content.lexemes(missing.slice(0,24));
  }
  private visibleNodeIDs(node:DialogueNode):string[] {
    const state=storyState(this.options.progress().story);
    const refs:NonNullable<DialogueNode['lineRefs']>=node.lineRefs??node.lineIds?.map(id=>({id}))??[];
    return refs.filter(ref=>conditionMet(ref.condition,state)).map(ref=>ref.id);
  }
  private async prepareNode(node:DialogueNode):Promise<void> {
    const visible=this.visibleNodeIDs(node),missing=visible.filter(id=>!node.lines.some(line=>line.id===id));
    if(missing.length){const records=await this.content.lines(missing);for(const line of records)node.lines.push({...toDialogueLine(line),...(node.lineRefs?.find(ref=>ref.id===line.id)??{})});}
    if(node.lineIds)node.lines.sort((left,right)=>node.lineIds!.indexOf(left.id)-node.lineIds!.indexOf(right.id));
  }
  private async prepareCurrent():Promise<void> {
    if(this.ambient){await this.prepareGlosses(this.ambient.lines[this.index]);return;}
    const graph=this.graph,node=this.node;if(!graph||!node)return;
    await this.prepareNode(node);
    if(node.stage==='gate'&&!this.replay)await loadContextualGrammar(graph.questId);
    const lines=dialogueLines(node,storyState(this.options.progress().story)),line=lines[this.index];
    if(line)await this.prepareGlosses(line);
    const exerciseIds=[...(node.stage==='gate'&&!this.replay?[graph.gateExerciseId]:[]),...(!this.replay&&line?.reply?[line.reply.exerciseId]:[])];
    const missing=exerciseIds.filter(id=>!quests.find(quest=>quest.id===graph.questId)?.exercises.some(exercise=>exercise.id===id));
    if(missing.length)await this.content.exercises(missing);
    if(this.index===lines.length-1) {
      const choices=dialogueChoices(node,storyState(this.options.progress().story)),topics=node.stage==='intro'?dialogueTopics(graph,storyState(this.options.progress().story)):[];
      const exercise=quests.find(quest=>quest.id===graph.questId)?.exercises.find(exercise=>exercise.id===line?.reply?.exerciseId);
      const guided=this.beginner&&node.stage==='gate'?beginnerGateChoices(graph.gateExerciseId):[];
      const replyRefs=(exercise?.options??[]).map(beginnerReplyContent);
      const ids=[...choices.map(choice=>choice.lineId),...topics.map(topic=>topic.lineId),...guided.map(choice=>choice.lineId),...replyRefs.map(choice=>choice.lineId)].filter((id):id is string=>!!id);
      if(ids.length){const records=await this.content.lines(ids),byID=new Map(records.map(record=>[record.id,toDialogueLine(record)]));
        installBeginnerLines(records);
        for(const item of [...choices,...topics]){const line=item.lineId&&byID.get(item.lineId);if(line){item.german=line.german;item.english=line.english;item.aligned=line.aligned;}}
      }
    }
    const next=node.next&&graph.nodes.find(candidate=>candidate.id===node.next);
    if(next)void this.prepareNode(next).catch(()=>{});
  }
  private currentReady():boolean {
    if(this.ambient)return Object.values(this.ambient.lines[this.index]?.aligned?.glosses??{}).every(id=>lexemeById.has(id));
    const graph=this.graph,node=this.node;if(!graph||!node)return true;
    if(this.visibleNodeIDs(node).some(id=>!node.lines.some(line=>line.id===id)))return false;
    const lines=dialogueLines(node,storyState(this.options.progress().story)),source=lines[this.index];
    const ids=[...(node.stage==='gate'&&!this.replay?[graph.gateExerciseId]:[]),...(!this.replay&&source?.reply?[source.reply.exerciseId]:[])];
    if(node.stage==='gate'&&!this.replay&&!grammarForQuest(graph.questId))return false;
    if(Object.values(source?.aligned?.glosses??{}).some(id=>!lexemeById.has(id)))return false;
    if(ids.some(id=>!quests.find(quest=>quest.id===graph.questId)?.exercises.some(exercise=>exercise.id===id)))return false;
    const guided=this.beginner&&node.stage==='gate'?beginnerGateChoices(graph.gateExerciseId):[];
    const replyExercise=quests.find(quest=>quest.id===graph.questId)?.exercises.find(exercise=>exercise.id===source?.reply?.exerciseId);
    const replyRefs=(replyExercise?.options??[]).map(beginnerReplyContent);
    return this.index!==lines.length-1||[...dialogueChoices(node,storyState(this.options.progress().story)),...(node.stage==='intro'?graph.topics??[]:[]),...guided,...replyRefs].every(item=>!item.lineId||!!item.aligned);
  }
  private async present(voice=true):Promise<void> {
    if(this.currentReady()){this.render(voice);return;}
    const generation=this.generation;this.busy=true;
    try {await this.prepareCurrent();if(generation!==this.generation)return;this.busy=false;this.render(voice);}
    catch(error){if(generation!==this.generation)return;this.busy=false;this.error=error instanceof Error?error.message:t('This content could not open. Try again.');this.options.onError?.(this.error);this.render();}
  }
  async open(questId: string): Promise<void> {
    const opening=++this.generation;
    let graph:QuestGraph;
    try {const quest=quests.find(quest=>quest.id===questId);graph=questGraph(questId)??await this.content.graph(quest?.graphId??questId);}
    catch(error){if(opening===this.generation)this.options.onError?.(error instanceof Error?error.message:t('This content could not open. Try again.'));return;}
    if(opening!==this.generation)return;
 this.topic = undefined; this.graph = graph; this.replay = this.options.progress().completedQuestIds.includes(questId); this.answerShown = false; this.replyCorrection = undefined;
    // Keep an open conversation in the same format when learning evidence changes.
    this.beginner = this.options.beginnerMode?.() ?? needsBeginnerStorySupport(this.options.progress());
    const generation = this.generation;
    this.ambient = undefined;
    this.hinted = this.beginner || (this.options.wasHinted?.(questId)??false); this.translated = false; this.grammarShown = false; this.error = ''; this.artifact = undefined; this.pending = undefined; this.busy = false; this.gateProof = undefined;
    const state = storyState(this.options.progress().story), stage = this.replay ? 'intro' : state.nodes[questId] ?? 'intro';
    this.node = nodeForStage(graph, stage); this.index = 0;
    this.options.onOpen(quests.find(q => q.id === questId)!.npcId);
    const repliesDone = graph.nodes.flatMap(node => node.lineRefs ?? node.lines).every(line => !line.reply || state.flags[`reply:${line.reply.exerciseId}`]);
    if (!this.replay && stage === 'intro' && this.allInspected() && repliesDone) {
      await this.transition('intro');
      if (generation !== this.generation || this.graph !== graph) return;
      if (this.error) this.index = dialogueLines(this.node!,state).length-1;
      else this.node = nodeForStage(graph, 'gate');
    }
    this.startedAt = performance.now(); await this.present(true);
  }
  async inspect(questId: string, objectId: string) {
    const quest=quests.find(quest=>quest.id===questId);
    const graph=questGraph(questId)??await this.content.graph(quest?.graphId??questId);
    const source=graph.investigations.find(item=>item.objectId===objectId);
    const aligned=source?.lineId?(await this.content.lines([source.lineId]))[0]:undefined;
    const artifact=source&&{...source,...(aligned?toDialogueLine(aligned):{})};
    if (!graph || !artifact) return false;
    if(Object.values(artifact.aligned?.glosses??{}).some(id=>!lexemeById.has(id)))await this.prepareGlosses(artifact);
    this.generation++; this.topic = undefined; this.replyCorrection = undefined; this.ambient = undefined; this.graph = graph; this.node = undefined; this.artifact = artifact; this.index = 0; this.answerShown = false;
    this.beginner = this.options.beginnerMode?.() ?? needsBeginnerStorySupport(this.options.progress());
    this.translated = false; this.hinted = false; this.busy = false; this.error = ''; this.pending = undefined;
    this.replay = (this.options.progress().story?.inspections?.[questId] ?? []).includes(objectId) || this.options.progress().completedQuestIds.includes(questId);
    this.options.onOpen(''); this.view.host.classList.add('investigation-artifact'); this.render(true); return true;
  }
  async greet(npc: NPC, _level: Level):Promise<void> {
    this.generation++;this.topic=undefined;this.replyCorrection=undefined;this.graph=undefined;this.node=undefined;this.artifact=undefined;this.answerShown=false;
    const generation=this.generation;
    try {
      const lines=npc.greetingLineIds?.length?(await this.content.lines(npc.greetingLineIds)).map(record=>({...toDialogueLine(record),speaker:npc.id,clipId:record.clipId??''})):
        (npc.greetingSentences??[]).map((line,index)=>({id:`${npc.id}:${index}`,speaker:npc.id,clipId:`npc-${npc.id}-${index}`,...line}));
      if(generation!==this.generation)return;
      if(!lines.length)throw new Error(t('This content could not open. Try again.'));
      if(Object.values(lines[0].aligned?.glosses??{}).some(id=>!lexemeById.has(id)))await this.prepareGlosses(lines[0]);
      this.ambient={npc,lines};this.beginner=this.options.beginnerMode?.()??needsBeginnerStorySupport(this.options.progress());
      this.index=0;this.translated=false;this.error='';this.busy=false;this.render(true);
    } catch(error){if(generation===this.generation)this.options.onError?.((error as Error).message);}
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
  private render(voice = false, rate?: number, focusGate = voice) {
    const powers = lanternRewards(this.options.progress());
    const audioEnabled = this.options.audioEnabled();
    if (this.ambient) {
      const { npc, lines } = this.ambient, source = lines[this.index], line = this.options.prepareLine?.(source) ?? source, atEnd = this.index === lines.length - 1;
      this.view.render({ audioEnabled, title: t('A CONVERSATION IN THE TOWN'), meanings:contentMeanings(line.aligned), line, name: this.options.playerName(), npc, portrait: this.options.portrait(npc.id,line.expression ?? 'neutral'), index:this.index,total:lines.length,help:this.translationVisible(line),busy:false,glosses:this.options.glosses?.(line.german)??{},powers,wordlight:this.wordlight,choices:atEnd?[{id:'practice',german:'Ich möchte üben.',english:'I would like to practise.',next:'',effects:[]},{id:'leave',german:'Bis später!',english:'See you later!',next:'',effects:[]}]:[] });
      if (voice) { this.options.onOpen(npc.id); if (audioEnabled) this.options.speak(line.german,npc.id,line.clipId,false,rate); }
      return;
    }
    const graph = this.graph; if (!graph) return;
    const state = storyState(this.options.progress().story), lines = this.artifact ? [{ ...this.artifact, id: this.artifact.objectId, speaker: 'Evidence', german: this.artifact.german, english: this.artifact.english, clipId: `artifact-${graph.questId}-${this.artifact.objectId}` }] : this.topic ? this.topic.lines.filter(line => conditionMet(line.condition, state)) : dialogueLines(this.node!, state);
    const source = lines[this.index]; if (!source) return;
    const presented = this.replyCorrection ?? source;
    const prepared = this.options.prepareLine?.(presented) ?? presented;
    const line=prepared.aligned&&prepared.aligned.de.text!==prepared.german?{...prepared,aligned:undefined}:prepared;
    const atEnd = this.index === lines.length - 1;
    const gateSource = !this.replay && this.node?.stage === 'gate' && atEnd ? quests.find(q => q.id === graph.questId)!.exercises.find(ex => ex.id === graph.gateExerciseId) : undefined;
    const gate = gateSource && localizedExercise(gateSource);
    const reply = !this.replay && !this.artifact && source.reply && !state.flags[`reply:${source.reply.exerciseId}`] ? quests.find(q => q.id === graph.questId)!.exercises.find(ex => ex.id === source.reply!.exerciseId) : undefined;
    const guidedGate = gate && this.beginner && beginnerGateChoices(gate.id).length > 0;
    if (this.beginner && !this.replay) this.hinted = true;
    const topicMenu = !this.topic && !this.artifact && !guidedGate && !reply && atEnd && this.node?.stage === 'intro' ? this.topicChoices(graph, state) : [];
    const choices = guidedGate ? beginnerGateChoices(gate.id) : topicMenu.length ? topicMenu : reply ? (reply.options ?? []).map(german => ({ id: german, german, english: this.beginner ? beginnerReplyMeaning(german) ?? '' : '',...beginnerReplyContent(german), next: '', effects: [] })) : !this.artifact && atEnd ? dialogueChoices(this.node!, state) : [];
    this.view.render({ audioEnabled, meanings:contentMeanings(line.aligned), title: this.artifact ? t('READ THE EVIDENCE') : localized(quests.find(q => q.id === graph.questId)!.title), line, name: this.options.playerName(), npc: npcs.find(npc => npc.id === line.speaker), portrait: this.artifact ? '' : this.options.portrait(line.speaker,line.expression ?? 'neutral'), index: this.index, total: lines.length, help: this.translationVisible(line), busy: this.busy, error: this.error, glosses: { ...(this.options.glosses?.(line.german) ?? {}), ...localizedGlosses(line.glosses ?? {}) }, powers,wordlight:this.wordlight, grammar: gate && !guidedGate ? this.options.grammar?.(graph.questId) ?? grammarForQuest(graph.questId) : undefined, grammarShown:this.grammarShown, answerShown:this.answerShown, choices, gate: guidedGate ? undefined : gate, choicePrompt: guidedGate ? localized(graph.gatePrompt) : undefined, gatePrompt: localized(graph.gatePrompt), advanceLabel: this.topic ? t('Back to the conversation') : this.artifact ? this.replay ? t('Return to the investigation') : t('Record this evidence') : atEnd && this.node?.stage === 'intro' && !this.replay ? t('Examine the evidence') : atEnd && this.node?.terminal ? t('Keep exploring') : t('Continue') });
    if (voice) { this.options.onOpen(line.speaker === 'Evidence' ? '' : line.speaker); if (audioEnabled) this.options.speak(personalized(line.german, this.options.playerName()), line.speaker, line.clipId, line.german.includes('{name}'),rate); }
    if (gate && focusGate) { this.startedAt = performance.now(); if (!guidedGate) this.view.focusGate(); }
  }
  /** Optional questions replace the continue button until the player moves on. */
  private topicChoices(graph: QuestGraph, state: ReturnType<typeof storyState>) {
    const topics = dialogueTopics(graph, state);
    if (!topics.length) return [];
    const continueEnglish = !this.replay && !this.allInspected() ? t('Examine the evidence') : t('Continue');
    return [
      ...topics.map(topic => ({ id: `topic:${topic.id}`, german: topic.german, english: topic.english, aligned:topic.aligned, next: '', effects: [] })),
      { id: 'topic-continue', german: 'Weiter.', english: continueEnglish, next: '', effects: [], localized: true },
    ];
  }
  private async action(action: string) {
    const generation = this.generation;
    if (action === 'retry') {await this.present(true);return;}
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
      if (action === 'next' && this.index + 1 < this.ambient.lines.length) { this.index++; this.translated = false; await this.present(true); }
      return;
    }
    if (!this.graph || this.busy) return;
    if ((action === 'show-answer' || action === 'use-answer') && this.node?.stage === 'gate' && !this.replay) {
      const ex = quests.find(q => q.id === this.graph!.questId)!.exercises.find(ex => ex.id === this.graph!.gateExerciseId)!;
      if (action === 'show-answer') {
        this.answerShown = !this.answerShown;
        if (this.answerShown) {this.hint();if(!ex.answer){this.busy=true;this.render();try{const reveal=await this.options.api.request<AttemptResult&{modelAnswer?:string;explanation?:string}>('/attempt',{id:crypto.randomUUID(),exerciseId:ex.id,itemId:ex.itemId,questId:this.graph.questId,reveal:true,hinted:true,answer:'',mode:'production',sceneAttempt:true});this.options.onProgress(reveal.progress);if(generation!==this.generation)return;ex.answer=reveal.modelAnswer??reveal.correctedAnswer;ex.explanation=reveal.explanation;}catch(error){this.error=error instanceof Error?error.message:t('This content could not open. Try again.');this.answerShown=false;}finally{if(generation===this.generation)this.busy=false;}}}
        this.render();
        if (this.answerShown) this.view.revealGateAnswer();
      } else if (this.answerShown) {
        if(ex.answer)this.view.fillGate(ex.answer);
      }
      return;
    }
    if (action === 'grammar' && this.node?.stage === 'gate') { const note = this.options.grammar?.(this.graph.questId) ?? grammarForQuest(this.graph.questId); this.grammarShown = !this.grammarShown; this.hint(); this.render(); if(note && this.grammarShown) this.options.speak(note.german,quests.find(q=>q.id===this.graph!.questId)!.npcId,note.clipId,false); return; }
    if (action === 'guide') { const note = grammarForQuest(this.graph.questId); if(note) this.options.onGrammarGuide?.(note.guideId); return; }
    if (action === 'translate') { this.translated = !this.translated; if (this.translated) this.hint(); this.render(); return; }
    if (action === 'hint') { this.hint(); const ex = quests.find(q => q.id === this.graph!.questId)!.exercises.find(ex => ex.id === this.graph!.gateExerciseId)!; this.error = localizedExercise(ex).hint; this.render(); return; }
    if (action === 'listen') { this.render(true); return; }
    if (action !== 'next') return;
    if (this.topic) {
      const lines = this.topic.lines.filter(line => conditionMet(line.condition, storyState(this.options.progress().story)));
      if (this.index + 1 < lines.length) { this.index++; this.translated = false; await this.present(true); return; }
      this.index = this.topic.returnTo; this.topic = undefined; this.translated = false; this.error = ''; this.render(false); return;
    }
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
    if (this.index + 1 < lines.length) { this.index++; this.translated = false; this.error = ''; await this.present(true); return; }
    if (this.node!.stage === 'intro' && !this.replay && !this.allInspected()) { const graph = this.graph; this.close(); this.options.onInvestigate(graph); return; }
    if (this.node!.terminal) { this.close(); return; }
    const next = this.node!.next;
    if (!next) return;
    if (!this.replay && this.node!.stage === 'intro') { await this.transition('intro'); if (generation !== this.generation || this.error || !this.graph) return; }
    this.node = this.graph.nodes.find(node => node.id === next)!; this.index = 0; this.translated = false; this.error = ''; await this.present(true);
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
    catch (error) { if (generation === this.generation) this.error = error instanceof Error ? error.message : t('The route could not save. Try again.'); }
    finally { if (generation === this.generation) { this.busy = false; this.render(); } }
  }
  private async transition(nodeId: 'intro' | 'gate' | 'choice', extra?: { attemptId?: string; choiceId?: string }) {
    const questId = this.graph!.questId, key = `${questId}:${nodeId}:${extra?.choiceId ?? extra?.attemptId ?? ''}`;
    const node=this.graph!.nodes.find(node=>node.stage===nodeId);
    await this.command(key, () => this.options.api.storyTransition({ id: this.commandId(key), questId, nodeId:node?.id??nodeId, ...extra }));
  }
  private async answer(answer: string, guidedChoice = false) {
    if (!this.graph || this.busy || !answer.trim() || this.node?.stage !== 'gate') return;
    const graph = this.graph, ex = quests.find(q => q.id === graph.questId)!.exercises.find(ex => ex.id === graph.gateExerciseId)!, generation = this.generation;
    if (this.beginner && beginnerGateChoices(ex.id).length > 0 && (!guidedChoice || !beginnerGateChoices(ex.id).some(choice => choice.id === answer))) return;
    if (this.gateProof) {
      await this.transition('gate', { attemptId: this.gateProof });
      if (generation === this.generation && !this.error && this.graph === graph) { this.node = nodeForStage(graph, 'choice'); this.index = 0; this.translated = false; await this.present(true); }
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
      if (!result.correct) { this.error = guidedChoice ? t('Try another reply. {meaning}', { meaning: localized({ english: ex.english, localized:ex.localized }) }) : attemptFeedback(ex, answer, result.reason); return; }
      this.gateProof = result.attemptId || input.id;
      this.busy = false;
      await this.transition('gate', { attemptId: this.gateProof });
      if (this.error || generation !== this.generation) return;
      this.node = nodeForStage(graph, 'choice'); this.index = 0; this.translated = false; await this.present(true);
    } catch (error) { if (generation === this.generation) this.error = error instanceof Error ? error.message : t('Your reply could not save. Try again.'); }
    finally { if (generation === this.generation) { this.busy = false; this.render(); } }
  }
  private async choose(id: string) {
    if (this.ambient) { const npcId = this.ambient.npc.id; this.close(); if (id === 'practice') this.options.onPractice?.(npcId); return; }
    if (!this.graph || this.busy || !this.node) return;
    if (id === 'topic-continue') { await this.action('next'); return; }
    if (id.startsWith('topic:') && this.node.stage === 'intro') {
      const state = storyState(this.options.progress().story), topic = dialogueTopics(this.graph, state).find(item => `topic:${item.id}` === id);
      if (!topic) return;
      if(!topic.lines.length&&topic.lineIds?.length)topic.lines=(await this.content.lines(topic.lineIds)).map(toDialogueLine);
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
      await this.transition('choice', { choiceId: id }); if (generation !== this.generation || this.error || this.graph !== graph) return;
      this.options.onComplete(graph, this.options.progress().xp - before, choice.effects);
    }
    this.node = this.graph.nodes.find(node => node.id === choice.next)!; this.index = 0; this.translated = false; this.error = ''; await this.present(true);
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
      else { this.hinted = true; if(!source.reply!.correction&&source.reply!.correctionLineId)source.reply!.correction=toDialogueLine((await this.content.lines([source.reply!.correctionLineId]))[0]);this.replyCorrection = source.reply!.correction; }
      this.busy = false; await this.present(true);
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
