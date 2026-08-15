import type {
  WheelAction,
  WheelContestantView,
  WheelPuzzleData,
  WheelState,
  WheelWedge,
} from '@gameshow/schema';

/** Text-only for v1 — no `MediaRef` fields exist on `WheelPuzzleData` to resolve. */
export type ResolvedWheelPuzzleData = WheelPuzzleData;

export function resolveWheelMedia(data: WheelPuzzleData): ResolvedWheelPuzzleData {
  return data;
}

export function listWheelMediaUrls(_resolvedData: ResolvedWheelPuzzleData): string[] {
  return [];
}

export type WheelActionResult =
  | { ok: true; state: WheelState; scoreDeltas?: Record<string, number> }
  | { ok: false; error: string };

/**
 * `spinResult` is picked by `game-room.ts` (the DO, where real side effects
 * are allowed) and handed in here — `reduce` itself never calls into
 * randomness, so every wedge outcome is deterministically testable.
 */
export interface WheelActionContext {
  requesterId: string;
  isHost: boolean;
  players: { id: string; name: string; score: number }[];
  spinResult?: WheelWedge;
}

const VOWELS = new Set(['A', 'E', 'I', 'O', 'U']);

function isVowel(letter: string): boolean {
  return VOWELS.has(letter.toUpperCase());
}

/** Every character across every row, joined — the shared basis for letter-set/occurrence scans. */
function flattenSolution(data: WheelPuzzleData): string {
  return data.solution.join('').toUpperCase();
}

/** Every unique guessable letter actually present in the puzzle's solution. */
function solutionLetters(data: WheelPuzzleData): Set<string> {
  const letters = new Set<string>();
  for (const char of flattenSolution(data)) {
    if (/[A-Z]/.test(char)) letters.add(char);
  }
  return letters;
}

function remainingConsonants(state: WheelState, data: WheelPuzzleData): boolean {
  const guessed = new Set(state.guessedLetters);
  for (const letter of solutionLetters(data)) {
    if (!isVowel(letter) && !guessed.has(letter)) return true;
  }
  return false;
}

function remainingVowels(state: WheelState, data: WheelPuzzleData): boolean {
  const guessed = new Set(state.guessedLetters);
  for (const letter of solutionLetters(data)) {
    if (isVowel(letter) && !guessed.has(letter)) return true;
  }
  return false;
}

function occurrences(data: WheelPuzzleData, letter: string): number {
  let count = 0;
  for (const char of flattenSolution(data)) {
    if (char === letter) count++;
  }
  return count;
}

function nextPlayerId(state: WheelState): string | null {
  if (state.contestantIds.length === 0) return null;
  if (!state.activePlayerId) return state.contestantIds[0] ?? null;
  const index = state.contestantIds.indexOf(state.activePlayerId);
  if (index === -1) return state.contestantIds[0] ?? null;
  return state.contestantIds[(index + 1) % state.contestantIds.length] ?? null;
}

export function createInitialWheelState(
  _roundId: string,
  contestantIds: string[],
  roundNumber: number,
): WheelState {
  const activePlayerId =
    contestantIds.length > 0 ? (contestantIds[roundNumber % contestantIds.length] ?? null) : null;
  return {
    type: 'wheel-of-fortune',
    contestantIds,
    guessedLetters: [],
    currentWedge: null,
    lastSpinResult: null,
    activePlayerId,
    roundScores: Object.fromEntries(contestantIds.map((id) => [id, 0])),
    pendingSolve: null,
    solvedByPlayerId: null,
    endedByHost: false,
  };
}

export function reduceWheel(
  state: WheelState,
  data: WheelPuzzleData,
  action: WheelAction,
  context: WheelActionContext,
): WheelActionResult {
  switch (action.type) {
    case 'spin':
      return spin(state, data, context);
    case 'guess-consonant':
      return guessConsonant(state, data, action, context);
    case 'buy-vowel':
      return buyVowel(state, data, action, context);
    case 'attempt-solve':
      return attemptSolve(state, context);
    case 'judge-solve':
      return judgeSolve(state, data, action, context);
    case 'skip-turn':
      return skipTurn(state, context);
    case 'end-round':
      return endRound(state, context);
  }
}

