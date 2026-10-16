#!/usr/bin/env node
/** Build server content and opaque identities from server-owned authoring inputs. */
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stableId, sourceTokens, sourceKey, compileTranslation } from './content-model.mjs';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const json = (path, fallback) => existsSync(path) ? JSON.parse(readFileSync(path,'utf8')) : fallback;
export function buildContent({ directory = root } = {}) {
  const source = json(resolve(directory,'content/source.json'));
  if (!source) throw new Error('content/source.json is missing; import the legacy content first.');
  const proof = json(resolve(directory,'content/english-proof.json'));
  const ids = json(resolve(directory,'content_ids.json'), {});
  const publishedIds = json(resolve(directory,'content/published-content-ids.json'), {});
  const authored = json(resolve(directory,'content/word-maps.json'), {});
  const fixtures = json(resolve(directory,'content/authored-maps.json'), []);
  const imported = json(resolve(directory,'content/imported-alignment-drafts.json'), {entries:[]});
  const importedByText=new Map();
  for(const entry of imported.entries) {const values=importedByText.get(entry.text)??[];values.push(entry);importedByText.set(entry.text,values);}
  const records = [], byId = new Map();
  const id = (kind, slug) => stableId(`${kind}:${slug}`, ids);
  const publishedKinds={quests:'quest',exercises:'exercise',items:'item',lexemes:'lexeme',units:'unit',nodes:'node',choices:'choice',expeditions:'expedition',minigames:'minigame'};
  for(const key of Object.keys(publishedIds)) {
    const split=key.indexOf(':'),kind=publishedKinds[key.slice(0,split)],slug=key.slice(split+1);
    if(kind&&slug)id(kind,slug);
  }
  const germanId = id('course','german'), englishId = id('course','english');
  const german = { id:germanId,slug:'german',target:'de',supportLanguages:['en','tr'],title:'German · glotworld',grading:{keyboardSubstitutions:{'ä':'ae','ö':'oe','ü':'ue','Ä':'Ae','Ö':'Oe','Ü':'Ue','ß':'ss','ẞ':'SS'},meaningfulCapitals:['Sie','Ihnen','Ihr','Ihre','Ihren','Ihrem','Ihrer','Ihres'],ignoreTrailing:'.!?',mechanicalTypos:true,caseSensitive:false},voice:'de-DE' };
  const english = { id:englishId,...proof.course };
  const courses = [german, english];
  function add(kind, slug, body, course = germanId) {
    const key = id(kind, slug), existing = byId.get(key);
    if (existing) return existing;
    const record = { id:key,courseId:course,slug,kind,version:1,body };
    records.push(record); byId.set(key,record); return record;
  }
  const overlay = source.overlays;
  const trBySentence = new Map(), trByText = new Map(Object.entries(overlay.course.texts ?? {}));
  for (const value of Object.values(overlay.story)) {
    if (value.de && !trBySentence.has(value.de)) trBySentence.set(value.de,value.tr);
    if (!value.de && value.en && !trByText.has(value.en)) trByText.set(value.en,value.tr);
  }
  for(const [text,translation]of Object.entries(overlay.ui??{}))if(typeof translation==='string'&&!trByText.has(text))trByText.set(text,translation);
  for (const value of Object.values(overlay.course.exercises)) {
    if (value.german && value.tr.english && !trBySentence.has(value.german)) trBySentence.set(value.german,value.tr.english);
    for (const field of ['prompt','hint','explanation','english']) if (value.source[field] && value.tr[field]) trByText.set(value.source[field],value.tr[field]);
  }
  for (const value of Object.values(overlay.course.grammar)) for (const [text,translation] of Object.entries(value.examples)) if (!trBySentence.has(text)) trBySentence.set(text,translation);
  const lexicalForms = new Map();
  for (const word of source.course.lexicon) {
    id('lexeme',word.id); id('item',`word-${word.id}`);
    const forms = new Set([word.lemma,word.articleForm,word.plural,...(word.surfaceForms ?? []),...(word.aliases ?? []).map(alias=>alias.form)]);
    for (const form of forms) if (form && /^[\p{L}\p{M}]+(?:[-’'][\p{L}\p{M}]+)*$/u.test(form)) {
      const values = lexicalForms.get(form) ?? []; values.push(word); lexicalForms.set(form,values);
    }
  }
  const lexicalMeaning = word => ({ en:word.english,...(overlay.course.lexicon[word.id]?.tr ? {tr:overlay.course.lexicon[word.id].tr} : {}) });
  const audioByText=new Map();
  for(const clip of source.audioManifest?.clips??source.miniGameAudio?.clips??[])if(clip.text&&clip.path&&!audioByText.has(clip.text))audioByText.set(clip.text,clip.path);
  const owner = (kind, slug, extra = {}) => ({ kind,id:id(kind,slug),...extra });
  function sentence(slug, pair, owners = [], course = german) {
    const key = id('sentence',slug), existing = byId.get(key);
    if (existing) { for(const value of owners) if(!existing.body.owners.some(old=>JSON.stringify(old)===JSON.stringify(value)))existing.body.owners.push(value); return key; }
    const text = pair.text ?? pair.german;
    let translations = pair.translations ? structuredClone(pair.translations) : { en:{text:pair.english ?? pair.translation ?? '',words:[]} };
    if (course.target === 'de' && (pair.turkish || trBySentence.has(text))) translations.tr = {text:pair.turkish??trBySentence.get(text),words:[]};
    const candidates=course.target==='de'?importedByText.get(text)??[]:[];
    const explicit=candidates.filter(entry=>entry.sourceSlugs.includes(slug));
    const exact=candidates.filter(entry=>Object.entries(translations).some(([language,value])=>value.text&&entry.translations[language]?.text===value.text));
    const draft=explicit.length===1?explicit[0]:exact.length===1?exact[0]:candidates.length===1?candidates[0]:undefined;
    const priorFixture=fixtures.find(item=>item.text===text&&Object.entries(item.translations).every(([lang,value])=>translations[lang]?.text===value.text));
    if(draft&&!priorFixture&&!authored[key])for(const [lang,value]of Object.entries(draft.translations))if(!translations[lang]?.text||(draft.replaceSupport&&draft.sourceSlugs.includes(slug)))translations[lang]={text:value.text,words:[]};
    const rawWords = sourceTokens(text), words = [];
    const fixture = fixtures.find(item=>item.text === text && Object.entries(item.translations).every(([lang,value])=>translations[lang]?.text===value.text));
    if(authored[key] && authored[key].sourceText!==text)throw new Error(`${slug}: source text changed after alignment authoring`);
    const maps = authored[key]?.translations ?? fixture?.translations ?? (draft?Object.fromEntries(Object.entries(draft.translations).filter(([lang,value])=>translations[lang]?.text===value.text)):{});
    for(const [lang,map]of Object.entries(maps))if(!translations[lang])translations[lang]={text:map.text,words:[]};
    for (const token of rawWords) {
      const glossOmitted=draft?.omitGlossSources.some(word=>sourceKey(word)===sourceKey(token.source));
      const matches = glossOmitted?[]:lexicalForms.get(token.source.text) ?? lexicalForms.get(token.source.text.toLowerCase()) ?? [];
      const glossary = glossOmitted?undefined:pair.glosses?.[token.source.text] ?? pair.glosses?.[token.source.text.toLowerCase()];
      const mapped = Object.values(maps).some(value=>(value.words ?? []).some(word=>sourceKey(word.source)===sourceKey(token.source)));
      const proofPairs = course.target==='en' ? Object.values(translations).some(value=>(value.pairs ?? []).some(([source])=>source===token.source.text)) : false;
      if (!matches.length && !glossary && !mapped && !proofPairs) continue;
      const lexeme = matches.length === 1 && course.target==='de' ? matches[0] : undefined;
      const englishWord=course.target==='en'?proof.lexemes.find(word=>word.forms.includes(token.source.text)||word.lemma===token.source.text.toLowerCase()):undefined;
      const glosses = lexeme ? lexicalMeaning(lexeme) : course.target==='de'&&matches.length?Object.fromEntries(['en','tr'].map(lang=>[lang,[...new Set(matches.map(word=>lexicalMeaning(word)[lang]).filter(Boolean))].join(' / ')]).filter(([,meaning])=>meaning)):{};
      if (glossary) { glosses.en=glossary; const entry=Object.values(overlay.story).find(entry=>entry.en===glossary && !entry.de); if(entry)glosses.tr=entry.tr; }
      if (proofPairs) for(const [lang,value]of Object.entries(translations)) { const target=value.pairs?.find(([source])=>source===token.source.text)?.[1]; if(target)glosses[lang]=typeof target==='string'?target:target.text; }
      if(englishWord)Object.assign(glosses,englishWord.meanings);
      if(pair.wordGlosses?.[token.source.text])Object.assign(glosses,pair.wordGlosses[token.source.text]);
      words.push({...token,...(lexeme ? {lexemeId:id('lexeme',lexeme.id)} : englishWord?{lexemeId:id('lexeme',englishWord.slug)}:{}),glosses});
    }
    for (const [lang,translation] of Object.entries(translations)) {
      let map = maps[lang];
      if (translation.pairs) {
        map = {text:translation.text,words:translation.pairs.map(([source,target])=>({source:{text:source,occurrence:1},targets:target===null?[]:[typeof target==='string'?{text:target,occurrence:1}:target]}))};
      }
      if (map && map.text!==translation.text) throw new Error(`${slug}/${lang}: stale authored translation`);
      translations[lang] = compileTranslation(text,{text:translation.text,words:map?.words ?? []},words,`${slug}/${lang}`,{strict:false});
    }
    const status = course.target==='en' || fixture || authored[key] || Object.keys(maps).length ? 'authored' : 'pending';
    const audioRequires=/\{[^{}]+\}/.test(text);
    const audio=audioRequires?undefined:typeof pair.audio==='string'?pair.audio:pair.audio?.path??(pair.clipId?`/audio/dialogue/${pair.clipId}.ogg`:course.target==='de'?audioByText.get(text):undefined);
    add('sentence',slug,{text,target:course.target,translations,words,owners,...(audioRequires?{audioRequires:true}: {}),...(audio?{audio:{path:audio}}:{}),authoring:{status,review:authored[key]?.review??{status:'pending-native-speaker-review'},...(draft?{importedFrom:draft.provenance}: {})}},course.id);
    return key;
  }
  const support = value => ({en:value,...(trByText.has(value)?{tr:trByText.get(value)}:{})});
  const metadataFields=new Set(['title','subtitle','summary','description','role','location','name','label','prompt','hint','brief','instruction','gatePrompt','languageFocus','culture','feeling','relationship','orderPrompt','orderExplanation','note','agreement','discovery','sessionTitle','teachingNotes']);
  function foldMetadata(value) {
    if(Array.isArray(value))return value.map(foldMetadata);
    if(!value||typeof value!=='object')return value;
    const result=Object.fromEntries(Object.entries(value).map(([key,entry])=>[key,['support','translations','meanings','glosses','owners','grading'].includes(key)||key.endsWith('Translations')?entry:foldMetadata(entry)]));
    const translated={};
    for(const field of metadataFields)if(typeof value[field]==='string'&&trByText.has(value[field]))translated[field]=trByText.get(value[field]);
    if(Object.keys(translated).length)result.support={...(value.support??{}),tr:{...translated,...(value.support?.tr??{})}};
    return result;
  }
  function refs(value, path, owners, course = german) {
    if (Array.isArray(value)) return value.map((item,index)=>refs(item,`${path}:${item?.id ?? index}`,owners,course));
    if (!value || typeof value!=='object') return value;
    if (typeof value.german==='string') {
      const {german:_,english:__,translation:___,turkish:____,...rest}=value;
      const meaning=value.english??value.translation??value.hint??lexicalForms.get(value.german)?.[0]?.english;
      return {...refs(rest,path,owners,course),sentenceId:sentence(path,{...value,...(meaning?{english:meaning}:{})},owners,course)};
    }
    return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,refs(item,`${path}:${key}`,owners,course)]));
  }
  // Allocate all identities before any references are converted.
  for(const quest of source.quests) {id('quest',quest.id);id('graph',quest.id);for(const exercise of quest.exercises){id('exercise',exercise.id);id('item',exercise.itemId);}}
  for(const unit of source.course.units){id('unit',unit.id);for(const item of unit.requiredItemIds)id('item',item);}
  for(const exercise of source.course.exercises){id('exercise',exercise.id);id('item',exercise.itemId);}
  for(const graph of source.graphs){if(graph.evidenceItem)id('item',graph.evidenceItem);for(const node of graph.nodes){id('node',`${graph.questId}:${node.id}`);for(const choice of node.choices??[])id('choice',`${graph.questId}:${choice.id}`);}for(const item of graph.investigations)id('object',item.objectId);}
  for(const value of [source.legacyServer.expeditionLearning,source.legacyServer.minigames])for(const exercise of value.exercises){id('exercise',exercise.id);id('item',exercise.itemId);if(exercise.contentId)id('content',exercise.contentId);}
  for(const row of source.legacyServer.expeditions.encounters)id('expedition',row.id);
  for(const row of source.legacyServer.expeditions.games)id('expedition',row.id);
  for(const slug of ['successor-letter','restored-atlas','inspector-ledger','lamplighter-key'])id('item',slug);
  function itemReferences(value) {
    if(Array.isArray(value)){value.forEach(itemReferences);return;}
    if(!value||typeof value!=='object')return;
    for(const [key,entry]of Object.entries(value)) {
      if(['item','missingItem','evidenceItem'].includes(key)&&typeof entry==='string')id('item',entry);
      else itemReferences(entry);
    }
  }
  itemReferences(source.graphs);itemReferences(source.legacyServer.storyRules);
  const wordIds = values => (values??[]).map(value=>id('lexeme',value));
  const exerciseRecord = (exercise, binding) => {
    const {german:text,english,answer,acceptedAnswers,explanation,...rest}=exercise;
    const tr = overlay.course.exercises[exercise.id]?.tr;
    const contextWords=exercise.wordIds??source.legacyServer.course.contextWordIds?.[exercise.id];
    const body={...rest,id:id('exercise',exercise.id),itemId:id('item',exercise.itemId),...binding,wordIds:wordIds(contextWords),...(exercise.targetWordId?{targetWordId:id('lexeme',exercise.targetWordId)}:{}),...(exercise.unitId?{unitId:id('unit',exercise.unitId)}:{}),prompt:exercise.prompt,hint:exercise.hint,support:{en:{prompt:exercise.prompt,hint:exercise.hint,explanation},...(tr?{tr}: {})},...(overlay.course.exercises[exercise.id]?.options?{optionTranslations:{tr:overlay.course.exercises[exercise.id].options}}:{}),grading:{answer,acceptedAnswers:acceptedAnswers??[],explanation,caseSensitive:exercise.caseSensitive??false}};
    if(text && english){body.sentenceId=sentence(`exercise:${exercise.id}`,{text,english},[owner('exercise',exercise.id,{...binding,level:exercise.level})]);body.exampleSentenceId=body.sentenceId;const cue=byId.get(body.sentenceId).body;if(cue.audio)body.audio=cue.audio;if(cue.audioRequires)body.audioRequires=true;}
    const gatePairs=source.beginnerGateTranslations[exercise.id];
    if(gatePairs?.length)body.optionSentenceIds=Object.fromEntries(gatePairs.map(([german,english],index)=>[german,sentence(`context:beginner:${exercise.id}:${index}`,{german,english},[owner('exercise',exercise.id)])]));
    add('exercise',exercise.id,body);
  };
  for(const quest of source.quests)for(const exercise of quest.exercises)exerciseRecord(exercise,{questId:id('quest',quest.id),level:quest.level});
  for(const exercise of source.course.exercises)exerciseRecord(exercise,{unitId:id('unit',exercise.unitId),level:exercise.level});
  for(const exercise of [...source.legacyServer.expeditionLearning.exercises,...source.legacyServer.minigames.exercises])if(!byId.has(id('exercise',exercise.id)))exerciseRecord(exercise,{...(exercise.questId?{questId:id('quest',exercise.questId)}:{}),level:exercise.level,routeId:exercise.regionId,miniGameId:exercise.miniGameId});
  for(const word of source.course.lexicon) {
    const {english,article,articleForm,plural,forms,surfaceForms,...rest}=word;
    const example=source.course.grammar.flatMap(guide=>guide.examples).find(example=>sourceTokens(example.german).some(token=>token.source.text===word.lemma));
    add('lexeme',word.id,{...rest,id:id('lexeme',word.id),itemId:id('item',`word-${word.id}`),syllabusIndex:source.legacyServer.syllabus.wordIds.indexOf(word.id),exerciseIds:Object.fromEntries(['recognition','listening','production'].map(mode=>[mode,id('exercise',`lex-${word.id}-${mode}`)])),audio:`/audio/word-${word.id}.ogg`,lemma:word.lemma,meanings:lexicalMeaning(word),forms:[...new Set([word.lemma,...(surfaceForms??[]),...(forms??[])])],morphology:{...(article?{article}:{}),...(articleForm?{articleForm}:{}),...(plural?{plural}:{})},...(example?{exampleSentenceId:sentence(`lexeme:${word.id}:example`,example,[owner('lexeme',word.id,{level:word.level})])}:{})});
  }
  for(const unit of source.course.units)add('unit',unit.id,{...unit,id:id('unit',unit.id),titleTranslations:support(unit.title),summaryTranslations:support(unit.summary),support:{tr:{title:trByText.get(unit.title),summary:trByText.get(unit.summary)}},exerciseIds:unit.exerciseIds.map(value=>id('exercise',value)),wordIds:wordIds(unit.wordIds),requiredWordIds:wordIds(unit.requiredWordIds),requiredExerciseIds:unit.requiredExerciseIds.map(value=>id('exercise',value)),requiredItemIds:unit.requiredItemIds.map(value=>id('item',value)),grammarIds:unit.grammarIds.map(value=>id('context',`grammar:${value}`))});
  const graphLine = (line, slug, graph, node) => {
    const {german:_,english:__,glosses:___,variants,reply,...rest}=line;
    return {...rest,id:id('line',line.id ?? slug),sentenceId:sentence(slug,{...line,glosses:{...(graph.introducedWords??{}),...(line.glosses??{})}},[owner('graph',graph.questId,{questId:id('quest',graph.questId),nodeId:id('node',`${graph.questId}:${node.id}`),level:graph.level})]),...(variants?{variants:variants.map((variant,index)=>graphLine({...variant,id:`${line.id}:variant:${index}`},`${slug}:variant:${index}`,graph,node))}:{}),...(reply?{reply:{exerciseId:id('exercise',reply.exerciseId),correction:graphLine(reply.correction,`dialogue:${reply.correction.id}`,graph,node)}}:{})};
  };
  for(const graph of source.graphs) {
    const body={...graph,questId:id('quest',graph.questId),gateExerciseId:id('exercise',graph.gateExerciseId),start:id('node',`${graph.questId}:${graph.start}`),gatePromptTranslations:support(graph.gatePrompt),objectives:graph.objectives.map(value=>({...value,translations:support(value.text)})),nodes:graph.nodes.map(node=>({...node,id:id('node',`${graph.questId}:${node.id}`),slug:node.id,...(node.next?{next:id('node',`${graph.questId}:${node.next}`)}:{}),...(node.gateExerciseId?{gateExerciseId:id('exercise',node.gateExerciseId)}:{}),lines:node.lines.map(line=>graphLine(line,`dialogue:${line.id}`,graph,node)),...(node.choices?{choices:node.choices.map(choice=>{const {german:_,english:__,...rest}=choice;return {...rest,id:id('choice',`${graph.questId}:${choice.id}`),sentenceId:sentence(`choice:${graph.questId}:${choice.id}`,choice,[owner('graph',graph.questId,{questId:id('quest',graph.questId),nodeId:id('node',`${graph.questId}:${node.id}`)})]),next:id('node',`${graph.questId}:${choice.next}`)};})}:{})})),topics:(graph.topics??[]).map(topic=>{const {german:_,english:__,lines,...rest}=topic;return {...rest,sentenceId:sentence(`topic:${graph.questId}:${topic.id}`,topic,[owner('graph',graph.questId,{questId:id('quest',graph.questId),nodeId:id('node',`${graph.questId}:intro`)})]),lines:lines.map(line=>graphLine(line,`dialogue:${line.id}`,graph,{id:'intro'}))};}),investigations:graph.investigations.map(item=>({objectId:id('object',item.objectId),worldId:item.objectId,sentenceId:sentence(`investigation:${graph.questId}:${item.objectId}`,item,[owner('graph',graph.questId,{questId:id('quest',graph.questId),nodeId:id('node',`${graph.questId}:intro`)})])}))};
    delete body.introducedWords;add('graph',graph.questId,body);
  }
  const contexts=[];
  function context(slug,category,data,owners=[],meta={}) { const record=add('context',slug,{category,owners,data:refs(data,`context:${slug}`,owners)});const visual=['npc','interior','activity','expedition','act'].includes(owners[0]?.kind)?owners[0].id:undefined;contexts.push({id:record.id,kind:category,...(visual?{worldId:visual}:{}),...(owners[0]?{ownerId:owners[0].id,ownerKind:owners[0].kind,level:owners[0].level}:{}),...meta});return record.id; }
  if(source.placement) {
    const placementOwner={kind:'placement',id:germanId};
    const questions=source.placement.exerciseIds.map(slug=>{
      const cue=source.placement.dialogue[slug],exercise=byId.get(id('exercise',slug));
      if(!cue||!exercise)throw new Error(`Missing authored placement question ${slug}`);
      const existing=records.find(record=>record.kind==='sentence'&&record.body.text===cue.german&&record.body.translations.en?.text===cue.english);
      if(existing&&!existing.body.owners.some(owner=>owner.kind==='placement'))existing.body.owners.push(placementOwner);
      const sentenceId=existing?.id??sentence(`placement:${slug}`,cue,[placementOwner]);
      return {exerciseId:exercise.id,level:exercise.body.level,turn:{speaker:cue.speaker,sentenceId}};
    });
    context('placement:german','placement',{exerciseIds:questions.map(question=>question.exerciseId),questions},[placementOwner],{worldId:'placement'});
  }
  for(const [key,data]of Object.entries(source.specialItems??{}))context(`special-item:${key}`,'specialItem',{id:key,...data,support:{tr:Object.fromEntries(Object.entries(data).filter(([,text])=>trByText.has(text)).map(([field,text])=>[field,trByText.get(text)]))}},[{kind:'specialItem',id:id('item',key)}],{worldId:key});
  for(const [key,data]of Object.entries(source.storyEndings??{}))context(`story-ending:${key}`,'storyEnding',{id:key,...data,support:{tr:Object.fromEntries(Object.entries(data).filter(([,text])=>trByText.has(text)).map(([field,text])=>[field,trByText.get(text)]))}},[{kind:'storyEnding',id:key}],{worldId:key});
  for(const guide of source.course.grammar) {
    const {explanation,...rest}=guide,tr=overlay.course.grammar[guide.id];
    context(`grammar:${guide.id}`,'grammar',{...rest,id:id('context',`grammar:${guide.id}`),teachingNotes:explanation,...(tr?{support:{tr:{title:tr.title[1],teachingNotes:tr.explanation[1],...(tr.note?{note:tr.note}:{})}}}:{})},[{kind:'unit',level:guide.level}]);
  }
  for(const [questId,note]of Object.entries(source.contextualGrammar)){const {explanation,...rest}=note;context(`quest-grammar:${questId}`,'questGrammar',{...rest,...(explanation?{teachingNotes:explanation}:{}),guideId:id('context',`grammar:${note.guideId}`)},[owner('quest',questId)]);}
  for(const [key,pairs]of Object.entries(source.beginnerGateTranslations))context(`beginner:${key}`,'beginnerChoices',pairs.map(([german,english])=>({german,english})),[owner('exercise',key)]);
  for(const [key,data]of Object.entries(source.activityDiscoveries))context(`activity:${key}`,'activityDiscovery',data,[{kind:'activity',id:key,level:data.level}]);
  const publicCondition=condition=>condition?Object.fromEntries(Object.entries(condition).map(([key,value])=>[key,['flag','withoutFlag'].includes(key)&&typeof value==='string'&&value.startsWith('quest:')?`quest:${id('quest',value.slice(6))}`:value])):undefined;
  for(const line of source.greetings)context(`greeting:${line.id}:${line.german}`,line.title?'npcTitleGreeting':'npcGreeting',line,[{kind:'npc',id:line.speaker,level:/-(A1|A2|B1)-/.exec(line.id)?.[1]??'A1',...(line.when?{condition:line.when}:{})}],{...(line.when?{condition:publicCondition(line.when)}:{}),...(line.title?{title:line.title}:{})});
  for(const [index,line]of source.ambientCallbacks.entries())context(`ambient:${index}`,'ambientCallback',line,[{kind:'npc',id:line.npc,level:line.level,condition:line.when}]);
  const acts = source.storyText.acts.map(act=>refs(act,`act:${act.mapId}`,[{kind:'act',id:act.mapId,level:act.level}]));
  // The client checks these items by role, and story inventory arrives as public IDs.
  const granted=new Set(source.graphs.flatMap(graph=>graph.nodes.flatMap(node=>(node.choices??[]).flatMap(choice=>(choice.effects??[]).map(effect=>effect.item)))));
  const storyItems={lamp:['signal-lamp','registered-lamp'].map(item=>{if(!granted.has(item))throw new Error(`Story item ${item} is no longer granted by any choice.`);return id('item',item);})};
  const clues = source.storyText.clues.map(clue=>({...refs(clue,`clue:${clue.questId}`,[owner('quest',clue.questId,{completedOnly:true})]),questId:id('quest',clue.questId)}));
  const objects=Object.fromEntries(Object.entries(source.storyText.objects).map(([key,value])=>[key,refs(value,`object:${key}`,[{kind:'object',id:key}])]));
  const journalNarratives=refs(source.journalNarratives,'journal',[{kind:'journal',id:'journal'}]);
  const expeditionSkeleton=source.expeditionRegions.flatMap(region=>region.encounters.map(encounter=>({id:id('expedition',encounter.id),worldId:encounter.id,routeId:region.id,level:encounter.difficulty})));
  const minigameSkeleton=source.miniGameDefinitions.map(game=>({id:id('minigame',game.id),worldId:game.id,title:game.title,mechanic:game.mechanic,levels:game.levels}));
  const questSkeleton=source.quests.map(quest=>({id:id('quest',quest.id),worldId:quest.id,graphId:id('graph',quest.id),level:quest.level,title:quest.title,subtitle:quest.subtitle,titleTranslations:support(quest.title),subtitleTranslations:support(quest.subtitle),support:{tr:{title:trByText.get(quest.title),subtitle:trByText.get(quest.subtitle)}},npcId:quest.npcId,location:quest.location,reward:quest.reward,story:refs(quest.story,`quest:${quest.id}:story`,[owner('quest',quest.id)])}));
  const npcSkeleton=source.npcs.map(npc=>{const {greeting,greetingSentences,...rest}=npc;return {...rest,id:id('npc',npc.id),worldId:npc.id,support:{tr:{role:trByText.get(npc.role)}},greetingSentences:refs(greetingSentences??[] ,`npc:${npc.id}:greeting`,[{kind:'npc',id:npc.id,level:'A1'}])};});
  const unitSkeleton=source.course.units.map(unit=>({id:id('unit',unit.id),level:unit.level,title:unit.title,titleTranslations:support(unit.title),support:{tr:{title:trByText.get(unit.title)}},topic:unit.topic,exerciseCount:unit.exerciseIds.length,wordCount:unit.wordIds.length}));
  for(const region of source.expeditionRegions) for(const encounter of region.encounters) {
    const {german:_,translation:__,choices,...rest}=encounter;
    const learning=source.legacyServer.expeditionLearning.encounters.find(row=>row.encounterId===encounter.id);
    add('expedition',encounter.id,{...rest,id:id('expedition',encounter.id),worldId:encounter.id,routeId:region.id,sentenceId:sentence(`expedition:${encounter.id}`,encounter,[owner('expedition',encounter.id,{routeId:region.id,level:encounter.difficulty})]),...(learning?{learning:{encounterId:id('expedition',encounter.id),regionId:region.id,contentId:id('content',encounter.id),level:learning.level,exerciseIds:Object.fromEntries(Object.entries(learning.exerciseIds).map(([mode,slug])=>[mode,id('exercise',slug)])),wordIds:wordIds(learning.wordIds),targetWordId:id('lexeme',learning.targetWordId),audio:learning.audio,supported:learning.supported}}:{}),choices:choices.map(({correct,response,text},index)=>({id:id('choice',`${encounter.id}:${index}`),text,response,...(trByText.has(response)?{support:{tr:{response:trByText.get(response)}}}:{}),sentenceId:sentence(`expedition:${encounter.id}:choice:${index}`,{text},[owner('expedition',encounter.id,{routeId:region.id,level:encounter.difficulty})]),grading:{correct}}))});
  }
  const interiorData=source.interiors.map(room=>({...room,objects:room.objects.map(object=>({...object,exerciseIds:object.exerciseIds.map(value=>id('exercise',value)),vocabulary:object.vocabulary.map((word,index)=>{const surface=`${word.article} ${word.lemma}`,{english,...rest}=word;return {...rest,sentenceId:sentence(`interior:${object.id}:${index}`,{german:surface,english},[{kind:'interior',id:room.id}])};})}))}));
  for(const room of interiorData)context(`interior:${room.id}`,'interior',room,[{kind:'interior',id:room.id,level:'A1'}]);
  for(const conversation of source.interiorConversations??[]) {
    const {nodes,...metadata}=conversation,roomId=conversation.objectId.split(':')[1];
    const nodeID=stage=>id('node',`interior:${conversation.objectId}:${stage}`),startNodeId=nodeID(conversation.start);
    for(const [stage,node]of Object.entries(nodes)) {
      const nodeId=nodeID(stage),publicNode={...node,id:nodeId,choices:node.choices.map(choice=>({...choice,id:id('choice',`interior:${conversation.objectId}:${stage}:${choice.id}`),next:nodeID(choice.next)}))};
      context(`interior-conversation:${conversation.objectId}:${stage}`,'interiorConversation',{...metadata,start:startNodeId,nodes:{[nodeId]:publicNode}},[{kind:'interior',id:roomId,level:'A1'}],{worldId:conversation.objectId,nodeId,startNodeId});
    }
  }
  for(const room of source.interiors) {
    const surfaces=new Set(room.objects.flatMap(object=>object.vocabulary.map(word=>word.lemma)));
    const meanings=Object.fromEntries(Object.entries(source.interiorWordFacts?.meanings??{}).filter(([lemma])=>surfaces.has(lemma)));
    const examples=Object.fromEntries(Object.entries(source.interiorWordFacts?.examples??{}).filter(([lemma])=>surfaces.has(lemma)).map(([lemma,[german,english,turkish]])=>[lemma,{german,english,turkish}]));
    context(`interior-word-facts:${room.id}`,'interiorWordFacts',{meanings:{tr:meanings},examples},[{kind:'interior',id:room.id,level:'A1'}]);
  }
  for(const scenario of source.activityScenarios??[])context(`scenario:${scenario.id}`,'activityScenario',{...scenario,exerciseId:id('exercise',scenario.exerciseId)},[{kind:'activity',id:scenario.activityId,level:scenario.level}]);
  context('activity-inventory','activityInventory',source.inventory??{},[{kind:'activity',level:'A1'}]);
  context('activity-definitions','activityDefinitions',source.activityDefinitions??[],[{kind:'activity',level:'A1'}]);
  for(const game of source.expeditionGames??[])context(`expedition-game:${game.id}`,'expeditionGame',{...game,placements:source.legacyServer.expeditionLearning.placements.filter(row=>row.mapId===game.id).map(({mapId,level,fieldId,prompt,supported,exerciseId,wordIds:words,targetWordId})=>({mapId,level,fieldId,prompt,supported,exerciseId:id('exercise',exerciseId),wordIds:wordIds(words),targetWordId:id('lexeme',targetWordId)}))},[{kind:'expedition',id:game.id,routeId:game.id,level:'A1'}]);
  for(const [npcId,beats]of Object.entries(source.npcRoutines??{}))context(`routine:${npcId}`,'npcRoutine',{npcId,beats},[{kind:'npc',id:npcId,level:'A1'}]);
  const cinematicQuest={arrival:'a1-arrival',platform:'a1-arrival',recording:'a1-station',erasure:'a1-market',clockmill:'a2-broken-clock',confession:'a2-archive','dark-beam':'b1-witness',ledger:'b1-work',storm:'b1-storm',bell:'b1-atlas'};
  for(const scene of source.cinematics??[]) {
    const level={lindenhafen:'A1',waldruh:'A2',nebelstadt:'B1'}[scene.mapId];
    const owners=scene.kind==='travel'?[{kind:'act',id:scene.mapId,level}]:[owner('quest',cinematicQuest[scene.kind],{level})];
    context(`cinematic:${scene.mapId}:${scene.kind}:${scene.ending??''}`,'cinematic',scene,owners,{worldId:scene.mapId,scene:scene.kind,...(scene.ending?{ending:scene.ending}:{})});
  }
  for(const map of source.storyMaps??[])for(const object of map.objects)context(`map-object:${object.id}`,'mapObject',{...object,mapId:map.id,exerciseIds:object.exerciseIds.map(value=>id('exercise',value))},[{kind:'object',id:object.id,level:map.level}],{worldId:object.id,mapId:map.id});
  const audioPrefixes={'tray-rush':'minigame-tray-','departure-board':'minigame-departure-','workbench':'minigame-workbench-','kettle-forecast':'minigame-forecast-','sorting-office':'minigame-sort-','adas-alphabet':'minigame-sort-','delivery-run':'minigame-delivery-','17-59':'minigame-connection-'};
  for(const game of source.miniGameDefinitions) {
    const ownedExercises=source.legacyServer.minigames.exercises.filter(exercise=>exercise.miniGameId===game.id);
    const extraExercises=game.id==='looping-tape'?(source.loopData.clips??[]).map(clip=>clip.exerciseId):[];
    const exerciseIds=[...new Set([...ownedExercises.map(exercise=>exercise.id),...extraExercises])].map(slug=>id('exercise',slug));
    const owners=[{kind:'minigame',id:id('minigame',game.id),level:game.levels[0]}];
    const scripts=refs(source.miniGameScripts.games[game.id]??{},`minigame:${game.id}`,owners);
    const recordings=(source.miniGameAudio?.clips??source.miniGameScripts.audio).filter(clip=>ownedExercises.some(exercise=>exercise.id===clip.id)||audioPrefixes[game.id]&&clip.id.startsWith(audioPrefixes[game.id]));
    const clips=recordings.map(clip=>({id:clip.id,sentenceId:sentence(`minigame-audio:${game.id}:${clip.id}`,{german:clip.text,audio:clip.path},owners),path:clip.path}));
    add('minigame',game.id,{...game,id:id('minigame',game.id),worldId:game.id,exerciseIds,wordIds:wordIds(source.miniGameScripts.games[game.id]?.requiredWordIds??[]),questIds:(game.questIds??[]).map(value=>id('quest',value)),scripts,audio:{clips},...(game.id==='looping-tape'?{loopData:{...source.loopData,clips:source.loopData.clips.map(({text,...clip})=>({...clip,exerciseId:id('exercise',clip.exerciseId)}))}}:{})});
  }
  // These records are private inputs for server grading and migration, never read-API payloads.
  for(const [kind,value]of Object.entries(source.legacyServer))add(kind,'legacy',value);
  const publicSyllabus=syllabus=>{const {wordIds:_,quests:__,...config}=syllabus;return {...config,totalWords:syllabus.wordIds.length,wordIds:[],quests:[]};};
  add('bootstrap','legacy',{expeditions:expeditionSkeleton,minigames:minigameSkeleton,npcs:npcSkeleton,chapters:source.chapters,quests:questSkeleton,units:unitSkeleton,acts,clues,objects,journalNarratives,contexts,storyItems,syllabus:publicSyllabus(source.legacyServer.syllabus),sources:source.course.sources,edition:source.course.edition,counts:{lexemes:source.course.lexicon.length,exercises:source.course.exercises.length,units:source.course.units.length}});
  // The proof course uses exactly the same record types and reference model.
  for(const row of proof.sentences)sentence(row.slug,row,[owner('graph',proof.quest.slug,{questId:id('quest',proof.quest.slug),nodeId:id('node',`${proof.quest.slug}:${row.slug==='en-goodbye'?'complete':'intro'}`),level:'A1'})],english);
  for(const word of proof.lexemes)add('lexeme',word.slug,{id:id('lexeme',word.slug),itemId:id('item',`word-${word.slug}`),syllabusIndex:proof.lexemes.findIndex(candidate=>candidate.slug===word.slug),exerciseIds:{production:id('exercise',`lex-${word.slug}-production`)},lemma:word.lemma,pos:word.pos,level:'A1',topic:'greetings',meanings:word.meanings,forms:word.forms,morphology:{},exampleSentenceId:id('sentence',word.exampleSlug)},englishId);
  const ex=proof.exercise, exId=id('exercise',ex.slug), unitId=id('unit',proof.unit.slug), questId=id('quest',proof.quest.slug), itemId=id('item',ex.itemSlug), proofWordIds=proof.lexemes.map(word=>id('lexeme',word.slug));
  add('exercise',ex.slug,{id:exId,itemId,mode:ex.mode,level:'A1',kind:ex.kind,unitId,questId,prompt:ex.prompt,hint:ex.hint,sentenceId:id('sentence',ex.sentenceSlug),wordIds:proofWordIds,support:ex.support,grading:{answer:ex.answer,acceptedAnswers:ex.acceptedAnswers,explanation:ex.explanation,caseSensitive:false}},englishId);
  add('unit',proof.unit.slug,{...proof.unit,id:unitId,exerciseIds:[exId],wordIds:proofWordIds,requiredWordIds:[],requiredExerciseIds:[exId],requiredItemIds:[itemId],grammarIds:[]},englishId);
  const stages=['intro','gate','choice','complete'];
  const graph={questId,level:'A1',start:id('node',`${proof.quest.slug}:intro`),gateExerciseId:exId,gatePrompt:ex.prompt,gatePromptTranslations:Object.fromEntries(Object.entries(ex.support).map(([lang,value])=>[lang,value.prompt])),objectives:[{text:proof.quest.subtitle,location:proof.quest.location,stage:'intro'}],investigations:[],topics:[],nodes:stages.map((stage,index)=>({id:id('node',`${proof.quest.slug}:${stage}`),slug:stage,stage,lines:(stage==='intro'?proof.sentences.slice(0,9):stage==='complete'?proof.sentences.slice(9):[]).map(row=>({id:id('line',row.slug),speaker:'sam',sentenceId:id('sentence',row.slug),clipId:`${englishId}:${id('sentence',row.slug)}`})),...(stage==='gate'?{gateExerciseId:exId}:{}),...(stage==='complete'?{terminal:true}:{next:id('node',`${proof.quest.slug}:${stages[index+1]}`)})}))};
  graph.nodes.find(node=>node.stage==='choice').choices=[{id:id('choice',`${proof.quest.slug}:en-first-continue`),sentenceId:id('sentence','en-goodbye'),next:id('node',`${proof.quest.slug}:complete`),effects:[]}];
  byId.get(id('sentence','en-goodbye')).body.owners.push(owner('graph',proof.quest.slug,{questId,nodeId:id('node',`${proof.quest.slug}:choice`),level:'A1'}));
  add('graph',proof.quest.slug,graph,englishId);
  const drills=proof.lexemes.map(word=>({id:`lex-${word.slug}-production`,itemId:`word-${word.slug}`,mode:'production',answer:word.lemma,explanation:`${word.lemma} — ${word.meanings.de}`,wordIds:[word.slug],targetWordId:word.slug}));
  for(const [index,drill]of drills.entries()) {
    const word=proof.lexemes[index];
    add('exercise',drill.id,{id:id('exercise',drill.id),itemId:id('item',drill.itemId),mode:'type',level:'A1',kind:'word',unitId,prompt:`Write the English word for ${word.meanings.de}.`,hint:'Remember the word from the conversation.',wordIds:[id('lexeme',word.slug)],targetWordId:id('lexeme',word.slug),sentenceId:id('sentence',word.exampleSlug),support:Object.fromEntries(Object.entries(word.meanings).map(([lang,meaning])=>[lang,{prompt:lang==='tr'?`${meaning} anlamına gelen İngilizce kelimeyi yaz.`:`Schreibe das englische Wort für ${meaning}.`,hint:lang==='tr'?'Konuşmadaki kelimeyi hatırla.':'Erinnere dich an das Wort im Gespräch.',explanation:`${word.lemma} — ${meaning}`}])),grading:{answer:drill.answer,acceptedAnswers:[],explanation:drill.explanation,caseSensitive:false}},englishId);
  }
  add('curriculum','english',{quests:[{id:proof.quest.slug,reward:40,requiredItemIds:[ex.itemSlug]}],items:[{id:ex.itemSlug,level:'A1'}],exercises:[{id:ex.slug,itemId:ex.itemSlug,mode:'production',answer:ex.answer,acceptedAnswers:ex.acceptedAnswers,explanation:ex.explanation}]},englishId);
  add('course','english',{items:proof.lexemes.map(word=>({id:`word-${word.slug}`,level:'A1'})),lexicon:proof.lexemes.map(word=>({id:word.slug,lemma:word.lemma,pos:word.pos,level:'A1',topic:'greetings',surfaceForms:word.forms})),exercises:drills,units:[{id:proof.unit.slug,level:'A1',reward:40,requiredItemIds:[ex.itemSlug],requiredWordIds:[],requiredExerciseIds:[ex.slug]}],quests:[],contextWordIds:{[ex.slug]:proof.lexemes.map(word=>word.slug)},activityWordIds:{},npcWordIds:{sam:proof.lexemes.map(word=>word.slug)}},englishId);
  add('syllabus','english',{version:'english-proof-1',wordsPerHour:40,openingWords:10,bankCap:10,storyShare:1,brake:{maxUnsettled:20,maxDue:50},wordIds:proof.lexemes.map(word=>word.slug),quests:[{questId:proof.quest.slug,level:'A1',wordIds:proof.lexemes.map(word=>word.slug),milestone:1}]},englishId);
  add('storyRules','english',{rules:[{questId:proof.quest.slug,mapId:proof.quest.mapId,npcId:'sam',npc:{id:'sam',x:proof.npc.x,y:proof.npc.y},gateExerciseId:ex.slug,replyExerciseIds:[],choiceIds:['en-first-continue'],choices:[{id:'en-first-continue',effects:[]}],investigationObjectIds:[],objects:[]}]},englishId);
  for(const kind of ['expeditions','expeditionLearning','minigames','activityBoards'])add(kind,'english',kind==='expeditions'?{encounters:[],games:[]}:kind==='activityBoards'?{scenarios:[],prices:{}}:{exercises:[],games:{},encounters:[],placements:[]},englishId);
  byId.get(unitId).body.exerciseIds.push(...drills.map(drill=>id('exercise',drill.id)));
  add('bootstrap','english',{npcs:[{...proof.npc,id:id('npc',proof.npc.id),worldId:proof.npc.id}],chapters:[{level:'A1',title:'First conversations',description:proof.unit.summary,color:'#8CA7E8'}],quests:[{...proof.quest,id:questId,worldId:proof.quest.slug,graphId:id('graph',proof.quest.slug),story:[]}],units:[{id:unitId,level:'A1',title:proof.unit.title,support:proof.unit.support,topic:'greetings',exerciseCount:1+drills.length,wordCount:proofWordIds.length}],acts:[],clues:[],objects:{},journalNarratives:{},contexts:[],syllabus:publicSyllabus(byId.get(id('syllabus','english')).body),sources:[],edition:'English proof 1',counts:{lexemes:proofWordIds.length,exercises:1+drills.length,units:1}},englishId);
  for(const word of proof.lexemes)id('item',`word-${word.slug}`);
  const referenceFields={exerciseId:'exercise',gateExerciseId:'exercise',contextExerciseId:'exercise',questId:'quest',unitId:'unit',targetWordId:'lexeme',lexemeId:'lexeme',itemId:'item',item:'item',missingItem:'item',contentId:'content'};
  const referenceArrays={wordIds:'lexeme',requiredWordIds:'lexeme',exerciseIds:'exercise',requiredExerciseIds:'exercise',questIds:'quest',requiredItemIds:'item'};
  function normalizeReferences(value,parent='') {
    if(typeof value==='string') {
      if(referenceFields[parent])return ids[`${referenceFields[parent]}:${value}`]??value;
      if(['flag','withoutFlag'].includes(parent)&&value.startsWith('quest:'))return `quest:${ids[`quest:${value.slice(6)}`]??value.slice(6)}`;
      return value;
    }
    if(Array.isArray(value))return value.map(item=>typeof item==='string'&&referenceArrays[parent]?ids[`${referenceArrays[parent]}:${item}`]??item:normalizeReferences(item,parent));
    if(!value||typeof value!=='object')return value;
    return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,key==='owners'?item:normalizeReferences(item,key)]));
  }
  for(const record of records)if(['graph','context','bootstrap','exercise','unit','lexeme','expedition','minigame'].includes(record.kind)) {
    record.body=normalizeReferences(record.body);
    if(record.kind!=='lexeme'&&record.courseId===germanId)record.body=foldMetadata(record.body);
    if(record.kind==='graph'&&record.courseId===germanId)record.body.objectives=record.body.objectives.map(objective=>trByText.has(objective.text)?{...objective,support:{...(objective.support??{}),tr:{...(objective.support?.tr??{}),text:trByText.get(objective.text)}}}:objective);
  }
  return {bundle:{version:1,courses,records,ids,...(Object.keys(publishedIds).length?{publishedIds}:{})},source};
}

