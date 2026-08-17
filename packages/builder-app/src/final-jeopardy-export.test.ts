import { roundSchema } from '@gameshow/schema';
import { describe, expect, it } from 'vitest';
import type { FinalJeopardyDraft } from './final-jeopardy-draft-store.js';
import { exportFinalJeopardyRound, finalJeopardyDraftToRound } from './final-jeopardy-export.js';

const DRAFT: FinalJeopardyDraft = {
  roundId: 'round-1',
  title: 'World Capitals',
  category: 'Geography',
  clueText: 'This African capital sits highest',
  answerText: 'What is Addis Ababa?',
  assets: {},
};

describe('finalJeopardyDraftToRound', () => {
  it('produces a round that round-trips through roundSchema', () => {
    const round = finalJeopardyDraftToRound(DRAFT);
    expect(roundSchema.safeParse(round).success).toBe(true);
  });
});

describe('exportFinalJeopardyRound', () => {
  it('zips a round.json with no assets folder when media-free', async () => {
    const JSZipModule = await import('jszip');
    const blob = await exportFinalJeopardyRound(DRAFT);
    const zip = await JSZipModule.default.loadAsync(blob);
    const roundJson = await zip.file('round.json')?.async('string');
    expect(roundJson).toBeDefined();
    expect(roundSchema.safeParse(JSON.parse(roundJson as string)).success).toBe(true);
    expect(Object.keys(zip.files)).toEqual(['round.json']);
  });

  it('bundles attached media into assets/manifest.json and per-asset files', async () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'a.png', { type: 'image/png' });
    const draft: FinalJeopardyDraft = {
      ...DRAFT,
      clueMedia: { kind: 'image', assetId: 'clue-image' },
      assets: { 'clue-image': file },
    };

    const JSZipModule = await import('jszip');
    const blob = await exportFinalJeopardyRound(draft);
    const zip = await JSZipModule.default.loadAsync(blob);

    const manifestJson = await zip.file('assets/manifest.json')?.async('string');
    expect(JSON.parse(manifestJson as string)).toEqual([
      { assetId: 'clue-image', kind: 'image', contentType: 'image/png' },
    ]);
    expect(await zip.file('assets/clue-image')?.async('string')).toBeDefined();
  });

  it("decomposes a slideshow's assetIds into individual image manifest entries", async () => {
    const slide1 = new File([new Uint8Array([1])], 's1.png', { type: 'image/png' });
    const slide2 = new File([new Uint8Array([2])], 's2.png', { type: 'image/png' });
    const draft: FinalJeopardyDraft = {
      ...DRAFT,
      clueMedia: { kind: 'slideshow', assetIds: ['slide-1', 'slide-2'] },
      assets: { 'slide-1': slide1, 'slide-2': slide2 },
    };

    const JSZipModule = await import('jszip');
    const blob = await exportFinalJeopardyRound(draft);
    const zip = await JSZipModule.default.loadAsync(blob);

    const manifestJson = await zip.file('assets/manifest.json')?.async('string');
    const manifest = JSON.parse(manifestJson as string);
    expect(manifest).toEqual(
      expect.arrayContaining([
        { assetId: 'slide-1', kind: 'image', contentType: 'image/png' },
        { assetId: 'slide-2', kind: 'image', contentType: 'image/png' },
      ]),
    );
    expect(manifest.every((entry: { kind: string }) => entry.kind !== 'slideshow')).toBe(true);
  });
});
