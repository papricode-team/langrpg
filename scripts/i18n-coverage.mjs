#!/usr/bin/env node
// Turkish support coverage. Fails (exit 1) when any story unit lacks a current Turkish
// entry, when a placeholder is lost, or when a t('…') interface key has no Turkish string.
// Usage:
//   node scripts/i18n-coverage.mjs            report + check
//   node scripts/i18n-coverage.mjs --units    print every story unit as JSON (for translators)
//   node scripts/i18n-coverage.mjs --review   print a de/en/tr TSV for native-speaker review
//   node scripts/i18n-coverage.mjs --write    refresh web/src/data/i18n/tr-coverage.json (shown in Settings)
import './register-content-loader.mjs';
import './content-source.mjs';
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const { storyUnits, storyCoverage, uiKeys } = await import('../web/src/i18n-units.ts');
const { courseCoverage, coverageSummary } = await import('../web/src/i18n-course-coverage.ts');
const read = path => JSON.parse(readFileSync(join(root, path), 'utf8'));
const story = read('web/src/data/i18n/tr-story.json');
const ui = read('web/src/data/i18n/tr-ui.json');
const course = read('web/src/data/i18n/tr-course.json');
const units = storyUnits();

if (process.argv.includes('--units')) { console.log(JSON.stringify(units, null, 1)); process.exit(0); }
if (process.argv.includes('--review')) {
  const cell = value => String(value ?? '').replace(/\s+/g, ' ');
  console.log(['id', 'german', 'english', 'turkish'].join('\t'));
  for (const unit of units) console.log([unit.id, unit.kind === 'sentence' ? unit.source : '', unit.english, story[unit.id]?.tr].map(cell).join('\t'));
  process.exit(0);
}

const sources = [];
const walk = dir => { for (const item of readdirSync(dir, { withFileTypes: true })) { const path = join(dir, item.name); if (item.isDirectory()) walk(path); else if (/\.ts$/.test(item.name) && !/\.test\.ts$/.test(item.name)) sources.push(readFileSync(path, 'utf8')); } };
walk(join(root, 'web/src'));
// Catalogue labels are runtime data, so static t('…') scanning cannot see them.
const characterKit = existsSync(join(root, 'web/src/data/character-kit.json')) ? read('web/src/data/character-kit.json') : null;
const characterKeys = characterKit ? [...characterKit.slots, ...characterKit.components].map(item => item.labelKey).concat(Object.values(characterKit.poseSets ?? {}).map(pose => pose.label)) : [];
const keys = [...new Set([...uiKeys(sources), ...characterKeys])].sort();
const uiMissing = keys.filter(key => !ui[key]?.trim());
const uiPlaceholders = keys.filter(key => ui[key] && (key.match(/\{\w+\}/g) ?? []).sort().join() !== (ui[key].match(/\{\w+\}/g) ?? []).sort().join());
const report = storyCoverage(units, story);
const courseReport = courseCoverage(course, ui);
const pct = (part, whole) => whole ? `${(part / whole * 100).toFixed(1)}%` : '—';

console.log(`Story:  ${report.translated} / ${report.total} units (${pct(report.translated, report.total)})`);
console.log(`UI:     ${keys.length - uiMissing.length} / ${keys.length} t() strings (${pct(keys.length - uiMissing.length, keys.length)})`);
for (const [name, value] of Object.entries(courseReport)) console.log(`Course: ${name.padEnd(28)} ${value.translated} / ${value.total} (${pct(value.translated, value.total)})`);
const problems = [
  ...report.missing.map(unit => `missing story unit ${unit.id}: ${unit.source}`),
  ...report.stale.map(({ unit }) => `stale story unit ${unit.id}: source is now "${unit.source}"`),
  ...report.placeholders.map(id => `placeholder mismatch in ${id}`),
  ...report.inconsistent.map(pair => `one German sentence, two Turkish meanings: ${pair}`),
  ...uiMissing.map(key => `missing UI string: ${key}`),
  ...uiPlaceholders.map(key => `placeholder mismatch in UI string: ${key}`),
  ...Object.entries(courseReport).filter(([, part]) => part.translated !== part.total).map(([name, part]) => `incomplete Turkish ${name}: ${part.translated} / ${part.total}`),
];
const summary = coverageSummary({ story: report, uiTotal: keys.length, uiTranslated: keys.length - uiMissing.length, course: courseReport });
const summaryPath = join(root, 'web/src/data/i18n/tr-coverage.json');
if (process.argv.includes('--write')) writeFileSync(summaryPath, JSON.stringify(summary) + '\n');
else if (JSON.stringify(read('web/src/data/i18n/tr-coverage.json')) !== JSON.stringify(summary)) problems.push('web/src/data/i18n/tr-coverage.json is out of date: run node scripts/i18n-coverage.mjs --write');
console.log(`Settings figure: ${JSON.stringify(summary)}`);
if (report.orphaned.length) console.log(`Note: ${report.orphaned.length} overlay entries no longer match a story unit (safe to remove).`);
for (const problem of problems.slice(0, 80)) console.log(problem);
if (problems.length > 80) console.log(`… ${problems.length - 80} more`);
console.log(problems.length ? `${problems.length} Turkish coverage problem(s).` : 'Turkish story and interface coverage complete.');
process.exitCode = problems.length ? 1 : 0;
