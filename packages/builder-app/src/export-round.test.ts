import { roundSchema } from '@gameshow/schema';
import { describe, expect, it } from 'vitest';
import { exportWheelRound, wheelDraftToRound } from './export-round.js';
import type { WheelDraft } from './wheel-draft-store.js';

const DRAFT: WheelDraft = {
  roundId: 'round-1',
  title: 'My Puzzle',
  category: 'Places',
  solution: ['HELLO', 'WORLD', '', ''],
  wedges: [{ kind: 'cash', value: 500 }, { kind: 'bankrupt' }, { kind: 'lose-turn' }],
  vowelCost: 250,
  solveBonus: 100,
};

describe('wheelDraftToRound', () => {
  it('produces a round that round-trips through roundSchema', () => {
    const round = wheelDraftToRound(DRAFT);
    expect(roundSchema.safeParse(round).success).toBe(true);
  });
});

describe('exportWheelRound', () => {
  it('zips a round.json with no assets folder', async () => {
    const JSZipModule = await import('jszip');
    const blob = await exportWheelRound(DRAFT);
    const zip = await JSZipModule.default.loadAsync(blob);
    const roundJson = await zip.file('round.json')?.async('string');
    expect(roundJson).toBeDefined();
    const parsed = roundSchema.safeParse(JSON.parse(roundJson as string));
    expect(parsed.success).toBe(true);
    expect(Object.keys(zip.files)).toEqual(['round.json']);
  });
});
