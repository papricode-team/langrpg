/** Live integration check: use an isolated local API/Vite server, not unit-test fixtures. */
import {chromium} from 'playwright';
import {mkdir,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const url=process.env.ATLAS_UI_URL??'http://127.0.0.1:5173';
if(!['localhost','127.0.0.1','[::1]'].includes(new URL(url).hostname))throw Error('The prologue flow creates a guest; use a local test server.');
const authored=JSON.parse(await readFile(new URL('../content/source.json',import.meta.url),'utf8'));
const meanings=new Map(authored.quests.filter(quest=>quest.level==='A0').flatMap(quest=>quest.exercises.map(exercise=>[exercise.german,exercise.english])));
const phone=process.env.ATLAS_UI_VIEWPORT==='phone';
const resumeOnly=process.env.ATLAS_PROLOGUE_RESUME_ONLY==='1';
const directory=resolve('output/ui-screenshots',phone?'flow-phone':'flow-desktop');await mkdir(directory,{recursive:true});
const b=await chromium.launch({...(process.env.ATLAS_CHROMIUM_PATH?{executablePath:process.env.ATLAS_CHROMIUM_PATH}:{})}),p=await b.newPage({viewport:phone?{width:390,height:844}:{width:1280,height:720}}),errors=[],attempts=[];
p.on('response',async r=>{if(r.url().endsWith('/api/attempt')){const data=await r.json();if(data.correct===false)console.log('Attempt not accepted',r.status(),{correct:data.correct,reason:data.reason,error:data.error,answer:data.correctedAnswer});}});
p.on('response',r=>{if(r.status()===429&&new URL(r.url()).pathname.startsWith('/api/content/'))errors.push('Content read limited: '+new URL(r.url()).pathname)});
p.on('pageerror',e=>errors.push(e.stack));p.on('request',r=>{if(r.url().endsWith('/api/attempt'))attempts.push(r.postDataJSON())});
async function checkFlow(){
let ticketOpenedDirectly=false, bootstrapReads=0;
p.on('response',r=>{if(new URL(r.url()).pathname==='/api/content/bootstrap')bootstrapReads++;});
try{
 await p.goto(url);await p.locator('#language-entry-form [type="submit"]').click();await p.locator('#confirm-languages').click();await p.locator('[data-experience="none"]').click();await p.locator('#entry-name').fill('Ava');await p.locator('#name-entry-form [type="submit"]').click();
 await p.waitForSelector('.prologue-sounds',{timeout:45000});if(await p.locator('[data-placement]').count())throw Error('Placement appeared on the zero-German route.');console.log('No placement before sounds: true');await p.locator('[data-sound="close"]').click();
 await p.waitForSelector('.dialogue-line',{timeout:30000});console.log('First scene:',await p.locator('.dialogue-line').innerText());if(await p.locator('#dialogue-answer').count())throw Error('The first scene asked for typed German.');console.log('German typing fields: 0');
 if(bootstrapReads!==1)throw Error('Initial session reloaded its catalogue '+bootstrapReads+' times.');
 console.log('Initial catalogue reads:',bootstrapReads);
 for(const [index,reply] of ['Bitte.','Ava','Sieben.','Einen Tee, bitte.','Wo ist die Toilette?','Ich verstehe nicht.','Auf Wiedersehen.'].entries()){
   let completed=false;
   for(let step=0;step<35;step++){
     await p.waitForTimeout(1400);
     if(await p.locator('#dialogue-answer').isVisible()){
       if(index!==1)throw Error('Unexpected typed gate '+index);await p.locator('#dialogue-answer').fill(reply);await p.locator('#dialogue-answer').evaluate(e=>e.form.requestSubmit());continue;
     }
     const choice=p.locator('[data-dialogue-choice]:not([disabled])');
     if(await choice.count()){
       const ids=await choice.evaluateAll(es=>es.map(e=>e.dataset.dialogueChoice));let selected=ids.includes(reply)?reply:ids.includes('continue')?'continue':ids.length===1?ids[0]:null;
       if(!selected){ const storyReply=index===3?'Ja, bitte.':index===5?'Noch einmal, bitte.':null; if(storyReply) selected=await choice.evaluateAll((es,text)=>es.find(e=>e.getAttribute('aria-label')===`Say it: ${text}`)?.dataset.dialogueChoice,storyReply); }
       if(!selected)throw Error('Unexpected choices '+JSON.stringify(ids));await p.locator('[data-dialogue-choice]').filter({hasNot:p.locator('[disabled]')}).evaluateAll((es,id)=>es.find(e=>e.dataset.dialogueChoice===id)?.click(),selected);continue;
     }
     const next=p.locator('[data-dialogue-action="next"]:not([disabled])');if(await next.isVisible()){
       const lookingCloser=index===0 && (await next.innerText()).includes('Look closer');
       await next.click({timeout:1500});
       if(lookingCloser){
         await p.locator('.investigation-artifact .dialogue-line').waitFor({timeout:5000});
         ticketOpenedDirectly=true;
         console.log('Ticket opens directly from Look closer: true');
       }
       continue;
     }
     if(!await p.locator('.dialogue-line').isVisible() && Number(await p.locator('#xp-value').textContent()) < (index+1)*20) {
       const point = await p.evaluate(async id => {
         const {SceneKeys}=await import('/src/world-state.ts');
         const canvas=document.querySelector('canvas');
         const game=window.atlasGame;
         if(!game) return null;
         const scene=game.scene.getScene(SceneKeys.Interior), object=scene.objects.get('interior:prologue-'+id),camera=scene.cameras.main;
         if(!camera || !scene.ready) return null;
         if(scene.local || scene.navigation) throw Error('Backdrop spawned a player or navigation');
         const rect=canvas.getBoundingClientRect();
         return object?{x:rect.x+(object.x-camera.worldView.x)*camera.zoom*rect.width/game.scale.width,y:rect.y+(object.y-camera.worldView.y)*camera.zoom*rect.height/game.scale.height}:null;
       },['ticket','name','wagen','tee','wo','langsam','morgen'][index]);
       if(point) {
         await p.mouse.click(point.x,point.y);

         continue;
       }
     }
     if(!await p.locator('.dialogue-line').isVisible() && Number(await p.locator('#xp-value').textContent()) >= (index+1)*20){completed=true;break;}
   }
   console.log('Scene',index+1,'closed',completed,'XP',await p.locator('#xp-value').innerText());
   if(!completed)throw Error('Scene did not close '+index);
   if(index===0&&!ticketOpenedDirectly)throw Error('The ticket request did not open its inspection directly.');
   if(index===4){
     await p.locator('[data-minigame="lantern-pairs"]').first().click();
     await p.locator('[data-game-action="start"]').click();
     const german=p.locator('[aria-label="German phrases"] [data-wg^="de:"]').first();
     const phrase=await german.innerText(),meaning=meanings.get(phrase);
     if(!meaning||!phrase.includes(' '))throw Error('Lantern Pairs did not offer a taught phrase.');
     await german.click();await p.locator('[data-wg^="en:"]').filter({hasText:meaning}).click();
     await p.waitForFunction(()=>!!document.querySelector('[aria-label="German phrases"] .is-matched'));
     await p.screenshot({path:resolve(directory,'live-prologue-phrases.png')});
     await p.locator('[data-action="close-dialog"]').click();
     console.log('Phrase match saved:',phrase);
   }
   if(index===1&&resumeOnly){
     await p.reload();
     await p.waitForSelector('.dialogue-line',{timeout:30000});
     await p.waitForFunction(()=>window.atlasWorld?.isExploreReady(),{},{timeout:30000});
     console.log('Saved train reload dismisses loading curtain: true');
     await p.screenshot({path:resolve(directory,'live-prologue-resumed.png')});
     if(errors.length)throw Error(errors.join('\n'));
     return;
   }
   if(index<6){await p.waitForTimeout(350);if(!await p.locator('.dialogue-line').isVisible())await p.locator('[data-action="prologue"]').first().click();await p.waitForSelector('.dialogue-line',{timeout:15000});}
 }
 await p.locator('[data-action="prologue"]').first().click();
 await p.waitForTimeout(3000);
 console.log('Arrival after prologue:',(await p.locator('body').innerText()).slice(-650));
 await p.locator('.dialogue-line').filter({hasText:'Guten Morgen! Willkommen in Lindenhafen.'}).waitFor();
 if(errors.length)throw Error(errors.join('\n'));
 const submissions=attempts.flat(),story=submissions.filter(attempt=>!attempt.miniGameId),phrases=submissions.filter(attempt=>attempt.miniGameId==='lantern-pairs');
 if(phrases.length!==1||!phrases[0].hinted||phrases[0].mode!=='recognition'||phrases[0].answerKind)throw Error('Phrase matching bypassed supported authored grading.');
 if(story.length!==6||story.some(attempt=>attempt.mode!=='recognition'))throw Error('The prologue must submit six supported recognition replies and no lexical name attempt.');
 console.log('Errors',errors);console.log('Lexical attempt modes',submissions.map(a=>a.mode));
 await p.screenshot({path:resolve(directory,'live-prologue-complete.png')});
}catch(e){console.log('FLOW ERROR',e.message);console.log((await p.locator('body').innerText()).slice(-2300));console.log('Runtime errors',errors);await p.screenshot({path:resolve(directory,'live-prologue-debug.png')});process.exitCode=1;}finally{await b.close();}

}
await checkFlow();
