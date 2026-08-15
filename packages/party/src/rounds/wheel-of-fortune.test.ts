import type { WheelPuzzleData } from '@gameshow/schema';
import { describe, expect, it } from 'vitest';
import {
  createInitialWheelState,
  isWheelComplete,
  reduceWheel,
  toWheelContestantView,
} from './wheel-of-fortune.js';

const DATA: WheelPuzzleData = {
  category: 'Video Games',
  solution: ['', 'IT IS', 'DANGEROUS', 'TO GO ALONE'],
  wedges: [{ kind: 'cash', value: 500 }, { kind: 'bankrupt' }, { kind: 'lose-turn' }],
  vowelCost: 250,
  solveBonus: 1000,
};

const CONTESTANT_IDS = ['p1', 'p2', 'p3'];

/** Vowels present: I, A (no E, O, U) — used to test the "vowel missing" / exhaustion paths. */
const NO_U_DATA: WheelPuzzleData = {
  category: 'Test',
  solution: ['PIZZA'],
  wedges: DATA.wedges,
  vowelCost: 250,
  solveBonus: 1000,
};

function playersWithScores(scores: Record<string, number> = {}) {
  return CONTESTANT_IDS.map((id) => ({ id, name: id, score: scores[id] ?? 0 }));
}

function ctxFor(requesterId: string, spinResult?: import('@gameshow/schema').WheelWedge) {
  return { requesterId, isHost: false, players: playersWithScores(), spinResult };
}

const HOST_CTX = { requesterId: 'host', isHost: true, players: playersWithScores() };

function initialState(roundNumber = 0) {
  return createInitialWheelState('round-1', CONTESTANT_IDS, roundNumber);
}

describe('createInitialWheelState', () => {
  it('picks the active player from roundNumber % contestantIds.length', () => {
    expect(initialState(0).activePlayerId).toBe('p1');
    expect(initialState(1).activePlayerId).toBe('p2');
    expect(initialState(3).activePlayerId).toBe('p1');
  });

  it('starts every contestant at zero round score with nothing guessed', () => {
    const state = initialState();
    expect(state.roundScores).toEqual({ p1: 0, p2: 0, p3: 0 });
    expect(state.guessedLetters).toEqual([]);
    expect(state.currentWedge).toBeNull();
    expect(state.pendingSolve).toBeNull();
    expect(state.solvedByPlayerId).toBeNull();
    expect(state.endedByHost).toBe(false);
  });
});

describe('spin', () => {
  it('sets currentWedge on a cash wedge and keeps the same active player', () => {
    const result = reduceWheel(
      initialState(),
      DATA,
      { type: 'spin' },
      ctxFor('p1', { kind: 'cash', value: 500 }),
    );
    if (!result.ok) throw new Error('unreachable');
    expect(result.state.currentWedge).toEqual({ kind: 'cash', value: 500 });
    expect(result.state.activePlayerId).toBe('p1');
  });

  it('zeroes the active player round score and passes the turn on bankrupt', () => {
    const state = { ...initialState(), roundScores: { p1: 1000, p2: 0, p3: 0 } };
    const result = reduceWheel(state, DATA, { type: 'spin' }, ctxFor('p1', { kind: 'bankrupt' }));
    if (!result.ok) throw new Error('unreachable');
    expect(result.state.roundScores.p1).toBe(0);
    expect(result.state.activePlayerId).toBe('p2');
    expect(result.state.currentWedge).toBeNull();
  });

  it('passes the turn without touching score on lose-turn', () => {
    const state = { ...initialState(), roundScores: { p1: 500, p2: 0, p3: 0 } };
    const result = reduceWheel(state, DATA, { type: 'spin' }, ctxFor('p1', { kind: 'lose-turn' }));
    if (!result.ok) throw new Error('unreachable');
    expect(result.state.roundScores.p1).toBe(500);
    expect(result.state.activePlayerId).toBe('p2');
  });

  it('rejects a spin from a non-active player', () => {
    const result = reduceWheel(
      initialState(),
      DATA,
      { type: 'spin' },
      ctxFor('p2', { kind: 'cash', value: 500 }),
    );
    expect(result).toEqual({ ok: false, error: expect.any(String) });
  });

  it('rejects a second spin while a cash wedge is unresolved', () => {
    const spun = reduceWheel(
      initialState(),
      DATA,
      { type: 'spin' },
      ctxFor('p1', { kind: 'cash', value: 500 }),
    );
    if (!spun.ok) throw new Error('unreachable');
    const result = reduceWheel(
      spun.state,
      DATA,
      { type: 'spin' },
      ctxFor('p1', { kind: 'cash', value: 300 }),
    );
    expect(result).toEqual({ ok: false, error: expect.any(String) });
  });

  it('rejects a spin once every consonant in the solution has been guessed', () => {
    // Consonants in "IT IS DANGEROUS TO GO ALONE": T,S,D,N,G,R,S,T,G,L,N — unique: T,S,D,N,G,R,L
    const guessedLetters = ['T', 'S', 'D', 'N', 'G', 'R', 'L'];
    const state = { ...initialState(), guessedLetters };
    const result = reduceWheel(
      state,
      DATA,
      { type: 'spin' },
      ctxFor('p1', { kind: 'cash', value: 500 }),
    );
    expect(result).toEqual({ ok: false, error: expect.any(String) });
  });
});

