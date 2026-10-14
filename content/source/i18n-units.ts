/**
 * Every story string that carries support-language text, with a stable id.
 * Used by the coverage test and scripts/i18n-coverage.mjs; never bundled for play.
 *
 * Sentence units translate a German sentence (the meaning shown beside it); text units
 * translate English-only content (titles, objectives, gate prompts, glosses).
 */
import { questGraphs } from './quest-graph';
import { quests, npcs, chapters } from './content';
import { storyActs, storyClues, objectStories, journalNarratives } from './story';
import { residentConversation, ambientCallbackLines, earnedTitleGreeting } from './npc-dialogue';
import { emptyStory, type DialogueLine } from './dialogue';
import { cinematicBeats, endingIds, type CutsceneKind } from './cinematic-content';
import { grammarForQuest } from './contextual-grammar';
import { beginnerGateTranslations, greetingMeanings } from './beginner-dialogue';
import { storyMaps } from './maps';
import { specialItems, endings } from './story-panels';
import { placementDialogue } from './learning-context';
import { baseStoryGlossary } from './story-glossary';
import type { Level } from './content';
import type { OverlayEntry } from './i18n';

export interface TranslationUnit { id: string; kind: 'sentence' | 'text'; source: string; english: string; }

export function storyUnits(): TranslationUnit[] {
  const units: TranslationUnit[] = [];
  const sentence = (id: string, german: string, english: string) => units.push({ id, kind: 'sentence', source: german, english });
  const text = (id: string, english: string) => { if (english.trim()) units.push({ id, kind: 'text', source: english, english }); };
  const narrative = (id: string, sentences: readonly { german: string; english: string }[]) => sentences.forEach((item, index) => sentence(`${id}:${index}`, item.german, item.english));
  const line = (value: DialogueLine) => {
    sentence(`dialogue:${value.id}`, value.german, value.english);
    value.variants?.forEach((variant, index) => sentence(`dialogue:${value.id}:variant:${index}`, variant.german, variant.english));
    if (value.reply) sentence(`dialogue:${value.reply.correction.id}`, value.reply.correction.german, value.reply.correction.english);
    for (const [word, gloss] of Object.entries(value.glosses ?? {})) text(`gloss:${word}:${gloss}`, gloss);
  };

  for (const graph of questGraphs) {
    const q = graph.questId;
    text(`gate-prompt:${q}`, graph.gatePrompt);
    graph.objectives.forEach((objective, index) => text(`objective:${q}:${index}`, objective.text));
    for (const node of graph.nodes) {
      node.lines.forEach(line);
      for (const choice of node.choices ?? []) sentence(`choice:${q}:${choice.id}`, choice.german, choice.english);
    }
    for (const topic of graph.topics ?? []) { sentence(`topic:${q}:${topic.id}`, topic.german, topic.english); topic.lines.forEach(line); }
    for (const item of graph.investigations) sentence(`evidence:${q}:${item.objectId}`, item.german, item.english);
    for (const [word, gloss] of Object.entries(graph.introducedWords ?? {})) text(`gloss:${word.toLocaleLowerCase('de')}:${gloss}`, gloss);
  }

  for (const act of storyActs) {
    text(`act:${act.mapId}:title`, act.title);
    narrative(`act:${act.mapId}:premise`, act.premise);
    act.introduction.forEach((paragraph, index) => narrative(`act:${act.mapId}:introduction:${index}`, paragraph));
    narrative(`act:${act.mapId}:goal`, act.goal);
    narrative(`act:${act.mapId}:cliffhanger`, act.cliffhanger);
  }
  for (const clue of storyClues) {
    text(`clue:${clue.questId}:title`, clue.title);
    narrative(`clue:${clue.questId}:text`, clue.text);
    narrative(`clue:${clue.questId}:lead`, clue.lead);
    narrative(`clue:${clue.questId}:letter`, clue.letter);
  }
  for (const [id, lore] of Object.entries(objectStories)) { narrative(`object:${id}:detail`, lore.detail); narrative(`object:${id}:secret`, lore.secret); }
  for (const [key, value] of Object.entries(journalNarratives)) narrative(`journal:${key}`, Array.isArray(value) ? value : [value]);

  for (const quest of quests) {
    text(`quest:${quest.id}:title`, quest.title);
    text(`quest:${quest.id}:subtitle`, quest.subtitle);
    text(`quest:${quest.id}:location`, quest.location);
    quest.objectives.forEach((objective, index) => text(`quest:${quest.id}:objective:${index}`, objective));
    narrative(`quest:${quest.id}:story`, quest.story);
  }
  for (const chapter of chapters) { text(`chapter:${chapter.level}:title`, chapter.title); text(`chapter:${chapter.level}:description`, chapter.description); }
  for (const map of storyMaps) {
    text(`map:${map.id}:subtitle`, map.subtitle);
    text(`map:${map.id}:description`, map.description);
    for (const object of map.objects) text(`map-object:${object.id}:prompt`, object.prompt);
  }

  const experienced = emptyStory();
  experienced.flags = { 'quest:b1-work': true, 'quest:a2-archive': true };
  experienced.reputation = { brassOffice: 3, lamplighters: 3, unwritten: 3 };
  for (const npc of npcs) {
    text(`npc:${npc.id}:role`, npc.role);
    if (npc.name !== npc.name.split(' ').at(-1)) text(`npc:${npc.id}:name`, npc.name);
    narrative(`npc:${npc.id}:greeting`, npc.greetingSentences ?? []);
    for (const level of ['A1', 'A2', 'B1'] as Level[]) for (const state of [emptyStory(), experienced]) {
      for (const resident of residentConversation(npc, level, state)) sentence(`resident:${resident.clipId}`, resident.german, resident.english);
    }
    for (const title of ['Lantern Bearer', 'Lamplighter', 'Route Keeper', 'Atlas Keeper']) {
      const greeting = earnedTitleGreeting(npc, title);
      if (greeting) sentence(`resident:${greeting.clipId}`, greeting.german, greeting.english);
    }
  }
  for (const callback of ambientCallbackLines()) sentence(`resident:${callback.clipId}`, callback.german, callback.english);
  for (const [id, turn] of Object.entries(placementDialogue)) sentence(`placement:${id}`, turn.german, turn.english);
  sentence('ambient:practice', 'Ich möchte üben.', 'I would like to practise.');
  sentence('ambient:leave', 'Bis später!', 'See you later!');

  const kinds: CutsceneKind[] = ['arrival', 'platform', 'recording', 'erasure', 'clockmill', 'confession', 'dark-beam', 'ledger', 'storm', 'bell', 'travel'];
  for (const kind of kinds) cinematicBeats(kind, 'lindenhafen').forEach((beat, index) => sentence(`cinematic:${kind}:${index}`, beat.german, ''));
  for (const ending of endingIds) cinematicBeats('bell', 'nebelstadt', ending).forEach((beat, index) => sentence(`cinematic:bell-${ending}:${index}`, beat.german, ''));

  for (const quest of quests) {
    const note = grammarForQuest(quest.id);
    if (note) sentence(`grammar-note:${quest.id}`, note.german, note.english);
  }
  for (const [exerciseId, replies] of Object.entries(beginnerGateTranslations)) replies.forEach(([german, english], index) => sentence(`beginner:${exerciseId}:${index}`, german, english));
  for (const [german, english] of Object.entries(greetingMeanings)) sentence(`beginner-greeting:${german}`, german, english);

  for (const [id, item] of Object.entries(specialItems)) { text(`item:${id}:title`, item.title); text(`item:${id}:text`, item.text); }
  for (const [id, item] of Object.entries(endings)) { text(`ending:${id}:title`, item.title); text(`ending:${id}:text`, item.text); }
  for (const [word, gloss] of Object.entries(baseStoryGlossary)) text(`glossary:${word}:${gloss}`, gloss);

  // One unit per id; the same German sentence appearing twice keeps its first id.
  const seen = new Set<string>();
  return units.filter(unit => !seen.has(unit.id) && seen.add(unit.id));
}

