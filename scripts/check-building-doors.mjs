import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const origin = process.env.ATLAS_UI_URL ?? 'http://127.0.0.1:5187';
const directory = 'output/ui-screenshots';
await mkdir(directory, {recursive: true});
const browser = await chromium.launch(process.env.ATLAS_CHROMIUM_PATH ? {executablePath: process.env.ATLAS_CHROMIUM_PATH} : {});
try {
  const page = await browser.newPage({viewport: {width: 1440, height: 680}});
  const errors = [];
  page.on('pageerror', error => { errors.push(error.message); console.error(error.message); });
  for (const map of ['lindenhafen', 'waldruh', 'nebelstadt']) for (const mirror of [false, true]) {
    await page.goto(`${origin}/qa/building-doors.html?map=${map}${mirror ? '&mirror' : ''}`);
    await page.waitForFunction(() => window.doorQA?.portals.size === 4);
    await page.mouse.move(0, 0);
    const portals = await page.evaluate(() => [...window.doorQA.portals.values()].map(p => ({id:p.id,x:p.x,y:p.y,hx:p.x+p.hit.x,hy:p.y+p.hit.y,children:p.root.list.map(child=>child.type)})));
    for (const portal of portals) {
      // No sign image or floor shapes remain in the outdoor portal.
      assert.deepEqual(portal.children, ['Container', 'Text', 'Zone']);
      const canvas = await page.locator('canvas').boundingBox();
      await page.mouse.move(canvas.x + portal.hx, canvas.y + portal.hy);
      await page.waitForFunction(id => {const p=window.doorQA.portals.get(id);return p.hovered && p.effect.root.alpha === 1;}, portal.id);
      await page.mouse.click(canvas.x + portal.hx, canvas.y + portal.hy);
      assert.equal(await page.evaluate(() => window.doorQA.clicked), portal.id);
      await page.mouse.move(0, 0);
      await page.waitForFunction(id => !window.doorQA.portals.get(id).effect.root.visible, portal.id);
      await page.evaluate(p => {window.doorQA.local={x:p.x,y:p.y+120};}, portal);
      await page.waitForFunction(id => window.doorQA.portals.get(id).effect.root.alpha === 1, portal.id);
      await page.evaluate(() => {window.doorQA.local={x:-1000,y:-1000};});
      await page.waitForFunction(id => !window.doorQA.portals.get(id).effect.root.visible, portal.id);
    }
    await page.locator('#near').click();
    await page.waitForFunction(() => [...window.doorQA.portals.values()].every(p => p.effect.root.alpha === 1));
    await page.screenshot({path:`${directory}/building-doors-${map}${mirror ? '-mirrored' : ''}.png`});
    if (map === 'lindenhafen' && !mirror) {
      const animated = await page.locator('canvas').screenshot();
      await page.waitForTimeout(200);
      assert.notDeepEqual(await page.locator('canvas').screenshot(), animated, 'Magic should animate');
      await page.locator('#motion').click();
      await page.waitForTimeout(100);
      const still = await page.locator('canvas').screenshot();
      await page.waitForTimeout(200);
      assert.deepEqual(await page.locator('canvas').screenshot(), still, 'Reduced motion should stay still');
      await page.locator('#far').click();
      await page.waitForFunction(() => [...window.doorQA.portals.values()].every(p => !p.effect.root.visible));
      await page.screenshot({path:`${directory}/building-doors-inactive.png`});
      await page.evaluate(() => {const s=window.doorQA,p=[...s.portals.values()][0];s.local={x:p.x,y:p.y};s.controlsEnabled=false;});
      await page.waitForTimeout(100);
      assert.equal(await page.evaluate(() => [...window.doorQA.portals.values()][0].effect.root.visible), false, 'Disabled controls suppress magic');
    }
    console.log(`${map}${mirror ? ' mirrored' : ''}: hover, proximity, click and fade passed`);
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
