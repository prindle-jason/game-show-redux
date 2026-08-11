import { z } from 'zod';

export const wheelWedgeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('cash'), value: z.number().int().positive() }),
  z.object({ kind: z.literal('bankrupt') }),
  z.object({ kind: z.literal('lose-turn') }),
]);

export type WheelWedge = z.infer<typeof wheelWedgeSchema>;

/**
 * `solution` is authored layout, not auto-wrapped: each outer entry is a
 * board row, each inner string a word-group on that row (`[]` = blank row).
 * Guessable letters are every letter across all segments, flattened.
 */
export const wheelPuzzleDataSchema = z.object({
  category: z.string().min(1),
  solution: z.array(z.array(z.string().min(1))).min(1),
  wedges: z.array(wheelWedgeSchema).min(1),
  vowelCost: z.number().int().positive(),
  solveBonus: z.number().int().nonnegative(),
});

export type WheelPuzzleData = z.infer<typeof wheelPuzzleDataSchema>;

export const wheelActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('spin') }),
  z.object({ type: z.literal('guess-consonant'), letter: z.string().length(1) }),
  z.object({ type: z.literal('buy-vowel'), letter: z.string().length(1) }),
  z.object({ type: z.literal('attempt-solve'), guess: z.string().min(1) }),
]);

export type WheelAction = z.infer<typeof wheelActionSchema>;

/**
 * `party`-owned runtime state (plain TS, not zod — never validated, only
 * ever constructed by `party`). `roundScores` is a scratch bucket separate
 * from `Player.score`: a `bankrupt` wedge zeroes only the current player's
 * entry here. At round end every player's round score commits to their
 * total, and `solvedByPlayerId` (if set) additionally gets `solveBonus`.
 */
export interface WheelState {
  type: 'wheel-of-fortune';
  guessedLetters: string[];
  currentWedge: WheelWedge | null;
  activePlayerId: string | null;
  roundScores: Record<string, number>;
  solvedByPlayerId: string | null;
}

/**
 * What contestants receive instead of `WheelState` + the round's `data` —
 * `category`/`wedges`/`vowelCost`/`solveBonus` are safe to show as-is, but
 * `revealedSolution` replaces every not-yet-guessed letter with a mask
 * (same `string[][]` shape as `WheelPuzzleData.solution`, never the real
 * letters) so the puzzle answer itself never reaches contestants early.
 */
export interface WheelContestantView {
  category: string;
  revealedSolution: string[][];
  wedges: WheelWedge[];
  vowelCost: number;
  solveBonus: number;
  guessedLetters: string[];
  currentWedge: WheelWedge | null;
  activePlayerId: string | null;
  roundScores: Record<string, number>;
  solvedByPlayerId: string | null;
}
