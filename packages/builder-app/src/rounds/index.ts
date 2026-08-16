import type { RoundType } from '@gameshow/schema';
import type { ComponentType } from 'react';
import { WheelEditor } from '../WheelEditor.js';

export interface RoundEditorEntry {
  type: RoundType;
  label: string;
  description: string;
  path: string;
  component?: ComponentType;
}

/**
 * Adding an editor for a new round type means filling in `component` on its
 * entry here — the picker and router both derive from this registry, so
 * neither needs to change.
 */
export const roundEditors: Record<RoundType, RoundEditorEntry> = {
  'wheel-of-fortune': {
    type: 'wheel-of-fortune',
    label: 'Wheel of Fortune',
    description: 'Spin-the-wheel word puzzle round.',
    path: '/wheel-of-fortune',
    component: WheelEditor,
  },
  jeopardy: {
    type: 'jeopardy',
    label: 'Jeopardy',
    description: 'Category/clue board round.',
    path: '/jeopardy',
  },
  'final-jeopardy': {
    type: 'final-jeopardy',
    label: 'Final Jeopardy',
    description: 'Single wagered clue round.',
    path: '/final-jeopardy',
  },
};
