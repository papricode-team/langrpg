import { createHash } from 'node:crypto';
import { tokenize, tokenTexts } from './content-tokenizer.mjs';

export function alignmentHash(line) {
  return createHash('sha256').update(JSON.stringify([line.de.text, line.support.en?.text ?? null, line.support.tr?.text ?? null])).digest('hex');
}

const surface = value => value.normalize('NFC').toLocaleLowerCase('de-DE');

/** Every German token must have an authored pair or an explicit reviewed omission. */
export function validateAlignment(line, { lexemes = new Map(), requireReviewed = true } = {}) {
  const failures = [];
  if (!line?.de || typeof line.de.text !== 'string') return ['Missing German text.'];
  const checkTokens = (value, name) => {
    if (!value || typeof value.text!=='string' || JSON.stringify(value.tokens) !== JSON.stringify(tokenize(value.text))) failures.push(`${name}: token offsets do not match the unchanged text.`);
  };
  checkTokens(line.de, 'de');
  if (!line.support || !Object.keys(line.support).length) failures.push('No support translation.');
  for (const [language, value] of Object.entries(line.support ?? {})) {
    checkTokens(value, language);
    if (requireReviewed && !['reviewed','authored'].includes(line.alignmentStatus)) failures.push(`${language}: alignment is awaiting authoring.`);
    if (!Array.isArray(value.align)) { failures.push(`${language}: missing alignment.`); continue; }
    const german = new Set(), claimed = new Map(), pairs = new Set();
    for (const pair of value.align) {
      if (!Array.isArray(pair) || pair.length !== 2 || !pair.every(Number.isInteger) || pair[0] < 0 || pair[0] >= line.de.tokens.length || pair[1] < 0 || pair[1] >= value.tokens.length) {
        failures.push(`${language}: out-of-range alignment ${JSON.stringify(pair)}.`); continue;
      }
      const key = pair.join(':');
      if (pairs.has(key)) failures.push(`${language}: duplicate pair ${key}.`);
      pairs.add(key); german.add(pair[0]);
      if (!claimed.has(pair[1])) claimed.set(pair[1], new Set());
      claimed.get(pair[1]).add(pair[0]);
    }
    for (const [index, indices] of claimed) if (indices.size > 3) failures.push(`${language}: support token ${index} is claimed by more than three German tokens.`);
    const omissions = value.untranslated ?? {};
    for (const [key, reason] of Object.entries(omissions)) {
      const index = Number(key);
      if (!/^\d+$/.test(key) || !Number.isInteger(index) || index >= line.de.tokens.length || typeof reason !== 'string' || !reason.trim()) failures.push(`${language}: invalid untranslated token ${key}.`);
      if (german.has(index)) failures.push(`${language}: token ${key} is both aligned and untranslated.`);
    }
    for (let index = 0; index < line.de.tokens.length; index++) if (!german.has(index) && !omissions[index]) failures.push(`${language}: German token ${index} has no pair or reviewed omission.`);
  }
  const words = tokenTexts(line.de);
  for (const [key, id] of Object.entries(line.glosses ?? {})) {
    const index = Number(key), lexeme = lexemes.get(id);
    if (!/^\d+$/.test(key) || !lexeme || !words[index]) { failures.push(`Invalid lexeme reference at token ${key}.`); continue; }
    const forms = [lexeme.lemma, lexeme.articleForm, lexeme.plural, ...(lexeme.surfaceForms ?? [])].filter(Boolean);
    if (!forms.some(form => surface(form) === surface(words[index]))) failures.push(`Lexeme ${id} does not attest token ${key}: ${words[index]}.`);
  }
  return failures;
}

export function applyCachedAlignment(line, cache) {
  const result = structuredClone(line), entry = cache.entries?.[alignmentHash(line)];
  for (const value of Object.values(result.support)) {value.align=[];delete value.untranslated;}
  if (!entry || !['reviewed','authored'].includes(entry.status)) { result.alignmentStatus = 'pending'; return result; }
  for (const [language, value] of Object.entries(result.support)) {
    const authored = entry.support?.[language];
    if (!authored || authored.text !== value.text) { result.alignmentStatus = 'pending'; return result; }
    value.align = authored.align;
    if (authored.untranslated) value.untranslated = authored.untranslated;
  }
  result.alignmentStatus = entry.status;
  return result;
}

