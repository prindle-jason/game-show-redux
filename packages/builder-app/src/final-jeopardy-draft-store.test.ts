import { describe, expect, it } from 'vitest';
import {
  type FinalJeopardyDraft,
  validateFinalJeopardyDraft,
} from './final-jeopardy-draft-store.js';

const VALID_DRAFT: FinalJeopardyDraft = {
  roundId: 'round-1',
  title: 'World Capitals',
  category: 'Geography',
  clueText: 'This African capital sits highest',
  answerText: 'What is Addis Ababa?',
  assets: {},
};

describe('validateFinalJeopardyDraft', () => {
  it('accepts a fully-filled-in draft', () => {
    expect(validateFinalJeopardyDraft(VALID_DRAFT)).toEqual({ valid: true });
  });

  it('rejects a missing title', () => {
    expect(validateFinalJeopardyDraft({ ...VALID_DRAFT, title: '' }).valid).toBe(false);
  });

  it('rejects a missing category', () => {
    expect(validateFinalJeopardyDraft({ ...VALID_DRAFT, category: '' }).valid).toBe(false);
  });

  it('rejects a clue with neither text nor media', () => {
    expect(validateFinalJeopardyDraft({ ...VALID_DRAFT, clueText: '' }).valid).toBe(false);
  });

  it('rejects an answer with neither text nor media', () => {
    expect(validateFinalJeopardyDraft({ ...VALID_DRAFT, answerText: '' }).valid).toBe(false);
  });

  it('accepts a clue with media but no text', () => {
    const draft: FinalJeopardyDraft = {
      ...VALID_DRAFT,
      clueText: '',
      clueMedia: { kind: 'image', assetId: 'asset-1' },
    };
    expect(validateFinalJeopardyDraft(draft)).toEqual({ valid: true });
  });
});
