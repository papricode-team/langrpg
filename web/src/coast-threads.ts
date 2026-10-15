import type { Progress } from './api';
import { escapeHtml as e, icon } from './icons';
import { t } from './i18n';
import { renderNarrative, type TranslatedSentence } from './sentence-translations';
import type { ExpeditionId } from './expeditions';

type Ending = 'routes-reopened' | 'towns-consent' | 'brass-reformed';
const s = (german: string, english: string): TranslatedSentence => ({ german, english });

/** The unnamed coast: after the finale, every expedition region holds one trace of the Atlas. */
export interface CoastThread { thread: readonly TranslatedSentence[]; endings: Readonly<Record<Ending, TranslatedSentence>>; }

export const coastThreads: Readonly<Record<ExpeditionId, CoastThread>> = {
  saffroncourt: {
    thread: [s('Am Hoftor hängt ein Zettel auf Deutsch: Wer schweigt, stimmt zu.', 'A notice in German hangs on the courtyard gate: whoever stays silent agrees.'),
      s('Die Nachbarn fragen dich, was er bedeutet. Niemand hier hat ihn aufgehängt.', 'The neighbours ask you what it means. Nobody here put it up.')],
    endings: { 'routes-reopened': s('Unter dem Zettel steht jetzt: Erst fragen. Jemand aus Lindenhafen hat es geschrieben.', 'Under the notice it now says: ask first. Someone from Lindenhafen wrote it.'),
      'towns-consent': s('Der Hof stimmt ab, ob der Zettel hängen bleibt. Das Ergebnis ist noch offen.', 'The courtyard is voting on whether the notice stays. The result is still open.'),
      'brass-reformed': s('Ein Brief vom Messingamt liegt daneben: Diese Regel gilt nicht mehr. Unterschrieben: Kessler.', 'A letter from the Brass Office lies beside it: this rule no longer applies. Signed: Kessler.') },
  },
  rainmarket: {
    thread: [s('Auf einem Ladenschild ist ein Name blass geworden. Nur noch zwei Buchstaben sind zu sehen.', 'A name on a shop sign has gone pale. Only two letters are still visible.'),
      s('Im Fahrplan der Arkade steht ein Zug, der nie gekommen ist: 17:59.', 'The arcade’s timetable lists a train that never came: 17:59.')],
    endings: { 'routes-reopened': s('Heute kam der Zug um 17:59. Pünktlich.', 'Today the 17:59 train arrived. On time.'),
      'towns-consent': s('Die Arkade hat abgestimmt: Der Zug darf kommen, wenn es nicht regnet.', 'The arcade voted: the train may come when it is not raining.'),
      'brass-reformed': s('Das Amt hat den alten Fahrplan geprüft und den Fehler öffentlich korrigiert.', 'The Office checked the old timetable and corrected the error in public.') },
  },
  windplain: {
    thread: [s('Das Lager zieht jeden Monat weiter. Bei jedem Umzug sagen alle ihre Namen laut.', 'The camp moves on every month. At every move everyone says their names aloud.'),
      s('Niemand hat es ihnen beigebracht. Sie haben es selbst gefunden, wie der Kreis.', 'Nobody taught them. They found it themselves, like the Circle.')],
    endings: { 'routes-reopened': s('Otto hat ihnen einen Fahrplan geschickt. Sie lesen ihn laut, wie ihre Namen.', 'Otto sent them a timetable. They read it aloud, like their names.'),
      'towns-consent': s('Greta hat ihnen geschrieben. Jetzt sagen zwei Gruppen ihre Namen, an zwei Orten.', 'Greta wrote to them. Now two groups say their names, in two places.'),
      'brass-reformed': s('Das Amt hat gefragt, ob es ihre Namen aufschreiben darf. Sie haben Nein gesagt. Das Amt hat es akzeptiert.', 'The Office asked whether it may write their names down. They said no. The Office accepted it.') },
  },
  riverweave: {
    thread: [s('Am Steg liegt ein rotes Boot. Auf dem Rumpf steht: Lenz.', 'A red boat lies at the landing. On the hull it says: Lenz.'),
      s('Es wurde vor Jahren verkauft. Der Käufer weiß nicht mehr, von wem.', 'It was sold years ago. The buyer no longer remembers who from.')],
    endings: { 'routes-reopened': s('Jakob Lenz ist mit dem ersten Zug gekommen. Er hat das Boot nicht zurückgekauft. Er hat nur den Namen nachgemalt.', 'Jakob Lenz came on the first train. He did not buy the boat back. He only repainted the name.'),
      'towns-consent': s('Pip hat dem Käufer geschrieben. Das Boot bleibt hier, aber es heißt jetzt: Lenz und Freunde.', 'Pip wrote to the buyer. The boat stays here, but now it is called: Lenz and friends.'),
      'brass-reformed': s('Im Amt liegt der alte Kaufvertrag. Ada hat ihn gefunden und dem Käufer gezeigt.', 'The old sales contract lies in the Office. Ada found it and showed it to the buyer.') },
  },
  terracielo: {
    thread: [s('Auch hier gibt es einen Gedenkstein. Auf einer Stelle ist er ganz glatt.', 'There is a memory stone here too. In one place it is completely smooth.'),
      s('Dort stand ein Name. Die Kinder legen jeden Morgen eine Blume darauf.', 'A name stood there. The children lay a flower on it every morning.')],
    endings: { 'routes-reopened': s('Auf der glatten Stelle steht wieder ein Name. Niemand weiß, wer ihn geschrieben hat.', 'A name stands on the smooth patch again. Nobody knows who wrote it.'),
      'towns-consent': s('Die Terrasse hat beschlossen, die Stelle glatt zu lassen, bis jemand den Namen sicher weiß.', 'The terrace decided to leave the patch smooth until someone knows the name for sure.'),
      'brass-reformed': s('Das Amt hat ein Register geschickt. Der Name darin passt. Die Kinder lesen ihn laut.', 'The Office sent a register. The name in it fits. The children read it aloud.') },
  },
  sunpatch: {
    thread: [s('Die Durchsage im Radio wiederholt sich. Nach jedem Husten beginnt sie von vorn.', 'The radio announcement repeats itself. After every cough it starts again.'),
      s('Es ist ein altes Band. Die Stimme klingt wie Elise.', 'It is an old tape. The voice sounds like Elise.')],
    endings: { 'routes-reopened': s('Elise hat angerufen. Das Band ist aus. Im Radio läuft jetzt Musik.', 'Elise called. The tape is off. Now there is music on the radio.'),
      'towns-consent': s('Der Garten hat das Band behalten, als Erinnerung. Es läuft nur noch sonntags.', 'The garden kept the tape, as a reminder. It only plays on Sundays now.'),
      'brass-reformed': s('Voss hat das Band selbst abgeholt. Er hat sich bei jedem entschuldigt, der es gehört hat.', 'Voss collected the tape himself. He apologised to everyone who had heard it.') },
  },
  kigalights: {
    thread: [s('Im Hof läuft ein Film über eine Bahnstrecke, die verschwunden ist.', 'In the courtyard a film is showing about a railway line that vanished.'),
      s('Am Ende sieht man drei Städte und einen Bahnsteig mit der Nummer sieben.', 'At the end you see three towns and a platform with the number seven.')],
    endings: { 'routes-reopened': s('Sie haben ein neues Ende gedreht: Der Zug fährt ein.', 'They filmed a new ending: the train pulls in.'),
      'towns-consent': s('Nach dem Film stimmt das Publikum ab, welches Ende es sehen will.', 'After the film the audience votes on which ending it wants to see.'),
      'brass-reformed': s('Im Abspann steht jetzt: Mit Dank an das Messingamt, das seine Akten geöffnet hat.', 'The credits now say: with thanks to the Brass Office, which opened its files.') },
  },
  cedarbay: {
    thread: [s('Im Lesesaal steht eine alte Fibel. Auf dem ersten Blatt steht: Frau Berg.', 'In the reading room there is an old primer. On the first page it says: Frau Berg.'),
      s('Die Kinder lernen damit Lesen. Sie wissen nicht, wer Frau Berg ist.', 'The children learn to read with it. They do not know who Frau Berg is.')],
    endings: { 'routes-reopened': s('Frau Berg ist mit dem Zug gekommen und hat vorgelesen. Mit Brille.', 'Frau Berg came by train and read aloud. With her glasses.'),
      'towns-consent': s('Frau Berg hat einen Brief geschickt. Die Kinder haben ihn vorgelesen, jedes einen Satz.', 'Frau Berg sent a letter. The children read it aloud, one sentence each.'),
      'brass-reformed': s('Das Amt hat die Fibel nachgedruckt. Auf jeder Kopie steht ihr Name.', 'The Office reprinted the primer. Her name is on every copy.') },
  },
  seoulsteps: {
    thread: [s('Auf einem Dach blinkt eine Laterne. Kurz, kurz, lang. Wie das Signal in Nebelstadt.', 'A lantern blinks on a roof. Short, short, long. Like the signal in Nebelstadt.'),
      s('Niemand weiß, wer sie angezündet hat. Sie antwortet jede Nacht.', 'Nobody knows who lit it. It answers every night.')],
    endings: { 'routes-reopened': s('Jonas hat zurückgeblinkt. Dann hat er es laut gesagt: Hier ist Nebelstadt.', 'Jonas blinked back. Then he said it out loud: this is Nebelstadt.'),
      'towns-consent': s('Die Dächer haben beschlossen, die Laterne jede Nacht abwechselnd zu halten.', 'The rooftops decided to take turns keeping the lantern each night.'),
      'brass-reformed': s('Das Amt hat das Signal nicht registriert. Diesmal mit Absicht.', 'The Office did not register the signal. This time on purpose.') },
  },
  dunegarden: {
    thread: [s('Der Wasservertrag hat einen letzten Satz: damit Schweigen nie als Zustimmung zählt.', 'The water agreement has one last sentence: so that silence never counts as consent.'),
      s('Er wurde vor zwölf Jahren geschrieben. Im selben Jahr, in dem die Strecke schloss.', 'It was written twelve years ago. The same year the route closed.')],
    endings: { 'routes-reopened': s('Otto hat den Satz abgeschrieben und an jeden Bahnhof gehängt.', 'Otto copied the sentence and hung it at every station.'),
      'towns-consent': s('Der Rat in Nebelstadt hat den Satz übernommen. Wort für Wort.', 'The council in Nebelstadt adopted the sentence. Word for word.'),
      'brass-reformed': s('Das Amt hat den Satz auf seine neuen Formulare gedruckt. Ganz oben.', 'The Office printed the sentence on its new forms. Right at the top.') },
  },
};

