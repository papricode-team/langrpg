import type { NPC, Quest } from './content';
import type { StoryAct } from './story';
import { escapeHtml as e, icon } from './icons';
import { renderNarrative } from './sentence-translations';

type SideActivity = { id: string; icon: string; action: string };

export function npcEncounter(npc: NPC, region: string, portrait: string, activity: SideActivity, quest?: Quest, completed = false): string {
  return `<div class="encounter-scene">
    <aside class="encounter-character">${portrait}<span class="eyebrow">${e(region)}</span><span class="encounter-character-rule"></span></aside>
    <div class="encounter-conversation">
      <header class="encounter-heading">${portrait}<div class="eyebrow">${e(npc.role)}</div><h2 id="encounter-title">${e(npc.name)}</h2></header>
      <blockquote class="encounter-greeting">“${npc.greetingSentences ? renderNarrative(npc.greetingSentences) : e(npc.greeting)}”</blockquote>
      <button class="text-button encounter-listen" data-speak="${e(npc.greeting)}">${icon('volume')} Listen to greeting</button>
      ${quest ? `<section class="encounter-story" aria-label="Story quest"><div class="encounter-story-meta"><span>${icon(completed ? 'check' : 'lantern')} ${completed ? 'STORY DISCOVERED' : 'STORY QUEST'}</span><span>${quest.level}</span></div><h3>${e(quest.title)}</h3><p>${e(quest.subtitle)}</p><button class="primary-button" data-start-quest="${e(quest.id)}" autofocus>${completed ? 'Revisit this story' : 'Continue the story'} ${icon('arrow')}</button></section>` : '<p class="encounter-rest">There are more stories waiting along the route.</p>'}
      <section class="encounter-side" aria-label="Optional side activity"><span class="eyebrow">WHILE YOU’RE HERE <span>· OPTIONAL</span></span><button class="side-activity-button" data-activity="${e(activity.id)}">${icon(activity.icon)}<span>${e(activity.action)}</span>${icon('chevron')}</button></section>
    </div>
    <footer class="encounter-footer"><span>${icon('chat')} A CONVERSATION IN ${e(region.toUpperCase())}</span><button class="text-button" data-action="close-dialog">Leave conversation ${icon('arrow')}</button></footer>
  </div>`;
}

export function adventureHome(options: { act: StoryAct; region: string; regionArt: string; quest: Quest; npc: NPC; portrait: string; completed: number; total: number; nextRegion?: string; clueCount: number; dueCount: number }): string {
  const { act, region, regionArt, quest, npc, portrait, completed, total, nextRegion, clueCount, dueCount } = options;
  const finished = completed === total;
  return `<div class="journey-home">
    <section class="journey-hero" style="--journey-art:url('${e(regionArt)}')" aria-label="Continue your story">
      <div class="journey-hero-copy"><div class="eyebrow">THE MAIN STORY <span> / </span> ACT ${act.number} · ${e(region)}</div><h2>${e(act.title)}</h2><p>${renderNarrative(act.goal)}</p>
        <div class="journey-next">${portrait}<div><span>${finished ? 'CHAPTER COMPLETE' : 'YOUR NEXT CONVERSATION'}</span><h3>${e(finished ? nextRegion ? `The road to ${nextRegion}` : 'The Atlas remembers' : quest.title)}</h3><p>${finished ? renderNarrative([{ german: 'Eine Strecke ist wiederhergestellt.', english: 'A route restored.' }, { german: 'Ein Versprechen bleibt in Erinnerung.', english: 'A promise remembered.' }]) : `${e(npc.name)} · ${e(quest.location)}`}</p></div></div>
        <button class="primary-button" ${finished ? 'data-action="next-objective"' : `data-follow-quest="${e(quest.id)}"`}>${finished ? nextRegion ? 'Continue to the next chapter' : 'Read your discoveries' : 'Continue the story'} ${icon('arrow')}</button>
        <div class="journey-progress"><span>${completed} / ${total} STORIES DISCOVERED</span><div role="progressbar" aria-label="Chapter stories discovered" aria-valuenow="${completed}" aria-valuemin="0" aria-valuemax="${total}">${Array.from({ length: total }, (_, i) => `<i class="${i < completed ? 'complete' : ''}"></i>`).join('')}</div></div>
      </div>
      <span class="journey-hero-caption">${icon('compass')} ${e(region.toUpperCase())} <span>THE LANTERN ATLAS</span></span>
    </section>
    <div class="journey-tools"><button data-view="quests">${icon('scroll')}<span><strong>Story quests</strong><small>Follow the people behind the mystery</small></span>${icon('chevron')}</button><button data-view="story">${icon('lantern')}<span><strong>Discoveries</strong><small>${clueCount} ${clueCount === 1 ? 'clue' : 'clues'} in your story journal</small></span>${icon('chevron')}</button><button data-view="atlas">${icon('map')}<span><strong>Region atlas</strong><small>Explore the routes between towns</small></span>${icon('chevron')}</button></div>
    <section class="journey-detours" aria-label="Optional activities"><div class="journey-section-label"><span class="eyebrow">OFF THE MAIN PATH</span><span>Optional activities &amp; practice</span></div><div class="journey-tools"><button data-view="activities">${icon('cup')}<span><strong>Side activities</strong><small>Café shifts, market trades &amp; more</small></span>${icon('chevron')}</button><button data-view="course">${icon('book')}<span><strong>Learning routes</strong><small>Build your German at your own pace</small></span>${icon('chevron')}</button><button data-view="journal">${icon('leaf')}<span><strong>Your words</strong><small>${dueCount ? `${dueCount} expressions ready to revisit` : 'Your collected German'}</small></span>${icon('chevron')}</button></div></section>
    <div class="camp-bottom"><button class="text-button" data-view="world">Return to the world ${icon('arrow')}</button><button class="text-button" data-action="act-intro">Act opening</button><button class="text-button" data-action="help">${icon('compass')} Controls &amp; help</button></div>
  </div>`;
}
