import type { Round, RoundContestantView, RoundState } from './round.js';

/**
 * Plain TS types, not zod — `party` fully owns and constructs this shape
 * internally, it never crosses the wire as untrusted input (see message.ts
 * for the schemas that do).
 */
export type RoomPhase = 'lobby' | 'playing' | 'ended';

export interface Player {
  id: string;
  name: string;
  score: number;
  connected: boolean;
}

export type QueueEntryStatus = 'pending' | 'loading' | 'active' | 'completed';

/**
 * One round the host has added to the room's queue. `round` is the full
 * authored artifact — contestants only ever see a filtered projection of
 * this (status/count), never `round.data`, until it becomes `active`.
 * `resolvedData` is `round.data` with every `MediaRef` rewritten to a
 * fetchable URL (see media.ts) — computed once when the round is added, and
 * what every display path reads instead of `round.data`'s raw `assetId`s.
 */
export interface QueueEntry {
  queueEntryId: string;
  round: Round;
  status: QueueEntryStatus;
  resolvedData: unknown;
}

export interface RoomState {
  phase: RoomPhase;
  hostId: string;
  players: Player[];
  queue: QueueEntry[];
  /**
   * Runtime state for whichever queue entry is `active`, shaped by that
   * round type's own state (see round.ts's `RoundState`) — `null` when
   * `phase` isn't `'playing'`.
   */
  activeRoundState: RoundState | null;
  /**
   * True once the active round's own completion rule is satisfied (e.g. every
   * Jeopardy clue revealed). Advancing stays a host action — this only signals
   * that nothing is left to play.
   */
  roundComplete: boolean;
  /**
   * Player ids who've reported their media prefetch is done for whichever
   * queue entry is currently `'loading'` — reset to `[]` whenever a new entry
   * enters `'loading'`. Once every *connected* player is in this list, the
   * entry flips to `'active'`.
   */
  mediaReadyPlayerIds: string[];
}

/** What the host receives: the full, unfiltered room state. */
export type HostRoomView = RoomState;

/** A queue entry as seen by contestants — status/count only, never the round's content. */
export interface QueueEntryView {
  queueEntryId: string;
  status: QueueEntryStatus;
  /**
   * Every media URL in the round, present only while this entry is
   * `'loading'`/`'active'` — lets clients prefetch the whole round (not just
   * revealed clues) before/while it plays. Accepted early-exposure trade-off,
   * see future-enhancements.md; never includes clue/answer text.
   */
  mediaUrls?: string[];
}

/**
 * What contestants receive: no `round`/`hostId`, and `activeRoundState` is
 * whatever that round type's own contestant view produces (see round.ts's
 * `RoundContestantView`) — `null` when `phase` isn't `'playing'`.
 */
export interface ContestantRoomView {
  phase: RoomPhase;
  players: Player[];
  queue: QueueEntryView[];
  activeRoundState: RoundContestantView | null;
  roundComplete: boolean;
}
