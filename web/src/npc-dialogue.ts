import type { NPC, Level } from './content';
import { conditionMet, type DialogueCondition, type DialogueLine, type StoryState } from './dialogue';

export function earnedTitleGreeting(npc:NPC,title:string):DialogueLine | undefined {
  const german = ({'Lantern Bearer':'Hallo, Laternenträger! Deine erste Spur ist gerettet.','Lamplighter':'Willkommen, Laternenhüter! Lindenhafen kennt deinen Namen.','Route Keeper':'Willkommen, Streckenhüter! Du verbindest unsere Städte.','Atlas Keeper':'Willkommen, Atlashüter! Unsere Stimmen bleiben in deinem Atlas.'} as Record<string,string>)[title];
  if (!german || npc.id==='inspector' || npc.id==='kessler' || npc.id==='jonas') return;
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
  {npc:'marta',level:'A1',when:{flag:'receipt-filed'},german:'Voss hat eine Kopie. Ich habe den Namen trotzdem aufgeschrieben.',english:'Voss has a copy. I wrote the name down anyway.'},
  {npc:'fritz',level:'A1',when:{flag:'berg-remembered'},german:'Frau Berg steht im Gästebuch. Heute koche ich für sie.',english:'Mrs Berg is in the guest book. Today I am cooking for her.'},
  {npc:'fritz',level:'A1',when:{flag:'crate-number-filed',withoutFlag:'berg-remembered'},german:'Voss hat die Nummer. Aber Frau Berg fehlt noch.',english:'Voss has the number. But Mrs Berg is still missing.'},
  {npc:'lina',level:'A1',when:{flag:'elise-letter-private'},german:'Der Brief bleibt bei dir. Ich habe nichts gesehen.',english:'The letter stays with you. I saw nothing.'},
  {npc:'lina',level:'A1',when:{flag:'waldruh-address-public'},german:'Die Adresse ist öffentlich. Hoffentlich war das klug.',english:'The address is public now. I hope that was wise.'},
  {npc:'emil',level:'A1',when:{flag:'lamp-carried'},german:'Bei dir ist die Lampe hell. Bei mir nicht.',english:'The lamp is bright with you. Not with me.'},
  {npc:'emil',level:'A1',when:{flag:'lamp-registered'},german:'Voss hat die Lampe notiert. Jetzt hat sie eine Nummer.',english:'Voss has noted the lamp. Now it has a number.'},
  {npc:'inspector',level:'A2',when:{flag:'quest:a2-clinic'},german:'Ich schlafe schlecht. Das ist für mich ungewöhnlich.',english:'I am sleeping badly. That is unusual for me.'},
  {npc:'marta',level:'A2',when:{flag:'quest:a2-apartment'},german:'Die Tür zum Café klemmt nicht mehr. Voss hat sie sogar gegrüßt.',english:'The door to the café no longer sticks. Voss even greeted it.'},
  {npc:'greta',level:'B1',when:{flag:'families-sheltered'},german:'Die Familien schlafen in der Klinik. Lina zählt sie jede Stunde.',english:'The families are sleeping in the clinic. Lina counts them every hour.'},
  {npc:'emil',level:'B1',when:{flag:'signal-secured'},german:'Das Signal hält. Ich traue ihm trotzdem nicht, es hat zu viel Charakter.',english:'The signal holds. I still do not trust it; it has too much character.'},
  {npc:'ada',level:'B1',when:{flag:'ledger-published'},german:'Das Buch des Inspektors liegt im Rat. Jeder darf darin lesen.',english:'The inspector’s ledger lies before the council. Anyone may read in it.'},
  {npc:'inspector',level:'B1',when:{flag:'ledger-published'},german:'Jeder liest mein Buch. Es ist ungewohnt, nichts zu verbergen.',english:'Everyone is reading my ledger. It is strange to hide nothing.'},
  {npc:'pip',level:'A1',when:{flag:'pip-game-loud'},german:'Du hast laut gespielt! Die Wand ist voll.',english:'You played loudly! The wall is full.'},
  {npc:'pip',level:'A1',when:{flag:'quest:a1-bench'},german:'Frau Berg hat mir gewinkt. Sie weiß jetzt, wer sie ist.',english:'Mrs Berg waved to me. She knows who she is now.'},
  {npc:'kessler',level:'A1',when:{flag:'notice-list-taken'},german:'Meine Liste fehlt. Ich habe eine Kopie. Ich habe immer eine Kopie.',english:'My list is missing. I have a copy. I always have a copy.'},
  {npc:'kessler',level:'A1',when:{flag:'guestbook-returned'},german:'Das Gästebuch ist bei Marta. Das ist nicht in Ordnung. Aber es ist dort.',english:'The guest book is with Marta. That is not in order. But it is there.'},
  {npc:'berg',level:'A1',when:{flag:'berg-at-marta'},german:'Marta hat mir Tee gebracht. Sie hat meinen Namen gesagt.',english:'Marta brought me tea. She said my name.'},
  {npc:'hilde',level:'A2',when:{flag:'hilde-invited'},german:'Ich komme zum Rat. Ich ziehe meinen guten Mantel an.',english:'I am coming to the council. I will wear my good coat.'},
  {npc:'falk',level:'A2',when:{flag:'ink-bought'},german:'Sie haben meine Tinte gekauft. Sie hält ein paar Tage. Mehr nicht.',english:'You bought my ink. It lasts a few days. No more.'},
  {npc:'falk',level:'B1',when:{flag:'falk-witness'},german:'Ich habe ausgesagt. Meine Hände zittern noch.',english:'I gave evidence. My hands are still shaking.'},
  {npc:'kessler',level:'B1',when:{flag:'kessler-turned'},german:'Regel vier ist gestrichen. Von mir. Mit Lineal.',english:'Rule four is struck out. By me. With a ruler.'},
  {npc:'jonas',level:'B1',when:{flag:'jonas-speaks'},german:'Guten Abend. Ich spreche wieder. Langsam.',english:'Good evening. I am speaking again. Slowly.'},
  {npc:'ruth',level:'B1',when:{flag:'ruth-lost'},german:'Lina sagt, ich heiße Ruth. Ich glaube ihr.',english:'Lina says my name is Ruth. I believe her.'},
  {npc:'jakob',level:'B1',when:{flag:'clinic-stop'},german:'Der Zug hat an der Klinik gehalten. Für uns. Ohne dass wir winken mussten.',english:'The train stopped at the clinic. For us. Without us having to wave.'},
  {npc:'berg',level:'A1',when:{flag:'pupils-remembered'},german:'Theo hat meine Brille gebracht. Ich kann wieder lesen. Und alle vier Namen stehen im Buch.',english:'Theo brought my glasses. I can read again. And all four names are in the book.'},
  {npc:'berg',level:'A2',when:{flag:'pupils-remembered'},german:'Meine Brille sitzt. Ich lese meinen Schülern jeden Abend vor.',english:'My glasses are on. I read to my pupils every evening.'},
  {npc:'falk',level:'B1',when:{flag:'falk-customers'},german:'Drei Kunden, drei leere Namen. Ich habe ihnen das Geld zurückgegeben.',english:'Three customers, three empty names. I gave them their money back.'},
];

