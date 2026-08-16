import type { WheelWedge } from '@gameshow/schema';
import { describe, expect, it } from 'vitest';
import { wedgeLabel } from './wedge-label.js';

describe('wedgeLabel', () => {
  it('formats a cash wedge', () => {
    const wedge: WheelWedge = { kind: 'cash', value: 500 };
    expect(wedgeLabel(wedge)).toBe('$500');
  });

  it('formats a bankrupt wedge', () => {
    expect(wedgeLabel({ kind: 'bankrupt' })).toBe('Bankrupt');
  });

  it('formats a lose-turn wedge', () => {
    expect(wedgeLabel({ kind: 'lose-turn' })).toBe('Lose a turn');
  });
});
