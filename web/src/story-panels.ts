import type { Progress } from './api';
import { storyState } from './dialogue';
import { questGraphs } from './quest-graph';
import { quests } from './content';
import { clueFor } from './story';
import { escapeHtml as e, icon } from './icons';
import { renderNarrative } from './sentence-translations';

const specialItems: Record<string, { title: string; text: string }> = {
  'successor-letter': { title: 'Elise’s letter', text: 'Elise named you as the next keeper. The warning follows her key; it does not accuse you of a forgotten crime.' },
  'lamplighter-key': { title: 'Otto’s Lamplighter key', text: 'Otto trusted you with the station archive. Your protection of his evidence brought the Lamplighters closer.' },
  'inspector-ledger': { title: 'The inspector’s ledger', text: 'A public record of what you reported to the Brass Office. Its entries can now be compared with the residents’ accounts.' },
  'restored-atlas': { title: 'The restored Lantern Atlas', text: 'Three towns keep their names. The route now rests on a public promise, and an unnamed coastline appears beyond it.' },
};
const endings: Record<string, { title: string; text: string }> = {
  'routes-reopened': { title: 'The routes reopen', text: 'The Lamplighters keep the restored routes open. Otto and Marta publish a timetable, while the towns can question every change.' },
  'towns-consent': { title: 'The towns choose', text: 'The Unwritten Circle keeps each town’s consent at the heart of the Atlas. Greta and Lina gather the residents’ voices before the coastline opens.' },
  'brass-reformed': { title: 'The Brass Office changes', text: 'The public evidence reshapes the Brass Office. Ada helps replace the inspector’s sealed orders with records that every resident can read and challenge.' },
};
export function evidenceBoard(progress: Progress): string {
  const state = storyState(progress.story);
  const inventory = state.inventory.map(id => {
    const special = specialItems[id], graph = questGraphs.find(graph => graph.evidenceItem === id), clue = graph && clueFor(graph.questId);
    return `<article class="evidence-card"><small>${graph ? e(quests.find(q => q.id === graph.questId)!.location) : 'IN YOUR SATCHEL'}</small><h3>${e(special?.title ?? clue?.title ?? id)}</h3><p>${special ? e(special.text) : clue ? renderNarrative(clue.text) : 'A piece of evidence from your route.'}</p>${graph ? `<button class="text-button" data-replay-dialogue="${graph.questId}">Hear the witness again</button>` : ''}</article>`;
  }).join('');
  const ending = state.ending ? `<article class="ending-card"><div class="eyebrow">THE ATLAS REMEMBERS YOUR CHOICES</div><h3>${e(endings[state.ending]?.title ?? 'A new promise')}</h3><p>${e(endings[state.ending]?.text ?? 'The three towns share the keeper’s work. Each can question an entry, and no single signature can erase a town.')}</p></article>` : '';
  return `<section><div class="eyebrow">LETTERS, EVIDENCE & PROMISES</div><h2>Your satchel and case board</h2><p>Compare what the people and objects showed you. Every discovery connects to the next witness.</p><div class="faction-board">${([['brassOffice','Brass Office','Inspector Voss · Ada'],['lamplighters','Lamplighters','Otto · Marta'],['unwritten','Unwritten Circle','Greta · Lina']] as const).map(([id,name,members]) => `<div><strong>${name}</strong><small>${members}</small><span>Trust ${state.reputation[id]}</span></div>`).join('')}</div>${ending}<div class="evidence-grid">${inventory || '<p>Your first conversation begins the case. Meet Otto at the station.</p>'}</div></section>`;
}
export function optionalStoryPractice(progress: Progress): string {
  return `<section><div class="eyebrow">PRACTISE IN YOUR OWN TIME</div><h3>Expressions from your journey</h3><p>Return to a scene’s language when you want practice. Your story choices are already saved.</p><div class="optional-story-practice">${quests.filter(q => progress.completedQuestIds.includes(q.id) || progress.story?.nodes[q.id]).map(q => `<button data-practice-quest="${q.id}"><span><strong>${e(q.title)}</strong><small>${q.level} · ${q.exercises.length} expressions</small></span>${icon('arrow')}</button>`).join('') || '<p>Expressions appear here after your first investigation.</p>'}</div></section>`;
}
export function saveSlotsMarkup(saves: { slot: string; name: string; at: string }[]): string {
  return `<section><h3>Three places to return to</h3><p>Save a point in your story. Learning evidence stays with your character when you return to it.</p><div class="save-slots">${['1','2','3'].map(slot => { const save = saves.find(save => save.slot === slot); return `<article><label for="save-name-${slot}">Story ${slot}</label><input class="name-input" id="save-name-${slot}" maxlength="40" value="${e(save?.name ?? `My story ${slot}`)}"/><small>${save ? new Date(save.at).toLocaleString() : 'Empty story slot'}</small><button class="outline-button" data-save-story="${slot}">Save here</button>${save ? `<button class="text-button" data-load-story="${slot}">Return to this story</button>` : ''}</article>`; }).join('')}</div></section>`;
}
