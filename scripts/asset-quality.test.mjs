import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { assetQualityPlugin, buildQualityTiers, qualityPlan, sceneryDensities, pruneLegacyCharacterKit } from './asset-quality.mjs';

test('HD distribution excludes the archived kit while retaining active editor and runtime art', async () => {
  const dir=await mkdtemp(join(tmpdir(),'character-distribution-'));
  try {
    for(const name of ['character-kit','character-kit-hd','player-layers','character-features']) {
      await mkdir(join(dir,name));
      for(const kind of ['editor','runtime'])await writeFile(join(dir,name,kind+'.webp'),kind);
    }
    await pruneLegacyCharacterKit(dir,{assetBase:'/assets/character-kit/'});
    assert.equal(await readFile(join(dir,'character-kit','runtime.webp'),'utf8'),'runtime');
    await pruneLegacyCharacterKit(dir,{assetBase:'/assets/character-kit-hd/'});
    await assert.rejects(stat(join(dir,'character-kit')), {code:'ENOENT'});
    await assert.rejects(stat(join(dir,'player-layers')), {code:'ENOENT'});
    assert.equal(await readFile(join(dir,'character-features','runtime.webp'),'utf8'),'runtime');
    for(const kind of ['editor','runtime'])assert.equal(await readFile(join(dir,'character-kit-hd',kind+'.webp'),'utf8'),kind);
  } finally { await rm(dir,{recursive:true,force:true}); }
});

test('pixel-exact sources ship untouched and interface portraits are capped', () => {
  assert.equal(qualityPlan('character-kit/regular/body.webp', 2048, 2048), null);
  assert.deepEqual(qualityPlan('character-kit-hd/regular/body.primary.runtime.0.webp', 768, 1152), { high: [768, 1152], reduced: { low: [384, 576], medium: [576, 864] } });
  assert.equal(qualityPlan('player-walk.webp', 1536, 1440), null);
  assert.equal(qualityPlan('lindenhafen.json', 10, 10), null);
  assert.deepEqual(qualityPlan('character-portraits/ada-neutral.webp', 724, 724), { high: [256, 256], reduced: {} });
  assert.deepEqual(qualityPlan('portraits.webp', 1774, 887), { high: [768, 384], reduced: {} });
});

test('world art gets reduced tiers that keep its aspect ratio', () => {
  assert.deepEqual(qualityPlan('room-kit-furniture.webp', 1536, 1024), { high: [1536, 1024], reduced: { low: [672, 448], medium: [1152, 768] } });
  assert.deepEqual(qualityPlan('character-cast/ada.webp', 1904, 906), { high: [1904, 906], reduced: { low: [952, 453], medium: [1428, 680] } });
  assert.deepEqual(qualityPlan('animals/dog.webp', 1024, 1152), { high: [1024, 1152], reduced: {} });
  assert.deepEqual(qualityPlan('minigames/icon.webp', 128, 128), { high: [128, 128], reduced: {} });
});

test('placed scenery aims at a target density instead of a flat fraction', async () => {
  // A grocery painted at 5.12 source pixels per world unit, and props painted below the Low target.
  assert.deepEqual(qualityPlan('story-quality-grocery.webp', 2048, 2048, 5.12).reduced, { low: [640, 640], medium: [960, 960] });
  assert.deepEqual(qualityPlan('lindenhafen-props.webp', 1024, 1598, 1.06).reduced, { low: [1024, 1598], medium: [1024, 1598] });
  const densities = await sceneryDensities(fileURLToPath(new URL('../web/public/assets', import.meta.url)), fileURLToPath(new URL('../content/world-seed.json', import.meta.url)));
  assert.ok(densities.get('story-quality-grocery.webp') > 4);
  assert.ok(densities.get('lindenhafen-day-building-bases.webp') < 3.5);
});

test('a build writes lossy High in place, reduced tiers and a manifest of logical sizes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'asset-quality-'));
  try {
    const assets = join(dir, 'assets'), cacheDir = join(dir, 'cache');
    await mkdir(join(assets, 'character-kit'), { recursive: true });
    // A real lossless ground master, shrunk to keep the test quick.
    const master = await sharp(fileURLToPath(new URL('../web/public/assets/terrain-materials/brick.webp', import.meta.url))).resize(512, 384).webp({ lossless: true }).toBuffer();
    await writeFile(join(assets, 'town.webp'), master);
    await writeFile(join(assets, 'character-kit', 'sheet.webp'), master);
    const totals = await buildQualityTiers(assets, { cacheDir });
    assert.equal(totals.files, 1);
    const manifest = JSON.parse(await readFile(join(assets, 'q/manifest.json'), 'utf8'));
    assert.deepEqual(manifest.files, { 'town.webp': [512, 384] });
    assert.deepEqual(await sharp(join(assets, 'q/low/town.webp')).metadata().then(m => [m.width, m.height]), [256, 192]);
    assert.deepEqual(await sharp(join(assets, 'q/medium/town.webp')).metadata().then(m => [m.width, m.height]), [384, 288]);
    assert.ok((await stat(join(assets, 'town.webp'))).size < master.length);
    assert.equal((await stat(join(assets, 'character-kit/sheet.webp'))).size, master.length);
  } finally { await rm(dir, { recursive: true, force: true }); }
});


test('closing a development preview does not run production asset conversion', async () => {
  const dir=await mkdtemp(join(tmpdir(),'asset-preview-'));
  try {
    const assets=join(dir,'dist','assets');await mkdir(assets,{recursive:true});
    // Invalid image bytes make any attempt to process production files fail.
    const sentinel=join(assets,'portrait.webp');await writeFile(sentinel,'production output remains untouched');
    const plugin=assetQualityPlugin(dir);
    plugin.configResolved({command:'serve',root:dir,build:{outDir:'dist'}});
    await plugin.closeBundle();
    assert.equal(await readFile(sentinel,'utf8'),'production output remains untouched');
  }finally{await rm(dir,{recursive:true,force:true});}
});
