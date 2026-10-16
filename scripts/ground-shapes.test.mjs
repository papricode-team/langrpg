import test from 'node:test';
import assert from 'node:assert/strict';
import {shapeGround} from './ground-shapes.mjs';
const {groundLayers} = await import('../web/src/ground.ts');

const size = {width: 400, height: 160};
const weights = (ground, material) => {
  const {columns, layers} = groundLayers(ground, size.width, size.height);
  return {columns, values: layers[ground.layers.indexOf(material)]};
};
/** The share of a material along the row through y = 80, sample by sample. */
function row(ground, material) {
  const {columns, values} = weights(ground, material);
  return Array.from({length: columns}, (_, column) => values[Math.round(80 / ground.cell) * columns + column] / 255);
}

test('a shape has a crisp edge unless it asks for a soft one', () => {
  const stream = {material: 'shallow-water', line: [[200, -10], [200, 170]], width: 80};
  const crisp = row(shapeGround(size, {base: 'meadow', shapes: [stream]}), 'shallow-water');
  const soft = row(shapeGround(size, {base: 'meadow', shapes: [{...stream, soft: 40}]}), 'shallow-water');
  const blended = values => values.filter(value => value > 0.02 && value < 0.98).length;
  assert.ok(blended(crisp) <= 2, 'one sample on each bank');
  assert.ok(blended(soft) >= 8, 'a soft bank fades over several samples');
  assert.equal(soft[25], 1, 'the middle of the stream is water');
});

test('wobble moves a natural outline away from the drawn one', () => {
  const forest = {material: 'forest-floor', rect: [-10, -10, 410, 80]};
  const straight = shapeGround(size, {base: 'meadow', shapes: [forest]}), wobbly = shapeGround(size, {base: 'meadow', shapes: [{...forest, wobble: 30}]});
  const edge = ground => {
    const {columns, values} = weights(ground, 'forest-floor');
    return Array.from({length: columns}, (_, column) => {
      let y = 0;
      while (values[(y + 1) * columns + column] >= 128) y++;
      return y;
    });
  };
  assert.equal(new Set(edge(straight)).size, 1);
  assert.ok(new Set(edge(wobbly)).size > 3);
});
