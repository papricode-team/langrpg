import { readFileSync,writeFileSync,renameSync,existsSync } from 'node:fs';
import { resolve,dirname,posix } from 'node:path';
import ts from 'typescript';

export const publicLearningManifestPaths=[
  '/audio/manifest.json','/audio/minigames-manifest.json','/audio/dialogue/manifest.json',
  '/audio/minigames/loop-manifest.json','/assets/minigames/items-manifest.json',
];
const publicLearningFields=new Set(['text','german','english','answer','acceptedAnswers','explanation','correctedAnswer','correctAnswer','answers','modelAnswer','sourceGerman','sourceText','translation','translations','meanings','glosses','words','lemma','article','articleForm','plural','surfaceForms','forms','example','prompt','hint']);
const privateLearningJSON=/^(?:data\/(?:course(?:-[^/]+)?|dialogue-graphs|story-text|syllabus|expedition-learning(?:-runtime)?)\.json|data\/i18n\/(?:tr-course|tr-story)\.json|minigames\/(?:item-data|audio-data|story-scripts|loop-data)\.json)$/;
const retainedLearningModules=new Set(['content.ts','course.ts','quest-graph.ts','story.ts','story-panels.ts','learning-context.ts','npc-dialogue.ts','activity-engine.ts','activity-stories.ts','beginner-dialogue.ts','contextual-grammar.ts','expeditions.ts','expedition-games.ts','interiors.ts','interior-conversations.ts','word-detail.ts','story-glossary.ts','cinematic-content.ts','world-routines.ts','i18n-tr.ts','minigames/catalogue.ts','minigames/scripted-stories.ts','minigames/item-manifest.ts']);
/** Vite may serve files directly; only the retained learning authoring banks are blocked. */
export function privateDevelopmentRequest(requestURL,root,{webRoot=resolve(root,'web')}={}) {
  let url,path;try{url=new URL(requestURL,'http://localhost');path=posix.normalize(decodeURIComponent(url.pathname));}catch{return false;}
  const file=path.startsWith('/@fs/')?resolve('/'+path.slice('/@fs/'.length)):resolve(webRoot,path.slice(1));
  const content=resolve(root,'content'),server=resolve(root,'server');
  if(file===resolve(root,'content_ids.json')||file.startsWith(content+'/')||file.startsWith(server+'/')&&file.endsWith('.json'))return true;
  const source=resolve(root,'web/src')+'/';
  if(!file.startsWith(source))return false;
  const relative=file.slice(source.length);
  if(privateLearningJSON.test(relative))return true;
  if(relative==='test-fixtures/content-public.json')return url.searchParams.has('raw')||url.searchParams.has('url')||!url.searchParams.has('import');
  return (url.searchParams.has('raw')||url.searchParams.has('url'))&&retainedLearningModules.has(relative);
}
/** Public manifests describe media; their authoring transcripts/facts stay private. */
export function redactPublicManifest(value,{artwork=false}={}) {
  if(Array.isArray(value))return value.map(item=>redactPublicManifest(item,{artwork}));
  if(!value||typeof value!=='object')return value;
  return Object.fromEntries(Object.entries(value).filter(([key])=>!publicLearningFields.has(key)&&!(artwork&&['subject','level','topic','domain'].includes(key))).map(([key,item])=>[key,redactPublicManifest(item,{artwork})]));
}
export function redactDistributedManifests(directory) {
  const changed=[];
  for(const url of publicLearningManifestPaths) {
    const path=resolve(directory,url.slice(1));if(!existsSync(path))continue;
    const redacted=redactPublicManifest(JSON.parse(readFileSync(path,'utf8')),{artwork:url.startsWith('/assets/')});
    writeFileSync(path+'.tmp',JSON.stringify(redacted)+'\n');renameSync(path+'.tmp',path);changed.push(url);
  }
  return changed;
}

