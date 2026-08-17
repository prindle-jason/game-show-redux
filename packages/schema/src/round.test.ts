import { describe, expect, it } from 'vitest';
import type { Round } from './round.js';
import {
  CURRENT_ROUND_SCHEMA_VERSION,
  listMediaRefs,
  roundSchema,
  roundTypeDefinitions,
} from './round.js';

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

describe('listMediaRefs', () => {
  it('collects every clue/answer media ref in a jeopardy round', () => {
    const round: Round = {
      schemaVersion: CURRENT_ROUND_SCHEMA_VERSION,
      roundId: 'round-1',
      title: 'Board',
      type: 'jeopardy',
      data: {
        categories: [
          {
            name: 'Cat',
            clues: [
              {
                value: 200,
                clue: { media: { kind: 'image', assetId: 'img-1' } },
                answer: { text: 'x' },
              },
              {
                value: 400,
                clue: { text: 'y' },
                answer: { media: { kind: 'audio', assetId: 'aud-1' } },
              },
            ],
          },
        ],
      },
    };
    expect(listMediaRefs(round)).toEqual([
      { kind: 'image', assetId: 'img-1' },
      { kind: 'audio', assetId: 'aud-1' },
    ]);
  });

  it('collects the clue/answer media ref in a final-jeopardy round', () => {
    const round: Round = {
      schemaVersion: CURRENT_ROUND_SCHEMA_VERSION,
      roundId: 'round-1',
      title: 'Final',
      type: 'final-jeopardy',
      data: {
        category: 'Cat',
        clue: { media: { kind: 'slideshow', assetIds: ['s1', 's2'] } },
        answer: { text: 'x' },
      },
    };
    expect(listMediaRefs(round)).toEqual([{ kind: 'slideshow', assetIds: ['s1', 's2'] }]);
  });

  it('returns an empty list for a media-free round type', () => {
    const round: Round = {
      schemaVersion: CURRENT_ROUND_SCHEMA_VERSION,
      roundId: 'round-1',
      title: 'Wheel',
      type: 'wheel-of-fortune',
      data: {
        category: 'Cat',
        solution: ['ABC'],
        wedges: [{ kind: 'cash', value: 100 }],
        vowelCost: 100,
        solveBonus: 100,
      },
    };
    expect(listMediaRefs(round)).toEqual([]);
  });
});
