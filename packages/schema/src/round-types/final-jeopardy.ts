import { z } from 'zod';
import type { ResolvedClueContent } from '../clue-content.js';
import { clueContentSchema } from '../clue-content.js';

export const finalJeopardyDataSchema = z.object({
  category: z.string().min(1),
  clue: clueContentSchema,
  answer: clueContentSchema,
});

export type FinalJeopardyData = z.infer<typeof finalJeopardyDataSchema>;

/**
 * `judge` targets `playerId` explicitly (rather than "whoever is currently
 * revealed") so a judge message can't be misapplied if state and client fall
 * out of sync.
 */
export const finalJeopardyActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('wager'), amount: z.number().int().nonnegative() }),
  z.object({ type: z.literal('submit-answer'), answer: z.string() }),
  z.object({ type: z.literal('advance') }),
  z.object({ type: z.literal('reveal-answer') }),
  z.object({ type: z.literal('reveal-wager') }),
  z.object({ type: z.literal('judge'), playerId: z.string(), correct: z.boolean() }),
]);

export type FinalJeopardyAction = z.infer<typeof finalJeopardyActionSchema>;

export type FinalJeopardyPhase = 'category' | 'wagering' | 'answering' | 'revealing' | 'summary';

/** Where the currently-revealing contestant is in their own reveal walk. */
export type RevealStage = 'hidden' | 'answer' | 'wager' | 'judged';

/**
 * `party`-owned runtime state (plain TS, not zod — never validated, only
 * ever constructed by `party`). `contestantIds` is the fixed set of players
 * in this round, captured at creation so late joiners/leavers don't shift
 * wagering or the reveal walk mid-round. `revealOrder` is computed once,
 * ascending by score, when `phase` becomes `revealing`.
 */
export interface FinalJeopardyState {
  type: 'final-jeopardy';
  phase: FinalJeopardyPhase;
  contestantIds: string[];
  wagers: Record<string, number>;
  answers: Record<string, string>;
  judgments: Record<string, boolean>;
  revealOrder: string[];
  revealIndex: number;
  revealStage: RevealStage;
}

/**
 * What contestants receive instead of `FinalJeopardyState` + the round's
 * `data`. `clue` is withheld until `phase` reaches `answering` (no clue until
 * after wagering). `current` describes the contestant presently being
 * revealed and how far their reveal has progressed; `revealed` holds every
 * contestant judged so far, each entry only carrying what's been revealed
 * for them (progressive per `revealStage`).
 */
export interface FinalJeopardyContestantView {
  type: 'final-jeopardy';
  phase: FinalJeopardyPhase;
  category: string;
  clue: ResolvedClueContent | null;
  hasWagered: boolean;
  hasAnswered: boolean;
  current: { playerId: string; stage: RevealStage } | null;
  revealed: Array<{
    playerId: string;
    wager?: number;
    answer?: string;
    correct?: boolean;
  }>;
}
