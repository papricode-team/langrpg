/** Live integration check: use an isolated local API/Vite server, not unit-test fixtures. */
import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
const url=process.env.ATLAS_UI_URL??'http://127.0.0.1:5173';
if(!['localhost','127.0.0.1','[::1]'].includes(new URL(url).hostname))throw Error('The prologue flow creates a guest; use a local test server.');
const phone=process.env.ATLAS_UI_VIEWPORT==='phone';
const directory=resolve('output/ui-screenshots',phone?'flow-phone':'flow-desktop');await mkdir(directory,{recursive:true});
// The replies a player who understood would give; anything else is a distractor.
const answers=['Hallo!','Bitte.','Bitte!','Danke!','Sieben.','Nein, danke.','Ja, bitte!','Wo ist die Toilette?','Ich verstehe nicht.','Noch einmal, bitte.','Guten Morgen!','Auf Wiedersehen!','Danke, Herr Brandt!'];
const b=await chromium.launch({...(process.env.ATLAS_CHROMIUM_PATH?{executablePath:process.env.ATLAS_CHROMIUM_PATH}:{})});
const p=await b.newPage({viewport:phone?{width:390,height:844}:{width:1280,height:720}}),errors=[],attempts=[],coachSteps=[];
p.on('pageerror',e=>errors.push(e.stack));
p.on('response',r=>{if(r.status()===429&&new URL(r.url()).pathname.startsWith('/api/content/'))errors.push('Content read limited: '+new URL(r.url()).pathname)});
p.on('request',r=>{if(r.url().endsWith('/api/attempt'))attempts.push(r.postDataJSON())});
/** Stand next to the target and press E: the check exercises interaction, not pathfinding. */
const interact=(id,x,y)=>p.evaluate(({id,x,y})=>{
  const scene=window.atlasGame.scene.getScene('interior'),target=x===undefined?scene.objects.get(id)??[...scene.characters.values()].find(npc=>npc.interactionId===id):{x,y};
  if(!target)throw Error('Missing train target '+id);
  scene.local.x=target.x;scene.local.y=Math.min(target.y+30,720);scene.local.root.setPosition(scene.local.x,scene.local.y);
  scene.triggerInteraction(id);
},{id,x,y});
try{
  await p.goto(url);await p.locator('#language-entry-form [type="submit"]').click();await p.locator('#confirm-languages').click();await p.locator('[data-experience="none"]').click();await p.locator('#entry-name').fill('Ava');await p.locator('#name-entry-form [type="submit"]').click();
  await p.waitForSelector('.story-beacon.coach',{timeout:60000});
  if(await p.locator('[data-placement], .prologue-sounds').count())throw Error('Placement or the sounds board interrupted the first scene.');
  const first=await p.locator('.story-beacon.coach').getAttribute('data-coach');
  if(first!=='walk')throw Error('The tutorial must start by teaching walking, not '+first);
  let typed=0,arrived=false;
  for(let step=0;step<260&&!arrived;step++){
    await p.waitForTimeout(500);
    // Read the phrase card as a player would; each finished beat also refreshes the catalogue under its read budget.
    if(await p.locator('.phrase-card').isVisible()){await p.waitForTimeout(11000);await p.locator('.phrase-card [data-action="close-dialog"]').click();continue;}
    if(await p.locator('#dialogue-answer').isVisible()){typed++;await p.locator('#dialogue-answer').fill('Ava');await p.locator('#dialogue-answer').evaluate(e=>e.form.requestSubmit());continue;}
    const choices=p.locator('[data-dialogue-choice]:not([disabled])');
    if(await choices.count()){
      const labels=await choices.evaluateAll(es=>es.map(e=>(e.getAttribute('aria-label')??'').replace(/^[^:]+:\s*/,'')));
      const index=Math.max(0,labels.findIndex(label=>answers.includes(label)));
      await choices.nth(index).click();continue;
    }
    const next=p.locator('[data-dialogue-action="next"]:not([disabled])');
    if(await next.isVisible()){await next.click();continue;}
    if(await p.locator('.world-dialogue').isVisible())continue;
    const coach=await p.locator('.story-beacon.coach').getAttribute('data-coach').catch(()=>null);
    if(!coach)continue;
    if(coachSteps.at(-1)!==coach)coachSteps.push(coach);
    if(coach==='look'){const target=await p.evaluate(()=>window.atlasGame.scene.getScene('interior').objective);await interact(target.replace(/^object:/,''));}
    else if(coach==='follow')await interact('interior:prologue-wo');
    else if(coach==='leave'){await interact('exit:train-compartment',1352,700);await p.waitForTimeout(4000);arrived=!await p.evaluate(()=>window.atlasWorld?.getInteriorId?.()?.startsWith('train-'));}
    else await interact('interior:prologue-conversation-train-compartment');
    if(coach==='walk')await p.evaluate(()=>{const scene=window.atlasGame.scene.getScene('interior');scene.walkTo(scene.local.x+160,scene.local.y);});
  }
  await p.screenshot({path:resolve(directory,'live-prologue-arrival.png')});
  console.log('Coach steps:',coachSteps.join(' → '));
  if(!arrived)throw Error('The player did not step off the train.');
  if(typed!==1)throw Error(`Exactly one typed answer (the name) is expected, saw ${typed}.`);
  for(const required of ['walk','talk','look','answer','follow','leave'])if(!coachSteps.includes(required))throw Error('The coach never taught '+required);
  const story=attempts.filter(attempt=>!attempt.miniGameId);
  if(story.some(attempt=>attempt.mode!=='recognition'))throw Error('Prologue replies must be supported recognition, never lexical production.');
  console.log('Supported replies submitted:',story.length);
  if(errors.length)throw Error(errors.join('\n'));
}catch(e){console.log('FLOW ERROR',e.message);console.log((await p.locator('body').innerText()).slice(-1500));console.log('Runtime errors',errors);await p.screenshot({path:resolve(directory,'live-prologue-debug.png')});process.exitCode=1;}finally{await b.close();}
