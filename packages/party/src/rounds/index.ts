import type {
  JeopardyAction,
  JeopardyBoardData,
  JeopardyState,
  MediaRef,
  ResolvedMediaRef,
  RoundContestantView,
  RoundState,
  RoundType,
} from '@gameshow/schema';
import type { ResolvedJeopardyBoardData } from './jeopardy.js';
import {
  createInitialJeopardyState,
  isJeopardyComplete,
  listJeopardyMediaUrls,
  reduceJeopardy,
  resolveJeopardyMedia,
  toJeopardyContestantView,
} from './jeopardy.js';

export interface RoundModuleContext {
  roundId: string;
  contestantIds: string[];
}

export interface RoundActionContext {
  requesterId: string;
  isHost: boolean;
  contestantIds: string[];
}

export type RoundActionResult =
  | { ok: true; state: RoundState; scoreDeltas?: Record<string, number> }
  | { ok: false; error: string };

/**
 * Per-round-type behavior, registered here so `room-logic.ts`/`game-room.ts`
 * can dispatch without knowing which round types exist — adding Wheel of
 * Fortune/Final Jeopardy is adding an entry, not touching call sites.
 */
export interface RoundModule {
  createInitialState(data: unknown, context: RoundModuleContext): RoundState;
  reduce(
    state: RoundState,
    data: unknown,
    action: unknown,
    context: RoundActionContext,
  ): RoundActionResult;
  isComplete(state: RoundState, data: unknown): boolean;
  toContestantView(state: RoundState, data: unknown): RoundContestantView;
  /** Rewrites every `MediaRef` in `data` to its resolved form via `resolve`. */
  resolveMedia(data: unknown, resolve: (ref: MediaRef) => ResolvedMediaRef): unknown;
  /** Every media URL in `resolvedData`, for the pre-round prefetch barrier. */
  listMediaUrls(resolvedData: unknown): string[];
}

export const roundModules: Partial<Record<RoundType, RoundModule>> = {
  jeopardy: {
    createInitialState: (_data, context) =>
      createInitialJeopardyState(context.roundId, context.contestantIds),
    reduce: (state, data, action, context) =>
      reduceJeopardy(
        state as JeopardyState,
        data as JeopardyBoardData,
        action as JeopardyAction,
        context,
      ),
    isComplete: (state, data) =>
      isJeopardyComplete(state as JeopardyState, data as JeopardyBoardData),
    toContestantView: (state, data) =>
      toJeopardyContestantView(state as JeopardyState, data as ResolvedJeopardyBoardData),
    resolveMedia: (data, resolve) => resolveJeopardyMedia(data as JeopardyBoardData, resolve),
    listMediaUrls: (resolvedData) =>
      listJeopardyMediaUrls(resolvedData as ResolvedJeopardyBoardData),
  },
};
