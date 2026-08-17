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

/**
 * The outgoing counterpart to `MediaRef` — plain TS, not zod, since `party`
 * constructs this itself (see room.ts's precedent) once it resolves an
 * `assetId` to a fetchable R2 URL.
 */
export type ResolvedMediaRef =
  | { kind: 'image'; url: string }
  | { kind: 'audio'; url: string }
  | { kind: 'video'; url: string }
  | { kind: 'slideshow'; urls: string[] };

/**
 * One entry per real file bundled in a round's zip (`assets/manifest.json`),
 * written by `builder-app` from each attached file's actual `blob.type` and
 * cross-checked by `player-app` against `listMediaRefs` on import. A
 * `slideshow` `MediaRef` bundles several `assetId`s, but each decomposes to
 * its own manifest entry as a plain `'image'` file (mirrors the convention in
 * `player-app/src/fixtures.ts`) — `'slideshow'` itself is never a per-file kind.
 */
export const roundMediaManifestEntrySchema = z.object({
  assetId: z.string().min(1),
  kind: z.enum(['image', 'audio', 'video']),
  contentType: z.string().min(1),
});

export const roundMediaManifestSchema = z.array(roundMediaManifestEntrySchema);

export type RoundMediaManifestEntry = z.infer<typeof roundMediaManifestEntrySchema>;

/**
 * Per-kind upload validation, shared by `party` (server-side enforcement) and
 * `player-app` (client-side pre-check before requesting an upload token).
 */
export const MEDIA_LIMITS: Record<MediaRef['kind'], { contentTypes: string[]; maxBytes: number }> =
  {
    image: {
      contentTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
      maxBytes: 5 * 1024 * 1024,
    },
    audio: {
      contentTypes: ['audio/mpeg', 'audio/ogg', 'audio/wav'],
      maxBytes: 15 * 1024 * 1024,
    },
    video: {
      contentTypes: ['video/mp4', 'video/webm'],
      maxBytes: 50 * 1024 * 1024,
    },
    slideshow: {
      contentTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
      maxBytes: 5 * 1024 * 1024,
    },
  };
