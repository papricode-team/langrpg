import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {performance} from 'node:perf_hooks';
import {build} from 'vite';
import {packTranslationJSON,unpackTranslationJSON,compactTranslationsPlugin} from './compact-translations.mjs';

const root=fileURLToPath(new URL('..',import.meta.url));
const paths=['story','ui','course'].map(part=>resolve(root,`web/src/data/i18n/tr-${part}.json`));
const source=await Promise.all(paths.map(path=>readFile(path,'utf8')));
const values=source.map(value=>JSON.parse(value));
const overlay={story:values[0],ui:values[1],course:values[2]};

test('Unicode, combining forms, JSON primitives and overlapping dictionary sequences round-trip exactly',()=>{
 const fixtures=[null,false,true,0,-42.75,[],{},'İıŞşĞğÇçÖöÜü ß ä ö ü e\u0301 I\u0307 𐍈',
  {empty:'',combining:'o\u0308',precomposed:'ö',newline:'one\ntwo',zero:'\0',quote:'"\\',nested:[null,-7,true,{pattern:'ABABABA'.repeat(2000)}]},
  JSON.parse('{"__proto__":{"tr":"Türkçe"},"constructor":"eşit"}')];
 for(const value of fixtures)assert.deepEqual(unpackTranslationJSON(packTranslationJSON(value)),value);
 assert.throws(()=>unpackTranslationJSON('AQ=='),/Invalid packed translation stream/);
 assert.throws(()=>unpackTranslationJSON(Buffer.from([255,254]).toString('base64')),/Invalid packed translation code/);
});

test('large dictionaries roll over with an explicit reset and retain all text after each reset',()=>{
 let state=0x5a17,text='';
 for(let index=0;index<400000;index++){state^=state<<13;state^=state>>>17;state^=state<<5;text+=String.fromCharCode(32+(state>>>0)%94);}
 const value={text},encoded=packTranslationJSON(value),bytes=Buffer.from(encoded,'base64');let resets=0;
 for(let index=0;index<bytes.length;index+=2)if(bytes.readUInt16BE(index)===256)resets++;
 assert(resets>1,'fixture exercises repeated dictionary reset');assert.deepEqual(unpackTranslationJSON(encoded),value);
});

test('all three authored overlays retain exact text with a bounded one-time decode and substantial transport savings',()=>{
 const packed=values.map(packTranslationJSON);let rawBytes=0,packedBytes=0;const started=performance.now();
 const decoded=packed.map(unpackTranslationJSON),elapsed=performance.now()-started;
 for(let index=0;index<values.length;index++){rawBytes+=Buffer.byteLength(JSON.stringify(values[index]));packedBytes+=Buffer.byteLength(packed[index]);assert.deepEqual(decoded[index],values[index]);}
 assert(rawBytes-packedBytes>500000,'all packed bytes remain inside the accounted JS payload');
 assert(elapsed<5000,'runtime decoding of all three overlays stays bounded');
});

test('the plugin is build-only and its allowlist excludes unrelated JSON and raw-source imports',()=>{
 const plugin=compactTranslationsPlugin(root),importer=resolve(root,'web/src/i18n-tr.ts');assert.equal(plugin.apply,'build');
 for(const path of paths)assert(plugin.resolveId(path,importer)?.startsWith('\0atlas-packed-translation:'));
 for(const path of ['../data/i18n/tr-course.json','./data/i18n/tr-course.json?raw','./data/course-meta.json','./data/i18n/de-course.json'])assert.equal(plugin.resolveId(path,importer),null);
 assert.equal(plugin.resolveId('./data/i18n/tr-course.json',undefined),null);
});

test('actual Vite production bundling decodes the lazy overlay and leaves authored JSON unchanged',async()=>{
 const output=await mkdtemp(resolve(tmpdir(),'atlas-turkish-bundle-'));
 try{
  await build({configFile:false,root,publicDir:false,logLevel:'silent',plugins:[compactTranslationsPlugin(root)],build:{outDir:output,emptyOutDir:true,target:'es2022',minify:true,lib:{entry:resolve(root,'web/src/i18n-tr.ts'),formats:['es'],fileName:()=> 'overlay.mjs'}}});
  const module=await import(pathToFileURL(resolve(output,'overlay.mjs')).href);assert.deepEqual(module.turkishOverlay,overlay);
  // Compaction must roughly halve the authored JSON and keep the lazy chunk under 1 MB as the story grows.
  const bytes=Buffer.byteLength(await readFile(resolve(output,'overlay.mjs'))),raw=source.reduce((sum,text)=>sum+Buffer.byteLength(text),0);assert(bytes<raw*.6&&bytes<1000000,`production overlay is ${bytes} bytes for ${raw} bytes of JSON`);
  assert.deepEqual(await Promise.all(paths.map(path=>readFile(path,'utf8'))),source);
 }finally{await rm(output,{recursive:true,force:true});}
});
