import { activityDiscoveries } from './activity-stories';
import type { Progress } from './api';
import { coastPage } from './coast-threads';
import { npcs, quests, vocabulary } from './content';
import type { Level, Quest } from './content';
import { expeditionGameStatus, expeditionNotebook } from './expedition-games';
import { getExpedition, getExpeditionNpc } from './expeditions';
import { localized, localizedName, lower, t, upper } from './i18n';
import { escapeHtml as e, icon } from './icons';
import { buildingEntrances, getInterior, type InteriorId } from './interiors';
import { dueItems } from './learning';
import { getMap, maps, type MapId } from './maps';
import { questAvailable, routeUnlocked } from './progression';
import { questGraph } from './quest-graph';
import { questObjectivesMarkup } from './quest-objectives';
import { roomKind } from './room-kind';
import { renderNarrative, type Narrative } from './sentence-translations';
import { actFor, discoveredClues, storyActs } from './story';
import { ticketsPage, type StoryMechanics } from './story-mechanics';
import { clueHeading, evidenceBoard } from './story-panels';

/** What the menu pages read from the game; main.ts provides it. */
export interface MenuPageContext {
  progress: Progress;
  mapId: MapId;
  level: Level;
  mechanics: StoryMechanics | undefined;
  currentQuest: Quest;
  /** World objects the player has inspected. */
  inspectedObjects: string[];
  portrait(id: string): string;
  completedAtLevel(level: Level): number;
  encounterSolved(id: string): boolean;
}

export function interiorIcon(id: InteriorId) { id = roomKind(id); return id === 'cafe' ? 'cup' : id === 'bakery' ? 'leaf' : 'basket'; }
export function placesSection(mapId: MapId) {
  const entrances = buildingEntrances(mapId);
  if (!entrances.length) return '';
  return `<section class="interior-places"><h3>${t('Places')}</h3><div class="interior-place-list">${entrances.map(entrance=>{const room=getInterior(entrance.interiorId, mapId);return `<button data-focus-building="${room.id}">${icon(interiorIcon(room.id))}<strong>${e(room.name)}</strong>${icon('chevron')}</button>`;}).join('')}</div></section>`;
}
/** Until her name is revealed in the parcel scene, the notes are signed only "E.". */
export function eliseLetter(letter: Narrative, questId: string): string {
  const unsignedQuests = quests.slice(0, quests.findIndex(quest => quest.id === 'a1-lost-parcel')).map(quest => quest.id);
  return letter.length ? `<blockquote class="elise-letter"><span>${t('A note from {name}', { name: unsignedQuests.includes(questId) ? 'E.' : 'Elise' })}</span>${renderNarrative(letter)}<span class="elise-signature">— ${unsignedQuests.includes(questId) ? 'E.' : 'Elise'}</span></blockquote>` : '';
}
function earnedActivityJournal(progress: Progress): string {
  const discoveries = Object.keys(progress.activities ?? {}).flatMap(id => activityDiscoveries[id] ? [activityDiscoveries[id]] : []);
  if (!discoveries.length) return '';
  return `<section class="field-notes"><h3>${t('Witnesses from the road')}</h3>${discoveries.map(clue => `<article class="grammar-route"><h3>${e(localized(clue.title))}</h3><p>${renderNarrative(clue.text)}</p><blockquote>${renderNarrative(clue.lead)}</blockquote></article>`).join('')}</section>`;
}

