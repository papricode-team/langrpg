import type { Progress } from './api';
import { conditionMet, storyState, type DialogueCondition } from './dialogue';
import { escapeHtml as e, icon } from './icons';
import { localized, t } from './i18n';
import { renderNarrative, type TranslatedSentence } from './sentence-translations';
import { carriesLamp } from './story-items';

/**
 * The Atlas's one rule as play: written names fade with visible play time unless
 * somebody says them aloud. The server owns every value here; the client mirrors
 * the arithmetic so ink can pale smoothly between saves.
 */
export interface InkEntry {
  id: string; mapId: string; anchor?: string; x: number; y: number;
  kind: 'plate' | 'chalk' | 'sign' | 'stone' | 'slate' | 'hull' | 'hud' | 'word';
  german: string; english: string; display?: string; accepted?: string[];
  from?: string; fromFlag?: string; until?: string; untilFlag?: string; keep?: string; darkFlag?: string; restoredBy?: string[];
  bell?: boolean; silent?: boolean; side?: string;
}
export interface InkRegistry { decaySeconds: number; paleBelow: number; entries: InkEntry[]; }
export interface SideQuest {
  id: string; mapId: string; host: string; kind: string; anchor?: string; x: number; y: number;
  german: string; english: string; accepted?: string[];
  place: TranslatedSentence; memory: TranslatedSentence;
  requires?: DialogueCondition; quest?: string; xp: number; ink?: string; group?: string;
}
export interface StoryMechanics { ink: InkRegistry; sideQuests: SideQuest[]; }
export interface InkRecord { spokenAt: number; spoken?: number; kept?: boolean; }

export const emptyMechanics = (): StoryMechanics => ({ ink: { decaySeconds: 1500, paleBelow: .5, entries: [] }, sideQuests: [] });

const done = (progress: Progress, questId?: string) => !!questId && progress.completedQuestIds.includes(questId);
const records = (progress: Progress): Record<string, InkRecord> => (progress.story as { ink?: Record<string, InkRecord> } | undefined)?.ink ?? {};

/** The writing exists: its story beat happened and nobody has taken it down. */
export function inkStarted(entry: InkEntry, progress: Progress): boolean {
  if (entry.from && !done(progress, entry.from)) return false;
  if (entry.fromFlag && !progress.story?.flags?.[entry.fromFlag]) return false;
  if (entry.untilFlag && progress.story?.flags?.[entry.untilFlag]) return false;
  return !entry.until || !done(progress, entry.until);
}

/** True once a name is safe for good: a scene kept it or its ticket was returned. */
export function inkKept(entry: InkEntry, progress: Progress): boolean {
  if (entry.keep && done(progress, entry.keep)) return true;
  if (entry.side && progress.story?.flags?.[`side:${entry.side}`]) return true;
  return !!records(progress)[entry.id]?.kept;
}

export function inkActive(entry: InkEntry, progress: Progress): boolean { return inkStarted(entry, progress) && !inkKept(entry, progress); }

/** 1 is fresh ink, 0 a lost name. `extraSeconds` covers play since the last save. */
export function inkLevel(entry: InkEntry, progress: Progress, registry: InkRegistry, extraSeconds = 0): number {
  if (!inkActive(entry, progress)) return 1;
  if (entry.darkFlag && progress.story?.flags?.[entry.darkFlag]) return 0;
  const record = records(progress)[entry.id];
  if (!record) return 1;
  const elapsed = (progress.intake?.activeSeconds ?? 0) + extraSeconds - record.spokenAt;
  return elapsed <= 0 ? 1 : Math.max(0, 1 - elapsed / Math.max(1, registry.decaySeconds));
}

export interface InkMark {
  id: string; x: number; y: number; text: string; level: number; pale: boolean; lost: boolean;
  silent: boolean; kind: InkEntry['kind']; objectId?: string; interactive: boolean;
}
export interface TicketMark { id: string; x: number; y: number; label: string; }
export type TrainState = 'arriving' | 'waiting' | 'departing' | undefined;
export interface StoryMarks { mapId: string; inks: InkMark[]; tickets: TicketMark[]; lamp: boolean; beam: boolean; train?: TrainState; }
export const emptyStoryMarks = (mapId = ''): StoryMarks => ({ mapId, inks: [], tickets: [], lamp: false, beam: false });

