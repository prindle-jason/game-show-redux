import { z } from 'zod';

export const wheelWedgeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('cash'), value: z.number().int().positive() }),
  z.object({ kind: z.literal('bankrupt') }),
  z.object({ kind: z.literal('lose-turn') }),
]);

export type WheelWedge = z.infer<typeof wheelWedgeSchema>;

/**
 * `solution` is authored layout, not auto-wrapped: each entry is one board
 * row, verbatim (an empty string is a blank row). A row may contain spaces
 * for a multi-word row (e.g. `'IT IS'`). Guessable letters are every letter
 * across all rows, flattened.
 */
export const wheelPuzzleDataSchema = z.object({
  category: z.string().min(1),
  solution: z.array(z.string()).min(1),
  wedges: z.array(wheelWedgeSchema).min(1),
  vowelCost: z.number().int().positive(),
  solveBonus: z.number().int().nonnegative(),
});

export type WheelPuzzleData = z.infer<typeof wheelPuzzleDataSchema>;

/**
 * `judge-solve`, `skip-turn`, and `end-round` are host-only, mirroring the
 * host-arbitration actions in the other round types. `judge-solve` carries no
 * `playerId` (unlike Final Jeopardy's `judge`) because at most one solve can
 * ever be pending at a time (`WheelState.pendingSolve`).
 */
export const wheelActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('spin') }),
  z.object({ type: z.literal('guess-consonant'), letter: z.string().length(1) }),
  z.object({ type: z.literal('buy-vowel'), letter: z.string().length(1) }),
  z.object({ type: z.literal('attempt-solve') }),
  z.object({ type: z.literal('judge-solve'), correct: z.boolean() }),
  z.object({ type: z.literal('skip-turn') }),
  z.object({ type: z.literal('end-round') }),
]);

export type WheelAction = z.infer<typeof wheelActionSchema>;

/**
 * `party`-owned runtime state (plain TS, not zod — never validated, only
 * ever constructed by `party`). `roundScores` is a scratch bucket separate
 * from `Player.score`: a `bankrupt` wedge zeroes only the current player's
 * entry here. At round end every player's round score commits to their
 * total, and `solvedByPlayerId` (if set) additionally gets `solveBonus`.
 * `contestantIds` is the fixed, ordered roster captured at creation (mirrors
 * `FinalJeopardyState`), so turn rotation has a stable order to advance
 * through. `pendingSolve` holds only the attempting player's id — deliberately
 * no guess text, since a solve attempt may never even be typed into this app;
 * the host judges it via `judge-solve` based on what actually happened.
 * `endedByHost` distinguishes "host ended the round with nobody correct" from
 * "still playing", since `solvedByPlayerId === null` alone can't tell the two
 * apart.
 */
export interface WheelState {
  type: 'wheel-of-fortune';
  contestantIds: string[];
  guessedLetters: string[];
  currentWedge: WheelWedge | null;
  /** The wedge landed on by the most recent spin, kept around after `currentWedge` clears so the UI can show "last spin" feedback. */
  lastSpinResult: WheelWedge | null;
  activePlayerId: string | null;
  roundScores: Record<string, number>;
  pendingSolve: { playerId: string } | null;
  solvedByPlayerId: string | null;
  endedByHost: boolean;
}

/**
 * What contestants receive instead of `WheelState` + the round's `data` —
 * `category`/`wedges`/`vowelCost`/`solveBonus` are safe to show as-is, but
 * `revealedSolution` replaces every not-yet-guessed letter with a mask
 * (same `string[]` shape as `WheelPuzzleData.solution`, one entry per row,
 * never the real letters) so the puzzle answer itself never reaches
 * contestants early.
 * `canSpin`/`canBuyVowel` are computed server-side against the real solution
 * (matchable consonants/vowels not yet guessed) — a contestant can't derive
 * these themselves from `revealedSolution` alone, since a puzzle might not
 * contain every vowel. `pendingSolve` only ever exposes who is attempting a
 * solve, never any guess text.
 */
export interface WheelContestantView {
  type: 'wheel-of-fortune';
  category: string;
  revealedSolution: string[];
  wedges: WheelWedge[];
  vowelCost: number;
  solveBonus: number;
  guessedLetters: string[];
  currentWedge: WheelWedge | null;
  lastSpinResult: WheelWedge | null;
  activePlayerId: string | null;
  roundScores: Record<string, number>;
  pendingSolve: { playerId: string } | null;
  canSpin: boolean;
  canBuyVowel: boolean;
  solvedByPlayerId: string | null;
  endedByHost: boolean;
}
