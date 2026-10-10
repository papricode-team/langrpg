import type { Level } from './content';
import type { MapId } from './maps';
import type { Progress } from './api';
import type { CourseLexeme } from './course';

export type RoutineAction = 'serve' | 'departures' | 'deliver' | 'work' | 'read' | 'garden' | 'market' | 'pack' | 'patrol' | 'watch' | 'rest' | 'listen';
export interface NpcRoutine {
  action: RoutineAction;
  /** Small normalized offsets; never move a character beyond the server's interaction radius. */
  offsetX: number;
  offsetY: number;
  facing: 'left' | 'right';
  interactable: true;
  german: string;
  english: string;
}
interface RoutineBeat {
  start: number; end: number; action: RoutineAction;
  german: string; english: string;
  x?: number; y?: number;
}
const beat = (start: number, end: number, action: RoutineAction, german: string, english: string, x = 0, y = 0): RoutineBeat => ({ start, end, action, german, english, x, y });

/** Changes of work and conversation posture keep the recurring cast available. */
export const npcRoutines: Readonly<Record<string, readonly RoutineBeat[]>> = {
  marta: [
    beat(0, 7, 'rest', 'Die Lampe bleibt an.', 'The lamp stays on.'),
    beat(7, 12, 'serve', 'Guten Morgen! Der Kaffee ist fertig.', 'Good morning! The coffee is ready.', .012, .008),
    beat(12, 19, 'serve', 'Möchtest du ein Brot?', 'Would you like some bread?', -.012, .006),
    beat(19, 24, 'pack', 'Das Café schließt bald.', 'The café closes soon.', .008, .006),
  ],
  otto: [
    beat(0, 7, 'watch', 'Der letzte Zug ist da.', 'The last train has arrived.'),
    beat(7, 19, 'departures', 'Der Zug kommt bald.', 'The train is coming soon.', .018, .008),
    beat(19, 24, 'watch', 'Die Laterne zeigt den Weg.', 'The lantern shows the way.', -.012, .008),
  ],
  lina: [
    beat(0, 8, 'rest', 'Dieser Brief ist für dich.', 'This letter is for you.'),
    beat(8, 18, 'deliver', 'Ich bringe die Briefe zum Bahnhof.', 'I am taking the letters to the station.', .020, -.010),
    beat(18, 24, 'read', 'Morgen kommt ein neues Paket.', 'A new parcel arrives tomorrow.', -.008, .006),
  ],
  emil: [
    beat(0, 8, 'rest', 'Die Lampe leuchtet noch.', 'The lamp is still shining.'),
    beat(8, 20, 'work', 'Ich repariere die Lampe.', 'I am repairing the lamp.', .010, -.012),
    beat(20, 24, 'watch', 'Die Uhr geht wieder.', 'The clock is working again.', -.008, .008),
  ],
  ada: [
    beat(0, 9, 'read', 'Die Bücher sind hier.', 'The books are here.'),
    beat(9, 18, 'read', 'Im Archiv steht dein Name.', 'Your name is in the archive.', -.012, -.006),
    beat(18, 24, 'pack', 'Das Archiv ist zu. Ich bleibe hier.', 'The archive is closed. I am staying here.', .008, .008),
  ],
  fritz: [
    beat(0, 7, 'rest', 'Die Suppe ist warm.', 'The soup is warm.'),
    beat(7, 18, 'market', 'Die Äpfel sind frisch.', 'The apples are fresh.', .016, .008),
    beat(18, 21, 'pack', 'Der Markt ist zu. Bis morgen!', 'The market is closed. See you tomorrow!', -.012, .010),
    beat(21, 24, 'rest', 'Morgen gibt es wieder Suppe.', 'There will be soup again tomorrow.'),
  ],
  greta: [
    beat(0, 7, 'rest', 'Die Pflanzen schlafen auch.', 'The plants are sleeping too.'),
    beat(7, 19, 'garden', 'Die Pflanzen brauchen Wasser.', 'The plants need water.', .014, .012),
    beat(19, 24, 'pack', 'Der Garten hat genug Wasser.', 'The garden has enough water.', -.010, .008),
  ],
  inspector: [
    beat(0, 9, 'patrol', 'Die Fahrkarte, bitte.', 'Your ticket, please.', -.012, .008),
    beat(9, 18, 'work', 'Das Messingamt prüft die Namen.', 'The Brass Office checks the names.', .010, -.006),
    beat(18, 24, 'patrol', 'Bitte bleiben Sie auf dem Weg.', 'Please stay on the path.', .012, .008),
  ],
  elise: [
    beat(0, 7, 'watch', 'Die Sterne zeigen unsere Städte.', 'The stars show our towns.', .008, .008),
    beat(7, 19, 'read', 'Drei Städte. Ein Versprechen.', 'Three towns. One promise.', -.008, .006),
    beat(19, 24, 'watch', 'Jede Stadt behält ihren Namen.', 'Every town keeps its name.', .008, -.006),
  ],
};

