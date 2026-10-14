#!/usr/bin/env node
/** Generate server-authoritative encounters and puzzle solutions from client content. */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import './register-content-loader.mjs';
const { applyAuthoredMapPlacements } = await import('../web/src/map-authoring.ts');

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
async function exportJSON(path, value) {
  const file = resolve(root, path), text = `${JSON.stringify(value, null, 2)}\n`;
  if (process.argv.includes('--check')) {
    if (await readFile(file, 'utf8') !== text) throw new Error(`${path} is stale; run npm run assets.`);
  } else await writeFile(file, text);
}
// The authoring loader resolves these to the complete private corpus. Browser
// modules now contain presentation registries and cannot produce grading data.
const { expeditionRegions } = await import('../web/src/expeditions.ts');
const { expeditionGames } = await import('../web/src/expedition-games.ts');
const encounters = expeditionRegions.flatMap(region => region.encounters.map(encounter => ({ id: encounter.id, mapId: region.id, choices: encounter.choices.map(choice => choice.correct) })));
const games = expeditionGames.map(game => {
  const fields = game.fields.map(field => ({ id: field.id, values: field.options.map(option => option.value) }));
  const validValues = [];
  function combinations(index, values) {
    if (index === fields.length) {
      if (game.validate(values).length === 0) validValues.push(fields.map(field => values[field.id]));
      return;
    }
    for (const value of fields[index].values) combinations(index + 1, { ...values, [fields[index].id]: value });
  }
  combinations(0, {});
  if (!validValues.length) throw new Error(`No reachable solution for ${game.id}`);
  return { id: game.id, fields, validValues, order: game.steps.map(step => step.id) };
});
await exportJSON('server/expeditions.json', { encounters, games });
const { maps: rawMaps } = await import('../web/src/maps.ts');
// Match getMap() exactly: physical proof must use the editor's placements,
// including after a designer moves an investigation object or its speaker.
const maps = rawMaps.map(map => applyAuthoredMapPlacements(map));
const { quests } = await import('../web/src/content.ts');
const graphs = JSON.parse(await readFile(resolve(root, 'web/src/data/dialogue-graphs.json'), 'utf8'));
const rules = graphs.map(graph => {
  const quest = quests.find(quest => quest.id === graph.questId);
  const map = maps.find(map => map.level === quest.level);
  const npc = map.npcs.find(npc => npc.id === quest.npcId);
  if (!npc) throw new Error(`Missing ${quest.npcId} in ${map.id}`);
  const choiceNode = graph.nodes.find(node => node.id === 'choice');
  const objects = graph.investigations.map(item => {
    const object = map.objects.find(object => object.id === item.objectId);
    if (!object) throw new Error(`Missing ${item.objectId} in ${map.id}`);
    return { id: object.id, x: object.x, y: object.y };
  });
  const replies = graph.nodes.flatMap(node => node.lines.flatMap(line => line.reply ? [line.reply.exerciseId] : []));
  return { questId: graph.questId, mapId: map.id, npcId: quest.npcId, npc: {id:npc.id,x:npc.x,y:npc.y}, gateExerciseId: graph.gateExerciseId, replyExerciseIds: replies, choiceIds: choiceNode.choices.map(choice => choice.id), choices: choiceNode.choices.map(choice => ({ id: choice.id, effects: choice.effects, ...(choice.condition ? { condition: choice.condition } : {}) })), investigationObjectIds: objects.map(object => object.id), objects };
});
await exportJSON('server/story_rules.json', { rules });
process.stdout.write(`Exported ${rules.length} investigations, ${encounters.length} encounters and ${games.length} validated neighborhood plans.\n`);
