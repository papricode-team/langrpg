import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { gzipSync } from 'node:zlib';

// Keep large course bundles compressed without spending CPU on every request.
const compressible = new Set(['.js', '.css', '.json', '.svg']);
async function compress(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await compress(path);
    else if (compressible.has(extname(entry.name))) {
      const content = await readFile(path);
      if (content.length < 1024) continue;
      const compressed = gzipSync(content, { level: 9 });
      if (compressed.length < content.length) await writeFile(`${path}.gz`, compressed);
    }
  }
}
await compress(process.argv[2] || 'web/dist');
