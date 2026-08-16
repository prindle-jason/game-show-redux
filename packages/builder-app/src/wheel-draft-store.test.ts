import { describe, expect, it } from 'vitest';
import { validateWheelDraft, type WheelDraft } from './wheel-draft-store.js';

const VALID_DRAFT: WheelDraft = {
  roundId: 'round-1',
  title: 'My Puzzle',
  category: 'Places',
  solution: ['HELLO', '', '', ''],
  wedges: [{ kind: 'cash', value: 500 }, { kind: 'bankrupt' }],
  vowelCost: 250,
  solveBonus: 0,
};

describe('validateWheelDraft', () => {
  it('accepts a fully-filled-in draft', () => {
    expect(validateWheelDraft(VALID_DRAFT)).toEqual({ valid: true });
  });

  it('rejects a missing title', () => {
    expect(validateWheelDraft({ ...VALID_DRAFT, title: '' }).valid).toBe(false);
  });

  it('rejects a missing category', () => {
    expect(validateWheelDraft({ ...VALID_DRAFT, category: '' }).valid).toBe(false);
  });

  it('rejects an empty wedge list', () => {
    expect(validateWheelDraft({ ...VALID_DRAFT, wedges: [] }).valid).toBe(false);
  });

  it('rejects a non-positive vowel cost', () => {
    expect(validateWheelDraft({ ...VALID_DRAFT, vowelCost: 0 }).valid).toBe(false);
  });
});
