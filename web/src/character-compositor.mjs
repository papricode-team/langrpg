/** RGBA composition shared by browser baking and offline Sharp IO. */

/** Material masks are disjoint before filtering, so add their premultiplied
 * contributions. Source-over between materials would punch holes at seams. */
export function combineMaterials(materials, luminanceReference = 255) {
  if (!materials.length) throw new Error('A component needs material pixels');
  const length = materials[0].data.length;
  if (length % 4 || materials.some(layer => layer.data.length !== length)) throw new Error('Material dimensions must match');
  const out = new Uint8ClampedArray(length);
  for (let p = 0; p < length; p += 4) {
    let alpha = 0; const premultiplied = [0, 0, 0];
    for (const { data, tint = 0xffffff, material } of materials) {
      const a = data[p + 3]; alpha += a;
      const reference = material === 'detail' ? 255 : luminanceReference;
      for (let channel = 0; channel < 3; channel++) {
        const color = (tint >> ((2 - channel) * 8)) & 255;
        premultiplied[channel] += Math.min(255, data[p + channel] * color / reference) * a;
      }
    }
    if (!alpha) continue;
    for (let channel = 0; channel < 3; channel++) out[p + channel] = Math.round(premultiplied[channel] / alpha);
    out[p + 3] = Math.min(255, alpha);
  }
  return out;
}

/** Remove white source matte connected to transparent space. Only untinted
 * detail paint is eligible; white fabric and enclosed buttons are preserved. */
