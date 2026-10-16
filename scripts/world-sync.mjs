#!/usr/bin/env node
/**
 * Moves the world between a server and local files. The server owns the world;
 * local copies are for reading, offline edits and seeding a development database.
 *
 *   npm run world:pull                  write the server's world to .world/world.json
 *   npm run world:pull -- --seed        also make it the seed for new databases (content/world-seed.json)
 *   npm run world:push                  publish .world/world.json if the server has not changed since the pull
 *   npm run world:push -- --check       only validate it
 *   --file <path>                       use another bundle
 *
 * GLOTWORLD_URL and GLOTWORLD_ADMIN_TOKEN select the server; see scripts/world-client.mjs.
 */
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {worldClient, worldExportFormat} from './world-client.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const defaultBundlePath = resolve(root, '.world/world.json');
export const seedPath = resolve(root, 'content/world-seed.json');

export async function pullWorld(client, {file = defaultBundlePath, seed = false} = {}) {
  const bundle = await client.export();
  if (bundle.format !== worldExportFormat) throw new Error(`The server sent ${bundle.format}; this checkout reads ${worldExportFormat}.`);
  await mkdir(dirname(file), {recursive: true});
  await writeFile(file, `${JSON.stringify(bundle, null, 2)}\n`);
  if (seed) await writeFile(seedPath, `${JSON.stringify(bundle.document, null, 2)}\n`);
  return bundle;
}

export async function pushWorld(client, {file = defaultBundlePath, check = false} = {}) {
  const bundle = JSON.parse(await readFile(file, 'utf8'));
  if (bundle.format !== worldExportFormat || !bundle.document || typeof bundle.revision !== 'string') throw new Error(`${file} is not a pulled world (${worldExportFormat}).`);
  if (check) return client.validate(bundle.document);
  const result = await client.import(bundle, bundle.revision);
  // The pushed file now describes the published revision, so a second push needs a fresh pull.
  await writeFile(file, `${JSON.stringify({...bundle, revision: result.revision, contentVersion: result.contentVersion}, null, 2)}\n`);
  return result;
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const option = name => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; };
  const file = option('--file') ? resolve(option('--file')) : defaultBundlePath;
  const client = worldClient();
  if (command === 'pull') {
    const bundle = await pullWorld(client, {file, seed: args.includes('--seed')});
    console.log(`Pulled revision ${bundle.revision} (${Object.keys(bundle.document.maps).length} towns) from ${client.origin} to ${file}.`);
  } else if (command === 'push') {
    const result = await pushWorld(client, {file, check: args.includes('--check')});
    console.log(args.includes('--check') ? `Valid (${result.contentVersion}).` : `Published revision ${result.revision} on ${client.origin}.`);
    for (const line of result.diagnostics ?? []) console.warn(line);
  } else throw new Error('Usage: node scripts/world-sync.mjs pull [--seed] | push [--check] [--file <path>]');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await main(); }
  catch (error) {
    console.error(error.message);
    for (const problem of error.problems ?? []) console.error(`- ${problem.map ? `${problem.map}: ` : ''}${problem.message}`);
    process.exitCode = 1;
  }
}
