import type { Level } from './content';
import type { Narrative } from './sentence-translations';

const sentence = (german: string, english: string) => ({ german, english });

/** Side discoveries add witnesses without revealing later quest solutions. */
export const activityDiscoveries: Record<string, { level: Level; title: string; text: Narrative; lead: Narrative }> = {
  'cafe:A1': {
    level: 'A1', title: 'A place set for nobody',
    text: [
      sentence('Deine Gäste gehen satt nach Hause und fühlen sich verstanden.', 'Your customers leave fed and understood.'),
      sentence('Beim Abräumen der Tabletts bemerkt Marta, dass der leere Tisch einen Löffel benutzt hat.', 'While clearing the trays, Marta notices that the empty table has used a spoon.'),
      sentence('Seine Quittung zeigt den Abdruck eines Messingstempels, aber kein Ziel.', 'Its receipt carries the impression of a brass stamp, but no destination.'),
    ],
    lead: [
      sentence('Marta bewahrt den Löffel neben ihrem Wasserkocher auf.', 'Marta keeps the spoon beside her kettle.'),
      sentence('Etwas ist durch das Café gekommen, ohne seinen Namen zu hinterlassen.', 'Something passed through the café without leaving its name.'),
    ],
  },
  'market:A1': {
    level: 'A1', title: 'An honest weight',
    text: [
      sentence('Der Einkauf ist erledigt, und das Wechselgeld stimmt.', 'The shopping is settled and the change is right.'),
      sentence('Fritz findet in einem Liefersack einen zweiten Satz Gewichte.', 'Fritz finds a second set of weights in a delivery sack.'),
      sentence('Sie sehen genau wie seine eigenen aus, aber jedes hat unten ein kleines Eisenbahnzeichen.', 'They match his own exactly, except each has a tiny railway symbol underneath.'),
    ],
    lead: [sentence('Der Markt hat Waren von einem Ort bekommen, den der offizielle Fahrplan nicht erreicht.', 'The market received goods from somewhere the official timetable cannot reach.')],
  },
  'detective:A1': {
    level: 'A1', title: 'The witness between the lines',
    text: [
      sentence('Deine Beweise bringen eine alltägliche Folge von Ereignissen wieder in die richtige Reihenfolge.', 'Your evidence puts an ordinary sequence back in order.'),
      sentence('Ada bemerkt dasselbe Korrekturzeichen auf zwei Akten, die nichts miteinander zu tun haben.', 'Ada notices the same correction mark on two unrelated records.'),
      sentence('Wer sie geändert hat, wollte die Ereignisse wie einen Zufall aussehen lassen.', 'Whoever changed them wanted the events to look like a coincidence.'),
    ],
    lead: [
      sentence('Prüfe weiter die Daten und die Zeugenaussagen.', 'Keep checking dates and witnesses.'),
      sentence('Auch ein fehlender Name kann ein Muster hinterlassen.', 'A missing name can still leave a pattern.'),
    ],
  },
  'delivery:A1': {
    level: 'A1', title: 'A letter that made it home',
    text: [
      sentence('Der Weg ist klar, und das Paket kommt am richtigen Ort an.', 'The route is understood and the parcel reaches its intended place.'),
      sentence('Lina vergleicht seine Adresse mit einem alten Lieferetikett.', 'Lina compares its address with an old delivery label.'),
      sentence('Beide beschreiben den Weg um einen Bahnsteig, den die Stadt nicht mehr erwähnt.', 'Both give directions around a platform the town has stopped mentioning.'),
    ],
    lead: [
      sentence('Eine Adresse ist mehr als eine Zeile in einem Register.', 'An address is more than a line in a register.'),
      sentence('Jemand weiß noch, wie man dorthin kommt.', 'Someone still knows how to get there.'),
    ],
  },
  'cafe:A2': {
    level: 'A2', title: 'The customer who ordered twice',
    text: [
      sentence('Deine Schicht endet mit den richtigen Bestellungen und einem kleinen Streit über den Wasserkocher.', 'Your shift ends with the right orders and a small argument about the kettle.'),
      sentence('Ein Gast besteht darauf, dieses Essen schon gegessen zu haben.', 'One guest insists they already ate this meal.'),
      sentence('Martas Uhr hat zwei Zahlungen in derselben Minute festgehalten.', 'Marta’s clock has recorded two payments at the same minute.'),
    ],
    lead: [sentence('Die verlorene Stunde wiederholt kleine Dinge genauso wie große.', 'The lost hour is repeating small things as well as large ones.')],
  },
  'market:A2': {
    level: 'A2', title: 'Tomorrow’s shopping',
    text: [
      sentence('Die Rechnung für den Einkauf stimmt, und niemand bekommt zu wenig Wechselgeld.', 'The basket balances and nobody is short-changed.'),
      sentence('Greta entdeckt, dass der Lieferant des Ruhegartens ein Lieferdatum aufgeschrieben hat, das noch in der Zukunft liegt.', 'Greta finds that the rest garden’s supplier wrote a delivery date that has not happened yet.'),
      sentence('Die Kräuter selbst sind völlig gewöhnlich, was sie sehr erleichtert.', 'The herbs themselves are perfectly ordinary, to her considerable relief.'),
    ],
    lead: [sentence('Die Akten zur fehlenden Stunde widersprechen dem, was die Menschen in den Händen halten können.', 'The records of the missing hour disagree with what people can hold in their hands.')],
  },
  'detective:A2': {
    level: 'A2', title: 'A correction with a different hand',
    text: [
      sentence('Die Beweise zeigen eine Abfolge von Ereignissen statt einer bequemen Anschuldigung.', 'The evidence supports a sequence instead of a convenient accusation.'),
      sentence('Ada erkennt eine Änderung, die nach der ursprünglichen Schließung vorgenommen wurde.', 'Ada recognises an alteration made after the original closure.'),
      sentence('Die Handschrift gehört einem Sachbearbeiter, nicht der Person, die die Seite unterschrieben hat.', 'Its handwriting belongs to a clerk, not the person who signed the page.'),
    ],
    lead: [sentence('Finde heraus, was der ursprüngliche Beschluss tatsächlich erlaubte, bevor du entscheidest, wer davon profitierte.', 'Find what the original order actually permitted before deciding who benefited.')],
  },
  'delivery:A2': {
    level: 'A2', title: 'Directions that survived',
    text: [
      sentence('Die Lieferanweisungen funktionieren auch dort, wo die Straßenschilder einander widersprechen.', 'The delivery instructions work even where the road signs disagree.'),
      sentence('In Linas Routenheft steht noch eine Abzweigung, die aus der Archivkarte entfernt wurde.', 'Lina’s route notebook retains a turn removed from the archive map.'),
      sentence('Jemand hat den Kurieren den echten Weg gezeigt, bevor er verschwand.', 'Someone taught the couriers the real route before it vanished.'),
    ],
    lead: [sentence('Folge dem praktischen Wissen in Richtung Nebelstadt; die offiziellen Akten sind nur ein Zeuge.', 'Follow practical knowledge toward Nebelstadt; the official records are only one witness.')],
  },
  'cafe:B1': {
    level: 'B1', title: 'One table, several accounts',
    text: [
      sentence('Du bewältigst die Bestellungen, ohne dafür sorgen zu müssen, dass die Gäste sich über alles einig sind.', 'You manage the orders without making the customers agree about everything.'),
      sentence('Ihr Streit liefert ein nützliches Detail: Das Leuchtturmsignal wurde von zwei Orten aus gesehen, aber unterschiedlich beschrieben.', 'Their disagreement leaves a useful detail: the lighthouse signal was seen from two places, but described in different ways.'),
    ],
    lead: [
      sentence('Ein Widerspruch kann durch einen anderen Blickwinkel entstehen.', 'A contradiction can come from a viewpoint.'),
      sentence('Frage, was jeder Zeuge tatsächlich sehen konnte.', 'Ask what each witness could actually see.'),
    ],
  },
  'market:B1': {
    level: 'B1', title: 'The price of a route',
    text: [
      sentence('Der Handel funktioniert für beide Seiten.', 'The trade works for both sides.'),
      sentence('Fritz schreibt die Kosten der kürzeren Querung neben die Vorteile der längeren.', 'Fritz writes the cost of the shorter crossing beside the benefits of the longer one.'),
      sentence('Der Vergleich gibt dem Rat etwas Nützlicheres als einen Slogan.', 'The comparison gives the council something more useful than a slogan.'),
    ],
    lead: [sentence('Eine umsetzbare Vereinbarung muss die Menschen berücksichtigen, die ihre Kosten tragen.', 'A workable agreement must acknowledge the people who bear its costs.')],
  },
  'detective:B1': {
    level: 'B1', title: 'An explanation that fits',
    text: [
      sentence('Du unterscheidest, was die Beweise zeigen, von dem, was ein Zeuge vermutet.', 'You distinguish what the evidence shows from what a witness assumes.'),
      sentence('Ada bewahrt beide Aussagen auf, statt die unbequeme wegzuwerfen.', 'Ada preserves both statements instead of throwing away the inconvenient one.'),
      sentence('Das Reparaturbuch kann jetzt mit einer gut begründeten Zeitleiste verglichen werden.', 'The repair ledger can now be compared with a defensible timeline.'),
    ],
    lead: [sentence('Trage die Berichte zusammen; Gewissheit sollte aus Beweisen entstehen, nicht aus einer vorschnellen Anschuldigung.', 'Bring the accounts together; certainty should come from evidence, not a hurried accusation.')],
  },
  'delivery:B1': {
    level: 'B1', title: 'An answer from the other end',
    text: [
      sentence('Dank der Wegbeschreibung kommt die Nachricht an.', 'The directions get the message through.'),
      sentence('Die Antwort kommt mit einem kleinen, warmen Puls aus Waldruh.', 'The reply arrives with a small warm pulse from Waldruh.'),
      sentence('Eine Strecke, die eine Antwort trägt, fühlt sich ganz anders an als eine Strecke, die nur Befehle trägt.', 'A route that carries an answer feels quite different from a route that only carries orders.'),
    ],
    lead: [sentence('Der Atlas hört auf Zustimmung aus beiden Richtungen.', 'The Atlas listens for agreement in both directions.')],
  },
};
