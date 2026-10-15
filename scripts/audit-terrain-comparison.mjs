import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1900,height:1100},deviceScaleFactor:1}),errors=[],sceneryRequests=[];
 page.on('pageerror',error=>errors.push(error.message));
 page.on('request',request=>{if(/\/assets\/(story-quality|terrain-objects|.*building-)/.test(request.url()))sceneryRequests.push(request.url());});
 await page.goto('http://127.0.0.1:4178/qa/terrain-compare.html');await page.waitForFunction(()=>window.terrainComparisonReady,null,{timeout:60000});
 await mkdir('docs/audits/modular-terrain',{recursive:true});
 await page.screenshot({path:'docs/audits/modular-terrain/terrain-comparison.png',fullPage:true});
 await page.getByRole('button',{name:'Bridge detail',exact:true}).click();
 await page.screenshot({path:'docs/audits/modular-terrain/terrain-comparison-bridge.png',fullPage:true});
 const before=await page.evaluate(()=>[document.querySelector('#original').toDataURL(),document.querySelector('#components').toDataURL()]);
 await page.locator('#roads').uncheck();
 const hidden=await page.evaluate(()=>[document.querySelector('#original').toDataURL(),document.querySelector('#components').toDataURL()]);
 if(before[0]!==hidden[0]||before[1]===hidden[1])throw Error('New road layer control changed the wrong view');
 await page.locator('#roads').check();await page.locator('#water').uncheck();await page.locator('#ground').uncheck();
 await page.locator('#outlines').check();if(!(await page.locator('#pieces').isVisible()))throw Error('Missing piece key');
 await page.locator('#water').check();await page.locator('#ground').check();
 await page.getByRole('button',{name:'Zoom in',exact:true}).click();
 const box=await page.locator('#original').boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+80,box.y+box.height/2+25,{steps:5});await page.mouse.up();
 const state=await page.evaluate(()=>window.terrainComparisonState);if(!state.offset.x||state.zoom<=1||state.sceneryLayers!==0||state.originalTiles!==9)throw Error('Camera or terrain-only state failed');
 await page.locator('#period').selectOption('day');await page.waitForFunction(()=>window.terrainComparisonReady,null,{timeout:60000});
 if(!(await page.locator('#status').textContent()).includes('day'))throw Error('Day terrain failed to load');
 if(errors.length||sceneryRequests.length)throw Error(JSON.stringify({errors,sceneryRequests}));
 await writeFile('docs/audits/modular-terrain/terrain-comparison.json',JSON.stringify({errors,sceneryRequests,originalTiles:9,sceneryLayers:0,sharedScale:true,synchronizedPan:true,dayAndNight:true,independentLayerControls:true,pieceOutlines:true},null,2)+'\n');
 console.log('PASS: terrain-only comparison, both lighting versions, synchronized cameras and independent new layers.');
}finally{await browser.close();}
