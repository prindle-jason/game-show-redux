import { z } from 'zod';
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
