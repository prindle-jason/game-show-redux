import type {
  FinalJeopardyAction,
  FinalJeopardyData,
  FinalJeopardyState,
  JeopardyAction,
  JeopardyBoardData,
  JeopardyState,
  MediaRef,
  ResolvedMediaRef,
  RoundContestantView,
  RoundState,
  RoundType,
  WheelAction,
  WheelPuzzleData,
  WheelState,
} from '@gameshow/schema';
import type { ResolvedFinalJeopardyData } from './final-jeopardy.js';
import {
  createInitialFinalJeopardyState,
  isFinalJeopardyComplete,
  listFinalJeopardyMediaUrls,
  reduceFinalJeopardy,
  resolveFinalJeopardyMedia,
  toFinalJeopardyContestantView,
} from './final-jeopardy.js';
import type { ResolvedJeopardyBoardData } from './jeopardy.js';
import {
  createInitialJeopardyState,
  isJeopardyComplete,
  listJeopardyMediaUrls,
  reduceJeopardy,
  resolveJeopardyMedia,
  toJeopardyContestantView,
} from './jeopardy.js';
import type { ResolvedWheelPuzzleData, WheelActionContext } from './wheel-of-fortune.js';
import {
  createInitialWheelState,
  isWheelComplete,
  listWheelMediaUrls,
  reduceWheel,
  resolveWheelMedia,
  toWheelContestantView,
} from './wheel-of-fortune.js';

export interface RoundModuleContext {
  roundId: string;
  contestantIds: string[];
  /** Completed-queue-entry count when this round becomes active — 0 for the first round. */
  roundNumber: number;
}

export interface RoundActionContext {
  requesterId: string;
  isHost: boolean;
  players: { id: string; name: string; score: number }[];
  /**
   * Extra fields a module's `prepareActionContext` chose to inject before
   * dispatch (e.g. wheel-of-fortune's `spinResult`) — untyped here since
   * `RoundActionContext` is shared across every round type; each module casts
   * its own expected shape internally, same as `state`/`data`/`action`.
   */
  [key: string]: unknown;
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
  toContestantView(state: RoundState, data: unknown, viewerId: string): RoundContestantView;
  /** Rewrites every `MediaRef` in `data` to its resolved form via `resolve`. */
  resolveMedia(data: unknown, resolve: (ref: MediaRef) => ResolvedMediaRef): unknown;
  /** Every media URL in `resolvedData`, for the pre-round prefetch barrier. */
  listMediaUrls(resolvedData: unknown): string[];
  /**
   * Optional pre-dispatch hook for side effects `game-room.ts` (the DO,
   * where real randomness/IO is allowed) must perform before `reduce` runs —
   * e.g. wheel-of-fortune rolling a real wedge on a `spin` action. Returns
   * extra fields to merge into the `RoundActionContext` handed to `reduce`,
   * or `undefined` if this action needs nothing. Most modules don't define
   * this at all.
   */
  prepareActionContext?(
    state: RoundState,
    data: unknown,
    action: unknown,
  ): Record<string, unknown> | undefined;
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
  'final-jeopardy': {
    createInitialState: (_data, context) =>
      createInitialFinalJeopardyState(context.roundId, context.contestantIds),
    reduce: (state, data, action, context) =>
      reduceFinalJeopardy(
        state as FinalJeopardyState,
        data as FinalJeopardyData,
        action as FinalJeopardyAction,
        context,
      ),
    isComplete: (state) => isFinalJeopardyComplete(state as FinalJeopardyState),
    toContestantView: (state, data, viewerId) =>
      toFinalJeopardyContestantView(
        state as FinalJeopardyState,
        data as ResolvedFinalJeopardyData,
        viewerId,
      ),
    resolveMedia: (data, resolve) => resolveFinalJeopardyMedia(data as FinalJeopardyData, resolve),
    listMediaUrls: (resolvedData) =>
      listFinalJeopardyMediaUrls(resolvedData as ResolvedFinalJeopardyData),
  },
  'wheel-of-fortune': {
    createInitialState: (_data, context) =>
      createInitialWheelState(context.roundId, context.contestantIds, context.roundNumber),
    reduce: (state, data, action, context) =>
      reduceWheel(
        state as WheelState,
        data as WheelPuzzleData,
        action as WheelAction,
        context as WheelActionContext,
      ),
    isComplete: (state) => isWheelComplete(state as WheelState),
    toContestantView: (state, data, viewerId) =>
      toWheelContestantView(state as WheelState, data as ResolvedWheelPuzzleData, viewerId),
    resolveMedia: (data) => resolveWheelMedia(data as WheelPuzzleData),
    listMediaUrls: (resolvedData) => listWheelMediaUrls(resolvedData as ResolvedWheelPuzzleData),
    prepareActionContext: (_state, data, action) => {
      if ((action as WheelAction).type !== 'spin') return undefined;
      const wedges = (data as WheelPuzzleData).wedges;
      return { spinResult: wedges[Math.floor(Math.random() * wedges.length)] };
    },
  },
};
