import type { NPC, Quest } from './content';
import { journalNarratives, type StoryAct } from './story';
import { escapeHtml as e, icon } from './icons';
import { renderNarrative } from './sentence-translations';
import { localized, localizedName, t, upper } from './i18n';

type SideActivity = { id: string; icon: string; action: string };

export function npcEncounter(npc: NPC, region: string, portrait: string, activity: SideActivity, quest?: Quest, completed = false): string {
  return `<div class="encounter-scene">
    <aside class="encounter-character">${portrait}<span class="eyebrow">${e(region)}</span><span class="encounter-character-rule"></span></aside>
    <div class="encounter-conversation">
      <header class="encounter-heading">${portrait}<div class="eyebrow">${e(localized(npc.role))}</div><h2 id="encounter-title">${e(localizedName(npc.name))}</h2></header>
      <blockquote class="encounter-greeting">“${npc.greetingSentences ? renderNarrative(npc.greetingSentences) : e(npc.greeting)}”</blockquote>
      <button class="text-button encounter-listen" data-speak="${e(npc.greeting)}">${icon('volume')} ${e(t('Listen to greeting'))}</button>
      ${quest ? `<section class="encounter-story" aria-label="${e(t('Story quest'))}"><div class="encounter-story-meta"><span>${icon(completed ? 'check' : 'lantern')} ${e(completed ? t('STORY DISCOVERED') : t('STORY QUEST'))}</span><span>${quest.level}</span></div><h3>${e(localized(quest.title))}</h3><p>${e(localized(quest.subtitle))}</p><button class="primary-button" data-start-quest="${e(quest.id)}" autofocus>${e(completed ? t('Revisit this story') : t('Continue the story'))} ${icon('arrow')}</button></section>` : `<p class="encounter-rest">${e(t('There are more stories waiting along the route.'))}</p>`}
      <section class="encounter-side" aria-label="${e(t('Optional side activity'))}"><span class="eyebrow">${e(t('WHILE YOU’RE HERE'))} <span>· ${e(t('OPTIONAL'))}</span></span><button class="side-activity-button" data-activity="${e(activity.id)}">${icon(activity.icon)}<span>${e(activity.action)}</span>${icon('chevron')}</button></section>
    </div>
    <footer class="encounter-footer"><span>${icon('chat')} ${e(t('A CONVERSATION IN {place}', { place: upper(region) }))}</span><button class="text-button" data-action="close-dialog">${e(t('Leave conversation'))} ${icon('arrow')}</button></footer>
  </div>`;
}

export function adventureHome(options: { act: StoryAct; region: string; regionArt: string; quest: Quest; npc: NPC; portrait: string; completed: number; total: number; nextRegion?: string; clueCount: number; dueCount: number }): string {
  const { act, region, regionArt, quest, npc, portrait, completed, total, nextRegion, clueCount, dueCount } = options;
  const finished = completed === total;
  return `<div class="journey-home">
    <section class="journey-hero" style="--journey-art:url('${e(regionArt)}')" aria-label="${e(t('Continue your story'))}">
      <div class="journey-hero-copy"><div class="eyebrow">${e(t('THE MAIN STORY'))} <span> / </span> ${e(t('ACT {number}', { number: act.number }))} · ${e(region)}</div><h2>${e(localized(act.title))}</h2><p>${renderNarrative(act.goal)}</p>
        <div class="journey-next">${portrait}<div><span>${e(finished ? t('CHAPTER COMPLETE') : t('YOUR NEXT CONVERSATION'))}</span><h3>${e(finished ? nextRegion ? t('The road to {place}', { place: nextRegion }) : t('The Atlas remembers') : localized(quest.title))}</h3><p>${finished ? renderNarrative(journalNarratives.routeRestored) : `${e(localizedName(npc.name))} · ${e(localized(quest.location))}`}</p></div></div>
        <button class="primary-button" ${finished ? 'data-action="next-objective"' : `data-follow-quest="${e(quest.id)}"`}>${e(finished ? nextRegion ? t('Continue to the next chapter') : t('Read your discoveries') : t('Continue the story'))} ${icon('arrow')}</button>
        <div class="journey-progress"><span>${e(t('{done} / {total} STORIES DISCOVERED', { done: completed, total }))}</span><div role="progressbar" aria-label="${e(t('Chapter stories discovered'))}" aria-valuenow="${completed}" aria-valuemin="0" aria-valuemax="${total}">${Array.from({ length: total }, (_, i) => `<i class="${i < completed ? 'complete' : ''}"></i>`).join('')}</div></div>
      </div>
      <span class="journey-hero-caption">${icon('compass')} ${e(upper(region))} <span>THE LANTERN ATLAS</span></span>
    </section>
    <div class="journey-tools"><button data-view="quests">${icon('scroll')}<span><strong>${e(t('Story quests'))}</strong><small>${e(t('Follow the people behind the mystery'))}</small></span>${icon('chevron')}</button><button data-view="story">${icon('lantern')}<span><strong>${e(t('Discoveries'))}</strong><small>${e(clueCount === 1 ? t('{count} clue in your story journal', { count: clueCount }) : t('{count} clues in your story journal', { count: clueCount }))}</small></span>${icon('chevron')}</button><button data-view="atlas">${icon('map')}<span><strong>${e(t('Region atlas'))}</strong><small>${e(t('Explore the routes between towns'))}</small></span>${icon('chevron')}</button></div>
    <section class="journey-detours" aria-label="${e(t('Optional activities'))}"><div class="journey-section-label"><span class="eyebrow">${e(t('OFF THE MAIN PATH'))}</span><span>${e(t('Optional activities & practice'))}</span></div><div class="journey-tools"><button data-view="activities">${icon('cup')}<span><strong>${e(t('Side activities'))}</strong><small>${e(t('Café shifts, market trades & more'))}</small></span>${icon('chevron')}</button><button data-view="course">${icon('book')}<span><strong>${e(t('Learning routes'))}</strong><small>${e(t('Build your German at your own pace'))}</small></span>${icon('chevron')}</button><button data-view="journal">${icon('leaf')}<span><strong>${e(t('Your words'))}</strong><small>${e(dueCount ? t('{count} expressions ready to revisit', { count: dueCount }) : t('Your collected German'))}</small></span>${icon('chevron')}</button></div></section>
    <div class="camp-bottom"><button class="text-button" data-view="world">${e(t('Return to the world'))} ${icon('arrow')}</button><button class="text-button" data-action="act-intro">${e(t('Act opening'))}</button><button class="text-button" data-action="help">${icon('compass')} ${e(t('Controls & help'))}</button></div>
  </div>`;
}
