/**
 * Quests, characters, chapters and vocabulary for Node tools, read from content/source.json (the only
 * source) in exactly the shape web/src/content.ts exports.
 *
 * Importing this module also fills content.ts's registries in place. Web modules a tool imports afterwards
 * (interiors, i18n units, story lint and so on) read the same arrays, so import this before them: as the
 * first import, or before any dynamic import of web modules.
 */
import { readFileSync } from 'node:fs';
import { chapters, installAuthoredContent, npcs, quests, vocabulary } from '../web/src/content.ts';

const source = JSON.parse(readFileSync(new URL('../content/source.json', import.meta.url), 'utf8'));
installAuthoredContent({ npcs: source.npcs, chapters: source.chapters, quests: source.quests });

export { chapters, npcs, quests, vocabulary };
