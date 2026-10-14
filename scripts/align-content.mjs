#!/usr/bin/env node
/** Build-time Codex authoring, persistent text hashes, validation and review export. */
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { alignmentHash, alignmentPrompt, alignmentReviewTSV, validateAlignment, applyCachedAlignment, authorLexicalTemplates } from './content-alignment.mjs';

export const proposalSchema = {
  type:'object', additionalProperties:false, required:['lines'], properties:{lines:{type:'array',items:{
    type:'object',additionalProperties:false,required:['id','support'],properties:{id:{type:'string'},support:{
      type:'object',additionalProperties:false,properties:Object.fromEntries(['en','tr'].map(language=>[language,{
        type:'object',additionalProperties:false,required:['align','untranslated'],properties:{
          align:{type:'array',items:{type:'array',minItems:2,maxItems:2,items:{type:'integer',minimum:0}}},
          untranslated:{type:'object',additionalProperties:{type:'string'}},
        },
      }])),
    }},
  }}}};

export async function proposeWithCodex(lines, { executable=process.env.CODEX_BIN ?? 'codex', timeoutMs=180000 }={}) {
  const directory=await mkdtemp(resolve(tmpdir(),'atlas-align-'));
  try {
    const schemaPath=resolve(directory,'schema.json'),outputPath=resolve(directory,'proposal.json');
    await writeFile(schemaPath,JSON.stringify(proposalSchema));
    await new Promise((accept,reject)=>{
      const child=spawn(executable,['exec','--sandbox','read-only','--skip-git-repo-check','--ephemeral','--output-schema',schemaPath,'--output-last-message',outputPath,'-'],{stdio:['pipe','ignore','pipe']});
      let diagnostics=''; child.stderr.on('data',chunk=>{ diagnostics=(diagnostics+chunk.toString()).slice(-4000); });
      const timer=setTimeout(()=>{ child.kill('SIGTERM'); reject(new Error('Codex alignment batch timed out.')); },timeoutMs);
      child.on('error',error=>{clearTimeout(timer);reject(new Error(`Codex authoring unavailable: ${error.message}. Supply validated JSON with --proposals instead.`));});
      child.on('close',code=>{clearTimeout(timer);code===0?accept():reject(new Error(`Codex authoring exited ${code}: ${diagnostics}`));});
      child.stdin.on('error',()=>{}); child.stdin.end(alignmentPrompt(lines));
    });
    return JSON.parse(await readFile(outputPath,'utf8'));
  } finally { await rm(directory,{recursive:true,force:true}); }
}

export function acceptProposals(lines, proposals, cache, {accept=false,author='codex'}={}) {
  const byID=new Map(lines.map(line=>[line.id,line])),errors=[],entries={...cache.entries};
  if (!Array.isArray(proposals?.lines)) throw new Error('Proposal JSON must contain a lines array.');
  const seen=new Set();
  for (const proposal of proposals.lines) {
    const line=byID.get(proposal.id);
    if (!line || seen.has(proposal.id)) {errors.push(`Unknown or repeated line ${proposal.id}.`);continue;}
    seen.add(proposal.id);
    const candidate=structuredClone(line); candidate.alignmentStatus='reviewed';
    for (const [language,value] of Object.entries(candidate.support)) {
      const authored=proposal.support?.[language];
      if (!authored) {errors.push(`${line.id}: missing ${language} proposal.`);continue;}
      value.align=authored.align; value.untranslated=authored.untranslated ?? {};
    }
    for (const language of Object.keys(proposal.support ?? {})) if (!candidate.support[language]) errors.push(`${line.id}: unexpected ${language} proposal.`);
    const failures=validateAlignment({...candidate,glosses:undefined});
    if (failures.length) {errors.push(...failures.map(failure=>`${line.id}: ${failure}`));continue;}
    entries[alignmentHash(line)]={status:accept?'authored':'proposed',authorship:author,nativeReview:'pending',support:candidate.support};
  }
  if (errors.length) throw new Error(errors.join('\n'));
  return {version:1,entries};
}

