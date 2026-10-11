import syllabusData from './data/syllabus.json';
import type { Level } from './content';
import type { Progress } from './api';

/**
 * Vocabulary intake, mirrored from server/intake.go. The server is the only
 * writer: it credits visible play through heartbeats and appends syllabus words
 * at a bounded rate. The client reads the same state to decide what German it
 * may show, which conversations are open and what to practise today.
 */
export interface SyllabusQuest { questId: string; level: Level; wordIds: string[]; milestone: number; }
export interface Syllabus {
  version: string; wordsPerHour: number; openingWords: number; bankCap: number; storyShare: number;
  brake: { maxUnsettled: number; maxDue: number };
  wordIds: string[]; quests: SyllabusQuest[];
}
export interface IntakeState { version: number; activeSeconds: number; creditSeconds: number; lastBeatAt: string; wordIds: string[]; }
export interface IntakeStatus {
  introduced: number; remaining: number; pending: number; nextWordInSeconds: number;
  paused: '' | 'practise' | 'review'; unsettled: number; due: number;
}
export interface HeartbeatResult { progress: Progress; introduced: string[]; status: IntakeStatus; duplicate: boolean; }

export const syllabus = syllabusData as Syllabus;
export const syllabusPosition: ReadonlyMap<string, number> = new Map(syllabus.wordIds.map((id, index) => [id, index]));
const questById = new Map(syllabus.quests.map(quest => [quest.questId, quest]));
export const secondsPerWord = (): number => 3600 / syllabus.wordsPerHour;

type IntakeProgress = Pick<Progress, 'intake'>;
type EvidenceProgress = Pick<Progress, 'intake' | 'words' | 'items'>;

export function introducedWordIds(progress: IntakeProgress): readonly string[] { return progress.intake?.wordIds ?? []; }
export function introducedWords(progress: IntakeProgress): ReadonlySet<string> { return new Set(introducedWordIds(progress)); }
export function wordIntroduced(progress: IntakeProgress, id: string): boolean { return introducedWordIds(progress).includes(id); }
/** Words outside the syllabus (story-only glosses) are never gated. */
export function wordScheduled(id: string): boolean { return syllabusPosition.has(id); }

const ready = (value: string | undefined, now: number): boolean => !!value && Number.isFinite(Date.parse(value)) && Date.parse(value) <= now;

/** Unsettled until the learner has recognised, heard or recalled it unaided once; exposure does not count. */
export function wordUnsettled(progress: Pick<Progress, 'words' | 'items'>, id: string): boolean {
  const unaided = (stats?: Record<string, { unaidedSuccesses: number }>) => Object.values(stats ?? {}).some(mode => mode.unaidedSuccesses > 0);
  return !unaided(progress.words?.[id]?.modeStats) && !unaided(progress.items?.[`word-${id}`]?.modeStats);
}
export function wordDue(progress: Pick<Progress, 'words'>, id: string, now = Date.now()): boolean {
  const word = progress.words?.[id];
  return !!word && word.directAttempts > 0 && ready(word.dueAt, now);
}

export function intakeStatus(progress: EvidenceProgress, now = Date.now()): IntakeStatus {
  const ids = introducedWordIds(progress), intake = progress.intake;
  const status: IntakeStatus = { introduced: ids.length, remaining: Math.max(0, syllabus.wordIds.length - ids.length), pending: 0, nextWordInSeconds: 0, paused: '', unsettled: 0, due: 0 };
  for (const id of ids) { if (wordUnsettled(progress, id)) status.unsettled++; if (wordDue(progress, id, now)) status.due++; }
  const perWord = secondsPerWord(), credit = intake?.creditSeconds ?? 0;
  const earned = Math.floor(credit / perWord);
  status.pending = Math.max(0, Math.min(earned - status.introduced, status.remaining));
  if (status.unsettled >= syllabus.brake.maxUnsettled) status.paused = 'practise';
  else if (status.due >= syllabus.brake.maxDue) status.paused = 'review';
  if (status.paused) status.pending = 0;
  else if (status.pending === 0 && status.remaining > 0) status.nextWordInSeconds = perWord - credit % perWord;
  return status;
}

export function questVocabulary(questId: string): SyllabusQuest | undefined { return questById.get(questId); }
/** Lexemes a conversation still needs, in syllabus order. Completed discoveries need nothing. */
export function missingQuestWords(questId: string, progress: Pick<Progress, 'completedQuestIds' | 'intake'>): string[] {
  const quest = questById.get(questId);
  if (!quest || progress.completedQuestIds.includes(questId)) return [];
  const introduced = introducedWords(progress);
  return quest.wordIds.filter(id => !introduced.has(id));
}
export function questVocabularyReady(questId: string, progress: Pick<Progress, 'completedQuestIds' | 'intake'>): boolean { return missingQuestWords(questId, progress).length === 0; }
/** How many scheduled words a route, scene or object still needs. */
export function missingWordCount(wordIds: readonly string[], progress: IntakeProgress): number {
  const introduced = introducedWords(progress);
  return new Set(wordIds.filter(id => syllabusPosition.has(id) && !introduced.has(id))).size;
}

/** Restored words the learner has not yet recognised unaided, oldest first: today's practice. */
export function unsettledWords(progress: EvidenceProgress): string[] { return introducedWordIds(progress).filter(id => wordUnsettled(progress, id)); }
export function todaysWords(progress: EvidenceProgress, limit = 12): string[] { return unsettledWords(progress).slice(0, limit); }

/** Count visible, connected play and release it to the server in bounded beats. */
export class IntakeClock {
  private accumulated = 0;
  private previous?: number;
  private wasActive = false;
  constructor(private readonly intervalMs = 60_000, private readonly maxBeatSeconds = 120) {}
  tick(now: number, active: boolean): boolean {
    if (this.previous !== undefined && this.wasActive) this.accumulated += Math.max(0, Math.min(now - this.previous, 2000));
    this.previous = now;
    this.wasActive = active;
    return this.accumulated >= this.intervalMs;
  }
  get pendingSeconds(): number { return Math.min(this.maxBeatSeconds, Math.floor(this.accumulated / 1000)); }
  /** Seconds to send now; the remainder stays for the next beat. */
  consume(): number {
    const seconds = this.pendingSeconds;
    this.accumulated = Math.max(0, this.accumulated - seconds * 1000);
    return seconds;
  }
}
