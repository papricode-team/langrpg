/**
 * Read-only audit through the same supported graph API used by play.
 * node docs/audits/measure-living-world-baseline.mjs . /tmp/current-area.json [--check-expansion]
 * The checked-in living-world-area-baseline.json is immutable historical evidence.
 */
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {readFile, writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {assessExpansion} from '../../scripts/world-expansion-audit.mjs';

const args = process.argv.slice(2), check = args.includes('--check-expansion');
const positional = args.filter(arg => arg !== '--check-expansion');
if (positional.length > 2) throw Error('Usage: measure-living-world-baseline.mjs [root] [output.json] [--check-expansion]');
const root = resolve(positional[0] ?? process.cwd());
await import(pathToFileURL(resolve(root, 'scripts/register-content-loader.mjs')).href);
const moduleAt = file => import(pathToFileURL(resolve(root, file)).href);
const {sceneDocument} = await moduleAt('web/src/scene-data.ts');
const {createMapNavigation} = await moduleAt('web/src/navigation.ts');
const {getPlacedScenery} = await moduleAt('web/src/placed-scenery.ts');
const {worldResidentSpecs} = await moduleAt('web/src/world-life.ts');
const baseline = JSON.parse(await readFile(resolve(root, 'docs/audits/living-world-area-baseline.json'), 'utf8'));
const measured = [];
for (const scene of Object.values(sceneDocument.maps)) {
  const grid = createMapNavigation(scene.id);
  if (!grid.isWalkable(scene.spawn.x, scene.spawn.y)) throw Error(`${scene.id}: authored spawn is not walkable`);
  const area = grid.auditConnectedArea(scene.spawn);
  if (!area.connectedCells) throw Error(`${scene.id}: spawn has no visible lattice anchor`);
  measured.push({
    id:scene.id, width:scene.width, height:scene.height, coordinateVersion:scene.coordinateVersion,
    npcs:scene.npcs.length, objects:scene.objects.length,
    scenery:getPlacedScenery(scene.id).length,
    residents:(worldResidentSpecs[scene.id]??[]).filter(resident=>!scene.residents?.some(authored=>authored.id===resident.id)).length+(scene.residents?.length??0),
    cellSize:area.cellSize, totalWalkableCells:area.totalWalkableCells,
    spawnConnectedCells:area.connectedCells, approxConnectedArea:area.connectedArea,
  });
}
const acceptance = assessExpansion(measured, baseline.maps);
const report = {
  sourceCommit:execFileSync('git', ['rev-parse','HEAD'], {cwd:root, encoding:'utf8'}).trim(),
  baselineCommit:baseline.sourceCommit,
  method:'NavigationGrid.auditConnectedArea; 14-unit grid centers and collision-safe runtime edges. Spawn-connected cells × 196 is a sampling proxy, not an exact polygon union. Includes placed-scenery collision and per-scene dimensions.',
  maps:measured, acceptance,
};
if (positional[1]) {
  const destination = resolve(positional[1]);
  if (destination === resolve(root, 'docs/audits/living-world-area-baseline.json')) throw Error('Refusing to overwrite the immutable expansion baseline');
  await writeFile(destination, JSON.stringify(report,null,2)+'\n');
}
console.log(JSON.stringify(report,null,2));
if (check && !acceptance.passed) process.exitCode = 1;
