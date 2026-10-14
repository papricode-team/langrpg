// Browser smoke test using explicit synthetic dashboard fixtures; no production data.
// Start Vite, then run ADMIN_UI_URL=http://127.0.0.1:5191 node scripts/check-admin-analytics.mjs.
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
const base = process.env.ADMIN_UI_URL || 'http://127.0.0.1:5191';
const output = process.env.ADMIN_UI_OUTPUT || '/tmp/glotworld-admin-qa';
await mkdir(output, { recursive: true });
const empty = { visitors: 0, sessions: 0, newPlayers: 0, registrations: 0, activated: 0, activeLearners: 0, attempts: 0, correct: 0, completions: 0, paywallViewers: 0, checkoutUsers: 0, newCustomers: 0, errors: 0 };
function fixture(days, populated = true) {
  const daily = Array.from({ length: days }, (_, i) => ({ ...empty, date: new Date(Date.UTC(2026, 9, 15 - days + i)).toISOString().slice(0, 10), ...(populated ? { visitors: 17 + i * 3, activeLearners: 9 + i * 2, attempts: 80 + i * 10, newCustomers: i % 4 } : {}) }));
  const retention = [1, 7, 30].map((day, i) => ({ day, eligible: populated ? [97, 65, 0][i] : 0, returned: populated ? [42, 21, 0][i] : 0, rate: populated ? [43.3, 32.3, null][i] : null }));
  return { generatedAt: '2026-10-14T12:00:00Z', from: `${daily[0].date}T00:00:00Z`, to: '2026-10-14T12:00:00Z', previousFrom: '2026-08-16T00:00:00Z', days, retentionDays: 180, firstEventAt: populated ? '2026-09-18T12:00:00Z' : null, billingMode: 'sandbox',
    current: { ...empty, ...(populated ? { visitors: 1248, sessions: 1862, newPlayers: 384, registrations: 196, activated: 247, activeLearners: 318, attempts: 4826, correct: 3704, completions: 391, paywallViewers: 178, checkoutUsers: 62, newCustomers: 38, errors: 7 } : {}) }, previous: { ...empty, visitors: populated ? 942 : 0, newPlayers: populated ? 286 : 0, activeLearners: populated ? 243 : 0, newCustomers: populated ? 29 : 0 }, daily,
    sources: populated ? [{ label: 'newsletter', visitors: 453, players: 148, activated: 101, customers: 18 }, { label: 'google.com', visitors: 382, players: 109, activated: 72, customers: 10 }, { label: 'direct', visitors: 297, players: 92, activated: 53, customers: 7 }, { label: 'referral', visitors: 116, players: 35, activated: 21, customers: 3 }] : [], campaigns: populated ? [{ label: 'autumn-launch', visitors: 182, players: 73, activated: 42, customers: 9 }] : [], devices: populated ? [{ label: 'mobile', visitors: 745, players: 218, activated: 141, customers: 23 }] : [],
    funnel: ['Started an adventure', 'Answered an exercise', 'Opened checkout', 'Became a customer'].map((label, i) => ({ label, users: populated ? [384, 247, 62, 38][i] : 0, rate: populated ? [100, 64.3, 16.1, 9.9][i] : null })), retention,
    cohorts: populated ? [{ week: '2026-10-05', learners: 97, retention }, { week: '2026-09-28', learners: 65, retention }] : [],
    events: populated ? [{ name: 'learning_attempt', detail: 'recognition', count: 3201, users: 298, correct: 2501 }, { name: 'unit_completed', detail: '', count: 139, users: 65, correct: 0 }, { name: 'client_error', detail: 'network', count: 3, users: 3, correct: 0 }] : [],
    recent: populated ? [{ player: 'f37c3e29', event: 'First payment verified', at: '2026-10-14T11:43:00Z' }, { player: 'a65b3c19', event: 'First exercise', at: '2026-10-14T11:40:00Z' }] : [],
    customers: populated ? { registered: 718, everPaid: 142, monthly: 82, yearly: 27, lifetime: 19, stale: 8, expired: 6 } : { registered: 0, everPaid: 0, monthly: 0, yearly: 0, lifetime: 0, stale: 0, expired: 0 } };
}
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  let mode = 'populated', lastDays = 0, telemetry = 0;
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/analytics/events') telemetry++;
    if (url.pathname === '/api/account/login') return route.fulfill({ json: { token: 'fixture-admin-token', account: { admin: true } } });
    if (url.pathname === '/api/account/logout') return route.fulfill({ json: { loggedOut: true } });
    assert.equal(url.pathname, '/api/admin/analytics');
    assert.equal(route.request().headers().authorization, 'Bearer fixture-admin-token');
    if (mode === 'error') return route.fulfill({ status: 503, json: { error: 'Storage temporarily unavailable' } });
    if (mode === 'revoked') return route.fulfill({ status: 403, json: { error: 'Administrator access required' } });
    lastDays = Number(url.searchParams.get('days'));
    return route.fulfill({ json: fixture(lastDays, mode !== 'empty') });
  });
  await page.goto(`${base}/admin.html`);
  await page.getByRole('heading', { name: 'Admin sign in' }).waitFor();
  await page.getByLabel('Email', { exact: true }).fill('fixture@example.test');
  await page.getByLabel('Password', { exact: true }).fill('fixture password');
  await page.getByRole('button', { name: 'Open analytics' }).click();
  await page.getByRole('heading', { name: 'Know what makes learners stay.' }).waitFor();
  await page.screenshot({ path: `${output}/desktop.png`, fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.selectOption('#chart-metric', 'attempts');
  assert.match(await page.locator('svg').getAttribute('aria-label'), /attempts/);
  await page.selectOption('#acquisition-dimension', 'campaigns');
  assert.match(await page.locator('#acquisition-table').innerText(), /autumn-launch/);
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export CSV' }).click();
  const file = await download; await file.saveAs(`${output}/export.csv`);
  assert.match(await readFile(`${output}/export.csv`, 'utf8'), /"date_utc","visitors"/);
  await page.selectOption('#period', '7'); await page.waitForFunction(() => document.querySelector('#last-updated')?.textContent?.includes('7 days'));
  assert.equal(lastDays, 7);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${output}/mobile.png`, fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Mobile page overflows horizontally');
  const smallText = await page.locator('body *').evaluateAll(elements => elements.filter(element => [...element.childNodes].some(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim()) && getComputedStyle(element).display !== 'none' && parseFloat(getComputedStyle(element).fontSize) < 12).map(element => element.outerHTML.slice(0, 100)));
  assert.deepEqual(smallText, [], 'UI text must meet the 12px floor');
  mode = 'error'; await page.getByRole('button', { name: 'Refresh' }).click();
  await page.getByRole('alert').filter({ hasText: 'previous view' }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Export CSV' }).isDisabled(), true);
  mode = 'empty'; await page.getByRole('button', { name: 'Refresh' }).click();
  await page.getByText('No activity recorded yet.', { exact: false }).waitFor();
  await page.screenshot({ path: `${output}/empty.png`, fullPage: true });
  mode = 'revoked'; await page.getByRole('button', { name: 'Refresh' }).click();
  await page.getByRole('heading', { name: 'Admin sign in' }).waitFor();
  assert.equal(await page.locator('#dashboard').count(), 0);
  assert.equal(telemetry, 0); assert.deepEqual(errors, []);
  console.log(`Admin browser checks passed. Screenshots and CSV: ${output}`);
} finally { await browser.close(); }