const hourOf = (hour: number): number => Number.isFinite(hour) ? ((hour % 24) + 24) % 24 : 12;
export function npcRoutine(npcId: string, hour: number, requiredNpcId?: string): NpcRoutine {
  const h = hourOf(hour);
  const scheduled = npcRoutines[npcId]?.find(item => h >= item.start && h < item.end)
    ?? beat(0, 24, 'watch', 'Guten Tag!', 'Hello!');
  const required = npcId === requiredNpcId;
  // Each work loop returns to its canonical feet position at the boundary.
  // An objective override pins the actor there before a conversation begins.
  const phase = Math.sin((h - scheduled.start) / (scheduled.end - scheduled.start) * Math.PI * 2);
  const offsetX = required ? 0 : Math.max(-.025, Math.min(.025, (scheduled.x ?? 0) * phase));
  const offsetY = required ? 0 : Math.max(-.025, Math.min(.025, (scheduled.y ?? 0) * phase));
  return { action: required ? 'listen' : scheduled.action, offsetX, offsetY,
    facing: phase < 0 ? 'left' : 'right', interactable: true,
    german: scheduled.german, english: scheduled.english };
}

export interface ResidentRoutine { action: 'errand' | 'pause' | 'rest'; pace: number; visible: true; }
export function residentRoutine(residentId: string, hour: number): ResidentRoutine {
  const h = hourOf(hour);
  // Harbor workers and couriers finish later; early commuters wake first.
  const early = /commuter|courier|sailor|port-worker/.test(residentId);
  const start = early ? 6 : 8, finish = early ? 22 : 20;
  if (h < start || h >= finish) return { action: 'rest', pace: 0, visible: true };
  if (h >= finish - 2 || h < start + 1) return { action: 'pause', pace: .55, visible: true };
  return { action: 'errand', pace: 1, visible: true };
}