/** What the world draws on one map: fading names, open ticket addresses and the lamp. */
export function storyMarks(mapId: string, progress: Progress, mechanics: StoryMechanics, playerName: string, extraSeconds = 0): StoryMarks {
  const registry = mechanics.ink;
  const inks = registry.entries.filter(entry => entry.mapId === mapId && entry.kind !== 'hud' && inkStarted(entry, progress)).map(entry => {
    const active = inkActive(entry, progress), level = active ? inkLevel(entry, progress, registry, extraSeconds) : 1;
    const objectId = entry.anchor?.startsWith('object:') ? entry.anchor.slice(7) : undefined;
    return { id: entry.id, x: entry.x, y: entry.y, text: personalName(entry.display && (entry.silent || level < registry.paleBelow) ? entry.display : entry.german, playerName),
      level, pale: active && level < registry.paleBelow, lost: active && level <= 0, silent: !!entry.silent, kind: entry.kind, objectId, interactive: active && !entry.silent && !objectId };
  });
  const tickets = openTickets(progress, mechanics).filter(side => side.mapId === mapId)
    .map(side => ({ id: side.id, x: side.x, y: side.y, label: localized(side.place) }));
  const inventory = progress.story?.inventory ?? [];
  const flags = progress.story?.flags ?? {};
  const beam = mapId === 'nebelstadt' && !!flags.storm_active;
  return { mapId, inks, tickets, lamp: carriesLamp(inventory), beam, train: trainState(mapId, progress) };
}

/** Platform seven's train: it brings the player, then waits for the evening departure. */
export function trainState(mapId: string, progress: Progress): TrainState {
  const nodes = progress.story?.nodes ?? {};
  if (mapId === 'lindenhafen') {
    if (!done(progress, 'a1-arrival')) return nodes['a1-arrival'] ? 'waiting' : 'arriving';
    if (done(progress, 'a1-departure')) return 'departing';
    if (done(progress, 'a1-lost-parcel')) return 'waiting';
  }
  if (mapId === 'waldruh' && done(progress, 'a1-departure') && !done(progress, 'a2-apartment')) return 'waiting';
  return undefined;
}

export function personalName(text: string, playerName: string): string { return text.replaceAll('{name}', playerName || '…'); }

export function openTickets(progress: Progress, mechanics: StoryMechanics): SideQuest[] {
  const state = storyState(progress.story);
  return mechanics.sideQuests.filter(side => !state.flags[`side:${side.id}`] && (!side.quest || done(progress, side.quest)) && conditionMet(side.requires, state));
}

/** Names at an evidence object: the object's dialog offers to say them aloud. */
export function inkAtObject(objectId: string, progress: Progress, mechanics: StoryMechanics): InkEntry[] {
  return mechanics.ink.entries.filter(entry => entry.anchor === `object:${objectId}` && inkActive(entry, progress));
}

/** The lamp leans toward the palest name nearby: 0 dark, 1 bright. */
export function dowsing(marks: StoryMarks, x: number, y: number, width: number, height: number): { strength: number; target?: InkMark | TicketMark } {
  if (!marks.lamp) return { strength: 0 };
  let best: { strength: number; target?: InkMark | TicketMark } = { strength: 0 };
  const consider = (target: InkMark | TicketMark, weight: number) => {
    const distance = Math.hypot(target.x * width - x, target.y * height - y);
    const strength = weight * Math.max(0, 1 - distance / 900);
    if (strength > best.strength) best = { strength, target };
  };
  for (const ink of marks.inks) if (!ink.silent && ink.level < 1) consider(ink, .35 + .65 * (1 - ink.level));
  for (const ticket of marks.tickets) consider(ticket, .6);
  return best;
}

export function lostStoryNames(progress: Progress, mechanics: StoryMechanics, extraSeconds = 0): InkEntry[] {
  return mechanics.ink.entries.filter(entry => entry.bell && inkActive(entry, progress) && inkLevel(entry, progress, mechanics.ink, extraSeconds) <= 0);
}

