import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1600,height:1250}}),errors=[],apiRequests=[];
 page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/'))apiRequests.push(r.url());});
 page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});
 await page.goto('http://127.0.0.1:4178/qa/terrain-district.html');
 await page.waitForFunction(()=>window.districtReady,{},{timeout:60000});
 await mkdir('docs/audits/modular-terrain',{recursive:true});
 await page.locator('#world').screenshot({path:'docs/audits/modular-terrain/district.png'});
 const screen=async(x,y)=>page.locator('#world').evaluate((canvas,{x,y})=>{const r=canvas.getBoundingClientRect(),world=window.districtWorld,s=Math.min(r.width/world.width,r.height/world.height);return {x:r.x+(r.width-world.width*s)/2+x*s,y:r.y+(r.height-world.height*s)/2+y*s};},{x,y});
 const water=await screen(800,1000);await page.mouse.click(water.x,water.y);
 if(!(await page.locator('#status').textContent()).includes('water'))throw Error('Water click did not reject walking');
 const destination=await screen(1590,1080);await page.mouse.click(destination.x,destination.y);
 if(!(await page.locator('#status').textContent()).includes('Walking'))throw Error('Pavement click did not start a route');
 await page.getByRole('button',{name:'Reset walk',exact:true}).click();
 const routes=await page.evaluate(()=>window.districtRoutes);
 console.log(JSON.stringify({routes,errors}));
 if(routes.some(r=>!r.startWalkable||!r.endWalkable||!r.reachable))throw Error('The district contains a broken walking route.');
 if(process.argv.includes('--editor')){
  await page.getByRole('link',{name:'Edit this draft',exact:true}).click();await page.waitForFunction(()=>window.districtEditorReady,{},{timeout:60000});
  await page.getByRole('tab',{name:'Terrain',exact:true}).click();
  await page.locator('[data-terrain-base]').selectOption('meadow');
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('glotworld-bridgewater-draft-v1')).maps.lindenhafen.modularTerrain.base==='meadow');
  await page.locator('[data-terrain-action=undo]').click();
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('glotworld-bridgewater-draft-v1')).maps.lindenhafen.modularTerrain.base==='canal-grass');
  await page.locator('[data-terrain-selected]').selectOption('canal-crossing');
  await page.locator('[data-selected-width]').fill('580');await page.locator('[data-selected-width]').dispatchEvent('change');
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('glotworld-bridgewater-draft-v1')).maps.lindenhafen.modularTerrain.features.find(f=>f.id==='canal-crossing').width===580);
  await page.reload();await page.waitForFunction(()=>window.districtEditorReady);
  await page.getByRole('tab',{name:'Terrain',exact:true}).click();await page.locator('[data-terrain-selected]').selectOption('canal-crossing');
  if(await page.locator('[data-selected-width]').inputValue()!=='580')throw Error('Draft placement did not survive reload');
  await page.locator('[data-selected-width]').fill('600');await page.locator('[data-selected-width]').dispatchEvent('change');
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('glotworld-bridgewater-draft-v1')).maps.lindenhafen.modularTerrain.features.find(f=>f.id==='canal-crossing').width===600);
  await page.locator('[data-terrain-selected]').selectOption('');
  const downloaded=page.waitForEvent('download');await page.getByRole('button',{name:'Export',exact:true}).click();
  const download=await downloaded;const {readFile}=await import('node:fs/promises');const exported=JSON.parse(await readFile(await download.path(),'utf8'));
  if(exported.maps.lindenhafen.modularTerrain.features.find(f=>f.id==='canal-crossing').width!==600)throw Error('Export lost the accepted draft');
  await page.waitForLoadState('networkidle');
  await page.screenshot({path:'docs/audits/modular-terrain/district-editor.png'});
 }
 if(apiRequests.length)throw Error('Local draft contacted a backend API: '+apiRequests.join(', '));
 if(errors.length)throw Error(errors.join('\n'));
 await writeFile('docs/audits/modular-terrain/district.json',JSON.stringify({routes,errors,clickToWalk:true,blockedWaterClick:true,backendRequests:apiRequests.length,...(process.argv.includes('--editor')?{localEdit:true,undo:true,survivesReload:true,export:true}:{})},null,2)+'\n');
}finally{await browser.close();}
