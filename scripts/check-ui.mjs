import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const directory = path.join(root, 'docs/screenshots/ui');
const origin = process.env.ATLAS_UI_URL ?? 'http://127.0.0.1:5187';
const surfaces = (process.env.ATLAS_UI_SURFACES ?? 'home,options,encounter,journal,activity').split(',');
const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'phone', width: 390, height: 844 },
  { name: 'landscape', width: 844, height: 390 },
].filter(viewport => process.env.ATLAS_UI_VIEWPORT ? process.env.ATLAS_UI_VIEWPORT === viewport.name : viewport.name !== 'landscape');
if (!viewports.length || !surfaces.length) throw new Error('Choose a valid UI viewport and at least one surface.');
const report = [];
const failures = [];
const landscapeOnly = viewports.length === 1 && viewports[0].name === 'landscape';

await mkdir(directory, { recursive: true });
const browser = await chromium.launch({
  ...(process.env.ATLAS_CHROMIUM_PATH ? { executablePath: process.env.ATLAS_CHROMIUM_PATH } : {}),
});
try {
  for (const viewport of viewports) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 1,
      reducedMotion: 'reduce',
    });
    await context.addInitScript(() => {
      // The activity engine chooses its authored board from the run ID.
      let sequence = 0;
      Object.defineProperty(crypto, 'randomUUID', { value: () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}` });
    });
    for (const surface of surfaces) {
      const page = await context.newPage();
      const runtimeErrors = [];
      const attempts = [];
      page.on('pageerror', error => runtimeErrors.push(error.message));
      page.on('request', request => { if (/\/api\/attempt(?:\?|$)/.test(request.url())) attempts.push(request.url()); });
      await page.goto(`${origin}/?ui-check=${surface}`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector(`[data-ui-check-ready="${surface}"]`, { timeout: 60_000 });
      await page.evaluate(() => document.fonts.ready);
      const assetErrors = await page.evaluate(async () => {
        const images = [...document.images].filter(image => image.getClientRects().length);
        const errors = [];
        for (const image of images) {
          try { await image.decode(); } catch { errors.push(`Image failed: ${image.currentSrc || image.src}`); }
          if (!image.naturalWidth) errors.push(`Empty image: ${image.currentSrc || image.src}`);
        }
        const urls = new Set();
        for (const element of document.querySelectorAll('body *')) {
          if (!element.getClientRects().length || getComputedStyle(element).visibility !== 'visible') continue;
          for (const pseudo of [null, '::before', '::after']) {
            for (const match of getComputedStyle(element, pseudo).backgroundImage.matchAll(/url\(["']?([^"')]+)["']?\)/g)) urls.add(match[1]);
          }
        }
        await Promise.all([...urls].map(url => new Promise(resolve => {
          const image = new Image();
          const timeout = setTimeout(() => { errors.push(`Background timed out: ${url}`); resolve(); }, 15000);
          image.onload = () => { clearTimeout(timeout); if (!image.naturalWidth) errors.push(`Empty background: ${url}`); resolve(); };
          image.onerror = () => { clearTimeout(timeout); errors.push(`Background failed: ${url}`); resolve(); };
          image.src = url;
        })));
        return errors;
      });
      failures.push(...assetErrors.map(error => `${viewport.name}/${surface}: ${error}`));
      const measurement = await page.evaluate(() => {
        const belowFloor = [];
        let visibleText = 0;
        let minimumFont = Infinity;
        for (const element of document.querySelectorAll('body *')) {
          const style = getComputedStyle(element);
          if (style.display === 'none' || style.visibility !== 'visible' || Number(style.opacity) === 0 || element.closest('[hidden]')) continue;
          const rect = element.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) continue;
          const inputText = element instanceof HTMLInputElement && ['text', 'search', 'email', 'password', 'number', 'tel', 'url'].includes(element.type)
            ? element.value || element.placeholder : element instanceof HTMLTextAreaElement ? element.value || element.placeholder
              : element instanceof HTMLSelectElement ? [...element.selectedOptions].map(option => option.textContent).join(' ') : '';
          const text = inputText || [...element.childNodes].filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent).join('').trim();
          if (!text) continue;
          // Measure all rendered scroll content; geometry outside the viewport is intentional.
          let clipped = false;
          for (let parent = element.parentElement; parent; parent = parent.parentElement) {
            const parentStyle = getComputedStyle(parent);
            if (parentStyle.display === 'none' || parentStyle.visibility !== 'visible' || Number(parentStyle.opacity) === 0) { clipped = true; break; }
          }
          if (clipped) continue;
          visibleText++;
          const fontSize = Number.parseFloat(style.fontSize);
          minimumFont = Math.min(minimumFont, fontSize);
          if (fontSize < 12) belowFloor.push({
            tag: element.tagName.toLowerCase(), className: element.className?.baseVal ?? element.className,
            text: text.slice(0, 100), fontSize,
          });
        }
        return { visibleText, minimumFont, belowFloor };
      });
      if (!measurement.visibleText) failures.push(`${viewport.name}/${surface}: No visible text was measured.`);
      for (const issue of measurement.belowFloor) failures.push(`${viewport.name}/${surface}: ${issue.fontSize}px ${issue.tag}.${issue.className} "${issue.text}"`);
      const primarySelector = surface === 'home' ? '.journey-hero .primary-button' : surface === 'encounter' ? '.interior-primary' : surface === 'activity' ? '.activity-primary' : undefined;
      if (primarySelector) {
        const bounds = await page.locator(primarySelector).boundingBox();
        if (!bounds || bounds.y < 0 || bounds.y + bounds.height > viewport.height - (viewport.name === 'phone' && surface === 'home' ? 56 : 0)) failures.push(`${viewport.name}/${surface}: Primary action is below the fold.`);
        const clipped = await page.locator(primarySelector).evaluate(element => {
          const action = element.getBoundingClientRect();
          for (let parent = element.parentElement; parent; parent = parent.parentElement) {
            const style = getComputedStyle(parent);
            if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) {
              const frame = parent.getBoundingClientRect();
              if (action.top < frame.top - 1 || action.bottom > frame.bottom + 1) return true;
            }
          }
          return false;
        });
        if (clipped) failures.push(`${viewport.name}/${surface}: Primary action is clipped by its scroll container.`);
      }
      const horizontalOverflow = await page.evaluate(() => {
        const containers = [...document.querySelectorAll('#menu-layer[open], #menu-layer[open] .menu-content, #dialog[open], #dialog[open] .activity-content')];
        return containers.filter(element => element.clientWidth && element.scrollWidth > element.clientWidth + 1).map(element => `${element.id || element.className}: ${element.scrollWidth}px content in ${element.clientWidth}px`);
      });
      failures.push(...horizontalOverflow.map(error => `${viewport.name}/${surface}: Horizontal overflow ${error}`));
      const file = `${surface}-${viewport.name}.png`;
      await page.screenshot({ path: path.join(directory, file), animations: 'disabled', timeout: 60_000 });
      const flowErrors = await checkFlows(page, surface, viewport.name);
      failures.push(...flowErrors.map(error => `${viewport.name}/${surface}: ${error}`));
      if (surface === 'encounter' && attempts.length) failures.push(`${viewport.name}/${surface}: Scripted conversation submitted a graded attempt.`);
      failures.push(...runtimeErrors.map(error => `${viewport.name}/${surface}: Uncaught ${error}`));
      report.push({ surface, viewport: viewport.name, width: viewport.width, height: viewport.height, file, assetsPassed: assetErrors.length === 0, flowsPassed: flowErrors.length === 0, runtimeErrors, ...measurement });
      console.log(`${viewport.name}/${surface}: ${measurement.visibleText} text elements, minimum ${measurement.minimumFont}px`);
      await page.close();
    }
    await context.close();
  }
} finally {
  await browser.close();
}

async function checkFlows(page, surface, viewport) {
  const errors = [];
  try {
    if (surface === 'home') {
      if (await page.locator('.menu-tab').count() !== 4) errors.push('Menu does not have four sections.');
      if (viewport === 'phone') {
        await page.locator('.menu-tab[data-menu-section="learn"]').click();
        await page.waitForFunction(() => document.querySelector('#menu-layer')?.getAttribute('data-menu-page') === 'hub');
        if (!await page.locator('#menu-pages').isVisible() || await page.locator('#other-view').isVisible()) errors.push('Phone section does not open page tiles.');
        await page.locator('.menu-page[data-view="journal"]').click();
        await page.waitForFunction(() => document.querySelector('#menu-layer')?.getAttribute('data-menu-page') === 'page');
        if (!await page.locator('#other-view').isVisible() || await page.locator('#menu-pages').isVisible()) errors.push('Phone tile does not push a page.');
        await page.locator('[data-menu-back]').click();
        await page.waitForFunction(() => document.querySelector('#menu-layer')?.getAttribute('data-menu-page') === 'hub');
        if (await page.locator('.menu-tab.active').getAttribute('data-menu-section') !== 'learn') errors.push('Back changed the selected section.');
      } else {
        await page.keyboard.press('e');
        if (await page.locator('.menu-tab.active').getAttribute('data-menu-section') !== 'learn') errors.push('Keyboard section navigation failed.');
      }
    } else if (surface === 'encounter') {
      await page.locator('.word-chip').first().click();
      await page.waitForSelector('[data-word-detail]');
      const sourceVisible = await page.locator('.word-detail-source').isVisible();
      if (sourceVisible !== (viewport === 'desktop')) errors.push('Word detail does not switch between a side pane and a sheet.');
      await page.locator('[data-word-detail-back]').click();
      await page.waitForSelector('.interior-primary');
      if (!await page.locator('.word-chip').first().evaluate(element => element === document.activeElement)) errors.push('Word detail Back did not restore chip focus.');
      await page.locator('.interior-primary').click();
      await page.waitForSelector('.interior-conversation');
      let steps = 0;
      while (await page.locator('[data-interior-choice]').count() && steps++ < 12) {
        await page.locator('[data-interior-choice]').first().click();
      }
      if (!await page.locator('[data-interior-conversation="replay"]').isVisible()) errors.push('Empty practice queue did not reach a scripted ending.');
      else {
        await page.locator('[data-interior-conversation="replay"]').click();
        if (!await page.locator('[data-interior-choice]').count()) errors.push('Scripted conversation replay failed.');
        await page.locator('[data-interior-choice]').first().click();
        await page.locator('[data-interior-conversation="back"]').click();
        if (!await page.locator('[data-interior-choice]').count()) errors.push('Scripted conversation Back failed.');
      }
    }
  } catch (error) {
    errors.push(error.message);
  }
  return errors;
}

await writeFile(path.join(directory, landscapeOnly ? 'landscape-check.json' : 'font-floor.json'), `${JSON.stringify({ fontFloor: 12, report }, null, 2)}\n`);
const cells = surfaces.flatMap(surface => report.filter(item => item.surface === surface)).map(item => `<figure><a href="${item.file}"><img src="${item.file}" alt="${item.surface} at ${item.width} by ${item.height}" loading="lazy"></a><figcaption>${item.surface} · ${item.viewport} · minimum ${item.minimumFont}px</figcaption></figure>`).join('\n');
await writeFile(path.join(directory, landscapeOnly ? 'index-landscape.html' : 'index.html'), `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>UI screenshot gallery</title>
<style>body{margin:32px;background:#10251e;color:#f3eddb;font:16px/1.5 system-ui}h1{font-size:28px}main{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px}figure{margin:0}img{display:block;max-width:100%;max-height:720px;object-fit:contain;object-position:left;border:1px solid #d8bb8040}figcaption{margin:8px 0}@media(max-width:600px){main{grid-template-columns:1fr}}</style>
<h1>UI screenshot gallery</h1><p>Generated by <code>npm run ui:check --workspace web</code>. Font floor: 12px. The app must be running in development mode.</p><main>${cells}</main></html>\n`);
if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`UI font floor passed for all ${report.length} screenshots.`);
}
