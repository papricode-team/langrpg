import type { AttemptResult, CourseLevel, LearningMode, Progress, LexicalAnswerKind } from '../api';
import type { Exercise } from '../content';
import type { SpriteLibrary } from './sprite-library';

export type Modality = LearningMode;
export type AnswerKind = LexicalAnswerKind;
export interface GameItem {
  lexemeId: string; lemma: string; article?: string; articleForm?:string; plural?: string;
  english: string; topic: string; level: CourseLevel; pos: string;
  sprite?: string; audio: string;
  exerciseIds: Record<Modality, string>;
  stability: number; due: Record<Modality, boolean>;
  stabilityByMode?: Record<Modality, number>;
  seen: Record<Modality, boolean>; recalls: Record<Modality, number>;
  surfaceForms?:string[];
}
export interface PoolQuery {
  modality: Modality; topics?: readonly string[]; level?: CourseLevel;
  sprites?: boolean; nouns?: boolean; fixedPool?: readonly string[]; limit?: number; seed?: number;
}
export interface RoundResult {
  lexemeId: string; modality: Modality; correct?: boolean;
  hinted: boolean; responseMs: number; answer: string; answerKind?: AnswerKind;
  /** Set pieces may use an authored sentence instead of a lexical exercise. */
  exerciseId?: string;
  /** The authored recording whose inflected word is being transcribed. */
  contextExerciseId?: string;
  /** Server-authored story or expedition action, independent of lexical CEFR. */
  contentId?: string; regionId?: string; level?: CourseLevel; selectedValue?: number;
}
export interface RoundSummary {
  gameId: string; attempts: number; correct: number; hinted: number;
  activeMs: number; longestChain: number;
}
export interface GameAudio { sfx(name: string): void; stop(): void; narration?(active:boolean):void; waveform?():Uint8Array<ArrayBuffer>|undefined; positionMs?():number|undefined; }
export interface GameInput { bind(root: HTMLElement): () => void; }
export interface MiniGameHost {
  pool(query: PoolQuery): GameItem[];
  submit(result: RoundResult): Promise<AttemptResult>;
  speak(item: GameItem, rate?: number): Promise<void>;
  speakText(text: string, audio?: string): Promise<void>;
  sprites: SpriteLibrary; audio: GameAudio; input: GameInput;
  end(summary: RoundSummary): void;
  expose(wordIds: string[]): void;
  progress(): Progress;
  exercises: ReadonlyMap<string, Exercise>;
  playerName: string; playerId?:string; silent: boolean; reducedMotion: boolean;
}
export interface MiniGameOptions { level: CourseLevel; currentLevel?:CourseLevel; seed: number; fixedPool?: string[]; backdrop?: string; }
export interface MiniGame {
  id: string; title: string; host: string;
  modalities: Modality[]; levels: CourseLevel[];
  mount(root: HTMLElement, host: MiniGameHost, opts: MiniGameOptions): void;
  pause(): void; resume(): void; destroy(): void;
}
export type GameMechanic = 'ink' | 'pictures' | 'tray' | 'catch' | 'board' | 'stamp' | 'sort' | 'chain' | 'workbench' | 'forecast' | 'garden' | 'sequence' | 'connection' | 'tape' | 'council' | 'archive' | 'neighborhood' | 'delivery';
export interface MiniGameDefinition {
  id: string; title: string; host: string; tier: 'A'|'B'|'C'; mechanic: GameMechanic;
  modalities: Modality[]; levels: CourseLevel[]; instruction: string;
  topics?: string[]; nouns?: boolean; sprites?: boolean;
  questIds?: string[]; seconds: number; rounds: number;
}
