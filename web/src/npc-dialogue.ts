import type { NPC, Level } from './content';
import { conditionMet, type DialogueCondition, type DialogueLine, type StoryState } from './dialogue';

export function earnedTitleGreeting(npc:NPC,title:string):DialogueLine | undefined {
  const german = ({'Lantern Bearer':'Hallo, Laternenträger! Deine erste Spur ist gerettet.','Lamplighter':'Willkommen, Laternenhüter! Lindenhafen kennt deinen Namen.','Route Keeper':'Willkommen, Streckenhüter! Du verbindest unsere Städte.','Atlas Keeper':'Willkommen, Atlashüter! Unsere Stimmen bleiben in deinem Atlas.'} as Record<string,string>)[title];
  if (!german || npc.id==='inspector') return;
  return {id:`${npc.id}-title-${title}`,speaker:npc.id,german,english:({ 'Lantern Bearer':'Hello, Lantern Bearer! Your first clue is saved.','Lamplighter':'Welcome, Lamplighter! Lindenhafen knows your name.','Route Keeper':'Welcome, Route Keeper! You connect our towns.','Atlas Keeper':'Welcome, Atlas Keeper! Our voices stay in your atlas.'} as Record<string,string>)[title],clipId:`title-${npc.id}-${title.toLowerCase().replaceAll(' ','-')}`};
}

function greetingLine(npcId:string,level:Level,index:number,german:string,english:string):DialogueLine {
  let hash=2166136261;for(const character of german)hash=Math.imul(hash^character.charCodeAt(0),16777619);
  return {id:`${npcId}-${level}-greeting-${index}`,speaker:npcId,german,english,clipId:`greeting-${npcId}-${level}-${index}-${(hash>>>0).toString(16)}`};
}

/** Residents remember what the player did. Each callback fires once its condition holds; two per visit at most. */
export interface AmbientCallback { npc:string; level:Level; when:DialogueCondition; german:string; english:string; }
export const ambientCallbacks:AmbientCallback[] = [
  {npc:'otto',level:'A1',when:{flag:'platform-reported'},german:'Voss hat dein Ticket gesehen. Das gefällt mir nicht.',english:'Voss has seen your ticket. I do not like that.'},
  {npc:'otto',level:'A1',when:{flag:'platform-protected'},german:'Dein Ticket ist bei mir sicher. Voss fragt jeden Tag.',english:'Your ticket is safe with me. Voss asks every day.'},
  {npc:'marta',level:'A1',when:{flag:'receipt-kept'},german:'Du hast die Rechnung. Gut. Das Siegel mag ich nicht.',english:'You have the receipt. Good. I do not like that seal.'},
  {npc:'marta',level:'A1',when:{flag:'receipt-filed'},german:'Voss hat eine Kopie. Der Wasserkocher pfeift seit gestern nicht mehr.',english:'Voss has a copy. The kettle has not whistled since yesterday.'},
  {npc:'fritz',level:'A1',when:{flag:'berg-remembered'},german:'Frau Berg steht im Gästebuch. Heute koche ich für sie.',english:'Mrs Berg is in the guest book. Today I am cooking for her.'},
  {npc:'fritz',level:'A1',when:{flag:'crate-number-filed',withoutFlag:'berg-remembered'},german:'Voss hat die Nummer. Aber Frau Berg fehlt noch.',english:'Voss has the number. But Mrs Berg is still missing.'},
  {npc:'lina',level:'A1',when:{flag:'elise-letter-private'},german:'Der Brief bleibt bei dir. Ich habe nichts gesehen.',english:'The letter stays with you. I saw nothing.'},
  {npc:'lina',level:'A1',when:{flag:'waldruh-address-public'},german:'Die Adresse ist öffentlich. Hoffentlich war das klug.',english:'The address is public now. I hope that was wise.'},
  {npc:'emil',level:'A1',when:{flag:'lamp-carried'},german:'Die Lampe mag dich. Das ist sehr ungewöhnlich.',english:'The lamp likes you. That is very unusual.'},
  {npc:'emil',level:'A1',when:{flag:'lamp-registered'},german:'Voss hat die Lampe notiert. Sie hat ihn fast gebissen.',english:'Voss has noted the lamp. It almost bit him.'},
  {npc:'inspector',level:'A2',when:{flag:'quest:a2-clinic'},german:'Ich schlafe schlecht. Das ist für mich ungewöhnlich.',english:'I am sleeping badly. That is unusual for me.'},
  {npc:'marta',level:'A2',when:{flag:'quest:a2-apartment'},german:'Die Tür zum Café klemmt nicht mehr. Voss hat sie sogar gegrüßt.',english:'The door to the café no longer sticks. Voss even greeted it.'},
  {npc:'greta',level:'B1',when:{flag:'families-sheltered'},german:'Die Familien schlafen in der Klinik. Der Farn hat nur zweimal geniest.',english:'The families are sleeping in the clinic. The fern only sneezed twice.'},
  {npc:'emil',level:'B1',when:{flag:'signal-secured'},german:'Das Signal hält. Ich traue ihm trotzdem nicht, es hat zu viel Charakter.',english:'The signal holds. I still do not trust it; it has too much character.'},
  {npc:'ada',level:'B1',when:{flag:'ledger-published'},german:'Das Buch des Inspektors liegt im Rat. Jeder darf darin lesen.',english:'The inspector’s ledger lies before the council. Anyone may read in it.'},
  {npc:'inspector',level:'B1',when:{flag:'ledger-published'},german:'Jeder liest mein Buch. Es ist ungewohnt, nichts zu verbergen.',english:'Everyone is reading my ledger. It is strange to hide nothing.'},
];