export function clearWhiteMatte(pixels, detail, width, height, body = false) {
  if (pixels.length !== width * height * 4 || detail.length !== pixels.length) throw new Error('Matte dimensions must match');
  let enclosedBelow = height;
  if (body) {
    // Find the head in each pose, including seated poses where it sits lower.
    head: for (let y = 0; y < height; y++) for (let x = Math.floor(width * .45); x < Math.ceil(width * .55); x++) {
      if (pixels[(y * width + x) * 4 + 3] > 128) {
        enclosedBelow = y + Math.ceil(height * .18); break head;
      }
    }
  }
  const count = width * height, candidates = new Uint8Array(count);
  let candidateCount = 0;
  for (let i = 0; i < count; i++) {
    const p = i * 4;
    if (!detail[p + 3] || !pixels[p + 3]) continue;
    const min = Math.min(detail[p], detail[p + 1], detail[p + 2]);
    const max = Math.max(detail[p], detail[p + 1], detail[p + 2]);
    if (min < 224 || max - min > 16) continue;
    candidates[i] = 1; candidateCount++;
  }
  if (!candidateCount) return pixels;
  const queue = new Int32Array(candidateCount);
  let tail = 0;
  for (let i = 0; i < count; i++) {
    if (!candidates[i]) continue;
    const x = i % width, y = Math.floor(i / width);
    if (y >= enclosedBelow || x === 0 || y === 0 || x === width - 1 || y === height - 1 ||
      pixels[(i - 1) * 4 + 3] <= 8 || pixels[(i + 1) * 4 + 3] <= 8 ||
      pixels[(i - width) * 4 + 3] <= 8 || pixels[(i + width) * 4 + 3] <= 8) {
      candidates[i] = 2; queue[tail++] = i;
    }
  }
  for (let head = 0; head < tail; head++) {
    const i = queue[head], x = i % width, y = Math.floor(i / width);
    for (const next of [x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1, y > 0 ? i - width : -1, y < height - 1 ? i + width : -1]) {
      if (next < 0 || candidates[next] !== 1) continue;
      candidates[next] = 2; queue[tail++] = next;
    }
  }
  for (let i = 0; i < tail; i++) {
    const p = queue[i] * 4, alpha = pixels[p + 3], remaining = Math.max(0, alpha - detail[p + 3]);
    // Antialiasing mixes detail and fabric at a seam. Remove only the white
    // contribution, retaining the fabric's coverage and unpremultiplied colour.
    for (let c = 0; c < 3; c++) pixels[p + c] = remaining ? Math.max(0, Math.min(255, Math.round((pixels[p + c] * alpha - detail[p + c] * detail[p + 3]) / remaining))) : 0;
    pixels[p + 3] = remaining;
  }
  return pixels;
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
export function composeFrame(layers, images, frame, cellWidth, cellHeight, columns = 9, sourceMatte = 'remove') {
  if (!Number.isInteger(frame) || frame < 0 || frame >= 36) throw new Error('Frame must be in 0..35');
  const output = new Uint8ClampedArray(cellWidth * cellHeight * 4);
  for (const layer of layers) {
    const materials = [];
    for (const material of layer.materials) {
      const image = images.get(`${layer.id}.${material}.${frame}`) ?? images.get(`${layer.id}.${material}`);
      const pageColumns=image?.columns??columns, count=image?.frameCount??36, localFrame=frame-(image?.firstFrame??0);
      if (!image || !Number.isInteger(pageColumns)||pageColumns<1||localFrame<0||localFrame>=count||image.width !== cellWidth * pageColumns || image.height !== cellHeight * Math.ceil(count/pageColumns) || image.data.length !== image.width * image.height * 4) throw new Error(`Missing or malformed ${layer.id}.${material} sheet`);
      const data = new Uint8ClampedArray(output.length), left = localFrame % pageColumns * cellWidth, top = Math.floor(localFrame / pageColumns) * cellHeight;
      for (let y = 0; y < cellHeight; y++) {
        const from = ((top + y) * image.width + left) * 4;
        data.set(image.data.subarray(from, from + cellWidth * 4), y * cellWidth * 4);
      }
      materials.push({ data, tint: layer.tints[material], material });
    }
    const pixels = combineMaterials(materials, cellWidth >= 64 && layer.slot && !['body', 'face', 'markings', 'facial-hair', 'hair'].includes(layer.slot) ? 180 : 255);
    const detail = materials.find(material => material.material === 'detail' && material.tint === 0xffffff);
    // Bare body gaps can be enclosed by an arm or fingers. Keep the face region
    // protected so the whites of the eyes remain part of the artwork.
    if (detail && layer.slot && sourceMatte !== 'preserve') clearWhiteMatte(pixels, detail.data, cellWidth, cellHeight, layer.slot === 'body');
    over(output, pixels);
  }
  // Small synthetic sheets and detail-only tooling previews retain raw pixels.
  // Paint only complete registered characters, after all material seams close.
  return cellWidth >= 64 && cellHeight >= 96 && layers.some(layer => layer.slot === 'body')
    ? paintedFinish(output, cellWidth, cellHeight) : output;
}

/** Frame-local, resolution-independent paint; never changes alpha or geometry.
 * No frame/time seed: standing, walking, actions and portraits share one finish. */
function paintedFinish(pixels, width, height) {
  const source = pixels.slice(), scale = width / 384;
  const grain = (x, y) => {
    let value = Math.imul(x + 17, 374761393) ^ Math.imul(y + 31, 668265263);
    value = Math.imul(value ^ value >>> 13, 1274126177);
    return ((value ^ value >>> 16) >>> 0) / 4294967295 - .5;
  };
  const step = Math.max(1, Math.round(scale * 2));
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const p = (y * width + x) * 4;
    if (!source[p + 3]) continue;
    const light = .5 - (x / width * .6 + y / height * .4);
    const brush = grain(Math.floor((x + y * .35) / (scale * 7)), Math.floor(y / (scale * 3))) * 8;
    const tooth = grain(Math.floor(x / scale), Math.floor(y / scale)) * 2;
    let edge = 0, contour = 0;
    for (const [dx, dy] of [[-step, -step], [step, step]]) {
      const xx = x + dx, yy = y + dy;
      const q = (yy * width + xx) * 4;
      const alpha = xx < 0 || yy < 0 || xx >= width || yy >= height ? 0 : source[q + 3];
      const exposed = Math.max(0, (source[p + 3] - alpha) / 255);
      edge += exposed * (dx < 0 ? 5 : -12);
      if (alpha > 200) contour += Math.max(0, (source[q] + source[q + 1] + source[q + 2] - source[p] - source[p + 1] - source[p + 2]) / 3 - 16) * .035;
    }
    const luma = source[p] * .2126 + source[p + 1] * .7152 + source[p + 2] * .0722;
    for (let c = 0; c < 3; c++) {
      // Lift the neutral-key underpainting so cream reads as linen, not grey.
      const pigment = luma + (source[p + c] - luma) * 1.16;
      const lift = Math.sin(Math.max(0, Math.min(255, pigment)) / 255 * Math.PI) * 13;
      const warmth = [3.5, 1, -2.5][c] * (.5 + luma / 255);
      pixels[p + c] = pigment + lift + warmth + light * 6 + brush + tooth + edge - contour;
    }
  }
  return pixels;
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
