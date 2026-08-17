import type { JeopardyBoardData, MediaRef } from '@gameshow/schema';
import { jeopardyBoardDataSchema } from '@gameshow/schema';
import { create } from 'zustand';
import type { AssetTable } from './media-assets.js';

export interface JeopardyClueDraft {
  value: number;
  clueText: string;
  clueMedia?: MediaRef;
  answerText: string;
  answerMedia?: MediaRef;
  isDailyDouble: boolean;
}

export interface JeopardyCategoryDraft {
  name: string;
  clues: JeopardyClueDraft[];
}

export interface JeopardyDraft {
  roundId: string;
  title: string;
  categories: JeopardyCategoryDraft[];
  assets: AssetTable;
}

function createEmptyClue(value: number): JeopardyClueDraft {
  return { value, clueText: '', answerText: '', isDailyDouble: false };
}

function createDraft(): JeopardyDraft {
  return {
    roundId: crypto.randomUUID(),
    title: '',
    categories: [],
    assets: {},
  };
}

function mapClue(
  categories: JeopardyCategoryDraft[],
  categoryIndex: number,
  clueIndex: number,
  update: (clue: JeopardyClueDraft) => JeopardyClueDraft,
): JeopardyCategoryDraft[] {
  return categories.map((category, ci) => {
    if (ci !== categoryIndex) return category;
    return {
      ...category,
      clues: category.clues.map((clue, cli) => (cli === clueIndex ? update(clue) : clue)),
    };
  });
}

interface JeopardyDraftStore {
  draft: JeopardyDraft;
  setTitle: (title: string) => void;
  addCategory: () => void;
  removeCategory: (categoryIndex: number) => void;
  setCategoryName: (categoryIndex: number, name: string) => void;
  addClue: (categoryIndex: number) => void;
  removeClue: (categoryIndex: number, clueIndex: number) => void;
  setClueValue: (categoryIndex: number, clueIndex: number, value: number) => void;
  setClueText: (categoryIndex: number, clueIndex: number, text: string) => void;
  setClueMedia: (categoryIndex: number, clueIndex: number, media: MediaRef | undefined) => void;
  setAnswerText: (categoryIndex: number, clueIndex: number, text: string) => void;
  setAnswerMedia: (categoryIndex: number, clueIndex: number, media: MediaRef | undefined) => void;
  toggleDailyDouble: (categoryIndex: number, clueIndex: number) => void;
  applyDefaultBoard: () => void;
  attachAsset: (file: File) => string;
}

