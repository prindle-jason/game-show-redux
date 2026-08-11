import { describe, expect, it } from 'vitest';
import { clueContentSchema } from './clue-content.js';

describe('clueContentSchema', () => {
  it('accepts text only', () => {
    expect(clueContentSchema.safeParse({ text: 'What is Zod?' }).success).toBe(true);
  });

  it('accepts media only', () => {
    const result = clueContentSchema.safeParse({
      media: { kind: 'image', assetId: 'images/a.png' },
    });
    expect(result.success).toBe(true);
  });

  it('accepts both text and media', () => {
    const result = clueContentSchema.safeParse({
      text: 'What is Zod?',
      media: { kind: 'image', assetId: 'images/a.png' },
    });
    expect(result.success).toBe(true);
  });

  it('rejects neither text nor media', () => {
    expect(clueContentSchema.safeParse({}).success).toBe(false);
  });

  it('rejects empty text', () => {
    expect(clueContentSchema.safeParse({ text: '' }).success).toBe(false);
  });
});
