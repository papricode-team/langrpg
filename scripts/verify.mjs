#!/usr/bin/env node
/**
 * Run every project check locally, in sequence, and print a summary.
 *
 *   npm run verify                 Go, frontend, tooling, generated content, build and budgets
 *   npm run verify -- --ui         also start the API and Vite and run the UI font/screenshot check
 *   npm run verify -- --docker     also build the runtime image (needs a running Docker daemon)
 *   npm run verify -- --no-go      skip the Go checks
 *   npm run verify -- --no-web     skip the frontend and tooling checks
 *
 * Go integration tests use TEST_DATABASE_URL when it is set. Otherwise, if PostgreSQL's initdb and
 * pg_ctl are installed (for example `brew install postgresql@18`), a disposable cluster is started in a
 * temporary directory and removed afterwards. Without either, the PostgreSQL tests skip and the summary
 * says so.
 *
 * The content bundle and asset regeneration run first, because Go embeds and the tests read the files they
 * write. Everything else then runs concurrently. Each step's output goes to output/verify-logs/<step>.log and
 * is printed in full only when the step fails. The whole Go suite runs without the race detector, which makes
 * it ten times slower; tests matching raceTests run a second time under -race.
 */
import {spawn, spawnSync} from 'node:child_process';
import {existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {createServer} from 'node:net';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const args = new Set(process.argv.slice(2));
const want = {go: !args.has('--no-go'), web: !args.has('--no-web'), ui: args.has('--ui'), docker: args.has('--docker')};
const results = [];
const cleanups = [];

// Generated files that must match what the asset pipeline writes.
const generated = ['server/curriculum.json', 'server/course.json', 'server/story_rules.json', 'server/expeditions.json',
  'server/activity_boards.json', 'web/src/data/course.json', 'web/src/data/course-meta.json',
  'web/src/data/course-exercises-a1.json', 'web/src/data/course-exercises-a2.json', 'web/src/data/course-exercises-b1.json',
  'docs/audits/dialogue-levels.json', 'web/src/data/syllabus.json', 'server/syllabus.json', 'docs/audits/pacing.json'];

// Tests that start goroutines, take locks or hold sockets. They run again under the race detector.
const raceTests = 'Concurrent|OutsideTheAccountLock|Postgres|Socket|Presence|Atomic|TrialUsesServerTime|PendingOldCourse';
const logs = join(root, 'output', 'verify-logs');
const started = Date.now();

function run(name, command, commandArgs, options = {}) {
  console.log(`▶ ${name}: ${[command, ...commandArgs].join(' ')}`);
  const begun = Date.now();
  return new Promise(resolve => {
    const child = spawn(command, commandArgs, {cwd: options.cwd ?? root, stdio: ['ignore', 'pipe', 'pipe'], env: {...process.env, ...options.env}});
    const chunks = [];
    child.stdout.on('data', chunk => chunks.push(chunk));
    child.stderr.on('data', chunk => chunks.push(chunk));
    const finish = status => {
      const ok = status === 0, seconds = Math.round((Date.now() - begun) / 1000), output = Buffer.concat(chunks).toString();
      const log = join(logs, `${name.replace(/[^a-z0-9]+/gi, '-')}.log`);
      writeFileSync(log, output);
      results.push({name, ok, seconds, note: options.note});
      console.log(`${ok ? '✔' : '✖'} ${name} (${seconds} s)`);
      if (!ok) console.log(`${output.trimEnd()}\n✖ end of ${name}, log in ${log}\n`);
      resolve(ok);
    };
    child.on('error', error => { chunks.push(Buffer.from(String(error))); finish(1); });
    child.on('close', finish);
  });
}

function note(name, ok, text) { results.push({name, ok, seconds: 0, note: text}); }

const has = command => spawnSync('sh', ['-c', `command -v ${command}`], {stdio: 'ignore'}).status === 0;

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => { const {port} = server.address(); server.close(() => resolve(port)); });
  });
}

function postgresBin() {
  for (const directory of ['/opt/homebrew/opt/postgresql@18/bin', '/usr/local/opt/postgresql@18/bin', '/usr/lib/postgresql/18/bin']) {
    if (existsSync(join(directory, 'initdb'))) return directory;
  }
  return has('initdb') && has('pg_ctl') ? '' : undefined;
}

async function disposablePostgres() {
  if (process.env.TEST_DATABASE_URL) return {url: process.env.TEST_DATABASE_URL, label: 'TEST_DATABASE_URL'};
  const bin = postgresBin();
  if (bin === undefined) return undefined;
  const tool = name => bin ? join(bin, name) : name;
  const directory = mkdtempSync(join(tmpdir(), 'glotworld-pg-'));
  const data = join(directory, 'data'), port = await freePort();
  const env = {...process.env, LC_ALL: 'C', LANG: 'C'};
  const init = spawnSync(tool('initdb'), ['-D', data, '-U', 'postgres', '--auth=trust', '-E', 'UTF8', '--locale=C'], {env, stdio: 'ignore'});
  if (init.status !== 0) { rmSync(directory, {recursive: true, force: true}); return undefined; }
  const start = spawnSync(tool('pg_ctl'), ['-D', data, '-l', join(directory, 'server.log'), '-w', '-o',
    `-p ${port} -c listen_addresses=127.0.0.1 -c unix_socket_directories=''`, 'start'], {env, stdio: 'ignore'});
  if (start.status !== 0) { rmSync(directory, {recursive: true, force: true}); return undefined; }
  cleanups.push(() => {
    spawnSync(tool('pg_ctl'), ['-D', data, '-m', 'fast', 'stop'], {env, stdio: 'ignore'});
    rmSync(directory, {recursive: true, force: true});
  });
  const create = spawnSync(tool('createdb'), ['-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', 'glotworld_test'], {env, stdio: 'ignore'});
  if (create.status !== 0) return undefined;
  return {url: `postgres://postgres@127.0.0.1:${port}/glotworld_test?sslmode=disable`, label: `disposable cluster on port ${port}`};
}

