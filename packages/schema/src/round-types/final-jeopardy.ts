import { z } from 'zod';
import type { ClueContent } from '../clue-content.js';
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
  z.object({ type: z.literal('reveal-next') }),
  z.object({ type: z.literal('judge'), playerId: z.string(), correct: z.boolean() }),
]);

export type FinalJeopardyAction = z.infer<typeof finalJeopardyActionSchema>;

/**
 * `party`-owned runtime state (plain TS, not zod — never validated, only
 * ever constructed by `party`). `revealOrder` is the sequence `reveal-next`
 * has walked through so far (each player's wager/answer/judgment).
 */
export interface FinalJeopardyState {
  type: 'final-jeopardy';
  wagers: Record<string, number>;
  answers: Record<string, string>;
  judgments: Record<string, boolean>;
  revealOrder: string[];
}

/**
 * What contestants receive instead of `FinalJeopardyState` + the round's
 * `data` — `category`/`clue` are public, but another player's wager/answer
 * only appears here once `reveal-next` has surfaced them.
 */
export interface FinalJeopardyContestantView {
  type: 'final-jeopardy';
  category: string;
  clue: ClueContent;
  hasWagered: boolean;
  hasAnswered: boolean;
  revealed: Array<{ playerId: string; wager: number; answer: string; correct: boolean }>;
}
