import { z } from 'zod';

/**
 * A reference to media inside a round's zip bundle (`/assets`). `assetId` is
 * resolved to an R2 URL by the room once the round is added to a live queue —
 * that resolution is party's concern, not this package's.
 */
export const mediaRefSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('image'), assetId: z.string() }),
  z.object({ kind: z.literal('audio'), assetId: z.string() }),
  z.object({ kind: z.literal('video'), assetId: z.string() }),
  z.object({ kind: z.literal('slideshow'), assetIds: z.array(z.string()).min(1) }),
]);

export type MediaRef = z.infer<typeof mediaRefSchema>;
