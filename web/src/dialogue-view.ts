import type { DialogueLine, DialogueChoice } from './dialogue';
import { personalized } from './dialogue';
import { escapeHtml as e, icon } from './icons';
import type { Exercise, NPC } from './content';
import './dialogue.css';
import type { LanternRewards } from './lantern-rewards';
import type { ContextualGrammar } from './contextual-grammar';
import { personalizeAlignedLine, renderAlignedGerman, renderAlignedMeaning, renderAlignedLine } from './aligned-line';
import { getContentClient } from './content-api';
import { localizedName, supportText, t } from './i18n';

interface WordLookup { word: string; index: number; gloss: string; choiceId?:string; }
/** A line already spoken in this conversation, kept above the current one. */
export interface DialogueHistoryEntry { speaker: string; german: string; player?: boolean; }
const HISTORY_LIMIT = 30;

export interface DialoguePresentation {
  title: string; line: DialogueLine; name: string; npc?: NPC; portrait: string;
  index: number; total: number; help: boolean; busy: boolean; error?: string;
  glosses: Record<string, string>; meanings?: Readonly<Record<string, string>>; choices?: DialogueChoice[];
  choicePrompt?: string;
  lookup?: WordLookup;
  audioEnabled?: boolean;
  answerShown?: boolean;
  gate?: Exercise; gatePrompt?: string; advanceLabel?: string; powers?: LanternRewards; wordlight?: boolean; grammar?: ContextualGrammar; grammarShown?: boolean;
  history?: DialogueHistoryEntry[];
}
function speakerOf(p: DialoguePresentation): string {
  return p.npc ? localizedName(p.npc.name) : p.line.speaker === 'Evidence' ? t('Evidence') : p.line.speaker;
}
function historyMarkup(history: DialogueHistoryEntry[] | undefined): string {
  if (!history?.length) return '';
  return `<ol class="dialogue-history" aria-label="${e(t('Earlier in this conversation'))}">${history.map(entry => `<li class="${entry.player ? 'is-player' : ''}"><span class="caption">${e(entry.speaker)}</span><span lang="de">${e(entry.german)}</span></li>`).join('')}</ol>`;
}
function choiceMarkup(choice:DialogueChoice,p:DialoguePresentation):string {
  const german=personalized(choice.german,p.name),meaning=choice.english?supportText(choice):undefined;
  const selected=p.lookup?.choiceId===choice.id?p.lookup.index:undefined;
  const aligned=choice.aligned&&personalizeAlignedLine(choice.aligned,p.name);
  const phrase=aligned?renderAlignedLine(aligned,{selectedToken:selected,showMeaning:p.help||selected!==undefined,wordlight:p.wordlight,meanings:p.meanings})
    :`<span lang="de">${e(german)}</span>${p.help&&meaning?.text?`<span class="dialogue-choice-meaning" lang="${meaning.lang}">${e(personalized(meaning.text,p.name))}</span>`:''}`;
  return `<div class="dialogue-choice"><div class="dialogue-choice-phrase" data-dialogue-reply-line="${e(choice.id)}">${phrase}</div><button type="button" class="outline-button" data-dialogue-choice="${e(choice.id)}" aria-label="${e(german)}" ${p.busy?'disabled':''}>${e(t('Say it'))} ${icon('arrow')}</button></div>`;
}
export function dialogueMarkup(p: DialoguePresentation): string {
  const text = personalized(p.line.german, p.name);
  const support = supportText(p.line);
  const english = personalized(support.text, p.name);
  const aligned = p.line.aligned && personalizeAlignedLine(p.line.aligned, p.name);
  const options = { selectedToken: p.lookup?.choiceId===undefined?p.lookup?.index:undefined, wordlight: p.wordlight, meanings: p.meanings };
  const tokens = aligned ? renderAlignedGerman(aligned, options) : e(text);
  const translated = aligned ? renderAlignedMeaning(aligned, options) : e(english);
  const wordGloss = p.lookup?.choiceId===undefined&&p.lookup?.gloss ? `<span class="dialogue-word-gloss"><strong lang="de">${e(p.lookup.word)}</strong> ${e(p.lookup.gloss)}</span>` : '';
  const translationVisible = p.help || (!!p.lookup&&p.lookup.choiceId===undefined);
  const translation = translationVisible ? `<p class="dialogue-translation" lang="${support.lang}" role="status">${wordGloss}${translated}</p>` : '';
  const audioEnabled = p.audioEnabled !== false;
  const audioToggle = `<button type="button" class="dialogue-audio" data-dialogue-action="audio" aria-label="${e(t('Dialogue audio'))}" aria-pressed="${audioEnabled}" title="${e(audioEnabled ? t('Audio on. Click to disable.') : t('Audio off. Click to enable.'))}">${icon(audioEnabled ? 'volume' : 'muted')}</button>`;
  const gateMeaning = p.gate ? supportText({ german: p.gate.answer ?? '', english: p.gate.english }) : undefined;
  const answerHelp = p.gate && p.answerShown ? `<aside id="dialogue-exact-answer" class="dialogue-answer-help" role="status"><strong>${e(t('Exact answer'))}</strong><p lang="de">${e(p.gate.answer ?? '')}</p><span lang="${gateMeaning!.lang}">${e(gateMeaning!.text)}</span><button type="button" class="outline-button" data-dialogue-action="use-answer" ${p.busy ? 'disabled' : ''}>${e(t('Use this answer'))} ${icon('arrow')}</button><span class="caption">${e(t('You can use this reply to continue. This counts as assisted practice.'))}</span></aside>` : '';
  const grammarMeaning = p.grammar ? supportText({ german: p.grammar.german, english: p.grammar.english }) : undefined;
  const speaker = speakerOf(p);
  return `<section class="world-dialogue" aria-label="${e(t('Conversation with {name}', { name: speaker }))}"><div class="dialogue-heading">${p.portrait}<div><span class="caption">${e(p.title)}</span><h2>${e(speaker)}</h2></div>${audioToggle}<button type="button" class="dialogue-close" data-dialogue-action="close" aria-label="${e(t('Leave conversation'))}">${icon('close')}</button></div>${historyMarkup(p.history)}<p class="dialogue-line" lang="de">${tokens}</p>${translation}<div class="dialogue-tools"><button type="button" data-dialogue-action="listen" aria-label="${e(t('Listen to this line'))}" ${audioEnabled ? '' : 'disabled'}>${icon('volume')} ${e(t('Listen again'))}</button><button type="button" data-dialogue-action="translate" aria-pressed="${translationVisible}">${e(t('What did they say?'))}</button>${p.powers?.echo ? `<button type="button" data-dialogue-action="slow" ${audioEnabled ? '' : 'disabled'}>${e(t('Echo · slower'))}</button>` : ''}${p.powers?.wordlight ? `<button type="button" data-dialogue-action="wordlight" aria-pressed="${!!p.wordlight}">${e(t('Wordlight'))}</button>` : ''}<span>${p.index + 1} / ${p.total}</span></div>${p.error ? `<p class="dialogue-feedback" role="alert">${e(p.error)}</p>` : ''}${p.gate ? `<form class="dialogue-gate"><label for="dialogue-answer">${e(p.gatePrompt ?? p.gate.prompt)}</label><div><input id="dialogue-answer" name="answer" autocomplete="off" autocapitalize="off" spellcheck="false" lang="de" required maxlength="240" aria-describedby="dialogue-gate-help" ${p.busy ? 'disabled' : ''}/><button class="primary-button" type="submit" ${p.busy ? 'disabled' : ''}>${e(p.busy ? t('Saving…') : t('Say it'))} ${icon('arrow')}</button></div><span id="dialogue-gate-help">${e(t('Type your reply in German. Capitalize German nouns and formal Sie. You can use ae, oe and ue for umlauts.'))}</span><div class="dialogue-hint-tools"><button type="button" class="text-button" data-dialogue-action="hint">${e(t('A little help'))}</button>${p.grammar ? `<button type="button" class="text-button" data-dialogue-action="grammar">${e(t('Why this phrase?'))}</button>` : ''}<button type="button" class="text-button" data-dialogue-action="show-answer" aria-expanded="${!!p.answerShown}" ${p.answerShown ? 'aria-controls="dialogue-exact-answer"' : ''} ${p.busy ? 'disabled' : ''}>${e(p.answerShown ? t('Hide exact answer') : t('Show exact answer'))}</button></div>${answerHelp}${p.grammar && p.grammarShown ? `<aside class="dialogue-grammar"><strong lang="de">${e(p.grammar.german)}</strong><p lang="${grammarMeaning!.lang}">${e(grammarMeaning!.text)}</p>${p.grammar.explanation ? `<span class="caption">${e(p.grammar.explanation)}</span>` : ''}${p.grammar.note ? `<span class="dialogue-grammar-note"><strong>${e(t('For Turkish speakers'))}</strong> ${e(p.grammar.note)}</span>` : ''}<button type="button" class="text-button" data-dialogue-action="guide">${e(p.grammar.title ? t('Read {title}', { title: p.grammar.title }) : t('Read the grammar guide'))}</button></aside>` : ''}</form>` : p.choices?.length ? `<div class="dialogue-replies">${p.choicePrompt ? `<p class="dialogue-choice-prompt">${e(p.choicePrompt)}<span class="caption">${e(t('Choose a reply.'))}</span></p>` : ''}<div class="dialogue-choices" aria-label="${e(t('Your reply'))}">${p.choices.map(choice => choiceMarkup(choice,p)).join('')}</div></div>` : `<button type="button" class="primary-button dialogue-advance" data-dialogue-action="next" ${p.busy ? 'disabled' : ''}>${e(p.busy ? t('Saving…') : p.advanceLabel ?? t('Continue'))} ${icon('arrow')}</button>`}</section>`;
}