/** Greetings reflect the current chapter and the choices people remember. */
function baseConversation(npc: NPC, level: Level, state: StoryState): DialogueLine[] {
  const line = (index:number,german:string,english:string):DialogueLine => greetingLine(npc.id,level,index,german,english);
  if (npc.id === 'elise') return [line(0,'Danke, dass du weitergefragt hast. Ein Atlas muss den Menschen zuhören.','Thank you for continuing to ask. An atlas must listen to people.')];
  if (npc.id === 'inspector') return [line(0,state.flags['quest:b1-work'] ? 'Ich habe die Wartung genehmigt. Ich werde meine Entscheidung öffentlich erklären.' : 'Ihre Fahrkarte, bitte. Auch meine Akten müssen geprüft werden.',state.flags['quest:b1-work'] ? 'I authorised the maintenance. I will explain my decision publicly.' : 'Your ticket, please. My records must be checked too.')];
  if (npc.id === 'ada' && state.flags['quest:a2-archive']) return [line(0,'Meine Aussage ist im Atlas. Eine Unterschrift ersetzt keine Zustimmung.','My statement is in the Atlas. A signature does not replace consent.')];
  const contextual:Record<string,[string,string]> = level === 'A1' ? {
    otto:['Guten Tag! Der Fahrplan hängt am Bahnhof. Alles pünktlich.','Good day! The timetable is at the station. Everything is on time.'],
    marta:['Hallo! Kaffee, Tee oder ein Zimmer? Bei mir gibt es alles.','Hello! Coffee, tea or a room? I have everything.'],
    fritz:['Die Äpfel sind frisch. Am Freitag gibt es Suppe für alle.','The apples are fresh. On Friday there is soup for everyone.'],
    lina:['Ich lese jede Adresse. Kein Brief soll verloren gehen.','I read every address. No letter should get lost.'],
    emil:['Hallo! Hier repariere ich alles. Es funktioniert meistens.','Hello! I repair everything here. It mostly works.'],
    greta:['Hallo! Tee aus dem Garten oder Medizin? Ich helfe gern.','Hello! Tea from the garden or medicine? I am happy to help.'],
    ada:['Hier sind die alten Karten. Sie sind sehr alt.','Here are the old maps. They are very old.'],
    kessler:['Nicht stehen bleiben. Regel vier.','Do not stand still. Rule four.'],
    pip:['Sag einen Namen! Laut! Dann bleibt er an der Wand.','Say a name! Loud! Then it stays on the wall.'],
    berg:['Guten Tag. Ich sitze hier jeden Tag. Kennen Sie mich?','Good day. I sit here every day. Do you know me?'],
    hilde:['Komm herein. Die Treppe ist alt, ich auch.','Come in. The stairs are old, and so am I.'],
    falk:['Tinte, die nie verblasst! Fast nie.','Ink that never fades! Almost never.'],
    jakob:['Guten Abend. Das Boot ist rot. Das weiß ich noch.','Good evening. The boat is red. That much I still know.'],
    ruth:['Ich kenne dich nicht. Aber du sagst meinen Namen richtig.','I do not know you. But you say my name correctly.'],
    jonas:['Er schreibt: Guten Tag.','He writes: good day.'],
  } : level === 'A2' ? {
    otto:['Die alte Verbindung ist noch da. Wir müssen zuerst den Fahrplan vergleichen.','The old connection is still here. First we must compare the timetable.'],
    marta:['Dein Zimmer im Gasthaus ist sicher. Du kannst dort lesen, üben und den Tag beenden.','Your room at the inn is safe. You can read, practise and end the day there.'],
    fritz:['Wir haben eine Uhrzeit vereinbart. Ich bringe Suppe, und alle dürfen ihre Wünsche nennen.','We agreed on a time. I will bring soup, and everyone may state their wishes.'],
    lina:['Der Kreis möchte gefragt werden. Ich schreibe auf, was jede Person wirklich sagt.','The Circle wants to be consulted. I write down what each person actually says.'],
    emil:['Die Anleitung liegt an der Uhrenmühle. Erst prüfen wir den Anschluss, dann reparieren wir ihn.','The manual is at the clockmill. First we check the connection, then we repair it.'],
    greta:['Die Samentüten bestätigen die alten Adressen. Eine Erinnerung braucht Zeit und Respekt.','The seed packets confirm the old addresses. A memory needs time and respect.'],
    ada:['Die Akten sind nicht vollständig. Wir müssen sie mit den Berichten der Bewohner vergleichen.','The records are incomplete. We must compare them with residents’ accounts.'],
    kessler:['Sie sind weit gereist. Ihre Akte auch.','You have travelled far. So has your file.'],
    pip:['Lina schreibt mir Briefe. Ich lese sie der Wand vor.','Lina writes me letters. I read them out to the wall.'],
    berg:['Mein Haus fehlt noch. Aber mein Name ist wieder da. Das ist ein Anfang.','My house is still missing. But my name is back. That is a start.'],
    hilde:['Von meinem Fenster sehe ich den Wald und alle, die kommen. Du kommst oft.','From my window I see the forest and everyone who comes. You come often.'],
    falk:['Früher habe ich Formulare geschrieben. Heute verkaufe ich Tinte. Beides hält nicht ewig.','I used to write forms. Today I sell ink. Neither lasts for ever.'],
    jakob:['Ich habe zwei Kinder. Ihre Namen liegen mir auf der Zunge.','I have two children. Their names are on the tip of my tongue.'],
    ruth:['Jemand hat mein Boot rot gestrichen. Ich glaube, das war ich.','Someone painted my boat red. I think it was me.'],
    jonas:['Er schreibt: Das Signal ist ruhig. Ich auch.','He writes: the signal is quiet. So am I.'],
  } : {
    otto:['Eine gute Verbindung dient auch denen, die länger unterwegs sind. Die Klinikhaltestelle gehört in den Plan.','A good connection also serves those who travel longer. The clinic stop belongs in the plan.'],
    marta:['Die Laternenhüter brauchen keine stillen Helden. Wir brauchen Zusagen, auf die sich auch morgen jemand verlassen kann.','The Lamplighters do not need silent heroes. We need promises someone can rely on tomorrow too.'],
    fritz:['Ein öffentlicher Fahrplan und ein gemeinsamer Suppentopf lösen unterschiedliche Probleme. Beide brauchen klare Absprachen.','A public timetable and a shared soup pot solve different problems. Both need clear agreements.'],
    lina:['Ein Verdacht ist kein Zeuge. Wir bewahren die Quellen so auf, dass ihre eigenen Stimmen hörbar bleiben.','A suspicion is not a witness. We preserve sources so their own voices remain audible.'],
    emil:['Die Maschine ist reparierbar. Ob wir sie benutzen dürfen, entscheidet aber keine technische Anleitung.','The machine can be repaired. But a technical manual does not decide whether we may use it.'],
    greta:['Wer einen Garten schützt, schützt Arbeit, Erinnerungen und einen Ort, an dem sich Menschen begegnen.','Protecting a garden protects work, memories and a place where people meet.'],
    ada:['Wir halten auch unsere Fehler fest. Ein ehrlicher Atlas darf Widersprüche zeigen, ohne Menschen auszulöschen.','We record our mistakes too. An honest atlas can show contradictions without erasing people.'],
    kessler:['Ich habe meine Liste noch. Ich lese sie jetzt anders.','I still have my list. I read it differently now.'],
    pip:['Lina hat gesagt, Mama und Papa kommen mit dem nächsten Zug. Ich zähle die Züge.','Lina said Mum and Dad are coming on the next train. I am counting the trains.'],
    berg:['Meine Schüler besuchen mich jetzt jeden Tag. Sie sagen meinen Namen, bevor ich frage.','My pupils visit me every day now. They say my name before I ask.'],
    hilde:['Ich bin zum Rat gefahren. Mit dem Zug. Zum ersten Mal seit zwölf Jahren.','I travelled to the council. By train. For the first time in twelve years.'],
    falk:['Meine Schrift ist jetzt weniger schön. Und ehrlicher.','My handwriting is less beautiful now. And more honest.'],
    jakob:['Lina! Pip! Ich habe ihre Namen jeden Morgen geübt. Wie ein Schüler.','Lina! Pip! I practised their names every morning. Like a pupil.'],
    ruth:['Ich heiße Ruth. Ich sage es oft, damit es bleibt.','My name is Ruth. I say it often so that it stays.'],
    jonas:['Er schreibt: Das Signal hält. Danke.','He writes: the signal holds. Thank you.'],
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
