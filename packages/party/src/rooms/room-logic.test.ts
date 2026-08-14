import type { MediaRef, ResolvedMediaRef, RoomState, Round } from '@gameshow/schema';
import { describe, expect, it } from 'vitest';
import {
  addRoundToQueue,
  advanceQueue,
  applyDisconnect,
  applyJoin,
  applyMediaReady,
  applyScoreDeltas,
  createInitialRoomState,
  kickPlayer,
  removeFromQueue,
  reorderQueue,
  resetScores,
  returnToLobby,
  revealMediaAnyway,
  startGame,
  toContestantView,
} from './room-logic.js';

const FIXTURE_ROUND: Round = {
  schemaVersion: 1,
  roundId: 'round-1',
  title: 'Science',
  type: 'jeopardy',
  data: {
    categories: [
      {
        name: 'Science',
        clues: [{ value: 200, clue: { text: 'H2O' }, answer: { text: 'What is water?' } }],
      },
    ],
  },
};

/** The fixture round has no media, so this should never actually run. */
function noopResolveMediaRef(ref: MediaRef): ResolvedMediaRef {
  throw new Error(`unexpected media resolution for ${JSON.stringify(ref)}`);
}

const MEDIA_ROUND: Round = {
  schemaVersion: 1,
  roundId: 'round-media',
  title: 'Pictures',
  type: 'jeopardy',
  data: {
    categories: [
      {
        name: 'Pictures',
        clues: [
          {
            value: 100,
            clue: { media: { kind: 'image', assetId: 'img-1' } },
            answer: { text: 'ans' },
          },
        ],
      },
    ],
  },
};

function resolveByAssetId(ref: MediaRef): ResolvedMediaRef {
  if (ref.kind === 'slideshow') {
    return { kind: 'slideshow', urls: ref.assetIds.map((id) => `https://media/${id}`) };
  }
  return { kind: ref.kind, url: `https://media/${ref.assetId}` };
}

function joinRoom(state: RoomState, name: string) {
  return applyJoin(state, name);
}

describe('applyJoin', () => {
  it('makes the first joiner the host', () => {
    const { state, playerId } = joinRoom(createInitialRoomState(), 'Alex');
    expect(state.hostId).toBe(playerId);
    expect(state.players).toEqual([{ id: playerId, name: 'Alex', score: 0, connected: true }]);
  });

  it('does not make later joiners host', () => {
    const first = joinRoom(createInitialRoomState(), 'Alex');
    const second = joinRoom(first.state, 'Sam');
    expect(second.state.hostId).toBe(first.playerId);
    expect(second.state.hostId).not.toBe(second.playerId);
  });

  it('reconnects an existing player by name instead of duplicating them', () => {
    const first = joinRoom(createInitialRoomState(), 'Alex');
    const disconnected = applyDisconnect(first.state, first.playerId);
    const rejoin = joinRoom(disconnected, 'Alex');

    expect(rejoin.playerId).toBe(first.playerId);
    expect(rejoin.state.players).toHaveLength(1);
    expect(rejoin.state.players[0]?.connected).toBe(true);
  });
});

describe('applyDisconnect', () => {
  it('marks the matching player as disconnected', () => {
    const { state, playerId } = joinRoom(createInitialRoomState(), 'Alex');
    const disconnected = applyDisconnect(state, playerId);
    expect(disconnected.players[0]?.connected).toBe(false);
  });
});

