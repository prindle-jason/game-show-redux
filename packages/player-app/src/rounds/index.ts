import type { ContestantRoomView, HostRoomView, RoundType } from '@gameshow/schema';
import type { ComponentType } from 'react';
import { FinalJeopardyBoard } from '../FinalJeopardyBoard.js';
import { JeopardyBoard } from '../JeopardyBoard.js';

export interface RoundBoardProps {
  view: HostRoomView | ContestantRoomView;
  playerId: string;
  isHost: boolean;
}

/**
 * Per-round-type board components, mirroring `party`'s roundModules registry —
 * adding Wheel of Fortune/Final Jeopardy is adding an entry, not touching
 * App.tsx. Each board narrows its own round state and renders nothing on a
 * mismatch; round types without an entry fall back to the raw-state dump.
 */
export const roundBoards: Partial<Record<RoundType, ComponentType<RoundBoardProps>>> = {
  jeopardy: JeopardyBoard,
  'final-jeopardy': FinalJeopardyBoard,
};
