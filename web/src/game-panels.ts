import type { NPC, Quest } from './content';
import type { StoryAct } from './story';
import { escapeHtml as e, icon } from './icons';
import { renderNarrative } from './sentence-translations';
import { localized, localizedName, t } from './i18n';

type SideActivity = { id: string; icon: string; action: string };

export function npcEncounter(npc: NPC, _region: string, portrait: string, activity: SideActivity, quest?: Quest, completed = false): string {
  return `<div class="encounter-scene">
    <div class="encounter-conversation">
      <header class="encounter-heading">${portrait}<div><h2 id="encounter-title">${e(localizedName(npc.name))}</h2><span class="encounter-role">${e(localized(npc.role.split('·')[0].trim()))}</span></div></header>
      <div class="encounter-line"><blockquote class="encounter-greeting">“${npc.greetingSentences ? renderNarrative(npc.greetingSentences) : e(npc.greeting)}”</blockquote><button class="text-button encounter-listen" data-speak="${e(npc.greeting)}" aria-label="${e(t('Listen to greeting'))}">${icon('volume')}</button></div>
      ${quest ? `<button class="primary-button" data-start-quest="${e(quest.id)}" autofocus>${e(completed ? t('Revisit this story') : localized(quest.title))} ${icon('arrow')}</button>` : ''}
    </div>
    <footer class="encounter-footer"><button class="text-button" data-activity="${e(activity.id)}">${icon(activity.icon)} ${e(activity.action)}</button><button class="text-button" data-action="close-dialog">${e(t('Leave'))}</button></footer>
  </div>`;
}

export interface AdventureHomeOptions {
  act: StoryAct;
  region: { name: string; subtitle: string; description: string; art: string };
  quest: Quest;
  npc: NPC;
  portrait: string;
  completed: number;
  total: number;
  nextRegion?: string;
  clueCount: number;
  dueCount: number;
  wordCount: number;
  townsOpen: number;
  townsTotal: number;
  places: { id: string; name: string; glyph: string }[];
  promise?: { title: string; done: number; target: number; lit: boolean };
}

/** Menu home: the story hero, the town you stand in, and live doorways into the rest of the game. */
export function adventureHome(options: AdventureHomeOptions): string {
  const { act, region, quest, npc, portrait, completed, total, nextRegion, clueCount, dueCount, wordCount, townsOpen, townsTotal, places, promise } = options;
  const finished = completed === total;
  const doorways: [string, string, string, string][] = [
    ['atlas', 'compass', t('Region atlas'), t('{done} / {total} towns open', { done: townsOpen, total: townsTotal })],
    ['story', 'lantern', t('Discoveries'), clueCount === 1 ? t('{count} clue in your story journal', { count: clueCount }) : t('{count} clues in your story journal', { count: clueCount })],
    ['journal', 'leaf', t('Your words'), dueCount ? t('{count} expressions ready to revisit', { count: dueCount }) : wordCount ? t('{count} words collected', { count: wordCount }) : t('Your collected German')],
    ['activities', 'cup', t('Side activities'), t('Café shifts, market trades & more')],
  ];
  return `<div class="journey-home">
    <section class="journey-hero" style="--journey-art:url('${e(region.art)}')" aria-label="${e(t('Continue your story'))}">
      <div class="journey-hero-copy">
        <span class="kicker">${e(t('ACT {number}', { number: act.number }))} · ${e(region.name.toUpperCase())} · ${e(act.level)}</span>
        <h2>${e(localized(act.title))}</h2>
        <p class="journey-goal">${renderNarrative(act.goal)}</p>
        <div class="journey-next">${portrait}<div><span class="kicker">${e(finished ? t('CHAPTER COMPLETE') : t('YOUR NEXT CONVERSATION'))}</span><h3>${e(finished ? nextRegion ? t('The road to {place}', { place: nextRegion }) : t('The Atlas remembers') : localized(quest.title))}</h3>${finished ? '' : `<p>${e(localizedName(npc.name))} · ${e(localized(quest.location))}</p>`}</div></div>
        <button class="primary-button journey-continue" ${finished ? 'data-action="next-objective"' : `data-follow-quest="${e(quest.id)}"`}>${e(finished ? nextRegion ? t('Continue to the next chapter') : t('Read your discoveries') : t('Continue the story'))} ${icon('arrow')}</button>
        <div class="journey-progress"><span>${e(t('{done} / {total} STORIES DISCOVERED', { done: completed, total }))}</span><div role="progressbar" aria-label="${e(t('Chapter stories discovered'))}" aria-valuenow="${completed}" aria-valuemin="0" aria-valuemax="${total}">${Array.from({ length: total }, (_, i) => `<i class="${i < completed ? 'complete' : i === completed ? 'next' : ''}"></i>`).join('')}</div></div>
      </div>
    </section>
    <aside class="journey-town" aria-label="${e(region.name)}">
      <header><span class="journey-town-crest">${icon('compass')}</span><div><h3>${e(region.name)}</h3><span class="kicker">${e(region.subtitle.toUpperCase())}</span></div></header>
      <p>${e(region.description)}</p>
      ${places.length ? `<div class="journey-places" aria-label="${e(t('Places'))}">${places.map(place => `<button data-focus-building="${e(place.id)}">${icon(place.glyph)}<span>${e(place.name)}</span></button>`).join('')}</div>` : ''}
      ${promise ? `<div class="journey-lantern${promise.lit ? ' lit' : ''}"><span class="journey-lantern-icon">${icon('lantern')}</span><div><strong>${e(promise.title)}</strong><span>${e(t('{done} / {total} connections today', { done: promise.done, total: promise.target }))}${promise.lit ? ` · ${e(t('lantern lit'))}` : ''}</span><span class="journey-lantern-meter"><i style="width:${Math.round(Math.min(1, promise.done / Math.max(1, promise.target)) * 100)}%"></i></span></div></div>` : ''}
    </aside>
    <nav class="journey-tools" aria-label="${e(t('Optional activities & practice'))}">${doorways.map(([view, glyph, label, detail]) => `<button data-view="${view}"><span class="journey-tool-icon">${icon(glyph)}</span><span class="journey-tool-copy"><strong>${e(label)}</strong><span>${e(detail)}</span></span>${icon('chevron')}</button>`).join('')}</nav>
  </div>`;
}
