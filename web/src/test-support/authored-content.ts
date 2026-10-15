import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AuthoredContent } from '../content';

/**
 * Tests run without the content API, so they read the quests, characters and chapters from the same
 * authoring source the server's content build uses. Never imported by browser code paths: content.ts loads
 * it only when Vitest runs, and the production build drops that branch.
 */
/** Resolved with Node paths: DOM test environments replace the global URL class. */
const sourcePath = resolve(dirname(fileURLToPath(import.meta.url)), '../../../content/source.json');

export function authoredContent(): AuthoredContent {
  const source = JSON.parse(readFileSync(sourcePath, 'utf8')) as AuthoredContent;
  return { npcs: source.npcs, chapters: source.chapters, quests: source.quests };
}
