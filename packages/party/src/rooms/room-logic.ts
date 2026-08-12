import type { ContestantRoomView, Player, QueueEntry, RoomState, Round } from '@gameshow/schema';

export function createInitialRoomState(): RoomState {
  return {
    phase: 'lobby',
    hostId: '',
    players: [],
    queue: [],
    activeRoundState: null,
  };
}

/** Reconnect-by-name: a name that matches an existing player reuses that player's id/score. */
export function applyJoin(state: RoomState, name: string): { state: RoomState; playerId: string } {
  const existing = state.players.find((player) => player.name === name);
  if (existing) {
    return {
      state: {
        ...state,
        players: state.players.map((player) =>
          player.id === existing.id ? { ...player, connected: true } : player,
        ),
      },
      playerId: existing.id,
    };
  }

  const isFirstPlayer = state.players.length === 0;
  const player: Player = {
    id: crypto.randomUUID(),
    name,
    score: 0,
    connected: true,
  };
  return {
    state: {
      ...state,
      hostId: isFirstPlayer ? player.id : state.hostId,
      players: [...state.players, player],
    },
    playerId: player.id,
  };
}

export function applyDisconnect(state: RoomState, playerId: string): RoomState {
  return {
    ...state,
    players: state.players.map((player) =>
      player.id === playerId ? { ...player, connected: false } : player,
    ),
  };
}

export type ActionResult = { ok: true; state: RoomState } | { ok: false; error: string };

function requireHost(state: RoomState, requesterId: string): string | null {
  if (requesterId !== state.hostId) {
    return 'Only the host can do that';
  }
  return null;
}

export function addRoundToQueue(state: RoomState, round: Round, requesterId: string): ActionResult {
  const hostError = requireHost(state, requesterId);
  if (hostError) return { ok: false, error: hostError };
  if (state.phase !== 'lobby')
    return { ok: false, error: 'The queue can only be edited in the lobby' };

  const entry: QueueEntry = {
    queueEntryId: crypto.randomUUID(),
    round,
    status: 'pending',
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

  const queue = state.queue.map((entry, index) =>
    index === 0 ? { ...entry, status: 'active' as const } : entry,
  );
  return { ok: true, state: { ...state, phase: 'playing', queue } };
}

export function advanceQueue(state: RoomState, requesterId: string): ActionResult {
  const hostError = requireHost(state, requesterId);
  if (hostError) return { ok: false, error: hostError };
  if (state.phase !== 'playing') return { ok: false, error: 'The game is not in progress' };

  const activeIndex = state.queue.findIndex((entry) => entry.status === 'active');
  if (activeIndex === -1) return { ok: false, error: 'No active round to advance from' };

  const nextIndex = activeIndex + 1;
  const hasNext = nextIndex < state.queue.length;
  const queue = state.queue.map((entry, index) => {
    if (index === activeIndex) return { ...entry, status: 'completed' as const };
    if (hasNext && index === nextIndex) return { ...entry, status: 'active' as const };
    return entry;
  });

  return {
    ok: true,
    state: { ...state, phase: hasNext ? 'playing' : 'ended', queue },
  };
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

/**
 * Per-round-type contestant-view filtering for `activeRoundState` lands with
 * the round-type behavior modules (next milestone); this milestone never
 * sets `activeRoundState`, so there's nothing to filter yet.
 */
export function toContestantView(state: RoomState): ContestantRoomView {
  return {
    phase: state.phase,
    players: state.players,
    queue: state.queue.map((entry) => ({
      queueEntryId: entry.queueEntryId,
      status: entry.status,
    })),
    activeRoundState: null,
  };
}
