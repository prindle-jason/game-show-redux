import { describe, expect, it } from 'vitest';
import { finalJeopardyActionSchema, finalJeopardyDataSchema } from './final-jeopardy.js';

describe('finalJeopardyDataSchema', () => {
  it('accepts a valid final jeopardy round', () => {
    const data = {
      category: 'History',
      clue: { text: 'This document was signed in 1776' },
      answer: { text: 'What is the Declaration of Independence?' },
    };
    expect(finalJeopardyDataSchema.safeParse(data).success).toBe(true);
  });

  it('rejects a missing category', () => {
    const data = { clue: { text: 'x' }, answer: { text: 'y' } };
    expect(finalJeopardyDataSchema.safeParse(data).success).toBe(false);
  });
});

describe('finalJeopardyActionSchema', () => {
  it.each([
    { type: 'wager', amount: 1000 },
    { type: 'submit-answer', answer: 'What is Zod?' },
    { type: 'reveal-next' },
    { type: 'judge', playerId: 'p1', correct: false },
  ])('accepts a valid $type action', (action) => {
    expect(finalJeopardyActionSchema.safeParse(action).success).toBe(true);
  });

  it('rejects a judge action with no playerId', () => {
    expect(finalJeopardyActionSchema.safeParse({ type: 'judge', correct: true }).success).toBe(
      false,
    );
  });
});
