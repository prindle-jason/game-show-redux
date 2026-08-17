import type { FinalJeopardyData, MediaRef } from '@gameshow/schema';
import { finalJeopardyDataSchema } from '@gameshow/schema';
import { create } from 'zustand';
import type { AssetTable } from './media-assets.js';

export interface FinalJeopardyDraft {
  roundId: string;
  title: string;
  category: string;
  clueText: string;
  clueMedia?: MediaRef;
  answerText: string;
  answerMedia?: MediaRef;
  assets: AssetTable;
}

function createDraft(): FinalJeopardyDraft {
  return {
    roundId: crypto.randomUUID(),
    title: '',
    category: '',
    clueText: '',
    answerText: '',
    assets: {},
  };
}

interface FinalJeopardyDraftStore {
  draft: FinalJeopardyDraft;
  setTitle: (title: string) => void;
  setCategory: (category: string) => void;
  setClueText: (text: string) => void;
  setClueMedia: (media: MediaRef | undefined) => void;
  setAnswerText: (text: string) => void;
  setAnswerMedia: (media: MediaRef | undefined) => void;
  attachAsset: (file: File) => string;
}

export const useFinalJeopardyDraftStore = create<FinalJeopardyDraftStore>((set) => ({
  draft: createDraft(),
  setTitle: (title) => set((state) => ({ draft: { ...state.draft, title } })),
  setCategory: (category) => set((state) => ({ draft: { ...state.draft, category } })),
  setClueText: (text) => set((state) => ({ draft: { ...state.draft, clueText: text } })),
  setClueMedia: (media) => set((state) => ({ draft: { ...state.draft, clueMedia: media } })),
  setAnswerText: (text) => set((state) => ({ draft: { ...state.draft, answerText: text } })),
  setAnswerMedia: (media) => set((state) => ({ draft: { ...state.draft, answerMedia: media } })),
  attachAsset: (file) => {
    const assetId = crypto.randomUUID();
    set((state) => ({
      draft: { ...state.draft, assets: { ...state.draft.assets, [assetId]: file } },
    }));
    return assetId;
  },
}));

/** Maps a draft's flat text fields to `ClueContent`'s `text?`/`media?` shape — an empty string becomes `undefined` so `clueContentSchema`'s `.min(1).optional()` doesn't reject it. */
export function finalJeopardyDraftToData(draft: FinalJeopardyDraft): FinalJeopardyData {
  return {
    category: draft.category,
    clue: { text: draft.clueText.trim() ? draft.clueText : undefined, media: draft.clueMedia },
    answer: {
      text: draft.answerText.trim() ? draft.answerText : undefined,
      media: draft.answerMedia,
    },
  };
}

export interface FinalJeopardyDraftValidation {
  valid: boolean;
  error?: string;
}

/**
 * Schema-driven validation only — no extra authoring rules beyond what
 * `finalJeopardyDataSchema` already requires (non-empty category, and each of
 * clue/answer needs at least one of text or media).
 */
export function validateFinalJeopardyDraft(
  draft: FinalJeopardyDraft,
): FinalJeopardyDraftValidation {
  if (!draft.title.trim()) {
    return { valid: false, error: 'Title is required.' };
  }

  const result = finalJeopardyDataSchema.safeParse(finalJeopardyDraftToData(draft));
  if (!result.success) {
    return { valid: false, error: result.error.issues[0]?.message ?? 'Invalid round.' };
  }
  return { valid: true };
}
