#!/usr/bin/env node
// Usage: node scripts/story-lint.mjs [dialogue-graphs.json]  (defaults to the shipped graphs)
import './register-content-loader.mjs';
import { readFileSync } from 'node:fs';
const { lintStory } = await import('../web/src/story-lint.ts');
const path = process.argv[2] ?? new URL('../web/src/data/dialogue-graphs.json', import.meta.url).pathname;
const graphs = JSON.parse(readFileSync(path, 'utf8'));
const rules = JSON.parse(readFileSync(new URL('../server/story_rules.json', import.meta.url), 'utf8')).rules;
const errors = lintStory(graphs, rules);
for (const error of errors) console.log(error);
console.log(`${errors.length} story lint finding(s) in ${graphs.length} scenes`);
process.exitCode = errors.length ? 1 : 0;
