import type { Level } from './content';
import type { MapId } from './maps';
import type { Narrative } from './sentence-translations';

const sentence = (german: string, english: string) => ({ german, english });

export interface StoryAct {
  mapId: MapId;
  level: Level;
  number: string;
  title: string;
  premise: Narrative;
  introduction: Narrative[];
  goal: Narrative;
  cliffhanger: Narrative;
}
export const storyActs: StoryAct[] = [
  {
    mapId: 'lindenhafen', level: 'A1', number: 'I', title: 'The platform that should not exist',
    premise: [
      sentence('Ein Zug kommt aus einer Stadt, die alle vergessen haben.', 'A train arrives from a town everyone has forgotten.'),
      sentence('Sein letzter Fahrgast ist ein Brief an dich.', 'Its last passenger is a letter addressed to you.'),
    ],
    introduction: [
      [
        sentence('Dein Zug kommt in Lindenhafen an, mit einem zusätzlichen Wagen voller schlafender Tauben.', 'Your train reaches Lindenhafen with an extra carriage full of sleeping pigeons.'),
        sentence('Otto nennt das ein kleines Problem mit dem Fahrplan.', 'Otto calls this a minor timetable issue.'),
        sentence('Dann beleuchtet eine Laterne einen Bahnsteig, der auf keiner Karte steht.', 'Then a lantern lights a platform that is missing from every map.'),
      ],
      [
        sentence('Der Laternenatlas hat die Städte früher miteinander verbunden.', 'The Lantern Atlas once kept the towns connected.'),
        sentence('Jemand hat eine Strecke herausgerissen.', 'Someone has torn out a route.'),
        sentence('Adressen verschwinden langsam.', 'Addresses are fading.'),
        sentence('Briefe kommen morgen, gestern oder in Martas Kühlschrank an.', 'Letters arrive tomorrow, yesterday, or inside Marta’s refrigerator.'),
      ],
      [
        sentence('Sprich mit Otto. Lies die Schilder. Finde den Brief.', 'Talk to Otto. Read the signs. Find the letter.'),
        sentence('Du brauchst keine Deutschkenntnisse, um anzufangen.', 'You do not need any German to begin.'),
        sentence('Ein bisschen Hilfe gibt es immer.', 'A little help is always available.'),
      ],
    ],
    goal: [sentence('Finde den Absender des Briefes aus der verschwundenen Stadt.', 'Find the sender of the letter from the missing town.')],
    cliffhanger: [
      sentence('Auf der leeren Seite steht endlich ein Ortsname: Waldruh.', 'The blank page finally names a place: Waldruh.'),
      sentence('Darunter erscheint eine Nachricht: „Bevor du uns wieder auslöschst, komm.“', 'Under it, a message appears: “Before you erase us again, come.”'),
    ],
  },
  {
    mapId: 'waldruh', level: 'A2', number: 'II', title: 'The village that lost an hour',
    premise: [
      sentence('Hier geht der Herbst nie ganz zu Ende.', 'Autumn never quite ends here.'),
      sentence('Alle Uhren meiden Mitternacht, und die Dorfbewohner erinnern sich an mehr, als in ihren Akten steht.', 'Every clock avoids midnight, and the villagers remember more than their records do.'),
    ],
    introduction: [
      [
        sentence('Die vergessene Strecke führt nach Waldruh, einem herbstlichen Dorf rund um eine alte Uhrenmühle.', 'The forgotten route winds into Waldruh, an autumn village built around an old clockmill.'),
        sentence('Ihr Wasserrad dreht sich.', 'Its waterwheel turns.'),
        sentence('Ihre Uhren zeigen verschiedene Zeiten.', 'Its clocks disagree.'),
        sentence('Auf einem kleinen Messingschild steht, dass das Dorf „freiwillig aufgehört hat zu existieren“.', 'A small brass notice says the village has “voluntarily ceased to exist”.'),
        sentence('Niemand erinnert sich daran, freiwillig zugestimmt zu haben.', 'Nobody remembers volunteering.'),
      ],
      [
        sentence('Marta hat ein Gasthaus mit einem wandernden Zimmer im Obergeschoss gefunden; Emil versucht, die verlorene Stunde zu reparieren.', 'Marta has found an inn with a travelling upstairs room; Emil is trying to repair the lost hour.'),
        sentence('Jedes Mal, wenn die Uhrenmühle die Stunde wiederholt, verschwindet der Name eines weiteren Bewohners aus den Akten.', 'Each time the clockmill repeats it, another resident’s name fades from the records.'),
        sentence('Ada erkennt das Siegel des Schließungsbeschlusses und wechselt ziemlich schnell das Thema.', 'Ada recognises the closure seal, and changes the subject rather quickly.'),
      ],
      [
        sentence('Das Messingamt besteht darauf, dass die alten Akten stimmen.', 'The Brass Office insists the old records are correct.'),
        sentence('Die Laternenhüter wollen jede Strecke wieder öffnen.', 'The Lamplighters want every route reopened.'),
        sentence('Die Dorfbewohner vom Kreis der Ungeschriebenen wollen zuerst gefragt werden.', 'The villagers’ Unwritten Circle want someone to ask them first.'),
        sentence('Mache Pläne, finde heraus, was passiert ist, und entdecke, wessen Versprechen ausgelöscht wurde.', 'Make plans, reconstruct what happened, and find whose promise was erased.'),
      ],
    ],
    goal: [sentence('Hole die verlorene Stunde zurück und folge dem unterschriebenen Auftrag nach Nebelstadt.', 'Recover the lost hour and follow the signed order to Nebelstadt.')],
    cliffhanger: [
      sentence('Ada gibt zu, dass sie als Lehrling den ersten Schließungsbeschluss unterschrieben hat.', 'Ada admits she signed the first closure record as an apprentice.'),
      sentence('Der endgültige Auftrag trägt einen anderen Namen: Elise Sander, Hüterin des Atlas.', 'The final order bears another name: Elise Sander, Keeper of the Atlas.'),
      sentence('Die Antwort wartet in Nebelstadt.', 'The answer is waiting in Nebelstadt.'),
    ],
  },
  {
    mapId: 'nebelstadt', level: 'B1', number: 'III', title: 'The promise in the mist',
    premise: [
      sentence('Ein Hafenrat streitet über eine Bahnstrecke, einen Garten und das Recht, nicht vergessen zu werden.', 'A harbour council argues over a railway, a garden, and the right to be remembered.'),
      sentence('Die verschwundene Hüterin hat hier Beweise hinterlassen.', 'The missing keeper left evidence here.'),
    ],
    introduction: [
      [
        sentence('Nebelstadt erhebt sich aus dem Nebel um einen Signalhafen und eine Sternwarte.', 'Nebelstadt rises from the mist around a signal harbour and an observatory.'),
        sentence('Der Rat hat das Messingamt, die Laternenhüter und den Kreis der Ungeschriebenen einberufen.', 'The council has summoned the Brass Office, the Lamplighters, and the Unwritten Circle.'),
        sentence('Alle haben Beweise mitgebracht.', 'Everyone brought evidence.'),
        sentence('Fritz hat Suppe mitgebracht, und im Moment ist sie das Einzige, worüber sich alle einig sind.', 'Fritz brought soup, which is currently the only thing they agree on.'),
      ],
      [
        sentence('Die Schließungsbeschlüsse widersprechen einander.', 'The closure orders contradict one another.'),
        sentence('Das Signal der Hüterin wurde an zwei Orten gleichzeitig gehört.', 'The keeper’s signal was heard in two places at once.'),
        sentence('Über dem Hafen sendet ein Leuchtturm einen dunklen Strahl in Richtung Waldruh.', 'Above the harbour, a lighthouse sends a dark beam toward Waldruh.'),
        sentence('Ein neuer Beschluss wird endgültig, wenn die große Glocke zum siebten Mal läutet.', 'A new order will become permanent when the great bell rings for the seventh time.'),
      ],
      [
        sentence('Vergleiche Zeugenaussagen, folge dem Reparaturbuch und hilf dem Hafen durch einen Sturm.', 'Compare witnesses, follow the repair ledger, and help the harbour through a storm.'),
        sentence('Finde heraus, was das dunkle Signal bewirkt, bevor die große Glocke wieder läutet.', 'Find what the dark signal is doing before the next great bell.'),
        sentence('Eine vorschnelle Anschuldigung könnte die Wahrheit genauso gründlich begraben wie eine fehlende Seite.', 'A hurried accusation could bury the truth as thoroughly as a missing page.'),
      ],
    ],
    goal: [sentence('Trage die Beweise zusammen und schreibe ein Versprechen auf, dem alle entlang der Strecke vertrauen können.', 'Bring the evidence together and write a promise the whole route can trust.')],
    cliffhanger: [
      sentence('Drei Städte kehren in den Atlas zurück.', 'Three towns return to the Atlas.'),
      sentence('Jenseits der wiederhergestellten Strecke erscheint eine schwache Küstenlinie ohne Namen.', 'Beyond the restored route, a faint coastline appears with no name.'),
      sentence('Irgendwo wartet noch jemand auf eine Antwort.', 'Someone, somewhere, is still waiting for an answer.'),
    ],
  },
];