export interface CoverageReport {
  total: number; translated: number;
  missing: TranslationUnit[]; stale: { unit: TranslationUnit; entry: OverlayEntry }[];
  placeholders: string[]; inconsistent: string[]; orphaned: string[];
}

/** Compare the live story with an overlay. Any non-empty list fails the build. */
export function storyCoverage(units: readonly TranslationUnit[], overlay: Record<string, OverlayEntry>): CoverageReport {
  const missing: TranslationUnit[] = [], stale: CoverageReport['stale'] = [], placeholders: string[] = [], inconsistent: string[] = [];
  const bySource = new Map<string, { id: string; tr: string }>();
  for (const unit of units) {
    const entry = overlay[unit.id];
    if (!entry || !entry.tr?.trim()) { missing.push(unit); continue; }
    const source = unit.kind === 'sentence' ? entry.de : entry.en;
    if (source !== unit.source) { stale.push({ unit, entry }); continue; }
    const names = (value: string) => (value.match(/\{\w+\}/g) ?? []).sort().join(',');
    if (names(unit.source) !== names(entry.tr)) placeholders.push(unit.id);
    const key = `${unit.kind}:${unit.source}`, previous = bySource.get(key);
    if (previous && previous.tr !== entry.tr) inconsistent.push(`${previous.id} ≠ ${unit.id}`);
    else if (!previous) bySource.set(key, { id: unit.id, tr: entry.tr });
  }
  const ids = new Set(units.map(unit => unit.id));
  const orphaned = Object.keys(overlay).filter(id => !ids.has(id));
  return { total: units.length, translated: units.length - missing.length - stale.length, missing, stale, placeholders, inconsistent, orphaned };
}

/** Literal `t('…')` keys in source text. Template strings with ${…} are not keys. */
export function uiKeys(sources: readonly string[]): string[] {
  const keys = new Set<string>();
  const pattern = /(?<![\w$.])t\(\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|`((?:[^`\\$]|\\.)*)`)/g;
  for (const source of sources) for (const match of source.matchAll(pattern)) {
    const raw = match[1] ?? match[2] ?? match[3];
    keys.add(raw.replace(/\\(['"`\\])/g, '$1').replace(/\\n/g, '\n'));
  }
  return [...keys].sort();
}