/** The "say it aloud" panel inside an object dialog or a fading-name dialog. */
export function inkSpeakMarkup(entries: readonly InkEntry[], progress: Progress, mechanics: StoryMechanics, playerName: string): string {
  if (!entries.length) return '';
  return `<section class="ink-speak">${entries.map(entry => {
    const level = inkLevel(entry, progress, mechanics.ink), percent = Math.round(level * 100), word = entry.kind === 'word';
    const status = level <= 0 ? (word ? t('The word is gone. Say it, and it comes back.') : t('The name is gone. Say it, and it comes back.')) : level < mechanics.ink.paleBelow ? (word ? t('The ink is pale. Say the word aloud.') : t('The ink is pale. Say the name aloud.')) : t('The ink is dark. Saying it keeps it.');
    const shown = entry.silent ? entry.display ?? '…' : personalName(entry.german, playerName);
    return `<form class="ink-entry" data-ink-form="${e(entry.id)}"><div class="ink-name" style="--ink:${level.toFixed(2)}" lang="de">${e(level <= 0 && !entry.silent ? '· · ·' : shown)}</div><div class="ink-meter" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}" aria-label="${e(t('Ink'))}"><span style="width:${percent}%"></span></div><p>${e(entry.silent ? t('Nobody can say this name yet. The story will bring it back.') : status)}</p>${entry.silent ? '' : `<label class="visually-hidden" for="ink-${e(entry.id)}">${e(word ? t('Say the word aloud in German') : t('Say the name aloud in German'))}</label><div class="ink-input-row"><input id="ink-${e(entry.id)}" name="answer" autocomplete="off" spellcheck="false" lang="de" placeholder="${e(word ? t('Say the word aloud') : t('Say the name aloud'))}"/><button class="primary-button" type="submit">${icon('lantern')} ${e(t('Say it'))}</button></div><p class="ink-hint">${e(t('Hint: {meaning}', { meaning: localized({ german: entry.german, english: entry.english }) }))}</p>`}</form>`;
  }).join('')}</section>`;
}

/** How each kind of errand presents itself: Otto's tickets, Frau Berg's book, Falk's ink. */
const errandKinds: Record<string, { stamp: string; signature: string; text: string }> = {
  ticket: { stamp: 'Platform seven', signature: '— E.', text: 'A name used to live at this address. Say it aloud and the town will remember.' },
  memory: { stamp: 'Frau Berg’s book', signature: '— B.', text: 'A pupil’s name is fading from Frau Berg’s book. Say it to them, and they remember her.' },
  customer: { stamp: 'Falk’s ink', signature: '— F.', text: 'This name was written in Falk’s ink. Say it, and hear how long the ink held.' },
};

export function ticketMarkup(side: SideQuest): string {
  const kind = errandKinds[side.kind] ?? errandKinds.ticket;
  return `<div class="ticket-encounter ticket-${e(side.kind)}"><div class="ticket-card"><span class="ticket-stamp">${e(t(kind.stamp))}</span><strong lang="de">${e(side.german.replace(/[^\s]/g, '·'))}</strong><span>${renderNarrative([side.place])}</span><span class="ticket-signature">${e(kind.signature)}</span></div><p>${e(t(kind.text))}</p><form data-side-form="${e(side.id)}"><label class="visually-hidden" for="side-${e(side.id)}">${e(t('Say the name aloud in German'))}</label><div class="ink-input-row"><input id="side-${e(side.id)}" name="answer" autocomplete="off" spellcheck="false" lang="de" placeholder="${e(t('Say the name aloud'))}"/><button class="primary-button" type="submit">${icon('lantern')} ${e(t('Say it'))}</button></div><p class="ink-hint">${e(t('Hint: {meaning}', { meaning: localized({ german: side.german, english: side.english }) }))}</p></form></div>`;
}

function errandRows(rows: readonly SideQuest[], flags: Record<string, boolean>, open: ReadonlySet<string>): string {
  return `<ul>${rows.map(side => flags[`side:${side.id}`]
    ? `<li class="ticket-returned">${icon('check')}<strong lang="de">${e(side.german)}</strong><span>${renderNarrative([side.memory])}</span></li>`
    : `<li class="ticket-open"><button class="text-button" data-follow-ticket="${e(side.id)}">${icon('pin')} ${renderNarrative([side.place])}</button></li>`).join('')}</ul>`;
}

/** The journal's ticket page: Otto's hundred unsold tickets, one name at a time, then the other errands of remembering. */
export function ticketsPage(progress: Progress, mechanics: StoryMechanics, mapName: (id: string) => string): string {
  if (!mechanics.sideQuests.length) return '';
  const flags = progress.story?.flags ?? {};
  const open = new Set(openTickets(progress, mechanics).map(side => side.id));
  const visible = (side: SideQuest) => flags[`side:${side.id}`] || open.has(side.id);
  const tickets = mechanics.sideQuests.filter(side => side.kind === 'ticket');
  const returned = tickets.filter(side => flags[`side:${side.id}`]);
  const towns = [...new Set(tickets.map(side => side.mapId))];
  const intro = !returned.length && !tickets.some(side => open.has(side.id))
    ? `<p>${e(t('Otto’s old office holds a hundred unsold tickets for platform seven. Each one carries a forgotten name.'))}</p>`
    : `<p>${e(t('{count} of {total} names are back in their towns.', { count: returned.length, total: 100 }))}</p>${towns.map(mapId => {
      const rows = tickets.filter(side => side.mapId === mapId && visible(side));
      return rows.length ? `<div class="ticket-town"><h4>${e(mapName(mapId))}</h4>${errandRows(rows, flags, open)}</div>` : '';
    }).join('')}`;
  const others = ([['memory', 'Frau Berg’s pupils'], ['customer', 'Falk’s customers']] as const).map(([kind, title]) => {
    const rows = mechanics.sideQuests.filter(side => side.kind === kind && visible(side));
    return rows.length ? `<div class="ticket-town"><h4>${e(t(title))}</h4>${errandRows(rows, flags, open)}</div>` : '';
  }).join('');
  return `<section class="tickets-page"><h3>${e(t('The hundred tickets'))}</h3>${intro}${others}</section>`;
}
