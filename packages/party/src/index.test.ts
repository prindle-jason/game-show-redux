import { exports } from 'cloudflare:workers';
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
