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

export function adventureHome(options: { act: StoryAct; region: string; regionArt: string; quest: Quest; npc: NPC; portrait: string; completed: number; total: number; nextRegion?: string; clueCount: number; dueCount: number }): string {
  const { act, regionArt, quest, portrait, completed, total, nextRegion } = options;
  const finished = completed === total;
  return `<div class="journey-home">
    <section class="journey-hero" style="--journey-art:url('${e(regionArt)}')" aria-label="${e(t('Continue your story'))}">
      <div class="journey-hero-copy"><h2>${e(localized(act.title))}</h2>
        <div class="journey-next">${portrait}<h3>${e(finished ? nextRegion ? t('The road to {place}', { place: nextRegion }) : t('The Atlas remembers') : localized(quest.title))}</h3></div>
        <button class="primary-button" ${finished ? 'data-action="next-objective"' : `data-follow-quest="${e(quest.id)}"`}>${e(t('Continue'))} ${icon('arrow')}</button>
      </div>
    </section>
    <div class="journey-tools">${([['atlas', 'compass', 'Map'], ['quests', 'scroll', 'Story'], ['course', 'book', 'Learn'], ['character', 'shirt', 'You']] as const).map(([view, glyph, label]) => `<button data-view="${view}">${icon(glyph)}<strong>${e(t(label))}</strong>${icon('chevron')}</button>`).join('')}</div>
  </div>`;
}
