import type { Progress } from './api';

export type RecallRating = 'hard' | 'good' | 'easy';
export interface AttemptSubmission {
  id: string;
  itemId: string;
  exerciseId: string;
  answer: string;
  hinted: boolean;
  mode: 'recognition' | 'production' | 'listening';
  questId?: string;
  rating?: RecallRating;
  responseTimeMs?: number;
}
export interface AttemptResult {
  correct: boolean;
  xpAdded: number;
  duplicate: boolean;
  reason?: string;
  progress: Progress;
}
interface ReviewTransport {
  preview(input: Readonly<AttemptSubmission>): Promise<{correct: boolean}>;
  save(input: Readonly<AttemptSubmission>): Promise<AttemptResult>;
}
type ReviewOutcome = {kind:'rating'} | {kind:'saved'; result:AttemptResult} | {kind:'ignored'};

/** Freeze the original answer and timing before any feedback or self-rating. */
export class ReviewAttempt {
  private input: Readonly<AttemptSubmission>;
  private phase: 'unverified' | 'rating' | 'saving' | 'saved' = 'unverified';
  private busy = false;
  private cancelled = false;

  constructor(input: AttemptSubmission) { this.input = Object.freeze({...input, rating:undefined}); }

  cancel(): void { this.cancelled = true; }

  async submit(transport: ReviewTransport, rating?: RecallRating): Promise<ReviewOutcome> {
    if (this.busy || this.cancelled || this.phase === 'saved') return {kind:'ignored'};
    this.busy = true;
    try {
      if (this.phase === 'unverified') {
        const preview = await transport.preview(this.input);
        if (this.cancelled) return {kind:'ignored'};
        this.phase = preview.correct ? 'rating' : 'saving';
        // A rating supplied before the preview cannot rate a later answer.
        rating = undefined;
      }
      if (this.phase === 'rating') {
        if (!rating) return {kind:'rating'};
        this.input = Object.freeze({...this.input, rating});
        this.phase = 'saving';
      }
      // Retain this exact body and ID after an ambiguous network failure.
      // A retry cannot replace the chosen rating or create a second attempt.
      const result = await transport.save(this.input);
      this.phase = 'saved';
      return {kind:'saved', result};
    } finally { this.busy = false; }
  }
}