async function waitFor(url, attempts, alive = () => true) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    try { if ((await fetch(url)).ok) return true; } catch { /* not listening yet */ }
    if (!alive()) return false;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  return false;
}

async function uiCheck() {
  const apiPort = await freePort(), webPort = await freePort();
  const directory = mkdtempSync(join(tmpdir(), 'glotworld-ui-'));
  const webOrigin = `http://127.0.0.1:${webPort}`;
  const children = [];
  cleanups.push(() => { for (const child of children) child.kill('SIGTERM'); rmSync(directory, {recursive: true, force: true}); });
  const api = spawn('go', ['run', '.'], {cwd: join(root, 'server'), stdio: 'ignore', env: {...process.env,
    PORT: String(apiPort), DATA_PATH: join(directory, 'state.json'), CONTENT_PATH: join(root, 'server/content.json'),
    ALLOWED_ORIGINS: webOrigin, DATABASE_URL: ''}});
  children.push(api);
  const web = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'web', '--host', '127.0.0.1', '--port', String(webPort), '--strictPort'],
    {cwd: root, stdio: 'ignore', env: {...process.env, ATLAS_API_ORIGIN: `http://127.0.0.1:${apiPort}`}});
  children.push(web);
  console.log(`\n▶ ui: API on ${apiPort}, Vite on ${webPort}`);
  if (!await waitFor(`http://127.0.0.1:${apiPort}/api/health`, 180, () => api.exitCode === null)) { note('ui', false, 'API did not become ready'); return; }
  if (!await waitFor(webOrigin, 60, () => web.exitCode === null)) { note('ui', false, 'Vite did not become ready'); return; }
  // Screenshots go to the ignored output/ directory so a local run never rewrites the tracked gallery.
  await run('ui', 'npm', ['run', 'ui:check'], {env: {ATLAS_UI_URL: webOrigin, ATLAS_UI_DIRECTORY: join(root, 'output/ui-screenshots')},
    note: 'screenshots in output/ui-screenshots'});
}

for (const [signal, code] of [['SIGINT', 130], ['SIGTERM', 143]]) {
  process.on(signal, () => { for (const cleanup of cleanups.splice(0)) cleanup(); process.exit(code); });
}

try {
  mkdirSync(logs, {recursive: true});
  await run('content bundle', process.execPath, ['scripts/build-content.mjs']);

  // Assets rewrite generated JSON that Go embeds and the tests read, so nothing else starts until they finish.
  const database = want.go ? disposablePostgres() : undefined;
  if (want.go) {
    const unformatted = spawnSync('gofmt', ['-l', '.'], {cwd: join(root, 'server'), encoding: 'utf8'});
    note('gofmt', unformatted.status === 0 && !unformatted.stdout.trim(), unformatted.stdout.trim() || undefined);
  }
  if (want.web) {
    await run('assets', 'npm', ['run', 'assets']);
    await run('generated content committed', 'git', ['diff', '--exit-code', '--stat', '--', ...generated]);
  }

  const lanes = [];
  if (want.go) {
    const db = await database;
    const env = db ? {TEST_DATABASE_URL: db.url} : {};
    const dbNote = db ? `PostgreSQL: ${db.label}` : 'PostgreSQL tests skipped: set TEST_DATABASE_URL or install PostgreSQL';
    const server = join(root, 'server');
    lanes.push((async () => {
      await run('go vet', 'go', ['vet', './...'], {cwd: server});
      await run('go test', 'go', ['test', '-count=1', '-timeout', '10m', './...'], {cwd: server, env, note: dbNote});
    })());
    lanes.push(run('go test -race', 'go', ['test', '-race', '-count=1', '-timeout', '10m', '-run', raceTests,
      '-skip', 'TestPostgresContentImportBootMigrationAndCourseRestart', './...'], {cwd: server, env, note: 'concurrency tests only'}));
  }
  if (want.web) {
    lanes.push(run('lint', 'npm', ['run', 'lint']));
    lanes.push(run('check', 'npm', ['run', 'check']));
    lanes.push(run('vitest', 'npm', ['test']));
    lanes.push(run('tooling tests', 'npm', ['run', 'test:tooling']));
    lanes.push(run('i18n', 'npm', ['run', 'i18n']));
    lanes.push(run('build', 'npm', ['run', 'build']).then(ok => ok ? run('budgets', 'npm', ['run', 'budgets']) : note('budgets', false, 'build failed')));
  }
  await Promise.all(lanes);

  if (want.ui) await uiCheck();
  if (want.docker) await run('docker build', 'docker', ['build', '--file', 'server/Dockerfile', '--tag', 'glotworld:verify', '.']);
} finally {
  for (const cleanup of cleanups.splice(0)) cleanup();
}

console.log(`\nSummary (${Math.round((Date.now() - started) / 1000)} s)`);
for (const {name, ok, seconds, note: text} of results) {
  console.log(`  ${ok ? '✔' : '✖'} ${name.padEnd(30)} ${String(seconds).padStart(4)} s${text ? `  ${text}` : ''}`);
}
const failed = results.filter(result => !result.ok);
mkdirSync(join(root, 'output'), {recursive: true});
writeFileSync(join(root, 'output', 'verify-summary.json'), JSON.stringify({at: new Date().toISOString(), results}, null, 2) + '\n');
if (failed.length) {
  console.log(`\n${failed.length} check(s) failed.`);
  process.exit(1);
}
console.log('\nAll checks passed.');
