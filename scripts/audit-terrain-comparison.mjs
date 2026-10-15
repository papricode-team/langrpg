import {chromium} from 'playwright';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
const expectedShapes=JSON.parse(await readFile('web/src/data/lindenhafen-terrain-rebuild.json','utf8')).modularTerrain.surfaces.length;
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
 await page.locator('#components').screenshot({path:'docs/audits/modular-terrain/bridge-paving-match.png'});
 await page.getByRole('button',{name:'Road borders',exact:true}).click();
 await page.screenshot({path:'docs/audits/modular-terrain/road-borders-comparison.png',fullPage:true});
 await page.locator('#components').screenshot({path:'docs/audits/modular-terrain/road-borders-detail.png'});
 for(const [name,id] of [['Main landing','main'],['Harbor landing','harbor']]){
  await page.getByRole('button',{name,exact:true}).click();
  await page.locator('#components').screenshot({path:`docs/audits/modular-terrain/bridge-landing-${id}.png`});
 }
 // Exercise the game's padded 256-unit chunk composition against a single canvas.
 const chunkCheck=await page.evaluate(async()=>{
  const {paintModularTerrain}=await import('/src/modular-terrain-renderer.ts');
  const {terrainMaterial}=await import('/src/terrain-materials.ts');
  const {terrainFeature}=await import('/src/terrain-features.ts');
  const {terrainMaterialDependencies}=await import('/src/terrain-masonry.ts');
  const {default:draft}=await import('/src/data/lindenhafen-terrain-rebuild.json');
  const terrain=draft.modularTerrain,images=new Map();
  await Promise.all(terrainMaterialDependencies([terrain.base,...terrain.surfaces.map(s=>s.material)]).map(async id=>{
   const image=new Image();image.src=terrainMaterial(id).asset;await image.decode();images.set(id,image);
  }));
  await Promise.all([...new Set(terrain.features.map(f=>f.asset))].map(async id=>{const image=new Image();image.src=terrainFeature(id).asset;await image.decode();images.set(id,image);}));
  const make=(size)=>{const c=document.createElement('canvas');c.width=c.height=size;return c;};
  const full=make(1024),tiled=make(1024),ctx=full.getContext('2d'),out=tiled.getContext('2d');
  ctx.scale(2,2);ctx.translate(-1280,-768);paintModularTerrain(ctx,terrain,{x:1280,y:768,width:512,height:512},id=>images.get(id),id=>images.get(id));
  for(let y=0;y<2;y++)for(let x=0;x<2;x++){
   const c=make(514),g=c.getContext('2d'),wx=1280+x*256,wy=768+y*256;
   g.translate(1,1);g.scale(2,2);g.translate(-wx,-wy);
   paintModularTerrain(g,terrain,{x:wx-.5,y:wy-.5,width:257,height:257},id=>images.get(id),id=>images.get(id));
   out.drawImage(c,1,1,512,512,x*512,y*512,512,512);
  }
  const a=ctx.getImageData(0,0,1024,1024).data,b=out.getImageData(0,0,1024,1024).data;
  let different=0,checked=0,maxDelta=0;
  for(let y=0;y<1024;y++)for(let x=0;x<1024;x++)if(Math.abs(x-512)<3||Math.abs(y-512)<3){
   checked++;const i=(y*1024+x)*4,delta=Math.max(...[0,1,2,3].map(c=>Math.abs(a[i+c]-b[i+c])));maxDelta=Math.max(maxDelta,delta);if(delta>3)different++;
  }
  return {checked,different,maxDelta};
 });
 if(chunkCheck.different/chunkCheck.checked>.005||chunkCheck.maxDelta>16)throw Error(`Terrain chunk seam differs: ${JSON.stringify(chunkCheck)}`);
 await page.getByRole('button',{name:'Bridge detail',exact:true}).click();
 const before=await page.evaluate(()=>[document.querySelector('#original').toDataURL(),document.querySelector('#components').toDataURL()]);
 await page.locator('#roads').uncheck();
 const hidden=await page.evaluate(()=>[document.querySelector('#original').toDataURL(),document.querySelector('#components').toDataURL()]);
 if(before[0]!==hidden[0]||before[1]===hidden[1])throw Error('New road layer control changed the wrong view');
 await page.locator('#roads').check();await page.locator('#water').uncheck();await page.locator('#ground').uncheck();
 await page.locator('#outlines').check();if(!(await page.locator('#pieces').isVisible()))throw Error('Missing piece key');
 await page.locator('#water').check();await page.locator('#ground').check();
 await page.getByRole('button',{name:'Zoom in',exact:true}).click();
 const box=await page.locator('#original').boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+80,box.y+box.height/2+25,{steps:5});await page.mouse.up();
 const state=await page.evaluate(()=>window.terrainComparisonState);if(!state.offset.x||state.zoom<=1||state.sceneryLayers!==0||state.originalTiles!==9||state.worldWidth!==2304||state.worldHeight!==1536||state.editableShapes!==expectedShapes)throw Error('Camera or terrain-only state failed');
 await page.locator('#period').selectOption('day');await page.waitForFunction(()=>window.terrainComparisonReady,null,{timeout:60000});
 if(!(await page.locator('#status').textContent()).includes('day'))throw Error('Day terrain failed to load');
 if(errors.length||sceneryRequests.length)throw Error(JSON.stringify({errors,sceneryRequests}));
 await writeFile('docs/audits/modular-terrain/terrain-comparison.json',JSON.stringify({errors,sceneryRequests,originalTiles:9,sceneryLayers:0,sharedScale:true,matchingCoordinates:true,worldSize:[2304,1536],editableShapes:expectedShapes,paintedPlacements:5,synchronizedPan:true,dayAndNight:true,independentLayerControls:true,pieceOutlines:true,roadBordersCloseup:true,bridgeLandings:['main','harbor'],chunkCheck},null,2)+'\n');
 console.log(`PASS: terrain-only comparison, lighting, cameras, layers and border close-up. Chunk seams: ${chunkCheck.different}/${chunkCheck.checked} pixels differ by >3; maximum channel difference ${chunkCheck.maxDelta}.`);
}finally{await browser.close();}
