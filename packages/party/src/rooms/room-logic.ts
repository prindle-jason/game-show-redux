import type {
  ContestantRoomView,
  MediaRef,
  Player,
  QueueEntry,
  ResolvedMediaRef,
  RoomState,
  Round,
} from '@gameshow/schema';
import { roundModules } from '../rounds/index.js';

function contestantIds(state: RoomState): string[] {
  return state.players.filter((player) => player.id !== state.hostId).map((player) => player.id);
}

function activeRoundStateFor(state: RoomState, entry: QueueEntry) {
  const module = roundModules[entry.round.type];
  if (!module) return null;
  const roundNumber = state.queue.filter((e) => e.status === 'completed').length;
  return module.createInitialState(entry.round.data, {
    roundId: entry.round.roundId,
    contestantIds: contestantIds(state),
    roundNumber,
  });
}

/** No media to wait on means nothing to gate — go straight to `'active'`. */
function statusForEntry(entry: QueueEntry): 'loading' | 'active' {
  const module = roundModules[entry.round.type];
  const mediaUrls = module?.listMediaUrls(entry.resolvedData) ?? [];
  return mediaUrls.length > 0 ? 'loading' : 'active';
}

/** Flips the `'loading'` entry at `loadingIndex` to `'active'` once every connected player is ready. */
function activateIfReady(
  state: RoomState,
  loadingIndex: number,
  mediaReadyPlayerIds: string[],
): RoomState {
  const connectedIds = state.players
    .filter((player) => player.connected)
    .map((player) => player.id);
  const allReady = connectedIds.every((id) => mediaReadyPlayerIds.includes(id));
  if (!allReady) return { ...state, mediaReadyPlayerIds };

  const queue = state.queue.map((entry, index) =>
    index === loadingIndex ? { ...entry, status: 'active' as const } : entry,
  );
  return { ...state, mediaReadyPlayerIds, queue };
}

export function applyScoreDeltas(
  players: Player[],
  deltas: Record<string, number> | undefined,
): Player[] {
  if (!deltas) return players;
  return players.map((player) => {
    const delta = deltas[player.id];
    return delta ? { ...player, score: player.score + delta } : player;
  });
}

export function createInitialRoomState(): RoomState {
  return {
    phase: 'lobby',
    hostId: '',
    players: [],
    queue: [],
    activeRoundState: null,
    roundComplete: false,
    mediaReadyPlayerIds: [],
  };
}

/**
 * Reconnect-by-session-token: `reconnectPlayerId` is resolved by the caller
 * (`game-room.ts`, which alone knows the room's session-token map) from a
 * token the client presented, never from `name` — a display name carries no
 * identity, so two players can share one without colliding. `claimsHost` is
 * likewise decided by the caller (which alone knows the room's host-claim
 * token) — this stays a pure state transition with no policy of its own
 * about who's allowed to host or reconnect.
 */
export function applyJoin(
  state: RoomState,
  name: string,
  claimsHost: boolean,
  reconnectPlayerId: string | null,
): { state: RoomState; playerId: string } {
  const existing = reconnectPlayerId
    ? state.players.find((player) => player.id === reconnectPlayerId)
    : undefined;
  if (existing) {
    return {
      state: {
        ...state,
        players: state.players.map((player) =>
          player.id === existing.id ? { ...player, connected: true, name } : player,
        ),
      },
      playerId: existing.id,
    };
  }

  const player: Player = {
    id: crypto.randomUUID(),
    name,
    score: 0,
    connected: true,
  };
  return {
    state: {
      ...state,
      hostId: claimsHost ? player.id : state.hostId,
      players: [...state.players, player],
    },
    playerId: player.id,
  };
}

export function applyDisconnect(state: RoomState, playerId: string): RoomState {
  const next = {
    ...state,
    players: state.players.map((player) =>
      player.id === playerId ? { ...player, connected: false } : player,
    ),
  };

  const loadingIndex = next.queue.findIndex((entry) => entry.status === 'loading');
  if (loadingIndex === -1) return next;
  return activateIfReady(next, loadingIndex, next.mediaReadyPlayerIds);
}

export type ActionResult = { ok: true; state: RoomState } | { ok: false; error: string };

function requireHost(state: RoomState, requesterId: string): string | null {
  if (requesterId !== state.hostId) {
    return 'Only the host can do that';
  }
  return null;
}

