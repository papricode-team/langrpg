/** Compare dimensions and reachable land independently; disconnected land never counts. */
export function assessExpansion(current, baseline) {
  const seen = new Set(), issues = [];
  for (const map of current) {
    if (seen.has(map.id)) issues.push(`${map.id}: duplicate map measurement`);
    seen.add(map.id);
  }
  const maps = baseline.map(original => {
    const map = current.find(value => value.id === original.id);
    const minimum = {width:3072, height:2048, connectedCells:original.spawnConnectedCells*2,
      connectedArea:original.minExpandedConnectedArea};
    const failures = [];
    if (!map) failures.push('map is missing');
    else {
      if (!Number.isFinite(map.width) || map.width < minimum.width) failures.push(`width ${map.width} < ${minimum.width}`);
      if (!Number.isFinite(map.height) || map.height < minimum.height) failures.push(`height ${map.height} < ${minimum.height}`);
      if (map.cellSize !== 14) failures.push('sampling cell size differs from the immutable baseline');
      if (!Number.isInteger(map.spawnConnectedCells) || map.spawnConnectedCells < minimum.connectedCells) {
        failures.push(`spawn-connected cells ${map.spawnConnectedCells} < ${minimum.connectedCells}`);
      }
      if (map.approxConnectedArea !== map.spawnConnectedCells*196) failures.push('connected area is inconsistent with the runtime sampling method');
    }
    return {id:original.id, passed:!failures.length, minimum, failures};
  });
  return {passed:!issues.length && maps.every(map=>map.passed), issues, maps};
}
