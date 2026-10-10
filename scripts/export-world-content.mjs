#!/usr/bin/env node
/** Generate server-authoritative encounters and puzzle solutions from client content. */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import './register-content-loader.mjs';
const { applyAuthoredMapPlacements } = await import('../web/src/map-authoring.ts');

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
async function contentModule(path, prefix = '') {
  // UI helpers are used only by render functions, which this exporter never runs.
  const source = (await readFile(resolve(root, path), 'utf8')).replace(/^import .*;\s*$/gm, '');
  const compiled = ts.transpileModule(prefix + source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
}
const { expeditionRegions, expeditionMaps } = await contentModule('web/src/expeditions.ts');
const { expeditionGames } = await contentModule('web/src/expedition-games.ts');
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
await writeFile(resolve(root, 'server/expeditions.json'), `${JSON.stringify({ encounters, games }, null, 2)}\n`);
const { maps: rawMaps } = await contentModule('web/src/maps.ts', `const expeditionMaps = ${JSON.stringify(expeditionMaps)};\n`);
// Match getMap() exactly: physical proof must use the editor's placements,
// including after a designer moves an investigation object or its speaker.
const maps = rawMaps.map(map => applyAuthoredMapPlacements(map));
const { quests } = await contentModule('web/src/content.ts');
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
  return { questId: graph.questId, mapId: map.id, npcId: quest.npcId, npc, gateExerciseId: graph.gateExerciseId, choiceIds: choiceNode.choices.map(choice => choice.id), choices: choiceNode.choices.map(choice => ({ id: choice.id, effects: choice.effects })), investigationObjectIds: objects.map(object => object.id), objects };
});
await writeFile(resolve(root, 'server/story_rules.json'), `${JSON.stringify({ rules }, null, 2)}\n`);
process.stdout.write(`Exported ${rules.length} investigations, ${encounters.length} encounters and ${games.length} validated neighborhood plans.\n`);
