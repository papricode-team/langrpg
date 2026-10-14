import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { resolveUiMedia } from './ui-layout.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const sourceRoot = path.join(root, 'web/src');
const baselinePath = path.join(root, 'scripts/ui-template-allowlist.json');

async function sourceFiles(directory, extension = '.ts') {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === 'test-support' ? [] : sourceFiles(full, extension);
    return entry.name.endsWith(extension) && !entry.name.endsWith('.test.ts') ? [full] : [];
  }))).flat().sort();
}

let stylesheetCount = 0;
for (const full of await sourceFiles(sourceRoot, '.css')) {
  const file = path.relative(root, full);
  const source = (await readFile(full, 'utf8')).replace(/\/\*[\s\S]*?\*\//g, '');
  resolveUiMedia(source); // Unknown named layout predicates are errors before browser QA.
  for (const declaration of source.matchAll(/(?:^|[;{}])\s*(font(?:-size)?|--type-(?:display|title|body|caption))\s*:\s*([^;}]+)/g)) {
    const pixels = [...declaration[2].matchAll(/(?<![\w.-])([\d.]+)px/g)];
    if (pixels.some(pixel => Number(pixel[1]) < 12)) {
      console.error(`${file}: ${declaration[1]} declares text below the 12px floor.`);
      process.exitCode = 1;
    }
  }
  for (const media of source.matchAll(/@media\b([^{}]+)\{/g)) {
    if (/\((?:min|max)-(?:width|height)\s*:\s*[\d.]+px\)/.test(media[1])) {
      console.error(`${file}: Layout media queries must use the shared aliases from scripts/ui-layout.mjs.`);
      process.exitCode = 1;
    }
  }
  stylesheetCount++;
}
if (!process.exitCode) console.log(`UI type and layout budget passed (${stylesheetCount} stylesheets).`);

function usages(source) {
  const pattern = /<small\b[^>]*>|<[^>]*\bclass\s*=\s*["'][^"']*\beyebrow\b[^"']*["'][^>]*>/g;
  return [...source.matchAll(pattern)].map(match => {
    const following = source.slice(match.index + match[0].length, match.index + match[0].length + 200).split('</')[0];
    const snippet = (match[0] + following).replace(/\s+/g, ' ').trim();
    return {
      fingerprint: createHash('sha256').update(snippet).digest('hex').slice(0, 16),
      kind: /^<small\b/.test(snippet) ? 'small' : 'eyebrow',
      line: source.slice(0, match.index).split('\n').length,
    };
  });
}

const current = {};
const locations = [];
for (const full of await sourceFiles(sourceRoot)) {
  const file = path.relative(root, full);
  for (const usage of usages(await readFile(full, 'utf8'))) {
    const key = `${file}:${usage.kind}:${usage.fingerprint}`;
    current[key] = (current[key] ?? 0) + 1;
    locations.push({ key, file, ...usage });
  }
}

if (process.argv.includes('--update-baseline')) {
  await writeFile(baselinePath, `${JSON.stringify({
    note: 'Existing decorative template usages only. New usages fail; removing an allowed usage needs no baseline update. Any baseline addition needs an explicit copy-budget justification in review.',
    usages: current,
  }, null, 2)}\n`);
  console.log(`Recorded ${locations.length} existing decorative usages.`);
} else {
  const allowed = JSON.parse(await readFile(baselinePath, 'utf8')).usages;
  const excess = Object.entries(current).filter(([key, count]) => count > (allowed[key] ?? 0));
  if (excess.length) {
    for (const [key] of excess) {
      const location = locations.find(usage => usage.key === key);
      console.error(`${location.file}:${location.line}: New ${location.kind} markup exceeds the UI content budget.`);
    }
    process.exitCode = 1;
  } else {
    console.log(`UI template budget passed (${locations.length} allowlisted legacy usages).`);
  }
}
