import { describe, expect, it } from 'vitest';
import { CURRENT_ROUND_SCHEMA_VERSION, roundSchema, roundTypeDefinitions } from './round.js';

describe('roundSchema', () => {
  it('accepts a valid final-jeopardy round', () => {
    const round = {
      schemaVersion: CURRENT_ROUND_SCHEMA_VERSION,
      roundId: 'round-1',
      title: 'Final Round',
      type: 'final-jeopardy',
      data: {
        category: 'History',
        clue: { text: 'x' },
        answer: { text: 'y' },
      },
    };
    expect(roundSchema.safeParse(round).success).toBe(true);
  });

  it("rejects data that doesn't match the round's own type", () => {
    const round = {
      schemaVersion: CURRENT_ROUND_SCHEMA_VERSION,
      roundId: 'round-1',
      title: 'Mismatched',
      type: 'final-jeopardy',
      data: { categories: [] },
    };
    expect(roundSchema.safeParse(round).success).toBe(false);
  });

  it('rejects an unsupported schema version', () => {
    const round = {
      schemaVersion: 999,
      roundId: 'round-1',
      title: 'Old',
      type: 'final-jeopardy',
      data: { category: 'x', clue: { text: 'x' }, answer: { text: 'y' } },
    };
    expect(roundSchema.safeParse(round).success).toBe(false);
  });
});

describe('roundTypeDefinitions', () => {
  it('has an entry for every round type', () => {
    expect(Object.keys(roundTypeDefinitions).sort()).toEqual(
      ['final-jeopardy', 'jeopardy', 'wheel-of-fortune'].sort(),
    );
  });
});
