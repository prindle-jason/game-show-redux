import { z } from 'zod';
import type { ResolvedMediaRef } from './media.js';
import { mediaRefSchema } from './media.js';

/**
 * Shared shape for anything shown to players: a clue, an answer key, a
 * puzzle prompt. At least one of `text`/`media` must be present.
 */
export const clueContentSchema = z
  .object({
    text: z.string().min(1).optional(),
    media: mediaRefSchema.optional(),
  })
  .refine((content) => content.text !== undefined || content.media !== undefined, {
    message: 'ClueContent requires at least one of `text` or `media`',
  });

export type ClueContent = z.infer<typeof clueContentSchema>;

/**
 * The outgoing counterpart to `ClueContent` sent to clients — `media` (if
 * present) carries a fetchable URL instead of an `assetId`. Plain TS, not
 * zod: `party` constructs this itself once it resolves the round's media.
 */
export interface ResolvedClueContent {
  text?: string;
  media?: ResolvedMediaRef;
}