function requireActivePlayer(state: WheelState, context: WheelActionContext): string | null {
  if (state.pendingSolve) return 'A solve attempt is awaiting judgment';
  if (context.requesterId !== state.activePlayerId) return "It's not your turn";
  return null;
}

function spin(
  state: WheelState,
  data: WheelPuzzleData,
  context: WheelActionContext,
): WheelActionResult {
  const turnError = requireActivePlayer(state, context);
  if (turnError) return { ok: false, error: turnError };
  if (state.currentWedge) return { ok: false, error: 'Resolve the current wedge first' };
  if (!remainingConsonants(state, data)) {
    return { ok: false, error: 'Every consonant has already been guessed' };
  }
  if (!context.spinResult) {
    return { ok: false, error: 'No spin result was provided' };
  }

  const wedge = context.spinResult;
  if (wedge.kind === 'cash') {
    return { ok: true, state: { ...state, currentWedge: wedge, lastSpinResult: wedge } };
  }

  const activePlayerId = state.activePlayerId as string;
  const roundScores =
    wedge.kind === 'bankrupt' ? { ...state.roundScores, [activePlayerId]: 0 } : state.roundScores;
  return {
    ok: true,
    state: {
      ...state,
      currentWedge: null,
      lastSpinResult: wedge,
      roundScores,
      activePlayerId: nextPlayerId(state),
    },
  };
}

function guessConsonant(
  state: WheelState,
  data: WheelPuzzleData,
  action: Extract<WheelAction, { type: 'guess-consonant' }>,
  context: WheelActionContext,
): WheelActionResult {
  const turnError = requireActivePlayer(state, context);
  if (turnError) return { ok: false, error: turnError };
  const letter = action.letter.toUpperCase();
  if (isVowel(letter)) return { ok: false, error: 'That is a vowel, not a consonant' };
  if (state.guessedLetters.includes(letter))
    return { ok: false, error: 'That letter was already guessed' };
  if (!state.currentWedge) return { ok: false, error: 'Spin before guessing a consonant' };
  const wedge = state.currentWedge;
  if (wedge.kind !== 'cash') return { ok: false, error: 'No cash wedge to guess against' };

  const activePlayerId = state.activePlayerId as string;
  const hitCount = occurrences(data, letter);
  const guessedLetters = [...state.guessedLetters, letter];

  if (hitCount > 0) {
    const roundScores = {
      ...state.roundScores,
      [activePlayerId]: (state.roundScores[activePlayerId] ?? 0) + wedge.value * hitCount,
    };
    return {
      ok: true,
      state: { ...state, guessedLetters, roundScores, currentWedge: null },
    };
  }

  return {
    ok: true,
    state: {
      ...state,
      guessedLetters,
      currentWedge: null,
      activePlayerId: nextPlayerId(state),
    },
  };
}

function buyVowel(
  state: WheelState,
  data: WheelPuzzleData,
  action: Extract<WheelAction, { type: 'buy-vowel' }>,
  context: WheelActionContext,
): WheelActionResult {
  const turnError = requireActivePlayer(state, context);
  if (turnError) return { ok: false, error: turnError };
  if (state.currentWedge) return { ok: false, error: 'Resolve the current wedge first' };
  const letter = action.letter.toUpperCase();
  if (!isVowel(letter)) return { ok: false, error: 'That is a consonant, not a vowel' };
  if (state.guessedLetters.includes(letter))
    return { ok: false, error: 'That letter was already guessed' };
  if (!remainingVowels(state, data)) {
    return { ok: false, error: 'Every vowel has already been guessed' };
  }

  const activePlayerId = state.activePlayerId as string;
  const balance = state.roundScores[activePlayerId] ?? 0;
  if (balance < data.vowelCost) return { ok: false, error: 'Not enough funds to buy a vowel' };

  const roundScores = { ...state.roundScores, [activePlayerId]: balance - data.vowelCost };
  const guessedLetters = [...state.guessedLetters, letter];
  const found = occurrences(data, letter) > 0;

  return {
    ok: true,
    state: {
      ...state,
      guessedLetters,
      roundScores,
      activePlayerId: found ? activePlayerId : nextPlayerId(state),
    },
  };
}

