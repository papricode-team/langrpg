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
const {sceneActivityPlaces,sceneEntrancePoint} = await moduleAt('web/src/scene-schema.ts');
const baseline = JSON.parse(await readFile(resolve(root, 'docs/audits/living-world-area-baseline.json'), 'utf8'));
const measured = [];
for (const scene of Object.values(sceneDocument.maps)) {
  // Compare like-for-like with the immutable point-foot expansion baseline.
  const grid = createMapNavigation(scene.id,{agentRadius:0});
  const playerGrid = createMapNavigation(scene.id);
  const playerArea = playerGrid.auditConnectedArea(scene.spawn);
  if (!grid.isWalkable(scene.spawn.x, scene.spawn.y)) throw Error(`${scene.id}: authored spawn is not walkable`);
  const area = grid.auditConnectedArea(scene.spawn);
  const reachability = grid.auditReachability(scene.spawn);
  const targets=[...scene.npcs,...scene.objects,
    ...(scene.entrances??[]).flatMap(door=>[false,true].map(returning=>sceneEntrancePoint(scene,door,returning))),
    ...(scene.activities??[]).flatMap(activity=>sceneActivityPlaces(scene,activity))];
  const requiredTargetsReachable=targets.every(target=>{
    const approach=playerGrid.closestPoint(target.x,target.y,scene.spawn);
    return Math.hypot(approach.x-target.x,approach.y-target.y)<=120&&playerGrid.findPath(scene.spawn,approach).length>0;
  });
  if (!area.connectedCells) throw Error(`${scene.id}: spawn has no visible lattice anchor`);
  measured.push({
    id:scene.id, width:scene.width, height:scene.height, coordinateVersion:scene.coordinateVersion,
    npcs:scene.npcs.length, objects:scene.objects.length,
    scenery:getPlacedScenery(scene.id).length,
    residents:(worldResidentSpecs[scene.id]??[]).filter(resident=>!scene.residents?.some(authored=>authored.id===resident.id)).length+(scene.residents?.length??0),
    cellSize:area.cellSize, totalWalkableCells:area.totalWalkableCells,
    spawnConnectedCells:area.connectedCells, approxConnectedArea:area.connectedArea,
    walkableSamples:reachability.walkableSamples,reachableSamples:reachability.reachableSamples,
    unreachableSamples:reachability.unreachableSamples,reachableRatio:reachability.reachableRatio,
    navigationModel:scene.navigation?.model??'street-polygons',requiredTargetsReachable,
    playerRadius:playerGrid.agentRadius,playerCellSize:playerArea.cellSize,
    playerConnectedArea:playerArea.connectedArea,playerWalkableCells:playerArea.totalWalkableCells,
    playerConnectedCells:playerArea.connectedCells,
  });
}
const acceptance = assessExpansion(measured, baseline.maps);
const report = {
  sourceCommit:execFileSync('git', ['rev-parse','HEAD'], {cwd:root, encoding:'utf8'}).trim(),
  baselineCommit:baseline.sourceCommit,
  method:'Historical expansion comparison uses point feet, 8-unit grid centres and exact segment collision, matching the immutable baseline. Spawn-connected cells × 64 is an area proxy. Separate player fields use a 10-unit footprint and 4-unit grid. Clear-land maps may contain isolated empty terrain; every required character, discovery, door and activity must have a reachable player approach.',
  maps:measured, acceptance,
};
if (positional[1]) {
  const destination = resolve(positional[1]);
  if (destination === resolve(root, 'docs/audits/living-world-area-baseline.json')) throw Error('Refusing to overwrite the immutable expansion baseline');
  await writeFile(destination, JSON.stringify(report,null,2)+'\n');
}
console.log(JSON.stringify(report,null,2));
if (check && !acceptance.passed) process.exitCode = 1;