export function writeContent({ directory = root } = {}) {
  const {bundle,source}=buildContent({directory});
  mkdirSync(resolve(directory,'content'),{recursive:true});mkdirSync(resolve(directory,'server'),{recursive:true});
  const write=(path,value)=>{writeFileSync(path+'.tmp',value);renameSync(path+'.tmp',path);};
  write(resolve(directory,'content_ids.json'),JSON.stringify(Object.fromEntries(Object.entries(bundle.ids).sort(([a],[b])=>a.localeCompare(b))),null,1)+'\n');
  write(resolve(directory,'server/content.json'),JSON.stringify(bundle)+'\n');
  const presentation=JSON.parse(JSON.stringify({interiors:source.interiors,expeditionRegions:source.expeditionRegions},(key,value)=>['greeting','dialogue','germanName','sessionTitle','prompt','description','vocabulary','german','translation','text','response','correct','answer','acceptedAnswers','explanation','languageFocus','relationship','relationships','culture','feeling'].includes(key)?undefined:value));
  for(const region of presentation.expeditionRegions)delete region.encounters;
  writeFileSync(resolve(directory,'content/presentation.json'),JSON.stringify(presentation)+'\n');
  return bundle;
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const bundle=writeContent();console.log(`Built ${bundle.courses.length} courses, ${bundle.records.length} records, ${Object.keys(bundle.ids).length} stable UUIDs.`);
}
