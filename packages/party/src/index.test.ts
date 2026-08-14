import { env, exports } from 'cloudflare:workers';
import type { Round } from '@gameshow/schema';
import { describe, expect, it } from 'vitest';

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

async function connect(room: string): Promise<WebSocket> {
  const response = await exports.default.fetch(`https://example.com/parties/game-room/${room}`, {
    headers: { Upgrade: 'websocket' },
  });
  const ws = response.webSocket;
  if (!ws) throw new Error('Expected a websocket upgrade response');
  ws.accept();
  return ws;
}

function collect(ws: WebSocket, count: number): Promise<unknown[]> {
  return new Promise((resolve) => {
    const messages: unknown[] = [];
    ws.addEventListener('message', function listener(event: MessageEvent) {
      messages.push(JSON.parse(event.data as string));
      if (messages.length === count) {
        ws.removeEventListener('message', listener);
        resolve(messages);
      }
    });
  });
}

function send(ws: WebSocket, message: unknown): void {
  ws.send(JSON.stringify(message));
}

describe('worker fetch handler', () => {
  it('returns 404 for unmatched routes', async () => {
    const response = await exports.default.fetch('https://example.com/not-a-party-route');

    expect(response.status).toBe(404);
  });
});

describe('GameRoom', () => {
  it('splits host/contestant views and advances the queue', async () => {
    const room = `room-${crypto.randomUUID()}`;

    const host = await connect(room);
    const hostJoinMessages = collect(host, 2);
    send(host, { type: 'join', name: 'Host' });
    const [hostJoined, hostStateAfterJoin] = (await hostJoinMessages) as [
      { type: 'joined'; playerId: string; isHost: boolean },
      { type: 'room-state'; view: { hostId: string } },
    ];
    expect(hostJoined.isHost).toBe(true);
    expect(hostStateAfterJoin.view.hostId).toBe(hostJoined.playerId);

    const contestant = await connect(room);
    const contestantJoinMessages = collect(contestant, 2);
    const hostBroadcastOnContestantJoin = collect(host, 1);
    send(contestant, { type: 'join', name: 'Sam' });
    const [contestantJoined, contestantStateAfterJoin] = (await contestantJoinMessages) as [
      { type: 'joined'; playerId: string; isHost: boolean },
      { type: 'room-state'; view: Record<string, unknown> },
    ];
    await hostBroadcastOnContestantJoin;
    expect(contestantJoined.isHost).toBe(false);
    expect(contestantStateAfterJoin.view).not.toHaveProperty('hostId');

    const hostQueueUpdate = collect(host, 1);
    const contestantQueueUpdate = collect(contestant, 1);
    send(host, { type: 'add-round-to-queue', round: FIXTURE_ROUND });
    const [hostAfterAdd] = (await hostQueueUpdate) as [
      { type: 'room-state'; view: { queue: { round: Round; status: string }[] } },
    ];
    const [contestantAfterAdd] = (await contestantQueueUpdate) as [
      { type: 'room-state'; view: { queue: { round?: Round; status: string }[] } },
    ];
    expect(hostAfterAdd.view.queue[0]?.round).toEqual(FIXTURE_ROUND);
    expect(contestantAfterAdd.view.queue[0]).not.toHaveProperty('round');
    expect(contestantAfterAdd.view.queue[0]?.status).toBe('pending');

    const hostAfterStart = collect(host, 1);
    const contestantAfterStart = collect(contestant, 1);
    send(host, { type: 'start-game' });
    const [hostStarted] = (await hostAfterStart) as [
      { type: 'room-state'; view: { phase: string; queue: { status: string }[] } },
    ];
    const [contestantStarted] = (await contestantAfterStart) as [
      { type: 'room-state'; view: { phase: string; queue: { status: string }[] } },
    ];
    expect(hostStarted.view.phase).toBe('playing');
    expect(hostStarted.view.queue[0]?.status).toBe('active');
    expect(contestantStarted.view.phase).toBe('playing');
    expect(contestantStarted.view.queue[0]?.status).toBe('active');

    const hostAfterAdvance = collect(host, 1);
    send(host, { type: 'advance-queue' });
    const [hostEnded] = (await hostAfterAdvance) as [
      { type: 'room-state'; view: { phase: string } },
    ];
    expect(hostEnded.view.phase).toBe('ended');
  });

  it('plays a full round-action round-trip and updates scores', async () => {
    const room = `room-${crypto.randomUUID()}`;

    const host = await connect(room);
    const hostJoined = collect(host, 2);
    send(host, { type: 'join', name: 'Host' });
    await hostJoined;

    const contestant = await connect(room);
    const contestantJoined = collect(contestant, 2);
    const hostBroadcastOnJoin = collect(host, 1);
    send(contestant, { type: 'join', name: 'Sam' });
    const [contestantJoinedMsg] = (await contestantJoined) as [
      { type: 'joined'; playerId: string; isHost: boolean },
      unknown,
    ];
    await hostBroadcastOnJoin;

    const hostAfterAdd = collect(host, 1);
    const contestantAfterAdd = collect(contestant, 1);
    send(host, { type: 'add-round-to-queue', round: FIXTURE_ROUND });
    await hostAfterAdd;
    await contestantAfterAdd;

    const hostAfterStart = collect(host, 1);
    const contestantAfterStart = collect(contestant, 1);
    send(host, { type: 'start-game' });
    await hostAfterStart;
    await contestantAfterStart;

    const hostAfterPick = collect(host, 1);
    const contestantAfterPick = collect(contestant, 1);
    send(host, {
      type: 'round-action',
      action: { type: 'pick-clue', categoryIndex: 0, clueIndex: 0 },
    });
    const [hostPicked] = (await hostAfterPick) as [
      { type: 'room-state'; view: { activeRoundState: { activeClue: unknown } } },
    ];
    await contestantAfterPick;
    expect(hostPicked.view.activeRoundState.activeClue).toEqual({ categoryIndex: 0, clueIndex: 0 });

    const hostAfterBuzz = collect(host, 1);
    const contestantAfterBuzz = collect(contestant, 1);
    send(contestant, { type: 'round-action', action: { type: 'buzz' } });
    const [hostAfterBuzzMsg] = (await hostAfterBuzz) as [
      { type: 'room-state'; view: { activeRoundState: { buzzedPlayerId: string } } },
    ];
    await contestantAfterBuzz;
    expect(hostAfterBuzzMsg.view.activeRoundState.buzzedPlayerId).toBe(
      contestantJoinedMsg.playerId,
    );

    const hostAfterJudge = collect(host, 1);
    const contestantAfterJudge = collect(contestant, 1);
    send(host, { type: 'round-action', action: { type: 'judge', correct: true } });
    const [hostAfterJudgeMsg] = (await hostAfterJudge) as [
      {
        type: 'room-state';
        view: {
          players: { id: string; score: number }[];
          activeRoundState: { activeClue: unknown };
          roundComplete: boolean;
        };
      },
    ];
    const [contestantAfterJudgeMsg] = (await contestantAfterJudge) as [
      { type: 'room-state'; view: { roundComplete: boolean } },
    ];
    expect(hostAfterJudgeMsg.view.activeRoundState.activeClue).toBeNull();
    const contestantPlayer = hostAfterJudgeMsg.view.players.find(
      (player) => player.id === contestantJoinedMsg.playerId,
    );
    expect(contestantPlayer?.score).toBe(200);
    expect(hostAfterJudgeMsg.view.roundComplete).toBe(true);
    expect(contestantAfterJudgeMsg.view.roundComplete).toBe(true);
  });

  it('rejects queue edits from a non-host with an error', async () => {
    const room = `room-${crypto.randomUUID()}`;

    const host = await connect(room);
    const hostJoined = collect(host, 2);
    send(host, { type: 'join', name: 'Host' });
    await hostJoined;

    const contestant = await connect(room);
    const contestantJoined = collect(contestant, 2);
    const hostBroadcast = collect(host, 1);
    send(contestant, { type: 'join', name: 'Sam' });
    await contestantJoined;
    await hostBroadcast;

    const errorMessage = collect(contestant, 1);
    send(contestant, { type: 'add-round-to-queue', round: FIXTURE_ROUND });
    const [error] = (await errorMessage) as [{ type: 'error'; message: string }];
    expect(error.type).toBe('error');
  });

  it('notifies and disconnects a kicked player', async () => {
    const room = `room-${crypto.randomUUID()}`;

    const host = await connect(room);
    const hostJoined = collect(host, 2);
    send(host, { type: 'join', name: 'Host' });
    await hostJoined;

    const contestant = await connect(room);
    const contestantJoined = collect(contestant, 2);
    const hostBroadcastOnJoin = collect(host, 1);
    send(contestant, { type: 'join', name: 'Sam' });
    const [contestantJoinedMsg] = (await contestantJoined) as [
      { type: 'joined'; playerId: string; isHost: boolean },
      unknown,
    ];
    await hostBroadcastOnJoin;

    const kickedMessage = collect(contestant, 1);
    const contestantClosed = new Promise<void>((resolve) => {
      contestant.addEventListener('close', () => resolve());
    });
    const hostBroadcastOnKick = collect(host, 1);
    send(host, { type: 'kick-player', playerId: contestantJoinedMsg.playerId });

    const [kicked] = (await kickedMessage) as [{ type: 'kicked'; reason?: string }];
    expect(kicked.type).toBe('kicked');
    expect(kicked.reason).toBeDefined();
    await contestantClosed;

    const [hostAfterKick] = (await hostBroadcastOnKick) as [
      { type: 'room-state'; view: { players: { name: string }[] } },
    ];
    expect(hostAfterKick.view.players.map((player) => player.name)).toEqual(['Host']);
  });
});

