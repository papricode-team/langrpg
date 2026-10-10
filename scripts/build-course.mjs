#!/usr/bin/env node
/** Build the canonical client/server course together. Imported dictionary facts are kept separate from authored teaching. */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { grammarLessons, passages, writingLessons, checkpoints } from './course-lessons.mjs';
import { createLexemeMapper } from './course-word-mapping.mjs';
import { createListeningDistractorPicker, spokenWord } from './course-listening-distractors.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = async path => JSON.parse(await readFile(resolve(root, path), 'utf8'));
const levels = ['A1','A2','B1'];
let lexicon = await read('web/src/data/course-lexicon.json');
const labels = await read('scripts/course-topics.json');
// Small story/skill domain additions are genuine headwords, outside the reference count.
for(const [lemma,english,level,pos,article,plural] of [['weg','away','A1','adv'],['Sitzung','meeting; session','B1','noun','die','Sitzungen'],['Gasthaus','inn; guesthouse','A2','noun','das','Gasthäuser'],['zustimmen','to agree; give consent','B1','verb'],['Route','route','A2','noun','die','Routen']]) {
  if(!lexicon.some(word=>word.lemma===lemma))lexicon.push({id:lemma.toLowerCase()+'-'+pos,lemma,english,level,pos,...(article?{article}:{}),...(plural?{plural}:{}),topic:pos==='verb'?'actions':pos==='adv'?'connections':'everyday',sourceId:'project-lexical-editorial',sourceUrl:`https://en.wiktionary.org/wiki/${encodeURIComponent(lemma)}#German`,placement:'story/skill-domain'});
}
const baseAudit = await read('scripts/course-reference-audit.json');
let supplement = {aliases:[],lexemes:[]};
try { supplement = await read('scripts/course-reference-supplement.json'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
// Unit symbols belong to the reference-form lessons, not invented noun headwords.
lexicon=lexicon.filter(word=>word.lemma!=='h');
supplement.aliases.push({form:'h',parentLemma:'Stunde',level:'A1',kind:'abbreviation',english:'hour (unit abbreviation)'});
const slug = text => text.toLowerCase().replaceAll('ä','ae').replaceAll('ö','oe').replaceAll('ü','ue').replaceAll('ß','ss').normalize('NFKD').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
for (const addition of supplement.lexemes ?? []) {
  if (lexicon.some(word => word.lemma === addition.lemma)) continue;
  const id=addition.id ?? `${slug(addition.lemma)}-${addition.pos}`;
  const existing=lexicon.find(word=>word.id===id);
  if(existing) {
    // Glace/Glacé are spelling variants, not two artificially counted ice-cream targets.
    supplement.aliases.push({form:addition.lemma,parentLemma:existing.lemma,level:addition.level,kind:'spelling',english:addition.english});
    if(addition.article && addition.article!==existing.article)supplement.aliases.push({form:`${addition.article} ${addition.lemma}`,parentLemma:existing.lemma,level:addition.level,kind:'spelling',english:addition.english});
    continue;
  }
  lexicon.push({ ...addition, id, topic:addition.topic ?? (addition.pos === 'verb' ? 'actions' : addition.pos === 'adj' ? 'describing' : 'everyday'), sourceId:'project-lexical-editorial', sourceUrl:addition.sourceUrl ?? `https://en.wiktionary.org/wiki/${encodeURIComponent(addition.lemma)}#German`,placement:'reference-linked' });
}
// Apply small factual editorial corrections without changing persisted identities.
const builtInCorrections={alle:'all (plural)',offen:'open',gleich:'same; immediately',Fall:'case; fall',meinen:'to mean; think; believe',Ordnung:'order; arrangement',vorbei:'past; over',Bewerbung:'application (job or position)',Schalter:'switch; counter (service desk)',Empfänger:'recipient; receiver',Verkäufer:'seller; sales assistant (male)',Sender:'transmitter; broadcaster',Zuschauer:'spectator; viewer (male)',Hörer:'telephone receiver; listener (male)',Maler:'painter (male)',Angabe:'information; statement; specification',Sänger:'singer (male)',Entwicklung:'development',Zuhörer:'listener (male)'};
for(const word of lexicon) {
  if(builtInCorrections[word.lemma])word.english=builtInCorrections[word.lemma];
  if(word.lemma==='offen')word.pos='adj';
  if(word.lemma==='alle')word.pos='det';
  const override=(supplement.overrides ?? []).find(entry=>entry.lemma===word.lemma);
  if(override) { const {lemma,...fields}=override;Object.assign(word,fields); }
}
// These are real grammatical homonyms, not duplicate semantic targets.
for(const [lemma,english] of [['sein','his; its (possessive)'],['ihr','her; their (possessive)']])lexicon.push({id:`${lemma}-det`,lemma,english,level:'A1',pos:'det',topic:'connections',sourceId:'project-lexical-editorial',sourceUrl:`https://en.wiktionary.org/wiki/${lemma}#German`,placement:'reference-linked'});
for(const [lemma,english,level,article,plural] of [['Bitte','request','A1','die','Bitten'],['Essen','food; meal','A1','das'],['Morgen','morning','A1','der','Morgen'],['Wiedersehen','reunion; seeing each other again','A1','das'],['Link','link; hyperlink','A2','der','Links'],['Halt','stop; support','B1','der'],['Husten','cough','B1','der'],['Kosten','costs; expenses (plural)','B1','die'],['Mal','time; occasion (an occurrence)','B1','das','Male'],['Recht','right; law','B1','das','Rechte'],['Schaden','damage; loss','B1','der','Schäden'],['Vertrauen','trust; confidence','B1','das']]) {
  if(lexicon.some(word=>word.lemma===lemma && word.pos==='noun'))continue;
  lexicon.push({id:`${slug(lemma)}-noun`,lemma,english,level,pos:'noun',article,...(plural?{plural}:{}),topic:'everyday',sourceId:'project-lexical-editorial',sourceUrl:`https://en.wiktionary.org/wiki/${encodeURIComponent(lemma)}#German`,placement:'reference-linked'});
}
lexicon.push({id:'sie-formal-pron',lemma:'Sie',english:'you (formal singular or plural)',level:'A1',pos:'pron',topic:'connections',sourceId:'project-lexical-editorial',sourceUrl:'https://en.wiktionary.org/wiki/Sie#German',placement:'reference-linked'});
const lexemeById = new Map(lexicon.map(word => [word.id,word]));
// Adjectival nouns change their ending after a definite article.
for(const word of lexicon)if(['Beamter','Bekannter','Deutscher','Vorsitzender','Betroffener'].includes(word.lemma)) {
  word.articleForm=word.lemma.slice(0,-1);
  word.surfaceForms=[...new Set([...(word.surfaceForms??[]),word.articleForm])];
}
const possessive=lexemeById.get('ihr-det');
if(possessive)possessive.surfaceForms=[...new Set([...(possessive.surfaceForms??[]),'Ihr','Ihre','Ihrem','Ihren','Ihres','Ihnen'])].filter(form=>form!=='Ihnen');
const aliases = [];
for (const originalAlias of supplement.aliases ?? []) {
  const alias={...originalAlias};
  if(alias.form==='selb')alias.parentLemma='derselbe';
  const desiredPos=alias.parentPos ?? (alias.form==='seine' || alias.form==='ihre' ? 'det' : undefined);
  const parent = alias.parentId ? lexemeById.get(alias.parentId) : lexicon.find(word => word.lemma === alias.parentLemma && (!desiredPos || word.pos===desiredPos));
  if (!parent) throw new Error(`Alias parent missing: ${alias.form} → ${alias.parentLemma}`);
  if(parent.pos==='noun' && ['spelling','regional','inflection'].includes(alias.kind))alias.form=alias.form[0].toUpperCase()+alias.form.slice(1);
  if(alias.form==='st')alias.form='St.';
  aliases.push({...alias,parentId:parent.id});
  parent.aliases ??= [];
  parent.aliases.push({form:alias.form,kind:alias.kind,english:alias.english});
}
const mannerParent=lexicon.find(word=>word.lemma==='teilweise');
if(mannerParent)aliases.push({form:'-weise',parentLemma:mannerParent.lemma,parentId:mannerParent.id,level:'B1',kind:'affix',english:'in a particular way; manner (as in teilweise)'});
const awayParent=lexicon.find(word=>word.lemma==='weg');
if(awayParent)aliases.push({form:'weg-',parentLemma:'weg',parentId:awayParent.id,level:'B1',kind:'affix',english:'away (as in weggehen)'});
const wordsIn = createLexemeMapper(lexicon);
const units = [], grammar = [], exercises = [];
const exercisesById = new Map();
const addExercise = exercise => {
  if (exercisesById.has(exercise.id)) throw new Error(`Duplicate exercise ${exercise.id}`);
  exercise.wordIds ??= wordsIn(exercise.german);
  exercises.push(exercise);exercisesById.set(exercise.id,exercise);
};
const addUnit = unit => {
  const exs = unit.exerciseIds.map(id=>exercisesById.get(id));
  if(exs.some(ex=>!ex))throw new Error(`Missing exercise in ${unit.id}`);
  units.push({...unit,wordIds:unit.wordIds ?? [...new Set(exs.flatMap(ex=>ex.wordIds))],reward:unit.reward ?? 50,requiredItemIds:[...new Set(exs.map(ex=>ex.itemId))],requiredWordIds:unit.requiredWordIds ?? [],requiredExerciseIds:[...unit.exerciseIds]});
};
const learnNote = word => `${spokenWord(word)} — ${word.english}.${word.plural ? ` Plural: ${word.plural}.` : ''}${word.forms?.length ? ` Forms: ${word.forms.join('; ')}.` : ''}`;
// Recognition distractors share a part of speech where possible, but never duplicate the target gloss.
const distractors = word => {
  const result = [];
  const baseWords = new Set(word.english.toLowerCase().match(/[a-z]{3,}/g) ?? []);
  const pool = lexicon.filter(other=>other.id !== word.id && other.level === word.level && other.pos === word.pos);
  let offset = [...word.id].reduce((n,c)=>n+c.charCodeAt(0),0) % Math.max(pool.length,1);
  for(let i=0;i<pool.length && result.length<3;i++) {
    const value = pool[(i+offset)%pool.length].english;
    if(value === word.english || result.includes(value))continue;
    const tokens = value.toLowerCase().match(/[a-z]{3,}/g) ?? [];
    if(tokens.some(token=>baseWords.has(token)))continue;
    result.push(value);
  }
  for(const value of ['a postal stamp','to repair a clock','unfortunately','a quiet room'])if(result.length<3 && value !== word.english && !result.includes(value))result.push(value);
  return result.slice(0,3);
};
const pickListeningDistractors = createListeningDistractorPicker(lexicon);
const germanDistractors = word => pickListeningDistractors(word).map(spokenWord);
for(const level of levels) {
  for(const topic of Object.keys(labels)) {
    const words = lexicon.filter(word=>word.level===level && word.topic===topic);
    for(let offset=0;offset<words.length;offset+=12) {
      const batch=words.slice(offset,offset+12), number=Math.floor(offset/12)+1, unitId=`course-${level.toLowerCase()}-${topic}-${number}`, exerciseIds=[];
      for(const word of batch) {
        const note=learnNote(word), german=spokenWord(word), options=[word.english,...distractors(word)], targetWordId=word.id,itemId=`word-${word.id}`;
        const alternatives = [...new Set([...(word.article ? [german,german[0].toUpperCase()+german.slice(1)] : []),...(word.aliases ?? []).filter(alias=>['spelling','regional'].includes(alias.kind)).map(alias=>alias.form)])].filter(answer=>answer!==word.lemma);
        const recognition={id:`lex-${word.id}-recognition`,itemId,mode:'choice',level,kind:'word',unitId,targetWordId,wordIds:[word.id],prompt:`What does “${german}” mean?`,german,english:word.english,answer:word.english,options,hint:note,explanation:note};
        const listeningContext=word.id==='sie-formal-pron' ? 'Guten Tag, Frau Berger. Wie heißen Sie?' : word.id==='sie-pron' ? 'Marta ist hier. Sie arbeitet im Café.' : german;
        const listeningAnswer=word.id==='sie-formal-pron' ? 'Sie (höfliche Anrede)' : word.id==='sie-pron' ? 'sie (Marta)' : german;
        const listeningOptions=[listeningAnswer,...germanDistractors(word)];
        const listening={...recognition,id:`lex-${word.id}-listening`,mode:'listen',german:listeningContext,wordIds:[...new Set([word.id,...(listeningContext!==german?wordsIn(listeningContext):[])])],answer:listeningAnswer,options:[...new Set(listeningOptions)],prompt:listeningContext===german?'Listen, then choose the German word or expression you hear.':'Listen to the sentence. Choose the German pronoun in its context.',hint:`Replay the audio. ${note}`};
        const caseSensitive=word.pos==='noun' || word.lemma==='Sie';
        const production={id:`lex-${word.id}-production`,itemId,mode:'type',level,kind:'word',unitId,targetWordId,wordIds:[word.id],prompt:`Write the German ${word.pos === 'noun' ? 'noun' : word.pos === 'verb' ? 'infinitive' : 'word or expression'} for “${word.english}”.${word.article ? ' The article is optional; capitalize the noun.' : ''}`,german,english:word.english,answer:word.lemma,acceptedAnswers:alternatives,...(caseSensitive?{caseSensitive:true}:{}),hint:note,explanation:note};
        for(const exercise of [recognition,listening,production]){addExercise(exercise);exerciseIds.push(exercise.id);}
      }
      addUnit({id:unitId,level,title:`${labels[topic]} · ${number}`,topic,grammarIds:[],summary:`${batch.length} useful headwords. Notice their meanings and forms, hear them, then retrieve the German yourself. Complete this route in short batches.`,exerciseIds,wordIds:batch.map(word=>word.id),requiredWordIds:batch.map(word=>word.id),reward:40});
    }
  }
}
const makeTask = (unitId,level,kind,index,mode,prompt,answer,options,context='',acceptedAnswers=[],explanation='') => {
  const id=`${unitId}-exercise-${index}`,german=context || answer;
  return {id,itemId:`${unitId}-item-${index}`,mode,level,kind,unitId,prompt,german,english:prompt,answer,...(options ? {options} : {}),...(['type','sentence'].includes(mode)?{caseSensitive:true}:{}),...(mode==='sentence'?{tokens:answer.split(' ')}:{}),...(acceptedAnswers.length?{acceptedAnswers}:{}),hint:explanation || `Reference answer: ${answer}`,explanation:explanation || `A suitable answer is: ${answer}`};
};
for(const [id,level,title,explanation,examples,tasks] of grammarLessons) {
  const unitId=`course-${id}`,exerciseIds=[];
  grammar.push({id,level,title,explanation,examples:examples.map(([german,english])=>({german,english}))});
  tasks.forEach(([mode,prompt,answer,options,note],index)=>{
    const exercise=makeTask(unitId,level,'grammar',index+1,mode,prompt,answer,options,'',[],note ?? explanation);
    addExercise(exercise);exerciseIds.push(exercise.id);
  });
  addUnit({id:unitId,level,title,topic:'grammar',grammarIds:[id],summary:explanation,exerciseIds,reward:50});
}
for(const [id,level,kind,title,text,questions] of passages) {
  const unitId=`course-${id}`,exerciseIds=[];
  questions.forEach(([question,answer,options],index)=>{
    const mode=kind === 'listening' ? 'listen' : options ? 'choice' : 'type';
    const prompt=kind === 'reading' ? `Read the note.\n\n${text}\n\n${question}` : question;
    // All listening comprehension tasks remain choice so typed answer and listening evidence cannot be confused.
    let listeningOptions=options;
    if(kind === 'listening' && !options) {
      const target=lexicon.find(word=>word.lemma===answer);
      const special={Ada:['Lina','Marta','Greta'],blau:['rot','gelb','grün'],rechts:['links','geradeaus','zurück']};
      let candidates=lexicon.filter(word=>word.level===level && word.lemma!==answer && word.pos===(target?.pos ?? 'noun'));
      if(candidates.length<8)candidates=lexicon.filter(word=>word.lemma!==answer && word.pos===(target?.pos ?? 'noun'));
      const alternatives=special[answer] ?? candidates.slice(5,8).map(word=>word.lemma);
      listeningOptions=[answer,...alternatives];
    }
    const exercise=makeTask(unitId,level,kind,index+1,mode,prompt,answer,listeningOptions,text,[],`${text}\nThe detail you need is: ${answer}.`);
    addExercise(exercise);exerciseIds.push(exercise.id);
  });
  addUnit({id:unitId,level,title,topic:kind,grammarIds:[],summary:kind==='reading'?'Read a connected everyday text, locate its important details, and check the meaning.':'Hear a connected message, distinguish important details and infer what to do next. A transcript is supported practice.',exerciseIds,reward:60});
}
for(const [id,level,title,summary,tasks] of writingLessons) {
  const unitId=`course-${id}`,exerciseIds=[];
  tasks.forEach(([prompt,answer,accepted=[]],index)=>{
    const exercise=makeTask(unitId,level,'writing',index+1,'type',prompt,answer,undefined,'',accepted,`${summary}\nModel: ${answer}`);
    addExercise(exercise);exerciseIds.push(exercise.id);
  });
  addUnit({id:unitId,level,title,topic:'writing',grammarIds:[],summary,exerciseIds,reward:60});
}
for(const [id,level,title,readingText,readingQs,listeningText,listeningQs,writes] of checkpoints) {
  const unitId=`course-${id}`,exerciseIds=[];let index=0;
  for(const [question,answer,options] of readingQs) {
    const exercise=makeTask(unitId,level,'reading',++index,'choice',`Read the new text.\n\n${readingText}\n\n${question}`,answer,options,readingText,[],`${readingText}\nRelevant answer: ${answer}.`);
    addExercise(exercise);exerciseIds.push(exercise.id);
  }
  for(const [question,answer,options] of listeningQs) {
    const exercise=makeTask(unitId,level,'listening',++index,'listen',question,answer,options,listeningText,[],`${listeningText}\nRelevant answer: ${answer}.`);
    addExercise(exercise);exerciseIds.push(exercise.id);
  }
  for(const [prompt,answer,accepted=[]] of writes) {
    const exercise=makeTask(unitId,level,'writing',++index,'type',prompt,answer,undefined,'',accepted,`Use what you learned in a new situation. Model: ${answer}`);
    addExercise(exercise);exerciseIds.push(exercise.id);
  }
  addUnit({id:unitId,level,title:`${level} checkpoint · ${title}`,topic:'checkpoint',grammarIds:[],summary:'New connected reading and listening, followed by guided written transfer. This checkpoint records practice evidence; it does not certify proficiency or assess unrestricted writing.',exerciseIds,reward:90});
}
// Explicit reference extensions retain their form/POS relationship without pretending to add headwords.
for(const level of levels) {
  const guideId=`${level.toLowerCase()}-word-building`;
  const examples=level==='A1' ? [['Das ist ein anderer Weg.','That is a different route.'],['Gut, besser, am besten.','Good, better, best.'],['Wir müssen weitergehen.','We must continue walking.']] : level==='A2' ? [['Komm bitte her!','Please come here!'],['Ich gehe jetzt hin.','I am going there now.'],['Der Zug kommt zurück.','The train returns.']] : [['Ich habe die Frage missverstanden.','I misunderstood the question.'],['Teilweise ist der Weg nass.','The path is partly wet.'],['Das ist ein besonderer Tag.','That is a special day.']];
  grammar.push({id:guideId,level,title:'Recognizing forms and word families',explanation:'German changes endings to fit grammar and adds prefixes or suffixes to build related meanings. A printed stem such as besonder or best is a reference notation; use a complete form such as besonderer or am besten in a sentence. Learn the difference between a whole word, its grammatical form, and a building element.',examples:examples.map(([german,english])=>({german,english}))});
  const batch=aliases.filter(alias=>alias.level===level && ['abbreviation','affix','phrase','regional','spelling','inflection'].includes(alias.kind));
  for(let offset=0;offset<batch.length;offset+=8) {
    const group=batch.slice(offset,offset+8), unitId=`course-${level.toLowerCase()}-reference-forms-${Math.floor(offset/8)+1}`,exerciseIds=[];
    group.forEach((alias,index)=>{
      const parent=lexemeById.get(alias.parentId),meaning=alias.english ?? parent.english;
      const naturalExamples={'weiter-':'Wir müssen weitergehen.','her-':'Komm bitte her!','hin-':'Ich gehe jetzt hin.','zurück-':'Marta kommt morgen zurück.','aller-':'Das ist der allerbeste Plan.','bio-':'Ich kaufe Bio-Milch.','öko-':'Öko-Produkte sind umweltfreundlich.','doppel-':'Wir buchen ein Doppelzimmer.','einzel-':'Ich brauche ein Einzelzimmer.','elektro-':'Ein Elektroauto fährt leise.','haupt-':'Der Hauptbahnhof liegt im Zentrum.','herein-':'Komm bitte herein!','hinter-':'Der Hintereingang ist offen.','miss-':'Ich habe die Frage missverstanden.','ober-':'Die Wohnung liegt im Obergeschoss.','rauf-':'Komm bitte rauf!','raus-':'Die Katze läuft raus.','rück-':'Ich habe eine Rückfahrkarte.','schwieger-':'Meine Schwiegermutter kommt morgen.','sonder-':'Das ist ein Sonderangebot.','spezial-':'Emil braucht ein Spezialwerkzeug.','un-':'Der Plan ist unfair.','unter-':'Wir treffen uns im Untergeschoss.','vorbei-':'Lina kommt später vorbei.','wieder-':'Wir müssen den Weg wiederfinden.','zusammen-':'Wir müssen zusammenarbeiten.','über-':'Wir überqueren die Brücke.','-weise':'Teilweise ist der Weg nass.','weg-':'Wir gehen jetzt weg.',allerschönst:'Das ist die allerschönste Blume.',besonder:'Heute ist ein besonderer Tag.',selb:'Wir fahren mit demselben Zug.'};
      const context=naturalExamples[alias.form] ?? alias.form;
      const prompt=naturalExamples[alias.form] ? `Read: “${context}”\nWhat meaning does the element “${alias.form}” contribute?` : `In a German text, what does “${alias.form}” mean?`;
      const exercise=makeTask(unitId,level,'grammar',index+1,'choice',prompt,meaning,[meaning,...distractors({...parent,english:meaning})],context,[],`${alias.form} is ${alias.kind==='inflection'?'a grammatical form or stem':alias.kind==='abbreviation'?'an abbreviation':alias.kind==='affix'?'a word-building element':'a variant or expression'} related to ${parent.lemma}. ${meaning}.`);
      exercise.wordIds=alias.kind==='affix' ? wordsIn(context) : [parent.id];addExercise(exercise);exerciseIds.push(exercise.id);
    });
    addUnit({id:unitId,level,title:`Reference forms & variants · ${Math.floor(offset/8)+1}`,topic:'reference',grammarIds:[guideId],summary:'Learn useful grammatical forms, regional spellings, abbreviations and word-building elements without counting each as a new headword.',exerciseIds,reward:40});
  }
}
const oldManifest=await read('server/curriculum.json');
const contextWordIds={};
// Existing source content is parsed as data; no IDs, text or teaching behavior are changed.
const {quests:legacyQuests,npcs:legacyNPCs}=await import('../web/src/content.ts');
for(const quest of legacyQuests)for(const exercise of quest.exercises)contextWordIds[exercise.id]=wordsIn(exercise.german);
const activityWordIds={};
let activityBoards;
try {
  // Import pure scenario data with Node's type stripper; no DOM/game module is imported.
  const {activityScenarios,inventory,actionLabels}=await import('../web/src/activity-engine.ts');
  activityBoards={scenarios:activityScenarios.map(({id,activityId,level,exerciseId,board})=>({id,activityId,level,exerciseId,board})),prices:Object.fromEntries(Object.entries(inventory).map(([id,item])=>[id,item.price??0]))};
  for(const scenario of activityScenarios) {
    const boardStrings=[];
    if(scenario.board.kind==='detective')boardStrings.push(...scenario.board.cards.map(card=>card.german),...scenario.board.slots.map(slot=>slot.german));
    if(scenario.board.kind==='delivery')boardStrings.push(scenario.board.goalName,scenario.board.checkpointName,scenario.board.parcel,...scenario.board.directions);
    if(scenario.board.stock)boardStrings.push(...scenario.board.stock.map(id=>inventory[id]?.german ?? ''));
    const ids=wordsIn([scenario.german,...boardStrings].join(' '));
    activityWordIds[scenario.id]=ids;
    const key=`${scenario.activityId}:${scenario.level}`;activityWordIds[key]=[...new Set([...(activityWordIds[key]??[]),...ids])].sort();
  }
} catch (error) { if(error.code!=='ERR_MODULE_NOT_FOUND') console.warn('Activity mappings not available:',error.message); }
const npcWordIds={};
for(const npc of legacyNPCs)npcWordIds[npc.id]=wordsIn(npc.greeting);
const normalizeReference=text=>text.toLowerCase().replaceAll('ß','ss').replace(/\.$/,'');
const knownForms=new Set([...lexicon.map(word=>normalizeReference(word.lemma)),...aliases.map(alias=>normalizeReference(alias.form))]);
const referenceCoverage=baseAudit.map(audit=>{
  const remaining=audit.unmatchedNormalizedForms.filter(form=>!knownForms.has(form));
  const excluded=(supplement.exclusions??[]).filter(exclusion=>exclusion.level===audit.level && remaining.includes(normalizeReference(exclusion.form)));
  return {...audit,mappedForms:audit.normalizedReferenceForms-remaining.length,remainingForms:remaining,exclusions:excluded,unmatchedNormalizedForms:undefined,method:'Case-fold + Swiss ß/ss normalization. Mapped forms include headwords, linked variants/inflections and authored word-building tasks; this is not sense-complete or proficiency credit.'};
});
const sources=[
 {id:'wiktionary-kaikki',title:'English Wiktionary German lexical facts, via Kaikki/Wiktextract',url:'https://kaikki.org/dictionary/German/index.html',license:'CC BY-SA 4.0',licenseUrl:'https://creativecommons.org/licenses/by-sa/4.0/',retrievedAt:'2026-10-09',description:'English meanings, German headwords and morphology adapted from the English Wiktionary extraction. Individual entry attribution is attached to each lexeme. No dictionary quotations, publisher examples, images or recorded audio are copied.'},
 {id:'wordhoard',title:'wordhoard v0.1.0 German frequency and morphology',url:'https://github.com/natema/wordhoard/releases/tag/v0.1.0',license:'CC BY-SA 4.0',licenseUrl:'https://github.com/natema/wordhoard/blob/main/NOTICE.md',retrievedAt:'2026-10-09',description:'Frequency ordering and fallback inflection metadata from the openly licensed dictionary build. Frequency estimates do not establish a learner’s CEFR level.'},
 {id:'project-lexical-editorial',title:'Lantern Atlas lexical editing and original instructional content',url:'https://en.wiktionary.org/wiki/Wiktionary:Copyrights',license:'Lexical dataset: CC BY-SA 4.0; instructional text: project-authored',licenseUrl:'https://creativecommons.org/licenses/by-sa/4.0/',retrievedAt:'2026-10-09',description:'Short learner glosses, selection, topic grouping and all exercises, explanations, passages and writing patterns authored for this project. Goethe example sentences are not reused.'},
 {id:'goethe-reference',title:'Goethe A1/A2/B1 headword references, audited via DWDS',url:'https://www.dwds.de/d/api#wb-list-goethe',license:'© Goethe-Institut; reference inputs only',licenseUrl:'https://www.dwds.de/d/api#wb-list-goethe',retrievedAt:'2026-10-09',description:'Level placement and coverage comparison only. The reference PDFs and their example sentences are not bundled or relicensed; imported lexical meanings/morphology come from open dictionaries and original editorial work.'}
];
const data={edition:'de-en-a1-b1-2026-10-09',sources,lexicon,units,grammar,exercises,contextWordIds,activityWordIds,npcWordIds,referenceCoverage};
const manifest={items:[...new Map(exercises.map(ex=>[ex.itemId,{id:ex.itemId,level:ex.level}])).values()],lexicon,exercises:exercises.map(ex=>({id:ex.id,itemId:ex.itemId,mode:ex.mode==='choice'?'recognition':ex.mode==='listen'?'listening':'production',answer:ex.answer,...(ex.acceptedAnswers?.length?{acceptedAnswers:ex.acceptedAnswers}:{}),...(ex.caseSensitive?{caseSensitive:true}:{}),wordIds:ex.wordIds,...(ex.targetWordId?{targetWordId:ex.targetWordId}:{}),explanation:ex.explanation})),units:units.map(({id,level,reward,requiredItemIds,requiredWordIds,requiredExerciseIds})=>({id,level,reward,requiredItemIds,requiredWordIds,requiredExerciseIds})),quests:[],contextWordIds,activityWordIds,npcWordIds};
await writeFile(resolve(root,'web/src/data/course.json'),JSON.stringify(data,null,2)+'\n');
// Runtime transport chunks come from the same canonical document. Source
// indices preserve the authored ordering across its interleaved levels.
const {exercises:allExercises,...metadata}=data;
await writeFile(resolve(root,'web/src/data/course-meta.json'),JSON.stringify(metadata)+'\n');
for(const level of levels) {
  const indices=[],levelExercises=[];
  allExercises.forEach((exercise,index)=>{if(exercise.level===level){indices.push(index);levelExercises.push(exercise);}});
  await writeFile(resolve(root,`web/src/data/course-exercises-${level.toLowerCase()}.json`),JSON.stringify({edition:data.edition,indices,exercises:levelExercises})+'\n');
}
await writeFile(resolve(root,'server/course.json'),JSON.stringify(manifest,null,2)+'\n');
if(activityBoards)await writeFile(resolve(root,'server/activity_boards.json'),JSON.stringify(activityBoards,null,2)+'\n');
console.log(JSON.stringify({lexemes:lexicon.length,units:units.length,grammar:grammar.length,exercises:exercises.length,byLevel:Object.fromEntries(levels.map(level=>[level,lexicon.filter(w=>w.level===level).length])),referenceCoverage:referenceCoverage.map(({level,mappedForms,normalizedReferenceForms,remainingForms})=>({level,mappedForms,normalizedReferenceForms,remaining:remainingForms.length}))},null,2));
