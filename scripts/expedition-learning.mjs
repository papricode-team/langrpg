#!/usr/bin/env node
/** Reviewable contextual recall mappings; movement and menu navigation have no rows. */
import { readFile,writeFile } from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import './register-content-loader.mjs';
import {createLexemeMapper} from './course-word-mapping.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export async function buildExpeditionLearning(){
 const [{expeditionRegions},{expeditionGames},{courseLexicon}]=await Promise.all([import('../web/src/expeditions.ts'),import('../web/src/expedition-games.ts'),import('../web/src/course.ts')]);
 const authored=JSON.parse(await readFile(resolve(root,'scripts/expedition-learning-targets.json'),'utf8')).encounters;
 if(Object.keys(authored).length!==180)throw new Error('Exactly 180 authored primary expedition targets are required.');
 const aliases={Bildkabel:'kabel-noun',Ladekabel:'kabel-noun'};
 const mappedLexicon=courseLexicon.map(word=>({...word,aliases:[...(word.aliases??[]),...Object.entries(aliases).filter(([,id])=>id===word.id).map(([form])=>({form}))]}));
 const map=createLexemeMapper(mappedLexicon),byId=new Map(courseLexicon.map(word=>[word.id,word]));
 const placementTargets={
  saffroncourt:{permission:'erlaubnis-noun',gate:'offen-adv',recipient:'paket-noun',arrival:'uhr-noun'},
  rainmarket:{start:'beginnen-verb',end:'uhr-noun',sound:'leise-adj',place:'dach-noun'},
  windplain:{water:'wasser-noun',food:'essen-noun',tools:'werkzeug-noun',radio:'mitnehmen-verb'},
  riverweave:{veg:'gemuese-noun',fruit:'obst-noun',rice:'zwei-num',route:'drei-num'},
  terracielo:{count:'drei-num',width:'vierzig-num',height:'sechzig-num',pattern:'blau-adj',pickup:'abholen-verb'},
  sunpatch:{day:'freitag-noun',time:'acht-num',place:'hof-noun',source:'bestaetigen-verb',broadcast:'senden-verb'},
  kigalights:{group:'raum-noun',band:'aufnahme-noun',edit:'beginnen-verb',entrance:'eingang-noun'},
  cedarbay:{landing:'ort-noun',time:'abfahren-verb',people:'vier-num',crate:'kiste-noun'},
  seoulsteps:{start:'beginnen-verb',end:'ruhe-noun',venue:'raum-noun',music:'leise-adj',access:'aufzug-noun'},
  dunegarden:{shared:'garten-noun',young:'jung-adj',trees:'baum-noun',reserve:'zwei-num'}
 };
 const withoutNames=(text,region)=>region.npcs.reduce((value,{name})=>value.replace(new RegExp('\\b'+name.replace(/[.*+?^${}()|[\\]\\\\]/g,'\\$&')+'\\b','g'),' '),text);
 const prompts={
saffroncourt:{permission:'Wer gibt die Erlaubnis für den Hof?',gate:'Welches Tor ist offen? Wähle den offenen Eingang.',recipient:'Für wen ist das Paket?',arrival:'Um wie viel Uhr kommt die Lieferung?'},
rainmarket:{start:'Um wie viel Uhr darf das Treffen beginnen?',end:'Um wie viel Uhr ist das Treffen zu Ende?',sound:'Die Musik muss leise sein. Wähle die Lautstärke.',place:'Wo ist das Dach gegen den Regen?'},
windplain:{water:'Wie viel Wasser braucht die Fahrt?',food:'Wie viel Essen kommt mit?',tools:'Wie viel Werkzeug ist vereinbart?',radio:'Du sollst das Radio für neue Nachrichten mitnehmen.'},
riverweave:{veg:'Wie viel Gemüse braucht die Küche?',fruit:'Wie viel Obst ist bestellt?',rice:'Wir brauchen zwei Säcke Reis. Wähle die Menge.',route:'Der Ostkanal kostet drei Münzen. Wähle den passenden Fahrpreis.'},
terracielo:{count:'Drei Taschen sind bestellt. Wähle die Anzahl.',width:'Jede Tasche ist vierzig Zentimeter breit. Wähle die Breite.',height:'Jede Tasche ist sechzig Zentimeter hoch. Wähle die Höhe.',pattern:'Das Muster ist blau. Wähle die Farbe.',pickup:'Wann kannst du die Taschen abholen?'},
sunpatch:{day:'Das Treffen ist am Freitag. Wähle den Tag.',time:'Um wie viel Uhr ist das Treffen?',place:'Wähle den richtigen Hof für das Treffen.',source:'Wer kann die neue Nachricht bestätigen?',broadcast:'Wann darfst du die Einladung senden?'},
kigalights:{group:'Welcher Raum ist ruhig und zugänglich?',band:'Welcher Raum passt für die Aufnahme?',edit:'Um wie viel Uhr kann die Arbeit beginnen?',entrance:'Welcher Eingang hat keine Stufen?'},
cedarbay:{landing:'An welchem Ort holst du die Kiste ab?',time:'Wann darf die Fähre abfahren?',people:'Vier Personen fahren mit. Wähle ihre Anzahl.',crate:'Wie viele Plätze braucht die Kiste?'},
seoulsteps:{start:'Um wie viel Uhr darf das Treffen beginnen?',end:'Die Ruhe beginnt am Abend. Wähle das Ende.',venue:'Welcher Raum schützt vor Regen?',music:'Die Musik muss leise sein. Wähle das Set.',access:'Wähle den Aufzug für alle Gäste.'},
dunegarden:{shared:'Wie viele Minuten bekommt der gemeinsame Garten?',young:'Die Pflanzen sind jung. Wie viele Minuten bekommen sie?',trees:'Wie viele Minuten bekommt jeder Baum?',reserve:'Zwei Minuten bleiben als Reserve übrig. Wähle die Dauer.'}};
 prompts.sunpatch.time='Das Treffen ist um acht Uhr. Wähle die Uhrzeit.';
 const exercises=[],encounters=[],placements=[];
 for(const region of expeditionRegions)for(const encounter of region.encounters){
  const correct=encounter.choices.find(choice=>choice.correct);if(!correct)throw new Error(`No canonical reply: ${encounter.id}`);
  const wordIds=map(withoutNames(`${encounter.german} ${encounter.choices.map(choice=>choice.text).join(' ')}`,region));
  const primary=authored[encounter.id];if(!primary||!byId.has(primary.targetWordId)||!primary.rationale)throw new Error(`Missing authored primary target: ${encounter.id}`);
  const targetWordId=primary.targetWordId;if(!wordIds.includes(targetWordId))throw new Error(`Primary target has no exact context mapping: ${encounter.id}/${targetWordId}`);
  const exerciseIds={};for(const mode of ['recognition','listening']){const id=`exp-${encounter.id}-${mode}`;exerciseIds[mode]=id;exercises.push({id,itemId:`word-${targetWordId}`,mode,level:encounter.difficulty,answer:correct.text,wordIds,targetWordId,explanation:correct.response,miniGameId:'expedition-encounters',regionId:region.id,contentId:encounter.id});}
  encounters.push({encounterId:encounter.id,mapId:region.id,level:encounter.difficulty,targetWordId,wordIds,exerciseIds,audio:`/audio/expedition-${encounter.id}.ogg`,rationale:primary.rationale,supported:primary.supported??['terracielo-encounter-tools','terracielo-encounter-garden-plan','dunegarden-encounter-huda','dunegarden-encounter-shade'].includes(encounter.id),sourceGerman:encounter.german});
 }
 for(const game of expeditionGames){
  const allocations=[];const visit=(index,values)=>{if(index===game.fields.length){if(!game.validate(values).length)allocations.push({...values});return;}for(const option of game.fields[index].options)visit(index+1,{...values,[game.fields[index].id]:option.value});};visit(0,{});
  for(const level of ['A1','A2','B1'])for(const field of game.fields){
   const prompt=prompts[game.id][field.id];const context=`${game.german[level]} ${prompt} ${field.label} ${field.options.map(option=>option.label).join(' ')}`;
   const wordIds=map(withoutNames(context,expeditionRegions.find(region=>region.id===game.id)));
   const targetWordId=placementTargets[game.id]?.[field.id];
   if(!targetWordId||!byId.has(targetWordId)||!wordIds.includes(targetWordId))throw new Error(`Missing authored contextual placement target: ${game.id}/${level}/${field.id}`);
   const allowedValues=[...new Set(allocations.map(values=>values[field.id]))].sort((a,b)=>a-b),acceptedAnswers=field.options.filter(option=>allowedValues.includes(option.value)).map(option=>option.label);
   const id=`exp-plan-${game.id}-${level.toLowerCase()}-${field.id}-recognition`;
   exercises.push({id,itemId:`word-${targetWordId}`,mode:'recognition',level,answer:acceptedAnswers[0],acceptedAnswers:acceptedAnswers.slice(1),wordIds,targetWordId,explanation:`${field.label}: ${game.german[level]}`,miniGameId:'neighborhood-boards',regionId:game.id,contentId:field.id});
   placements.push({mapId:game.id,level,fieldId:field.id,exerciseId:id,wordIds,targetWordId,allowedValues,labels:field.options.map(option=>({value:option.value,label:option.label})),prompt,supported:true,rationale:`Supported contextual recognition of “${byId.get(targetWordId).lemma}”: ${byId.get(targetWordId).pos==='num'?'interpret the spelled German quantity and select its numeral for':'interpret the German task concept and select the agreed option for'} ${field.label} from the explicit German agreement. Labels are visible, so every placement is hinted. Accepted values are projections of complete validated allocations; this does not complete or grade the whole plan.`,sourceGerman:game.german[level]});
  }
 }
 return {version:1,authoredAliases:aliases,exercises,encounters,placements,ignoredProperNames:[...new Set(expeditionRegions.flatMap(region=>[region.name,...region.npcs.map(npc=>npc.name)]))].sort(),mappingPolicy:'Exact authored German surface forms and aliases only. Proper names are outside lexical grading; ambiguous matches are omitted. All cue and option lexemes must be restored before a recall can count. Placements are supported recognition, never listening or whole-plan proof.'};
}
/** Runtime carries presentation and submission context; answers stay server-owned. */
export function compactExpeditionLearning(data){
 return {version:data.version,
  exercises:data.exercises.map(({id,itemId,mode,level,wordIds,miniGameId,regionId,contentId})=>({id,itemId,mode,level,wordIds,miniGameId,regionId,contentId})),
  encounters:data.encounters.map(({encounterId,exerciseIds,audio,supported})=>({encounterId,exerciseIds,audio,supported})),
  placements:data.placements.map(({mapId,level,fieldId,exerciseId,prompt})=>({mapId,level,fieldId,exerciseId,prompt}))
 };
}
export async function writeExpeditionLearning(check=false){
 const data=await buildExpeditionLearning(),text=JSON.stringify(data,null,2)+'\n';
 const outputs=[['web/src/data/expedition-learning.json',text],['server/expedition_learning.json',text],['web/src/data/expedition-learning-runtime.json',JSON.stringify(compactExpeditionLearning(data))+'\n']];
 for(const [file,contents] of outputs){if(check){if(await readFile(resolve(root,file),'utf8')!==contents)throw new Error(`Stale expedition learning mappings: ${file}`);}else await writeFile(resolve(root,file),contents);}
 return data;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const data=await writeExpeditionLearning(process.argv.includes('--check'));process.stdout.write(`Verified ${data.encounters.length} encounter mappings, ${data.placements.length} placement mappings and ${data.exercises.length} authoritative exercises.\n`);}
