/** Audit build-specific walking options against the regular mannequin. */
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

export function missingWardrobeOptions(catalogue) {
  const components = catalogue.components ?? catalogue.entries.filter(entry => entry.status === 'approved' && !entry.expression && (!entry.poseSet || entry.poseSet === 'walk'));
  const regular = components.filter(part => part.build === 'regular' && part.slot !== 'body');
  const builds = [...new Set(components.filter(part => part.slot === 'body').map(part => part.build))].filter(build => build !== 'regular');
  return builds.flatMap(build => regular.filter(part => !components.some(candidate => candidate.build === build && candidate.slot === part.slot && candidate.optionId === part.optionId)).map(part => ({build, slot: part.slot, optionId: part.optionId, sourceId: part.id, id: `${part.id}-${build}`})));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const catalogue = JSON.parse(await readFile(new URL('../server/character-kit.json', import.meta.url)));
  const missing = missingWardrobeOptions(catalogue);
  console.log(JSON.stringify({missingCount: missing.length, missing}, null, 2));
  if (process.argv.includes('--check') && missing.length) process.exitCode = 1;
}
