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

export type QueueEntryStatus = 'pending' | 'active' | 'completed';

/**
 * One round the host has added to the room's queue. `round` is the full
 * authored artifact — contestants only ever see a filtered projection of
 * this (status/count), never `round.data`, until it becomes `active`.
 */
export interface QueueEntry {
  queueEntryId: string;
  round: Round;
  status: QueueEntryStatus;
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
}

/** What the host receives: the full, unfiltered room state. */
export type HostRoomView = RoomState;

/** A queue entry as seen by contestants — status/count only, never the round's content. */
export interface QueueEntryView {
  queueEntryId: string;
  status: QueueEntryStatus;
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
}
