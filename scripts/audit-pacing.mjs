#!/usr/bin/env node
/**
 * Measure the authored story against the intake budget. The report answers one
 * question per scene: how many words must the Atlas have restored before this
 * conversation can open, and at ten words an hour, which hour is that?
 */
import './register-content-loader.mjs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { pacingReport, questVocabularyDemand } from './syllabus.mjs';
import { quests, npcs } from '../web/src/content.ts';

const read = async path => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
const course = await read('../web/src/data/course.json');
const graphs = await read('../web/src/data/dialogue-graphs.json');
const syllabus = await read('../web/src/data/syllabus.json');
const { storyMaps } = await import('../web/src/maps.ts');
const questOrder = quests.map(quest => quest.id);
const demand = questVocabularyDemand({ graphs, lexicon: course.lexicon, questOrder, properNames: [...npcs.map(npc => npc.name), ...storyMaps.map(map => map.name)] });
const report = {
  method: 'Every German surface of a scene (lines, simpler variants, corrections, choices, optional questions and evidence) is mapped to course lexemes with the conservative exposure mapper. Names, Frau/Herr surnames, single-letter clues and explicitly glossed story words are excluded. A scene unlocks when all of its lexemes have been introduced; the syllabus introduces story vocabulary first, so unlockHour is the earliest hour of active play at which the scene can open. newWordsAboveBudget counts new lexemes plus glossed story words and unmapped words beyond one hour of intake. These are content measurements, not learner outcomes.',
  ...pacingReport({ syllabus, lexicon: course.lexicon, demand, questOrder }),
};
if (!process.argv.includes('--check')) {
  await mkdir(new URL('../docs/audits/', import.meta.url), { recursive: true });
  await writeFile(new URL('../docs/audits/pacing.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
}
const pad = (value, width) => String(value).padEnd(width);
console.log(`${pad('scene', 20)}${pad('lvl', 5)}${pad('lexemes', 9)}${pad('new', 6)}${pad('story+unmapped', 16)}${pad('unlocks after', 15)}${pad('hour', 7)}over budget`);
for (const quest of report.quests) console.log(`${pad(quest.questId, 20)}${pad(quest.level, 5)}${pad(quest.lexemes, 9)}${pad(quest.newLexemes, 6)}${pad(quest.storyWords.length + quest.unmapped.length, 16)}${pad(`${quest.milestone} words`, 15)}${pad(quest.unlockHour, 7)}${quest.newWordsAboveBudget}`);
console.log(`\n${report.totals.lexemes} lexemes scheduled at ${report.budget.wordsPerHour}/hour (${report.budget.openingWords} at the start): ${report.totals.wordsAtTarget} words by hour ${report.totals.hourTarget}; the whole lexicon takes ${report.totals.hoursForWholeLexicon} hours. The authored story uses ${report.totals.storyLexemes} lexemes and its last scene opens at hour ${report.totals.storyUnlockedByHour}.`);
