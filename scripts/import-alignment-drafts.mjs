/** Convert historical token-index authoring into exact occurrence selectors. */
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {sourceTokens,selectorRange,compileTranslation} from './content-model.mjs';

function selectorAt(text,start,end) {
  const value=text.slice(start,end);
  for(let occurrence=1;;occurrence++) {
    const selector={text:value,occurrence},range=selectorRange(text,selector);
    if(range.start===start&&range.end===end)return selector;
    if(range.start>start)throw new Error('Token range is not a complete exact occurrence.');
  }
}
function validTokens(value) {
  if(!value||typeof value.text!=='string'||!Array.isArray(value.tokens))throw new Error('Missing tokenized authoring text.');
  let end=0;
  for(const range of value.tokens) {
    if(!Array.isArray(range)||range.length!==2||!range.every(Number.isInteger)||range[0]<end||range[1]<=range[0]||range[1]>value.text.length)throw new Error('Invalid authored token range.');
    end=range[1];
  }
}
export function convertAlignedLine(line) {
  validTokens(line.de);
  const required=sourceTokens(line.de.text),translations={};
  for(const [language,value]of Object.entries(line.support??{})) {
    validTokens(value);if(!Array.isArray(value.align))throw new Error('Missing authored alignment pairs.');
    const pairs=new Map();
    for(const pair of value.align) {
      if(!Array.isArray(pair)||pair.length!==2||!pair.every(Number.isInteger)||pair[0]<0||pair[0]>=line.de.tokens.length||pair[1]<0||pair[1]>=value.tokens.length)throw new Error('Invalid authored alignment pair.');
      const targets=pairs.get(pair[0])??new Set();targets.add(pair[1]);pairs.set(pair[0],targets);
    }
    const words=required.map(word=>{
      const source=line.de.tokens.findIndex(([start,end])=>start===word.range.start&&end===word.range.end);
      if(source<0)throw new Error('Historical source token does not match a tappable occurrence.');
      const targets=[...(pairs.get(source)??[])].sort((a,b)=>a-b);
      if(!targets.length&&!(typeof value.untranslated?.[source]==='string'&&value.untranslated[source].trim()))throw new Error('Missing explicit no-counterpart authorship.');
      return {source:word.source,targets:targets.map(index=>selectorAt(value.text,...value.tokens[index]))};
    });
    compileTranslation(line.de.text,{text:value.text,words},required,language);
    translations[language]={text:value.text,words};
  }
  if(!Object.keys(translations).length)throw new Error('No authored support language.');
  return {text:line.de.text,translations};
}
export function importAlignedDrafts(artifact,{sourceCommit='9a83d89d',translationOverlays={},cache={entries:{}}}={}) {
  const grouped=new Map(),rejected=[];
  for(const record of artifact.records.lines) {
    try {
      const converted=convertAlignedLine(record.body),key=JSON.stringify(converted),overlay=translationOverlays[record.slug];
      let entry=grouped.get(key);
      if(!entry){entry={...converted,sourceSlugs:[],replaceSupport:false,omitGlossSources:[],provenance:{sourceCommit,nativeReview:'pending'}};grouped.set(key,entry);}
      entry.sourceSlugs.push(record.slug);
      if(overlay?.replaceSupport)entry.replaceSupport=true;
      for(const index of overlay?.omitGlossTokens??[]) {
        const range=record.body.de.tokens[index],word=range&&sourceTokens(record.body.de.text).find(word=>word.range.start===range[0]&&word.range.end===range[1]);
        if(word&&!entry.omitGlossSources.some(old=>old.text===word.source.text&&old.occurrence===word.source.occurrence))entry.omitGlossSources.push(word.source);
      }
    } catch(error) {rejected.push({slug:record.slug,reason:error.message,line:record.body});}
  }
  const provenance=Object.fromEntries(Object.entries(cache.entries??{}).map(([hash,value])=>[hash,{status:value.status,authorship:value.authorship,source:value.source,nativeReview:value.nativeReview??'not-attested'}]));
  return {version:1,sourceCommit,entries:[...grouped.values()],rejected,provenance};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const [input,output,overlaysPath,cachePath]=process.argv.slice(2);
  if(!input||!output)throw new Error('Usage: import-alignment-drafts.mjs compiled-bundle.json output.json [translation-overlays.json] [cache.json]');
  const result=importAlignedDrafts(JSON.parse(readFileSync(input,'utf8')),{translationOverlays:overlaysPath?JSON.parse(readFileSync(overlaysPath,'utf8')):{},cache:cachePath?JSON.parse(readFileSync(cachePath,'utf8')):{entries:{}}});
  writeFileSync(output,JSON.stringify(result)+'\n');console.log(`Preserved ${result.entries.length} authored text triples; ${result.rejected.length} unmatched token formats retained for review. All native approvals remain pending.`);
}