export const useJeopardyDraftStore = create<JeopardyDraftStore>((set) => ({
  draft: createDraft(),
  setTitle: (title) => set((state) => ({ draft: { ...state.draft, title } })),
  addCategory: () =>
    set((state) => ({
      draft: {
        ...state.draft,
        categories: [...state.draft.categories, { name: '', clues: [] }],
      },
    })),
  removeCategory: (categoryIndex) =>
    set((state) => ({
      draft: {
        ...state.draft,
        categories: state.draft.categories.filter((_, ci) => ci !== categoryIndex),
      },
    })),
  setCategoryName: (categoryIndex, name) =>
    set((state) => ({
      draft: {
        ...state.draft,
        categories: state.draft.categories.map((category, ci) =>
          ci === categoryIndex ? { ...category, name } : category,
        ),
      },
    })),
  addClue: (categoryIndex) =>
    set((state) => ({
      draft: {
        ...state.draft,
        categories: state.draft.categories.map((category, ci) => {
          if (ci !== categoryIndex) return category;
          const value = (category.clues.length + 1) * 200;
          return { ...category, clues: [...category.clues, createEmptyClue(value)] };
        }),
      },
    })),
  removeClue: (categoryIndex, clueIndex) =>
    set((state) => ({
      draft: {
        ...state.draft,
        categories: state.draft.categories.map((category, ci) =>
          ci === categoryIndex
            ? { ...category, clues: category.clues.filter((_, cli) => cli !== clueIndex) }
            : category,
        ),
      },
    })),
  setClueValue: (categoryIndex, clueIndex, value) =>
    set((state) => ({
      draft: {
        ...state.draft,
        categories: mapClue(state.draft.categories, categoryIndex, clueIndex, (clue) => ({
          ...clue,
          value,
        })),
      },
    })),
  setClueText: (categoryIndex, clueIndex, text) =>
    set((state) => ({
      draft: {
        ...state.draft,
        categories: mapClue(state.draft.categories, categoryIndex, clueIndex, (clue) => ({
          ...clue,
          clueText: text,
        })),
      },
    })),
  setClueMedia: (categoryIndex, clueIndex, media) =>
    set((state) => ({
      draft: {
        ...state.draft,
        categories: mapClue(state.draft.categories, categoryIndex, clueIndex, (clue) => ({
          ...clue,
          clueMedia: media,
        })),
      },
    })),
  setAnswerText: (categoryIndex, clueIndex, text) =>
    set((state) => ({
      draft: {
        ...state.draft,
        categories: mapClue(state.draft.categories, categoryIndex, clueIndex, (clue) => ({
          ...clue,
          answerText: text,
        })),
      },
    })),
  setAnswerMedia: (categoryIndex, clueIndex, media) =>
    set((state) => ({
      draft: {
        ...state.draft,
        categories: mapClue(state.draft.categories, categoryIndex, clueIndex, (clue) => ({
          ...clue,
          answerMedia: media,
        })),
      },
    })),
  toggleDailyDouble: (categoryIndex, clueIndex) =>
    set((state) => ({
      draft: {
        ...state.draft,
        categories: mapClue(state.draft.categories, categoryIndex, clueIndex, (clue) => ({
          ...clue,
          isDailyDouble: !clue.isDailyDouble,
        })),
      },
    })),
  applyDefaultBoard: () =>
    set((state) => ({
      draft: {
        ...state.draft,
        categories: Array.from({ length: 6 }, () => ({
          name: '',
          clues: [200, 400, 600, 800, 1000].map((value) => createEmptyClue(value)),
        })),
      },
    })),
  attachAsset: (file) => {
    const assetId = crypto.randomUUID();
    set((state) => ({
      draft: { ...state.draft, assets: { ...state.draft.assets, [assetId]: file } },
    }));
    return assetId;
  },
}));

/** Maps a draft's flat per-clue text fields to `ClueContent`'s `text?`/`media?` shape — an empty string becomes `undefined` so `clueContentSchema`'s `.min(1).optional()` doesn't reject it. */
export function jeopardyDraftToBoardData(draft: JeopardyDraft): JeopardyBoardData {
  return {
    categories: draft.categories.map((category) => ({
      name: category.name,
      clues: category.clues.map((clue) => ({
        value: clue.value,
        clue: { text: clue.clueText.trim() ? clue.clueText : undefined, media: clue.clueMedia },
        answer: {
          text: clue.answerText.trim() ? clue.answerText : undefined,
          media: clue.answerMedia,
        },
        isDailyDouble: clue.isDailyDouble || undefined,
      })),
    })),
  };
}

export interface JeopardyDraftValidation {
  valid: boolean;
  error?: string;
}

/**
 * Schema-driven validation only — no extra authoring rules beyond what
 * `jeopardyBoardDataSchema` already requires (at least one category, each
 * with at least one clue; positive clue values; clue/answer needing at
 * least one of text or media). Daily Double is just the checkbox value,
 * unconstrained.
 */
export function validateJeopardyDraft(draft: JeopardyDraft): JeopardyDraftValidation {
  if (!draft.title.trim()) {
    return { valid: false, error: 'Title is required.' };
  }

  const result = jeopardyBoardDataSchema.safeParse(jeopardyDraftToBoardData(draft));
  if (!result.success) {
    return { valid: false, error: result.error.issues[0]?.message ?? 'Invalid round.' };
  }
  return { valid: true };
}