export function addRoundToQueue(
  state: RoomState,
  round: Round,
  requesterId: string,
  resolveMediaRef: (ref: MediaRef) => ResolvedMediaRef,
): ActionResult {
  const hostError = requireHost(state, requesterId);
  if (hostError) return { ok: false, error: hostError };
  if (state.phase !== 'lobby')
    return { ok: false, error: 'The queue can only be edited in the lobby' };

  const module = roundModules[round.type];
  const resolvedData = module ? module.resolveMedia(round.data, resolveMediaRef) : round.data;

  const entry: QueueEntry = {
    queueEntryId: crypto.randomUUID(),
    round,
    status: 'pending',
    resolvedData,
  };
  return { ok: true, state: { ...state, queue: [...state.queue, entry] } };
}

export function removeFromQueue(
  state: RoomState,
  queueEntryId: string,
  requesterId: string,
): ActionResult {
  const hostError = requireHost(state, requesterId);
  if (hostError) return { ok: false, error: hostError };
  if (state.phase !== 'lobby')
    return { ok: false, error: 'The queue can only be edited in the lobby' };

  return {
    ok: true,
    state: {
      ...state,
      queue: state.queue.filter((entry) => entry.queueEntryId !== queueEntryId),
    },
  };
}

export function reorderQueue(
  state: RoomState,
  queueEntryIds: string[],
  requesterId: string,
): ActionResult {
  const hostError = requireHost(state, requesterId);
  if (hostError) return { ok: false, error: hostError };
  if (state.phase !== 'lobby')
    return { ok: false, error: 'The queue can only be edited in the lobby' };

  const currentIds = new Set(state.queue.map((entry) => entry.queueEntryId));
  const nextIds = new Set(queueEntryIds);
  const isSameSet =
    currentIds.size === nextIds.size && [...currentIds].every((id) => nextIds.has(id));
  if (!isSameSet) {
    return {
      ok: false,
      error: 'reorder-queue must include exactly the current queue entries',
    };
  }

  const entryById = new Map(state.queue.map((entry) => [entry.queueEntryId, entry]));
  const queue = queueEntryIds.map((id) => {
    const entry = entryById.get(id);
    if (!entry) throw new Error('unreachable: id set was already validated');
    return entry;
  });
  return { ok: true, state: { ...state, queue } };
}

export function startGame(state: RoomState, requesterId: string): ActionResult {
  const hostError = requireHost(state, requesterId);
  if (hostError) return { ok: false, error: hostError };
  if (state.phase !== 'lobby') return { ok: false, error: 'The game has already started' };
  if (state.queue.length === 0)
    return { ok: false, error: 'Add at least one round before starting' };

  const firstEntry = state.queue[0];
  const status = firstEntry ? statusForEntry(firstEntry) : 'active';
  const queue = state.queue.map((entry, index) => (index === 0 ? { ...entry, status } : entry));
  return {
    ok: true,
    state: {
      ...state,
      phase: 'playing',
      queue,
      activeRoundState: firstEntry ? activeRoundStateFor(state, firstEntry) : null,
      roundComplete: false,
      mediaReadyPlayerIds: [],
    },
  };
}

export function advanceQueue(state: RoomState, requesterId: string): ActionResult {
  const hostError = requireHost(state, requesterId);
  if (hostError) return { ok: false, error: hostError };
  if (state.phase !== 'playing') return { ok: false, error: 'The game is not in progress' };

  const activeIndex = state.queue.findIndex((entry) => entry.status === 'active');
  if (activeIndex === -1) return { ok: false, error: 'No active round to advance from' };

  const nextIndex = activeIndex + 1;
  const hasNext = nextIndex < state.queue.length;
  const nextEntry = state.queue[nextIndex];
  const nextStatus = hasNext && nextEntry ? statusForEntry(nextEntry) : undefined;
  const queue = state.queue.map((entry, index) => {
    if (index === activeIndex) return { ...entry, status: 'completed' as const };
    if (hasNext && index === nextIndex && nextStatus) return { ...entry, status: nextStatus };
    return entry;
  });

  return {
    ok: true,
    state: {
      ...state,
      phase: hasNext ? 'playing' : 'ended',
      queue,
      activeRoundState: hasNext && nextEntry ? activeRoundStateFor(state, nextEntry) : null,
      roundComplete: false,
      mediaReadyPlayerIds: [],
    },
  };
}

