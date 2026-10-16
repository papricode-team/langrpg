#!/usr/bin/env node
/** Hand-authored narrative puzzles. Canonical answers bind each event to its own context. */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { projectRoot } from './item-art-plan.mjs';
import { createLexemeMapper } from './course-word-mapping.mjs';
const lexicon=JSON.parse(await readFile(resolve(projectRoot,'web/src/data/course-meta.json'),'utf8')).lexicon;
const syllabus=JSON.parse(await readFile(resolve(projectRoot,'web/src/data/syllabus.json'),'utf8'));
const lexicalMap=createLexemeMapper(lexicon),map=text=>lexicalMap(text.replace(/\b(?:[A-L]|VII|FERN|HAFEN|UHR)\b/g,'')),known=new Set(lexicon.map(word=>word.id));
const exercises=[],audio=[];
const sound=(id,text)=>{const name=`story-${id}`;audio.push({id:name,text,path:`/audio/${name}.ogg`});return `/audio/${name}.ogg`;};
function exercise(game,quest,context,id,mode,answer,target,german,explanation,extraWords=[]){
  if(!known.has(target)||!syllabus.quests.find(row=>row.questId===quest).wordIds.includes(target))throw Error(`Target outside associated syllabus: ${target}`);
  const wordIds=[...new Set([...map(german),...map(explanation),...extraWords,target])].sort();
  if(wordIds.some(id=>!known.has(id)))throw Error(`Unknown story lexeme in ${id}`);
  const row={id,itemId:`word-${target}`,mode,german,prompt:german,answer,wordIds,targetWordId:target,explanation,miniGameId:game,level:'A2',contentId:context,questId:quest};exercises.push(row);return id;
}
const clockContext='clockmill-before-midnight-v1';
// No printed timestamps on cards. Each dependency names the preceding action.
const clockRows=[
  ['finden-verb','Zuerst habe ich den Schlüssel gefunden.'],
  ['lesen-verb','Danach habe ich mit dem Schlüssel die Anleitung gelesen.'],
  ['legen-verb','Nach dem Lesen der Anleitung habe ich das Werkzeug auf den Tisch gelegt.'],
  ['pruefen-verb','Als das Werkzeug auf dem Tisch gelegen hat, habe ich die Lampe geprüft.'],
  ['trennen-verb','Nach dem Prüfen habe ich die Lampe vom Rad getrennt.'],
  ['ziehen-verb','Als die Lampe vom Rad getrennt gewesen ist, habe ich das rote Rad gezogen.'],
  ['verbinden-verb','Nach dem Ziehen des roten Rades habe ich die Lampe mit dem blauen Rad verbunden.'],
  ['reparieren-verb','Als die Lampe mit dem blauen Rad verbunden gewesen ist, habe ich das Zahnrad repariert.'],
  ['bauen-verb','Nach der Reparatur habe ich eine neue Lampe gebaut.'],
  ['wiederholen-verb','Als die neue Lampe fertig gewesen ist, habe ich die Anleitung wiederholt.'],
  ['erklaeren-verb','Nach dem Wiederholen habe ich Emil die Reihenfolge erklärt.'],
  ['funktionieren-verb','Schließlich hat Emil die Reihenfolge verstanden, und die Uhr hat wieder funktioniert.'],
];
const clockEvents=clockRows.map(([target,german],index)=>{
  const id=`event-${String(index+1).padStart(2,'0')}`,time=`23:${String(index*5).padStart(2,'0')}`;
  const explanation=index===0?'Zuerst kommt der Schlüssel.':`Diese Handlung folgt auf: ${clockRows[index-1][1]}`;
  const exerciseId=exercise('lost-hour','a2-broken-clock',clockContext,`story-lost-hour-${id}`,'recognition',time,target,german,explanation);
  return {id,exerciseId,german,targetWordId:target,audio:sound(`lost-hour-${id}`,german)};
});
const gardenContext='greta-memory-garden-v1';
// Plant motifs are explicitly fictional memory markers in Greta's ledger.
// They do not identify treatments or make medical claims.
const packetRows=[
  ['patient-noun','item-pflanze-noun','für den Patienten','Voss ist unser Patient. Nimm die Tüte für ihn.'],
  ['fieber-noun','item-blume-noun','für das Fieber','Voss hat Fieber. Welche Tüte erinnert Greta daran?'],
  ['ausruhen-verb','item-rose-noun','sich ausruhen','Voss soll sich ausruhen. Welche Tüte steht dafür?'],
  ['muede-adj','item-blatt-noun','müde','Voss ist müde. Nimm die passende Tüte.'],
  ['hand-noun','item-gemuese-noun','für die Hand','Voss zeigt seine Hand. Welche Tüte passt dazu?'],
  ['rat-noun','item-baum-noun','einen Rat geben','Greta gibt Voss einen Rat. Welche Tüte nimmt sie?'],
  ['erinnerung-noun','item-apfel-noun','eine alte Erinnerung','Voss hat eine alte Erinnerung. Nimm ihre Tüte.'],
  ['adresse-noun','item-orange-noun','eine Adresse nennen','Voss nennt eine Adresse. Welche Tüte gehört dazu?'],
  ['mitbringen-verb','item-banane-noun','die Karte mitbringen','Voss soll seine Karte mitbringen. Nimm die Tüte dafür.'],
  ['pruefen-verb','item-bohne-noun','einen Bericht prüfen',"Greta soll Voss' Bericht prüfen. Welche Tüte braucht sie?"],
  ['gegen-prep','item-obst-noun','gegen die Tür','Die Tüte steht gegen die Tür. Wähle diese Tüte.'],
  ['entlang-prep','item-salat-noun','die alte Linie entlang','Voss ist die alte Linie entlang gegangen. Welche Tüte erinnert daran?'],
];
const addresses=[
  {id:'address-01',text:'Am Bahnhof 7',spoken:'Am Bahnhof sieben.',targetWordId:'bahnhof-noun',acceptedAnswers:['Am Bahnhof sieben']},
  {id:'address-02',text:'Hinter der Mühle 3',spoken:'Hinter der Mühle drei.',targetWordId:'hinter-prep',acceptedAnswers:['Hinter der Mühle drei']},
  {id:'address-03',text:'An der alten Linie 20',spoken:'An der alten Linie zwanzig.',targetWordId:'linie-noun',acceptedAnswers:['An der alten Linie zwanzig']},
].map(row=>{
  const exerciseId=exercise('seed-packets','a2-clinic',gardenContext,`story-seed-${row.id}`,'production',row.text,row.targetWordId,row.text,`Die alte Adresse lautet: ${row.text}.`,map(row.spoken));
  exercises.at(-1).acceptedAnswers=row.acceptedAnswers;
  return {...row,exerciseId,audio:sound(`seed-${row.id}`,row.spoken)};
});
const packets=packetRows.map(([target,sprite,ledgerGerman,german],index)=>{
  const id=`packet-${String(index+1).padStart(2,'0')}`,code=String.fromCharCode(65+index),addressId=addresses[Math.floor(index/4)].id;
  const explanation=`Gretas Zeichen ${code} erinnert an: ${ledgerGerman}.`;
  const exerciseId=exercise('seed-packets','a2-clinic',gardenContext,`story-seed-${id}`,'recognition',id,target,german,explanation,[...map(ledgerGerman),'tuete-noun']);
  return {id,code,sprite,ledgerGerman,german,targetWordId:target,exerciseId,addressId,audio:sound(`seed-${id}`,german)};
});
const trainContext='waldruh-connection-1759-v1';
const announcementRows=[
  ['announcement-01','fahren-verb','17:59','2','Waldruh','fährt','Der Zug nach Waldruh fährt um siebzehn Uhr neunundfünfzig von Gleis zwei ab.'],
  ['announcement-02','nicht-adv','18:05','1','Waldruh','fährt nicht','Der Zug nach Waldruh um achtzehn Uhr fünf fährt heute nicht. Er steht an Gleis eins.'],
  ['announcement-03','nach-prep','18:10','3','Lindenhafen','fährt','Der Zug nach Lindenhafen fährt um achtzehn Uhr zehn von Gleis drei ab.'],
  ['announcement-04','anschluss-noun','18:15','7','Waldruh','fährt','Der nächste Anschluss nach Waldruh fährt um achtzehn Uhr fünfzehn von Gleis sieben ab.'],
];
const announcements=announcementRows.map(([id,target,time,platform,destination,status,german],index)=>{
  const answer=[time,platform,destination,status].join('|'),explanation=`${time} · Gleis ${platform} · ${destination} · ${status}.`;
  const exerciseId=exercise('17-59','a2-rail-trip',trainContext,`story-17-59-${id}`,'listening',answer,target,german,explanation);
  return {id,exerciseId,targetWordId:target,german,audio:sound(`17-59-${id}`,german),startsAtMs:index*1800,fields:{time,platform,destination,status}};
});
const tickets=[
  {id:'ticket-vii',code:'VII',time:'18:00',platform:'2',destination:'Waldruh',announcementId:'announcement-01'},
  {id:'ticket-fern',code:'FERN',time:'18:05',platform:'1',destination:'Waldruh',announcementId:'announcement-02'},
  {id:'ticket-hafen',code:'HAFEN',time:'18:10',platform:'3',destination:'Lindenhafen',announcementId:'announcement-03'},
  {id:'ticket-uhr',code:'UHR',time:'18:15',platform:'7',destination:'Waldruh',announcementId:'announcement-04'},
];
const ticketExerciseId=exercise('17-59','a2-rail-trip',trainContext,'story-17-59-ticket','recognition','ticket-uhr','fahrkarte-noun','Du kommst um 18:00 am Bahnhof an und möchtest nach Waldruh. Welche Fahrkarte ist gültig?','VII steht auf der alten Fahrkarte um 18:00, aber der Zug fährt schon um 17:59. Nur UHR passt: 18:15, Gleis sieben, nach Waldruh.');
const games={
  'lost-hour':{questId:'a2-broken-clock',contentId:clockContext,seconds:180,title:'The Lost Hour',brief:'Emil’s log records one event every five minutes from 23:00. Read each action’s dependency and restore the twelve events. The borrowed-tools note bears Elise’s handwriting.',events:clockEvents},
  'seed-packets':{questId:'a2-clinic',contentId:gardenContext,seconds:180,title:'Greta’s Seed Packets',brief:'Greta uses twelve plant motifs as memory markers for Voss’s journey. Learn her ledger, then plant each requested packet along the old railway. Voss remembers three addresses printed on the packets; restore them after the garden grows.',packets,addresses},
  '17-59':{questId:'a2-rail-trip',contentId:trainContext,seconds:150,title:'17:59',brief:'You arrive at 18:00 and need a train to Waldruh. Four announcements overlap. Mark all four board rows, then hand Otto a valid ticket. An old ticket may disagree with the live board.',arrival:'18:00',destination:'Waldruh',announcements,tickets,ticketExerciseId},
};
for(const [id,game]of Object.entries(games)){
  const rows=exercises.filter(exercise=>exercise.miniGameId===id),visible=id==='seed-packets'?packets.map(packet=>packet.ledgerGerman).join(' '):id==='17-59'?tickets.map(ticket=>`${ticket.code} ${ticket.destination}`).join(' '):'';
  game.requiredWordIds=[...new Set([...rows.flatMap(row=>row.wordIds),...map(visible)])].sort();
}
export const authoredStoryScripts={version:1,authoring:'Hand-authored glotworld story scripts; canonical context-bound exercises',properNames:['Emil','Elise','Greta','Voss','Otto','Waldruh','Lindenhafen'],games,exercises,audio};
const serialized=JSON.stringify(authoredStoryScripts,null,2)+'\n';
export async function writeAuthoredStoryScripts({check=false,root=projectRoot}={}){
  for(const name of ['web/src/minigames/story-scripts.json','server/minigame_stories.json']){
    const path=resolve(root,name);
    if(check){
      if(await readFile(path,'utf8')!==serialized)throw Error(`Stale authored story script: ${name}; run author-minigame-stories.mjs`);
    }else await writeFile(path,serialized);
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const check=process.argv.includes('--check');await writeAuthoredStoryScripts({check});
  console.log(`${check?'Verified':'Authored'} ${exercises.length} context-bound story exercises, ${audio.length} speech clips; scene targets verified.`);
}
