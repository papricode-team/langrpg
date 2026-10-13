/** RGBA composition shared by browser baking and offline Sharp IO. */

/** Material masks are disjoint before filtering, so add their premultiplied
 * contributions. Source-over between materials would punch holes at seams. */
export function combineMaterials(materials) {
  if (!materials.length) throw new Error('A component needs material pixels');
  const length = materials[0].data.length;
  if (length % 4 || materials.some(layer => layer.data.length !== length)) throw new Error('Material dimensions must match');
  const out = new Uint8ClampedArray(length);
  for (let p = 0; p < length; p += 4) {
    let alpha = 0; const premultiplied = [0, 0, 0];
    for (const { data, tint = 0xffffff } of materials) {
      const a = data[p + 3]; alpha += a;
      for (let channel = 0; channel < 3; channel++) {
        const color = (tint >> ((2 - channel) * 8)) & 255;
        premultiplied[channel] += data[p + channel] * color / 255 * a;
      }
    }
    if (!alpha) continue;
    for (let channel = 0; channel < 3; channel++) out[p + channel] = Math.round(premultiplied[channel] / alpha);
    out[p + 3] = Math.min(255, alpha);
  }
  return out;
}

export function over(target, source) {
  if (target.length !== source.length || target.length % 4) throw new Error('Layer dimensions must match');
  for (let p = 0; p < target.length; p += 4) {
    const sa = source[p + 3] / 255, ta = target[p + 3] / 255;
    if (!sa) continue;
    const a = sa + ta * (1 - sa);
    for (let channel = 0; channel < 3; channel++) target[p + channel] = Math.round((source[p + channel] * sa + target[p + channel] * ta * (1 - sa)) / a);
    target[p + 3] = Math.round(a * 255);
  }
  return target;
}

/** Loaded sheets and resolved components contain no canvas/Phaser/Sharp types. */
export function composeFrame(layers, images, frame, cellWidth, cellHeight, columns = 9) {
  if (!Number.isInteger(frame) || frame < 0 || frame >= 36) throw new Error('Frame must be in 0..35');
  const output = new Uint8ClampedArray(cellWidth * cellHeight * 4);
  for (const layer of layers) {
    const materials = [];
    for (const material of layer.materials) {
      const image = images.get(`${layer.id}.${material}`);
      if (!image || image.width !== cellWidth * columns || image.height !== cellHeight * 4 || image.data.length !== image.width * image.height * 4) throw new Error(`Missing or malformed ${layer.id}.${material} sheet`);
      const data = new Uint8ClampedArray(output.length), left = frame % columns * cellWidth, top = Math.floor(frame / columns) * cellHeight;
      for (let y = 0; y < cellHeight; y++) {
        const from = ((top + y) * image.width + left) * 4;
        data.set(image.data.subarray(from, from + cellWidth * 4), y * cellWidth * 4);
      }
      materials.push({ data, tint: layer.tints[material] });
    }
    over(output, combineMaterials(materials));
  }
  return output;
}

/** A single registered atlas; both browser and offline baking use this loop. */
export function composeAtlas(facings, images, cellWidth, cellHeight) {
  if (facings.length !== 4 || !Number.isInteger(cellWidth) || cellWidth < 1 || !Number.isInteger(cellHeight) || cellHeight < 1) throw new Error('Expected four facings and positive cell dimensions');
  const width = cellWidth * 9, height = cellHeight * 4;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let frame = 0; frame < 36; frame++) {
    const row = Math.floor(frame / 9), column = frame % 9;
    const cell = composeFrame(facings[row], images, frame, cellWidth, cellHeight);
    for (let y = 0; y < cellHeight; y++) data.set(cell.subarray(y * cellWidth * 4, (y + 1) * cellWidth * 4), ((row * cellHeight + y) * width + column * cellWidth) * 4);
  }
  return { data, width, height };
}