/** Strip literal instruction wrappers by renumbering existing authored pairs only. */
export function projectAuthoredAlignment(oldLine,newLine,cache) {
  try {
    if(oldLine?.de?.text!==newLine?.de?.text)return null;
    const oldLanguages=Object.keys(oldLine.support??{}).sort(),newLanguages=Object.keys(newLine.support??{}).sort();
    if(!oldLanguages.length||JSON.stringify(oldLanguages)!==JSON.stringify(newLanguages))return null;
    const derivedFromHash=alignmentHash(oldLine),entry=cache.entries?.[derivedFromHash];
    if(!entry||!['reviewed','authored'].includes(entry.status))return null;
    const original=applyCachedAlignment(oldLine,cache);
    if(validateAlignment({...original,glosses:undefined}).length)return null;
    const support={};
    for(const language of newLanguages) {
      const previous=original.support[language],next=newLine.support[language];
      if(!next||typeof next.text!=='string'||!next.text||!next.tokens?.length||JSON.stringify(next.tokens)!==JSON.stringify(tokenize(next.text)))return null;
      let projected;
      // An identical substring can occur twice; only an occurrence retaining every
      // claimed source token is eligible. Text and punctuation are never rewritten.
      for(let start=previous.text.indexOf(next.text);start>=0;start=previous.text.indexOf(next.text,start+1)) {
        const end=start+next.text.length;
        const retained=previous.tokens.map(([tokenStart,tokenEnd],index)=>({index,span:[tokenStart-start,tokenEnd-start]}))
          .filter(({span:[tokenStart,tokenEnd]})=>tokenStart>=0&&tokenEnd<=end-start);
        if(JSON.stringify(retained.map(token=>token.span))!==JSON.stringify(next.tokens))continue;
        const indices=new Map(retained.map((token,index)=>[token.index,index]));
        if(previous.align.some(([,target])=>!indices.has(target)))continue;
        projected={...structuredClone(next),align:previous.align.map(([source,target])=>[source,indices.get(target)])};
        if(previous.untranslated)projected.untranslated=structuredClone(previous.untranslated);
        else delete projected.untranslated;
        break;
      }
      if(!projected)return null;
      support[language]=projected;
    }
    if(validateAlignment({...newLine,support,glosses:undefined,alignmentStatus:'authored'}).length)return null;
    return {...structuredClone(entry),status:'authored',authorship:entry.authorship??'codex',nativeReview:'pending',derivedFromHash,support};
  }catch {return null;}
}

/** Original lexical labels explicitly bind the whole lemma to its whole meaning. */
export function authorLexicalTemplates(artifact, cache) {
  const lines=new Map(artifact.records.lines.map(record=>[record.id,record.body]));
  const lexemes=new Map(artifact.records.lexemes.map(record=>[record.id,record.body]));
  const entries={...cache.entries}; let authored=0;
  for (const exercise of artifact.records.exercises) {
    if (!exercise.slug.startsWith('lex-') || exercise.body.kind!=='word') continue;
    const word=lexemes.get(exercise.body.targetWordId),line=lines.get(exercise.body.exampleLineId);
    if (!word || !line || line.support.en.text !== word.meaning.en) continue;
    if (line.support.tr && line.support.tr.text !== word.meaning.tr) continue;
    const normalize=value=>value.normalize('NFC').toLocaleLowerCase('de-DE').trim();
    const text=normalize(line.de.text),forms=[word.lemma,word.articleForm].filter(Boolean);
    let start;
    if (forms.some(form=>normalize(form)===text)) start=0;
    else if (word.article && forms.some(form=>normalize(`${word.article} ${form}`)===text)) start=1;
    else continue;
    if (line.de.tokens.length-start<1 || line.de.tokens.length-start>3) continue;
    const key=alignmentHash(line);
    if (['reviewed','authored'].includes(entries[key]?.status)) continue;
    const candidate=structuredClone(line); candidate.alignmentStatus='authored';
    for (const value of Object.values(candidate.support)) {
      value.align=[]; value.untranslated={};
      for (let german=start;german<line.de.tokens.length;german++) for (let support=0;support<value.tokens.length;support++) value.align.push([german,support]);
      if (start===1) value.untranslated[0]='The German grammatical article is not part of the authored lexical meaning.';
    }
    const failures=validateAlignment(candidate,{lexemes});
    if (failures.length) throw new Error(`${exercise.slug}: ${failures.join('\n')}`);
    entries[key]={status:'authored',authorship:'codex',sourceTemplate:'lexical-label-v1',nativeReview:'pending',support:candidate.support}; authored++;
  }
  return {cache:{version:1,entries},authored};
}

export function alignmentReviewTSV(lines) {
  const cell = value => String(value ?? '').replaceAll('\t', ' ').replaceAll('\r', ' ').replaceAll('\n', ' ');
  const rows = [['id', 'status', 'language', 'german', 'support', 'indexed German tokens', 'indexed support tokens', 'pairs', 'untranslated']];
  for (const line of lines) for (const [language, value] of Object.entries(line.support)) rows.push([
    line.id, line.alignmentStatus, language, line.de.text, value.text,
    tokenTexts(line.de).map((word, index) => `${index}:${word}`).join(' | '),
    tokenTexts(value).map((word, index) => `${index}:${word}`).join(' | '),
    JSON.stringify(value.align ?? []), JSON.stringify(value.untranslated ?? {}),
  ]);
  return rows.map(row => row.map(cell).join('\t')).join('\n') + '\n';
}

/** A constrained build-time proposal; proposals remain pending until reviewed. */
export function alignmentPrompt(lines) {
  return `Align each German token to the English and Turkish tokens expressing its meaning. Return JSON only: {"lines":[{"id":"...","support":{"en":{"align":[[0,0]],"untranslated":{"1":"reason"}},"tr":{"align":[],"untranslated":{}}}}]}. Index pairs are integers. A token may map to several tokens or share a token with at most three German tokens. Every German token must be aligned or explicitly untranslated with a linguistic reason. Do not change text or tokenization. If a translation is absent, omit that language.\n${JSON.stringify(lines.map(line => ({ id: line.id, de: {text:line.de.text,tokens:tokenTexts(line.de)}, support: Object.fromEntries(Object.entries(line.support).map(([language, value]) => [language, {text:value.text,tokens:tokenTexts(value)}])) })))} `;
}
