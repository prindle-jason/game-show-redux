import { z } from 'zod';
import type { ResolvedClueContent } from '../clue-content.js';
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
 * `skip-clue` lets the host resolve a clue nobody will answer (no scoring).
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
  z.object({ type: z.literal('skip-clue') }),
  z.object({ type: z.literal('set-slide'), index: z.number().int().nonnegative() }),
]);

export type JeopardyAction = z.infer<typeof jeopardyActionSchema>;

/**
 * `party`-owned runtime state (plain TS, not zod — never validated, only
 * ever constructed by `party`). `pendingWager` covers a Daily Double wager
 * submitted before its clue is revealed. `controllingPlayerId` is the only
 * player allowed to wager on a Daily Double — it's seeded deterministically
 * from the round at creation time and updated to whoever answers correctly.
 * `clueSlideIndex` is the host's current position in the active clue's
 * slideshow (if any) — the only source of truth for which slide contestants
 * see, since a slideshow's own position is otherwise pure client state (see
 * `set-slide`); reset whenever a new clue becomes active.
 */
export interface JeopardyState {
  type: 'jeopardy';
  revealedClues: { categoryIndex: number; clueIndex: number }[];
  activeClue: { categoryIndex: number; clueIndex: number } | null;
  buzzedPlayerId: string | null;
  lockedOutPlayerIds: string[];
  pendingWager: number | null;
  controllingPlayerId: string | null;
  clueSlideIndex: number;
}

/**
 * What contestants receive instead of `JeopardyState` + the round's `data` —
 * clue `value`s are always public, but `isDailyDouble` and the clue/answer
 * text stay hidden until that clue becomes `activeClue`.
 */
export interface JeopardyContestantView {
  type: 'jeopardy';
  categories: Array<{
    name: string;
    clues: Array<{ value: number; revealed: boolean }>;
  }>;
  activeClue: {
    categoryIndex: number;
    clueIndex: number;
    clue: ResolvedClueContent;
    clueSlideIndex: number;
    isDailyDouble: boolean;
  } | null;
  buzzedPlayerId: string | null;
  lockedOutPlayerIds: string[];
  pendingWager: number | null;
  controllingPlayerId: string | null;
}
