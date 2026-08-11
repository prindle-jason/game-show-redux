import { describe, expect, it } from 'vitest';
import { mediaRefSchema } from './media.js';

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
