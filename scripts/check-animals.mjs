/** Run with the local game server. All visual QA uses the actual WorldScene. */
import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';
const origin=process.env.ATLAS_UI_URL??'http://127.0.0.1:5187';
const browser=await chromium.launch(process.env.ATLAS_CHROMIUM_PATH?{executablePath:process.env.ATLAS_CHROMIUM_PATH}:{channel:'chrome'});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto(`${origin}/qa/animals.html`);
 await page.waitForFunction(()=>window.animalWorldReady,undefined,{timeout:60000});
 const frames=await page.evaluate(async()=>{const{checkPaintedAnimalArt}=await import('/qa/animal-check.js');return checkPaintedAnimalArt();});
 let actors=0;
 for(const map of ['lindenhafen','waldruh','nebelstadt']){
  if(map!=='lindenhafen')await page.evaluate(id=>{const scene=window.atlasGame.scene.getScene('world');window.oldAnimalRoots=scene.animals.actors.map(a=>a.root);window.atlasWorld.setMap(id);},map);
  await page.waitForFunction(id=>{const s=window.atlasGame?.scene.getScene('world');return s?.ready&&s.mapSpec.id===id&&s.animals?.actors.length===12;},map,{timeout:60000});
  actors+=await page.evaluate(async()=>{if(window.oldAnimalRoots?.some(root=>root.scene))throw Error('Animals survive scene shutdown');const{checkAnimalScene}=await import('/qa/animal-check.js');return checkAnimalScene(window.atlasGame.scene.getScene('world'));});
 }
 await page.evaluate(()=>window.atlasWorld.setMap('lindenhafen'));
 await page.waitForFunction(()=>{const s=window.atlasGame.scene.getScene('world');return s?.ready&&s.mapSpec.id==='lindenhafen'&&s.animals?.actors.length===12;},undefined,{timeout:60000});
 await mkdir('output/ui-screenshots',{recursive:true});
 for(const species of ['dog','chicken','cat','sheep']){
  await page.selectOption('#animal',`animal:${species}:lindenhafen-animal-${species}-1`);
  await page.click('#visit');
  await page.waitForTimeout(1500);
  await page.screenshot({path:`output/ui-screenshots/animals-world-${species}.png`});
  await page.click('#interact');
  await page.waitForTimeout(400);
  await page.screenshot({path:`output/ui-screenshots/animals-world-${species}-reaction.png`});
 }
 if(errors.length)throw Error(errors.join('\n'));
 console.log(`Painted animals: ${frames} distinct, unclipped poses; ${actors} reachable actors; actual WorldScene interactions, reduced motion, visibility and map restarts passed.`);
}finally{await browser.close();}
