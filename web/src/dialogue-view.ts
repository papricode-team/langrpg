import type { DialogueLine, DialogueChoice } from './dialogue';
import { personalized } from './dialogue';
import { escapeHtml as e, icon } from './icons';
import type { Exercise, NPC } from './content';
import './dialogue.css';
import type { LanternRewards } from './lantern-rewards';
import type { ContextualGrammar } from './contextual-grammar';
import { translationHighlights } from './dialogue-translation';

interface WordLookup { word: string; index: number; gloss: string; }

export interface DialoguePresentation {
  title: string; line: DialogueLine; name: string; npc?: NPC; portrait: string;
  index: number; total: number; help: boolean; busy: boolean; error?: string;
  glosses: Record<string, string>; choices?: DialogueChoice[];
  lookup?: WordLookup;
  audioEnabled?: boolean;
  answerShown?: boolean;
  gate?: Exercise; gatePrompt?: string; advanceLabel?: string; powers?: LanternRewards; wordlight?: boolean; grammar?: ContextualGrammar; grammarShown?: boolean;
}
export function dialogueMarkup(p: DialoguePresentation): string {
  const text = personalized(p.line.german, p.name);
  const english = personalized(p.line.english, p.name);
  const tokens = text.split(/(\p{L}+)/u).map((token,index) => {
    const gloss = p.glosses[token.toLocaleLowerCase('de')];
    const selected = p.lookup?.index === index;
    return gloss ? `<button type="button" class="dialogue-word ${p.wordlight ? 'wordlight-lit' : ''} ${selected ? 'is-selected' : ''}" data-dialogue-gloss="${e(gloss)}" data-dialogue-word-index="${index}" aria-label="Meaning of ${e(token)}" aria-pressed="${selected}">${e(token)}</button>` : e(token);
  }).join('');
  const ranges = p.lookup ? translationHighlights({ german: text, english, word: p.lookup.word, gloss: p.lookup.gloss }) : [];
  let translated = '', cursor = 0;
  for (const range of ranges) {
    translated += `${e(english.slice(cursor,range.start))}<mark>${e(english.slice(range.start,range.end))}</mark>`;
    cursor = range.end;
  }
  translated += e(english.slice(cursor));
  const translation = p.help || p.lookup ? `<p class="dialogue-translation" lang="en" role="status">${translated}</p>` : '';
  const audioEnabled = p.audioEnabled !== false;
  const audioToggle = `<button type="button" class="dialogue-audio" data-dialogue-action="audio" aria-label="Dialogue audio" aria-pressed="${audioEnabled}" title="Audio ${audioEnabled ? 'on. Click to disable.' : 'off. Click to enable.'}">${icon(audioEnabled ? 'volume' : 'muted')}</button>`;
  const answerHelp = p.gate && p.answerShown ? `<aside id="dialogue-exact-answer" class="dialogue-answer-help" role="status"><strong>Exact answer</strong><p lang="de">${e(p.gate.answer)}</p><small>${e(p.gate.english)}</small><button type="button" class="outline-button" data-dialogue-action="use-answer" ${p.busy ? 'disabled' : ''}>Use this answer ${icon('arrow')}</button><small>You can use this reply to continue. This counts as assisted practice.</small></aside>` : '';
  return `<section class="world-dialogue" aria-label="Conversation with ${e(p.npc?.name ?? p.line.speaker)}"><div class="dialogue-heading">${p.portrait}<div><small>${e(p.title)}</small><h2>${e(p.npc?.name ?? p.line.speaker)}</h2></div>${audioToggle}<button type="button" class="dialogue-close" data-dialogue-action="close" aria-label="Leave conversation">${icon('close')}</button></div><p class="dialogue-line" lang="de">${tokens}</p>${translation}<div class="dialogue-tools"><button type="button" data-dialogue-action="listen" aria-label="Listen to this line" ${audioEnabled ? '' : 'disabled'}>${icon('volume')} Listen again</button><button type="button" data-dialogue-action="translate">What did they say?</button>${p.powers?.echo ? `<button type="button" data-dialogue-action="slow" ${audioEnabled ? '' : 'disabled'}>Echo · slower</button>` : ''}${p.powers?.wordlight ? `<button type="button" data-dialogue-action="wordlight" aria-pressed="${!!p.wordlight}">Wordlight</button>` : ''}<span>${p.index + 1} / ${p.total}</span></div>${p.error ? `<p class="dialogue-feedback" role="alert">${e(p.error)}</p>` : ''}${p.gate ? `<form class="dialogue-gate"><label for="dialogue-answer">${e(p.gatePrompt ?? p.gate.prompt)}</label><div><input id="dialogue-answer" name="answer" autocomplete="off" autocapitalize="off" spellcheck="false" lang="de" required maxlength="240" aria-describedby="dialogue-gate-help" ${p.busy ? 'disabled' : ''}/><button class="primary-button" type="submit" ${p.busy ? 'disabled' : ''}>${p.busy ? 'Saving…' : 'Say it'} ${icon('arrow')}</button></div><small id="dialogue-gate-help">Type your reply in German. Capitalize German nouns and formal Sie. You can use ae, oe and ue for umlauts.</small><div class="dialogue-hint-tools"><button type="button" class="text-button" data-dialogue-action="hint">A little help</button>${p.grammar ? '<button type="button" class="text-button" data-dialogue-action="grammar">Why this phrase?</button>' : ''}<button type="button" class="text-button" data-dialogue-action="show-answer" aria-expanded="${!!p.answerShown}" ${p.answerShown ? 'aria-controls="dialogue-exact-answer"' : ''} ${p.busy ? 'disabled' : ''}>${p.answerShown ? 'Hide exact answer' : 'Show exact answer'}</button></div>${answerHelp}${p.grammar && p.grammarShown ? `<aside class="dialogue-grammar"><strong lang="de">${e(p.grammar.german)}</strong><p>${e(p.grammar.english)}</p>${p.grammar.explanation ? `<small>${e(p.grammar.explanation)}</small>` : ''}<button type="button" class="text-button" data-dialogue-action="guide">Read ${e(p.grammar.title ?? 'the grammar guide')}</button></aside>` : ''}</form>` : p.choices?.length ? `<div class="dialogue-choices" aria-label="Your reply">${p.choices.map(choice => `<button type="button" class="outline-button" data-dialogue-choice="${e(choice.id)}" ${p.busy ? 'disabled' : ''}><span lang="de">${e(choice.german)}</span>${p.help ? `<small>${e(choice.english)}</small>` : ''}</button>`).join('')}</div>` : `<button type="button" class="primary-button dialogue-advance" data-dialogue-action="next" ${p.busy ? 'disabled' : ''}>${p.busy ? 'Saving…' : e(p.advanceLabel ?? 'Continue')} ${icon('arrow')}</button>`}</section>`;
}

