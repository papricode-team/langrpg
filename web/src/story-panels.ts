import type { Progress } from './api';
import { storyState } from './dialogue';
import { questGraphs } from './quest-graph';
import { quests } from './content';
import { clueFor } from './story';
import { escapeHtml as e, icon } from './icons';
import { renderNarrative } from './sentence-translations';
import { baseLanguage, localized, t } from './i18n';

export const specialItems: Record<string, { title: string; text: string }> = {
  'successor-letter': { title: 'Elise’s letter', text: 'Elise named you as the next keeper. The warning follows her key; it does not accuse you of a forgotten crime.' },
  'lamplighter-key': { title: 'Otto’s Lamplighter key', text: 'Otto trusted you with the station archive. Your protection of his evidence brought the Lamplighters closer.' },
  'inspector-ledger': { title: 'The inspector’s ledger', text: 'A public record of what you reported to the Brass Office. Its entries can now be compared with the residents’ accounts.' },
  'restored-atlas': { title: 'The restored Lantern Atlas', text: 'Three towns keep their names. The route now rests on a public promise, and an unnamed coastline appears beyond it.' },
};
export const endings: Record<string, { title: string; text: string }> = {
  'routes-reopened': { title: 'The routes reopen', text: 'Otto and Marta reopen the routes and publish the timetable. Families can return today; the towns must still resolve each disputed change. The unnamed coast has no safe timetable yet.' },
  'towns-consent': { title: 'The towns choose', text: 'Each town has a voice in the Atlas; the key stays in public custody. Greta and Lina seek answers from the coast before opening its route. Nobody can decide for its residents, even when waiting is difficult.' },
  'brass-reformed': { title: 'The Brass Office changes', text: 'Ada opens the records to public challenge. Voss gives up his stamp, but his signatures remain as evidence. The towns gain an accountable office; keeping it honest becomes their daily work.' },
};
export function evidenceBoard(progress: Progress): string {
  const state = storyState(progress.story);
  const inventory = state.inventory.map(id => {
    const special = specialItems[id], graph = questGraphs.find(graph => graph.evidenceItem === id), clue = graph && clueFor(graph.questId);
    return `<details class="evidence-card"><summary><h3>${e(localized(special?.title ?? clue?.title ?? id))}</h3>${icon('chevron')}</summary><div class="evidence-detail"><p>${special ? e(localized(special.text)) : clue ? renderNarrative(clue.text) : e(t('A piece of evidence from your route.'))}</p>${graph ? `<button class="text-button" data-replay-dialogue="${graph.questId}">${e(t('Hear the witness again'))}</button>` : ''}</div></details>`;
  }).join('');
  const ending = state.ending ? `<details class="ending-card"><summary><h3>${e(endings[state.ending] ? localized(endings[state.ending].title) : t('A new promise'))}</h3>${icon('chevron')}</summary><p>${e(endings[state.ending] ? localized(endings[state.ending].text) : t('A new promise'))}</p></details>` : '';
  const factions = [['brassOffice', t('Brass Office')], ['lamplighters', t('Lamplighters')], ['unwritten', t('Unwritten Circle')]] as const;
  const reputation = factions.filter(([id]) => state.reputation[id] !== 0).map(([id, name]) => `<div><strong>${e(name)}</strong><span>${e(t('Trust {value}', { value: state.reputation[id] }))}</span></div>`).join('');
  return `<section><h2>${e(t('Evidence'))}</h2>${reputation ? `<div class="faction-board">${reputation}</div>` : ''}${ending}<div class="evidence-grid">${inventory || `<p>${e(t('Your first conversation begins the case. Meet Otto at the station.'))}</p>`}</div></section>`;
}
export function optionalStoryPractice(progress: Progress): string {
  const available = quests.filter(q => q.exercises.length && (progress.completedQuestIds.includes(q.id) || progress.story?.nodes[q.id]));
  if (!available.length) return '';
  return `<section><h3>${e(t('Expressions from your journey'))}</h3><div class="optional-story-practice">${available.map(q => `<button data-practice-quest="${q.id}"><strong>${e(localized(q.title))}</strong>${icon('arrow')}</button>`).join('')}</div></section>`;
}
export function saveSlotsMarkup(saves: { slot: string; name: string; at: string }[]): string {
  return `<section><h3>${e(t('Story saves'))}</h3><div class="save-slots">${['1','2','3'].map(slot => { const save = saves.find(save => save.slot === slot); return `<article><label for="save-name-${slot}">${e(t('Story {slot}', { slot }))}</label><input class="name-input" id="save-name-${slot}" maxlength="40" value="${e(save?.name ?? t('My story {slot}', { slot }))}"/>${save ? `<span class="save-time">${e(new Date(save.at).toLocaleString(baseLanguage()))}</span>` : ''}<button class="outline-button" data-save-story="${slot}">${e(t('Save here'))}</button>${save ? `<button class="text-button" data-load-story="${slot}">${e(t('Return to this story'))}</button>` : ''}</article>`; }).join('')}</div></section>`;
}
