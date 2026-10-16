#!/usr/bin/env node
/**
 * Give a checkout its LFS art without spending disk on it.
 *
 * Worktrees hold Git LFS pointers for art/source and art/proofs. `git lfs checkout` would write an 11 GB
 * copy of every painting into the worktree. This script instead clones each pointer's object out of the
 * shared LFS cache (.git/lfs/objects) with a copy-on-write file clone (`cp -c` on APFS, `cp --reflink` on
 * Linux), so the checkout holds real images while the blocks stay shared with the cache. `du` reports the
 * full size; `df` does not move.
 *
 *   npm run art              clone every pointer whose object is in the local cache
 *   npm run art -- --check   report pointers and missing objects without changing anything
 *
 * Files that already hold content are left alone; `git lfs dedup` turns an older full copy into clones.
 * Objects missing from the cache are listed with the `git lfs fetch` command that brings them in. The
 * script exits non-zero when anything is still a pointer afterwards, so `npm run verify` fails before the
 * art tests would.
 */
import {spawnSync} from 'node:child_process';
import {existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

/** Parse `git lfs ls-files -l` output: one `<oid> <*|-> <path>` line per tracked file, `-` for a pointer. */
export function parseList(text) {
  const entries = [];
  for (const line of text.split('\n')) {
    const match = /^([0-9a-f]{64}) ([*-]) (.+)$/.exec(line);
    if (match) entries.push({oid: match[1], pointer: match[2] === '-', path: match[3]});
  }
  return entries;
}

export const objectPath = (cache, oid) => join(cache, oid.slice(0, 2), oid.slice(2, 4), oid);

/** Split pointers into those the cache can supply and those it cannot. */
export function plan(entries, cache, base = root) {
  const clones = [], missing = [];
  for (const entry of entries) {
    if (!entry.pointer) continue;
    // LFS also marks edited paintings with "-". Only replace actual pointer text,
    // never a new painting (or an intentionally deleted file).
    const file = resolve(base, entry.path);
    if (!existsSync(file) || statSync(file).size > 1024 ||
      !/^version https:\/\/git-lfs\.github\.com\/spec\/v1\r?\n/.test(readFileSync(file, 'utf8'))) continue;
    (existsSync(objectPath(cache, entry.oid)) ? clones : missing).push(entry);
  }
  return {clones, missing};
}

function cloneCommand(sources, target) {
  return process.platform === 'darwin' ? ['cp', ['-c', ...sources, target]] : ['cp', ['--reflink=auto', ...sources, target]];
}

/**
 * Replace each pointer with a clone of its cached object. Objects are cloned into their target directory
 * under the oid name, one `cp` per directory, then renamed over the pointers. A second path with the same
 * oid is cloned from the first, which keeps the blocks shared as well.
 */
export function cloneFiles(clones, {cache, root: base}) {
  const byDirectory = new Map();
  for (const entry of clones) {
    const directory = dirname(entry.path);
    if (!byDirectory.has(directory)) byDirectory.set(directory, []);
    byDirectory.get(directory).push(entry);
  }
  let count = 0;
  for (const [directory, entries] of byDirectory) {
    const target = resolve(base, directory);
    mkdirSync(target, {recursive: true});
    const unique = [...new Set(entries.map(entry => entry.oid))];
    for (let start = 0; start < unique.length; start += 500) {
      const batch = unique.slice(start, start + 500);
      const [command, args] = cloneCommand(batch.map(oid => objectPath(cache, oid)), target);
      const result = spawnSync(command, args, {encoding: 'utf8'});
      if (result.status !== 0) {
        for (const oid of batch) rmSync(join(target, oid), {force: true});
        throw new Error(`cloning into ${directory} failed: ${(result.stderr || result.error?.message || '').trim()}`);
      }
    }
    const placed = new Map();
    for (const entry of entries) {
      const file = resolve(base, entry.path);
      if (placed.has(entry.oid)) {
        const [command, args] = cloneCommand([placed.get(entry.oid)], file);
        const result = spawnSync(command, args, {encoding: 'utf8'});
        if (result.status !== 0) throw new Error(`cloning ${entry.path} failed: ${(result.stderr || '').trim()}`);
      } else {
        renameSync(join(target, entry.oid), file);
        placed.set(entry.oid, file);
      }
      count++;
    }
  }
  return count;
}

function git(args, input) {
  const result = spawnSync('git', args, {cwd: root, encoding: 'utf8', input, maxBuffer: 64 * 1024 * 1024});
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${(result.stderr || '').trim()}`);
  return result.stdout;
}

/**
 * Make git see the clones as unmodified. The index remembers each pointer's size, and git reports a file
 * whose size differs as modified without reading it. Re-adding the same index entries without stat data
 * makes the refresh compare content through the LFS clean filter, which hashes the clones once (about half a
 * minute for the whole tree) and records their stat data.
 */
export function refreshIndex(paths) {
  const cloned = new Set(paths);
  const entries = git(['ls-files', '-s', '-z']).split('\0').filter(line => cloned.has(line.slice(line.indexOf('\t') + 1)));
  if (!entries.length) return;
  git(['update-index', '-z', '--index-info'], entries.join('\0') + '\0');
  git(['update-index', '-q', '--refresh']);
}

/** The LFS object store this checkout shares with every other worktree of the repository. */
export function lfsCache() {
  const configured = spawnSync('git', ['config', '--get', 'lfs.storage'], {cwd: root, encoding: 'utf8'});
  if (configured.status === 0 && configured.stdout.trim()) return join(resolve(root, configured.stdout.trim()), 'objects');
  return join(resolve(root, git(['rev-parse', '--git-common-dir']).trim()), 'lfs', 'objects');
}

export function main(argv = process.argv.slice(2)) {
  const check = argv.includes('--check');
  const cache = lfsCache();
  const entries = parseList(git(['lfs', 'ls-files', '-l']));
  const {clones, missing} = plan(entries, cache);
  const content = entries.length - clones.length - missing.length;
  if (!clones.length && !missing.length) {
    console.log(`Art: all ${entries.length} LFS files hold content.`);
    return 0;
  }
  if (check) {
    console.log(`Art: ${content} with content, ${clones.length} pointers the cache can supply, ${missing.length} missing from the cache.`);
  } else if (clones.length) {
    const cloned = cloneFiles(clones, {cache, root});
    refreshIndex(clones.map(entry => entry.path));
    console.log(`Art: cloned ${cloned} files from the LFS cache without copying their blocks.`);
  }
  if (missing.length) {
    const sample = missing.slice(0, 5).map(entry => `  ${entry.path}`).join('\n');
    console.error(`Art: ${missing.length} pointer(s) have no object in ${cache}:\n${sample}${missing.length > 5 ? '\n  …' : ''}\n` +
      'Fetch them once into the shared cache, then rerun:\n  git lfs fetch origin HEAD\n  npm run art');
    return 1;
  }
  return check ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main());
