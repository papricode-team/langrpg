import type { DialogueLine, DialogueChoice } from './dialogue';
import { canVoiceDialogue, personalized } from './dialogue';
import { escapeHtml as e, icon } from './icons';
import type { Exercise, NPC } from './content';
import './dialogue.css';
import type { LanternRewards } from './lantern-rewards';
import type { ContextualGrammar } from './contextual-grammar';
import { markTranslation, presentSentence, renderTranslatedSentence, sourceSentenceMarkup, wordTargetRanges } from './translated-sentence';
import { localizedName, supportText, t, targetLanguage } from './i18n';

interface WordLookup { word: string; index: number; gloss: string; }
/** A line already spoken in this conversation, kept above the current one. */
export interface DialogueHistoryEntry { speaker: string; german: string; player?: boolean; }
const HISTORY_LIMIT = 30;

export interface DialoguePresentation {
  title: string; line: DialogueLine; name: string; npc?: NPC; portrait: string;
  index: number; total: number; help: boolean; busy: boolean; error?: string;
  glosses: Record<string, string>; choices?: DialogueChoice[];
  choicePrompt?: string;
  lookup?: WordLookup;
  audioEnabled?: boolean;
  answerShown?: boolean;
  /** Recorded feedback returned by /attempt, never an embedded exercise answer. */
  exactAnswer?: string;
  answerAvailable?: boolean;
  gate?: Exercise; gatePrompt?: string; advanceLabel?: string; powers?: LanternRewards; wordlight?: boolean; grammar?: ContextualGrammar; grammarShown?: boolean;
  history?: DialogueHistoryEntry[];
}
function speakerOf(p: DialoguePresentation): string {
  return p.npc ? localizedName(p.npc.name) : p.line.speaker === 'Evidence' ? t('Evidence') : p.line.speaker;
}
function historyMarkup(history: DialogueHistoryEntry[] | undefined): string {
  if (!history?.length) return '';
  return `<ol class="dialogue-history" aria-label="${e(t('Earlier in this conversation'))}">${history.map(entry => `<li class="${entry.player ? 'is-player' : ''}"><span class="caption">${e(entry.speaker)}</span><span lang="${e(targetLanguage())}">${e(entry.german)}</span></li>`).join('')}</ol>`;
}
function choiceMarkup(choice: DialogueChoice, p: DialoguePresentation): string {
  const sentence = presentSentence(choice, p.name);
  if (sentence.sentence) return `<div class="dialogue-authored-choice">${renderTranslatedSentence(choice, p.name, p.help)}<button type="button" class="outline-button" data-dialogue-choice="${e(choice.id)}" aria-label="${e(personalized(choice.german,p.name))}" ${p.busy ? 'disabled' : ''}>${e(t('Say it'))} ${icon('arrow')}</button></div>`;
  const meaning = choice.english ? supportText(choice) : undefined;
  return `<button type="button" class="outline-button" data-dialogue-choice="${e(choice.id)}" ${p.busy ? 'disabled' : ''}><span lang="${e(sentence.target)}">${e(choice.german)}</span>${p.help && meaning?.text ? `<span class="caption" lang="${meaning.lang}">${e(meaning.text)}</span>` : ''}</button>`;
}
export function dialogueMarkup(p: DialoguePresentation): string {
  const sentence = presentSentence(p.line, p.name);
  const support = { text: sentence.translation, lang: sentence.supportLanguage };
  const tokens = sourceSentenceMarkup(sentence, { selectedIndex: p.lookup?.index, dialogue: true, wordlight: p.wordlight });
  const ranges = p.lookup ? wordTargetRanges(sentence, p.lookup.index) : [];
  const translated = markTranslation(sentence.translation, ranges);
  const wordGloss = p.lookup?.gloss ? `<span class="dialogue-word-gloss"><strong lang="${e(sentence.target)}">${e(p.lookup.word)}</strong> ${e(p.lookup.gloss)}</span>` : '';
  const translationVisible = p.help || !!p.lookup;
  const translation = translationVisible ? `<p class="dialogue-translation" lang="${support.lang}" role="status">${wordGloss}<span class="dialogue-translation-body">${translated}</span></p>` : '';
  const audioEnabled = p.audioEnabled !== false;
  const lineAudioEnabled = audioEnabled && canVoiceDialogue(p.line.german,p.line.audioRequires);
  const audioToggle = `<button type="button" class="dialogue-audio" data-dialogue-action="audio" aria-label="${e(t('Dialogue audio'))}" aria-pressed="${audioEnabled}" title="${e(audioEnabled ? t('Audio on. Click to disable.') : t('Audio off. Click to enable.'))}">${icon(audioEnabled ? 'volume' : 'muted')}</button>`;
  const answerHelp = p.gate && p.answerShown && p.exactAnswer ? `<aside id="dialogue-exact-answer" class="dialogue-answer-help" role="status"><strong>${e(t('Exact answer'))}</strong><p lang="${e(sentence.target)}">${e(p.exactAnswer)}</p><button type="button" class="outline-button" data-dialogue-action="use-answer" ${p.busy ? 'disabled' : ''}>${e(t('Use this answer'))} ${icon('arrow')}</button><span class="caption">${e(t('You can use this reply to continue. This counts as assisted practice.'))}</span></aside>` : '';
  const grammarMeaning = p.grammar ? supportText({ german: p.grammar.german, english: p.grammar.english }) : undefined;
  const speaker = speakerOf(p);
  return `<section class="world-dialogue" aria-label="${e(t('Conversation with {name}', { name: speaker }))}"><div class="dialogue-heading">${p.portrait}<div><span class="caption">${e(p.title)}</span><h2>${e(speaker)}</h2></div>${audioToggle}<button type="button" class="dialogue-close" data-dialogue-action="close" aria-label="${e(t('Leave conversation'))}">${icon('close')}</button></div>${historyMarkup(p.history)}<p class="dialogue-line" lang="${e(sentence.target)}">${tokens}</p>${translation}<div class="dialogue-tools"><button type="button" data-dialogue-action="listen" aria-label="${e(t('Listen to this line'))}" ${lineAudioEnabled ? '' : 'disabled'}>${icon('volume')} ${e(t('Listen again'))}</button><button type="button" data-dialogue-action="translate" aria-pressed="${translationVisible}">${e(t('What did they say?'))}</button>${p.powers?.echo ? `<button type="button" data-dialogue-action="slow" ${lineAudioEnabled ? '' : 'disabled'}>${e(t('Echo · slower'))}</button>` : ''}${p.powers?.wordlight ? `<button type="button" data-dialogue-action="wordlight" aria-pressed="${!!p.wordlight}">${e(t('Wordlight'))}</button>` : ''}<span>${p.index + 1} / ${p.total}</span></div>${p.error ? `<p class="dialogue-feedback" role="alert">${e(p.error)}</p>` : ''}${p.gate ? `<form class="dialogue-gate"><label for="dialogue-answer">${e(p.gatePrompt ?? p.gate.prompt)}</label><div><input id="dialogue-answer" name="answer" autocomplete="off" autocapitalize="off" spellcheck="false" lang="${e(sentence.target)}" required maxlength="240" aria-describedby="dialogue-gate-help" ${p.busy ? 'disabled' : ''}/><button class="primary-button" type="submit" ${p.busy ? 'disabled' : ''}>${e(p.busy ? t('Saving…') : t('Say it'))} ${icon('arrow')}</button></div><span id="dialogue-gate-help">${e(sentence.target === 'de' ? t('Type your reply in German. Capitalize German nouns and formal Sie. You can use ae, oe and ue for umlauts.') : t('Type your reply in {language}.', { language: sentence.target === 'en' ? t('English') : sentence.target }))}</span><div class="dialogue-hint-tools"><button type="button" class="text-button" data-dialogue-action="hint">${e(t('A little help'))}</button>${p.grammar ? `<button type="button" class="text-button" data-dialogue-action="grammar">${e(t('Why this phrase?'))}</button>` : ''}<button type="button" class="text-button" data-dialogue-action="show-answer" aria-expanded="${!!p.answerShown}" ${p.answerShown ? 'aria-controls="dialogue-exact-answer"' : ''} ${p.busy || !(p.answerAvailable || p.exactAnswer) ? 'disabled' : ''}>${e(p.answerShown ? t('Hide exact answer') : t('Show exact answer'))}</button></div>${answerHelp}${p.grammar && p.grammarShown ? `<aside class="dialogue-grammar"><strong lang="${e(sentence.target)}">${e(p.grammar.german)}</strong><p lang="${grammarMeaning!.lang}">${e(grammarMeaning!.text)}</p>${p.grammar.explanation ? `<span class="caption">${e(p.grammar.explanation)}</span>` : ''}${p.grammar.note ? `<span class="dialogue-grammar-note"><strong>${e(t('For Turkish speakers'))}</strong> ${e(p.grammar.note)}</span>` : ''}<button type="button" class="text-button" data-dialogue-action="guide">${e(p.grammar.title ? t('Read {title}', { title: p.grammar.title }) : t('Read the grammar guide'))}</button></aside>` : ''}</form>` : p.choices?.length ? `<div class="dialogue-replies">${p.choicePrompt ? `<p class="dialogue-choice-prompt">${e(p.choicePrompt)}<span class="caption">${e(t('Choose a reply.'))}</span></p>` : ''}<div class="dialogue-choices" aria-label="${e(t('Your reply'))}">${p.choices.map(choice => choiceMarkup(choice, p)).join('')}</div></div>` : `<button type="button" class="primary-button dialogue-advance" data-dialogue-action="next" ${p.busy ? 'disabled' : ''}>${e(p.busy ? t('Saving…') : p.advanceLabel ?? t('Continue'))} ${icon('arrow')}</button>`}</section>`;
}