export interface StoryClue { questId: string; title: string; text: Narrative; lead: Narrative; }
export const storyClues: StoryClue[] = [
  {
    questId: 'a1-arrival', title: 'The extra platform',
    text: [
      sentence('In Ottos Fahrgastbuch ist eine leere Zeile, wo ein Ziel stehen sollte.', 'Otto’s passenger ledger has a blank line where a destination should be.'),
      sentence('Die Laterne über dem zusätzlichen Bahnsteig reagiert noch auf diesen fehlenden Namen.', 'The lantern above the extra platform still answers to that missing name.'),
    ],
    lead: [sentence('Marta hat eine Quittung von dem geheimnisvollen Fahrgast aufbewahrt.', 'Marta kept a receipt from the mysterious passenger.'), sentence('Du findest sie im Café.', 'Find her at the café.')],
  },
  {
    questId: 'a1-cafe', title: 'Tomorrow’s receipt',
    text: [
      sentence('Martas Wasserkocher pfeift den Regen von morgen.', 'Marta’s kettle whistles tomorrow’s rain.'),
      sentence('Auch auf ihrer Quittung steht das Datum von morgen, und sie trägt ein Messingsiegel.', 'Her receipt is dated tomorrow too, and carries a brass seal.'),
      sentence('Marta hat früher Nachrichten für die Laternenhüter gebracht; ihre alte Tasche hat sie behalten.', 'She once delivered messages for the Lamplighters; she has kept her old satchel.'),
    ],
    lead: [sentence('Fritz hat dieses Siegel auf einer Lieferung am Markt gesehen.', 'Fritz has seen that seal on a delivery at the market.')],
  },
  {
    questId: 'a1-market', title: 'The numbered apple',
    text: [
      sentence('Das Zeichen auf Fritz’ Apfel ist eine Streckennummer des Messingamts.', 'The mark on Fritz’s apple is a Brass Office route number.'),
      sentence('Seine weggelaufene Liste hat eine Adresse durchgestrichen, an die er sich nicht mehr erinnert.', 'His runaway list had crossed out an address he no longer remembers.'),
      sentence('Fritz bewahrt das Gästebuch des Suppenclubs auf, denn Papier lässt sich nicht so leicht vergessen, wie die Leute denken.', 'Fritz keeps the soup club’s guest book because paper is harder to forget than people think.'),
    ],
    lead: [sentence('Frage Otto nach der Streckennummer und der seltsamen Bahnhofsdurchsage.', 'Ask Otto about the route number and the strange station announcement.')],
  },
  {
    questId: 'a1-station', title: 'A name in the announcement',
    text: [
      sentence('Unter den normalen Abfahrten erscheint kurz ein W. Der Rest des Namens fehlt.', 'Under the ordinary departures, a W briefly appears. The rest of the name is missing.'),
      sentence('Otto erinnert sich daran, diese Fahrkarte verkauft zu haben, obwohl es die Stadt laut offiziellem Fahrplan nie gab.', 'Otto remembers selling that ticket, though the official timetable insists the town was never there.'),
    ],
    lead: [sentence('Emils wandernde Lampe reagiert auf dieselbe Streckennummer.', 'Emil’s wandering lamp reacts to the same route number.')],
  },
  {
    questId: 'a1-workshop', title: 'The lamp that remembers',
    text: [
      sentence('Emils Lampe folgt ausgelöschten Adressen, nicht Menschen.', 'Emil’s lamp follows erased addresses, not people.'),
      sentence('Er hat sie aus einem alten Signal des Atlas gebaut.', 'He built it from a retired Atlas signal.'),
      sentence('Das Zeichen in ihrem Gehäuse passt zu dem Apfel mit der Nummer und zu Martas Quittung.', 'The symbol in its housing matches the numbered apple and Marta’s receipt.'),
    ],
    lead: [sentence('Lina hat ein Paket, das die Lampe einfach nicht in Ruhe lässt.', 'Lina has a parcel the lamp refuses to leave alone.')],
  },
  {
    questId: 'a1-lost-parcel', title: 'A letter from the missing town',
    text: [
      sentence('Die leere Seite aus dem Paket leuchtet neben dem Bahnhof auf.', 'The parcel’s blank page lights up beside the station.'),
      sentence('Sie nennt Waldruh und zeigt dann eine Bitte: „Bevor du uns wieder auslöschst, komm.“', 'It names Waldruh, then reveals a request: “Before you erase us again, come.”'),
      sentence('Die verschwundene Stadt ist noch da.', 'The missing town is still there.'),
      sentence('Jemand hat gewartet.', 'Someone has been waiting.'),
    ],
    lead: [sentence('Öffne den Regionenatlas und reise nach Waldruh.', 'Open the region atlas and travel to Waldruh.')],
  },
  {
    questId: 'a2-apartment', title: 'Two addresses, one room',
    text: [
      sentence('Das Zimmer im Obergeschoss des Gasthauses blickt auf zwei Städte, weil sein Mietvertrag noch ein Versprechen zwischen ihnen enthält.', 'The inn’s upstairs room looks onto two towns because its lease still carries a promise between them.'),
      sentence('Sogar ein Kühlschrank kann sich an eine Adresse erinnern, wenn die Aktenverwalter es nicht können.', 'Even a refrigerator can remember an address when the record keepers cannot.'),
    ],
    lead: [sentence('Fritz’ Laternenfest könnte eine Nachricht über das Dorf hinaus senden.', 'Fritz’s lantern gathering could send a message beyond the village.')],
  },
  {
    questId: 'a2-evening-plans', title: 'The Unwritten Circle',
    text: [
      sentence('Das Festsignal erreicht eine Gruppe von Dorfbewohnern, die sich Kreis der Ungeschriebenen nennt.', 'The festival signal reaches a group of villagers who call themselves the Unwritten Circle.'),
      sentence('Sie wurden nie gefragt, ob die Strecke geschlossen werden soll.', 'They were never asked to close the route.'),
      sentence('Ihre erste Bitte ist erstaunlich alltäglich: Vereinbart eine Uhrzeit und kommt dann auch.', 'Their first request is surprisingly ordinary: agree on a time, then show up.'),
    ],
    lead: [sentence('Otto hat die Verbindung gefunden, über die der Schließungsbeschluss hierherkam.', 'Otto has found the connection that brought the closure order here.')],
  },
  {
    questId: 'a2-rail-trip', title: 'Closed from the inside',
    text: [
      sentence('Die Bahnstrecke wurde nicht zerstört.', 'The railway was not destroyed.'),
      sentence('Mit dem Schlüssel einer Hüterin wurde sie von innen im Atlas geschlossen.', 'A keeper’s key closed it from within the Atlas.'),
      sentence('Jemand hat sich für die Stille entschieden, und das Messingamt hat das später als Vereinbarung beschrieben.', 'Someone chose the silence, and the Brass Office later described it as an agreement.'),
    ],
    lead: [sentence('Rekonstruiere Emils Reparaturen in der Uhrenmühle.', 'Reconstruct Emil’s repairs at the clockmill.')],
  },
  {
    questId: 'a2-broken-clock', title: 'The lost hour',
    text: [
      sentence('In Emils Reparaturnotizen fehlt die Stunde vor Mitternacht.', 'Emil’s repair notes skip the hour before midnight.'),
      sentence('Jede Wiederholung löscht den Namen eines weiteren Bewohners aus.', 'Each replay erases another resident’s name.'),
      sentence('Jemand hat seine Werkzeuge ausgeliehen, um das Signal der Strecke abzutrennen, und sie dann mit einem höflichen Dankesbrief zurückgegeben.', 'His tools were borrowed to detach the route’s signal, then returned with a polite thank-you note.'),
      sentence('Er ist gegen die Sabotage, aber die Handschrift gefällt ihm.', 'He objects to the sabotage, but appreciates the handwriting.'),
    ],
    lead: [sentence('Greta kennt einen Dorfbewohner, dessen Erinnerungen die fehlende Stunde überstanden haben.', 'Greta knows a villager whose memories survived the missing hour.')],
  },
  {
    questId: 'a2-clinic', title: 'A memory no clock can erase',
    text: [
      sentence('Ein Patient erinnert sich daran, nach Waldruh gereist zu sein, bevor die Akten geändert wurden.', 'A patient remembers travelling to Waldruh before the records changed.'),
      sentence('Greta hat Samentüten aus Gärten entlang der alten Bahnstrecke aufbewahrt.', 'Greta has kept seed packets from gardens along the old railway.'),
      sentence('Ihre handgeschriebenen Adressen sind unabhängige Beweise.', 'Their handwritten addresses are independent evidence.'),
    ],
    lead: [sentence('Bringe diese Berichte zu Adas wanderndem Archiv.', 'Bring these accounts to Ada’s travelling archive.')],
  },
  {
    questId: 'a2-archive', title: 'Ada’s signature',
    text: [
      sentence('Ada gibt zu, als Elise Sanders Lehrling den frühen Schließungsbeschluss unterschrieben zu haben.', 'Ada admits signing the early closure record as Elise Sander’s apprentice.'),
      sentence('Sie dachte, er wäre vorübergehend.', 'She thought it was temporary.'),
      sentence('Den endgültigen Beschluss hat Elise in Nebelstadt unterschrieben, und unter dem offiziellen Siegel auf Adas Kopie ist eine Warnung versteckt.', 'The final order was signed by Elise in Nebelstadt, and Ada’s copy has a warning hidden under the official seal.'),
    ],
    lead: [sentence('Reise nach Nebelstadt und vergleiche die Zeugenaussagen, bevor du Schlüsse ziehst.', 'Travel to Nebelstadt and compare the witnesses before drawing conclusions.')],
  },
  {
    questId: 'b1-witness', title: 'The recorded echo',
    text: [
      sentence('Die Hüterin war nicht an zwei Orten gleichzeitig.', 'The keeper was not in two places at once.'),
      sentence('Ein Zeuge hörte eine alte Signalaufnahme.', 'One witness heard an old signal recording.'),
      sentence('Lina trennt das, was die Leute gesehen haben, von dem, was sie daraus geschlossen haben; ihre Lieferzeiten ergeben jetzt eine nützliche Zeitleiste.', 'Lina separates what people saw from what they inferred; her delivery times now form a useful timeline.'),
    ],
    lead: [sentence('Arbeite mit Otto an einer Strecke, die die Dorfbewohner wirklich nutzen können.', 'Work with Otto on a route the villagers can actually use.')],
  },
  {
    questId: 'b1-new-route', title: 'A route with room for a garden',
    text: [
      sentence('Würde man das alte Gleis genau wie früher wieder öffnen, führte es durch den Dorfgarten.', 'Reopening the old track exactly as it was would cut through the village garden.'),
      sentence('Der Kreis der Ungeschriebenen unterstützt eine Verbindung, die den Alltag der Bewohner respektiert.', 'The Unwritten Circle support a connection that respects their daily lives.'),
      sentence('Ein schnellerer Zug ist nicht dasselbe wie ein besseres Versprechen.', 'A faster train is not the same as a better promise.'),
    ],
    lead: [sentence('Emil braucht Hilfe bei der Planung der Wiederherstellungsarbeiten.', 'Emil needs help planning the restoration work.')],
  },
  {
    questId: 'b1-work', title: 'The repair ledger',
    text: [
      sentence('Das Reparaturbuch beweist, dass das Signal absichtlich getrennt wurde.', 'The restoration ledger proves the signal was disconnected deliberately.'),
      sentence('Elise glaubte, die Abschottung würde verhindern, dass aus einem Streit eine Krise wird.', 'Elise believed isolation would stop a quarrel from becoming a crisis.'),
      sentence('Das Messingamt machte aus ihrer vorübergehenden Maßnahme eine bequeme amtliche Wahrheit.', 'The Brass Office turned her temporary measure into a convenient official truth.'),
    ],
    lead: [sentence('Bringe das Reparaturbuch zum Rat und erkläre, was die Beweise belegen.', 'Bring the ledger to the council and explain what the evidence supports.')],
  },
  {
    questId: 'b1-council', title: 'Protection without permission',
    text: [
      sentence('Der Rat erfährt endlich, warum Elise die Strecke ausgelöscht hat.', 'The council finally hears why Elise erased the route.'),
      sentence('Aus dem Schutz des Dorfes wurde das Entscheiden über seine Köpfe hinweg.', 'Protecting the village became deciding for it.'),
      sentence('Ada liest die ausgelassenen Einwände laut vor.', 'Ada reads the omitted objections aloud.'),
      sentence('Der dunkle Leuchtturmstrahl wertet jede fehlende Antwort als Zustimmung; der siebte Schlag der großen Glocke würde diese falsche Vereinbarung endgültig machen.', 'The dark lighthouse beam records every missing answer as consent; the seventh great bell would make that false agreement permanent.'),
    ],
    lead: [sentence('Ein Sturm zieht auf.', 'A storm is approaching.'), sentence('Hilf dem Hafen, die neue Zusammenarbeit in die Praxis umzusetzen.', 'Help the harbour put its new cooperation into practice.')],
  },
  {
    questId: 'b1-storm', title: 'A promise kept in the rain',
    text: [
      sentence('Menschen aus allen drei Städten schützen gemeinsam den Garten, transportieren Vorräte und stellen das Signal wieder her.', 'People from all three towns protect the garden, move supplies, and restore the signal together.'),
      sentence('Die Laternen des Atlas reagieren auf diese kleinen verbindlichen Zusagen.', 'The Atlas lanterns respond to these small commitments.'),
      sentence('Das Signal übermittelt die Antworten der Dorfbewohner, bevor die Glocke ihr Schweigen festhalten kann.', 'The signal carries the villagers’ replies before the bell can record silence.'),
      sentence('Vertrauen entsteht wieder durch das, was die Menschen tatsächlich tun.', 'Trust is being rebuilt through things people actually do.'),
    ],
    lead: [sentence('Triff Ada in der Sternwarte, um die endgültige Vereinbarung zu schreiben.', 'Meet Ada at the observatory to write the final agreement.')],
  },
  {
    questId: 'b1-atlas', title: 'The route returns',
    text: [
      sentence('Die neue Vereinbarung hält fest, was passiert ist, nennt die betroffenen Menschen und verspricht eine sichere Verbindung, die den Garten schützt.', 'The new agreement records what happened, names the people affected, and promises a safe connection that protects the garden.'),
      sentence('Die Strecke kehrt in den Atlas zurück.', 'The route returns to the Atlas.'),
      sentence('Elises Entscheidung bleibt ehrlich in Erinnerung, statt stillschweigend entschuldigt zu werden.', 'Elise’s choice is remembered honestly, rather than quietly excused.'),
    ],
    lead: [sentence('Erkunde die wiederhergestellten Städte.', 'Explore the restored towns.'), sentence('Am Rand des Atlas erscheint eine schwache Küstenlinie ohne Namen.', 'A faint, unnamed coastline is appearing at the edge of the Atlas.')],
  },
];