export type RoutineLexeme = Pick<CourseLexeme, 'id' | 'lemma' | 'english' | 'level' | 'pos' | 'article' | 'articleForm' | 'topic'>;
export interface WorldBark {
  id: string;
  speakerId: string;
  german: string;
  english: string;
  wordIds: string[];
  source: 'routine' | 'due-word' | 'course-word';
}
export interface BarkContext {
  speakerId: string;
  mapId: MapId;
  level: Level;
  hour: number;
  elapsedSeconds: number;
  requiredNpcId?: string;
  conversationActive?: boolean;
  /** Caller passes only nearby visible actors, never all actors in an offscreen map. */
  lexicon?: readonly RoutineLexeme[];
  progress?: Pick<Progress, 'words'>;
  now?: number;
}
export interface BarkTelemetry { emitted: number; routine: number; dueWords: number; courseWords: number; dialogueSuppressed: number; }
const levelRank: Record<Level, number> = { A1: 0, A2: 1, B1: 2 };
const due = (value: string | undefined, now: number): boolean => !!value && Number.isFinite(Date.parse(value)) && Date.parse(value) <= now;
const boundedText = (value: string): string => value.trim().replace(/[\r\n\t“”„"]/g, '').slice(0, 80);

function lexicalBark(word: RoutineLexeme, context: BarkContext, source: 'due-word' | 'course-word'): WorldBark {
  const lemma = boundedText(word.articleForm ?? word.lemma);
  const printed = word.article ? `${boundedText(word.article)} ${lemma}` : lemma;
  return { id: `${source}:${word.id}`, speakerId: context.speakerId,
    german: `Auf dem Paket steht „${printed}“.`,
    english: `The parcel says “${printed}” (${word.english}).`,
    // Only this printed headword is credited, never inferred pronouns or stems.
    wordIds: [word.id], source };
}

function routineBark(context: BarkContext): WorldBark {
  const named = npcRoutines[context.speakerId];
  const routine = npcRoutine(context.speakerId, context.hour, context.requiredNpcId);
  let german = routine.german, english = routine.english;
  if (!named) {
    if (context.mapId === 'rainmarket') { german = 'Es regnet. Wir bleiben unter dem Dach.'; english = 'It is raining. We are staying under the roof.'; }
    else if (context.mapId === 'nebelstadt') { german = 'Die Laterne zeigt den Weg.'; english = 'The lantern shows the way.'; }
    else if (context.mapId === 'waldruh') { german = 'Die Blätter sind schön.'; english = 'The leaves are beautiful.'; }
    else if (residentRoutine(context.speakerId, context.hour).action === 'rest') { german = 'Gute Nacht! Bis morgen.'; english = 'Good night! See you tomorrow.'; }
    else { german = 'Guten Tag! Ich gehe zum Markt.'; english = 'Hello! I am going to the market.'; }
  }
  return { id: `routine:${context.speakerId}:${routine.action}`, speakerId: context.speakerId, german, english, wordIds: [], source: 'routine' };
}

/** Nearby ambient language is exposure; the explicit inn review supplies retrieval evidence. */
export class WorldBarkDirector {
  private lastGlobal = -Infinity;
  private lastTime = -Infinity;
  private speakers = new Map<string, number>();
  private words = new Map<string, number>();
  private courseCursor = 0;
  private telemetry: BarkTelemetry = { emitted: 0, routine: 0, dueWords: 0, courseWords: 0, dialogueSuppressed: 0 };

  get stats(): BarkTelemetry { return { ...this.telemetry }; }
  reset(): void { this.lastGlobal = -Infinity; this.lastTime = -Infinity; this.speakers.clear(); this.words.clear(); this.courseCursor = 0; }
  private remember(map: Map<string, number>, id: string, time: number): void {
    map.delete(id); map.set(id, time);
    if (map.size > 128) map.delete(map.keys().next().value!);
  }

  next(context: BarkContext): WorldBark | undefined {
    const time = Number.isFinite(context.elapsedSeconds) ? Math.max(0, context.elapsedSeconds) : 0;
    if (time < this.lastTime) this.reset();
    this.lastTime = time;
    if (context.conversationActive || context.speakerId === context.requiredNpcId) {
      this.telemetry.dialogueSuppressed++;
      return undefined;
    }
    if (time - this.lastGlobal < 9 || time - (this.speakers.get(context.speakerId) ?? -Infinity) < 36) return undefined;
    const now = context.now ?? Date.now();
    const available = (context.lexicon ?? []).filter(word => levelRank[word.level] <= levelRank[context.level]
      && word.lemma.trim() && word.lemma.length <= 64
      && time - (this.words.get(word.id) ?? -Infinity) >= 180);
    let bark: WorldBark | undefined;
    // Work and weather remain part of town life between lexical encounters.
    if (this.telemetry.emitted % 3 !== 0 && available.length) {
      const ready = available.filter(word => {
        const memory = context.progress?.words[word.id];
        return !!memory && memory.directAttempts > 0 && due(memory.dueAt, now);
      }).sort((a, b) => Date.parse(context.progress!.words[a.id].dueAt) - Date.parse(context.progress!.words[b.id].dueAt));
      if (ready.length) bark = lexicalBark(ready[0], context, 'due-word');
      else {
        // Established cards that are resting are left alone. New course words
        // can appear once as a parcel label without scheduling a review.
        const newWords = available.filter(word => !context.progress?.words[word.id]?.directAttempts);
        if (newWords.length) bark = lexicalBark(newWords[this.courseCursor++ % newWords.length], context, 'course-word');
      }
    }
    bark ??= routineBark(context);
    this.lastGlobal = time;
    this.remember(this.speakers, context.speakerId, time);
    for (const id of bark.wordIds) this.remember(this.words, id, time);
    this.telemetry.emitted++;
    if (bark.source === 'routine') this.telemetry.routine++;
    else if (bark.source === 'due-word') this.telemetry.dueWords++;
    else this.telemetry.courseWords++;
    return bark;
  }
}
