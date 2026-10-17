import { describe, expect, it } from 'vitest';
import { miniGameDefinitions, miniGameById } from './catalogue';
import { hostedGames, miniGameBlock, miniGameHosts, suggestedGame, type ReadinessContext } from './availability';
import { isWordGame } from './word-game-mechanics';
import type { GameItem, PoolQuery } from './types';

const item = (lemma: string, english: string, extra: Partial<GameItem> = {}): GameItem => ({
  lexemeId: `${lemma.toLowerCase()}-id`, lemma, english, topic: 'connections', level: 'A1', pos: 'pron', audio: '',
  exerciseIds: { recognition: '', listening: '', production: '' }, stability: 0,
  stabilityByMode: { recognition: 0, listening: 0, production: 0 }, due: { recognition: false, listening: false, production: false },
  seen: { recognition: false, listening: false, production: false }, recalls: { recognition: 0, listening: 0, production: 0 }, ...extra,
});
/** The syllabus opens with function words: no nouns, no pictures. */
const opening = [item('ich', 'I'), item('sein', 'to be', { pos: 'verb', topic: 'actions' }), item('der', 'the', { pos: 'article' }), item('nicht', 'not', { pos: 'adv' }), item('und', 'and', { pos: 'conj' })];
const filtered = (words: GameItem[]) => (query: PoolQuery) => words.filter(word => (!query.nouns || word.pos === 'noun') && (!query.sprites || !!word.sprite) && (!query.topics?.length || query.topics.includes(word.topic)));
const context = (extra: Partial<ReadinessContext> = {}): ReadinessContext => ({
  level: 'A1', silent: false, writingReady: false, hour: 12,
  sceneFor: game => game.questIds?.[0], sceneAvailable: () => false, pool: filtered(opening), ...extra,
});
const game = (id: string) => miniGameById.get(id)!;

describe('lantern round readiness', () => {
  it('opens meaning and letter games with a new player\'s first words but not picture games', () => {
    for (const id of ['lantern-pairs', 'honest-mirror', 'falling-leaves', 'scrambled-sign', 'lantern-fuse']) expect(miniGameBlock(game(id), context()), id).toBeUndefined();
    for (const id of ['tray-rush', 'fog-window', 'sorting-office']) expect(miniGameBlock(game(id), context()), id).toBe('words');
  });

  it('names the gate that keeps a round closed', () => {
    expect(miniGameBlock(game('workbench'), context())).toBe('story');
    expect(miniGameBlock(game('workbench'), context({ sceneAvailable: () => true, pool: undefined }))).toBeUndefined();
    expect(miniGameBlock(game('night-train'), context())).toBe('writing');
    expect(miniGameBlock(game('night-train'), context({ writingReady: true }))).toBeUndefined();
    expect(miniGameBlock(game('word-chain'), context({ writingReady: true, pool: undefined }))).toBe('dusk');
    expect(miniGameBlock(game('word-chain'), context({ writingReady: true, pool: undefined, hour: 20 }))).toBeUndefined();
    expect(miniGameBlock(game('lamp-walk'), context({ silent: true }))).toBe('sound');
    expect(miniGameBlock(game('looping-tape'), context())).toBe('level');
  });

  it('skips the word check until the course has loaded', () => {
    expect(miniGameBlock(game('tray-rush'), context({ pool: undefined }))).toBeUndefined();
  });

  it('gives every hosted round a real character and catalogue entry', () => {
    for (const [npcId, ids] of Object.entries(miniGameHosts)) for (const id of ids) expect(miniGameById.has(id), `${npcId}: ${id}`).toBe(true);
    for (const definition of miniGameDefinitions.filter(isWordGame)) {
      const hosted = Object.values(miniGameHosts).some(ids => ids.includes(definition.id));
      expect(hosted || definition.id === 'echo-bells', definition.id).toBe(true);
    }
  });

  it('lets characters offer only rounds that can start, rotating by day', () => {
    expect(hostedGames('marta', miniGameById, context())).toEqual([]);
    const food = [item('Kaffee', 'coffee', { pos: 'noun', topic: 'food', sprite: 'kaffee' }), item('Brot', 'bread', { pos: 'noun', topic: 'food', sprite: 'brot' }), item('Tee', 'tea', { pos: 'noun', topic: 'food', sprite: 'tee' })];
    const stocked = context({ pool: filtered([...opening, ...food]) });
    expect(hostedGames('marta', miniGameById, stocked, 0).map(game => game.id)).toEqual(['tray-rush', 'market-baskets']);
    expect(hostedGames('marta', miniGameById, stocked, 1).map(game => game.id)).toEqual(['market-baskets', 'tray-rush']);
    expect(hostedGames('nobody', miniGameById, stocked)).toEqual([]);
  });

  it('suggests the scene character\'s round first, then a playable word game', () => {
    expect(suggestedGame(miniGameDefinitions, context(), 'elise')?.id).toBe('lantern-pairs');
    const fallback = suggestedGame(miniGameDefinitions, context(), 'marta', 3);
    expect(fallback && isWordGame(fallback) && !miniGameBlock(fallback, context())).toBe(true);
  });
});
