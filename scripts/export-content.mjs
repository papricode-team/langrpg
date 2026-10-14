#!/usr/bin/env node
/** Export the authoring corpus into the private server catalogue. No browser imports. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import ts from 'typescript';
import { tokenized, tokenTexts } from './content-tokenizer.mjs';
import { applyCachedAlignment, validateAlignment } from './content-alignment.mjs';

export const contentKinds = ['quests','npcs','lines','lexemes','exercises','items','units','graphs','nodes','choices','expeditions','minigames','narratives','grammar'];
export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const normalize = value => value.normalize('NFC').toLocaleLowerCase('de-DE');
const levelMap = {A1:'lindenhafen',A2:'waldruh',B1:'nebelstadt'};

function nestedLineIDs(value) {
  if (Array.isArray(value)) return value.flatMap(nestedLineIDs);
  if (!value || typeof value!=='object') return [];
  return [...(typeof value.lineId==='string'?[value.lineId]:[]),...Object.entries(value).filter(([key])=>key!=='lineId').flatMap(([,entry])=>nestedLineIDs(entry))];
}

export function contentID(ids, kind, slug) {
  if (typeof slug !== 'string' || !slug) throw new Error(`Missing ${kind} slug.`);
  const key = `${kind}:${slug}`;
  ids[key] ??= randomUUID();
  if (!uuidPattern.test(ids[key])) throw new Error(`Invalid committed UUID for ${key}.`);
  return ids[key];
}

async function loadJSON(root, name, fallback) {
  try { return JSON.parse(await readFile(resolve(root, name), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT' && fallback !== undefined) return fallback; throw error; }
}

async function authoringModule(root, name, bindings = {}) {
  const path = resolve(root, 'content/source', name);
  const source = ts.createSourceFile(path, await readFile(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const statements = source.statements.filter(statement => !ts.isImportDeclaration(statement));
  const printer = ts.createPrinter();
  const stripped = statements.map(statement => printer.printNode(ts.EmitHint.Unspecified, statement, source)).join('\n');
  const prefix = Object.entries(bindings).map(([key, value]) => `const ${key}=${typeof value === 'function' ? value.toString() : JSON.stringify(value)};`).join('\n');
  const code = ts.transpileModule(prefix + '\n' + stripped, {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
  try { return await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`); }
  catch (error) { throw new Error(`Authoring module ${name}: ${error.message}`); }
}

/** Translate legacy IDs once during export; authoring text is never rewritten. */
export function rewriteReferences(value, ids, field = '') {
  const kinds = {questId:'quests',questIds:'quests',npcId:'npcs',speaker:'npcs',addressedTo:'npcs',exerciseId:'exercises',exerciseIds:'exercises',gateExerciseId:'exercises',requiredExerciseIds:'exercises',itemId:'items',itemIds:'items',requiredItemIds:'items',unitId:'units',unitIds:'units',wordIds:'lexemes',requiredWordIds:'lexemes',targetWordId:'lexemes',grammarIds:'grammar'};
  if (typeof value === 'string') return kinds[field] && ids[`${kinds[field]}:${value}`] ? ids[`${kinds[field]}:${value}`] : value;
  if (Array.isArray(value)) return value.map(entry => rewriteReferences(entry, ids, field));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key,rewriteReferences(entry,ids,kinds[field]?field:key)]));
  return value;
}