export const coastSentences = (): { id: string; sentence: TranslatedSentence }[] => Object.entries(coastThreads).flatMap(([region, entry]) => [
  ...entry.thread.map((sentence, index) => ({ id: `coast:${region}:${index}`, sentence })),
  ...Object.entries(entry.endings).map(([ending, sentence]) => ({ id: `coast:${region}:${ending}`, sentence })),
]);

/** The coast appears at the Atlas's edge once the finale is played. */
export const coastOpen = (progress: Progress): boolean => progress.completedQuestIds.includes('b1-atlas');

export function coastThreadMarkup(regionId: string, progress: Progress): string {
  const entry = coastThreads[regionId as ExpeditionId];
  if (!entry || !coastOpen(progress)) return '';
  const ending = progress.story?.ending as Ending | undefined;
  const lines = [...entry.thread, ...(ending && entry.endings[ending] ? [entry.endings[ending]] : [])];
  return `<section class="coast-thread">${icon('compass')}<h3>${e(t('A trace of the Atlas'))}</h3><p>${renderNarrative(lines)}</p></section>`;
}

/** The journal's coast page: one trace per region the player can already reach. */
export function coastPage(progress: Progress, regions: readonly { id: string; name: string }[]): string {
  if (!coastOpen(progress) || !regions.length) return '';
  return `<section class="coast-page"><h3>${e(t('The unnamed coast'))}</h3><p>${e(t('Beyond the route a coast appears on the Atlas. Each neighbourhood there keeps one trace of the three towns.'))}</p>${regions.map(region => {
    const entry = coastThreads[region.id as ExpeditionId];
    return entry ? `<details class="coast-region"><summary>${e(region.name)}</summary><p>${renderNarrative(entry.thread)}</p></details>` : '';
  }).join('')}</section>`;
}
