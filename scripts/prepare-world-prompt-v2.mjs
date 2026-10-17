// Deliberately narrow exporter: no content pipeline, shared art hydration or servers.
import sharp from 'sharp';
import { stat } from 'node:fs/promises';

for (const part of ['keycap', 'tab', 'touch']) {
  const source = `art/ui/world-prompt-v2-${part}.png`;
  const target = `web/public/assets/ui/world-prompt-v2-${part}.webp`;
  const metadata = await sharp(source).metadata();
  if (!metadata.hasAlpha) throw new Error(`${source}: missing generated alpha`);
  const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let clear = 0, solid = 0;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] === 0) clear++;
    if (data[i] === 255) solid++;
  }
  if (!clear || !solid) throw new Error(`${source}: invalid transparency`);
  await sharp(source).trim({ threshold: 5 }).resize(part === 'tab' ? 144 : 48, 48, { fit: 'fill', kernel: 'lanczos3' })
    .webp({ quality: 92, alphaQuality: 100 }).toFile(target);
  const bytes = (await stat(target)).size;
  if (bytes >= 2_000_000) throw new Error(`${target}: over budget`);
  console.log(`${target}: ${part === 'tab' ? 144 : 48}×48, ${bytes} bytes; master ${info.width}×${info.height}, ${clear} transparent / ${solid} opaque pixels`);
}
