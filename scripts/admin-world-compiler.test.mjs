import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const sourceText = await readFile(new URL('../web/src/data/world-scenes.json', import.meta.url), 'utf8');

function compile(input, args = ['--root', root]) {
  return new Promise((accept, reject) => {
    const child = spawn(process.execPath, ['scripts/admin-world-compiler.mjs', ...args], {cwd: root, stdio: ['pipe', 'pipe', 'pipe']});
    let stdout = '', stderr = '';
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => {stdout += chunk;});
    child.stderr.on('data', chunk => {stderr += chunk;});
    child.on('error', reject);
    child.stdin.on('error', error => {if (error.code !== 'EPIPE') reject(error);});
    child.on('close', code => accept({code, stdout, stderr}));
    child.stdin.end(input);
  });
}

test('publication bridge rejects malformed JSON, oversized documents and unknown arguments', async () => {
  for (const [input, args, expected] of [
    ['{', undefined, /not valid JSON/],
    [' '.repeat(2 * 1024 * 1024 + 1), undefined, /2 MiB/],
    [sourceText, ['--write'], /Usage:/],
  ]) {
    const result = await compile(input, args);
    assert.equal(result.code, 1);
    assert.equal(result.stdout, '');
    const failure = JSON.parse(result.stderr);
    assert.match(failure.error, expected);
    assert.ok(failure.problems.length);
  }
});