describe('guess-consonant', () => {
  function spunState() {
    const result = reduceWheel(
      initialState(),
      DATA,
      { type: 'spin' },
      ctxFor('p1', { kind: 'cash', value: 500 }),
    );
    if (!result.ok) throw new Error('unreachable');
    return result.state;
  }

  it('pays value * occurrences and keeps the turn on a hit', () => {
    // 'T' appears twice: once in "IT IS", once in "TO GO ALONE"
    const result = reduceWheel(
      spunState(),
      DATA,
      { type: 'guess-consonant', letter: 'T' },
      ctxFor('p1'),
    );
    if (!result.ok) throw new Error('unreachable');
    expect(result.state.roundScores.p1).toBe(1000);
    expect(result.state.activePlayerId).toBe('p1');
    expect(result.state.currentWedge).toBeNull();
    expect(result.state.guessedLetters).toContain('T');
  });

  it('passes the turn on a miss without paying', () => {
    const result = reduceWheel(
      spunState(),
      DATA,
      { type: 'guess-consonant', letter: 'Z' },
      ctxFor('p1'),
    );
    if (!result.ok) throw new Error('unreachable');
    expect(result.state.roundScores.p1).toBe(0);
    expect(result.state.activePlayerId).toBe('p2');
  });

  it('rejects guessing without an unresolved spin', () => {
    const result = reduceWheel(
      initialState(),
      DATA,
      { type: 'guess-consonant', letter: 'T' },
      ctxFor('p1'),
    );
    expect(result).toEqual({ ok: false, error: expect.any(String) });
  });

  it('rejects a vowel submitted as a consonant guess', () => {
    const result = reduceWheel(
      spunState(),
      DATA,
      { type: 'guess-consonant', letter: 'A' },
      ctxFor('p1'),
    );
    expect(result).toEqual({ ok: false, error: expect.any(String) });
  });

  it('rejects a repeat letter guess', () => {
    const first = reduceWheel(
      spunState(),
      DATA,
      { type: 'guess-consonant', letter: 'T' },
      ctxFor('p1'),
    );
    if (!first.ok) throw new Error('unreachable');
    const spunAgain = reduceWheel(
      first.state,
      DATA,
      { type: 'spin' },
      ctxFor('p1', { kind: 'cash', value: 100 }),
    );
    if (!spunAgain.ok) throw new Error('unreachable');
    const result = reduceWheel(
      spunAgain.state,
      DATA,
      { type: 'guess-consonant', letter: 'T' },
      ctxFor('p1'),
    );
    expect(result).toEqual({ ok: false, error: expect.any(String) });
  });
});

