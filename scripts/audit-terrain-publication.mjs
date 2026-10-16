/** Verify preview, terrain-only publication and undo against current object placements. */
import {chromium} from 'playwright';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const source=JSON.parse(await readFile(process.argv[2]??'content/world-seed.json','utf8'));
const before=source.document??source,storage='glotworld-lindenhafen-terrain-rebuild-v1';
const draft=JSON.parse(await readFile('web/src/data/lindenhafen-terrain-rebuild.json','utf8'));
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1600,height:1100}}),requests=[];
 page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/'))requests.push(r.url());});
 await page.addInitScript(({before,storage})=>localStorage.setItem(storage,JSON.stringify(before)),{before,storage});
 await page.goto('http://127.0.0.1:4178/qa/terrain-compare.html?edit');
 await page.waitForFunction(()=>window.terrainRebuildEditorReady,null,{timeout:60000});
 await page.getByRole('tab',{name:'Terrain',exact:true}).click();
 await page.locator('[data-terrain-file]').setInputFiles('web/src/data/lindenhafen-terrain-rebuild.json');
 await page.getByRole('button',{name:'Publish terrain',exact:true}).waitFor();
 const saved=()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),storage);
 assert.deepEqual(await saved(),before,'preview must not publish');
 await page.getByRole('button',{name:'Publish terrain',exact:true}).click();
 await page.waitForFunction(key=>!!JSON.parse(localStorage.getItem(key)).maps.lindenhafen.modularTerrain,storage);
 const after=await saved(),expected=structuredClone(before);expected.maps.lindenhafen.modularTerrain=draft.modularTerrain;
 assert.deepEqual(after,expected,'publication must preserve every other field');
 await page.waitForTimeout(4000); // Allow streamed HD terrain textures to finish loading before the visual audit.
 await page.screenshot({path:'docs/audits/modular-terrain/live-terrain-with-placements.png'});
 await page.locator('[data-terrain-action="undo"]').click();
 await page.waitForFunction(({key,terrain})=>JSON.stringify(JSON.parse(localStorage.getItem(key)).maps.lindenhafen.modularTerrain)===terrain,{key:storage,terrain:JSON.stringify(before.maps.lindenhafen.modularTerrain)});
 assert.deepEqual(await saved(),before,'undo must restore terrain without changing objects');
 assert.deepEqual(requests,[]);
 console.log('PASS: terrain file preview, terrain-only publication, exact placement preservation, undo; zero backend requests.');
}finally{await browser.close();}
