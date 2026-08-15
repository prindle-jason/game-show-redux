import { describe, expect, it } from 'vitest';
import { wheelActionSchema, wheelPuzzleDataSchema } from './wheel-of-fortune.js';

describe('wheelPuzzleDataSchema', () => {
  const validPuzzle = {
    category: 'Video Games',
    solution: ['', 'IT IS', 'DANGEROUS', 'TO GO ALONE'],
    wedges: [{ kind: 'cash', value: 500 }, { kind: 'bankrupt' }, { kind: 'lose-turn' }],
    vowelCost: 250,
    solveBonus: 1000,
  };

  it('accepts a valid puzzle', () => {
    expect(wheelPuzzleDataSchema.safeParse(validPuzzle).success).toBe(true);
  });

  it('rejects no wedges', () => {
    expect(wheelPuzzleDataSchema.safeParse({ ...validPuzzle, wedges: [] }).success).toBe(false);
  });

  it('rejects a cash wedge with a non-positive value', () => {
    const puzzle = { ...validPuzzle, wedges: [{ kind: 'cash', value: 0 }] };
    expect(wheelPuzzleDataSchema.safeParse(puzzle).success).toBe(false);
  });
});

describe('wheelActionSchema', () => {
  it.each([
    { type: 'spin' },
    { type: 'guess-consonant', letter: 'T' },
    { type: 'buy-vowel', letter: 'A' },
    { type: 'attempt-solve' },
    { type: 'judge-solve', correct: true },
    { type: 'judge-solve', correct: false },
    { type: 'skip-turn' },
    { type: 'end-round' },
  ])('accepts a valid $type action', (action) => {
    expect(wheelActionSchema.safeParse(action).success).toBe(true);
  });

  it('rejects a letter longer than one character', () => {
    const action = { type: 'guess-consonant', letter: 'TH' };
    expect(wheelActionSchema.safeParse(action).success).toBe(false);
  });

  it('rejects judge-solve without a correct flag', () => {
    expect(wheelActionSchema.safeParse({ type: 'judge-solve' }).success).toBe(false);
  });
});
