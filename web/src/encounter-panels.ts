import { baseLanguage } from './i18n';
import { escapeHtml as e, icon } from './icons';
import type { InteriorObjectSpec, InteriorSpec } from './interiors';
import { interiorConversationFor, interiorLineNarrative } from './interior-conversations';
import { renderNarrative } from './sentence-translations';

export interface InteriorEncounterOptions {
  room: InteriorSpec;
  object: InteriorObjectSpec;
  /** Root owns portrait rendering and the cast's current availability. */
  portraitMarkup?: string;
  /** Exactly one optional secondary link; no card or promotional metadata. */
  miniGame?: { id: string; title: string };
}

const copy = (english: string, turkish: string): string => baseLanguage() === 'tr' ? turkish : english;

export function renderInteriorEncounter({ room, object, portraitMarkup, miniGame }: InteriorEncounterOptions): string {
  const conversation = interiorConversationFor(object.id);
  const greeting = conversation?.nodes[conversation.start]?.line;
  const name = conversation?.name ?? object.label;
  const role = conversation ? copy(conversation.role.english, conversation.role.turkish) : room.germanName;
  const title = conversation ? copy(conversation.title.english, conversation.title.turkish) : object.sessionTitle;
  const words = object.vocabulary.map((word, index) => `<button class="word-chip" data-interior-word="${e(object.id)}" data-word-index="${index}" lang="de">${e([word.article, word.lemma].filter(Boolean).join(' '))}</button>`).join('');
  return `<div class="interior-encounter" data-interior-encounter="${e(object.id)}"><header class="interior-encounter-heading">${portraitMarkup ?? `<span class="interior-object-emblem">${icon(room.icon)}</span>`}<div><h2>${e(name)}</h2><p class="encounter-role">${e(role)}</p></div></header>${greeting ? `<blockquote class="interior-dialogue">${renderNarrative(interiorLineNarrative(greeting))}<button class="icon-button" data-speak="${e(greeting.german)}" aria-label="${e(copy('Listen', 'Dinle'))}">${icon('volume')}</button></blockquote>` : ''}${words ? `<div class="interior-word-chips" aria-label="${e(copy('Words', 'Sözcükler'))}">${words}</div>` : ''}<button class="primary-button interior-primary" data-practice-interior="${e(object.id)}">${e(title)} ${icon('arrow')}</button><div class="encounter-secondary">${miniGame ? `<button class="text-button" data-minigame="${e(miniGame.id)}">${e(copy('Play', 'Oyna'))} ${e(miniGame.title)}</button>` : ''}<button class="text-button interior-back" data-action="close-dialog">${e(copy('Leave', 'Ayrıl'))}</button></div></div>`;
}
