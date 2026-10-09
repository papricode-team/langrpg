import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const grouped = process.platform !== 'win32';
const children = [
  spawn('go', ['run', '.'], { cwd: `${root}/server`, detached: grouped, stdio: 'inherit', env: { ...process.env, PORT: '8097', ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS || 'http://localhost:5187,http://127.0.0.1:5187,http://127.240.77.9:5187' } }),
  spawn('npm', ['run', 'dev', '--workspace', 'web'], { cwd: root, detached: grouped, stdio: 'inherit' }),
];
let closing = false;
function stop(code = 0) {
  if (closing) return;
  closing = true;
  for (const child of children) {
    try { if (grouped && child.pid) process.kill(-child.pid, 'SIGTERM'); else child.kill('SIGTERM'); }
    catch { /* A child may already have closed. */ }
  }
  setTimeout(() => process.exit(code), 150).unref();
}
for (const child of children) child.on('exit', code => { if (!closing) stop(code ?? 1); });
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