export class DialogueView {
  readonly host: HTMLDivElement;
  private presentation?: DialoguePresentation;
  private lookup?: WordLookup;
  private history: DialogueHistoryEntry[] = [];
  private filed?: string;
  constructor(private actions: { action(action: string): void; choice(id: string): void; answer(value: string): void; gloss(): void }) {
    this.host = document.createElement('div'); this.host.className = 'dialogue-layer'; this.host.hidden = true;
    document.body.append(this.host);
    this.host.addEventListener('click', event => {
      const target = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
      if (!target || target.disabled) return;
      if (target.dataset.dialogueAction) this.actions.action(target.dataset.dialogueAction);
      if (target.dataset.dialogueChoice) {
        const reply = this.presentation?.choices?.find(choice => choice.id === target.dataset.dialogueChoice);
        if (reply) { this.fileLine(this.presentation!); this.remember({ speaker: t('You'), german: reply.german, player: true }); }
        this.actions.choice(target.dataset.dialogueChoice);
      }
      if (target.dataset.dialogueGloss !== undefined && this.presentation) {
        this.lookup = { word: target.textContent ?? '', index: Number(target.dataset.dialogueWordIndex), gloss: target.dataset.dialogueGloss };
        this.actions.gloss();
        this.render(this.presentation);
      }
    });
    this.host.addEventListener('submit', event => { event.preventDefault(); this.actions.answer(this.host.querySelector<HTMLInputElement>('#dialogue-answer')?.value ?? ''); });
    this.host.addEventListener('keydown', event => {
      const word = event.target instanceof HTMLElement ? event.target.closest<HTMLButtonElement>('[data-dialogue-word-index]') : null;
      if (word && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
        const words = [...this.host.querySelectorAll<HTMLButtonElement>('.dialogue-line [data-dialogue-word-index]')];
        const index = words.indexOf(word);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? words.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + words.length) % words.length;
        event.preventDefault(); event.stopPropagation(); words[next]?.focus(); words[next]?.click(); return;
      }
      if (event.key === 'Escape') { event.stopPropagation(); if (this.lookup && this.presentation) { this.lookup = undefined; this.render(this.presentation); } else this.actions.action('close'); }
    });
  }
  render(presentation: DialoguePresentation) {
    const previous = this.presentation;
    // A new conversation starts a fresh log; moving on files the previous line into it.
    if (previous && previous.title !== presentation.title) { this.history = []; this.filed = undefined; }
    else if (previous && (previous.line.id !== presentation.line.id || previous.line.german !== presentation.line.german)) this.fileLine(previous);
    if (!previous || previous.line.id !== presentation.line.id || previous.line.clipId !== presentation.line.clipId || previous.line.german !== presentation.line.german || previous.line.english !== presentation.line.english || previous.name !== presentation.name) this.lookup = undefined;
    if (previous?.help && !presentation.help) this.lookup = undefined;
    this.presentation = presentation;
    const input = this.host.querySelector<HTMLInputElement>('#dialogue-answer');
    const value = input?.value, focused = document.activeElement === input;
    const focusedWord = this.host.contains(document.activeElement) ? (document.activeElement as HTMLElement)?.dataset.dialogueWordIndex : undefined;
    const focusedAction = this.host.contains(document.activeElement) ? (document.activeElement as HTMLElement)?.dataset.dialogueAction : undefined;
    const log = this.host.querySelector('.dialogue-history');
    const followLog = !log || log.scrollHeight - log.scrollTop - log.clientHeight < 8;
    this.host.innerHTML = dialogueMarkup({ ...presentation, lookup: this.lookup, history: this.history }); this.host.hidden = false;
    const nextLog = this.host.querySelector('.dialogue-history');
    if (nextLog) nextLog.scrollTop = followLog ? nextLog.scrollHeight : log!.scrollTop;
    const next = this.host.querySelector<HTMLInputElement>('#dialogue-answer');
    if (next && value !== undefined) next.value = value;
    if (next && focused) next.focus();
    else if (focusedWord !== undefined) this.host.querySelector<HTMLButtonElement>(`[data-dialogue-word-index="${focusedWord}"]`)?.focus();
    else if (focusedAction !== undefined) this.host.querySelector<HTMLButtonElement>(`[data-dialogue-action="${focusedAction}"]`)?.focus();
  }
  private fileLine(p: DialoguePresentation) {
    const entry = { speaker: speakerOf(p), german: personalized(p.line.german, p.name) }, key = `${p.line.id}\n${entry.german}`;
    if (this.filed === key) return;
    this.filed = key;
    this.remember(entry);
  }
  private remember(entry: DialogueHistoryEntry) {
    this.history.push(entry);
    if (this.history.length > HISTORY_LIMIT) this.history.splice(0, this.history.length - HISTORY_LIMIT);
  }
  focusGate() { this.host.querySelector<HTMLInputElement>('#dialogue-answer')?.focus(); }
  revealGateAnswer() { this.host.querySelector('.dialogue-answer-help')?.scrollIntoView({ block: 'nearest' }); }
  fillGate(answer: string) {
    const input = this.host.querySelector<HTMLInputElement>('#dialogue-answer');
    if (!input || input.disabled) return;
    input.value = answer;
    input.removeAttribute('aria-invalid');
    input.focus();
    input.setSelectionRange(answer.length, answer.length);
  }
  close() { this.host.hidden = true; this.host.innerHTML = ''; this.presentation = undefined; this.lookup = undefined; this.history = []; this.filed = undefined; }
  destroy() { this.host.remove(); }
}
