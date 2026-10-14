import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
import {contentRuntimePlugin,redactPublicManifest,redactDistributedManifests,publicLearningManifestPaths,privateDevelopmentRequest} from './content-runtime-plugin.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const ids=JSON.parse(readFileSync(resolve(root,'content_ids.json'),'utf8'));
const plugin=contentRuntimePlugin(root);
function transformed(path){return plugin.transform(readFileSync(resolve(root,'web/src',path),'utf8'),resolve(root,'web/src',path))?.code??readFileSync(resolve(root,'web/src',path),'utf8');}
function syntax(code) {
  const file=ts.createSourceFile('transformed.ts',code,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
  assert.deepEqual(file.parseDiagnostics.map(row=>ts.flattenDiagnosticMessageText(row.messageText,'\n')),[]);
}
test('production source transformations remove the authored banks and parse correctly',()=>{
  const cases=[
    ['content.ts','Guten Morgen!'],['course.ts','course-exercises-a1.json'],['quest-graph.ts','dialogue-graphs.json'],
    ['story.ts','Ein Bahnsteig, ein leerer Brief'],['npc-dialogue.ts','Ihre Fahrkarte, bitte. Auch meine Akten'],
    ['activity-engine.ts','Ich möchte einen Kaffee. Erst die Tasse'],['activity-stories.ts','Deine Gäste gehen satt nach Hause'],
    ['interiors.ts','Der Kaffee ist fertig.'],['expeditions.ts','Das Paket ist für Youssef.'],
    ['expedition-games.ts','Das Paket ist für den gemeinsamen Hof.'],['cinematic-content.ts','Der Zug ist da. Auf Bahnsteig sieben?'],
    ['world-routines.ts','Die Lampe bleibt an.'],['minigames/scripted-stories.ts','story-scripts.json'],
  ];
  for(const [path,secret]of cases){const code=transformed(path);syntax(code);assert(!code.includes(secret),`${path} retained ${secret}`);}
});
test('factory literals preserve presentation strings and numeric offsets',async()=>{
  const code=ts.transpileModule(transformed('content.ts'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText.replace(/^import .*;\s*$/gm,'');
  const prelude=`const runtimeArray=(key,initial=[])=>initial;const runtimeObject=()=>({});const runtimeReference=()=>'';`;
  const result=await import(`data:text/javascript;base64,${Buffer.from(prelude+code).toString('base64')}`);
  const marta=result.npcs.find(npc=>npc.id==='marta');
  assert.equal(marta.name,'Marta');assert.equal(marta.x,.442);assert.equal(marta.color,'#F4B17D');
  assert.equal(marta.greeting,'');assert.equal(result.quests.length,0);
});
test('literal identities and embedded reference flags become exact committed UUIDs',()=>{
  const source="export const quest='a1-arrival';export const flag='quest:a1-arrival';export const map='lindenhafen';export const npc='otto';export const exercise='a1-arrival-exercise-7';";
  const code=plugin.transform(source,resolve(root,'web/src/runtime-example.ts')).code;
  assert(code.includes(ids['quest:a1-arrival']));assert(code.includes(`quest:${ids['quest:a1-arrival']}`));assert(code.includes(ids['exercise:a1-arrival-exercise-7']));
  assert(code.includes('"lindenhafen"')||code.includes("'lindenhafen'"));assert(code.includes('"otto"')||code.includes("'otto'"));
  assert(!code.includes("'a1-arrival'"));syntax(code);
});
test('dynamic word and lexical exercise references use hydrated metadata',()=>{
  const source='const item=`word-${word.id}`;const exercise=`lex-${word.id}-${mode}`;';
  const code=plugin.transform(source,resolve(root,'web/src/runtime-example.ts')).code;
  assert(code.includes('runtimeReference("item", word.id)'));assert(code.includes('runtimeReference("exercise", word.id, mode)'));syntax(code);
});
test('existing helper imports are reused without duplicate bindings',()=>{
  const source="import {runtimeReference,runtimeArray} from './content-runtime';export const item=`word-${word.id}`;";
  const code=plugin.transform(source,resolve(root,'web/src/main.ts')).code;
  syntax(code);
  const file=ts.createSourceFile('compiled.ts',code,ts.ScriptTarget.Latest,true);
  const imports=file.statements.filter(ts.isImportDeclaration).flatMap(node=>node.importClause.namedBindings.elements.map(item=>item.name.text));
  assert.equal(imports.filter(name=>name==='runtimeReference').length,1);assert.equal(imports.filter(name=>name==='runtimeArray').length,1);
});
test('artwork keeps presentation paths while audio is supplied by the live server registry',()=>{
  const art=transformed('minigames/item-manifest.ts'),audio=transformed('minigames/host.ts');
  assert(!art.includes('"lemma": "Apfel"'));assert(!art.includes('"plural": "Äpfel"'));assert(art.includes('/assets/minigames/items.webp'));
  assert(!audio.includes('Einen Kaffee, bitte.'));assert(!audio.includes('/audio/minigame-tray-coffee.mp3'));assert(audio.includes('runtimeObject("miniGameAudio"'));assert(audio.includes('targetLanguage()'));syntax(art);syntax(audio);
});
test('audio lookup observes clips installed after the host module is initialized',async()=>{
  const source="import audioData from './audio-data.json';const clips=new Map(audioData.clips.map(clip=>[clip.text,clip.path]));export const path=text=>clips.get(text);export const install=clip=>audioData.clips.push(clip);";
  const transformed=plugin.transform(source,resolve(root,'web/src/minigames/host.ts')).code;
  const code=ts.transpileModule(transformed,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText.replace(/^import .*;\s*$/gm,'');
  const prelude="const audio={clips:[]};const runtimeObject=()=>audio;const runtimeArray=()=>[];const runtimeReference=()=>'';";
  const result=await import(`data:text/javascript;base64,${Buffer.from(prelude+code).toString('base64')}`);
  assert.equal(result.path('A current sentence.'),undefined);
  result.install({text:'A current sentence.',path:'/audio/current.mp3'});
  assert.equal(result.path('A current sentence.'),'/audio/current.mp3');
});
test('greeting selection uses the supplied story condition state',()=>{
  const source='function baseConversation(npc,level,state){return [];}';
  const code=plugin.transform(source,resolve(root,'web/src/npc-dialogue.ts')).code;
  assert(code.includes('conditionMet(line.condition ?? line.when, state)'));syntax(code);
});
test('authoring test files are never transformed',()=>{
  const path=resolve(root,'web/src/content.test.ts');assert.equal(plugin.transform("const x='a1-arrival';",path),null);
});
test('bundle validation rejects accidental learning JSON imports',()=>{
  assert.throws(()=>plugin.generateBundle({}, {bad:{type:'chunk',modules:{[resolve(root,'web/src/data/course-meta.json')]:{} }}}),/Learning content entered/);
  assert.doesNotThrow(()=>plugin.generateBundle({}, {safe:{type:'chunk',modules:{[resolve(root,'web/src/data/world-scenes.json')]:{} }}}));
});
test('public media metadata excludes transcripts, model answers and lexical facts',()=>{
  const input={clips:[{id:'clip-1',text:'A full target sentence.',path:'/audio/clip-1.mp3',speaker:'Sam',answer:'a model answer',nested:{acceptedAnswers:['another'],explanation:'private feedback'}}],frames:{sprite:{lexemeId:'opaque-id',lemma:'word',article:'the',plural:'words',subject:'one picture',url:'/sprite.webp',atlasFrame:{x:12,y:24,w:64,h:64}}}};
  const output=redactPublicManifest(input,{artwork:true});
  assert.equal(output.clips[0].id,'clip-1');assert.equal(output.clips[0].path,'/audio/clip-1.mp3');assert.equal(output.clips[0].speaker,'Sam');
  assert.equal(output.frames.sprite.lexemeId,'opaque-id');assert.equal(output.frames.sprite.url,'/sprite.webp');assert.deepEqual(output.frames.sprite.atlasFrame,{x:12,y:24,w:64,h:64});
  assert(!JSON.stringify(output).includes('A full target sentence.'));assert(!JSON.stringify(output).includes('model answer'));assert.equal(output.frames.sprite.lemma,undefined);assert.equal(output.frames.sprite.subject,undefined);
  assert.equal(input.clips[0].text,'A full target sentence.');
});
test('production scrubbing changes distribution copies and retains private authoring manifests',()=>{
  const directory=mkdtempSync(resolve(tmpdir(),'atlas-public-manifests-'));
  try {
    const before=new Map();
    for(const url of publicLearningManifestPaths) {
      const source=readFileSync(resolve(root,'web/public',url.slice(1)),'utf8');before.set(url,source);
      const target=resolve(directory,url.slice(1));mkdirSync(dirname(target),{recursive:true});writeFileSync(target,source);
    }
    assert.equal(redactDistributedManifests(directory).length,5);
    for(const url of publicLearningManifestPaths) {
      const output=JSON.parse(readFileSync(resolve(directory,url.slice(1)),'utf8'));
      const inspect=value=>{if(!value||typeof value!=='object')return;for(const [key,item]of Object.entries(value)){assert(!['text','answer','acceptedAnswers','explanation','lemma','article','plural'].includes(key),`${url}: ${key}`);inspect(item);}};inspect(output);
      assert.equal(readFileSync(resolve(root,'web/public',url.slice(1)),'utf8'),before.get(url));
    }
  }finally{rmSync(directory,{recursive:true,force:true});}
});
test('development manifest requests, including encoded paths, use redacted responses',()=>{
  let middleware;
  const instance=contentRuntimePlugin(root);instance.configureServer({middlewares:{use:handler=>middleware=handler}});
  const request=url=>{let body,status,headers={};middleware({url,method:'GET'},{set statusCode(value){status=value;},setHeader:(key,value)=>headers[key]=value,end:value=>body=value},error=>{if(error)throw error;});return {body,status,headers};};
  for(const url of ['/audio/manifest.json?cache=1','/audio/%6danifest.json','/audio/../audio/manifest.json',`/@fs/${resolve(root,'web/public/audio/manifest.json')}`]) {
    const result=request(url),body=JSON.parse(result.body);assert.equal(result.status,200);assert.equal(body.clips[0].text,undefined);assert(body.clips[0].path.startsWith('/audio/'));assert.equal(result.headers['Cache-Control'],'no-store');
  }
});
test('development blocks direct authoring banks while transformed modules and presentation stay available',()=>{
  for(const path of ['content/source.json','server/content.json','server/grading-fixtures.json','content_ids.json'])assert(privateDevelopmentRequest(`/@fs/${resolve(root,path)}`,root),path);
  for(const path of ['/src/data/course.json','/src/data/course-exercises-a1.json?import','/src/data/i18n/tr-story.json?raw','/src/minigames/story-scripts.json','/src/content.ts?raw','/src/npc-dialogue.ts?url',`/@fs/${resolve(root,'web/src/expeditions.ts')}?raw`,'/src/%64ata/course-meta.json','/src/content.ts?r%61w'])assert(privateDevelopmentRequest(path,root),path);
  for(const path of ['/src/content.ts','/src/npc-dialogue.ts?import','/src/data/world-scenes.json','/src/data/i18n/tr-ui.json','/src/maps.ts?raw','/assets/interior-bakery-objects.json','/audio/a1-arrival-exercise-1.mp3'])assert.equal(privateDevelopmentRequest(path,root),false,path);
});
test('development denies private JSON and raw lesson requests before Vite file serving',()=>{
  let middleware;
  contentRuntimePlugin(root).configureServer({middlewares:{use:handler=>middleware=handler}});
  for(const url of [`/@fs/${resolve(root,'content/source.json')}`,'/src/data/course-meta.json','/src/story.ts?raw']) {
    let status,body,passed=false;
    middleware({url,method:'GET'},{set statusCode(value){status=value;},setHeader(){},end:value=>body=value},()=>passed=true);
    assert.equal(status,403);assert.equal(passed,false);assert(!body.includes('answer'));
  }
  let passed=false;middleware({url:'/src/story.ts',method:'GET'},{},()=>passed=true);assert(passed);
});