/** The quest log: this chapter's stories, the next lead and the routes. */
export function questLogPage(ctx: MenuPageContext): string {
  const act = actFor(ctx.mapId), chapterQuests = quests.filter(q => q.level === ctx.level);
  return `<div class="quest-log-heading"><h2>${e(localized(act.title))}</h2></div>${questGraph(ctx.currentQuest.id) ? questObjectivesMarkup(questGraph(ctx.currentQuest.id)!,ctx.progress) : ''}<div class="quest-log-list">${chapterQuests.map((q, i) => { const done = ctx.progress.completedQuestIds.includes(q.id), next = q.id === ctx.currentQuest.id && !done; return `<button class="quest-log-entry ${done ? 'found' : next ? 'next' : ''}" data-follow-quest="${q.id}" ${questAvailable(q.id, ctx.progress) ? '' : 'disabled'}><span class="quest-log-number">${done ? icon('check') : String(i + 1).padStart(2, '0')}</span>${ctx.portrait(q.npcId)}<span class="quest-log-copy"><strong>${e(localized(q.title))}</strong></span>${icon('chevron')}</button>`; }).join('')}</div><button class="primary-button" data-action="next-objective">${icon('flag')} ${ctx.completedAtLevel(ctx.level) === 6 ? t('Follow the next route') : t('Find my next lead')}</button><div class="quest-region-strip">${maps.filter(map => !getExpedition(map.id) || routeUnlocked(map.id, ctx.progress.completedQuestIds)).map(map => `<button ${routeUnlocked(map.id, ctx.progress.completedQuestIds) ? '' : 'disabled'} data-travel="${map.id}" class="${map.id === ctx.mapId ? 'here' : ''}"><span>${map.level}</span>${e(map.name)}${icon(map.id === ctx.mapId ? 'pin' : 'arrow')}</button>`).join('')}</div>`;
}

/** Discoveries: evidence, tickets, coast threads, clue pages and field notes. */
export function discoveriesPage(ctx: MenuPageContext): string {
  const found = discoveredClues(ctx.progress.completedQuestIds), inspected = ctx.inspectedObjects;
  return `<header class="learning-page-header"><h2>${t('Discoveries')}</h2></header>${evidenceBoard(ctx.progress)}${ctx.mechanics ? ticketsPage(ctx.progress, ctx.mechanics, id => getMap(id as MapId).name) : ''}${coastPage(ctx.progress, maps.filter(item => getExpedition(item.id) && routeUnlocked(item.id, ctx.progress.completedQuestIds)))}<div class="story-acts">${storyActs.map(act=>{
    const qs=quests.filter(q=>q.level===act.level),clues=found.filter(clue=>qs.some(q=>q.id===clue.questId));
    if(!clues.length)return '';
    return `<section class="story-act"><header><h3>${e(localized(act.title))}</h3><span class="clue-count">${clues.length}/6</span></header><div class="clue-pages">${clues.map(clue=>`<details class="clue-page"><summary>${clueHeading(clue)}${icon('chevron')}</summary><p>${renderNarrative(clue.text)}</p>${eliseLetter(clue.letter,clue.questId)}<p>${renderNarrative(clue.lead)}</p></details>`).join('')}</div>${clues.length===6?`<details class="lore-detail"><summary>${t('Next chapter')}</summary><blockquote>${renderNarrative(act.cliffhanger)}</blockquote></details>`:''}</section>`;
  }).join('')}</div>${inspected.length?`<section class="field-notes"><h3>${t('Notes from the road')}</h3>${maps.flatMap(map=>map.objects.filter(object=>inspected.includes(object.id)).map(object=>`<button data-inspect-object="${object.id}" data-object-map="${map.id}"><strong>${e(object.label)}</strong>${icon('chevron')}</button>`)).join('')}</section>`:''}${earnedActivityJournal(ctx.progress)}${routeUnlocked('windplain',ctx.progress.completedQuestIds)?expeditionNotebook(ctx.progress.story?.expeditionPlans??{}):''}<button class="primary-button" data-action="next-objective">${t('Follow the next lead')}</button>`;
}

