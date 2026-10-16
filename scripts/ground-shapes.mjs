/**
 * Designs a town's ground from shapes instead of brush strokes: streets as lines with a width, squares as
 * rounded rectangles, rivers and ponds as lines or polygons. Each shape fills its material with an edge one
 * sample wide, so the renderer can draw its kerb or canal wall exactly on the designed outline. Later
 * shapes cover earlier ones; `patches` add soft natural variation (moss, dry grass) to the base. Natural
 * shapes (forest floor, a stream, a worn earth path) can take `soft`, an edge that fades over that many
 * world units, and `wobble`, how far the outline wanders from the drawn shape.
 *
 *   shapeGround({width, height}, {base: 'meadow', shapes: [
 *     {material: 'deep-water', line: [[1640, -40], [700, 1580]], width: 124},
 *     {material: 'cobble', line: [[0, 268], [1320, 228]], width: 84},
 *     {material: 'limestone', rect: [600, 570, 1130, 790], radius: 70},
 *     {material: 'gravel', polygon: [[...], ...]},
 *     {material: 'meadow', circle: [900, 935], radius: 40},
 *     {material: 'shallow-water', line: [[1560, -40], [1130, 1064]], width: 84, wobble: 10},
 *   ], patches: [{material: 'moss', amount: 0.5, scale: 180}]})
 */
import './register-content-loader.mjs';
const {groundFromLayers, groundGrid, GROUND_CELL, MAX_GROUND_LAYERS} = await import('../web/src/ground.ts');
const {terrainMaterial} = await import('../web/src/terrain-materials.ts');

const segment = (px, py, [ax, ay], [bx, by]) => {
  const dx = bx - ax, dy = by - ay, length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / length)) : 0;
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
};
const polyline = (x, y, points) => {
  let distance = Infinity;
  for (let i = 1; i < points.length; i++) distance = Math.min(distance, segment(x, y, points[i - 1], points[i]));
  return points.length === 1 ? Math.hypot(x - points[0][0], y - points[0][1]) : distance;
};
const inside = (x, y, polygon) => {
  let result = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [ax, ay] = polygon[i], [bx, by] = polygon[j];
    if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) result = !result;
  }
  return result;
};

/** Signed distance from a point to a shape's outline: negative inside. */
export function shapeDistance(shape, x, y) {
  if (shape.line) return polyline(x, y, shape.line) - (shape.width ?? 0) / 2;
  if (shape.circle) return Math.hypot(x - shape.circle[0], y - shape.circle[1]) - shape.radius;
  if (shape.rect) {
    const [x0, y0, x1, y1] = shape.rect, r = Math.min(shape.radius ?? 0, (x1 - x0) / 2, (y1 - y0) / 2);
    const qx = Math.abs(x - (x0 + x1) / 2) - ((x1 - x0) / 2 - r), qy = Math.abs(y - (y0 + y1) / 2) - ((y1 - y0) / 2 - r);
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
  }
  if (shape.polygon) {
    const edge = polyline(x, y, [...shape.polygon, shape.polygon[0]]);
    return inside(x, y, shape.polygon) ? -edge : edge;
  }
  throw new Error('A shape needs line (with width), rect, polygon or circle.');
}

const hash = (x, y, seed) => { const s = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453; return s - Math.floor(s); };
/** Smooth value noise in 0–1 with features about `scale` world units across. */
function noise(x, y, scale, seed) {
  const fx = x / scale, fy = y / scale, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
  const ease = t => t * t * (3 - 2 * t), a = hash(ix, iy, seed), b = hash(ix + 1, iy, seed), c = hash(ix, iy + 1, seed), d = hash(ix + 1, iy + 1, seed);
  return a + (b - a) * ease(tx) + (c - a) * ease(ty) + (a - b - c + d) * ease(tx) * ease(ty);
}

/** A ground for a town of `size` from a base material, shapes painted in order, and soft patches on the base. */
export function shapeGround({width, height}, {base, shapes = [], patches = [], cell = GROUND_CELL, features = []}) {
  const materials = [...new Set([base, ...patches.map(patch => patch.material), ...shapes.map(shape => shape.material)])];
  for (const material of materials) if (!terrainMaterial(material)) throw new Error(`Unknown ground material ${material}.`);
  if (materials.length > MAX_GROUND_LAYERS) throw new Error(`A town can use ${MAX_GROUND_LAYERS} ground materials; these shapes use ${materials.join(', ')}.`);
  const {columns, rows} = groundGrid(width, height, cell);
  const values = materials.map(() => new Float32Array(columns * rows));
  const fill = (distance, soft = cell) => Math.max(0, Math.min(1, 0.5 - distance / (2 * Math.max(cell, soft))));
  const outline = (shape, x, y, order) => shapeDistance(shape, x, y) + (shape.wobble ? (noise(x, y, shape.wobbleScale ?? 90, 40 + order) - 0.5) * 2 * shape.wobble : 0);
  for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
    const x = column * cell, y = row * cell, index = row * columns + column;
    const weights = materials.map(() => 0);
    weights[0] = 1;
    patches.forEach((patch, order) => {
      const amount = Math.max(0, Math.min(patch.amount ?? 0.5, ((noise(x, y, patch.scale ?? 180, order + 1) - (patch.threshold ?? 0.55)) * 2.2)));
      const target = materials.indexOf(patch.material);
      for (let layer = 0; layer < weights.length; layer++) weights[layer] *= 1 - amount;
      weights[target] += amount;
    });
    for (const [order, shape] of shapes.entries()) {
      const cover = fill(outline(shape, x, y, order), shape.soft);
      if (!cover) continue;
      const target = materials.indexOf(shape.material);
      for (let layer = 0; layer < weights.length; layer++) weights[layer] *= 1 - cover;
      weights[target] += cover;
    }
    weights.forEach((weight, layer) => { values[layer][index] = weight * 255; });
  }
  const layers = values.map(layer => Uint8Array.from(layer, Math.round));
  for (let index = 0; index < columns * rows; index++) { // rounding must not change a sample's total
    let total = 0;
    for (const layer of layers) total += layer[index];
    const largest = layers.reduce((best, layer, at) => layer[index] > layers[best][index] ? at : best, 0);
    layers[largest][index] = Math.max(0, Math.min(255, layers[largest][index] + 255 - total));
  }
  return groundFromLayers(materials, layers, cell, features);
}