export async function buildContent(root) {
  const names = ['course.json','story-text.json','dialogue-graphs.json','tr-story.json','tr-course.json','tr-ui.json','expedition-learning.json','minigame-stories.json','legacy-curriculum.json','legacy-course.json','expedition-solutions.json','activity-boards.json','minigame-loop.json','minigame-items.json','placement-dialogue.json'];
  const results = await Promise.all(names.map(name => loadJSON(root, `content/source/${name}`)));
  const [course,story,graphs,trStory,trCourse,trUI,expeditionLearning,miniStories,legacyBase,legacyCourse,solutions,activityBoards,miniLoop,miniItems,placementDialogue] = results;
  const ids = await loadJSON(root,'content/content_ids.json',{});
  const cache = await loadJSON(root,'content/alignments/reviewed.json',{version:1,entries:{}});
  const base = await authoringModule(root,'content.ts');
  const [regions,plans,rooms,residents,beginners,storyModule,lexical,contextual,cinematic,activities,interiorConversations,interiorWordFacts] = await Promise.all([
    authoringModule(root,'expeditions.ts'), authoringModule(root,'expedition-games.ts'),
    authoringModule(root,'interiors.ts',{quests:base.quests,npcs:base.npcs}),
    authoringModule(root,'npc-dialogue.ts',{conditionMet:()=>false}), authoringModule(root,'beginner-dialogue.ts'),
    authoringModule(root,'story.ts',{storyText:story}), authoringModule(root,'i18n-lexical.ts'),
    authoringModule(root,'contextual-grammar.ts'),authoringModule(root,'cinematic-content.ts'),
    authoringModule(root,'activity-engine.ts',{quests:base.quests,seededShuffle:items=>items}),
    authoringModule(root,'interior-conversations.ts'),
    authoringModule(root,'word-detail.ts'),
  ]);
  const records = Object.fromEntries(contentKinds.map(kind => [kind,[]]));
  const recordIndex = Object.fromEntries(contentKinds.map(kind => [kind,new Map()]));
  const add = (kind,slug,body) => {
    const id = contentID(ids,kind,slug);
    const existing = recordIndex[kind].get(slug);
    if (existing) return existing;
    const record = {id,slug,version:1,body:{...body,id}};
    records[kind].push(record); recordIndex[kind].set(slug,record); return record;
  };
  const translatedSentences = new Map(), translatedTexts = new Map();
  for (const entry of Object.values(trStory)) {
    if (entry.de && entry.tr && !translatedSentences.has(entry.de)) translatedSentences.set(entry.de,entry.tr);
    if (entry.en && !entry.de && entry.tr && !translatedTexts.has(entry.en)) translatedTexts.set(entry.en,entry.tr);
  }
  for (const [english,turkish] of Object.entries(trCourse.texts ?? {})) translatedTexts.set(english,turkish);
  for (const entry of Object.values(trCourse.exercises)) {
    if (entry.german && entry.tr.english && !translatedSentences.has(entry.german)) translatedSentences.set(entry.german,entry.tr.english);
    for (const key of ['prompt','hint','explanation','english']) if (entry.source[key] && entry.tr[key] && !translatedTexts.has(entry.source[key])) translatedTexts.set(entry.source[key],entry.tr[key]);
  }
  for (const guide of Object.values(trCourse.grammar)) for (const [german,turkish] of Object.entries(guide.examples)) if (!translatedSentences.has(german)) translatedSentences.set(german,turkish);
  const textTR = value => translatedTexts.get(value) ?? trUI[value] ?? value;
  const translate = (value, vars={}) => textTR(value).replace(/\{(\w+)\}/g,(whole,key)=>key in vars ? String(vars[key]) : whole);

  for (const word of course.lexicon) contentID(ids,'lexemes',word.id);
  for (const guide of course.grammar) contentID(ids,'grammar',guide.id);
  for (const npc of base.npcs) contentID(ids,'npcs',npc.id);
  for (const quest of base.quests) { contentID(ids,'quests',quest.id); contentID(ids,'graphs',quest.id); }
  for (const unit of course.units) contentID(ids,'units',unit.id);
  const allExercises = [...base.quests.flatMap(quest => quest.exercises.map(exercise=>({...exercise,level:quest.level,questId:quest.id}))),...course.exercises,...miniStories.exercises,...expeditionLearning.exercises];
  for (const exercise of allExercises) { contentID(ids,'exercises',exercise.id); contentID(ids,'items',exercise.itemId); }
  for (const graph of graphs) {
    for (const node of graph.nodes) contentID(ids,'nodes',`${graph.questId}:${node.id}`);
    for (const choice of graph.nodes.flatMap(node=>node.choices ?? [])) contentID(ids,'choices',`${graph.questId}:${choice.id}`);
  }
  const lemmaIndex = new Map(), formIndex = new Map();
  for (const word of course.lexicon) {
    const {id:slug,english,...body} = word;
    const exerciseIds = {};
    for (const mode of ['recognition','listening','production']) {
      const id = ids[`exercises:lex-${slug}-${mode}`];
      if (id) exerciseIds[mode] = [id];
    }
    const lexeme = add('lexemes',slug,{...body,itemId:contentID(ids,'items',`word-${slug}`),audio:`/audio/word-${slug}.mp3`,meaning:{en:english,...(trCourse.lexicon[slug]?.tr ? {tr:trCourse.lexicon[slug].tr} : {})},exerciseIds});
    for (const [index,forms] of [[lemmaIndex,[body.lemma]],[formIndex,[body.articleForm,body.plural,...(body.surfaceForms ?? [])]]]) for (const form of forms.filter(Boolean)) {
      const key=normalize(form); if (!index.has(key)) index.set(key,[]); if (!index.get(key).includes(lexeme)) index.get(key).push(lexeme);
    }
  }
  const explicitGloss = (word,meaning) => {
    const key=normalize(word), exact=lemmaIndex.get(key) ?? [], forms=formIndex.get(key) ?? [];
    if (exact.length===1) return exact[0].id;
    if (!exact.length && forms.length===1) return forms[0].id;
    if (!meaning) return;
    const slug=`story:${key}`;
    return add('lexemes',slug,{lemma:word,surfaceForms:[word],level:'A1',pos:'story',topic:'story',meaning:{en:meaning,...(translatedTexts.has(meaning)?{tr:translatedTexts.get(meaning)}:{})}}).id;
  };
  const lexemes = () => new Map(records.lexemes.map(record=>[record.id,record.body]));
  const lineTexts = new Map();
  const addLine = (slug,value,owner={},extra={}) => {
    const german=value.german ?? value.de, english=value.english ?? value.translation ?? value.en;
    if (typeof german !== 'string' || !german) return undefined;
    const turkish=value.turkish ?? translatedSentences.get(german);
    const de=tokenized(german), support={};
    if(typeof english==='string'&&english) support.en={...tokenized(english),align:[]};
    if (turkish) support.tr={...tokenized(turkish),align:[]};
    const glosses = {};
    for (const [index,word] of tokenTexts(de).entries()) {
      const meaning=value.glosses?.[normalize(word)] ?? value.glosses?.[word];
      const lexemeID=explicitGloss(word,meaning);
      if (lexemeID) glosses[index]=lexemeID;
    }
    const visibility={...owner};
    if (!visibility.mapId && visibility.npcId && visibility.level) visibility.mapId=levelMap[visibility.level];
    if (!visibility.mapId && visibility.regionId) visibility.mapId=visibility.regionId;
    const line=applyCachedAlignment({id:contentID(ids,'lines',slug),de,support,...(Object.keys(glosses).length?{glosses}:{}),...rewriteReferences(visibility,ids),...rewriteReferences(extra,ids)},cache);
    if (['reviewed','authored'].includes(line.alignmentStatus)) {
      const failures=validateAlignment(line,{lexemes:lexemes()});
      if (failures.length) throw new Error(`${slug}: ${failures.join('\n')}`);
    }
    const record=add('lines',slug,line); lineTexts.set(german,record.id); return record.id;
  };
  const replacePairs = (value,slug,owner) => {
    if (Array.isArray(value)) return value.map((entry,index)=>replacePairs(entry,`${slug}:${index}`,owner));
    if (!value || typeof value !== 'object') return value;
    if (typeof value.german==='string' && typeof (value.english ?? value.translation)==='string') return {lineId:addLine(slug,value,owner)};
    return Object.fromEntries(Object.entries(value).map(([key,entry])=>[key,replacePairs(entry,`${slug}:${key}`,owner)]));
  };
  const lineRef = (value,owner) => {
    const {german,english,glosses:rawGlosses,variants,reply,...extra}=value;
    const slug=value.id;
    if (variants) extra.variantIds=variants.map((variant,index)=>addLine(`${slug}:variant:${index}`,variant,owner,{...variant, german:undefined,english:undefined, parentLineId:contentID(ids,'lines',slug)}));
    if (reply) extra.reply={...rewriteReferences(reply,ids),...(reply.correction?{correction:undefined,correctionLineId:addLine(reply.correction.id,reply.correction,owner,{speaker:reply.correction.speaker,clipId:reply.correction.clipId})}:{})};
    const id=addLine(slug,{german,english,glosses:rawGlosses},owner,extra);
    return {id,...(value.condition?{condition:value.condition}:{}),...(extra.reply?{reply:extra.reply}:{}),...(extra.variantIds?{variantIds:extra.variantIds}:{})};
  };
  for (const graph of graphs) {
    const questId=contentID(ids,'quests',graph.questId),graphId=contentID(ids,'graphs',graph.questId);
    const nodes=graph.nodes.map(node=>{
      const nodeId=contentID(ids,'nodes',`${graph.questId}:${node.id}`),owner={questId,nodeId,stage:node.stage,level:graph.level};
      const lineRefs=node.lines.map(line=>lineRef(line,owner));
      const choices=(node.choices ?? []).map(choice=>{
        const {id:localId,german,english,...rest}=choice;
        const choiceId=contentID(ids,'choices',`${graph.questId}:${localId}`);
        const lineId=addLine(`${graph.questId}:choice:${localId}`,{german,english},owner,{choiceId});
        return add('choices',`${graph.questId}:${localId}`,{...rest,localId,questId,nodeId,lineId,next:contentID(ids,'nodes',`${graph.questId}:${choice.next}`)}).id;
      });
      const {lines,choices:rawChoices,id:localId,next,...rest}=node;
      const body={...rewriteReferences(rest,ids),localId,questId,graphId,lineIds:lineRefs.map(line=>line.id),lineRefs,choiceIds:choices,...(next?{next:contentID(ids,'nodes',`${graph.questId}:${next}`)}:{})};
      return add('nodes',`${graph.questId}:${node.id}`,body).body;
    });
    const topics=(graph.topics ?? []).map(topic=>{
      const owner={questId,stage:'intro',level:graph.level};
      return {id:contentID(ids,'choices',`${graph.questId}:topic:${topic.id}`),lineId:addLine(`${graph.questId}:topic:${topic.id}`,topic,owner),lineRefs:topic.lines.map(line=>lineRef(line,owner))};
    });
    const investigations=(graph.investigations ?? []).map(item=>({objectId:item.objectId,lineId:addLine(`${graph.questId}:investigation:${item.objectId}`,item,{questId,stage:'intro',level:graph.level})}));
    const {nodes:rawNodes,topics:rawTopics,investigations:rawInvestigations,introducedWords,...rest}=graph;
    add('graphs',graph.questId,{...rewriteReferences(rest,ids),start:contentID(ids,'nodes',`${graph.questId}:${graph.start}`),nodes,topics,investigations});
  }
  for (const exercise of allExercises) {
    const {id:slug,english,...body}=exercise;
    const exact=trCourse.exercises[slug];
    const generated=lexical.generatedLexicalExerciseText({...exercise,english},trCourse.lexicon,translate);
    const tr=exact && exact.german===exercise.german ? exact.tr : generated;
    const support={en:{english,prompt:exercise.prompt,hint:exercise.hint,explanation:exercise.explanation}};
    if (tr) support.tr={...tr,...(exact?.options?{options:exact.options}:{})};
    const guidedChoices=(beginners.beginnerGateTranslations[slug] ?? []).map(([german,english])=>({german,english,turkish:translatedSentences.get(german) ?? textTR(english)}));
    const optionMeanings=Object.fromEntries((exercise.options ?? []).filter(option=>beginners.greetingMeanings[option]).map(option=>[option,beginners.greetingMeanings[option]]));
    if(Object.keys(optionMeanings).length){support.en.optionMeanings=optionMeanings;support.tr??={};support.tr.optionMeanings=Object.fromEntries(Object.entries(optionMeanings).map(([option,english])=>[option,translatedSentences.get(option)??textTR(english)]));}
    const exampleLineId=addLine(`exercise:${slug}`,{german:exercise.german,english,turkish:tr?.english},{exerciseId:slug,...(exercise.questId?{questId:exercise.questId}:{}),...(exercise.unitId?{unitId:exercise.unitId}:{}),level:exercise.level, ...(exercise.regionId?{regionId:exercise.regionId}:{}),...(exercise.miniGameId?{miniGameId:exercise.miniGameId}:{})});
    const record=add('exercises',slug,{...rewriteReferences(body,ids),audioPath:`/audio/${slug}.mp3`,support,...(guidedChoices.length?{guidedChoices}:{}),...(exampleLineId?{exampleLineId}:{})});
    if(placementDialogue[slug]){
      const context=placementDialogue[slug];
      record.body.placementLineId=addLine(`placement:${slug}`,context,{exerciseId:slug,placement:true,level:exercise.level});
      record.body.placementSpeaker=context.speaker;
    }
    const item=add('items',exercise.itemId,{level:exercise.level,exerciseIds:[]});
    if (!item.body.exerciseIds.includes(record.id)) item.body.exerciseIds.push(record.id);
  }
  for (const quest of base.quests) {
    const {id:slug,exercises,story:rawStory,...rest}=quest;
    const storyLines=replacePairs(rawStory,`quest:${slug}:story`,{questId:slug,level:quest.level});
    add('quests',slug,{...rewriteReferences(rest,ids),story:storyLines,graphId:contentID(ids,'graphs',slug),exerciseIds:exercises.map(exercise=>contentID(ids,'exercises',exercise.id)),support:{en:{title:quest.title,subtitle:quest.subtitle,objectives:quest.objectives},tr:{title:textTR(quest.title),subtitle:textTR(quest.subtitle),objectives:quest.objectives.map(textTR)}}});
  }
  for (const npc of base.npcs) {
    const {id:slug,greeting,greetingSentences,...rest}=npc;
    const greetingLines=replacePairs(greetingSentences ?? [],`npc:${slug}:greeting`,{npcId:slug,level:'A1'});
    add('npcs',slug,{...rest,greetingLineIds:greetingLines.map(line=>line.lineId),support:{en:{role:npc.role},tr:{role:textTR(npc.role)}}});
    const states=[{flags:{},reputation:{lamplighters:0,unwritten:0,brassOffice:0}},{flags:{'quest:b1-work':true,'quest:a2-archive':true},reputation:{lamplighters:3,unwritten:3,brassOffice:0}}];
    for (const level of ['A1','A2','B1']) for (const [index,state] of states.entries()) for (const line of residents.residentConversation(npc,level,state)) addLine(`resident:${line.id}:state:${index}`,line,{npcId:slug,level},{speaker:slug,clipId:line.clipId,condition:state.flags});
    for (const title of ['Lantern Bearer','Lamplighter','Route Keeper','Atlas Keeper']) {
      const line=residents.earnedTitleGreeting(npc,title); if (line) addLine(`resident:${line.id}`,line,{npcId:slug,level:'A1'},{speaker:slug,clipId:line.clipId,title});
    }
  }
  for (const line of residents.ambientCallbackLines()) addLine(`ambient:${line.id}`,line,{npcId:line.speaker,level:line.id.includes('-B1-')?'B1':line.id.includes('-A2-')?'A2':'A1'},{speaker:line.speaker,clipId:line.clipId});
  for (const [exerciseId,pairs] of Object.entries(beginners.beginnerGateTranslations)) for (const [index,[german,english]] of pairs.entries()) addLine(`beginner:${exerciseId}:${index}`,{german,english},{exerciseId,questId:allExercises.find(exercise=>exercise.id===exerciseId)?.questId,level:'A1'});
  for (const [german,english] of Object.entries(beginners.greetingMeanings)) addLine(`greeting:${german}`,{german,english},{level:'A1',mapId:'lindenhafen'});
  for (const unit of course.units) add('units',unit.id,{...rewriteReferences(unit,ids),support:{en:{title:unit.title,summary:unit.summary},tr:{title:textTR(unit.title),summary:textTR(unit.summary)}}});
  for (const guide of course.grammar) add('grammar',guide.id,{...guide,id:undefined,examples:replacePairs(guide.examples,`grammar:${guide.id}`,{level:guide.level,unitId:course.units.find(unit=>unit.grammarIds.includes(guide.id))?.id}),support:{en:{title:guide.title,explanation:guide.explanation},tr:{title:trCourse.grammar[guide.id]?.title?.[1] ?? textTR(guide.title),explanation:trCourse.grammar[guide.id]?.explanation?.[1] ?? textTR(guide.explanation)}}});
  for (const act of story.acts) add('narratives',`act:${act.mapId}`,{...replacePairs(act,`act:${act.mapId}`,{mapId:act.mapId,level:act.level,act:true}),kind:'act'});
  for (const clue of story.clues) add('narratives',`clue:${clue.questId}`,{...rewriteReferences(replacePairs(clue,`clue:${clue.questId}`,{questId:clue.questId,completedOnly:true}),ids),kind:'clue'});
  for (const [slug,body] of Object.entries(story.objects)) {
    const mapId=slug.split('-')[0], replaced=replacePairs(body,`object:${slug}`,{objectId:slug,mapId});
    add('narratives',`object:${slug}`,{...replaced,kind:'object',objectId:slug,mapId,lineIds:nestedLineIDs(replaced)});
  }
  for (const [slug,body] of Object.entries(storyModule.journalNarratives)) {
    const mapId=['observatoryWaiting','routeRestored'].includes(slug)?'nebelstadt':'lindenhafen',lines=replacePairs(body,`journal:${slug}`,{journal:true,mapId});
    add('narratives',`journal:${slug}`,{key:slug,lines,lineIds:nestedLineIDs(lines),mapId,kind:'journal'});
  }
  for (const region of regions.expeditionRegions) {
    const encounters=region.encounters.map(encounter=>{
      const lineId=addLine(`expedition:${encounter.id}`,encounter,{regionId:region.id,level:encounter.difficulty});
      const {german,translation,...rest}=encounter;
      return {...rest,lineId};
    });
    const {encounters:rawEncounters,...rest}=region;
    add('expeditions',region.id,{...rest,mapId:region.id,encounters,exerciseIds:expeditionLearning.exercises.filter(exercise=>exercise.regionId===region.id).map(exercise=>contentID(ids,'exercises',exercise.id))});
    for (const encounter of encounters) {
      const rawLearning=expeditionLearning.encounters.find(row=>row.encounterId===encounter.id);
      const learning=rawLearning?{...rawLearning,encounterId:contentID(ids,'expeditions',encounter.id)}:undefined;
      const learningExercises=expeditionLearning.exercises.filter(exercise=>exercise.contentId===encounter.id).map(({answer,acceptedAnswers,explanation,...exercise})=>({...exercise,id:contentID(ids,'exercises',exercise.id),contentId:contentID(ids,'expeditions',encounter.id)}));
      add('expeditions',encounter.id,{...encounter,mapId:region.id,regionId:region.id,level:encounter.difficulty,kind:'encounter',learning:rewriteReferences(learning,ids),learningExercises:rewriteReferences(learningExercises,ids)});
    }
  }
  for (const plan of plans.expeditionGames) {
    const {validate,meter,solution,german,...body}=plan;
    const learning=expeditionLearning.placements.filter(row=>row.mapId===plan.id).map(({allowedValues,rationale,sourceGerman,...row})=>row);
    const learningExercises=expeditionLearning.exercises.filter(exercise=>exercise.miniGameId==='neighborhood-boards'&&exercise.regionId===plan.id).map(({answer,acceptedAnswers,explanation,...exercise})=>({...exercise,id:contentID(ids,'exercises',exercise.id)}));
    add('minigames',`plan:${plan.id}`,{...replacePairs(body,`plan:${plan.id}`,{regionId:plan.id}),mapId:plan.id,regionId:plan.id,kind:'plan',german,solution,validValues:solutions.games.find(game=>game.id===plan.id)?.validValues,learning:rewriteReferences(learning,ids),learningExercises:rewriteReferences(learningExercises,ids)});
  }
  for (const [slug,body] of Object.entries(miniStories.games)) add('minigames',slug,{...rewriteReferences(replacePairs(body,`minigame:${slug}`,{questId:body.questId,miniGameId:slug}),ids),kind:'story',exerciseIds:miniStories.exercises.filter(exercise=>exercise.miniGameId===slug).map(exercise=>contentID(ids,'exercises',exercise.id))});
  add('minigames','looping-tape',{kind:'loop',questId:contentID(ids,'quests','b1-witness'),clips:miniLoop.clips.map(({text,source,sourceSha256,...clip})=>rewriteReferences(clip,ids)),exerciseIds:miniLoop.clips.map(clip=>contentID(ids,'exercises',clip.exerciseId))});
  for (const room of rooms.interiors) for (const object of room.objects) {
    const body={...object,exerciseIds:object.exerciseIds.map(id=>contentID(ids,'exercises',id)),npcId:object.npcId ? contentID(ids,'npcs',object.npcId):undefined};
    body.vocabulary=object.vocabulary.map((word,index)=>{
      const turkish=interiorWordFacts.interiorMeanings[word.lemma],owner={mapId:'lindenhafen',interiorId:room.id,objectId:object.id,level:'A1'};
      const forms=new Set([word.lemma,...(word.plural.match(/\p{L}+/gu)??[]).filter(word=>word!=='die')].map(normalize));
      const conversation=interiorConversations.interiorConversations.find(value=>value.objectId===object.id);
      const example=conversation?Object.values(conversation.nodes).flatMap(node=>[node.line,...node.choices.map(choice=>choice.line)]).find(line=>tokenTexts(tokenized(line.german)).some(word=>forms.has(normalize(word)))):undefined;
      const extra=interiorWordFacts.extraInteriorExamples[word.lemma];
      const exampleLineId=example?addLine(`interior:${object.id}:example:${index}`,example,owner):extra?addLine(`interior:${object.id}:example:${index}`,{german:extra[0],english:extra[1],turkish:extra[2]},owner):undefined;
      return {lexemeId:explicitGloss(word.lemma,word.english),article:word.article,lemma:word.lemma,plural:word.plural,meaning:{en:word.english,...(turkish?{tr:turkish}:{})},lineId:addLine(`interior:${object.id}:word:${index}`,{german:`${word.article} ${word.lemma}`.trim(),english:word.english,turkish},owner),...(exampleLineId?{exampleLineId}:{})};
    });
    add('narratives',`interior:${object.id}`,{...body,kind:'interior',mapId:'lindenhafen',interiorId:room.id,lineIds:nestedLineIDs(body.vocabulary)});
  }
  for(const conversation of interiorConversations.interiorConversations){
    const slug=`interior-conversation:${conversation.objectId}`,narrativeId=contentID(ids,'narratives',slug),prefix=`interior-conversation:${conversation.objectId}`;
    const nodes=Object.fromEntries(Object.entries(conversation.nodes).map(([localId,node])=>{
      const nodeId=contentID(ids,'nodes',`${prefix}:${localId}`),owner={mapId:'lindenhafen',interiorId:conversation.objectId.split(':')[1],objectId:conversation.objectId,narrativeId,narrativeNodeId:nodeId,level:'A1'};
      const lineId=addLine(`${prefix}:${localId}`,node.line,owner);
      const choices=node.choices.map(choice=>{
        const slug=`${prefix}:${localId}:${choice.id}`,lineId=addLine(`${prefix}:${localId}:choice:${choice.id}`,choice.line,owner),next=contentID(ids,'nodes',`${prefix}:${choice.next}`);
        const record=add('choices',slug,{narrativeId,nodeId,mapId:'lindenhafen',localId:choice.id,lineId,next});
        return {id:record.id,line:{lineId},next};
      });
      add('nodes',`${prefix}:${localId}`,{narrativeId,mapId:'lindenhafen',localId,lineIds:[lineId,...choices.map(choice=>choice.line.lineId)],choiceIds:choices.map(choice=>choice.id)});
      return [nodeId,{id:nodeId,line:{lineId},choices}];
    }));
    add('narratives',slug,{kind:'interior-conversation',mapId:'lindenhafen',objectId:conversation.objectId,npcId:contentID(ids,'npcs',conversation.npcId),name:conversation.name,role:conversation.role,title:conversation.title,start:contentID(ids,'nodes',`${prefix}:${conversation.start}`),nodes,lineIds:nestedLineIDs(nodes),support:{en:{role:conversation.role.english,title:conversation.title.english},tr:{role:conversation.role.turkish,title:conversation.title.turkish}}});
  }
  // Overlay-only resident variations are retained with their exact English source when available.
  for (const [slug,value] of Object.entries(trStory)) if (value.de && value.en && !lineTexts.has(value.de)) {
    const questSlug=slug.split(':').find(part=>base.quests.some(quest=>quest.id===part));
    addLine(`overlay:${slug}`,value,{level:'A1',source:slug,...(questSlug?{questId:questSlug}:{mapId:'lindenhafen'})});
  }
  for(const [questSlug,note] of Object.entries(contextual.notes)){
    const quest=base.quests.find(quest=>quest.id===questSlug),guide=course.grammar.find(guide=>guide.id===note.guideId);
    const lineId=addLine(`grammar-note:${questSlug}`,note,{questId:questSlug,level:quest?.level??'A1'});
    add('narratives',`grammar:${questSlug}`,{kind:'contextual-grammar',questId:contentID(ids,'quests',questSlug),guideId:contentID(ids,'grammar',note.guideId),line:{lineId},clipId:`grammar-${questSlug}`,title:guide?.title,instruction:guide?.explanation,support:{en:{title:guide?.title,instruction:guide?.explanation},tr:{title:trCourse.grammar[note.guideId]?.title?.[1]??textTR(guide?.title??''),instruction:trCourse.grammar[note.guideId]?.explanation?.[1]??textTR(guide?.explanation??''),note:trCourse.grammar[note.guideId]?.note}}});
  }
  const cinematicGates={arrival:'',platform:'a1-arrival',recording:'a1-station',erasure:'a1-lost-parcel',clockmill:'a2-broken-clock',confession:'a2-archive','dark-beam':'b1-new-route',ledger:'b1-work',storm:'b1-storm',bell:'b1-atlas',travel:''};
  for(const mapId of ['lindenhafen','waldruh','nebelstadt'])for(const [kind,gate] of Object.entries(cinematicGates))for(const ending of kind==='bell'?[undefined,...cinematic.endingIds]:[undefined]){
    const slug=`cinematic:${kind}:${mapId}${ending?':'+ending:''}`,owner={mapId,...(gate?{questId:gate,completedOnly:true}:{}),...(ending?{ending}:{})};
    const beats=cinematic.cinematicBeats(kind,mapId,ending).map((beat,index)=>{
      const entry=Object.values(trStory).find(entry=>entry.de===beat.german),lineId=addLine(`${slug}:${index}`,{german:beat.german,english:entry?.en,turkish:entry?.tr},owner);
      const {german,...physical}=beat;return {...physical,clipId:beat.clipId??`cinematic-${kind}-${index}`,line:{lineId}};
    });
    add('narratives',slug,{kind:'cinematic',cutsceneKind:kind,...rewriteReferences(owner,ids),beats});
  }
  for(const scenario of activities.activityScenarios){
    const id=contentID(ids,'minigames',scenario.id),lineId=addLine(`activity:${scenario.id}`,{german:scenario.german},{mapId:levelMap[scenario.level],activityId:scenario.activityId,level:scenario.level});
    add('minigames',scenario.id,{...rewriteReferences(scenario,ids),id,audioId:scenario.id,kind:'activity-scenario',mapId:levelMap[scenario.level],lineId});
  }
  for(const definition of activities.activityDefinitions)for(const level of ['A1','A2','B1']){
    const scenarios=activities.activityScenarios.filter(scenario=>scenario.activityId===definition.id&&scenario.level===level).map(scenario=>recordIndex.minigames.get(scenario.id).body);
    add('minigames',`activity:${definition.id}:${level}`,{kind:'activity',activityId:definition.id,mapId:levelMap[level],level,scenarios,inventory:activities.inventory});
  }
  const grading={};
  for (const key of ['quests','items','exercises','lexicon','units']) {
    const merged=new Map([...(legacyBase[key] ?? []),...(legacyCourse[key] ?? [])].map(value=>[value.id,value]));
    if (key==='exercises') for (const exercise of allExercises) merged.set(exercise.id,{...merged.get(exercise.id),...exercise,mode:({choice:'recognition',listen:'listening',sentence:'production',type:'production'})[exercise.mode] ?? exercise.mode});
    if (key==='lexicon') for (const word of course.lexicon) merged.set(word.id,word);
    if (key==='units') for (const unit of course.units) merged.set(unit.id,unit);
    grading[key]=[...merged.values()];
  }
  for (const key of ['contextWordIds','activityWordIds','npcWordIds']) grading[key]=course[key] ?? {};
  for (const kind of contentKinds) records[kind]=records[kind].map(record=>({...record,body:rewriteReferences(record.body,ids),...(kind==='narratives'?{body:{...rewriteReferences(record.body,ids),lineIds:record.body.lineIds ?? nestedLineIDs(record.body)}}:{})}));
  const counts=Object.fromEntries(contentKinds.map(kind=>[kind,records[kind].length]));
  const coverage={lines:records.lines.length,translations:records.lines.reduce((sum,record)=>sum+Object.keys(record.body.support).length,0),reviewed:records.lines.filter(record=>record.body.alignmentStatus==='reviewed').length,authored:records.lines.filter(record=>record.body.alignmentStatus==='authored').length,turkish:records.lines.filter(record=>record.body.support.tr).length};
  const artifact={version:1,records,grading,metadata:{edition:course.edition,sources:course.sources,chapters:base.chapters,counts,alignmentCoverage:coverage},resources:{activityBoards,expeditionSolutions:solutions,expeditionLearning:rewriteReferences(expeditionLearning,ids),minigameStories:rewriteReferences(miniStories,ids),minigameLoop:miniLoop,minigameItems:miniItems}};
  const objectPresentation=object=>{
    const {description,german,english,prompt,translation,choices,response,...physical}=object;
    return {...physical,description:''};
  };
  const expeditionPresentation={version:1,
    regions:regions.expeditionRegions.map(region=>({
      id:region.id,recordId:contentID(ids,'expeditions',region.id),name:region.name,subtitle:region.subtitle,
      description:'',culture:'',feeling:'',languageFocus:'',
      npcs:region.npcs.map(({greeting,description,relationship,relationships,...npc})=>({...npc,greeting:'',description:'',relationship:'',relationships:[]})),
      objects:region.objects.map(objectPresentation),
      encounters:region.encounters.map(encounter=>({id:encounter.id,recordId:contentID(ids,'expeditions',encounter.id),title:encounter.title,difficulty:encounter.difficulty,gameKind:encounter.gameKind,prompt:'',german:'',translation:'',choices:[],languageFocus:''})),
    })),
    layouts:regions.expeditionLayouts,
    maps:regions.expeditionMaps.map(({description,objects,...map})=>({...map,description:'',objects:objects.map(objectPresentation)})),
    landPlots:regions.expeditionLandPlots,placements:regions.expeditionPlacements,residents:regions.expeditionResidentSpecs,
    plans:plans.expeditionGames.map(plan=>({id:plan.id,recordId:contentID(ids,'minigames',`plan:${plan.id}`),title:plan.title})),
  };
  const interiorPresentation={version:1,interiors:rooms.interiors.map(room=>{
    const {description,objects,...physical}=room;
    return {...physical,description:'',npcs:room.npcs.map(npc=>({...npc})),objects:objects.map(object=>{
      const {sessionTitle,prompt,description,dialogue,vocabulary,exerciseIds,...skeleton}=object;
      return {...skeleton,npcId:object.npcId,narrativeId:contentID(ids,'narratives',`interior:${object.id}`),sessionTitle:'',prompt:'',description:'',exerciseIds:exerciseIds.map(id=>ids[`exercises:${id}`]),vocabulary:[]};
    })};
  })};
  return {artifact:JSON.parse(JSON.stringify(artifact)),ids,coverage,presentation:JSON.parse(JSON.stringify({expeditions:expeditionPresentation,interiors:interiorPresentation}))};
}