describe('queue actions', () => {
  function hostRoom() {
    return joinRoom(createInitialRoomState(), 'Host');
  }

  it('rejects add-round-to-queue from a non-host', () => {
    const { state, playerId } = hostRoom();
    const contestant = joinRoom(state, 'Sam');
    const result = addRoundToQueue(
      contestant.state,
      FIXTURE_ROUND,
      contestant.playerId,
      noopResolveMediaRef,
    );
    expect(result).toEqual({ ok: false, error: expect.any(String) });
    expect(playerId).not.toBe(contestant.playerId);
  });

  it('lets the host add a round to the queue in lobby', () => {
    const { state, playerId } = hostRoom();
    const result = addRoundToQueue(state, FIXTURE_ROUND, playerId, noopResolveMediaRef);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.state.queue).toEqual([
      {
        queueEntryId: expect.any(String),
        round: FIXTURE_ROUND,
        status: 'pending',
        resolvedData: expect.any(Object),
      },
    ]);
  });

  it('rejects queue edits once the game has started', () => {
    const { state, playerId } = hostRoom();
    const withRound = addRoundToQueue(state, FIXTURE_ROUND, playerId, noopResolveMediaRef);
    if (!withRound.ok) throw new Error('unreachable');
    const started = startGame(withRound.state, playerId);
    if (!started.ok) throw new Error('unreachable');

    const result = addRoundToQueue(started.state, FIXTURE_ROUND, playerId, noopResolveMediaRef);
    expect(result).toEqual({ ok: false, error: expect.any(String) });
  });

  it('removes a queue entry by id', () => {
    const { state, playerId } = hostRoom();
    const withRound = addRoundToQueue(state, FIXTURE_ROUND, playerId, noopResolveMediaRef);
    if (!withRound.ok) throw new Error('unreachable');
    const queueEntryId = withRound.state.queue[0]?.queueEntryId;
    if (!queueEntryId) throw new Error('unreachable');

    const result = removeFromQueue(withRound.state, queueEntryId, playerId);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.state.queue).toEqual([]);
  });

  it('reorders queue entries given a permutation of current ids', () => {
    const { state, playerId } = hostRoom();
    const first = addRoundToQueue(state, FIXTURE_ROUND, playerId, noopResolveMediaRef);
    if (!first.ok) throw new Error('unreachable');
    const second = addRoundToQueue(
      first.state,
      { ...FIXTURE_ROUND, roundId: 'round-2' },
      playerId,
      noopResolveMediaRef,
    );
    if (!second.ok) throw new Error('unreachable');

    const [entryA, entryB] = second.state.queue;
    if (!entryA || !entryB) throw new Error('unreachable');

    const result = reorderQueue(second.state, [entryB.queueEntryId, entryA.queueEntryId], playerId);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.state.queue.map((entry) => entry.queueEntryId)).toEqual([
      entryB.queueEntryId,
      entryA.queueEntryId,
    ]);
  });

  it('rejects reorder-queue when the id list does not match the current queue', () => {
    const { state, playerId } = hostRoom();
    const withRound = addRoundToQueue(state, FIXTURE_ROUND, playerId, noopResolveMediaRef);
    if (!withRound.ok) throw new Error('unreachable');

    const result = reorderQueue(withRound.state, ['not-a-real-id'], playerId);
    expect(result).toEqual({ ok: false, error: expect.any(String) });
  });
});

