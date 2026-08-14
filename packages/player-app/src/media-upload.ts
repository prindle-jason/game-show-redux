import type { MediaRef, Round } from '@gameshow/schema';

export interface RoundMediaAsset {
  assetId: string;
  kind: MediaRef['kind'];
  blob: Blob;
}

type RequestUploadTokens = (
  roundId: string,
  assets: Array<{ assetId: string; kind: MediaRef['kind']; contentType: string; size: number }>,
) => Promise<Array<{ assetId: string; token: string }>>;

/**
 * Uploads every asset for a round before it's added to the queue. Assets go
 * straight to the stateless `/media/upload` route (see party's media.ts) —
 * only the short-lived token request round-trips through the room's socket.
 */
export async function uploadRoundMedia(
  round: Round,
  assets: RoundMediaAsset[],
  requestUploadTokens: RequestUploadTokens,
  mediaBaseUrl: string,
): Promise<void> {
  if (assets.length === 0) return;

  const tokens = await requestUploadTokens(
    round.roundId,
    assets.map((asset) => ({
      assetId: asset.assetId,
      kind: asset.kind,
      contentType: asset.blob.type,
      size: asset.blob.size,
    })),
  );
  const tokenByAssetId = new Map(tokens.map((entry) => [entry.assetId, entry.token]));

  await Promise.all(
    assets.map(async (asset) => {
      const token = tokenByAssetId.get(asset.assetId);
      if (!token) throw new Error(`No upload token issued for asset ${asset.assetId}`);

      const response = await fetch(
        `${mediaBaseUrl}/media/upload?token=${encodeURIComponent(token)}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': asset.blob.type },
          body: asset.blob,
        },
      );
      if (!response.ok) {
        throw new Error(`Upload failed for asset ${asset.assetId}: ${response.status}`);
      }
    }),
  );
}
