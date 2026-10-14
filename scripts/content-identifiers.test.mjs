import { test } from 'node:test';
import assert from 'node:assert/strict';
import { identifierIndex, rewriteContentIdentifiers } from './content-identifiers.mjs';

const ids = { 'quests:a1-arrival': 'quest-uuid', 'graphs:a1-arrival': 'graph-uuid', 'npcs:otto': 'npc-uuid', 'lexemes:ticket-noun': 'word-uuid' };
test('rewrites identifiers and keyed progress rules without embedding the map', () => {
  const result = rewriteContentIdentifiers("const q = 'a1-arrival'; const rules = {'a1-arrival': 'otto'}; const clip = 'dialogue-a1-arrival-intro-0'; const text = 'The a1-arrival chapter';", 'story.ts', ids);
  assert.match(result, /const q = "quest-uuid"/);
  assert.match(result, /"quest-uuid": 'otto'/);
  assert.match(result, /'dialogue-a1-arrival-intro-0'/);
  assert.match(result, /'The a1-arrival chapter'/);
  assert.equal(identifierIndex(ids).get('a1-arrival'), 'quest-uuid');
});
test('rewrites learning references while retaining portrait and movement identities', () => {
  const result = JSON.parse(rewriteContentIdentifiers('{"otto":{"id":"otto","url":"/portraits/otto.webp","wordIds":["ticket-noun"]}}', 'portraits.json', ids));
  assert.deepEqual(result, { otto: { id: 'otto', url: '/portraits/otto.webp', wordIds: ['word-uuid'] } });
});