/** Authoring modules stay available to content tools; the browser uses server registries. */
export function contentRuntimePlugin(root) {
  const runtime = resolve(root, 'web/src/content-runtime.ts');
  let distribution=resolve(root,'web/dist'),publicDirectory=resolve(root,'web/public'),webRoot=resolve(root,'web');
  let source;
  const snapshot = () => source ??= JSON.parse(readFileSync(resolve(root, 'content/source.json'), 'utf8'));
  let identities;
  const catalog=()=>identities??=JSON.parse(readFileSync(resolve(root,'content_ids.json'),'utf8'));
  const identityKinds=['exercise','quest','unit','lexeme','item','choice'];
  const identity = value => {
    const ids=catalog();
    for(const kind of identityKinds)if(ids[`${kind}:${value}`])return ids[`${kind}:${value}`];
    for(const prefix of ['quest:','hint:','reply:','reply-help:','answer-help:','exercise:','word:'])if(value.startsWith(prefix)){const tail=value.slice(prefix.length);for(const kind of identityKinds)if(ids[`${kind}:${tail}`])return prefix+ids[`${kind}:${tail}`];}
    return value;
  };
  const initializers = {
    'content.ts': { npcs: 'npcs', chapters: 'chapters', quests: 'quests', vocabulary: 'vocabulary' },
    'course.ts': { courseSources: 'courseSources', courseLexicon: 'courseLexicon', courseUnits: 'courseUnits', courseGrammar: 'courseGrammar', courseExercises: 'courseExercises' },
    'quest-graph.ts': { questGraphs: 'questGraphs' },
    'story.ts': { storyActs: 'storyActs', storyClues: 'storyClues' },
    'npc-dialogue.ts': { ambientCallbacks: 'ambientCallbacks' },
    'activity-engine.ts': { activityDefinitions: 'activityDefinitions', scenarios: 'activityScenarios', activityScenarios: 'activityScenarios', activityAudioJobs: 'activityAudioJobs' },
    'expedition-games.ts': { expeditionGames: 'expeditionGames' },
    'minigames/catalogue.ts': {miniGameDefinitions:'miniGameDefinitions'},
    'minigames/scripted-stories.ts': { canonicalStoryExercises: 'canonicalStoryExercises', scriptedStoryExercises: 'scriptedStoryExercises' },
    'interior-conversations.ts': {interiorConversations:'interiorConversations'},
  };
  const objects = {
    'story.ts': { objectStories: 'objectStories', journalNarratives: 'journalNarratives' },
    'story-panels.ts': { specialItems: 'specialItems', endings: 'storyEndings' },
    'learning-context.ts': { placementDialogue: 'placementDialogue' },
    'contextual-grammar.ts': { notes: 'contextualGrammar' },
    'beginner-dialogue.ts': { beginnerGateTranslations: 'beginnerGateTranslations', greetingMeanings: 'greetingMeanings' },
    'activity-stories.ts': { activityDiscoveries: 'activityDiscoveries' },
    'activity-engine.ts': { inventory: 'activityInventory' },
    'world-routines.ts': {npcRoutines:'npcRoutines'},
    'story-glossary.ts': {baseStoryGlossary:'storyGlossary',storyGlossary:'storyGlossary'},
    'word-detail.ts': {interiorMeanings:'interiorMeanings',extraInteriorExamples:'extraInteriorExamples'},
  };
  const dataImports = {
    'data/course-meta.json': ['courseData', { edition: '', sources: [], lexicon: [], units: [], grammar: [], contextWordIds: {}, activityWordIds: {}, npcWordIds: {}, referenceCoverage: {} }],
    'data/course-exercises-a1.json': ['courseA1', { indices: [], exercises: [] }],
    'data/course-exercises-a2.json': ['courseA2', { indices: [], exercises: [] }],
    'data/course-exercises-b1.json': ['courseB1', { indices: [], exercises: [] }],
    'data/dialogue-graphs.json': ['questGraphs', []],
    'data/story-text.json': ['storyText', { acts: [], clues: [], objects: {} }],
    'data/syllabus.json': ['syllabus', { version: '', wordsPerHour: 10, openingWords: 10, bankCap: 15, storyShare: .5, brake: { maxUnsettled: 12, maxDue: 20 }, wordIds: [], quests: [] }],
    'data/expedition-learning-runtime.json': ['expeditionLearning', { encounters: [], placements: [], exercises: [] }],
    'story-scripts.json': ['miniGameScripts', { games: { 'lost-hour': {}, 'seed-packets': {}, '17-59': {} }, exercises: [], audio: [] }],
    'loop-data.json': ['loopData', { clips: [] }],
  };
  const call = (name, ...args) => ts.factory.createCallExpression(ts.factory.createIdentifier(name), undefined, args.map(value => typeof value === 'string' ? ts.factory.createStringLiteral(value) : value));
  // Build synthesized nodes rather than reusing source offsets from another
  // SourceFile. Reused offsets can make the printer silently emit wrong strings.
  const literal = value => {
    if(value===undefined)return ts.factory.createIdentifier('undefined');
    if(value===null)return ts.factory.createNull();
    if(typeof value==='string')return ts.factory.createStringLiteral(value);
    if(typeof value==='boolean')return value?ts.factory.createTrue():ts.factory.createFalse();
    if(typeof value==='number')return value<0?ts.factory.createPrefixUnaryExpression(ts.SyntaxKind.MinusToken,ts.factory.createNumericLiteral(-value)):ts.factory.createNumericLiteral(value);
    if(Array.isArray(value))return ts.factory.createArrayLiteralExpression(value.map(literal));
    return ts.factory.createObjectLiteralExpression(Object.entries(value).map(([key,item])=>ts.factory.createPropertyAssignment(ts.factory.createStringLiteral(key),literal(item))));
  };
  const parsedBody=source=> {
    const block=ts.getSynthesizedDeepClone(ts.createSourceFile('body.ts',`function body(){${source}}`,ts.ScriptTarget.Latest,true).statements[0].body);
    const detach=node=> {
      ts.setTextRange(node,{pos:-1,end:-1});node.original=undefined;
      ts.forEachChild(node,detach,array=>{ts.setTextRange(array,{pos:-1,end:-1});array.forEach(detach);});
    };
    detach(block);return block;
  };
  const jsonPresentation=(path)=> {
    const value=JSON.parse(readFileSync(resolve(root,'web/src',path),'utf8'));
    return JSON.parse(JSON.stringify(value,(key,item)=> {
      if(path.endsWith('item-data.json')&&['lemma','article','plural','level','topic','provenance','missing'].includes(key))return undefined;
      if(path.endsWith('audio-data.json')&&key==='text')return undefined;
      return typeof item==='string'&&key==='lexemeId'?identity(item):item;
    }));
  };
  return {
    name: 'atlas-server-content', enforce: 'pre',
    configResolved(config) {
      webRoot=config.root;
      distribution=resolve(config.root,config.build.outDir);
      if(typeof config.publicDir==='string')publicDirectory=resolve(config.root,config.publicDir);
    },
    configureServer(server) {
      server.middlewares.use((request,response,next)=> {
        if(privateDevelopmentRequest(request.url??'/',root,{webRoot})){response.statusCode=403;response.setHeader('Cache-Control','no-store');response.end('Learning authoring data is served through the authenticated content API.');return;}
        let url;try{url=posix.normalize(decodeURIComponent((request.url??'').split('?')[0]));}catch{next();return;}
        if(url.startsWith('/@fs/')) {
          const absolute='/'+url.slice('/@fs/'.length);
          url=publicLearningManifestPaths.find(candidate=>resolve(publicDirectory,candidate.slice(1))===absolute)??url;
        }
        if(!publicLearningManifestPaths.includes(url)){next();return;}
        const path=resolve(publicDirectory,url.slice(1));if(!existsSync(path)){next();return;}
        if(!['GET','HEAD'].includes(request.method??'GET')){response.statusCode=405;response.setHeader('Allow','GET, HEAD');response.end();return;}
        try {
          const body=JSON.stringify(redactPublicManifest(JSON.parse(readFileSync(path,'utf8')),{artwork:url.startsWith('/assets/')}))+'\n';
          response.statusCode=200;response.setHeader('Content-Type','application/json; charset=utf-8');response.setHeader('Cache-Control','no-store');response.setHeader('Content-Length',Buffer.byteLength(body));
          response.end(request.method==='HEAD'?undefined:body);
        }catch(error){next(error);}
      });
    },
    closeBundle() { redactDistributedManifests(distribution); },
    transform(code, id) {
      const relative = id.split('?')[0].replaceAll('\\', '/').split('/web/src/')[1];
      if (!relative || relative.endsWith('.test.ts') || !relative.endsWith('.ts') || relative === 'content-runtime.ts') return null;
      if (relative === 'i18n-tr.ts') return { code: `import ui from './data/i18n/tr-ui.json'; export const turkishOverlay = {ui,story:{},course:{lexicon:{},grammar:{},exercises:{},texts:{}}};`, map: null };
      let changed = false, needsTargetLanguage=false;
      const file = ts.createSourceFile(id, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
      const transformed = ts.transform(file, [context => {
        const visit = node => {
          if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
            const path = node.moduleSpecifier.text.replace(/^\.\//, '');
            const replacement = dataImports[path];
            if (replacement && node.importClause?.name) {
              changed = true;
              return ts.factory.createVariableStatement(undefined, ts.factory.createVariableDeclarationList([ts.factory.createVariableDeclaration(node.importClause.name, undefined, undefined, call(Array.isArray(replacement[1]) ? 'runtimeArray' : 'runtimeObject', replacement[0], literal(replacement[1])))], ts.NodeFlags.Const));
            }
            if(/(?:^|\/)audio-data\.json$/.test(path)&&node.importClause?.name) {
              changed=true;
              return ts.factory.createVariableStatement(undefined,ts.factory.createVariableDeclarationList([ts.factory.createVariableDeclaration(node.importClause.name,undefined,undefined,call('runtimeObject','miniGameAudio',literal({clips:[]})))],ts.NodeFlags.Const));
            }
            if(/(?:^|\/)item-data\.json$/.test(path)&&node.importClause?.name) {
              changed=true;
              return ts.factory.createVariableStatement(undefined,ts.factory.createVariableDeclarationList([ts.factory.createVariableDeclaration(node.importClause.name,undefined,undefined,literal(jsonPresentation(resolve(dirname(id),node.moduleSpecifier.text))))],ts.NodeFlags.Const));
            }
          }
          if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
            const name = node.name.text, arrayKey = initializers[relative]?.[name], objectKey = objects[relative]?.[name];
            if (arrayKey || objectKey) {
              changed = true;
              let fallback = arrayKey ? [] : {};
              if (relative === 'content.ts' && name === 'npcs') fallback = snapshot().npcs.map(({ id, name, x, y, color, portrait }) => ({ id, name, x, y, color, portrait, role: '', greeting: '' }));
              return ts.factory.updateVariableDeclaration(node, node.name, node.exclamationToken, node.type, call(arrayKey ? 'runtimeArray' : 'runtimeObject', arrayKey ?? objectKey, literal(fallback)));
            }
            if(relative==='minigames/host.ts'&&name==='clips') {
              changed=true;
              const expression=parsedBody('return {get:(text)=>audioData.clips.find(clip=>clip.text===text)?.path};').statements[0].expression;
              return ts.factory.updateVariableDeclaration(node,node.name,node.exclamationToken,node.type,expression);
            }
            if (relative === 'interiors.ts' && name === 'interiors') {
              changed = true;
              const rooms = snapshot().interiors.map(room => ({ ...room, germanName: '', description: '', subtitle: '', objects: room.objects.map(object => ({ ...object, germanName: '', description: '', sessionTitle: '', prompt: '', dialogue: undefined, exerciseIds: [], vocabulary: [] })) }));
              return ts.factory.updateVariableDeclaration(node, node.name, node.exclamationToken, node.type, call('runtimeArray', 'interiors', literal(rooms)));
            }
            if(relative==='maps.ts'&&name==='storyMaps') {
              changed=true;
              const maps=snapshot().storyMaps.map(map=>({...map,subtitle:'',description:'',objects:map.objects.map(object=>({...object,label:'',description:'',prompt:'',exerciseIds:object.exerciseIds.map(identity)}))}));
              return ts.factory.updateVariableDeclaration(node,node.name,node.exclamationToken,node.type,literal(maps));
            }
            if (relative === 'expeditions.ts' && name === 'seeds') {
              changed = true;
              const seeds = snapshot().expeditionRegions.map(region => ({ id: region.id, name: region.name, subtitle: '', level: region.encounters[0]?.difficulty ?? 'A1', culture: '', feeling: '', description: '', languageFocus: '', cast: region.npcs.map(npc => [npc.id.slice(region.id.length + 1), npc.name, npc.role, '', '', '', '', '']), discoveries: region.objects.map(object => [object.id.slice(region.id.length + 1), object.label, object.kind, '', '', '', '', '', 'dialogue']), residents: Array.from({ length: 8 }, (_, index) => `Resident ${index + 1}`) }));
              return ts.factory.updateVariableDeclaration(node, node.name, node.exclamationToken, node.type, literal(seeds));
            }
            if(relative==='expeditions.ts'&&name==='encounterClarifications') {
              changed=true;
              return ts.factory.updateVariableDeclaration(node,node.name,node.exclamationToken,node.type,literal({}));
            }
          }
          if(relative==='expeditions.ts'&&ts.isFunctionDeclaration(node)&&node.name?.text==='makeEncounter') {
            changed=true;
            return ts.factory.updateFunctionDeclaration(node,node.modifiers,node.asteriskToken,node.name,node.typeParameters,node.parameters,node.type,parsedBody("return {id,title,german:'',translation:'',languageFocus,difficulty,gameKind,prompt:'',choices:[]};"));
          }
          if(relative==='expedition-games.ts'&&ts.isFunctionDeclaration(node)&&node.name?.text==='expeditionAgreement') {
            changed=true;
            return ts.factory.updateFunctionDeclaration(node,node.modifiers,node.asteriskToken,node.name,node.typeParameters,node.parameters,node.type,parsedBody("return game.agreements?.[JSON.stringify(game.fields.map(field=>values[field.id]))] ?? '';"));
          }
          if (relative === 'activity-engine.ts' && ts.isExpressionStatement(node) && ts.isCallExpression(node.expression) && ts.isIdentifier(node.expression.expression) && /^add(Cafe|Market|Detective|Delivery)$/.test(node.expression.expression.text)) { changed = true; return undefined; }
          if(relative==='interior-conversations.ts'&&ts.isFunctionDeclaration(node)&&node.name?.text==='script'){changed=true;return undefined;}
          if(relative==='interior-conversations.ts'&&ts.isVariableDeclaration(node)&&ts.isIdentifier(node.name)&&node.name.text==='conversationsByObject') {
            changed=true;
            return ts.factory.updateVariableDeclaration(node,node.name,node.exclamationToken,node.type,literal(undefined));
          }
          if(relative==='interior-conversations.ts'&&ts.isFunctionDeclaration(node)&&node.name?.text==='interiorConversationFor') {
            changed=true;
            return ts.factory.updateFunctionDeclaration(node,node.modifiers,node.asteriskToken,node.name,node.typeParameters,node.parameters,node.type,parsedBody("return interiorConversations.find(conversation=>conversation.objectId===objectId);"));
          }
          if (relative === 'npc-dialogue.ts' && ts.isFunctionDeclaration(node) && node.name && ['baseConversation', 'earnedTitleGreeting'].includes(node.name.text)) {
            changed = true;
            const expression = node.name.text === 'baseConversation' ? `return runtimeArray('greetings:' + npc.id + ':' + level).filter(line=>conditionMet(line.condition ?? line.when,state));` : `return runtimeObject('titleGreetings')[npc.id + ':' + title];`;
            const block = parsedBody(expression);
            return ts.factory.updateFunctionDeclaration(node, node.modifiers, node.asteriskToken, node.name, node.typeParameters, node.parameters, node.type, block);
          }
          if(relative==='cinematic-content.ts'&&ts.isFunctionDeclaration(node)&&node.name?.text==='cinematicBeats') {
            changed=true;
            return ts.factory.updateFunctionDeclaration(node,node.modifiers,node.asteriskToken,node.name,node.typeParameters,node.parameters,node.type,parsedBody("return runtimeArray('cinematic:' + mapId + ':' + kind + ':' + (ending ?? ''));"));
          }
          if(relative==='world-routines.ts'&&ts.isFunctionDeclaration(node)&&['lexicalBark','routineBark','npcRoutine'].includes(node.name?.text)) {
            changed=true;
            const bodies={
              lexicalBark:"const text = word.lemma; return {id: source + ':' + word.id, speakerId: context.speakerId, german: text, english: word.english, wordIds:[word.id], source};",
              routineBark:"const routine=npcRoutine(context.speakerId,context.hour,context.requiredNpcId);return {id:'routine:'+context.speakerId+':'+routine.action,speakerId:context.speakerId,german:routine.german,english:routine.english,wordIds:[],source:'routine'};",
              npcRoutine:"const h=hourOf(hour);const scheduled=npcRoutines[npcId]?.find(item=>h>=item.start&&h<item.end);if(!scheduled)return {action:'watch',offsetX:0,offsetY:0,facing:'right',interactable:true,german:'',english:''};const required=npcId===requiredNpcId;const phase=Math.sin((h-scheduled.start)/(scheduled.end-scheduled.start)*Math.PI*2);return {action:required?'listen':scheduled.action,offsetX:required?0:Math.max(-.025,Math.min(.025,(scheduled.x??0)*phase)),offsetY:required?0:Math.max(-.025,Math.min(.025,(scheduled.y??0)*phase)),facing:phase<0?'left':'right',interactable:true,german:scheduled.german,english:scheduled.english};"
            };
            return ts.factory.updateFunctionDeclaration(node,node.modifiers,node.asteriskToken,node.name,node.typeParameters,node.parameters,node.type,parsedBody(bodies[node.name.text]));
          }
          if(relative==='minigames/item-manifest.ts'&&ts.isFunctionDeclaration(node)&&node.name?.text==='itemSpriteByLemma') {
            changed=true;
            return ts.factory.updateFunctionDeclaration(node,node.modifiers,node.asteriskToken,node.name,node.typeParameters,node.parameters,node.type,parsedBody("const key=normalizeItemLabel(german);const word=runtimeArray('courseLexicon').find(word=>[word.lemma,word.plural,...(word.surfaceForms??[])].filter(Boolean).some(form=>normalizeItemLabel(form)===key));return word?lexemeFrames.get(word.id):undefined;"));
          }
          if(ts.isTemplateExpression(node)) {
            const head=node.head.text,spans=node.templateSpans;
            if(head==='word-'&&spans.length===1&&spans[0].literal.text==='') {changed=true;return call('runtimeReference','item',ts.visitNode(spans[0].expression,visit));}
            if(head==='lex-'&&spans.length===2&&spans[0].literal.text==='-'&&spans[1].literal.text===''){changed=true;return call('runtimeReference','exercise',ts.visitNode(spans[0].expression,visit),ts.visitNode(spans[1].expression,visit));}
            if(head==='/audio/word-'&&spans.length===1&&spans[0].literal.text==='.mp3'&&relative==='minigames/pool.ts'){changed=true;return ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier('word'),'audio');}
          }
          if(ts.isStringLiteral(node)&&!ts.isImportDeclaration(node.parent)&&!(ts.isPropertyAssignment(node.parent)&&node.parent.name===node)&&!ts.isLiteralTypeNode(node.parent)) {
            if(relative==='minigames/host.ts'&&node.text==='de-DE'){changed=true;needsTargetLanguage=true;return ts.factory.createCallExpression(ts.factory.createIdentifier('targetLanguage'),undefined,[]);}
            const value=identity(node.text);
            if(value!==node.text){changed=true;return ts.factory.createStringLiteral(value);}
          }
          if(relative==='minigames/engine.ts'&&ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)&&node.expression.name.text==='startsWith'&&ts.isStringLiteral(node.arguments[0])&&node.arguments[0].text==='b1-council-') {
            changed=true;return ts.factory.createBinaryExpression(ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier('exercise'),'questId'),ts.SyntaxKind.EqualsEqualsEqualsToken,literal(identity('b1-council')));
          }
          if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)&&node.expression.name.text==='startsWith'&&ts.isStringLiteral(node.arguments[0])&&node.arguments[0].text==='word-'&&ts.isPropertyAccessExpression(node.expression.expression)&&node.expression.expression.name.text==='itemId') {
            changed=true;return ts.factory.createPrefixUnaryExpression(ts.SyntaxKind.ExclamationToken,ts.factory.createPrefixUnaryExpression(ts.SyntaxKind.ExclamationToken,ts.factory.createPropertyAccessExpression(ts.visitNode(node.expression.expression.expression,visit),'targetWordId')));
          }
          return ts.visitEachChild(node, visit, context);
        };
        return node => ts.visitNode(node, visit);
      }]);
      if (!changed) { transformed.dispose(); return null; }
      const printed = ts.createPrinter().printFile(transformed.transformed[0]); transformed.dispose();
      const imported=new Set(file.statements.filter(ts.isImportDeclaration).flatMap(statement=>{
        const clause=statement.importClause;if(!clause||clause.isTypeOnly)return [];
        return [...(clause.name?[clause.name.text]:[]),...(clause.namedBindings&&ts.isNamedImports(clause.namedBindings)?clause.namedBindings.elements.filter(element=>!element.isTypeOnly).map(element=>element.name.text):[])];
      }));
      const helpers=['runtimeArray','runtimeObject','runtimeReference'].filter(name=>!imported.has(name));
      return { code: `${helpers.length?`import {${helpers.join(',')}} from ${JSON.stringify(runtime)};\n`:''}${needsTargetLanguage&&!imported.has('targetLanguage')?`import {targetLanguage} from ${JSON.stringify(resolve(root,'web/src/i18n.ts'))};\n`:''}${printed}`, map: null };
    },
    generateBundle(_options, bundle) {
      const forbidden = /\/(?:data\/(?:course(?:-(?:meta|lexicon|exercises-[a-z0-9]+))?|dialogue-graphs|story-text|syllabus|expedition-learning(?:-runtime)?|i18n\/(?:tr-story|tr-course))|minigames\/(?:story-scripts|loop-data|audio-data|item-data))\.json(?:\?|$)/;
      for (const output of Object.values(bundle)) if (output.type === 'chunk') {
        for (const module of Object.keys(output.modules)) {
          const path=module.split('?')[0].replaceAll('\\','/');
          const source=resolve(root,'web/src').replaceAll('\\','/')+'/';
          const query=new URLSearchParams(module.slice(module.indexOf('?')+1));
          const rawAuthoring=path.startsWith(source)&&retainedLearningModules.has(path.slice(source.length))&&(query.has('raw')||query.has('url'));
          if(rawAuthoring||path.startsWith(resolve(root,'content').replaceAll('\\','/')+'/')||path===resolve(root,'content_ids.json').replaceAll('\\','/')||path.startsWith(resolve(root,'server').replaceAll('\\','/')+'/')&&path.endsWith('.json')||forbidden.test(module.replaceAll('\\','/'))||/\/test-fixtures\/content-public\.json(?:\?|$)/.test(module.replaceAll('\\','/'))) throw new Error(`Learning content entered the browser bundle: ${module}`);
        }
      }
    },
  };
}
