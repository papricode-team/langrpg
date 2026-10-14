#!/usr/bin/env node
/** Build-time Codex authoring, persistent text hashes, validation and review export. */
import { readFile, writeFile, mkdir, mkdtemp, rm, open, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { tmpdir, homedir } from 'node:os';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { alignmentHash, alignmentReviewTSV, validateAlignment, applyCachedAlignment, authorLexicalTemplates } from './content-alignment.mjs';
import {tokenTexts} from './content-tokenizer.mjs';

const languageSchema={type:'object',additionalProperties:false,required:['align','untranslated'],properties:{
  align:{type:'array',items:{type:'array',minItems:2,maxItems:2,items:{type:'integer',minimum:0}}},
  untranslated:{type:'array',items:{type:'object',additionalProperties:false,required:['index','reason'],properties:{index:{type:'integer',minimum:0},reason:{type:'string'}}}},
}};

export const proposalSchema = {
  type:'object', additionalProperties:false, required:['lines'], properties:{lines:{type:'array',items:{
    type:'object',additionalProperties:false,required:['id','support'],properties:{id:{type:'string'},support:{
      type:'object',additionalProperties:false,required:['en','tr'],properties:Object.fromEntries(['en','tr'].map(language=>[language,{anyOf:[languageSchema,{type:'null'}]}])),
    }},
  }}}};

export function codexAlignmentPrompt(lines,diagnostics=''){
  const values=lines.map(line=>({id:line.id,de:{text:line.de.text,tokens:tokenTexts(line.de)},support:Object.fromEntries(Object.entries(line.support).map(([language,value])=>[language,{text:value.text,tokens:tokenTexts(value)}]))}));
  return `Author word alignment for the supplied German and support-language sentences. Use only the supplied data. Do not use tools, read files, inspect projects, access the network, or infer text from any other source. Return only JSON matching the output schema, with every requested line exactly once.\nUse zero-based token indices. Every German token must have a pair or an explicit linguistic omission reason. A support token may be claimed by at most three German tokens; one German token may map to several support tokens. Do not change text or tokenization.\nBoth support keys en and tr are required. Use null only when that language is absent from the supplied line. For every supplied language return {"align":[[0,0]],"untranslated":[{"index":1,"reason":"linguistic reason"}]}. Omission indices must not also have pairs.\n${diagnostics?`The previous batch failed validation; correct these errors: ${diagnostics.slice(0,6000)}\n`:''}${JSON.stringify(values)}`;
}

export async function codexPreferenceArguments(configPath=resolve(process.env.CODEX_HOME??resolve(homedir(),'.codex'),'config.toml')){
  let config='';try{config=await readFile(configPath,'utf8');}catch(error){if(error.code!=='ENOENT')throw error;}
  // Only inherit root model preferences, never providers, MCP servers or project settings.
  config=config.split(/^\s*\[/m,1)[0];
  const args=[],model=/^model\s*=\s*"([A-Za-z0-9._-]+)"\s*$/m.exec(config)?.[1],effort=/^model_reasoning_effort\s*=\s*"(none|minimal|low|medium|high|xhigh|max|ultra)"\s*$/m.exec(config)?.[1];
  if(model)args.push('--model',model);if(effort)args.push('-c',`model_reasoning_effort="${effort}"`);return args;
}

export async function proposeWithCodex(lines, { executable=process.env.CODEX_BIN ?? 'codex', timeoutMs=180000, diagnostics='', preferenceArgs }={}) {
  if(!Number.isInteger(timeoutMs)||timeoutMs<1)throw new Error('Invalid Codex timeout.');
  const directory=await mkdtemp(resolve(tmpdir(),'atlas-align-'));
  try {
    const schemaPath=resolve(directory,'schema.json'),outputPath=resolve(directory,'proposal.json');
    await writeFile(schemaPath,JSON.stringify(proposalSchema));
    const preferences=preferenceArgs??await codexPreferenceArguments();
    await new Promise((accept,reject)=>{
      const child=spawn(executable,['exec','--ignore-user-config',...preferences,'--sandbox','read-only','--skip-git-repo-check','--ephemeral','--output-schema',schemaPath,'--output-last-message',outputPath,'-'],{cwd:directory,stdio:['pipe','ignore','pipe']});
      let stderr='',timedOut=false,killTimer;child.stderr.on('data',chunk=>{stderr=(stderr+chunk.toString()).slice(-4000);});
      const cleanup=()=>{clearTimeout(timer);clearTimeout(killTimer);};
      const timer=setTimeout(()=>{timedOut=true;child.kill('SIGTERM');killTimer=setTimeout(()=>{child.kill('SIGKILL');reject(new Error('Codex alignment batch timed out.'));},3000);},timeoutMs);
      child.on('error',error=>{cleanup();reject(new Error(`Codex authoring unavailable: ${error.message}. Supply validated JSON with --proposals instead.`));});
      child.on('close',code=>{cleanup();if(timedOut)reject(new Error('Codex alignment batch timed out.'));else code===0?accept():reject(new Error(`Codex authoring exited ${code}: ${stderr}`));});
      child.stdin.on('error',()=>{}); child.stdin.end(codexAlignmentPrompt(lines,diagnostics));
    });
    return JSON.parse(await readFile(outputPath,'utf8'));
  } finally { await rm(directory,{recursive:true,force:true}); }
}

export function acceptProposals(lines, proposals, cache, {accept=false,author='codex',requireComplete=false}={}) {
  const byID=new Map(lines.map(line=>[line.id,line])),errors=[],entries={...cache.entries};
  if (!Array.isArray(proposals?.lines)) throw new Error('Proposal JSON must contain a lines array.');
  const seen=new Set();
  for (const proposal of proposals.lines) {
    if(!proposal||typeof proposal!=='object'||typeof proposal.id!=='string'){errors.push('Every proposal requires a string line id.');continue;}
    const line=byID.get(proposal.id);
    if (!line || seen.has(proposal.id)) {errors.push(`Unknown or repeated line ${proposal.id}.`);continue;}
    seen.add(proposal.id);
    if(!proposal.support||typeof proposal.support!=='object'||Array.isArray(proposal.support)){errors.push(`${line.id}: missing support object.`);continue;}
    const candidate=structuredClone(line); candidate.alignmentStatus='reviewed';
    for (const [language,value] of Object.entries(candidate.support)) {
      const authored=proposal.support?.[language];
      if (!authored||typeof authored!=='object'||Array.isArray(authored)) {errors.push(`${line.id}: missing ${language} proposal.`);continue;}
      value.align=authored.align;
      if(Array.isArray(authored.untranslated)){
        value.untranslated={};const omitted=new Set();
        for(const omission of authored.untranslated){
          if(!omission||!Number.isInteger(omission.index)||typeof omission.reason!=='string'||omitted.has(omission.index)){errors.push(`${line.id}: malformed or repeated ${language} omission.`);continue;}
          omitted.add(omission.index);value.untranslated[omission.index]=omission.reason;
        }
      }else value.untranslated=authored.untranslated ?? {};
    }
    for (const [language,value] of Object.entries(proposal.support)) if (!['en','tr'].includes(language)||(value!==null&&!candidate.support[language])) errors.push(`${line.id}: unexpected ${language} proposal.`);
    const failures=validateAlignment({...candidate,glosses:undefined});
    if (failures.length) {errors.push(...failures.map(failure=>`${line.id}: ${failure}`));continue;}
    entries[alignmentHash(line)]={status:accept?'authored':'proposed',authorship:author,nativeReview:'pending',support:candidate.support};
  }
  if(requireComplete)for(const line of lines)if(!seen.has(line.id))errors.push(`Missing proposal for requested line ${line.id}.`);
  if (errors.length) throw new Error(errors.join('\n'));
  return {version:1,entries};
}

/** Atomic snapshots and a short filesystem lock prevent concurrent writers losing batches. */
export async function persistAlignmentCache(cachePath,incoming,{lockWaitMs=30000}={}){
  await mkdir(resolve(cachePath,'..'),{recursive:true});
  const lockPath=`${cachePath}.lock`,started=Date.now();let lock;
  while(!lock){
    try{lock=await open(lockPath,'wx');}
    catch(error){
      if(error.code!=='EEXIST')throw error;
      let owner;try{owner=JSON.parse(await readFile(lockPath,'utf8'));}catch{/* The other writer may still be recording its owner. */}
      if(Number.isInteger(owner?.pid)&&owner.pid>0){
        try{process.kill(owner.pid,0);}catch(error){
          // Never unlink from a stale observation: another writer could have
          // replaced this lock since its owner was read.
          if(error.code==='ESRCH')throw new Error(`Stale alignment cache lock ${lockPath} (process ${owner.pid} has exited). Verify no writer is running, remove only the lock file, then resume.`);
        }
      }
      if(Date.now()-started>=lockWaitMs)throw new Error(`Alignment cache lock did not clear: ${lockPath}. Verify whether its writer is running before removing a stale lock and resuming.`);
      await new Promise(accept=>setTimeout(accept,50));
    }
  }
  const temporary=`${cachePath}.tmp-${randomUUID()}`;
  try{
    await lock.writeFile(JSON.stringify({pid:process.pid}));
    let current={version:1,entries:{}};
    try{current=JSON.parse(await readFile(cachePath,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
    const entries={...current.entries},rank={proposed:0,authored:1,reviewed:2};
    for(const [hash,value] of Object.entries(incoming.entries??{}))if(!entries[hash]||(rank[value.status]??-1)>=(rank[entries[hash].status]??-1))entries[hash]=value;
    const merged={version:1,entries};await writeFile(temporary,JSON.stringify(merged,null,2)+'\n',{mode:0o600});await rename(temporary,cachePath);return merged;
  }finally{await rm(temporary,{force:true});await lock.close();await rm(lockPath,{force:true});}
}

/** Validate whole batches, retry boundedly, and split difficult batches without losing successes. */
export async function authorBatches(lines,propose,{batchSize=12,concurrency=1,retries=1,accept=true,onAccepted=async()=>{},onProgress=()=>{}}={}){
  if(!Number.isInteger(batchSize)||batchSize<1||!Number.isInteger(concurrency)||concurrency<1||!Number.isInteger(retries)||retries<0)throw new Error('Invalid authoring batch options.');
  const batches=[];for(let index=0;index<lines.length;index+=batchSize)batches.push(lines.slice(index,index+batchSize));
  let next=0,completed=0,fatal;const failures=[];
  async function author(batch){
    let error;
    for(let attempt=0;attempt<=retries&&!fatal;attempt++){
      let accepted;
      try{const proposals=await propose(batch,{attempt,diagnostics:error?.message??''});accepted=acceptProposals(batch,proposals,{version:1,entries:{}},{accept,author:'codex',requireComplete:true});}
      catch(failure){error=failure;continue;}
      try{await onAccepted(accepted,batch);}catch(error){fatal=error;return;}
      completed+=batch.length;onProgress({completed,total:lines.length,batch:batch.length});return;
    }
    if(fatal)return;
    if(batch.length>1){const middle=Math.ceil(batch.length/2);await author(batch.slice(0,middle));await author(batch.slice(middle));}
    else failures.push({id:batch[0].id,error:error?.message??'Alignment authoring failed.'});
  }
  await Promise.all(Array.from({length:Math.min(concurrency,batches.length)},async()=>{while(next<batches.length&&!fatal){const batch=batches[next++];await author(batch);}}));
  if(fatal)throw fatal;
  return {completed,total:lines.length,failures};
}

/** Reapply the current cache before deduplicating; exported status may be stale. */
export function pendingAlignmentLines(artifact,cache,{filter,limit=Infinity}={}){
  const unique=new Map();
  for(const record of artifact.records.lines){
    const line=applyCachedAlignment(record.body,cache);
    if(['reviewed','authored'].includes(line.alignmentStatus))continue;
    if(filter==='story'&&!(line.questId||line.npcId||['act:','clue:','journal:','ambient:'].some(prefix=>record.slug.startsWith(prefix))))continue;
    if(filter&&filter!=='story'&&!record.slug.includes(filter))continue;
    const hash=alignmentHash(line);if(!unique.has(hash))unique.set(hash,line);
  }
  return [...unique.values()].slice(0,limit);
}

const cacheChanges=(previous,next)=>({version:1,entries:Object.fromEntries(Object.entries(next.entries).filter(([hash,entry])=>entry!==previous.entries[hash]))});

export async function runAlignment(options={}) {
  const root=options.root ?? resolve(import.meta.dirname,'..');
  const artifact=JSON.parse(await readFile(resolve(root,'server/content.json'),'utf8'));
  const cachePath=resolve(root,'content/alignments/reviewed.json');
  let cache=JSON.parse(await readFile(cachePath,'utf8'));
  let lexemes=new Map(artifact.records.lexemes.map(record=>[record.id,record.body]));
  let lines=artifact.records.lines.map(record=>applyCachedAlignment(record.body,cache));
  if (options.authorTemplates) {
    const authored=authorLexicalTemplates(artifact,cache);
    cache=await persistAlignmentCache(cachePath,cacheChanges(cache,authored.cache));
    lines=lines.map(line=>applyCachedAlignment(line,cache));
    process.stdout.write(`Authored ${authored.authored} distinct lexical-label templates from explicit source meanings.\n`);
  }
  if (options.proposals) {
    const accepted=acceptProposals(lines,JSON.parse(await readFile(resolve(options.proposals),'utf8')),cache,{accept:options.accept,author:'codex'});
    cache=await persistAlignmentCache(cachePath,cacheChanges(cache,accepted));
    lines=lines.map(line=>applyCachedAlignment(line,cache));
  }
  let authoringFailures=[];
  if (options.propose) {
    cache=JSON.parse(await readFile(cachePath,'utf8'));
    const pending=pendingAlignmentLines(artifact,cache,options);
    const preferenceArgs=await codexPreferenceArguments();
    const result=await authorBatches(pending,(batch,{diagnostics})=>proposeWithCodex(batch,{executable:options.codexBin,timeoutMs:options.timeoutMs,diagnostics,preferenceArgs}),{
      batchSize:options.batchSize,concurrency:options.concurrency,retries:options.retries,accept:Boolean(options.accept),
      onAccepted:async accepted=>{await persistAlignmentCache(cachePath,accepted);},
      onProgress:({completed,total})=>process.stdout.write(`${options.accept?'Authored':'Proposed'} ${completed}/${total} distinct pending triples with Codex.\n`),
    });
    authoringFailures=result.failures.map(({id,error})=>`${id}: ${error}`);
    cache=JSON.parse(await readFile(cachePath,'utf8'));
    lines=lines.map(line=>applyCachedAlignment(line,cache));
  }
  // Save every successful batch, even when another batch or strict completion check fails.
  if (options.proposals || options.propose || options.authorTemplates) {
    const exporter=options.exporter??(await import('./export-content.mjs')).exportContent;
    const {artifact:exported}=await exporter(root);
    // Sources may change while authoring runs; check/review the actual export,
    // including newly added lines and changed support hashes.
    lines=exported.records.lines.map(record=>record.body);
    lexemes=new Map(exported.records.lexemes.map(record=>[record.id,record.body]));
  }
  if (options.review) {
    const output=resolve(root,options.reviewPath ?? 'content/review/alignment.tsv');
    await mkdir(resolve(output,'..'),{recursive:true});
    await writeFile(output,alignmentReviewTSV(lines));
    process.stdout.write(`Review sheet: ${output}\n`);
  }
  const accepted=lines.filter(line=>['reviewed','authored'].includes(line.alignmentStatus));
  const failures=[...authoringFailures,...accepted.flatMap(line=>validateAlignment(line,{lexemes}).map(error=>`${line.id}: ${error}`))];
  const pending=lines.length-accepted.length;
  if (options.check && pending && !options.allowPending) failures.push(`${pending} of ${lines.length} lines have missing authored alignment. Run --propose --accept or import authored JSON with --proposals file.json --accept.`);
  if (failures.length) throw new Error(failures.slice(0,40).join('\n'));
  const summary={lines:lines.length,reviewed:lines.filter(line=>line.alignmentStatus==='reviewed').length,authored:lines.filter(line=>line.alignmentStatus==='authored').length,pending};
  process.stdout.write(`Alignments: ${summary.reviewed} reviewed fixtures, ${summary.authored} authored awaiting native review, ${summary.pending} pending of ${summary.lines}.\n`);
  return summary;
}

export function parseArguments(args) {
  const options={};
  const booleans={'--check':'check','--allow-pending':'allowPending','--review':'review','--propose':'propose','--accept':'accept','--author-templates':'authorTemplates'};
  const strings={'--proposals':'proposals','--review-path':'reviewPath','--codex-bin':'codexBin','--codex':'codexBin','--filter':'filter','--root':'root'};
  for (let index=0;index<args.length;index++) {
    const argument=args[index];
    if (booleans[argument]) options[booleans[argument]]=true;
    else if (strings[argument]) {if (!args[index+1]) throw new Error(`Missing value for ${argument}.`); options[strings[argument]]=args[++index];}
    else if (['--batch-size','--limit','--concurrency','--timeout-ms','--retries'].includes(argument)) {
      const value=Number(args[++index]),minimum=argument==='--retries'?0:1;
      if (!Number.isInteger(value)||value<minimum||(argument==='--concurrency'&&value>16)||(argument==='--retries'&&value>3)) throw new Error(`Invalid ${argument}.`);
      options[{'--limit':'limit','--batch-size':'batchSize','--concurrency':'concurrency','--timeout-ms':'timeoutMs','--retries':'retries'}[argument]]=value;
    } else throw new Error(`Unknown argument ${argument}.`);
  }
  return options;
}

if (process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  try { await runAlignment(parseArguments(process.argv.slice(2))); }
  catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode=1; }
}
