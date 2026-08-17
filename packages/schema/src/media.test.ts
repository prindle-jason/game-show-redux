import { describe, expect, it } from 'vitest';
import { mediaRefSchema, roundMediaManifestSchema } from './media.js';

describe('mediaRefSchema', () => {
  it.each([
    { kind: 'image', assetId: 'images/a.png' },
    { kind: 'audio', assetId: 'audio/a.mp3' },
    { kind: 'video', assetId: 'video/a.mp4' },
    { kind: 'slideshow', assetIds: ['images/a.png', 'images/b.png'] },
  ])('accepts a valid $kind ref', (ref) => {
    expect(mediaRefSchema.safeParse(ref).success).toBe(true);
  });

  it('rejects a slideshow with no assetIds', () => {
    expect(mediaRefSchema.safeParse({ kind: 'slideshow', assetIds: [] }).success).toBe(false);
  });

  it('rejects an unknown kind', () => {
    expect(mediaRefSchema.safeParse({ kind: 'gif', assetId: 'a.gif' }).success).toBe(false);
  });
});

describe('roundMediaManifestSchema', () => {
  it('accepts a manifest with image/audio/video entries', () => {
    const manifest = [
      { assetId: 'img-1', kind: 'image', contentType: 'image/png' },
      { assetId: 'aud-1', kind: 'audio', contentType: 'audio/mpeg' },
      { assetId: 'vid-1', kind: 'video', contentType: 'video/mp4' },
    ];
    expect(roundMediaManifestSchema.safeParse(manifest).success).toBe(true);
  });

  it('rejects a slideshow kind entry', () => {
    const manifest = [{ assetId: 'slide-1', kind: 'slideshow', contentType: 'image/png' }];
    expect(roundMediaManifestSchema.safeParse(manifest).success).toBe(false);
  });

  it('rejects a non-array manifest', () => {
    expect(roundMediaManifestSchema.safeParse({ assetId: 'a' }).success).toBe(false);
  });
});
