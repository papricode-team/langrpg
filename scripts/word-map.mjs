#!/usr/bin/env node
/** TSV review round trip; only an explicitly imported authored map enters content. */
import { readFileSync,writeFileSync,existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildContent,root } from './build-content.mjs';
import { compileTranslation,selectorRange } from './content-model.mjs';
import { validateBundle } from './validate-word-maps.mjs';
export { validateBundle } from './validate-word-maps.mjs';

const columns=['course_id','sentence_id','text','en_text','tr_text','de_text','en_words','tr_words','de_words','required_words','reviewed_by'];
const encode = value => JSON.stringify(value ?? '');
export function parseSheet(text) {
  const lines=text.replace(/\r\n/g,'\n').trimEnd().split('\n');
  if(lines.shift()!==columns.join('\t'))throw new Error('Unrecognized word-map TSV columns.');
  return lines.map((line,index)=>{
    const cells=line.split('\t');if(cells.length!==columns.length)throw new Error(`Row ${index+2}: expected ${columns.length} columns.`);
    return Object.fromEntries(columns.map((key,column)=>{try{return [key,JSON.parse(cells[column])];}catch{throw new Error(`Row ${index+2}: ${key} is not JSON. Keep TSV cell quoting intact.`);}}));
  });
}
function suggestions(sentence) {
  const translation=sentence.translations.en;
  if(!translation)return [];
  const result=[];
  for(const word of sentence.words) {
    const gloss=word.glosses.en;
    // Suggestions require a single literal gloss. Ambiguous definitions and
    // dictionary descriptions are deliberately left for a native speaker.
    if(!gloss || /[;\/()—]/.test(gloss) || gloss.startsWith('to ') || !/^[\p{L}\p{M}]+(?: [\p{L}\p{M}]+)*$/u.test(gloss))continue;
    try{selectorRange(translation.text,{text:gloss,occurrence:1});try{selectorRange(translation.text,{text:gloss,occurrence:2});continue;}catch{/* exactly one */}}catch{continue;}
    const sameGloss=sentence.words.filter(other=>other.glosses.en===gloss);
    if(sameGloss.length!==1)continue;
    result.push({source:word.source,targets:[{text:gloss,occurrence:1}]});
  }
  return result;
}
export function exportSheet(bundle,{prefill=true}={}) {
  const rows=bundle.records.filter(record=>record.kind==='sentence').map(record=>{
    const body=record.body;
    const row={course_id:record.courseId,sentence_id:record.id,text:body.text,required_words:body.words.map(word=>word.source),reviewed_by:''};
    for(const lang of ['en','tr','de']) {
      row[`${lang}_text`]=body.translations[lang]?.text??'';
      const existing=body.translations[lang]?.words.map(({source,targets})=>({source,targets}))??[];
      row[`${lang}_words`]=existing.length ? existing : lang==='en'&&prefill?suggestions(body):'';
    }
    return columns.map(key=>encode(row[key])).join('\t');
  });
  return columns.join('\t')+'\n'+rows.join('\n')+'\n';
}
export function importSheet(bundle,text,existing={}) {
  const records=new Map(bundle.records.filter(record=>record.kind==='sentence').map(record=>[record.id,record]));
  const courses=new Map(bundle.courses.map(course=>[course.id,course])), next=structuredClone(existing), seen=new Set();
  for(const row of parseSheet(text)) {
    if(typeof row.reviewed_by !== 'string')throw new Error(`${row.sentence_id}: reviewer must be text.`);
    if(seen.has(row.sentence_id))throw new Error(`Duplicate sentence ${row.sentence_id}.`);seen.add(row.sentence_id);
    const record=records.get(row.sentence_id);
    if(!record || record.courseId!==row.course_id)throw new Error(`Unknown course/sentence binding ${row.sentence_id}.`);
    if(record.body.text!==row.text)throw new Error(`${row.sentence_id}: source text changed after export.`);
    const translations={};
    for(const lang of courses.get(record.courseId).supportLanguages) {
      const words=row[`${lang}_words`], text=row[`${lang}_text`];
      if(words==='' || words===undefined)continue;
      const current=record.body.translations[lang]?.text;
      if(current && current!==text)throw new Error(`${row.sentence_id}/${lang}: translation changed after export.`);
      const compiled=compileTranslation(record.body.text,{text,words},record.body.words,`${row.sentence_id}/${lang}`);
      translations[lang]={text:compiled.text,words:compiled.words.map(({source,targets})=>({source,targets}))};
    }
    if(Object.keys(translations).length)next[row.sentence_id]={sourceText:row.text,translations:{...(next[row.sentence_id]?.translations??{}),...translations},review:{status:row.reviewed_by?'reviewed':'pending',...(row.reviewed_by?{reviewedBy:row.reviewed_by}:{})}};
  }
  return next;
}
export function validateReviews(bundle) {
  return bundle.records.filter(record => record.kind === 'sentence' && (record.body.authoring?.review?.status !== 'reviewed' || typeof record.body.authoring?.review?.reviewedBy !== 'string' || !record.body.authoring.review.reviewedBy.trim())).map(record => `${record.id}: native-speaker review pending`);
}
export function main(args=process.argv.slice(2)) {
  const {bundle}=buildContent();
  if(args.includes('--export')) {
    const index=args.indexOf('--export'), path=resolve(args[index+1]&&!args[index+1].startsWith('--')?args[index+1]:resolve(root,'content/word-map-review.tsv'));
    writeFileSync(path,exportSheet(bundle));console.log(`Exported ${bundle.records.filter(row=>row.kind==='sentence').length} sentence rows to ${path}. English suggestions are unreviewed; blank cells need authored maps.`);return;
  }
  if(args.includes('--apply')) {
    const path=args[args.indexOf('--apply')+1];if(!path || path.startsWith('--'))throw new Error('--apply requires a TSV path.');
    const target=resolve(root,'content/word-maps.json'), previous=existsSync(target)?JSON.parse(readFileSync(target,'utf8')):{};
    const next=importSheet(bundle,readFileSync(resolve(path),'utf8'),previous);
    writeFileSync(target,JSON.stringify(next,null,1)+'\n');console.log(`Applied authored maps for ${Object.keys(next).length} sentences. Rebuild with npm run content:build.`);return;
  }
  if(args.includes('--check')) {
    const errors=validateBundle(bundle,{strict:!args.includes('--allow-pending')});
    const reviews=args.includes('--require-reviewed')?validateReviews(bundle):[];
    if(reviews.length){console.error(`${reviews.length} sentences still require native-speaker review.`);process.exitCode=1;}
    if(errors.length){console.error(errors.slice(0,20).join('\n'));console.error(`${errors.length} incomplete or invalid language maps. Complete content/word-map-review.tsv with the available reviewers; missing maps are never treated as no-counterpart.`);process.exitCode=1;}else console.log('Word-map selectors and ranges are valid.');return;
  }
  throw new Error('Usage: node scripts/word-map.mjs --export [file.tsv] | --apply file.tsv | --check [--allow-pending] [--require-reviewed]');
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {try{main();}catch(error){console.error(error.message);process.exitCode=1;}}
