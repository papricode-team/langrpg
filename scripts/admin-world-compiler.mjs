#!/usr/bin/env node
/** Read-only publication bridge: validate an admin draft and derive server authority. */
import {readFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {compileSceneDocument} from './scene-compiler.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const maxSceneBytes = 2 * 1024 * 1024;

/**
 * Mirrors the local compiler without publishing anything to the source checkout.
 * Composition hints are warnings for admins; anything that would break play is an error.
 */
export async function compileAdminWorld(value, {root = projectRoot} = {}) {
  const compiled = await compileSceneDocument(value, {root, strictQuality: false});
  // Scene edits only change physical placements. Keep the canonical encounter
  // and plan grading rules exported by export-world-content.mjs unchanged.
  const expeditions = JSON.parse(await readFile(resolve(root, 'server/expeditions.json'), 'utf8'));
  return {
    document: compiled.document,
    worldMaps: compiled.registry,
    investigations: compiled.storyRules,
    expeditions,
    contentVersion: compiled.contentVersion,
    diagnostics: compiled.warnings,
    problems: compiled.problems,
  };
}

async function readSceneDocument(input) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of input) {
    bytes += chunk.length;
    if (bytes > maxSceneBytes) throw new Error('Scene document exceeds the 2 MiB authoring request limit.');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new Error('The scene document is not valid JSON.'); }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 0 && (args.length !== 2 || args[0] !== '--root' || !args[1])) {
    throw new Error('Usage: node scripts/admin-world-compiler.mjs [--root <project-root>] < scene.json');
  }
  const root = args.length ? resolve(args[1]) : projectRoot;
  const value = await readSceneDocument(process.stdin);
  const bundle = await compileAdminWorld(value, {root});
  process.stdout.write(`${JSON.stringify(bundle)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await main(); }
  catch (error) {
    const message = String(error.message ?? error);
    const problems = Array.isArray(error.problems) ? error.problems : [{code: 'invalid', map: '', message, objectIds: [], severity: 'error'}];
    process.stderr.write(`${JSON.stringify({error: problems[0].message, problems})}\n`);
    process.exitCode = 1;
  }
}
