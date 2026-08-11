import { z } from 'zod';
import type { ClueContent } from '../clue-content.js';
import { clueContentSchema } from '../clue-content.js';

export const jeopardyClueSchema = z.object({
  value: z.number().int().positive(),
  clue: clueContentSchema,
  answer: clueContentSchema,
  isDailyDouble: z.boolean().optional(),
});

export const jeopardyCategorySchema = z.object({
  name: z.string().min(1),
  clues: z.array(jeopardyClueSchema).min(1),
});

export const jeopardyBoardDataSchema = z.object({
  categories: z.array(jeopardyCategorySchema).min(1),
});

export type JeopardyClue = z.infer<typeof jeopardyClueSchema>;
export type JeopardyCategory = z.infer<typeof jeopardyCategorySchema>;
export type JeopardyBoardData = z.infer<typeof jeopardyBoardDataSchema>;

/**
 * `wager` covers Daily Double only — Final Jeopardy is a separate round type.
 * Re-buzzing after an incorrect answer is a `party` state-machine concern,
 * not a distinct action here (the client just sends `buzz` again).
 */
export const jeopardyActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('pick-clue'),
    categoryIndex: z.number().int().nonnegative(),
    clueIndex: z.number().int().nonnegative(),
  }),
  z.object({ type: z.literal('wager'), amount: z.number().int().nonnegative() }),
  z.object({ type: z.literal('buzz') }),
  z.object({ type: z.literal('judge'), correct: z.boolean() }),
]);

export type JeopardyAction = z.infer<typeof jeopardyActionSchema>;

/**
 * `party`-owned runtime state (plain TS, not zod — never validated, only
 * ever constructed by `party`). `pendingWager` covers a Daily Double wager
 * submitted before its clue is revealed.
 */
export interface JeopardyState {
  type: 'jeopardy';
  revealedClues: { categoryIndex: number; clueIndex: number }[];
  activeClue: { categoryIndex: number; clueIndex: number } | null;
  buzzedPlayerId: string | null;
  lockedOutPlayerIds: string[];
  pendingWager: number | null;
}

/**
 * What contestants receive instead of `JeopardyState` + the round's `data` —
 * clue `value`s are always public, but `isDailyDouble` and the clue/answer
 * text stay hidden until that clue becomes `activeClue`.
 */
export interface JeopardyContestantView {
  categories: Array<{
    name: string;
    clues: Array<{ value: number; revealed: boolean }>;
  }>;
  activeClue: {
    categoryIndex: number;
    clueIndex: number;
    clue: ClueContent;
    isDailyDouble: boolean;
  } | null;
  buzzedPlayerId: string | null;
  lockedOutPlayerIds: string[];
  pendingWager: number | null;
}
