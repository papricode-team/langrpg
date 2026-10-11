/** Stitch overlapping ImageGen terrain sections without blurring their interiors. */
export function stitchPair(a, b, overlap, vertical = false, feather = 8) {
  const across = vertical ? a.height : a.width;
  const along = vertical ? a.width : a.height;
  const bAcross = vertical ? b.height : b.width;
  if (along !== (vertical ? b.width : b.height) || overlap < 2 || overlap >= Math.min(across, bAcross)) {
    throw Error('Terrain sections must have matching edges and a valid overlap');
  }
  const offset = (image, x, y) => ((vertical ? x * image.width + y : y * image.width + x) * 3);
  const parents = new Int16Array(overlap * along);
  let previous = new Float64Array(overlap);
  // Find a continuous seam through matching pixels, avoiding a double curb or
  // broad blurry crossfade when the separately painted stone joints differ.
  for (let y = 0; y < along; y++) {
    const current = new Float64Array(overlap);
    for (let x = 0; x < overlap; x++) {
      const ai = offset(a, across - overlap + x, y), bi = offset(b, x, y);
      let cost = 0;
      for (let c = 0; c < 3; c++) cost += Math.abs(a.data[ai + c] - b.data[bi + c]);
      // Keep a small margin so the feather always fits inside both paintings.
      if (x < feather || x >= overlap - feather) cost += 1000;
      let parent = x;
      if (y > 0) {
        for (let neighbor = Math.max(0, x - 1); neighbor <= Math.min(overlap - 1, x + 1); neighbor++) {
          if (previous[neighbor] < previous[parent]) parent = neighbor;
        }
        cost += previous[parent];
      }
      current[x] = cost;
      parents[y * overlap + x] = parent;
    }
    previous = current;
  }
  const seam = new Int16Array(along);
  let best = 0;
  for (let x = 1; x < overlap; x++) if (previous[x] < previous[best]) best = x;
  for (let y = along - 1; y >= 0; y--) { seam[y] = best; best = parents[y * overlap + best]; }
  const length = across + bAcross - overlap;
  const result = { width: vertical ? along : length, height: vertical ? length : along, data: Buffer.alloc(length * along * 3) };
  for (let y = 0; y < along; y++) for (let x = 0; x < length; x++) {
    const local = x - across + overlap;
    const blend = Math.max(0, Math.min(1, (local - seam[y] + feather / 2) / feather));
    const ai = offset(a, x, y), bi = offset(b, local, y), out = offset(result, x, y);
    for (let c = 0; c < 3; c++) {
      result.data[out + c] = x < across - overlap ? a.data[ai + c]
        : x >= across ? b.data[bi + c]
          : Math.round(a.data[ai + c] * (1 - blend) + b.data[bi + c] * blend);
    }
  }
  return result;
}

export function stitchTerrain(tiles, overlap) {
  return stitchPair(stitchPair(tiles.nw, tiles.ne, overlap), stitchPair(tiles.sw, tiles.se, overlap), overlap, true);
}