/** The region atlas: route cards, places and the local map. */
export function atlasPage(ctx: MenuPageContext): string {
  const current = getMap(ctx.mapId);
  return `<div class="atlas-heading"><h2>${t('Region atlas')}</h2></div><div class="region-cards">${maps.filter(map => !getExpedition(map.id) || routeUnlocked(map.id, ctx.progress.completedQuestIds)).map(map => {
    const unlocked = routeUnlocked(map.id, ctx.progress.completedQuestIds), expedition = getExpedition(map.id), act = expedition ? undefined : actFor(map.id);
    const status = expedition ? expeditionGameStatus(map.id, ctx.level, ctx.progress.story?.expeditionPlans ?? {}) : undefined;
    const done = expedition ? expedition.encounters.filter(encounter => ctx.encounterSolved(encounter.id)).length : ctx.completedAtLevel(map.level);
    return `<article class="region-card ${map.id === ctx.mapId ? 'current' : ''}"><div class="region-card-art" style="background-image:url('${map.previewAsset}')"><span>${expedition ? `${t('EXPEDITION')} · A1 / A2 / B1` : `${e(upper(t('Act {number}', { number: act!.number })))} · ${map.level}`}</span>${map.id === ctx.mapId ? `<b>${t('YOU ARE HERE')}</b>` : ''}</div><div class="region-card-copy"><h3>${e(map.name)}</h3><div class="region-card-meta"><span>${expedition ? t('{done} / {total} encounters', { done, total: expedition.encounters.length }) : t('{done} / {total} stories', { done, total: 6 })}</span><span>${expedition ? status === 'completed' ? t('Agreement remembered') : t('{count} neighbors · local game', { count: expedition.npcs.length }) : t('Story route')}</span></div><button class="${map.id === ctx.mapId ? 'outline-button' : 'primary-button'}" ${map.id === ctx.mapId ? 'data-view="world"' : `data-travel="${map.id}" ${unlocked ? '' : 'disabled'}`}>${map.id === ctx.mapId ? t('Return to exploring') : ` ${unlocked ? e(t('Travel to {place}', { place: map.name })) : t('Find the next clue first')}`} ${icon('arrow')}</button></div></article>`;
  }).join('')}</div>${placesSection(ctx.mapId)}<section class="region-local-map"><div><h3>${e(t('People & little things'))}</h3><p>${t('Choose a marker to walk there.')}</p></div><div class="atlas-map" style="aspect-ratio:${current.width}/${current.height}"><img src="${current.previewAsset}" alt="${e(t('Painted map of {place}', { place: current.name }))}"/>${current.npcs.map(point => { const npc = npcs.find(item => item.id === point.id) ?? getExpeditionNpc(point.id); return npc ? `<button class="atlas-map-pin" data-waypoint="${point.id}" style="left:${point.x * 100}%;top:${point.y * 100}%" aria-label="${e(t('Walk to {name}', { name: localizedName(npc.name) }))}">${ctx.portrait(point.id)}<span>${e(localizedName(npc.name))}</span></button>` : ''; }).join('')}${current.objects.map(object => `<button class="object-map-pin" data-focus-object="${object.id}" style="left:${object.x * 100}%;top:${object.y * 100}%" aria-label="${e(t('Walk to {name}', { name: object.label }))}">${icon(object.kind === 'garden' ? 'leaf' : object.kind === 'clock' ? 'clock' : 'lantern')}</button>`).join('')}<span class="atlas-map-compass">${icon('compass')} N</span></div></section>`;
}

/** The story-expression journal. */
export function phraseJournalPage(ctx: MenuPageContext): string {
  const learned = vocabulary.filter(v => ctx.progress.items[v.id]);
  const due = dueItems(ctx.progress);
  return `<header class="learning-page-header"><h2>${t('Story expressions')}</h2><button class="icon-button" data-action="journal-help" aria-label="${e(t('Word journal help'))}">?</button>${due.length ? `<button class="primary-button journal-review" data-action="review">${t('Review {count} words', {count:Math.min(due.length,8)})}</button>` : ''}</header><div class="route-tabs"><button data-journal-tab="words">${t('Individual words')}</button><button class="selected" data-journal-tab="phrases">${t('Story expressions')}</button></div><div class="journal-toolbar"><label>${icon('book')}<input id="word-search" placeholder="${e(t('Find a word or meaning…'))}" aria-label="${e(t('Search your word journal'))}"/></label></div><div class="word-grid" id="word-grid">${learned.length ? learned.map(v => { const meaning = localized({german:v.german,english:v.english}); return `<button class="word-card compact-word-card" data-open-phrase="${e(v.id)}" data-word="${e(lower(`${v.german} ${v.english} ${meaning}`))}"><h3 lang="de">${e(v.german)}</h3><p>${e(meaning)}</p>${icon('chevron')}</button>`; }).join('') : `<div class="empty-state"><p>${t('Your story is still being written.')}</p><button class="primary-button" data-view="world">${t('Meet Lindenhafen')}</button></div>`}</div>`;
}
