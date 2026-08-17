import { CURRENT_ROUND_SCHEMA_VERSION, type Round } from '@gameshow/schema';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { importRoundZip, RoundImportError } from './round-import.js';

const JEOPARDY_ROUND: Round = {
  schemaVersion: CURRENT_ROUND_SCHEMA_VERSION,
  roundId: 'round-1',
  title: 'Pictures',
  type: 'jeopardy',
  data: {
    categories: [
      {
        name: 'Media',
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

const WHEEL_ROUND: Round = {
  schemaVersion: CURRENT_ROUND_SCHEMA_VERSION,
  roundId: 'round-2',
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

const PNG_BYTES = new Uint8Array([1, 2, 3]);
const MP3_BYTES = new Uint8Array([4, 5]);

interface ManifestEntry {
  assetId: string;
  kind: string;
  contentType: string;
}

async function buildZip(
  round: Round,
  manifest?: ManifestEntry[],
  assetBytes?: Record<string, Uint8Array>,
): Promise<Blob> {
  const zip = new JSZip();
  zip.file('round.json', JSON.stringify(round));
  if (manifest) {
    zip.file('assets/manifest.json', JSON.stringify(manifest));
  }
  if (assetBytes) {
    for (const [assetId, bytes] of Object.entries(assetBytes)) {
      zip.file(`assets/${assetId}`, bytes);
    }
  }
  return zip.generateAsync({ type: 'blob' });
}

const MEDIA_MANIFEST: ManifestEntry[] = [
  { assetId: 'img-1', kind: 'image', contentType: 'image/png' },
  { assetId: 'aud-1', kind: 'audio', contentType: 'audio/mpeg' },
];
const MEDIA_ASSET_BYTES = { 'img-1': PNG_BYTES, 'aud-1': MP3_BYTES };

describe('importRoundZip', () => {
  it('round-trips a media-free round with no manifest', async () => {
    const blob = await buildZip(WHEEL_ROUND);
    const result = await importRoundZip(blob);
    expect(result.round).toEqual(WHEEL_ROUND);
    expect(result.assets).toEqual([]);
  });

  it('round-trips a round with attached image and audio assets', async () => {
    const blob = await buildZip(JEOPARDY_ROUND, MEDIA_MANIFEST, MEDIA_ASSET_BYTES);
    const result = await importRoundZip(blob);

    expect(result.round).toEqual(JEOPARDY_ROUND);
    expect(result.assets).toHaveLength(2);

    const image = result.assets.find((asset) => asset.assetId === 'img-1');
    expect(image?.kind).toBe('image');
    expect(image?.blob.type).toBe('image/png');
    expect(image?.blob.size).toBe(3);

    const audio = result.assets.find((asset) => asset.assetId === 'aud-1');
    expect(audio?.kind).toBe('audio');
    expect(audio?.blob.type).toBe('audio/mpeg');
    expect(audio?.blob.size).toBe(2);
  });

  it('rejects a non-zip blob', async () => {
    await expect(importRoundZip(new Blob(['not a zip']))).rejects.toThrow(RoundImportError);
  });

  it('rejects a zip missing round.json', async () => {
    const zip = new JSZip();
    const blob = await zip.generateAsync({ type: 'blob' });
    await expect(importRoundZip(blob)).rejects.toThrow('Missing round.json');
  });

  it('rejects round.json that fails schema validation', async () => {
    const zip = new JSZip();
    zip.file('round.json', JSON.stringify({ bogus: true }));
    const blob = await zip.generateAsync({ type: 'blob' });
    await expect(importRoundZip(blob)).rejects.toThrow(/failed validation/);
  });

  it('rejects a media round with no manifest', async () => {
    const blob = await buildZip(JEOPARDY_ROUND);
    await expect(importRoundZip(blob)).rejects.toThrow('Missing assets/manifest.json');
  });

  it('rejects a manifest missing a referenced asset', async () => {
    const manifest = [{ assetId: 'img-1', kind: 'image', contentType: 'image/png' }];
    const blob = await buildZip(JEOPARDY_ROUND, manifest, { 'img-1': PNG_BYTES });
    await expect(importRoundZip(blob)).rejects.toThrow('Missing asset in manifest: aud-1');
  });

  it('rejects a manifest with an unreferenced extra asset', async () => {
    const manifest = [
      ...MEDIA_MANIFEST,
      { assetId: 'extra-1', kind: 'image', contentType: 'image/png' },
    ];
    const blob = await buildZip(JEOPARDY_ROUND, manifest, {
      ...MEDIA_ASSET_BYTES,
      'extra-1': PNG_BYTES,
    });
    await expect(importRoundZip(blob)).rejects.toThrow('Unreferenced asset in manifest: extra-1');
  });

  it('rejects a manifest entry whose file is missing from the zip', async () => {
    const blob = await buildZip(JEOPARDY_ROUND, MEDIA_MANIFEST, { 'img-1': PNG_BYTES });
    await expect(importRoundZip(blob)).rejects.toThrow('Missing asset file: aud-1');
  });

  it('rejects an oversized asset', async () => {
    const oversized = new Uint8Array(6 * 1024 * 1024);
    const blob = await buildZip(JEOPARDY_ROUND, MEDIA_MANIFEST, {
      'img-1': oversized,
      'aud-1': MP3_BYTES,
    });
    await expect(importRoundZip(blob)).rejects.toThrow(/exceeds the/);
  });

  it('rejects an asset with an unsupported content type', async () => {
    const manifest = [
      { assetId: 'img-1', kind: 'image', contentType: 'application/pdf' },
      { assetId: 'aud-1', kind: 'audio', contentType: 'audio/mpeg' },
    ];
    const blob = await buildZip(JEOPARDY_ROUND, manifest, MEDIA_ASSET_BYTES);
    await expect(importRoundZip(blob)).rejects.toThrow(/unsupported content type/);
  });

  it("rejects a manifest entry whose kind disagrees with the round's own reference", async () => {
    const manifest = [
      { assetId: 'img-1', kind: 'video', contentType: 'video/mp4' },
      { assetId: 'aud-1', kind: 'audio', contentType: 'audio/mpeg' },
    ];
    const blob = await buildZip(JEOPARDY_ROUND, manifest, MEDIA_ASSET_BYTES);
    await expect(importRoundZip(blob)).rejects.toThrow(
      'Asset img-1 is declared as video but the round references it as image',
    );
  });
});
