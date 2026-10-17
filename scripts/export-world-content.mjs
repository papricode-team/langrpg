#!/usr/bin/env node
/** Generate server-authoritative encounters and puzzle solutions from client content. */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import './register-content-loader.mjs';
import { quests } from './content-source.mjs';
import { syncLegacyServer } from './legacy-server-sync.mjs';
const { applyAuthoredMapPlacements } = await import('../web/src/map-authoring.ts');

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
async function exportJSON(path, value) {
  const file = resolve(root, path), text = `${JSON.stringify(value, null, 2)}\n`;
  if (process.argv.includes('--check')) {
    if (await readFile(file, 'utf8') !== text) throw new Error(`${path} is stale; run npm run assets.`);
  } else await writeFile(file, text);
}
// build-content reads the server manifests from content/source.json's copy.
const syncCopy = (kind, value) => { if (!process.argv.includes('--check')) syncLegacyServer(kind, value); };
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
syncCopy('expeditions', { encounters, games });
const { maps: rawMaps } = await import('../web/src/maps.ts');
// Match getMap() exactly: physical proof must use the editor's placements,
// including after a designer moves an investigation object or its speaker.
const maps = rawMaps.map(map => applyAuthoredMapPlacements(map));
const graphs = JSON.parse(await readFile(resolve(root, 'web/src/data/dialogue-graphs.json'), 'utf8'));
const { getInterior } = await import('../web/src/interiors.ts');
const rules = graphs.map(graph => {
  const quest = quests.find(quest => quest.id === graph.questId);
  const map = maps.find(map => map.level === (quest.level === 'A0' ? 'A1' : quest.level));
  if (quest.level === 'A0') {
    const interior = getInterior(graph.interiorId);
    const npc = interior.npcs.find(npc => npc.id === quest.npcId);
    if (!npc) throw new Error(`Missing ${quest.npcId} in ${interior.id}`);
    const objects = graph.investigations.map(item => {
      const object = interior.objects.find(object => object.id === item.worldId);
      if (!object) throw new Error(`Missing ${item.worldId} in ${interior.id}`);
      return { id: item.objectId, x: object.x, y: object.y };
    });
    const choices = graph.nodes.find(node => node.id === 'choice').choices;
    const replies = graph.nodes.flatMap(node => node.lines.flatMap(line => line.reply ? [line.reply.exerciseId] : []));
    return {questId:graph.questId,mapId:map.id,npcId:quest.npcId,npc:{id:npc.id,x:npc.x,y:npc.y},interiorId:graph.interiorId,gateKind:graph.gateKind,gateExerciseId:graph.gateExerciseId,replyExerciseIds:replies,choiceIds:choices.map(c=>c.id),choices:choices.map(c=>({id:c.id,effects:c.effects})),investigationObjectIds:objects.map(i=>i.id),...(graph.completionInvestigations?.length?{completionInvestigationObjectIds:graph.completionInvestigations}:{}),...(graph.optionalInvestigations?.length?{optionalInvestigationObjectIds:graph.optionalInvestigations}:{}),objects};
  }
  const npc = map.npcs.find(npc => npc.id === quest.npcId);
  if (!npc) throw new Error(`Missing ${quest.npcId} in ${map.id}`);
  const choiceNode = graph.nodes.find(node => node.id === 'choice');
  const objects = graph.investigations.map(item => {
    const object = map.objects.find(object => object.id === item.objectId);
    if (!object) throw new Error(`Missing ${item.objectId} in ${map.id}`);
    return { id: object.id, x: object.x, y: object.y };
  });
  const replies = graph.nodes.flatMap(node => node.lines.flatMap(line => line.reply ? [line.reply.exerciseId] : []));
  // A locked investigation opens only with the named key, ledger or trust.
  const locks = graph.investigations.filter(item => item.lock).map(item => ({ objectId: item.objectId, condition: item.lock.condition, reason: item.lock.reason }));
  return { questId: graph.questId, mapId: map.id, npcId: quest.npcId, npc: {id:npc.id,x:npc.x,y:npc.y}, gateExerciseId: graph.gateExerciseId, replyExerciseIds: replies, choiceIds: choiceNode.choices.map(choice => choice.id), choices: choiceNode.choices.map(choice => ({ id: choice.id, effects: choice.effects, ...(choice.condition ? { condition: choice.condition } : {}) })), investigationObjectIds: objects.map(object => object.id), objects, ...(locks.length ? { locks } : {}) };
});
// Fading names and Otto's tickets: authored apart from the scenes, placed on the scene's anchors.
const { getWorldScene } = await import('../web/src/scene-data.ts');
const mechanics = JSON.parse(await readFile(resolve(root, 'content/story-mechanics.json'), 'utf8'));
const place = (row, label) => {
  if (!row.anchor) return row;
  const scene = getWorldScene(row.mapId), [kind, id] = row.anchor.split(':');
  const anchor = (kind === 'npc' ? scene.npcs : kind === 'object' ? scene.objects : kind === 'scenery' ? scene.scenery : []).find(item => item.id === id);
  if (!anchor) throw new Error(`Missing ${label} anchor ${row.anchor} for ${row.id}`);
  const { anchor: name, ...rest } = row;
  return { id: rest.id, mapId: rest.mapId, anchor: name, x: anchor.x / scene.width, y: anchor.y / scene.height, ...rest };
};
const ink = { ...mechanics.ink, entries: mechanics.ink.entries.map(entry => place(entry, 'ink')) };
const sideQuests = mechanics.sideQuests.map(side => place(side, 'ticket'));
await exportJSON('server/story_rules.json', { rules, ink, sideQuests });
syncCopy('storyRules', { rules, ink, sideQuests });
process.stdout.write(`Exported ${rules.length} investigations, ${encounters.length} encounters and ${games.length} validated neighborhood plans.\n`);
