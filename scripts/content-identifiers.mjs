import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';

/** Resolve source identifiers at build time. The private slug map never ships. */
export function identifierIndex(ids) {
  const index = new Map();
  for (const [key, value] of Object.entries(ids)) index.set(key, value);
  // A quest and its graph have distinct UUIDs. Bare quest names refer to quests;
  // fetched graphId and scoped node/choice IDs resolve the other references.
  for (const kind of ['quests', 'exercises', 'items', 'lexemes', 'units', 'grammar', 'narratives']) {
    for (const [key, value] of Object.entries(ids)) {
      if (!key.startsWith(`${kind}:`)) continue;
      const slug = key.slice(kind.length + 1);
      if (!index.has(slug)) index.set(slug, value);
    }
  }
  // Expedition maps retain their asset IDs; encounter progress uses content IDs.
  for (const [key, value] of Object.entries(ids)) if (key.startsWith('expeditions:') && key.includes('-encounter-')) index.set(key.slice('expeditions:'.length), value);
  return index;
}

export function rewriteContentIdentifiers(code, filename, ids) {
  const index = ids instanceof Map ? ids : identifierIndex(ids);
  if (/\.json(?:\?|$)/.test(filename)) {
    function rewrite(value) {
      if (typeof value === 'string') return index.get(value) ?? value;
      if (Array.isArray(value)) return value.map(rewrite);
      if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [index.get(key) ?? key, rewrite(child)]));
      return value;
    }
    return JSON.stringify(rewrite(JSON.parse(code)));
  }
  const source = ts.createSourceFile(filename, code, ts.ScriptTarget.Latest, true, /\.tsx$/.test(filename) ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const edits = [];
  function visit(node) {
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && index.has(node.text)) {
      // Module specifiers, URLs, German sentences and clip paths remain exact.
      edits.push({ start: node.getStart(source), end: node.end, value: JSON.stringify(index.get(node.text)) });
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  for (const { start, end, value } of edits.sort((a, b) => b.start - a.start)) code = code.slice(0, start) + value + code.slice(end);
  return code;
}

export function contentIdentifiersPlugin(root) {
  const index = identifierIndex(JSON.parse(readFileSync(resolve(root, 'content/content_ids.json'), 'utf8')));
  return {
    name: 'private-content-identifiers',
    enforce: 'pre',
    transform(code, id) {
      const filename = id.split('?')[0];
      if (process.env.VITEST) return null;
      if (!filename.startsWith(resolve(root, 'web/src') + '/') || !/\.(?:ts|tsx|json)$/.test(filename) || filename.endsWith('.test.ts')) return null;
      return { code: rewriteContentIdentifiers(code, filename, index), map: null };
    },
    generateBundle(_options, bundle) {
      const privateModule = /(?:\/content\/source\/|\/web\/src\/data\/(?:course(?:-.*)?|dialogue-graphs|story-text|expedition-learning(?:-.*)?)\.json$|\/web\/src\/data\/i18n\/tr-(?:story|course)\.json$|\/web\/src\/minigames\/(?:story-scripts|loop-data)\.json$|\/web\/src\/test-support\/)/;
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== 'chunk') continue;
        const leaked = Object.keys(chunk.modules).filter(id => privateModule.test(id));
        if (leaked.length) throw new Error(`Private learning content was imported into ${chunk.fileName}: ${leaked.join(', ')}`);
      }
    },
  };
}
