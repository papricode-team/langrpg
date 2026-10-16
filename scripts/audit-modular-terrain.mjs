#!/usr/bin/env node
/** Local browser QA against the real edit worker; no production writes. Run Vite on 4178 first. */
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
const worker=spawn(process.execPath,['scripts/admin-world-worker.mjs'],{stdio:['pipe','pipe','inherit']});
let sequence=0;const pending=new Map();
createInterface({input:worker.stdout}).on('line',line=>{const value=JSON.parse(line);if(value.id){pending.get(value.id)?.(value);pending.delete(value.id);}});
const request=body=>new Promise(resolve=>{const id=String(++sequence);pending.set(id,resolve);worker.stdin.write(JSON.stringify({id,...body})+'\n');});
let document=JSON.parse(await readFile('content/world-seed.json','utf8')),version=JSON.parse(await readFile('web/src/data/world-scene-version.json','utf8')).contentVersion,key='initial';
const waitForState=async(predicate,label)=>{const started=Date.now();while(!predicate()){if(Date.now()-started>60000)throw Error(`Timed out: ${label}`);await new Promise(resolve=>setTimeout(resolve,50));}};
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1600,height:1100}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/api/**',async route=>{
  const url=new URL(route.request().url()),path=url.pathname;
  let body={};
  if(path==='/api/world-content')body={document,contentVersion:version};
  else if(path==='/api/admin/world/status')body={revision:key,contentVersion:version,locks:[]};
  else if(path==='/api/admin/world/locks')body={locks:[]};
  else if(path==='/api/admin/world/ops'){
   const {ops}=route.request().postDataJSON(),from=version;
   const result=await request({type:'apply',base:{key,document},ops});
   if(!result.ok){console.error('Publication rejected:',JSON.stringify(result.problems));await route.fulfill({status:422,json:{problems:result.problems}});return;}
   document=result.bundle.document;version=result.bundle.contentVersion;key=result.key;
   body={revision:key,from,contentVersion:version,applied:result.applied,warnings:result.warnings};
  }else if(path==='/api/admin/world')body={document,revision:key};
  await route.fulfill({json:body});
 });
 await page.goto('http://127.0.0.1:4178/qa/terrain-materials.html');
 await page.waitForFunction(()=>window.terrainPreviewReady);
 await page.evaluate(async()=>{
  document.querySelectorAll('style').forEach(style=>style.remove());
  await import('/src/admin.css');const {mountMapEditor}=await import('/src/admin-map-editor.ts');
  // Use Vite's actual dependency URL (including its HMR version), not a second module instance.
  for(const entry of performance.getEntriesByType('resource').filter(entry=>entry.name.includes('/src/admin-map-canvas'))){
   const {AdminMapScene}=await import(entry.name),create=AdminMapScene.prototype.create;
   AdminMapScene.prototype.create=function(){window.testMapScene=this;return create.call(this);};
  }
  document.body.innerHTML='<div id="test-editor" style="height:100vh;display:flex;flex-direction:column;overflow:hidden"></div>';document.querySelectorAll('style').forEach(style=>{if(style.textContent.includes('Ground,'))style.remove();});
  window.editor=await mountMapEditor(document.querySelector('#test-editor'),{token:()=> 'local-test',selfId:()=> 'local-admin'});
 });
 await page.getByRole('tab',{name:'Terrain',exact:true}).click();
 await page.getByRole('button',{name:'Fit',exact:true}).click();
 await page.locator('[data-terrain-action="enable"]').click();
 await page.locator('[data-terrain-base]').selectOption('dry-grass');
 if(document.maps.lindenhafen.modularTerrain)throw new Error('Preview wrote to the published world');
 await page.locator('[data-terrain-action="discard"]').click();
 await page.locator('[data-terrain-action="enable"]').click();
 await page.locator('[data-terrain-action="publish"]').click();
 await page.waitForFunction(()=>document.querySelector('[data-terrain-base]')&&!document.querySelector('[data-terrain-base]').disabled&&!document.querySelector('[data-terrain-action="publish"]'),null,{timeout:60000});
 await page.waitForTimeout(3000);
 await mkdir('docs/audits/modular-terrain',{recursive:true});
 await page.screenshot({path:'docs/audits/modular-terrain/editor.png',fullPage:true});
 const before=document.maps.lindenhafen.modularTerrain.base;
 await page.locator('[data-terrain-base]').selectOption('dry-grass');
 await page.waitForFunction(()=>document.querySelector('[data-terrain-base]')?.value==='dry-grass'&&!document.querySelector('[data-terrain-base]').disabled,null,{timeout:60000});
 if(document.maps.lindenhafen.modularTerrain.base!=='dry-grass')throw new Error('Terrain material edit was not published');
 await page.locator('[data-terrain-action="undo"]').click();
 await page.waitForFunction(base=>document.querySelector('[data-terrain-base]')?.value===base&&!document.querySelector('[data-terrain-base]').disabled,before,{timeout:60000});
 if(document.maps.lindenhafen.modularTerrain.base!==before)throw new Error('Undo did not restore terrain');
 await page.locator('[data-terrain-tool="rectangle"]').click();
 await page.locator('[data-terrain-material="limestone"]').click();
 const box=await page.locator('#map-canvas canvas').boundingBox(),count=document.maps.lindenhafen.modularTerrain.surfaces.length;
 // Place a harmless walkable patch in a corner of the world.
 await page.mouse.move(box.x+box.width*.15,box.y+box.height*.15);await page.mouse.down();await page.mouse.move(box.x+box.width*.22,box.y+box.height*.21,{steps:8});await page.mouse.up();
 await page.waitForFunction(()=>!document.querySelector('[data-terrain-base]').disabled,null,{timeout:60000});
 if(document.maps.lindenhafen.modularTerrain.surfaces.length!==count+1)throw new Error('Rectangle was not published');
 await page.locator('[data-terrain-action="undo"]').click();
 await page.waitForFunction(()=>!document.querySelector('[data-terrain-base]').disabled,null,{timeout:60000});
 if(document.maps.lindenhafen.modularTerrain.surfaces.length!==count)throw new Error('Shape undo failed');
 await page.locator('[data-terrain-tool="piece"]').click();
 await page.locator('[data-feature-art]').selectOption('canal-arch-bridge');
 await page.locator('[data-feature-width]').fill('500');await page.locator('[data-feature-width]').dispatchEvent('change');
 const featureCount=document.maps.lindenhafen.modularTerrain.features?.length??0;
 await page.mouse.click(box.x+box.width*.15,box.y+box.height*.15);
 await page.waitForFunction(()=>!document.querySelector('[data-terrain-base]').disabled,null,{timeout:60000});
 await waitForState(()=>document.maps.lindenhafen.modularTerrain?.features?.length===featureCount+1,'painted piece publication');
 if(document.maps.lindenhafen.modularTerrain.features.length!==featureCount+1)throw new Error('Painted piece was not published');
 const placed={...document.maps.lindenhafen.modularTerrain.features.at(-1)};
 await page.locator('[data-terrain-tool="select"]').click();
 const grab=await page.evaluate(f=>{const c=window.testMapScene.cameras.main,m=c.getWorldPoint(c.width/2,c.height/2);return {x:c.width/2+(f.x+f.width*.5-m.x)*c.zoom,y:c.height/2+(f.y+f.width*.44-m.y)*c.zoom};},placed);
 await page.mouse.move(box.x+grab.x,box.y+grab.y);await page.mouse.down();await page.mouse.move(box.x+grab.x+15,box.y+grab.y+7,{steps:8});await page.mouse.up();
 await waitForState(()=>document.maps.lindenhafen.modularTerrain?.features?.at(-1)?.x!==placed.x,'free movement publication');
 await page.waitForFunction(()=>!document.querySelector('[data-terrain-base]').disabled,null,{timeout:60000});
 const moved=document.maps.lindenhafen.modularTerrain.features.at(-1);
 if(moved.x===placed.x||Math.abs(moved.x-placed.x)%256===0)throw new Error('Painted piece did not move freely off the tile grid');
 await page.locator('[data-selected-width]').fill('450');await page.locator('[data-selected-width]').dispatchEvent('change');
 await page.waitForFunction(()=>!document.querySelector('[data-terrain-base]').disabled,null,{timeout:60000});
 await waitForState(()=>document.maps.lindenhafen.modularTerrain?.features?.at(-1)?.width===450,'piece resize publication');
 if(document.maps.lindenhafen.modularTerrain.features.at(-1).width!==450)throw new Error('Painted piece resize was not published');
 await page.evaluate(async f=>{window.testMapScene.focus({x:f.x+f.width/2,y:f.y+f.width/2});await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));},document.maps.lindenhafen.modularTerrain.features.at(-1));
 await page.waitForFunction(()=>window.testMapScene.terrain.ready&&window.testMapScene.textures.exists('terrain-feature-canal-arch-bridge'),null,{timeout:60000});
 await page.screenshot({path:'docs/audits/modular-terrain/editor-painted-piece.png',fullPage:true});
 await page.getByRole('button',{name:'Fit',exact:true}).click();
 await page.locator('[data-terrain-action="remove"]').click();
 await page.waitForFunction(()=>!document.querySelector('[data-terrain-base]').disabled,null,{timeout:60000});
 if(document.maps.lindenhafen.modularTerrain.features.length!==featureCount)throw new Error('Painted piece removal failed');
 for(let i=0;i<4;i++){
  await page.locator('[data-terrain-action="undo"]').click();
  await page.waitForFunction(()=>!document.querySelector('[data-terrain-base]').disabled,null,{timeout:60000});
 }
 if((document.maps.lindenhafen.modularTerrain.features?.length??0)!==featureCount)throw new Error('Painted piece undo sequence failed');
 await page.locator('[data-terrain-action="undo"]').click();
 await page.locator('[data-terrain-action="enable"]').waitFor();
 if(document.maps.lindenhafen.modularTerrain)throw new Error('Conversion undo did not restore the original painting');
 await page.getByRole('tab',{name:'Edit',exact:true}).click();
 await page.locator('[data-edit="place"][data-frame="detail-fern"]').click();
 const objectsBefore=document.maps.lindenhafen.scenery.length;
 await page.mouse.click(box.x+box.width*.15,box.y+box.height*.15);
 await page.waitForFunction(()=>!document.querySelector('[data-edit="undo"]').disabled,null,{timeout:60000});
 // The button is already enabled by history; wait for the real worker response too.
 await waitForState(()=>document.maps.lindenhafen.scenery.some(item=>item.frame==='detail-fern'),'detail publication');
 if(document.maps.lindenhafen.scenery.length!==objectsBefore+1)throw new Error('Detail object was not published');
 await page.locator('[data-edit="undo"]').click();
 await waitForState(()=>!document.maps.lindenhafen.scenery.some(item=>item.frame==='detail-fern'),'detail undo');
 if(document.maps.lindenhafen.scenery.length!==objectsBefore)throw new Error('Detail object undo failed');
 if(errors.length)throw new Error(errors.join('\n'));
 const result={errors,conversionPreview:true,previewDiscard:true,conversionPublication:true,conversionUndo:true,baseMaterialPublication:true,baseMaterialUndo:true,rectanglePublication:true,rectangleUndo:true,paintedPiecePublication:true,nativePaintedArtLoaded:true,freeMovement:true,proportionalResize:true,pieceDeletion:true,pieceUndo:true,objectPublication:true,objectUndo:true,transport:'local browser requests validated by real admin-world-worker'};
 await writeFile('docs/audits/modular-terrain/browser.json',JSON.stringify(result,null,2)+'\n');console.log(result);
}finally{await browser.close();worker.kill();}