/** A player has finished prefetching the loading entry's media; may flip it to `'active'`. */
export function applyMediaReady(state: RoomState, playerId: string): RoomState {
  const loadingIndex = state.queue.findIndex((entry) => entry.status === 'loading');
  if (loadingIndex === -1) return state;

  const mediaReadyPlayerIds = state.mediaReadyPlayerIds.includes(playerId)
    ? state.mediaReadyPlayerIds
    : [...state.mediaReadyPlayerIds, playerId];

  return activateIfReady(state, loadingIndex, mediaReadyPlayerIds);
}

/** Host override: skip waiting on the rest of the room and reveal the loading entry now. */
export function revealMediaAnyway(state: RoomState, requesterId: string): ActionResult {
  const hostError = requireHost(state, requesterId);
  if (hostError) return { ok: false, error: hostError };

  const loadingIndex = state.queue.findIndex((entry) => entry.status === 'loading');
  if (loadingIndex === -1) return { ok: false, error: 'No round is waiting on media' };

  const queue = state.queue.map((entry, index) =>
    index === loadingIndex ? { ...entry, status: 'active' as const } : entry,
  );
  return { ok: true, state: { ...state, queue } };
}

export function returnToLobby(state: RoomState, requesterId: string): ActionResult {
  const hostError = requireHost(state, requesterId);
  if (hostError) return { ok: false, error: hostError };
  if (state.phase !== 'ended') return { ok: false, error: 'The game has not ended yet' };

  return { ok: true, state: { ...state, phase: 'lobby', queue: [] } };
}

export function resetScores(state: RoomState, requesterId: string): ActionResult {
  const hostError = requireHost(state, requesterId);
  if (hostError) return { ok: false, error: hostError };
  if (state.phase !== 'lobby') return { ok: false, error: 'Scores can only be reset in the lobby' };

  return {
    ok: true,
    state: {
      ...state,
      players: state.players.map((player) => ({ ...player, score: 0 })),
    },
  };
}

export function kickPlayer(state: RoomState, playerId: string, requesterId: string): ActionResult {
  const hostError = requireHost(state, requesterId);
  if (hostError) return { ok: false, error: hostError };
  if (state.phase !== 'lobby')
    return { ok: false, error: 'Players can only be kicked in the lobby' };
  if (playerId === state.hostId) return { ok: false, error: "The host can't be kicked" };
  if (!state.players.some((player) => player.id === playerId)) {
    return { ok: false, error: 'No such player' };
  }

  return {
    ok: true,
    state: {
      ...state,
      players: state.players.filter((player) => player.id !== playerId),
    },
  };
}

export function makeHost(
  state: RoomState,
  targetPlayerId: string,
  requesterId: string,
): ActionResult {
  const hostError = requireHost(state, requesterId);
  if (hostError) return { ok: false, error: hostError };
  if (state.phase !== 'lobby')
    return { ok: false, error: 'Host can only be reassigned in the lobby' };
  if (targetPlayerId === state.hostId) return { ok: false, error: 'That player is already host' };
  if (!state.players.some((player) => player.id === targetPlayerId)) {
    return { ok: false, error: 'No such player' };
  }

  return { ok: true, state: { ...state, hostId: targetPlayerId } };
}

/** Filters `activeRoundState` through the active round's own contestant-view function, if any. */
export function toContestantView(state: RoomState, viewerId: string): ContestantRoomView {
  const activeEntry = state.queue.find((entry) => entry.status === 'active');
  const module = activeEntry ? roundModules[activeEntry.round.type] : undefined;
  const activeRoundState =
    activeEntry && module && state.activeRoundState
      ? module.toContestantView(state.activeRoundState, activeEntry.resolvedData, viewerId)
      : null;

  return {
    phase: state.phase,
    hostId: state.hostId,
    players: state.players,
    queue: state.queue.map((entry) => ({
      queueEntryId: entry.queueEntryId,
      status: entry.status,
      mediaUrls:
        entry.status === 'loading' || entry.status === 'active'
          ? (roundModules[entry.round.type]?.listMediaUrls(entry.resolvedData) ?? [])
          : undefined,
    })),
    activeRoundState,
    roundComplete: state.roundComplete,
  };
}
