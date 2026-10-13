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
    return `<article class="evidence-card"><small>${graph ? e(localized(quests.find(q => q.id === graph.questId)!.location)) : e(t('IN YOUR SATCHEL'))}</small><h3>${e(localized(special?.title ?? clue?.title ?? id))}</h3><p>${special ? e(localized(special.text)) : clue ? renderNarrative(clue.text) : e(t('A piece of evidence from your route.'))}</p>${graph ? `<button class="text-button" data-replay-dialogue="${graph.questId}">${e(t('Hear the witness again'))}</button>` : ''}</article>`;
  }).join('');
  const ending = state.ending ? `<article class="ending-card"><div class="eyebrow">${e(t('THE ATLAS REMEMBERS YOUR CHOICES'))}</div><h3>${e(endings[state.ending] ? localized(endings[state.ending].title) : t('A new promise'))}</h3><p>${e(endings[state.ending] ? localized(endings[state.ending].text) : t('The three towns share the keeper’s work. Each can question an entry, and no single signature can erase a town.'))}</p></article>` : '';
  const factions = [['brassOffice', t('Brass Office'), `${t('Inspector Voss')} · Ada`], ['lamplighters', t('Lamplighters'), 'Otto · Marta'], ['unwritten', t('Unwritten Circle'), 'Greta · Lina']] as const;
  return `<section><div class="eyebrow">${e(t('LETTERS, EVIDENCE & PROMISES'))}</div><h2>${e(t('Your satchel and case board'))}</h2><p>${e(t('Compare what the people and objects showed you. Every discovery connects to the next witness.'))}</p><div class="faction-board">${factions.map(([id,name,members]) => `<div><strong>${e(name)}</strong><small>${e(members)}</small><span>${e(t('Trust {value}', { value: state.reputation[id] }))}</span></div>`).join('')}</div>${ending}<div class="evidence-grid">${inventory || `<p>${e(t('Your first conversation begins the case. Meet Otto at the station.'))}</p>`}</div></section>`;
}
export function optionalStoryPractice(progress: Progress): string {
  return `<section><div class="eyebrow">${e(t('PRACTISE IN YOUR OWN TIME'))}</div><h3>${e(t('Expressions from your journey'))}</h3><p>${e(t('Return to a scene’s language when you want practice. Your story choices are already saved.'))}</p><div class="optional-story-practice">${quests.filter(q => progress.completedQuestIds.includes(q.id) || progress.story?.nodes[q.id]).map(q => `<button data-practice-quest="${q.id}"><span><strong>${e(localized(q.title))}</strong><small>${q.level} · ${e(t('{count} expressions', { count: q.exercises.length }))}</small></span>${icon('arrow')}</button>`).join('') || `<p>${e(t('Expressions appear here after your first investigation.'))}</p>`}</div></section>`;
}
export function saveSlotsMarkup(saves: { slot: string; name: string; at: string }[]): string {
  return `<section><h3>${e(t('Three places to return to'))}</h3><p>${e(t('Save a point in your story. Learning evidence stays with your character when you return to it.'))}</p><div class="save-slots">${['1','2','3'].map(slot => { const save = saves.find(save => save.slot === slot); return `<article><label for="save-name-${slot}">${e(t('Story {slot}', { slot }))}</label><input class="name-input" id="save-name-${slot}" maxlength="40" value="${e(save?.name ?? t('My story {slot}', { slot }))}"/><small>${save ? new Date(save.at).toLocaleString(baseLanguage()) : e(t('Empty story slot'))}</small><button class="outline-button" data-save-story="${slot}">${e(t('Save here'))}</button>${save ? `<button class="text-button" data-load-story="${slot}">${e(t('Return to this story'))}</button>` : ''}</article>`; }).join('')}</div></section>`;
}