/** Greetings reflect the current chapter and the choices people remember. */
function baseConversation(npc: NPC, level: Level, state: StoryState): DialogueLine[] {
  const line = (index:number,german:string,english:string):DialogueLine => greetingLine(npc.id,level,index,german,english);
  if (npc.id === 'elise') return [line(0,'Danke, dass du weitergefragt hast. Ein Atlas muss den Menschen zuhören.','Thank you for continuing to ask. An atlas must listen to people.')];
  if (npc.id === 'inspector') return [line(0,state.flags['quest:b1-work'] ? 'Ich habe die Wartung genehmigt. Ich werde meine Entscheidung öffentlich erklären.' : 'Ihre Fahrkarte, bitte. Auch meine Akten müssen geprüft werden.',state.flags['quest:b1-work'] ? 'I authorised the maintenance. I will explain my decision publicly.' : 'Your ticket, please. My records must be checked too.')];
  if (npc.id === 'ada' && state.flags['quest:a2-archive']) return [line(0,'Meine Aussage ist im Atlas. Eine Unterschrift ersetzt keine Zustimmung.','My statement is in the Atlas. A signature does not replace consent.')];
  const contextual:Record<string,[string,string]> = level === 'A1' ? {
    otto:['Der Zug wartet. Lies das Schild am Bahnsteig.','The train is waiting. Read the sign at the platform.'],
    marta:['Hallo! Die Quittung liegt am Café. Möchtest du hier üben?','Hello! The receipt is at the café. Would you like to practise here?'],
    fritz:['Die Äpfel sind frisch. Jeder Name bleibt in meinem Gästebuch.','The apples are fresh. Every name stays in my guest book.'],
    lina:['Ich lese jede Adresse. Kein Brief soll verloren gehen.','I read every address. No letter should get lost.'],
    emil:['Die Lampe sucht alte Adressen. Du kannst ihr folgen.','The lamp is looking for old addresses. You can follow it.'],
    greta:['Der Garten ist für alle. Bitte lass die Namen hier stehen.','The garden is for everyone. Please leave the names here.'],
    ada:['Hier sind die alten Karten. Frag mich nach den Namen.','Here are the old maps. Ask me about the names.'],
  } : level === 'A2' ? {
    otto:['Die alte Verbindung ist noch da. Wir müssen zuerst den Fahrplan vergleichen.','The old connection is still here. First we must compare the timetable.'],
    marta:['Dein Zimmer im Gasthaus ist sicher. Du kannst dort lesen, üben und den Tag beenden.','Your room at the inn is safe. You can read, practise and end the day there.'],
    fritz:['Wir haben eine Uhrzeit vereinbart. Ich bringe Suppe, und alle dürfen ihre Wünsche nennen.','We agreed on a time. I will bring soup, and everyone may state their wishes.'],
    lina:['Der Kreis möchte gefragt werden. Ich schreibe auf, was jede Person wirklich sagt.','The Circle wants to be consulted. I write down what each person actually says.'],
    emil:['Die Anleitung liegt an der Uhrenmühle. Erst prüfen wir den Anschluss, dann reparieren wir ihn.','The manual is at the clockmill. First we check the connection, then we repair it.'],
    greta:['Die Samentüten bestätigen die alten Adressen. Eine Erinnerung braucht Zeit und Respekt.','The seed packets confirm the old addresses. A memory needs time and respect.'],
    ada:['Die Akten sind nicht vollständig. Wir müssen sie mit den Berichten der Bewohner vergleichen.','The records are incomplete. We must compare them with residents’ accounts.'],
  } : {
    otto:['Eine gute Verbindung dient auch denen, die länger unterwegs sind. Die Klinikhaltestelle gehört in den Plan.','A good connection also serves those who travel longer. The clinic stop belongs in the plan.'],
    marta:['Die Laternenhüter brauchen keine stillen Helden. Wir brauchen Zusagen, auf die sich auch morgen jemand verlassen kann.','The Lamplighters do not need silent heroes. We need promises someone can rely on tomorrow too.'],
    fritz:['Ein öffentlicher Fahrplan und ein gemeinsamer Suppentopf lösen unterschiedliche Probleme. Beide brauchen klare Absprachen.','A public timetable and a shared soup pot solve different problems. Both need clear agreements.'],
    lina:['Ein Verdacht ist kein Zeuge. Wir bewahren die Quellen so auf, dass ihre eigenen Stimmen hörbar bleiben.','A suspicion is not a witness. We preserve sources so their own voices remain audible.'],
    emil:['Die Maschine ist reparierbar. Ob wir sie benutzen dürfen, entscheidet aber keine technische Anleitung.','The machine can be repaired. But a technical manual does not decide whether we may use it.'],
    greta:['Wer einen Garten schützt, schützt Arbeit, Erinnerungen und einen Ort, an dem sich Menschen begegnen.','Protecting a garden protects work, memories and a place where people meet.'],
    ada:['Wir halten auch unsere Fehler fest. Ein ehrlicher Atlas darf Widersprüche zeigen, ohne Menschen auszulöschen.','We record our mistakes too. An honest atlas can show contradictions without erasing people.'],
  };
  const pair=contextual[npc.id]??[npc.greeting,npc.greetingSentences?.map(sentence=>sentence.english).join(' ')??''];
  const lines=[line(0,...pair)];
  if ((npc.id==='otto'||npc.id==='marta')&&state.reputation.lamplighters>=3) lines.push(line(1,'Du hast unsere Versprechen gehalten. Wenn du Hilfe brauchst, kommen wir.','You kept our promises. If you need help, we will come.'));
  if ((npc.id==='greta'||npc.id==='lina')&&state.reputation.unwritten>=3) lines.push(line(1,'Du hast uns zuerst gefragt. Wir helfen dir und behalten unsere eigenen Stimmen.','You asked us first. We will help you and keep our own voices.'));
  return lines;
}

export function residentConversation(npc: NPC, level: Level, state: StoryState): DialogueLine[] {
  const lines = baseConversation(npc, level, state);
  for (const callback of ambientCallbacks.filter(item => item.npc === npc.id && item.level === level && conditionMet(item.when, state)).slice(0, 2)) lines.push(greetingLine(npc.id, level, 10 + ambientCallbacks.indexOf(callback), callback.german, callback.english));
  return lines;
}
/** Every callback line, for audio generation. */
export function ambientCallbackLines(): DialogueLine[] {
  return ambientCallbacks.map((callback, index) => greetingLine(callback.npc, callback.level, 10 + index, callback.german, callback.english));
}
