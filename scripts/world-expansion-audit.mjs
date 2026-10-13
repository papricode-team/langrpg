/** Town size and connected land are independent of the navigation grid density. */
export const townSizeTargets = {
  lindenhafen: {width:2304,height:1536},
  waldruh: {width:2304,height:1024},
  nebelstadt: {width:2304,height:1024},
};

export function assessExpansion(current, baseline) {
  const seen = new Set(), issues = [];
  for (const map of current) {
    if (seen.has(map.id)) issues.push(`${map.id}: duplicate map measurement`);
    if (!townSizeTargets[map.id]) issues.push(`${map.id}: retired or unregistered outdoor map`);
    seen.add(map.id);
  }
  const maps = Object.entries(townSizeTargets).map(([id, dimensions]) => {
    const original = baseline.find(map => map.id === id);
    const map = current.find(value => value.id === id);
    const minimum = {...dimensions, connectedArea:original?.approxConnectedArea, reachableRatio:.995};
    const failures = [];
    if (!original || !Number.isFinite(original.approxConnectedArea)) failures.push('original connected-area baseline is missing');
    if (!map) failures.push('map is missing');
    else {
      if (map.width !== dimensions.width) failures.push(`width ${map.width} differs from planned ${dimensions.width}`);
      if (map.height !== dimensions.height) failures.push(`height ${map.height} differs from planned ${dimensions.height}`);
      if (map.cellSize !== 8) failures.push('runtime sampling requires an 8-unit grid');
      if (!Number.isInteger(map.spawnConnectedCells) || map.spawnConnectedCells < 1
        || map.approxConnectedArea !== map.spawnConnectedCells * map.cellSize ** 2) failures.push('connected area is inconsistent with the runtime sampling method');
      if (!Number.isFinite(map.approxConnectedArea) || map.approxConnectedArea < minimum.connectedArea) {
        failures.push(`spawn-connected area ${map.approxConnectedArea} < original ${minimum.connectedArea}`);
      }
      if (!Number.isInteger(map.walkableSamples) || map.walkableSamples < 1 || !Number.isInteger(map.reachableSamples)
        || map.reachableSamples < 0 || map.reachableSamples > map.walkableSamples) failures.push('walkable sample counts are missing or invalid');
      else if (map.reachableSamples / map.walkableSamples < minimum.reachableRatio) failures.push('spawn reaches less than 99.5% of walkable samples');
    }
    return {id, passed:!failures.length, minimum, failures};
  });
  return {passed:!issues.length && maps.every(map=>map.passed), issues, maps};
}
