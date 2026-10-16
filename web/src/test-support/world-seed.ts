import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseWorldSceneDocument, type WorldSceneDocument } from '../scene-schema';

/**
 * The game loads its world from the server, which owns it in PostgreSQL. Tests and Node tooling run without a
 * server, so they read the seed world that fills an empty database. Never imported by browser code paths:
 * scene-data.ts loads it only under Vitest or plain Node, and the production build drops that branch.
 */
const seedPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../../content/world-seed.json');

/** The seed exactly as stored, for tests that edit raw JSON. */
export function seedWorldSource(): {version: number; maps: Record<string, any>; prefabs?: unknown[]} {
  return JSON.parse(readFileSync(seedPath, 'utf8'));
}

export function seedWorld(): WorldSceneDocument {
  return parseWorldSceneDocument(seedWorldSource());
}

/** Tests publish the seed under this content version. */
export const seedContentVersion = 'seed-world';
