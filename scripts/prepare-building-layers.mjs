#!/usr/bin/env node
/** Compatibility entry point: bases now come from dedicated high-resolution stills. */
import { execFileSync } from 'node:child_process';
const args = process.argv.slice(2);
const maps = args.filter(arg => !['--set', 'day', 'night'].includes(arg));
execFileSync(process.execPath, ['scripts/prepare-static-buildings.mjs', ...args, ...(maps.length ? [] : ['lindenhafen', 'waldruh', 'nebelstadt'])], { stdio: 'inherit' });