describe('buy-vowel', () => {
  function fundedState(amount: number) {
    return { ...initialState(), roundScores: { p1: amount, p2: 0, p3: 0 } };
  }

  it('charges vowelCost and keeps the turn when the vowel is found', () => {
    const result = reduceWheel(
      fundedState(250),
      DATA,
      { type: 'buy-vowel', letter: 'I' },
      ctxFor('p1'),
    );
    if (!result.ok) throw new Error('unreachable');
    expect(result.state.roundScores.p1).toBe(0);
    expect(result.state.activePlayerId).toBe('p1');
    expect(result.state.guessedLetters).toContain('I');
  });

  it('charges vowelCost and passes the turn when the vowel is missing', () => {
    const result = reduceWheel(
      fundedState(250),
      NO_U_DATA,
      { type: 'buy-vowel', letter: 'U' },
      ctxFor('p1'),
    );
    if (!result.ok) throw new Error('unreachable');
    expect(result.state.roundScores.p1).toBe(0);
    expect(result.state.activePlayerId).toBe('p2');
  });

  it('rejects buying without enough funds', () => {
    const result = reduceWheel(
      fundedState(100),
      DATA,
      { type: 'buy-vowel', letter: 'I' },
      ctxFor('p1'),
    );
    expect(result).toEqual({ ok: false, error: expect.any(String) });
  });

  it('rejects a consonant submitted as a vowel buy', () => {
    const result = reduceWheel(
      fundedState(250),
      DATA,
      { type: 'buy-vowel', letter: 'T' },
      ctxFor('p1'),
    );
    expect(result).toEqual({ ok: false, error: expect.any(String) });
  });

  it('rejects buying once every vowel actually in the solution has been guessed', () => {
    // Once I and A (the only vowels in "PIZZA") are guessed, buy-vowel is rejected
    // even though 'U'/'E'/'O' themselves were never attempted.
    const state = { ...fundedState(250), guessedLetters: ['I', 'A'] };
    const result = reduceWheel(state, NO_U_DATA, { type: 'buy-vowel', letter: 'U' }, ctxFor('p1'));
    expect(result).toEqual({ ok: false, error: expect.any(String) });
  });

  it('rejects buying a vowel from a non-active player', () => {
    const result = reduceWheel(
      fundedState(250),
      DATA,
      { type: 'buy-vowel', letter: 'I' },
      ctxFor('p2'),
    );
    expect(result).toEqual({ ok: false, error: expect.any(String) });
  });
});

describe('isWheelComplete', () => {
  it('is false while nobody has solved or the host ended it', () => {
    expect(isWheelComplete(initialState())).toBe(false);
  });

  it('is true once solvedByPlayerId is set', () => {
    expect(isWheelComplete({ ...initialState(), solvedByPlayerId: 'p1' })).toBe(true);
  });

  it('is true once endedByHost is set', () => {
    expect(isWheelComplete({ ...initialState(), endedByHost: true })).toBe(true);
  });
});

describe('toWheelContestantView', () => {
  it('masks unguessed letters but reveals spaces and guessed letters', () => {
    const state = { ...initialState(), guessedLetters: ['I', 'T'] };
    const view = toWheelContestantView(state, DATA, 'p1');
    expect(view.revealedSolution).toEqual(['', 'IT I_', '_________', 'T_ __ _____']);
  });

  it('reports canSpin/canBuyVowel accurately, including when currentWedge is unresolved', () => {
    const fresh = toWheelContestantView(initialState(), DATA, 'p1');
    expect(fresh.canSpin).toBe(true);
    expect(fresh.canBuyVowel).toBe(true);

    const spun = { ...initialState(), currentWedge: { kind: 'cash' as const, value: 500 } };
    const view = toWheelContestantView(spun, DATA, 'p1');
    expect(view.canSpin).toBe(false);
    expect(view.canBuyVowel).toBe(false);
  });

  it('never leaks a guess string, and reports pendingSolve as just a playerId', () => {
    const state = { ...initialState(), pendingSolve: { playerId: 'p2' } };
    const view = toWheelContestantView(state, DATA, 'p1');
    expect(view.pendingSolve).toEqual({ playerId: 'p2' });
  });
});

