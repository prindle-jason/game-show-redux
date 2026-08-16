import type { WheelPuzzleData, WheelWedge } from '@gameshow/schema';
import { wheelPuzzleDataSchema } from '@gameshow/schema';
import { create } from 'zustand';

const SOLUTION_ROWS = 4;

export interface WheelDraft {
  roundId: string;
  title: string;
  category: string;
  solution: string[];
  wedges: WheelWedge[];
  vowelCost: number;
  solveBonus: number;
}

/** A typical board: eight cash values at common increments, one bankrupt, one lose-a-turn. */
export const DEFAULT_WEDGES: WheelWedge[] = [
  { kind: 'cash', value: 300 },
  { kind: 'cash', value: 400 },
  { kind: 'cash', value: 500 },
  { kind: 'cash', value: 600 },
  { kind: 'cash', value: 700 },
  { kind: 'cash', value: 800 },
  { kind: 'cash', value: 900 },
  { kind: 'cash', value: 1000 },
  { kind: 'bankrupt' },
  { kind: 'lose-turn' },
];

function createDraft(): WheelDraft {
  return {
    roundId: crypto.randomUUID(),
    title: '',
    category: '',
    solution: Array.from({ length: SOLUTION_ROWS }, () => ''),
    wedges: [],
    vowelCost: 250,
    solveBonus: 0,
  };
}

function shuffled<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const a = result[i] as T;
    const b = result[j] as T;
    result[i] = b;
    result[j] = a;
  }
  return result;
}

interface WheelDraftStore {
  draft: WheelDraft;
  setTitle: (title: string) => void;
  setCategory: (category: string) => void;
  setSolutionRow: (index: number, value: string) => void;
  addWedge: (wedge: WheelWedge) => void;
  updateWedge: (index: number, wedge: WheelWedge) => void;
  removeWedge: (index: number) => void;
  applyDefaultWedges: () => void;
  shuffleWedges: () => void;
  setVowelCost: (value: number) => void;
  setSolveBonus: (value: number) => void;
}

export const useWheelDraftStore = create<WheelDraftStore>((set) => ({
  draft: createDraft(),
  setTitle: (title) => set((state) => ({ draft: { ...state.draft, title } })),
  setCategory: (category) => set((state) => ({ draft: { ...state.draft, category } })),
  setSolutionRow: (index, value) =>
    set((state) => {
      const solution = [...state.draft.solution];
      solution[index] = value;
      return { draft: { ...state.draft, solution } };
    }),
  addWedge: (wedge) =>
    set((state) => ({ draft: { ...state.draft, wedges: [...state.draft.wedges, wedge] } })),
  updateWedge: (index, wedge) =>
    set((state) => {
      const wedges = [...state.draft.wedges];
      wedges[index] = wedge;
      return { draft: { ...state.draft, wedges } };
    }),
  removeWedge: (index) =>
    set((state) => ({
      draft: { ...state.draft, wedges: state.draft.wedges.filter((_, i) => i !== index) },
    })),
  applyDefaultWedges: () =>
    set((state) => ({ draft: { ...state.draft, wedges: [...DEFAULT_WEDGES] } })),
  shuffleWedges: () =>
    set((state) => ({ draft: { ...state.draft, wedges: shuffled(state.draft.wedges) } })),
  setVowelCost: (value) => set((state) => ({ draft: { ...state.draft, vowelCost: value } })),
  setSolveBonus: (value) => set((state) => ({ draft: { ...state.draft, solveBonus: value } })),
}));

export interface WheelDraftValidation {
  valid: boolean;
  error?: string;
}

/**
 * Schema-driven validation only — no extra authoring rules beyond what
 * `wheelPuzzleDataSchema` already requires (non-empty category, at least one
 * wedge, positive vowel cost, non-negative solve bonus).
 */
export function validateWheelDraft(draft: WheelDraft): WheelDraftValidation {
  if (!draft.title.trim()) {
    return { valid: false, error: 'Title is required.' };
  }

  const data: WheelPuzzleData = {
    category: draft.category,
    solution: draft.solution,
    wedges: draft.wedges,
    vowelCost: draft.vowelCost,
    solveBonus: draft.solveBonus,
  };
  const result = wheelPuzzleDataSchema.safeParse(data);
  if (!result.success) {
    return { valid: false, error: result.error.issues[0]?.message ?? 'Invalid round.' };
  }
  return { valid: true };
}
