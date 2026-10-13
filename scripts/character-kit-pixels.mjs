/** Shared whole-frame registration and visible-pixel comparison for the component kit.
 * No garment, hair, hue heuristic or per-limb processing belongs here. */
const WIDTH = 128, HEIGHT = 192;

export function assertDimensions(image, expected, name = 'Image') {
  if(image.info.width!==expected.width || image.info.height!==expected.height)
    throw new Error(`${name}: expected ${expected.width}×${expected.height}, received ${image.info.width}×${image.info.height}; the registration grid cannot be resized.`);
}

export function canonical(image, frame, [width, height] = [WIDTH, HEIGHT]) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width / WIDTH !== height / HEIGHT) throw new Error('Canonical cells must preserve the registered aspect ratio');
  const density = width / WIDTH;
  const { data, info } = image, { scale, offset, sourceCell } = frame.transform, out = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const sx = (x / density - offset.x) / scale, sy = (y / density - offset.y) / scale, x0 = Math.floor(sx), y0 = Math.floor(sy);
    let alpha = 0; const rgb = [0, 0, 0];
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const nx = x0 + dx, ny = y0 + dy;
      if (nx < 0 || ny < 0 || nx >= sourceCell.width || ny >= sourceCell.height) continue;
      const p = ((sourceCell.top + ny) * info.width + sourceCell.left + nx) * 4;
      const weight = (dx ? sx - x0 : 1 - sx + x0) * (dy ? sy - y0 : 1 - sy + y0), contribution = data[p + 3] * weight;
      alpha += contribution;
      for (let c = 0; c < 3; c++) rgb[c] += data[p + c] * contribution;
    }
    const p = (y * width + x) * 4, a = Math.round(alpha);
    if (!a) continue;
    for (let c = 0; c < 3; c++) out[p + c] = Math.round(rgb[c] / alpha);
    out[p + 3] = a;
  }
  return out;
}

export function visibleDelta(base,edit,p) {
  return Math.max(Math.abs(base[p+3]-edit[p+3]),...Array.from({length:3},(_,c)=>Math.abs(base[p+c]*base[p+3]/255-edit[p+c]*edit[p+3]/255)));
}
