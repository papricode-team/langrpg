// Canonical voiced scene corpus shared by generation and build validation.
import { readFile } from 'node:fs/promises';
import './register-content-loader.mjs';
import { npcs, quests } from './content-source.mjs';
const { grammarForQuest } = await import('../web/src/contextual-grammar.ts');
const { residentConversation,earnedTitleGreeting,ambientCallbackLines } = await import('../web/src/npc-dialogue.ts');
const { canVoiceDialogue, emptyStory } = await import('../web/src/dialogue.ts');
const { cinematicBeats, cutsceneKinds, endingIds } = await import('../web/src/cinematic-content.ts');
/** Story speaker → character voice in scripts/tts/voices.json. */
export const cast = { marta: 'marta', otto: 'otto', lina: 'lina', emil: 'emil', ada: 'ada', fritz: 'fritz', greta: 'greta', inspector: 'inspector', elise: 'elise', stimme: 'stimme', berg: 'berg', kessler: 'kessler', pip: 'pip', hilde: 'hilde', falk: 'falk', jakob: 'jakob', ruth: 'ruth', jonas: 'jonas', Evidence: 'narrator' };
const graphs = JSON.parse(await readFile('web/src/data/dialogue-graphs.json', 'utf8'));
const scenes = graphs.flatMap(graph => [...graph.nodes.flatMap(node => node.lines),...(graph.topics??[]).flatMap(topic=>topic.lines)].flatMap(line=>[line,...(line.reply?[line.reply.correction]:[]),...(line.variants??[]).map(variant=>({...line,...variant,variants:undefined}))]));
const artifacts=graphs.flatMap(graph=>graph.investigations.map(item=>({german:item.german,speaker:'Evidence',clipId:`artifact-${graph.questId}-${item.objectId}`})));
const grammar=quests.flatMap(quest=>{const note=grammarForQuest(quest.id);return note?[{...note,speaker:quest.npcId}]:[];});
const initial=emptyStory(),experienced=emptyStory();
experienced.flags={'quest:b1-work':true,'quest:a2-archive':true};experienced.reputation={brassOffice:3,lamplighters:3,unwritten:3};
const ambient=npcs.flatMap(npc=>['A1','A2','B1'].flatMap(level=>[initial,experienced].flatMap(state=>residentConversation(npc,level,state))));
const callbacks=ambientCallbackLines();
const titles=npcs.flatMap(npc=>['Lantern Bearer','Lamplighter','Route Keeper','Atlas Keeper'].flatMap(title=>earnedTitleGreeting(npc,title)??[]));
const cinematics=cutsceneKinds.filter(kind=>kind!=='epilogue').flatMap(kind=>cinematicBeats(kind,'lindenhafen').map((beat,index)=>({...beat,speaker:beat.speaker.toLowerCase(),clipId:`cinematic-${kind}-${index}`})));
cinematics.push(...endingIds.flatMap(ending=>['bell','epilogue'].flatMap(kind=>cinematicBeats(kind,'nebelstadt',ending).map(beat=>({...beat,speaker:beat.speaker.toLowerCase()})))));
const corpus=new Map();for(const line of [...scenes,...artifacts,...grammar,...ambient,...callbacks,...titles,...cinematics]){
  if(!canVoiceDialogue(line.german))continue;
  const existing=corpus.get(line.clipId);if(existing&&existing.german!==line.german)throw new Error(`One clip ID has two texts: ${line.clipId}`);
  corpus.set(line.clipId,line);
}
export const jobs=[...corpus.values()];
