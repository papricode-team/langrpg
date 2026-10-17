/**
 * content/source.json keeps a copy of the generated server manifests under legacyServer; build-content.mjs reads
 * the server's grading curriculum from that copy. Builders that regenerate a manifest call this so the copy never
 * drifts from server/<file>.json.
 */
import { readFileSync, writeFileSync, renameSync } from 'node:fs';

const path = new URL('../content/source.json', import.meta.url);

export function syncLegacyServer(kind, manifest) {
  const source = JSON.parse(readFileSync(path, 'utf8'));
  const value = JSON.parse(JSON.stringify(manifest));
  if (JSON.stringify(source.legacyServer?.[kind]) === JSON.stringify(value)) return false;
  source.legacyServer = {...source.legacyServer, [kind]: value};
  const temporary = new URL('../content/source.json.tmp', import.meta.url);
  writeFileSync(temporary, JSON.stringify(source) + '\n');
  renameSync(temporary, path);
  return true;
}