describe('media upload tokens', () => {
  it('rejects a non-host request', async () => {
    const room = `room-${crypto.randomUUID()}`;

    const host = await connect(room);
    const hostJoined = collect(host, 2);
    send(host, { type: 'join', name: 'Host' });
    await hostJoined;

    const contestant = await connect(room);
    const contestantJoined = collect(contestant, 2);
    const hostBroadcast = collect(host, 1);
    send(contestant, { type: 'join', name: 'Sam' });
    await contestantJoined;
    await hostBroadcast;

    const errorMessage = collect(contestant, 1);
    send(contestant, {
      type: 'request-media-upload-tokens',
      roundId: 'round-media',
      assets: [{ assetId: 'img-1', kind: 'image', contentType: 'image/png', size: 10 }],
    });
    const [error] = (await errorMessage) as [{ type: 'error'; message: string }];
    expect(error.type).toBe('error');
  });

  it('rejects a request outside the lobby', async () => {
    const room = `room-${crypto.randomUUID()}`;

    const host = await connect(room);
    const hostJoined = collect(host, 2);
    send(host, { type: 'join', name: 'Host' });
    await hostJoined;

    const hostAfterAdd = collect(host, 1);
    send(host, { type: 'add-round-to-queue', round: FIXTURE_ROUND });
    await hostAfterAdd;

    const hostAfterStart = collect(host, 1);
    send(host, { type: 'start-game' });
    await hostAfterStart;

    const errorMessage = collect(host, 1);
    send(host, {
      type: 'request-media-upload-tokens',
      roundId: 'round-media',
      assets: [{ assetId: 'img-1', kind: 'image', contentType: 'image/png', size: 10 }],
    });
    const [error] = (await errorMessage) as [{ type: 'error'; message: string }];
    expect(error.type).toBe('error');
  });

  it('rejects an asset that fails content-type/size validation', async () => {
    const room = `room-${crypto.randomUUID()}`;

    const host = await connect(room);
    const hostJoined = collect(host, 2);
    send(host, { type: 'join', name: 'Host' });
    await hostJoined;

    const errorMessage = collect(host, 1);
    send(host, {
      type: 'request-media-upload-tokens',
      roundId: 'round-media',
      assets: [{ assetId: 'img-1', kind: 'image', contentType: 'image/png', size: 999_999_999 }],
    });
    const [error] = (await errorMessage) as [{ type: 'error'; message: string }];
    expect(error.type).toBe('error');
  });

  it('issues a usable token for a valid asset', async () => {
    const room = `room-${crypto.randomUUID()}`;

    const host = await connect(room);
    const hostJoined = collect(host, 2);
    send(host, { type: 'join', name: 'Host' });
    await hostJoined;

    const tokensMessage = collect(host, 1);
    send(host, {
      type: 'request-media-upload-tokens',
      roundId: 'round-media',
      assets: [{ assetId: 'img-1', kind: 'image', contentType: 'image/png', size: 4 }],
    });
    const [response] = (await tokensMessage) as [
      { type: 'media-upload-tokens'; tokens: { assetId: string; token: string }[] },
    ];
    expect(response.type).toBe('media-upload-tokens');
    const token = response.tokens.find((t) => t.assetId === 'img-1')?.token;
    if (!token) throw new Error('unreachable');

    const body = new Uint8Array([1, 2, 3, 4]);
    const putResponse = await exports.default.fetch(
      `https://example.com/media/upload?token=${encodeURIComponent(token)}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'image/png', 'Content-Length': String(body.byteLength) },
        body,
      },
    );
    expect(putResponse.status).toBe(204);

    const getResponse = await exports.default.fetch(
      `https://example.com/media/rooms/${room}/round-media/img-1`,
    );
    expect(getResponse.status).toBe(200);
    expect(new Uint8Array(await getResponse.arrayBuffer())).toEqual(body);
  });
});

