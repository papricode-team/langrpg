import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import './register-content-loader.mjs';

const { getMap } = await import('../web/src/maps.ts');
const { quests } = await import('../web/src/content.ts');
const { rules } = JSON.parse(await readFile(new URL('../server/story_rules.json', import.meta.url), 'utf8'));
const graphs = JSON.parse(await readFile(new URL('../web/src/data/dialogue-graphs.json', import.meta.url), 'utf8'));

test('server investigation proof follows the actual edited runtime placements and authored graph', () => {
  assert.equal(rules.length, graphs.length);
  for (const graph of graphs) {
    const rule = rules.find(rule => rule.questId === graph.questId);
    assert.ok(rule, `missing server graph ${graph.questId}`);
    const quest = quests.find(quest => quest.id === graph.questId);
    const map = getMap(rule.mapId);
    const npc = map.npcs.find(npc => npc.id === quest.npcId);
    assert.deepEqual(rule.npc, npc, `${graph.questId} NPC moved without regenerating server proof`);
    assert.equal(rule.npcId, quest.npcId);
    assert.equal(rule.gateExerciseId, graph.gateExerciseId);
    assert.deepEqual(rule.replyExerciseIds, [...new Set(graph.nodes.flatMap(node => node.lines.flatMap(line => line.reply ? [line.reply.exerciseId] : [])))]);
    assert.deepEqual(rule.investigationObjectIds, graph.investigations.map(item => item.objectId));
    assert.deepEqual(rule.objects, graph.investigations.map(item => {
      const object = map.objects.find(object => object.id === item.objectId);
      assert.ok(object, `missing ${item.objectId}`);
      return { id: object.id, x: object.x, y: object.y };
    }), `${graph.questId} objects moved without regenerating server proof`);
    assert.deepEqual(rule.choices, graph.nodes.find(node => node.id === 'choice').choices.map(choice => ({ id: choice.id, effects: choice.effects, ...(choice.condition ? { condition: choice.condition } : {}) })));
  }
});
