import { describe, expect, it } from 'vitest';
import { jeopardyActionSchema, jeopardyBoardDataSchema } from './jeopardy.js';

describe('jeopardyBoardDataSchema', () => {
  const validBoard = {
    categories: [
      {
        name: 'Science',
        clues: [
          { value: 200, clue: { text: 'H2O' }, answer: { text: 'What is water?' } },
          {
            value: 400,
            clue: { text: 'E=mc^2' },
            answer: { text: 'What is relativity?' },
            isDailyDouble: true,
          },
        ],
      },
    ],
  };

  it('accepts a valid board', () => {
    expect(jeopardyBoardDataSchema.safeParse(validBoard).success).toBe(true);
  });

  it('rejects a category with no clues', () => {
    const board = { categories: [{ name: 'Empty', clues: [] }] };
    expect(jeopardyBoardDataSchema.safeParse(board).success).toBe(false);
  });

  it('rejects no categories', () => {
    expect(jeopardyBoardDataSchema.safeParse({ categories: [] }).success).toBe(false);
  });
});

describe('jeopardyActionSchema', () => {
  it.each([
    { type: 'pick-clue', categoryIndex: 0, clueIndex: 1 },
    { type: 'wager', amount: 500 },
    { type: 'buzz' },
    { type: 'judge', correct: true },
  ])('accepts a valid $type action', (action) => {
    expect(jeopardyActionSchema.safeParse(action).success).toBe(true);
  });

  it('rejects an unknown action type', () => {
    expect(jeopardyActionSchema.safeParse({ type: 'nope' }).success).toBe(false);
  });
});