describe('attempt-solve / judge-solve', () => {
  it('pauses the round on attempt-solve, blocking every other action', () => {
    const attempted = reduceWheel(initialState(), DATA, { type: 'attempt-solve' }, ctxFor('p1'));
    if (!attempted.ok) throw new Error('unreachable');
    expect(attempted.state.pendingSolve).toEqual({ playerId: 'p1' });

    for (const action of [
      { type: 'spin' as const },
      { type: 'guess-consonant' as const, letter: 'T' },
      { type: 'buy-vowel' as const, letter: 'I' },
      { type: 'attempt-solve' as const },
    ]) {
      const result = reduceWheel(attempted.state, DATA, action, ctxFor('p1'));
      expect(result).toEqual({ ok: false, error: expect.any(String) });
    }
  });

  it('rejects attempt-solve while a spin is unresolved', () => {
    const spun = reduceWheel(
      initialState(),
      DATA,
      { type: 'spin' },
      ctxFor('p1', { kind: 'cash', value: 500 }),
    );
    if (!spun.ok) throw new Error('unreachable');
    const result = reduceWheel(spun.state, DATA, { type: 'attempt-solve' }, ctxFor('p1'));
    expect(result).toEqual({ ok: false, error: expect.any(String) });
  });

  it('rejects attempt-solve from a non-active player', () => {
    const result = reduceWheel(initialState(), DATA, { type: 'attempt-solve' }, ctxFor('p2'));
    expect(result).toEqual({ ok: false, error: expect.any(String) });
  });

  it('rejects judge-solve from a non-host', () => {
    const attempted = reduceWheel(initialState(), DATA, { type: 'attempt-solve' }, ctxFor('p1'));
    if (!attempted.ok) throw new Error('unreachable');
    const result = reduceWheel(
      attempted.state,
      DATA,
      { type: 'judge-solve', correct: true },
      ctxFor('p1'),
    );
    expect(result).toEqual({ ok: false, error: expect.any(String) });
  });

  it('rejects judge-solve when nothing is pending', () => {
    const result = reduceWheel(
      initialState(),
      DATA,
      { type: 'judge-solve', correct: true },
      HOST_CTX,
    );
    expect(result).toEqual({ ok: false, error: expect.any(String) });
  });

  it('a correct judgment commits every roundScore, adds solveBonus for the solver, and completes the round', () => {
    const state = {
      ...initialState(),
      roundScores: { p1: 1000, p2: 500, p3: 0 },
      pendingSolve: { playerId: 'p1' },
    };
    const result = reduceWheel(state, DATA, { type: 'judge-solve', correct: true }, HOST_CTX);
    if (!result.ok) throw new Error('unreachable');
    expect(result.scoreDeltas).toEqual({ p1: 2000, p2: 500, p3: 0 });
    expect(result.state.solvedByPlayerId).toBe('p1');
    expect(result.state.pendingSolve).toBeNull();
    expect(isWheelComplete(result.state)).toBe(true);
  });

  it('an incorrect judgment just passes the turn with no score change', () => {
    const state = {
      ...initialState(),
      roundScores: { p1: 1000, p2: 0, p3: 0 },
      pendingSolve: { playerId: 'p1' },
    };
    const result = reduceWheel(state, DATA, { type: 'judge-solve', correct: false }, HOST_CTX);
    if (!result.ok) throw new Error('unreachable');
    expect(result.scoreDeltas).toBeUndefined();
    expect(result.state.pendingSolve).toBeNull();
    expect(result.state.activePlayerId).toBe('p2');
    expect(isWheelComplete(result.state)).toBe(false);
  });
});

describe('skip-turn', () => {
  it('force-advances the turn and clears any unresolved wedge', () => {
    const state = { ...initialState(), currentWedge: { kind: 'cash' as const, value: 500 } };
    const result = reduceWheel(state, DATA, { type: 'skip-turn' }, HOST_CTX);
    if (!result.ok) throw new Error('unreachable');
    expect(result.state.activePlayerId).toBe('p2');
    expect(result.state.currentWedge).toBeNull();
  });

  it('rejects skip-turn from a non-host', () => {
    const result = reduceWheel(initialState(), DATA, { type: 'skip-turn' }, ctxFor('p1'));
    expect(result).toEqual({ ok: false, error: expect.any(String) });
  });

  it('rejects skip-turn while a solve attempt is pending', () => {
    const state = { ...initialState(), pendingSolve: { playerId: 'p1' } };
    const result = reduceWheel(state, DATA, { type: 'skip-turn' }, HOST_CTX);
    expect(result).toEqual({ ok: false, error: expect.any(String) });
  });
});

describe('end-round', () => {
  it('commits accumulated roundScores without a solver and completes the round', () => {
    const state = { ...initialState(), roundScores: { p1: 1000, p2: 500, p3: 0 } };
    const result = reduceWheel(state, DATA, { type: 'end-round' }, HOST_CTX);
    if (!result.ok) throw new Error('unreachable');
    expect(result.scoreDeltas).toEqual({ p1: 1000, p2: 500, p3: 0 });
    expect(result.state.solvedByPlayerId).toBeNull();
    expect(result.state.endedByHost).toBe(true);
    expect(isWheelComplete(result.state)).toBe(true);
  });

  it('rejects end-round from a non-host', () => {
    const result = reduceWheel(initialState(), DATA, { type: 'end-round' }, ctxFor('p1'));
    expect(result).toEqual({ ok: false, error: expect.any(String) });
  });
});

describe('cross-cutting authorization', () => {
  it('rejects a host-only action requested by a contestant, and a contestant action requested by the host', () => {
    for (const action of [{ type: 'skip-turn' as const }, { type: 'end-round' as const }]) {
      expect(reduceWheel(initialState(), DATA, action, ctxFor('p1'))).toEqual({
        ok: false,
        error: expect.any(String),
      });
    }
    expect(
      reduceWheel(
        initialState(),
        DATA,
        { type: 'spin' },
        { ...HOST_CTX, spinResult: { kind: 'cash', value: 100 } },
      ),
    ).toEqual({ ok: false, error: expect.any(String) });
  });
});
