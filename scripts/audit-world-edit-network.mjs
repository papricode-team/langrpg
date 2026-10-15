/** Exercise real Chromium fetch binding; the local draft transport cannot catch illegal invocations. */
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage(),requests=[];
 await page.route('**/api/admin/world/**',async route=>{
  const request=route.request();requests.push({path:new URL(request.url()).pathname,method:request.method()});
  await route.fulfill({json:{revision:'test',contentVersion:'test',locks:[],valid:true,applied:[]}});
 });
 await page.goto('http://127.0.0.1:4178/qa/terrain-compare.html');
 const result=await page.evaluate(async()=>{
  const {WorldEditSession}=await import('/src/world-edit-session.ts');
  const {sceneDocument}=await import('/src/scene-data.ts');
  const session=new WorldEditSession(()=> 'local-test',()=>sceneDocument);
  const status=await session.status('lindenhafen');
  await session.lock('lindenhafen','terrain');await session.release('lindenhafen','terrain');
  await session.validate(sceneDocument);session.dispose();return status;
 });
 assert.equal(result.revision,'test');
 assert.deepEqual(requests.map(r=>r.method),['GET','POST','POST','POST']);
 console.log('PASS: native browser fetch sends authenticated status, locks and validation without an illegal invocation.');
}finally{await browser.close();}