describe('phase transitions', () => {
  function roomWithQueuedRound() {
    const { state, playerId } = joinRoom(createInitialRoomState(), 'Host');
    const withRound = addRoundToQueue(state, FIXTURE_ROUND, playerId, noopResolveMediaRef);
    if (!withRound.ok) throw new Error('unreachable');
    return { state: withRound.state, playerId };
  }

  it('rejects start-game with an empty queue', () => {
    const { state, playerId } = joinRoom(createInitialRoomState(), 'Host');
    const result = startGame(state, playerId);
    expect(result).toEqual({ ok: false, error: expect.any(String) });
  });

  it('starts the game and activates the first queue entry', () => {
    const { state, playerId } = roomWithQueuedRound();
    const result = startGame(state, playerId);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.state.phase).toBe('playing');
    expect(result.state.queue[0]?.status).toBe('active');
  });

  it('advances through the queue and ends the game once it is exhausted', () => {
    const { state, playerId } = roomWithQueuedRound();
    const second = addRoundToQueue(
      state,
      { ...FIXTURE_ROUND, roundId: 'round-2' },
      playerId,
      noopResolveMediaRef,
    );
    if (!second.ok) throw new Error('unreachable');
    const started = startGame(second.state, playerId);
    if (!started.ok) throw new Error('unreachable');

    const advanced = advanceQueue(started.state, playerId);
    expect(advanced.ok).toBe(true);
    if (!advanced.ok) throw new Error('unreachable');
    expect(advanced.state.queue.map((entry) => entry.status)).toEqual(['completed', 'active']);
    expect(advanced.state.phase).toBe('playing');

    const ended = advanceQueue(advanced.state, playerId);
    expect(ended.ok).toBe(true);
    if (!ended.ok) throw new Error('unreachable');
    expect(ended.state.queue.map((entry) => entry.status)).toEqual(['completed', 'completed']);
    expect(ended.state.phase).toBe('ended');
  });

  it('rejects advance-queue while still in the lobby', () => {
    const { state, playerId } = roomWithQueuedRound();
    const result = advanceQueue(state, playerId);
    expect(result).toEqual({ ok: false, error: expect.any(String) });
  });
});

describe('applyScoreDeltas', () => {
  it('adds deltas to matching players and leaves others untouched', () => {
    const players = [
      { id: 'p1', name: 'A', score: 100, connected: true },
      { id: 'p2', name: 'B', score: 50, connected: true },
    ];
    const result = applyScoreDeltas(players, { p1: -20 });
    expect(result).toEqual([
      { id: 'p1', name: 'A', score: 80, connected: true },
      { id: 'p2', name: 'B', score: 50, connected: true },
    ]);
  });

  it('returns the same players when deltas is undefined', () => {
    const players = [{ id: 'p1', name: 'A', score: 100, connected: true }];
    expect(applyScoreDeltas(players, undefined)).toEqual(players);
  });
});

describe('activeRoundState', () => {
  function roomWithContestant() {
    const { state, playerId } = joinRoom(createInitialRoomState(), 'Host');
    const contestant = joinRoom(state, 'Sam');
    const withRound = addRoundToQueue(
      contestant.state,
      FIXTURE_ROUND,
      playerId,
      noopResolveMediaRef,
    );
    if (!withRound.ok) throw new Error('unreachable');
    return { state: withRound.state, playerId, contestantId: contestant.playerId };
  }

  it('populates a jeopardy activeRoundState when start-game runs', () => {
    const { state, playerId, contestantId } = roomWithContestant();
    const result = startGame(state, playerId);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.state.activeRoundState).toMatchObject({
      type: 'jeopardy',
      revealedClues: [],
      activeClue: null,
    });
    expect(result.state.activeRoundState?.type).toBe('jeopardy');
    if (result.state.activeRoundState?.type === 'jeopardy') {
      expect(result.state.activeRoundState.controllingPlayerId).toBe(contestantId);
    }
  });

  it('re-initializes activeRoundState for the next queue entry on advance-queue', () => {
    const { state, playerId } = roomWithContestant();
    const second = addRoundToQueue(
      state,
      { ...FIXTURE_ROUND, roundId: 'round-2' },
      playerId,
      noopResolveMediaRef,
    );
    if (!second.ok) throw new Error('unreachable');
    const started = startGame(second.state, playerId);
    if (!started.ok) throw new Error('unreachable');

    const advanced = advanceQueue(started.state, playerId);
    expect(advanced.ok).toBe(true);
    if (!advanced.ok) throw new Error('unreachable');
    expect(advanced.state.activeRoundState?.type).toBe('jeopardy');
  });

  it('clears activeRoundState once the queue is exhausted', () => {
    const { state, playerId } = roomWithContestant();
    const started = startGame(state, playerId);
    if (!started.ok) throw new Error('unreachable');
    const ended = advanceQueue(started.state, playerId);
    expect(ended.ok).toBe(true);
    if (!ended.ok) throw new Error('unreachable');
    expect(ended.state.phase).toBe('ended');
    expect(ended.state.activeRoundState).toBeNull();
  });

  it('resets roundComplete on start-game and advance-queue, and shows it to contestants', () => {
    const { state, playerId, contestantId } = roomWithContestant();
    const second = addRoundToQueue(
      state,
      { ...FIXTURE_ROUND, roundId: 'round-2' },
      playerId,
      noopResolveMediaRef,
    );
    if (!second.ok) throw new Error('unreachable');
    const started = startGame(second.state, playerId);
    if (!started.ok) throw new Error('unreachable');
    expect(started.state.roundComplete).toBe(false);
    expect(toContestantView(started.state, contestantId).roundComplete).toBe(false);

    const midRound = { ...started.state, roundComplete: true };
    expect(toContestantView(midRound, contestantId).roundComplete).toBe(true);

    const advanced = advanceQueue(midRound, playerId);
    expect(advanced.ok).toBe(true);
    if (!advanced.ok) throw new Error('unreachable');
    expect(advanced.state.roundComplete).toBe(false);
  });

  it('exposes a filtered jeopardy view to contestants, hiding answers', () => {
    const { state, playerId, contestantId } = roomWithContestant();
    const started = startGame(state, playerId);
    if (!started.ok) throw new Error('unreachable');

    const view = toContestantView(started.state, contestantId);
    expect(view.activeRoundState?.type).toBe('jeopardy');
    if (view.activeRoundState?.type === 'jeopardy') {
      expect(view.activeRoundState).not.toHaveProperty('answer');
      expect(view.activeRoundState.categories[0]?.clues[0]).toEqual({
        value: 200,
        revealed: false,
      });
    }
  });
});

