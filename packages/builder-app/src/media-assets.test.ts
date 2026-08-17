import { CURRENT_ROUND_SCHEMA_VERSION, type Round } from '@gameshow/schema';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { type AssetTable, addMediaAssetsToZip } from './media-assets.js';

const MEDIA_FREE_ROUND: Round = {
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

const MEDIA_ROUND: Round = {
  schemaVersion: CURRENT_ROUND_SCHEMA_VERSION,
  roundId: 'round-2',
  title: 'World Capitals',
  type: 'final-jeopardy',
  data: {
    category: 'World Capitals',
    clue: {
      media: { kind: 'slideshow', assetIds: ['slide-1', 'slide-2'] },
    },
    answer: { media: { kind: 'audio', assetId: 'aud-1' } },
  },
};

function pngFile(): File {
  return new File([new Uint8Array([1, 2, 3])], 'a.png', { type: 'image/png' });
}

function mp3File(): File {
  return new File([new Uint8Array([4, 5])], 'a.mp3', { type: 'audio/mpeg' });
}

describe('addMediaAssetsToZip', () => {
  it('adds no assets folder for a media-free round', async () => {
    const zip = new JSZip();
    await addMediaAssetsToZip(zip, MEDIA_FREE_ROUND, {});
    expect(Object.keys(zip.files)).toEqual([]);
  });

  it('decomposes a slideshow ref into per-asset image manifest entries', async () => {
    const assets: AssetTable = {
      'slide-1': pngFile(),
      'slide-2': pngFile(),
      'aud-1': mp3File(),
    };
    const zip = new JSZip();
    await addMediaAssetsToZip(zip, MEDIA_ROUND, assets);

    const manifestJson = await zip.file('assets/manifest.json')?.async('string');
    const manifest = JSON.parse(manifestJson as string);
    expect(manifest).toEqual(
      expect.arrayContaining([
        { assetId: 'slide-1', kind: 'image', contentType: 'image/png' },
        { assetId: 'slide-2', kind: 'image', contentType: 'image/png' },
        { assetId: 'aud-1', kind: 'audio', contentType: 'audio/mpeg' },
      ]),
    );
    expect(manifest).toHaveLength(3);

    expect(await zip.file('assets/slide-1')?.async('string')).toBeDefined();
    expect(await zip.file('assets/slide-2')?.async('string')).toBeDefined();
    expect(await zip.file('assets/aud-1')?.async('string')).toBeDefined();
  });

  it('throws when a referenced assetId has no attached file', async () => {
    const zip = new JSZip();
    await expect(addMediaAssetsToZip(zip, MEDIA_ROUND, {})).rejects.toThrow(
      'Missing attached file for asset',
    );
  });
});
