import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const origin = process.env.SITE_UI_URL || 'http://127.0.0.1:8098';
const output = 'output/ui-screenshots/landing';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ ...(process.env.ATLAS_CHROMIUM_PATH ? { executablePath: process.env.ATLAS_CHROMIUM_PATH } : {}) });
const report = [];
try {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }, { width: 320, height: 740 }]) {
    const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = [], failed = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.status() >= 400) failed.push(`${response.status()} ${response.url()}`); });
    await page.goto(`${origin}/?utm_source=website-check`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    // Force below-the-fold lazy images to load before checking their pixels.
    await page.locator('img').evaluateAll(async images => {
      await Promise.all(images.map(image => { image.loading = 'eager'; return image.decode().catch(() => {}); }));
    });
    const layout = await page.evaluate(() => ({
      width: innerWidth, content: document.documentElement.scrollWidth,
      brokenImages: [...document.images].filter(image => !image.complete || image.naturalWidth === 0).map(image => image.src),
      gameLoaded: performance.getEntriesByType('resource').some(entry => /\/assets\/.*\.js/.test(entry.name)),
    }));
    assert.ok(layout.content <= layout.width, `${viewport.width}: horizontal overflow ${layout.content}`);
    assert.deepEqual(layout.brokenImages, []);
    assert.equal(layout.gameLoaded, false);
    await page.screenshot({ path: `${output}/home-${viewport.width}.png`, fullPage: true });
    await page.locator('[data-answer="station"]').click();
    await page.getByRole('status').filter({ hasText: 'where the station is' }).waitFor();
    await page.locator('[data-answer="coffee"]').click();
    await page.getByText('Gern! Mit Milch?', { exact: true }).waitFor();
    await page.locator('.translation summary').click();
    await page.getByText('Of course! With milk?', { exact: true }).waitFor();
    await page.locator('[data-answer="station"]').click();
    await page.locator('.demo-finish').waitFor({ state: 'visible' });
    assert.match(await page.locator('.demo-finish a').getAttribute('href'), /utm_source=website-check/);
    await page.locator('.reset-demo').click();
    await page.getByText('Guten Morgen! Was möchten Sie?', { exact: true }).waitFor();
    await page.locator('.faq-list summary').filter({ hasText: 'Can I play if I know no German?' }).click();
    assert.equal(await page.locator('.faq-list details').nth(1).getAttribute('open'), '');
    if (viewport.width < 800) {
      await page.locator('.mobile-menu summary').click();
      await page.getByRole('navigation', { name: 'Mobile navigation' }).getByText('Field notes').click();
    } else await page.getByRole('navigation', { name: 'Main navigation' }).getByText('Field notes').click();
    await page.waitForURL('**/learn-german/');
    await page.getByRole('heading', { name: 'Making friends with der, die, das' }).click();
    await page.waitForURL('**/learn-german/der-die-das/');
    assert.match(await page.locator('.site-header a[data-play]').getAttribute('href'), /utm_source=website-check/);
    const articleOverflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    assert.equal(articleOverflow, false);
    await page.screenshot({ path: `${output}/article-${viewport.width}.png`, fullPage: true });
    assert.deepEqual(errors, []); assert.deepEqual(failed, []);
    report.push({ viewport, overflow: false, brokenImages: 0, runtimeErrors: 0, demo: 'passed', mobileNavigation: 'passed', attribution: 'passed' });
    await context.close();
  }
  const noJS = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  const page = await noJS.newPage();
  await page.goto(origin);
  assert.match(await page.locator('h1').textContent(), /In German/);
  assert.equal(await page.getByRole('link', { name: 'Begin your adventure' }).first().getAttribute('href'), '/game/');
  await page.goto(`${origin}/learn-german/german-word-order/`);
  assert.ok((await page.locator('article').textContent()).includes('Heute trinke ich Tee'));
  await noJS.close();
  report.push({ noJavaScript: 'Public content, navigation and exercises available' });
} finally {
  await browser.close();
}
await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