export async function exportContent(root) {
  const {artifact,ids,coverage,presentation}=await buildContent(root);
  await mkdir(resolve(root,'content'),{recursive:true});
  await writeFile(resolve(root,'content/content_ids.json'),JSON.stringify(Object.fromEntries(Object.entries(ids).sort(([a],[b])=>a.localeCompare(b))),null,2)+'\n');
  await writeFile(resolve(root,'server/content.json'),JSON.stringify(artifact)+'\n');
  await writeFile(resolve(root,'content/inventory.json'),JSON.stringify({version:1,counts:artifact.metadata.counts,alignmentCoverage:coverage},null,2)+'\n');
  await writeFile(resolve(root,'web/src/data/expedition-presentation.json'),JSON.stringify(presentation.expeditions)+'\n');
  await writeFile(resolve(root,'web/src/data/interior-presentation.json'),JSON.stringify(presentation.interiors)+'\n');
  return {artifact,ids,coverage};
}

if (process.argv[1]?.endsWith('/export-content.mjs')) {
  const result=await exportContent(resolve(import.meta.dirname,'..'));
  process.stdout.write(`Exported ${result.coverage.lines} lines, ${result.artifact.records.exercises.length} exercises and ${result.artifact.records.lexemes.length} lexemes; ${result.coverage.reviewed} reviewed alignments.\n`);
}
