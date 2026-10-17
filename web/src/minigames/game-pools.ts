import { isDepartureVocabulary } from './departure-round';
import { isWordGame } from './word-game-mechanics';
import type { GameItem, MiniGameDefinition, Modality, PoolQuery } from './types';

/**
 * Which restored words each game can use. The games mount with this pool and the
 * menus ask the same question before offering a round, so an offer never opens
 * onto "These words are still returning."
 */

/** Topic baskets name the course's concrete topics; catch-all topics would make a sorting answer arbitrary. */
export const basketTopics: Readonly<Record<string,string>> = {food:'Food & drink',travel:'Travel',time:'Time',home:'Home',health:'Health',work:'Work',learning:'Learning',people:'People',feelings:'Feelings',culture:'Culture',nature:'Nature',society:'Town & society',actions:'Doing words',describing:'Describing words'};
const meaningfulCapitals = new Set(['Sie','Ihnen','Ihr','Ihre']);

/** Letter games spell one plain German word from tiles, a grid or guessed letters. */
export function isLetterWord(item: Pick<GameItem,'lemma'>, max = 10): boolean {
  return /^\p{L}+$/u.test(item.lemma) && [...item.lemma].length >= 3 && [...item.lemma].length <= max && !meaningfulCapitals.has(item.lemma);
}

const numberLabels: Record<string, number> = {
  null: 0, ein: 1, eins: 1, zwei: 2, drei: 3, vier: 4, fünf: 5, fuenf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9,
  zehn: 10, elf: 11, zwölf: 12, zwoelf: 12, dreizehn: 13, vierzehn: 14, fünfzehn: 15, fuenfzehn: 15,
  sechzehn: 16, siebzehn: 17, achtzehn: 18, neunzehn: 19, zwanzig: 20, dreißig: 30, dreissig: 30,
  vierzig: 40, fünfzig: 50, fuenfzig: 50, sechzig: 60, siebzig: 70, achtzig: 80, neunzig: 90,
  hundert: 100, einhundert: 100, zweihundert: 200, tausend: 1000, eintausend: 1000,
};
/** Numbers stay numeric on apples; the spoken German is never printed as an answer. */
export function catchingNumberLabel(choice: { label: string; answer: string }): string | undefined {
  if (/^[\d\s.,:€+-]+$/.test(choice.label) && /\d/.test(choice.label)) return choice.label.trim();
  for (const value of [choice.label, choice.answer]) {
    const number = numberLabels[value.toLocaleLowerCase('de').trim()];
    if (number !== undefined) return String(number);
  }
  return undefined;
}

const workbenchLemmas = new Set(['hebel','verbindung','lampe','schraube','zahnrad','feder','glas','draht','schlüssel','knopf','uhr','werkzeug','tisch']);
const weatherLemmas = new Set(['regen','wetter','sonne','schnee','wind','morgen','dienstag','montag','freitag']);
const lower = (item: GameItem) => item.lemma.toLocaleLowerCase('de');

/** The modality whose memory decides which words come first. */
export function poolModality(definition: Pick<MiniGameDefinition,'mechanic'|'modalities'>, silent: boolean): Modality {
  if (isWordGame(definition)) return definition.mechanic === 'bells' && !silent ? 'listening' : ['anagram','loom','fuse','train'].includes(definition.mechanic) ? 'production' : 'recognition';
  return silent && definition.modalities.includes('recognition') ? 'recognition' : definition.modalities[0];
}

export interface PoolOptions { level: PoolQuery['level']; silent: boolean; seed?: number; fixedPool?: readonly string[]; }

/** Restored words this game can ask about, after its mechanic's own constraints. */
export function mechanicPool(definition: MiniGameDefinition, pool: (query: PoolQuery) => GameItem[], options: PoolOptions): GameItem[] {
  const modality = poolModality(definition, options.silent);
  let items = pool({ modality, level: options.level, topics: definition.topics, nouns: definition.nouns, sprites: definition.sprites, fixedPool: options.fixedPool, seed: options.seed });
  switch (definition.mechanic) {
    case 'catch': {
      const distinct = new Map<string, GameItem>();
      for (const item of pool({ modality, level: options.level, seed: options.seed, fixedPool:options.fixedPool }).filter(item => item.pos === 'num')) {
        const label = catchingNumberLabel({ label: item.lemma, answer: item.lemma });
        if (label !== undefined && !distinct.has(label)) distinct.set(label, item);
      }
      return [...distinct.values()];
    }
    case 'board': { const eligible = items.filter(isDepartureVocabulary); return eligible.length >= 2 ? eligible : items; }
    case 'workbench': return items.filter(item => workbenchLemmas.has(lower(item)));
    case 'garden': return items.filter(item => item.pos === 'noun' && ['health','nature','home'].includes(item.topic));
    case 'forecast': { const weather = items.filter(item => weatherLemmas.has(lower(item))); return weather.length >= 2 ? weather : items; }
    case 'anagram': case 'fuse': return items.filter(item => isLetterWord(item));
    case 'loom': return items.filter(item => isLetterWord(item, options.level === 'A1' ? 7 : 8));
    case 'baskets': items = items.filter(item => item.topic in basketTopics); break;
  }
  // A meaning shared by two words would make a meaning choice ambiguous.
  if (['pairs','mirror','leaves','bells'].includes(definition.mechanic)) {
    const meanings = new Set<string>();
    items = items.filter(item => { const key = item.english.toLocaleLowerCase('en'); if (meanings.has(key)) return false; meanings.add(key); return true; });
  }
  return items;
}

/** Fewest words a round can be built from. Baskets and leaves need more: with three words every answer is memorised after one pass. */
export function minimumPool(definition: MiniGameDefinition, silent: boolean): number {
  if (isWordGame(definition)) return poolModality(definition, silent) === 'production' ? 1 : ['baskets','leaves'].includes(definition.mechanic) ? 5 : definition.mechanic === 'pairs' ? 3 : 2;
  return definition.modalities.includes('production') ? 1 : 2;
}

/** Silent mode can only explain a game that cannot be played without sound. */
export function needsSound(definition: Pick<MiniGameDefinition,'mechanic'|'modalities'>, silent: boolean): boolean {
  return silent && !isWordGame(definition as MiniGameDefinition) && (definition.modalities.every(mode => mode === 'listening') || definition.mechanic === 'tape');
}