export class DialogueView {
  readonly host: HTMLDivElement;
  private presentation?: DialoguePresentation;
  private lookup?: WordLookup;
  constructor(private actions: { action(action: string): void; choice(id: string): void; answer(value: string): void; gloss(): void }) {
    this.host = document.createElement('div'); this.host.className = 'dialogue-layer'; this.host.hidden = true;
    document.body.append(this.host);
    this.host.addEventListener('click', event => {
      const target = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
      if (!target || target.disabled) return;
      if (target.dataset.dialogueAction) this.actions.action(target.dataset.dialogueAction);
      if (target.dataset.dialogueChoice) this.actions.choice(target.dataset.dialogueChoice);
      if (target.dataset.dialogueGloss && this.presentation) {
        this.lookup = { word: target.textContent ?? '', index: Number(target.dataset.dialogueWordIndex), gloss: target.dataset.dialogueGloss };
        this.actions.gloss();
        this.render(this.presentation);
      }
    });
    this.host.addEventListener('submit', event => { event.preventDefault(); this.actions.answer(this.host.querySelector<HTMLInputElement>('#dialogue-answer')?.value ?? ''); });
    this.host.addEventListener('keydown', event => { if (event.key === 'Escape') { event.stopPropagation(); this.actions.action('close'); } });
  }
  render(presentation: DialoguePresentation) {
    const previous = this.presentation;
    if (!previous || previous.line.id !== presentation.line.id || previous.line.clipId !== presentation.line.clipId || previous.line.german !== presentation.line.german || previous.line.english !== presentation.line.english || previous.name !== presentation.name) this.lookup = undefined;
    this.presentation = presentation;
    const input = this.host.querySelector<HTMLInputElement>('#dialogue-answer');
    const value = input?.value, focused = document.activeElement === input;
    const focusedWord = this.host.contains(document.activeElement) ? (document.activeElement as HTMLElement)?.dataset.dialogueWordIndex : undefined;
    const focusedAction = this.host.contains(document.activeElement) ? (document.activeElement as HTMLElement)?.dataset.dialogueAction : undefined;
    this.host.innerHTML = dialogueMarkup({ ...presentation, lookup: this.lookup }); this.host.hidden = false;
    const next = this.host.querySelector<HTMLInputElement>('#dialogue-answer');
    if (next && value !== undefined) next.value = value;
    if (next && focused) next.focus();
    else if (focusedWord !== undefined) this.host.querySelector<HTMLButtonElement>(`[data-dialogue-word-index="${focusedWord}"]`)?.focus();
    else if (focusedAction !== undefined) this.host.querySelector<HTMLButtonElement>(`[data-dialogue-action="${focusedAction}"]`)?.focus();
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
  close() { this.host.hidden = true; this.host.innerHTML = ''; this.presentation = undefined; this.lookup = undefined; }
  destroy() { this.host.remove(); }
}