export class DialogueView {
  readonly host: HTMLDivElement;
  private presentation?: DialoguePresentation;
  private lookup?: WordLookup;
  private meanings: Record<string, string> = {};
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
        const choiceId=target.closest<HTMLElement>('[data-dialogue-reply-line]')?.dataset.dialogueReplyLine;
        this.lookup = { word: target.textContent ?? '', index: Number(target.dataset.dialogueWordIndex), gloss: target.dataset.dialogueGloss,choiceId };
        this.actions.gloss();
        this.render(this.presentation);
        const lexemeId = target.dataset.lexemeId, presentation = this.presentation, index = this.lookup.index;
        if (lexemeId && !this.meanings[lexemeId]) {
          let client: ReturnType<typeof getContentClient>;
          try { client = getContentClient(); } catch { return; }
          void client.lexemes([lexemeId]).then(([lexeme]) => {
            if (!lexeme || this.presentation?.line !== presentation.line) return;
            this.meanings[lexemeId] = lexeme.english;
            if (this.lookup?.index === index&&this.lookup.choiceId===choiceId) this.lookup.gloss = lexeme.english;
            this.render(this.presentation);
          }).catch(() => {
            if (this.presentation?.line === presentation.line) this.render({ ...this.presentation, error: t('This content could not open. Try again.') });
          });
        }
      }
    });
    this.host.addEventListener('submit', event => { event.preventDefault(); this.actions.answer(this.host.querySelector<HTMLInputElement>('#dialogue-answer')?.value ?? ''); });
    this.host.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        if (this.lookup && this.presentation) { this.lookup = undefined; this.render(this.presentation); }
        else this.actions.action('close');
        return;
      }
      const target = event.target instanceof HTMLElement ? event.target.closest<HTMLButtonElement>('[data-aligned-token]') : null;
      if (!target || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      const surface=target.closest('.aligned-line,.dialogue-line')??this.host;
      const words = [...surface.querySelectorAll<HTMLButtonElement>('[data-aligned-token]')];
      const index = words.indexOf(target);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? words.length - 1 : Math.max(0, Math.min(words.length - 1, index + (event.key === 'ArrowLeft' ? -1 : 1)));
      words[next]?.focus(); words[next]?.click(); event.preventDefault();
    });
  }
  render(presentation: DialoguePresentation) {
    const previous = this.presentation;
    // A new conversation starts a fresh log; moving on files the previous line into it.
    if (previous && previous.title !== presentation.title) { this.history = []; this.filed = undefined; }
    else if (previous && (previous.line.id !== presentation.line.id || previous.line.german !== presentation.line.german)) this.fileLine(previous);
    if (!previous || previous.line.id !== presentation.line.id || previous.line.clipId !== presentation.line.clipId || previous.line.german !== presentation.line.german || previous.line.english !== presentation.line.english || previous.name !== presentation.name) this.lookup = undefined;
    if (previous?.help && !presentation.help) this.lookup = undefined;
    if(this.lookup?.choiceId&&!presentation.choices?.some(choice=>choice.id===this.lookup?.choiceId))this.lookup=undefined;
    this.presentation = presentation;
    const input = this.host.querySelector<HTMLInputElement>('#dialogue-answer');
    const value = input?.value, focused = document.activeElement === input;
    const focusedWord = this.host.contains(document.activeElement) ? (document.activeElement as HTMLElement)?.dataset.dialogueWordIndex : undefined;
    const focusedReply = this.host.contains(document.activeElement) ? (document.activeElement as HTMLElement)?.closest<HTMLElement>('[data-dialogue-reply-line]')?.dataset.dialogueReplyLine : undefined;
    const focusedAction = this.host.contains(document.activeElement) ? (document.activeElement as HTMLElement)?.dataset.dialogueAction : undefined;
    const log = this.host.querySelector('.dialogue-history');
    const followLog = !log || log.scrollHeight - log.scrollTop - log.clientHeight < 8;
    this.host.innerHTML = dialogueMarkup({ ...presentation, lookup: this.lookup, meanings: { ...presentation.meanings, ...this.meanings }, history: this.history }); this.host.hidden = false;
    const nextLog = this.host.querySelector('.dialogue-history');
    if (nextLog) nextLog.scrollTop = followLog ? nextLog.scrollHeight : log!.scrollTop;
    const next = this.host.querySelector<HTMLInputElement>('#dialogue-answer');
    if (next && value !== undefined) next.value = value;
    if (next && focused) next.focus();
    else if (focusedWord !== undefined) {
      const surface=focusedReply===undefined?this.host.querySelector('.dialogue-line'):[...this.host.querySelectorAll<HTMLElement>('[data-dialogue-reply-line]')].find(value=>value.dataset.dialogueReplyLine===focusedReply);
      surface?.querySelector<HTMLButtonElement>(`[data-dialogue-word-index="${focusedWord}"]`)?.focus();
    }
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
  close() { this.host.hidden = true; this.host.innerHTML = ''; this.presentation = undefined; this.lookup = undefined; this.history = []; this.filed = undefined; this.meanings = {}; }
  destroy() { this.host.remove(); }
}