describe('toContestantView', () => {
  it('never exposes hostId or round content', () => {
    const { state, playerId } = joinRoom(createInitialRoomState(), 'Host');
    const contestant = joinRoom(state, 'Sam');
    const withRound = addRoundToQueue(
      contestant.state,
      FIXTURE_ROUND,
      playerId,
      noopResolveMediaRef,
    );
    if (!withRound.ok) throw new Error('unreachable');

    const view = toContestantView(withRound.state, contestant.playerId);
    expect(view).not.toHaveProperty('hostId');
    expect(view.queue).toEqual([
      { queueEntryId: withRound.state.queue[0]?.queueEntryId, status: 'pending' },
    ]);
    expect(view.activeRoundState).toBeNull();
  });
});

describe('returnToLobby', () => {
  function endedRoom() {
    const { state, playerId } = joinRoom(createInitialRoomState(), 'Host');
    const withRound = addRoundToQueue(state, FIXTURE_ROUND, playerId, noopResolveMediaRef);
    if (!withRound.ok) throw new Error('unreachable');
    const started = startGame(withRound.state, playerId);
    if (!started.ok) throw new Error('unreachable');
    const ended = advanceQueue(started.state, playerId);
    if (!ended.ok) throw new Error('unreachable');
    return { state: ended.state, playerId };
  }

  it('rejects returning to the lobby before the game has ended', () => {
    const { state, playerId } = joinRoom(createInitialRoomState(), 'Host');
    const result = returnToLobby(state, playerId);
    expect(result).toEqual({ ok: false, error: expect.any(String) });
  });

  it('rejects a non-host request', () => {
    const { state } = endedRoom();
    const contestant = joinRoom(state, 'Sam');
    const result = returnToLobby(contestant.state, contestant.playerId);
    expect(result).toEqual({ ok: false, error: expect.any(String) });
  });

  it('clears the queue and returns to the lobby, keeping scores', () => {
    const { state, playerId } = endedRoom();
    const result = returnToLobby(state, playerId);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.state.phase).toBe('lobby');
    expect(result.state.queue).toEqual([]);
    expect(result.state.players[0]?.score).toBe(0);
  });
});

