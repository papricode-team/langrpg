#!/usr/bin/env node
/** Generate the shared client/server vocabulary syllabus from the course lexicon and the story graphs. */
import './register-content-loader.mjs';
import { readFile, writeFile } from 'node:fs/promises';
import { buildSyllabus } from './syllabus.mjs';
import { quests, npcs } from '../web/src/content.ts';

const course = JSON.parse(await readFile(new URL('../web/src/data/course.json', import.meta.url), 'utf8'));
const graphs = JSON.parse(await readFile(new URL('../web/src/data/dialogue-graphs.json', import.meta.url), 'utf8'));
const { storyMaps } = await import('../web/src/maps.ts');
const syllabus = buildSyllabus({ graphs, lexicon: course.lexicon, questOrder: quests.map(quest => quest.id), properNames: [...npcs.map(npc => npc.name), ...storyMaps.map(map => map.name)], edition: course.edition });
const output = JSON.stringify(syllabus, null, 1) + '\n';
for (const target of ['../web/src/data/syllabus.json', '../server/syllabus.json']) await writeFile(new URL(target, import.meta.url), output);
console.log(`Syllabus ${syllabus.version}: ${syllabus.wordIds.length} words at ${syllabus.wordsPerHour}/hour; ${syllabus.quests.length} conversations gated, last unlocks after ${syllabus.quests.at(-1)?.milestone ?? 0} words.`);