describe('remove-from-queue R2 cleanup', () => {
  it('deletes the round prefix once its queue entry is removed', async () => {
    const room = `room-${crypto.randomUUID()}`;
    const roundId = 'round-media';
    const key = `rooms/${room}/${roundId}/img-1`;
    await env.MEDIA.put(key, new Uint8Array([1, 2, 3]));

    const host = await connect(room);
    const hostJoined = collect(host, 2);
    send(host, { type: 'join', name: 'Host' });
    await hostJoined;

    const hostAfterAdd = collect(host, 1);
    send(host, { type: 'add-round-to-queue', round: { ...MEDIA_ROUND, roundId } });
    const [afterAdd] = (await hostAfterAdd) as [
      { type: 'room-state'; view: { queue: { queueEntryId: string }[] } },
    ];
    const queueEntryId = afterAdd.view.queue[0]?.queueEntryId;
    if (!queueEntryId) throw new Error('unreachable');

    expect(await env.MEDIA.get(key)).not.toBeNull();

    const hostAfterRemove = collect(host, 1);
    send(host, { type: 'remove-from-queue', queueEntryId });
    await hostAfterRemove;

    expect(await env.MEDIA.get(key)).toBeNull();
  });
});

describe('media readiness barrier over websocket', () => {
  it('gates on every connected player, then reveals once all are ready', async () => {
    const room = `room-${crypto.randomUUID()}`;

    const host = await connect(room);
    const hostJoined = collect(host, 2);
    send(host, { type: 'join', name: 'Host' });
    const [hostJoinedMsg] = (await hostJoined) as [{ type: 'joined'; playerId: string }, unknown];

    const contestant = await connect(room);
    const contestantJoined = collect(contestant, 2);
    const hostBroadcastOnJoin = collect(host, 1);
    send(contestant, { type: 'join', name: 'Sam' });
    const [contestantJoinedMsg] = (await contestantJoined) as [
      { type: 'joined'; playerId: string },
      unknown,
    ];
    await hostBroadcastOnJoin;

    const hostAfterAdd = collect(host, 1);
    const contestantAfterAdd = collect(contestant, 1);
    send(host, { type: 'add-round-to-queue', round: MEDIA_ROUND });
    await hostAfterAdd;
    await contestantAfterAdd;

    const hostAfterStart = collect(host, 1);
    const contestantAfterStart = collect(contestant, 1);
    send(host, { type: 'start-game' });
    const [hostStarted] = (await hostAfterStart) as [
      { type: 'room-state'; view: { queue: { status: string }[] } },
    ];
    const [contestantStarted] = (await contestantAfterStart) as [
      { type: 'room-state'; view: { queue: { status: string; mediaUrls?: string[] }[] } },
    ];
    expect(hostStarted.view.queue[0]?.status).toBe('loading');
    expect(contestantStarted.view.queue[0]?.status).toBe('loading');
    expect(contestantStarted.view.queue[0]?.mediaUrls).toEqual([
      `http://127.0.0.1:8788/media/rooms/${room}/round-media/img-1`,
    ]);

    const afterContestantReadyOnHost = collect(host, 1);
    const afterContestantReadyOnContestant = collect(contestant, 1);
    send(contestant, { type: 'round-media-ready' });
    const [stillLoading] = (await afterContestantReadyOnHost) as [
      { type: 'room-state'; view: { queue: { status: string }[] } },
    ];
    expect(stillLoading.view.queue[0]?.status).toBe('loading');
    await afterContestantReadyOnContestant;

    const hostAfterReady = collect(host, 1);
    const contestantAfterReady = collect(contestant, 1);
    send(host, { type: 'round-media-ready' });
    const [hostNowActive] = (await hostAfterReady) as [
      { type: 'room-state'; view: { queue: { status: string }[] } },
    ];
    const [contestantNowActive] = (await contestantAfterReady) as [
      { type: 'room-state'; view: { queue: { status: string }[] } },
    ];
    expect(hostNowActive.view.queue[0]?.status).toBe('active');
    expect(contestantNowActive.view.queue[0]?.status).toBe('active');
    expect(hostJoinedMsg.playerId).not.toBe(contestantJoinedMsg.playerId);
  });

  it("lets the host reveal media anyway before everyone's ready", async () => {
    const room = `room-${crypto.randomUUID()}`;

    const host = await connect(room);
    const hostJoined = collect(host, 2);
    send(host, { type: 'join', name: 'Host' });
    await hostJoined;

    const hostAfterAdd = collect(host, 1);
    send(host, { type: 'add-round-to-queue', round: MEDIA_ROUND });
    await hostAfterAdd;

    const hostAfterStart = collect(host, 1);
    send(host, { type: 'start-game' });
    await hostAfterStart;

    const hostAfterReveal = collect(host, 1);
    send(host, { type: 'reveal-media-anyway' });
    const [revealed] = (await hostAfterReveal) as [
      { type: 'room-state'; view: { queue: { status: string }[] } },
    ];
    expect(revealed.view.queue[0]?.status).toBe('active');
  });
});
