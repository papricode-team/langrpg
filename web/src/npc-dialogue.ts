import type { NPC, Level } from './content';
import type { DialogueLine, StoryState } from './dialogue';

export function earnedTitleGreeting(npc:NPC,title:string):DialogueLine | undefined {
  const german = ({'Lantern Bearer':'Hallo, Laternenträger! Deine erste Spur ist gerettet.','Lamplighter':'Willkommen, Laternenhüter! Lindenhafen kennt deinen Namen.','Route Keeper':'Willkommen, Streckenhüter! Du verbindest unsere Städte.','Atlas Keeper':'Willkommen, Atlashüter! Unsere Stimmen bleiben in deinem Atlas.'} as Record<string,string>)[title];
  if (!german || npc.id==='inspector') return;
  return {id:`${npc.id}-title-${title}`,speaker:npc.id,german,english:({ 'Lantern Bearer':'Hello, Lantern Bearer! Your first clue is saved.','Lamplighter':'Welcome, Lamplighter! Lindenhafen knows your name.','Route Keeper':'Welcome, Route Keeper! You connect our towns.','Atlas Keeper':'Welcome, Atlas Keeper! Our voices stay in your atlas.'} as Record<string,string>)[title],clipId:`title-${npc.id}-${title.toLowerCase().replaceAll(' ','-')}`};
}

/** Greetings reflect the current chapter and the choices people remember. */
export function residentConversation(npc: NPC, level: Level, state: StoryState): DialogueLine[] {
  const line = (index:number,german:string,english:string):DialogueLine => {
    let hash=2166136261;for(const character of german)hash=Math.imul(hash^character.charCodeAt(0),16777619);
    return {id:`${npc.id}-${level}-greeting-${index}`,speaker:npc.id,german,english,clipId:`greeting-${npc.id}-${level}-${index}-${(hash>>>0).toString(16)}`};
  };
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
