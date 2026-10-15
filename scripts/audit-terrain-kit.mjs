#!/usr/bin/env node
/** Inspect the assembled kit and exercise native Phaser scenery motion, with no backend writes. */
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1080}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('http://127.0.0.1:4178/qa/terrain-kit.html');await page.waitForFunction(()=>window.terrainKitReady);
 await mkdir('docs/audits/modular-terrain',{recursive:true});
 await page.screenshot({path:'docs/audits/modular-terrain/construction-kit.png',fullPage:true});
 await page.locator('#family').selectOption('canal');await page.locator('#pieces img').evaluateAll(images=>Promise.all(images.map(img=>img.decode())));
 await page.locator('#pieces').screenshot({path:'docs/audits/modular-terrain/stone-bank-pieces.png'});
 const result=await page.evaluate(async()=>{
  const {Phaser}=await import('/qa/terrain-runtime.ts');
  const {terrainObjects,terrainObjectKey}=await import('/src/terrain-objects.ts');
  const {WorldScenery}=await import('/src/world-scenery.ts');
  window.stopTerrainKit();document.body.innerHTML='<div id="fixture"></div>';
  let resolve;const ready=new Promise(r=>resolve=r);
  class Fixture extends Phaser.Scene{
   preload(){for(const object of terrainObjects.slice(0,-1))this.load.image(terrainObjectKey('lindenhafen',object.id),object.asset);}
   create(){resolve(this);}
  }
  const game=new Phaser.Game({type:Phaser.CANVAS,parent:'fixture',width:1200,height:800,banner:false,scene:[Fixture]});
  const scene=await ready;
  const placements=terrainObjects.map((o,i)=>({id:`qa-${o.id}`,asset:o.role,frame:o.id,x:120+(i%4)*260,y:180+Math.floor(i/4)*180,width:o.worldWidth,motion:o.motion==='still'?'still':'boat',collidable:o.collidable}));
  const scenery=new WorldScenery(scene,'lindenhafen','day',placements);
  // The final object intentionally was not preloaded: live edits must fetch new art.
  await new Promise((resolve,reject)=>{const started=performance.now();const check=()=>{if(scenery.objectCount===terrainObjects.length)resolve();else if(performance.now()-started>20000)reject(Error('Live detail asset failed to load'));else requestAnimationFrame(check);};check();});
  const sprites=scene.children.list.filter(item=>item.type==='Sprite'),view={x:0,y:0,right:1200,bottom:800};
  const state=()=>sprites.map(s=>[s.x,s.y,s.rotation,s.alpha]);
  scenery.update(.1,view);const before=state();scenery.update(2.1,view);const after=state();
  const changed=after.filter((value,i)=>JSON.stringify(value)!==JSON.stringify(before[i])).length;
  if(changed<8)throw Error(`Only ${changed} details moved`);
  scenery.setReducedMotion(true);scenery.update(10,view);const reduced=JSON.stringify(state());scenery.update(30,view);
  if(reduced!==JSON.stringify(state()))throw Error('Reduced motion did not stop detail animation');
  const result={objects:scenery.objectCount,animatedObjects:scenery.animatedObjectCount,changedObjects:changed,reducedMotion:true,liveAssetLoading:true};
  scenery.destroy();game.destroy(true);return result;
 });
 if(errors.length)throw Error(errors.join('\n'));
 await writeFile('docs/audits/modular-terrain/construction-kit.json',JSON.stringify({...result,errors},null,2)+'\n');console.log(result);
}finally{await browser.close();}