function attemptSolve(state: WheelState, context: WheelActionContext): WheelActionResult {
  const turnError = requireActivePlayer(state, context);
  if (turnError) return { ok: false, error: turnError };
  if (state.currentWedge) return { ok: false, error: 'Resolve the current wedge first' };
  return {
    ok: true,
    state: { ...state, pendingSolve: { playerId: context.requesterId } },
  };
}

/** Every contestant's scratch `roundScores` entry, ready to commit as a `scoreDeltas` payload. */
function roundScoreDeltas(state: WheelState): Record<string, number> {
  const deltas: Record<string, number> = {};
  for (const id of state.contestantIds) {
    deltas[id] = state.roundScores[id] ?? 0;
  }
  return deltas;
}

function judgeSolve(
  state: WheelState,
  data: WheelPuzzleData,
  action: Extract<WheelAction, { type: 'judge-solve' }>,
  context: WheelActionContext,
): WheelActionResult {
  if (!context.isHost) return { ok: false, error: 'Only the host can judge a solve attempt' };
  if (isWheelComplete(state)) return { ok: false, error: 'The round has already ended' };
  if (!state.pendingSolve) return { ok: false, error: 'No solve attempt is pending' };
  const { playerId } = state.pendingSolve;

  if (!action.correct) {
    return {
      ok: true,
      state: { ...state, pendingSolve: null, activePlayerId: nextPlayerId(state) },
    };
  }

  const scoreDeltas = roundScoreDeltas(state);
  scoreDeltas[playerId] = (scoreDeltas[playerId] ?? 0) + data.solveBonus;
  return {
    ok: true,
    scoreDeltas,
    state: { ...state, pendingSolve: null, solvedByPlayerId: playerId },
  };
}

function skipTurn(state: WheelState, context: WheelActionContext): WheelActionResult {
  if (!context.isHost) return { ok: false, error: 'Only the host can skip a turn' };
  if (isWheelComplete(state)) return { ok: false, error: 'The round has already ended' };
  if (state.pendingSolve) return { ok: false, error: 'A solve attempt is awaiting judgment' };
  return {
    ok: true,
    state: { ...state, currentWedge: null, activePlayerId: nextPlayerId(state) },
  };
}

function endRound(state: WheelState, context: WheelActionContext): WheelActionResult {
  if (!context.isHost) return { ok: false, error: 'Only the host can end the round' };
  if (isWheelComplete(state)) return { ok: false, error: 'The round has already ended' };
  return {
    ok: true,
    scoreDeltas: roundScoreDeltas(state),
    state: { ...state, pendingSolve: null, endedByHost: true },
  };
}

export function isWheelComplete(state: WheelState): boolean {
  return state.solvedByPlayerId !== null || state.endedByHost;
}

function maskSolution(data: WheelPuzzleData, guessedLetters: string[]): string[] {
  const guessed = new Set(guessedLetters);
  return data.solution.map((row) =>
    [...row]
      .map((char) => {
        const upper = char.toUpperCase();
        if (!/[A-Z]/.test(upper)) return char;
        return guessed.has(upper) ? char : '_';
      })
      .join(''),
  );
}

export function toWheelContestantView(
  state: WheelState,
  data: ResolvedWheelPuzzleData,
  _viewerId: string,
): WheelContestantView {
  return {
    type: 'wheel-of-fortune',
    category: data.category,
    revealedSolution: maskSolution(data, state.guessedLetters),
    wedges: data.wedges,
    vowelCost: data.vowelCost,
    solveBonus: data.solveBonus,
    guessedLetters: state.guessedLetters,
    currentWedge: state.currentWedge,
    lastSpinResult: state.lastSpinResult,
    activePlayerId: state.activePlayerId,
    roundScores: state.roundScores,
    pendingSolve: state.pendingSolve,
    canSpin: !state.pendingSolve && !state.currentWedge && remainingConsonants(state, data),
    canBuyVowel: !state.pendingSolve && !state.currentWedge && remainingVowels(state, data),
    solvedByPlayerId: state.solvedByPlayerId,
    endedByHost: state.endedByHost,
  };
}
