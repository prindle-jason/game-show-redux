import { beforeEach, describe, expect, it } from 'vitest';
import {
  type JeopardyDraft,
  jeopardyDraftToBoardData,
  useJeopardyDraftStore,
  validateJeopardyDraft,
} from './jeopardy-draft-store.js';

function firstClue(draft: JeopardyDraft) {
  const clue = draft.categories[0]?.clues[0];
  if (!clue) throw new Error('expected a clue at categories[0].clues[0]');
  return clue;
}

function baseDraft(): JeopardyDraft {
  return {
    roundId: 'round-1',
    title: 'Trivia Night',
    categories: [
      {
        name: 'Science',
        clues: [
          { value: 200, clueText: 'H2O', answerText: 'What is water?', isDailyDouble: false },
        ],
      },
    ],
    assets: {},
  };
}

describe('validateJeopardyDraft', () => {
  it('accepts a fully-filled draft', () => {
    expect(validateJeopardyDraft(baseDraft())).toEqual({ valid: true });
  });

  it('rejects a missing title', () => {
    const result = validateJeopardyDraft({ ...baseDraft(), title: '' });
    expect(result.valid).toBe(false);
  });

  it('rejects a draft with no categories', () => {
    const result = validateJeopardyDraft({ ...baseDraft(), categories: [] });
    expect(result.valid).toBe(false);
  });

  it('rejects a category with no clues', () => {
    const draft = baseDraft();
    draft.categories[0] = { name: 'Science', clues: [] };
    expect(validateJeopardyDraft(draft).valid).toBe(false);
  });

  it('rejects a non-positive clue value', () => {
    const draft = baseDraft();
    firstClue(draft).value = 0;
    expect(validateJeopardyDraft(draft).valid).toBe(false);
  });

  it('rejects a clue with neither text nor media', () => {
    const draft = baseDraft();
    firstClue(draft).clueText = '';
    expect(validateJeopardyDraft(draft).valid).toBe(false);
  });

  it('accepts a clue with media but no text', () => {
    const draft = baseDraft();
    firstClue(draft).clueText = '';
    firstClue(draft).clueMedia = { kind: 'image', assetId: 'a1' };
    expect(validateJeopardyDraft(draft).valid).toBe(true);
  });
});

describe('jeopardyDraftToBoardData', () => {
  it('omits isDailyDouble when false', () => {
    const data = jeopardyDraftToBoardData(baseDraft());
    expect(data.categories[0]?.clues[0]?.isDailyDouble).toBeUndefined();
  });

  it('sets isDailyDouble true when the draft flags it', () => {
    const draft = baseDraft();
    firstClue(draft).isDailyDouble = true;
    const data = jeopardyDraftToBoardData(draft);
    expect(data.categories[0]?.clues[0]?.isDailyDouble).toBe(true);
  });
});

describe('useJeopardyDraftStore', () => {
  beforeEach(() => {
    useJeopardyDraftStore.setState({
      draft: { roundId: 'r', title: '', categories: [], assets: {} },
    });
  });

  it('addCategory appends an empty category', () => {
    useJeopardyDraftStore.getState().addCategory();
    expect(useJeopardyDraftStore.getState().draft.categories).toEqual([{ name: '', clues: [] }]);
  });

  it('removeCategory removes only the targeted category', () => {
    useJeopardyDraftStore.getState().addCategory();
    useJeopardyDraftStore.getState().addCategory();
    useJeopardyDraftStore.getState().setCategoryName(0, 'Science');
    useJeopardyDraftStore.getState().setCategoryName(1, 'History');
    useJeopardyDraftStore.getState().removeCategory(0);
    expect(useJeopardyDraftStore.getState().draft.categories).toEqual([
      { name: 'History', clues: [] },
    ]);
  });

  it('addClue appends a clue with an incrementing default value', () => {
    useJeopardyDraftStore.getState().addCategory();
    useJeopardyDraftStore.getState().addClue(0);
    useJeopardyDraftStore.getState().addClue(0);
    const clues = useJeopardyDraftStore.getState().draft.categories[0]?.clues;
    expect(clues?.map((c) => c.value)).toEqual([200, 400]);
  });

  it('removeClue removes only the targeted clue', () => {
    useJeopardyDraftStore.getState().addCategory();
    useJeopardyDraftStore.getState().addClue(0);
    useJeopardyDraftStore.getState().addClue(0);
    useJeopardyDraftStore.getState().removeClue(0, 0);
    const clues = useJeopardyDraftStore.getState().draft.categories[0]?.clues;
    expect(clues?.map((c) => c.value)).toEqual([400]);
  });

  it('toggleDailyDouble flips only the targeted clue', () => {
    useJeopardyDraftStore.getState().addCategory();
    useJeopardyDraftStore.getState().addClue(0);
    useJeopardyDraftStore.getState().addClue(0);
    useJeopardyDraftStore.getState().toggleDailyDouble(0, 1);
    const clues = useJeopardyDraftStore.getState().draft.categories[0]?.clues;
    expect(clues?.map((c) => c.isDailyDouble)).toEqual([false, true]);
  });

  it('applyDefaultBoard seeds 6 categories of 5 clues with standard values', () => {
    useJeopardyDraftStore.getState().applyDefaultBoard();
    const categories = useJeopardyDraftStore.getState().draft.categories;
    expect(categories).toHaveLength(6);
    for (const category of categories) {
      expect(category.clues.map((c) => c.value)).toEqual([200, 400, 600, 800, 1000]);
    }
  });

  it('attachAsset stores the file and returns a usable assetId', () => {
    const file = new File([new Uint8Array([1])], 'a.png', { type: 'image/png' });
    const assetId = useJeopardyDraftStore.getState().attachAsset(file);
    expect(useJeopardyDraftStore.getState().draft.assets[assetId]).toBe(file);
  });
});
