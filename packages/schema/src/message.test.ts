import { describe, expect, it } from 'vitest';
import { clientMessageSchema } from './message.js';

describe('clientMessageSchema', () => {
  it.each([
    { type: 'join', name: 'Alex' },
    { type: 'remove-from-queue', queueEntryId: 'q1' },
    { type: 'reorder-queue', queueEntryIds: ['q1', 'q2'] },
    { type: 'start-game' },
    { type: 'advance-queue' },
    { type: 'round-action', action: { type: 'buzz' } },
  ])('accepts a valid $type message', (message) => {
    expect(clientMessageSchema.safeParse(message).success).toBe(true);
  });

  it('accepts add-round-to-queue with a valid round', () => {
    const message = {
      type: 'add-round-to-queue',
      round: {
        schemaVersion: 1,
        roundId: 'round-1',
        title: 'Final Round',
        type: 'final-jeopardy',
        data: { category: 'x', clue: { text: 'x' }, answer: { text: 'y' } },
      },
    };
    expect(clientMessageSchema.safeParse(message).success).toBe(true);
  });

  it('rejects add-round-to-queue with an invalid round', () => {
    const message = { type: 'add-round-to-queue', round: { roundId: 'round-1' } };
    expect(clientMessageSchema.safeParse(message).success).toBe(false);
  });

  it('rejects an unknown message type', () => {
    expect(clientMessageSchema.safeParse({ type: 'nope' }).success).toBe(false);
  });

  it('rejects a join with an empty name', () => {
    expect(clientMessageSchema.safeParse({ type: 'join', name: '' }).success).toBe(false);
  });
});