export const objectStories: Record<string, { detail: Narrative; secret: Narrative }> = {
  'lindenhafen-platform-ticket': { detail: [sentence('Die Fahrkarte trägt deinen Namen und Elises Zeichen.', 'The ticket carries your name and Elise’s mark.')], secret: [sentence('Die Laterne antwortet auf den Schlüssel ihrer Nachfolge.', 'The lantern answers to her successor’s key.')] },
  'lindenhafen-cafe-receipt': { detail: [sentence('Ein Kaffee. Das Datum ist morgen.', 'One coffee. The date is tomorrow.')], secret: [sentence('Das Messingsiegel verbindet die Quittung mit der fehlenden Strecke.', 'The brass seal connects the receipt to the missing route.')] },
  'lindenhafen-market-crate': { detail: [sentence('Zwei Äpfel. Strecke sieben. Eine Adresse ist leer.', 'Two apples. Route seven. An address is blank.')], secret: [sentence('Fritz hat den Namen im Gästebuch behalten.', 'Fritz kept the name in his guest book.')] },
  'lindenhafen-fountain': {
    detail: [sentence('Münzen im Brunnen landen auf den Wünschen von gestern.', 'Coins in the fountain land on yesterday’s wishes.'), sentence('Auf einer Messingmarke steht eine Streckennummer, die niemand auf dem Platz erklären kann.', 'One brass token bears a route number that nobody in the square can explain.')],
    secret: [sentence('Marta sagt, der Brunnen hat früher Nachrichten zwischen den Cafés der Laternenhüter transportiert.', 'Marta says the fountain once carried messages between Lamplighter cafés.'), sentence('Sie sagt auch, die Rechnung des Klempners war völlig normal.', 'She insists the plumbing bill was entirely ordinary.')],
  },
  'lindenhafen-noticeboard': {
    detail: [sentence('Auf einem Abfahrtszettel ist eine saubere rechteckige Lücke, wo das Ziel stehen sollte.', 'A departure slip has a clean rectangular gap where its destination should be.'), sentence('Die Stecknadel ist noch warm.', 'The pin is still warm.')],
    secret: [sentence('Otto lässt die Lücke sichtbar.', 'Otto leaves the gap on display.'), sentence('Ohne sie wäre es ordentlicher, und genau das macht ihn misstrauisch.', 'Removing it would be tidier, which is precisely what makes him suspicious.')],
  },
  'lindenhafen-parcel': {
    detail: [sentence('Das Etikett ist an morgen adressiert.', 'The label is addressed to tomorrow.'), sentence('Wenn du das Paket drehst, versucht seine Tinte, den Namen einer Stadt zu schreiben, die du noch nie besucht hast.', 'When you turn the parcel, its ink tries to spell a town you have never visited.')],
    secret: [sentence('Lina hat schon zweimal an gestern geliefert.', 'Lina has delivered to yesterday twice.'), sentence('Dies ist das erste Paket, das sie bittet, eine Entschuldigung zu liefern.', 'This is the first parcel that asked her to deliver an apology.')],
  },
  'lindenhafen-workbench': {
    detail: [sentence('Eine kleine Lampe neigt sich zur Bahnstrecke statt zur nächsten Person.', 'A small lamp tilts toward the railway instead of toward the nearest person.'), sentence('Ihr Gehäuse trägt dasselbe Zeichen wie die Marke aus dem Brunnen.', 'Its casing has the same mark as the fountain token.')],
    secret: [sentence('Emil hat sie unter „funktioniert meistens“ abgelegt.', 'Emil filed it under “mostly working”.'), sentence('Die Lampe scheint mit dem Wort „meistens“ nicht einverstanden zu sein.', 'The lamp appears to disagree with the word “mostly”.')],
  },
  'lindenhafen-garden': {
    detail: [sentence('Bei einer Reihe beschrifteter Kräuter liegt eine Samentüte, die an einen ausgelöschten Bahnhof adressiert ist.', 'A row of labelled herbs includes a packet addressed to an erased railway stop.'), sentence('Greta hat die Adresse grün unterstrichen.', 'Greta has underlined the address in green.')],
    secret: [sentence('Die Pflanzen erinnern sich daran, woher sie kommen.', 'The plants remember where they came from.'), sentence('Greta bewahrt ihre Unterlagen auf, falls die Beamten den Farn kontrollieren kommen.', 'Greta is keeping their paperwork in case the officials come to inspect the fern.')],
  },
  'waldruh-clock': {
    detail: [sentence('Die Uhrenmühle springt von 23:59 auf 01:00 Uhr.', 'The clockmill moves from 23:59 to 01:00.'), sentence('Dazwischen dreht sich ein Rad, ohne ein anderes zu berühren.', 'Between those times, one wheel turns without touching another.')],
    secret: [sentence('Emil nennt das fehlende Zahnrad in seinen Notizen eine „Verwaltungsentscheidung“.', 'Emil’s notes call the missing gear an “administrative decision”.'), sentence('Er hat diesen Ausdruck ziemlich kräftig eingekreist.', 'He has circled that phrase rather forcefully.')],
  },
  'waldruh-housing-board': {
    detail: [sentence('Ein Zimmer wird unter zwei Adressen angeboten.', 'One room is advertised at two addresses.'), sentence('Der Aushang bittet die Mieter, vor dem Wechsel der Aussicht anzuklopfen.', 'The notice asks tenants to knock before changing the view.')],
    secret: [sentence('Sein Mietvertrag ist noch immer eine Vereinbarung zwischen Städten.', 'Its lease is still an agreement between towns.'), sentence('Dieses kleine, ungebrochene Versprechen hat eine schmale Verbindung am Leben gehalten.', 'That small, unbroken promise has kept a narrow route alive.')],
  },
  'waldruh-herb-garden': {
    detail: [sentence('Die Beete folgen dem Verlauf der alten Bahnstrecke.', 'The beds are arranged along the shape of the old railway.'), sentence('Auf jeder Samentüte steht ein handgeschriebener Ortsname.', 'Every seed packet has a handwritten place name.')],
    secret: [sentence('Greta hat die ursprünglichen Adressen behalten, nachdem das Messingamt „korrigierte“ Etiketten ausgegeben hat.', 'Greta kept the original addresses after the Brass Office issued “corrected” labels.'), sentence('Der Garten ist ein stilles Gegenarchiv.', 'The garden is a quiet counter-archive.')],
  },
  'waldruh-route-sign': {
    detail: [sentence('Das alte Streckenschild zeigt nach Nebelstadt.', 'The old route sign points toward Nebelstadt.'), sentence('Eine neuere Tafel sagt, dass es hier nie eine Strecke gab.', 'A newer plaque says there was never a route here.')],
    secret: [sentence('Unter der neueren Tafel ist die ältere Farbe.', 'The older paint is beneath the newer plaque.'), sentence('Jemand hat die Geschichte geändert, ohne die Beweise zu entfernen.', 'Someone revised the story without removing the evidence.')],
  },
  'waldruh-memory-stone': {
    detail: [sentence('Auf dem Stein stehen Namen vom letzten Laternenfest.', 'The stone lists names from the last lantern gathering.'), sentence('Eine Stelle nahe dem unteren Rand ist glatt poliert worden.', 'A space near the bottom has been polished smooth.')],
    secret: [sentence('Die Dorfbewohner legen Blumen neben die Lücke.', 'The villagers leave flowers beside the gap.'), sentence('Auch auf einen ausgelöschten Namen können noch Menschen warten.', 'An erased name can still have people waiting for it.')],
  },
  'nebelstadt-repair-ledger': { detail: [sentence('Das Amt ließ die Maschine nach dem Streit weiter warten.', 'The office kept the machine maintained after the dispute.')], secret: [sentence('Der Inspektor genehmigte jede neue Löschspule persönlich.', 'The inspector personally authorised every new eraser coil.')] },
  'nebelstadt-council-board': {
    detail: [sentence('Drei Aushänge fordern Geschwindigkeit, Sicherheit und eine Stimme bei der Entscheidung.', 'Three notices argue for speed, safety, and a voice in the decision.'), sentence('Ein vierter macht Werbung für Fritz’ Suppe.', 'A fourth advertises Fritz’s soup.')],
    secret: [sentence('Die alten Einwände des Kreises der Ungeschriebenen hängen neben Adas Kopien.', 'The Unwritten Circle’s old objections are pinned beside Ada’s copies.'), sentence('Ausnahmsweise stehen die fehlenden Stimmen auf derselben Tafel.', 'For once, the missing voices are on the same board.')],
  },
  'nebelstadt-signal-lantern': {
    detail: [sentence('Das Signal empfängt einen warmen Puls aus Waldruh.', 'The signal catches a warm pulse from Waldruh.'), sentence('Sein Rhythmus ändert sich, sobald jemand antwortet.', 'Its rhythm changes whenever someone answers.')],
    secret: [sentence('Eine Strecke ist ein Gespräch in beide Richtungen.', 'A route is a conversation in both directions.'), sentence('Das Signal kann nicht allein durch Befehle von einem Ende weiterleuchten.', 'The signal cannot stay lit by orders from only one end.')],
  },
  'nebelstadt-observatory': {
    detail: [sentence('Ein Messinginstrument projiziert drei unvollständige Strecken.', 'A brass instrument projects three incomplete routes.'), sentence('Eine vierte, schwache Linie reicht bis zu einer Küste ohne Namen.', 'A fourth faint line reaches toward an unnamed coast.')],
    secret: [sentence('Der Atlas hält Versprechen fest, keinen Besitz.', 'The Atlas records promises, not possession.'), sentence('Selbst seine schönste Linie kann verblassen, wenn niemand das Versprechen halten will.', 'Even its most beautiful line can fade if nobody means to keep it.')],
  },
  'nebelstadt-evidence-crate': {
    detail: [sentence('Lieferscheine, eine Samentüte und ein Reparaturbuch liegen neben einer Signalaufnahme.', 'Delivery slips, a seed packet, and a repair ledger sit beside a recorded signal.'), sentence('Sie erzählen ähnliche Geschichten mit unterschiedlichen Lücken.', 'They tell similar stories with different gaps.')],
    secret: [sentence('Lina beschriftet, was jede Quelle beweist.', 'Lina labels what each source proves.'), sentence('Ihr letztes Etikett lautet: „Ein Verdacht ist kein Zeuge.“', 'Her final label reads “A suspicion is not a witness”.')],
  },
  'nebelstadt-harbor-chart': {
    detail: [sentence('Das schnellste vorgeschlagene Gleis führt durch den Dorfgarten.', 'The fastest proposed track crosses the village garden.'), sentence('Eine langsamere Kurve folgt einer bestehenden Straße.', 'A slower curve follows an existing road.')],
    secret: [sentence('Otto hat die langsamere Linie zweimal gezeichnet.', 'Otto has drawn the slower line twice.'), sentence('Auf der zweiten Version hat er eine Haltestelle in der Nähe der Klinik hinzugefügt.', 'On the second version, he has added a stop close to the clinic.')],
  },
};

export function actFor(mapId: MapId): StoryAct { return storyActs.find(act => act.mapId === mapId)!; }
export function clueFor(questId: string): StoryClue | undefined { return storyClues.find(clue => clue.questId === questId); }
export function discoveredClues(completedQuestIds: readonly string[]): StoryClue[] {
  return storyClues.filter(clue => completedQuestIds.includes(clue.questId));
}
