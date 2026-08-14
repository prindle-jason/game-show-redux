import type { Round } from '@gameshow/schema';
import { describe, expect, it, vi } from 'vitest';
import { uploadRoundMedia } from './media-upload.js';

const ROUND: Round = {
  schemaVersion: 1,
  roundId: 'round-1',
  title: 'Pictures',
  type: 'jeopardy',
  data: { categories: [] },
};

function blob(contentType: string, bytes: number[]): Blob {
  return new Blob([new Uint8Array(bytes)], { type: contentType });
}

describe('uploadRoundMedia', () => {
  it('does nothing and never requests tokens when there are no assets', async () => {
    const requestUploadTokens = vi.fn();
    await uploadRoundMedia(ROUND, [], requestUploadTokens, 'https://media.example');
    expect(requestUploadTokens).not.toHaveBeenCalled();
  });

  it('requests one token per asset and PUTs each blob to the upload route', async () => {
    const requestUploadTokens = vi.fn().mockResolvedValue([
      { assetId: 'img-1', token: 'token-1' },
      { assetId: 'aud-1', token: 'token-2' },
    ]);
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    await uploadRoundMedia(
      ROUND,
      [
        { assetId: 'img-1', kind: 'image', blob: blob('image/png', [1, 2, 3]) },
        { assetId: 'aud-1', kind: 'audio', blob: blob('audio/mpeg', [4, 5]) },
      ],
      requestUploadTokens,
      'https://media.example',
    );

    expect(requestUploadTokens).toHaveBeenCalledWith('round-1', [
      { assetId: 'img-1', kind: 'image', contentType: 'image/png', size: 3 },
      { assetId: 'aud-1', kind: 'audio', contentType: 'audio/mpeg', size: 2 },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [imgUrl, imgOptions] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(imgUrl).toBe('https://media.example/media/upload?token=token-1');
    expect(imgOptions.method).toBe('PUT');
    expect((imgOptions.headers as Record<string, string>)['Content-Type']).toBe('image/png');

    vi.unstubAllGlobals();
  });

  it('throws when no token was issued for an asset', async () => {
    const requestUploadTokens = vi.fn().mockResolvedValue([]);
    await expect(
      uploadRoundMedia(
        ROUND,
        [{ assetId: 'img-1', kind: 'image', blob: blob('image/png', [1]) }],
        requestUploadTokens,
        'https://media.example',
      ),
    ).rejects.toThrow('No upload token issued for asset img-1');
  });

  it('throws when an upload response is not ok', async () => {
    const requestUploadTokens = vi.fn().mockResolvedValue([{ assetId: 'img-1', token: 'token-1' }]);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 413 })));

    await expect(
      uploadRoundMedia(
        ROUND,
        [{ assetId: 'img-1', kind: 'image', blob: blob('image/png', [1]) }],
        requestUploadTokens,
        'https://media.example',
      ),
    ).rejects.toThrow('Upload failed for asset img-1: 413');

    vi.unstubAllGlobals();
  });
});
