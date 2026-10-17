/** Live integration check: use an isolated local API/Vite server, not unit-test fixtures. */
import {chromium} from 'playwright';
import {mkdir,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const url=process.env.ATLAS_UI_URL??'http://127.0.0.1:5173';
if(!['localhost','127.0.0.1','[::1]'].includes(new URL(url).hostname))throw Error('The prologue flow creates a guest; use a local test server.');
const authored=JSON.parse(await readFile(new URL('../content/source.json',import.meta.url),'utf8'));
const meanings=new Map(authored.quests.filter(quest=>quest.level==='A0').flatMap(quest=>quest.exercises.map(exercise=>[exercise.german,exercise.english])));
const directory=resolve('output/ui-screenshots');await mkdir(directory,{recursive:true});
const b=await chromium.launch({...(process.env.ATLAS_CHROMIUM_PATH?{executablePath:process.env.ATLAS_CHROMIUM_PATH}:{})}),p=await b.newPage({viewport:{width:1280,height:720}}),errors=[],attempts=[];
p.on('response',r=>{if(r.status()===429&&new URL(r.url()).pathname.startsWith('/api/content/'))errors.push('Content read limited: '+new URL(r.url()).pathname)});
p.on('pageerror',e=>errors.push(e.stack));p.on('request',r=>{if(r.url().endsWith('/api/attempt'))attempts.push(r.postDataJSON())});
try{
 await p.goto(url);await p.locator('#language-entry-form [type="submit"]').click();await p.locator('#confirm-languages').click();await p.locator('[data-experience="none"]').click();await p.locator('#entry-name').fill('Ava');await p.locator('#name-entry-form [type="submit"]').click();
 await p.waitForSelector('.prologue-sounds',{timeout:45000});if(await p.locator('[data-placement]').count())throw Error('Placement appeared on the zero-German route.');console.log('No placement before sounds: true');await p.locator('[data-sound="close"]').click();
 await p.waitForSelector('.dialogue-line',{timeout:30000});console.log('First scene:',await p.locator('.dialogue-line').innerText());if(await p.locator('#dialogue-answer').count())throw Error('The first scene asked for typed German.');console.log('German typing fields: 0');
 for(const [index,reply] of ['Bitte.','Ava','sieben','Einen Tee, bitte.','Wo ist …?','Noch einmal, bitte.','Auf Wiedersehen.'].entries()){
   let completed=false;
   for(let step=0;step<35;step++){
     await p.waitForTimeout(1400);
     if(await p.locator('#dialogue-answer').isVisible()){
       if(index!==1)throw Error('Unexpected typed gate '+index);await p.locator('#dialogue-answer').fill(reply);await p.locator('#dialogue-answer').evaluate(e=>e.form.requestSubmit());continue;
     }
     const choice=p.locator('[data-dialogue-choice]:not([disabled])');
     if(await choice.count()){
       const ids=await choice.evaluateAll(es=>es.map(e=>e.dataset.dialogueChoice));let selected=ids.includes(reply)?reply:ids.includes('continue')?'continue':ids.length===1?ids[0]:null;
       if(!selected)throw Error('Unexpected choices '+JSON.stringify(ids));await p.locator('[data-dialogue-choice]').filter({hasNot:p.locator('[disabled]')}).evaluateAll((es,id)=>es.find(e=>e.dataset.dialogueChoice===id)?.click(),selected);continue;
     }
     const next=p.locator('[data-dialogue-action="next"]:not([disabled])');if(await next.isVisible()){await next.click({timeout:1500}).catch(()=>{});continue;}
     if(!await p.locator('.dialogue-line').isVisible() && Number(await p.locator('#xp-value').textContent()) >= (index+1)*20){completed=true;break;}
   }
   console.log('Scene',index+1,'closed',completed,'XP',await p.locator('#xp-value').innerText());
   if(!completed)throw Error('Scene did not close '+index);
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
   if(index<6){await p.locator('[data-action="prologue"]').first().click();await p.waitForSelector('.dialogue-line',{timeout:15000});}
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