describe('resetScores', () => {
  it('rejects resetting scores outside the lobby', () => {
    const { state, playerId } = joinRoom(createInitialRoomState(), 'Host');
    const withRound = addRoundToQueue(state, FIXTURE_ROUND, playerId, noopResolveMediaRef);
    if (!withRound.ok) throw new Error('unreachable');
    const started = startGame(withRound.state, playerId);
    if (!started.ok) throw new Error('unreachable');

    const result = resetScores(started.state, playerId);
    expect(result).toEqual({ ok: false, error: expect.any(String) });
  });

  it('rejects a non-host request', () => {
    const { state } = joinRoom(createInitialRoomState(), 'Host');
    const contestant = joinRoom(state, 'Sam');
    const result = resetScores(contestant.state, contestant.playerId);
    expect(result).toEqual({ ok: false, error: expect.any(String) });
  });

  it('zeroes every player score', () => {
    const { state, playerId } = joinRoom(createInitialRoomState(), 'Host');
    const contestant = joinRoom(state, 'Sam');
    const scored = {
      ...contestant.state,
      players: contestant.state.players.map((player) => ({ ...player, score: 100 })),
    };

    const result = resetScores(scored, playerId);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.state.players.every((player) => player.score === 0)).toBe(true);
  });
});

describe('kickPlayer', () => {
  it('rejects kicking outside the lobby', () => {
    const { state, playerId } = joinRoom(createInitialRoomState(), 'Host');
    const contestant = joinRoom(state, 'Sam');
    const withRound = addRoundToQueue(
      contestant.state,
      FIXTURE_ROUND,
      playerId,
      noopResolveMediaRef,
    );
    if (!withRound.ok) throw new Error('unreachable');
    const started = startGame(withRound.state, playerId);
    if (!started.ok) throw new Error('unreachable');

    const result = kickPlayer(started.state, contestant.playerId, playerId);
    expect(result).toEqual({ ok: false, error: expect.any(String) });
  });

  it('rejects a non-host request', () => {
    const { state, playerId } = joinRoom(createInitialRoomState(), 'Host');
    const contestant = joinRoom(state, 'Sam');
    const result = kickPlayer(contestant.state, playerId, contestant.playerId);
    expect(result).toEqual({ ok: false, error: expect.any(String) });
  });

  it('rejects kicking the host', () => {
    const { state, playerId } = joinRoom(createInitialRoomState(), 'Host');
    const result = kickPlayer(state, playerId, playerId);
    expect(result).toEqual({ ok: false, error: expect.any(String) });
  });

  it('rejects kicking an unknown player id', () => {
    const { state, playerId } = joinRoom(createInitialRoomState(), 'Host');
    const result = kickPlayer(state, 'not-a-real-id', playerId);
    expect(result).toEqual({ ok: false, error: expect.any(String) });
  });

  it('removes the player from the room', () => {
    const { state, playerId } = joinRoom(createInitialRoomState(), 'Host');
    const contestant = joinRoom(state, 'Sam');

    const result = kickPlayer(contestant.state, contestant.playerId, playerId);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.state.players.map((player) => player.id)).toEqual([playerId]);
  });
});