export async function runAlignment(options={}) {
  const root=options.root ?? resolve(import.meta.dirname,'..');
  const artifact=JSON.parse(await readFile(resolve(root,'server/content.json'),'utf8'));
  const cachePath=resolve(root,'content/alignments/reviewed.json');
  let cache=JSON.parse(await readFile(cachePath,'utf8'));
  const saveCache=async value=>{
    const current=JSON.parse(await readFile(cachePath,'utf8'));
    const merged={version:1,entries:{...current.entries,...value.entries}};
    await writeFile(cachePath,JSON.stringify(merged,null,2)+'\n');
    return merged;
  };
  const lexemes=new Map(artifact.records.lexemes.map(record=>[record.id,record.body]));
  let lines=artifact.records.lines.map(record=>applyCachedAlignment(record.body,cache));
  if (options.authorTemplates) {
    const authored=authorLexicalTemplates(artifact,cache);
    cache=await saveCache(authored.cache);
    lines=lines.map(line=>applyCachedAlignment(line,cache));
    process.stdout.write(`Authored ${authored.authored} distinct lexical-label templates from explicit source meanings.\n`);
  }
  if (options.proposals) {
    cache=acceptProposals(lines,JSON.parse(await readFile(resolve(options.proposals),'utf8')),cache,{accept:options.accept,author:'codex'});
    cache=await saveCache(cache);
    lines=lines.map(line=>applyCachedAlignment(line,cache));
  }
  if (options.propose) {
    let pending=artifact.records.lines.filter(record=>!['reviewed','authored'].includes(record.body.alignmentStatus));
    if (options.filter==='story') pending=pending.filter(record=>record.body.questId || record.body.npcId || record.slug.startsWith('act:') || record.slug.startsWith('clue:') || record.slug.startsWith('journal:') || record.slug.startsWith('ambient:'));
    else if (options.filter) pending=pending.filter(record=>record.slug.includes(options.filter));
    const unique=new Map(pending.map(record=>[alignmentHash(record.body),record.body]));
    pending=[...unique.values()].slice(0,options.limit ?? Infinity);
    const batchSize=options.batchSize ?? 12;
    for (let index=0;index<pending.length;index+=batchSize) {
      const batch=pending.slice(index,index+batchSize);
      const proposals=await proposeWithCodex(batch,{executable:options.codexBin});
      cache=acceptProposals(batch,proposals,cache,{accept:options.accept,author:'codex'});
      // Save after each batch; a later interruption preserves successful work.
      cache=await saveCache(cache);
      process.stdout.write(`Authored ${index+batch.length}/${pending.length} pending lines with Codex.\n`);
    }
    lines=lines.map(line=>applyCachedAlignment(line,cache));
  }
  if (options.review) {
    const output=resolve(root,options.reviewPath ?? 'content/review/alignment.tsv');
    await mkdir(resolve(output,'..'),{recursive:true});
    await writeFile(output,alignmentReviewTSV(lines));
    process.stdout.write(`Review sheet: ${output}\n`);
  }
  const accepted=lines.filter(line=>['reviewed','authored'].includes(line.alignmentStatus));
  const failures=accepted.flatMap(line=>validateAlignment(line,{lexemes}).map(error=>`${line.id}: ${error}`));
  const pending=lines.length-accepted.length;
  if (options.check && pending && !options.allowPending) failures.push(`${pending} of ${lines.length} lines have missing authored alignment. Run --propose --accept or import authored JSON with --proposals file.json --accept.`);
  if (failures.length) throw new Error(failures.slice(0,40).join('\n'));
  const summary={lines:lines.length,reviewed:lines.filter(line=>line.alignmentStatus==='reviewed').length,authored:lines.filter(line=>line.alignmentStatus==='authored').length,pending};
  process.stdout.write(`Alignments: ${summary.reviewed} reviewed fixtures, ${summary.authored} authored awaiting native review, ${summary.pending} pending of ${summary.lines}.\n`);
  if (options.proposals || options.propose || options.authorTemplates) {
    const {exportContent}=await import('./export-content.mjs');
    await exportContent(root);
  }
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
    else if (['--batch-size','--limit'].includes(argument)) {
      const value=Number(args[++index]); if (!Number.isInteger(value)||value<1) throw new Error(`Invalid ${argument}.`);
      options[argument==='--limit'?'limit':'batchSize']=value;
    } else throw new Error(`Unknown argument ${argument}.`);
  }
  return options;
}

if (process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  try { await runAlignment(parseArguments(process.argv.slice(2))); }
  catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode=1; }
}
