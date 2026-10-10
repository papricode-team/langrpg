// Canonical voiced scene corpus shared by generation and build validation.
import { readFile } from 'node:fs/promises';
import './register-content-loader.mjs';
const { npcs,quests } = await import('../web/src/content.ts');
const { grammarForQuest } = await import('../web/src/contextual-grammar.ts');
const { residentConversation,earnedTitleGreeting,ambientCallbackLines } = await import('../web/src/npc-dialogue.ts');
const { emptyStory } = await import('../web/src/dialogue.ts');
const { cinematicBeats, endingIds } = await import('../web/src/cinematic-content.ts');
export const cast = { marta: 'Anna', otto: 'Grandpa (German (Germany))', lina: 'Flo (German (Germany))', emil: 'Eddy (German (Germany))', ada: 'Grandma (German (Germany))', fritz: 'Rocko (German (Germany))', greta: 'Sandy (German (Germany))', inspector: 'Reed (German (Germany))', elise: 'Shelley (German (Germany))', stimme: 'Shelley (German (Germany))', Evidence:'Anna' };
const graphs = JSON.parse(await readFile('web/src/data/dialogue-graphs.json', 'utf8'));
const scenes = graphs.flatMap(graph => [...graph.nodes.flatMap(node => node.lines),...(graph.topics??[]).flatMap(topic=>topic.lines)].flatMap(line=>[line,...(line.reply?[line.reply.correction]:[]),...(line.variants??[]).map(variant=>({...line,...variant,variants:undefined}))])).filter(line => !line.german.includes('{'));
const named=graphs.flatMap(graph=>[...graph.nodes.flatMap(node=>node.lines),...(graph.topics??[]).flatMap(topic=>topic.lines)]).filter(line=>line.german.includes('{name}')).map(line=>({...line,clipId:`${line.clipId}-name-free`,german:line.german.replace(/,?\s*\{name\}/g,'').replace(/\s+([.!?,])/g,'$1')}));
const nameFreeArtifacts={
 'lindenhafen-platform-ticket':'Fahrkarte für dich. Bahnsteig sieben. Unten: E. Die Buchstaben gehen weg.',
 'lindenhafen-cafe-receipt':'Eine Rechnung, nicht fertig: Für dich. Bezahlt. Datum: …',
 'lindenhafen-parcel':'Für dich. Absender: E. Adresse: … Die Tinte geht weg.',
 'waldruh-housing-board':'Mietvertrag für Zimmer 7. Mieter: du. Die Miete für ein Jahr hat Elise im Voraus bezahlt. Zwei Adressen: Gasthaus Waldruh und Martas Café in Lindenhafen. Eine Tür. Gültig seit drei Monaten. Am Papier hängt ein schwerer Schlüssel mit einer kleinen Laterne.',
 'nebelstadt-observatory':'Der Schlüssel liegt auf dem Pult, neben einem Stapel Briefentwürfe an dich. Die ersten haben nur ein paar Wörter.',
};
const artifacts=graphs.flatMap(graph=>graph.investigations.map(item=>({german:item.german.includes('{name}')?nameFreeArtifacts[item.objectId]:item.german,speaker:'Evidence',clipId:`artifact-${graph.questId}-${item.objectId}${item.german.includes('{name}')?'-name-free':''}`})));
for(const artifact of artifacts)if(!artifact.german)throw new Error(`Missing personalized evidence fallback: ${artifact.clipId}`);
const grammar=quests.flatMap(quest=>{const note=grammarForQuest(quest.id);return note?[{...note,speaker:quest.npcId}]:[];});
const initial=emptyStory(),experienced=emptyStory();
experienced.flags={'quest:b1-work':true,'quest:a2-archive':true};experienced.reputation={brassOffice:3,lamplighters:3,unwritten:3};
const ambient=npcs.flatMap(npc=>['A1','A2','B1'].flatMap(level=>[initial,experienced].flatMap(state=>residentConversation(npc,level,state))));
const callbacks=ambientCallbackLines();
const titles=npcs.flatMap(npc=>['Lantern Bearer','Lamplighter','Route Keeper','Atlas Keeper'].flatMap(title=>earnedTitleGreeting(npc,title)??[]));
const cinematics=['arrival','platform','recording','erasure','clockmill','confession','dark-beam','ledger','storm','bell','travel'].flatMap(kind=>cinematicBeats(kind,'lindenhafen').map((beat,index)=>({...beat,speaker:beat.speaker.toLowerCase(),clipId:`cinematic-${kind}-${index}`})));
cinematics.push(...endingIds.flatMap(ending=>cinematicBeats('bell','nebelstadt',ending).map(beat=>({...beat,speaker:beat.speaker.toLowerCase()}))));
const corpus=new Map();for(const line of [...scenes,...named,...artifacts,...grammar,...ambient,...callbacks,...titles,...cinematics]){
  const existing=corpus.get(line.clipId);if(existing&&existing.german!==line.german)throw new Error(`One clip ID has two texts: ${line.clipId}`);
  corpus.set(line.clipId,line);
}
export const jobs=[...corpus.values()];