describe('media readiness barrier', () => {
  function roomWithMediaRound() {
    const { state: hostState, playerId: hostId } = joinRoom(createInitialRoomState(), 'Host');
    const withContestant = joinRoom(hostState, 'Sam');
    const withRound = addRoundToQueue(withContestant.state, MEDIA_ROUND, hostId, resolveByAssetId);
    if (!withRound.ok) throw new Error('unreachable');
    return { state: withRound.state, hostId, contestantId: withContestant.playerId };
  }

  it('starts a media round as loading instead of active', () => {
    const { state, hostId } = roomWithMediaRound();
    const started = startGame(state, hostId);
    expect(started.ok).toBe(true);
    if (!started.ok) throw new Error('unreachable');
    expect(started.state.queue[0]?.status).toBe('loading');
    expect(started.state.mediaReadyPlayerIds).toEqual([]);
  });

  it('stays loading until every connected player reports ready', () => {
    const { state, hostId, contestantId } = roomWithMediaRound();
    const started = startGame(state, hostId);
    if (!started.ok) throw new Error('unreachable');

    const afterHostReady = applyMediaReady(started.state, hostId);
    expect(afterHostReady.queue[0]?.status).toBe('loading');
    expect(afterHostReady.mediaReadyPlayerIds).toEqual([hostId]);

    const afterAllReady = applyMediaReady(afterHostReady, contestantId);
    expect(afterAllReady.queue[0]?.status).toBe('active');
  });

  it('ignores a duplicate ready report from the same player', () => {
    const { state, hostId } = roomWithMediaRound();
    const started = startGame(state, hostId);
    if (!started.ok) throw new Error('unreachable');

    const once = applyMediaReady(started.state, hostId);
    const twice = applyMediaReady(once, hostId);
    expect(twice.mediaReadyPlayerIds).toEqual([hostId]);
  });

  it('a disconnect can complete the ready set for the remaining connected players', () => {
    const { state, hostId, contestantId } = roomWithMediaRound();
    const started = startGame(state, hostId);
    if (!started.ok) throw new Error('unreachable');

    const afterHostReady = applyMediaReady(started.state, hostId);
    expect(afterHostReady.queue[0]?.status).toBe('loading');

    const afterDisconnect = applyDisconnect(afterHostReady, contestantId);
    expect(afterDisconnect.queue[0]?.status).toBe('active');
  });

  it('lets the host reveal the loading entry immediately', () => {
    const { state, hostId } = roomWithMediaRound();
    const started = startGame(state, hostId);
    if (!started.ok) throw new Error('unreachable');

    const result = revealMediaAnyway(started.state, hostId);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.state.queue[0]?.status).toBe('active');
  });

  it('rejects reveal-media-anyway from a non-host', () => {
    const { state, hostId, contestantId } = roomWithMediaRound();
    const started = startGame(state, hostId);
    if (!started.ok) throw new Error('unreachable');

    const result = revealMediaAnyway(started.state, contestantId);
    expect(result).toEqual({ ok: false, error: expect.any(String) });
  });

  it('rejects reveal-media-anyway when nothing is loading', () => {
    const { state, hostId } = roomWithMediaRound();
    const result = revealMediaAnyway(state, hostId);
    expect(result).toEqual({ ok: false, error: expect.any(String) });
  });

  it('exposes mediaUrls to contestants for loading and active entries', () => {
    const { state, hostId, contestantId } = roomWithMediaRound();
    const started = startGame(state, hostId);
    if (!started.ok) throw new Error('unreachable');

    const loadingView = toContestantView(started.state, contestantId);
    expect(loadingView.queue[0]?.mediaUrls).toEqual(['https://media/img-1']);

    const revealed = revealMediaAnyway(started.state, hostId);
    if (!revealed.ok) throw new Error('unreachable');
    const activeView = toContestantView(revealed.state, contestantId);
    expect(activeView.queue[0]?.mediaUrls).toEqual(['https://media/img-1']);
  });

  it('does not gate a media-free round (regression: existing fixture goes straight to active)', () => {
    const { state, playerId } = joinRoom(createInitialRoomState(), 'Host');
    const withRound = addRoundToQueue(state, FIXTURE_ROUND, playerId, noopResolveMediaRef);
    if (!withRound.ok) throw new Error('unreachable');
    const started = startGame(withRound.state, playerId);
    if (!started.ok) throw new Error('unreachable');
    expect(started.state.queue[0]?.status).toBe('active');
  });
});
