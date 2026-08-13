import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

class FakePartySocket extends EventTarget {
  sent: string[] = [];
  constructor(public options: unknown) {
    super();
  }
  send(data: string): void {
    this.sent.push(data);
  }
  close(): void {}
}

let lastSocket: FakePartySocket | undefined;

vi.mock('partysocket', () => ({
  PartySocket: class extends FakePartySocket {
    constructor(options: unknown) {
      super(options);
      lastSocket = this;
    }
  },
}));

const ROUND = {
  schemaVersion: 1,
  roundId: 'round-1',
  title: 'Science',
  type: 'jeopardy',
  data: {
    categories: [
      {
        name: 'Science',
        clues: [
          { value: 200, clue: { text: 'H2O' }, answer: { text: 'What is water?' } },
          {
            value: 400,
            clue: { text: 'E=mc^2' },
            answer: { text: 'What is relativity?' },
            isDailyDouble: true,
          },
        ],
      },
    ],
  },
};

async function joinAs(name: string, playerId: string, isHost: boolean) {
  const { App } = await import('./App.js');
  render(<App />);

  fireEvent.change(screen.getByLabelText('Room code'), { target: { value: 'ABC123' } });
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: name } });
  fireEvent.click(screen.getByRole('button', { name: 'Join' }));

  lastSocket?.dispatchEvent(new Event('open'));
  lastSocket?.dispatchEvent(
    new MessageEvent('message', {
      data: JSON.stringify({ type: 'joined', playerId, isHost }),
    }),
  );
}

function sendRoomState(view: unknown) {
  lastSocket?.dispatchEvent(
    new MessageEvent('message', {
      data: JSON.stringify({ type: 'room-state', view }),
    }),
  );
}

describe('JeopardyBoard', () => {
  beforeEach(() => {
    vi.resetModules();
    lastSocket = undefined;
  });

  it('lets the host pick a clue', async () => {
    await joinAs('Host', 'p1', true);
    sendRoomState({
      phase: 'playing',
      hostId: 'p1',
      players: [
        { id: 'p1', name: 'Host', score: 0, connected: true },
        { id: 'p2', name: 'Sam', score: 0, connected: true },
      ],
      queue: [{ queueEntryId: 'q1', round: ROUND, status: 'active' }],
      activeRoundState: {
        type: 'jeopardy',
        revealedClues: [],
        activeClue: null,
        buzzedPlayerId: null,
        lockedOutPlayerIds: [],
        pendingWager: null,
        controllingPlayerId: 'p2',
      },
    });

    fireEvent.click(await screen.findByRole('button', { name: '200' }));
    expect(lastSocket?.sent).toContain(
      JSON.stringify({
        type: 'round-action',
        action: { type: 'pick-clue', categoryIndex: 0, clueIndex: 0 },
      }),
    );
  });

  it('lets a contestant buzz once a regular clue is active', async () => {
    await joinAs('Sam', 'p2', false);
    sendRoomState({
      phase: 'playing',
      players: [
        { id: 'p1', name: 'Host', score: 0, connected: true },
        { id: 'p2', name: 'Sam', score: 0, connected: true },
      ],
      queue: [{ queueEntryId: 'q1', status: 'active' }],
      activeRoundState: {
        type: 'jeopardy',
        categories: [
          {
            name: 'Science',
            clues: [
              { value: 200, revealed: false },
              { value: 400, revealed: false },
            ],
          },
        ],
        activeClue: { categoryIndex: 0, clueIndex: 0, clue: { text: 'H2O' }, isDailyDouble: false },
        buzzedPlayerId: null,
        lockedOutPlayerIds: [],
        pendingWager: null,
        controllingPlayerId: null,
      },
    });

    fireEvent.click(await screen.findByRole('button', { name: 'Buzz' }));
    expect(lastSocket?.sent).toContain(
      JSON.stringify({ type: 'round-action', action: { type: 'buzz' } }),
    );
  });

  it('lets the host judge a buzzed-in answer', async () => {
    await joinAs('Host', 'p1', true);
    sendRoomState({
      phase: 'playing',
      hostId: 'p1',
      players: [
        { id: 'p1', name: 'Host', score: 0, connected: true },
        { id: 'p2', name: 'Sam', score: 0, connected: true },
      ],
      queue: [{ queueEntryId: 'q1', round: ROUND, status: 'active' }],
      activeRoundState: {
        type: 'jeopardy',
        revealedClues: [],
        activeClue: { categoryIndex: 0, clueIndex: 0 },
        buzzedPlayerId: 'p2',
        lockedOutPlayerIds: [],
        pendingWager: null,
        controllingPlayerId: null,
      },
    });

    fireEvent.click(await screen.findByRole('button', { name: 'Correct' }));
    expect(lastSocket?.sent).toContain(
      JSON.stringify({ type: 'round-action', action: { type: 'judge', correct: true } }),
    );
  });

  it('shows the wager form to the controlling player on a Daily Double', async () => {
    await joinAs('Sam', 'p2', false);
    sendRoomState({
      phase: 'playing',
      players: [
        { id: 'p1', name: 'Host', score: 0, connected: true },
        { id: 'p2', name: 'Sam', score: 0, connected: true },
      ],
      queue: [{ queueEntryId: 'q1', status: 'active' }],
      activeRoundState: {
        type: 'jeopardy',
        categories: [
          {
            name: 'Science',
            clues: [
              { value: 200, revealed: false },
              { value: 400, revealed: false },
            ],
          },
        ],
        activeClue: {
          categoryIndex: 0,
          clueIndex: 1,
          clue: { text: 'E=mc^2' },
          isDailyDouble: true,
        },
        buzzedPlayerId: null,
        lockedOutPlayerIds: [],
        pendingWager: null,
        controllingPlayerId: 'p2',
      },
    });

    const input = await screen.findByLabelText('Wager');
    fireEvent.change(input, { target: { value: '500' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit wager' }));
    expect(lastSocket?.sent).toContain(
      JSON.stringify({ type: 'round-action', action: { type: 'wager', amount: 500 } }),
    );
  });

  it('lets the host skip an active clue nobody will answer', async () => {
    await joinAs('Host', 'p1', true);
    sendRoomState({
      phase: 'playing',
      hostId: 'p1',
      players: [
        { id: 'p1', name: 'Host', score: 0, connected: true },
        { id: 'p2', name: 'Sam', score: 0, connected: true },
      ],
      queue: [{ queueEntryId: 'q1', round: ROUND, status: 'active' }],
      activeRoundState: {
        type: 'jeopardy',
        revealedClues: [],
        activeClue: { categoryIndex: 0, clueIndex: 0 },
        buzzedPlayerId: null,
        lockedOutPlayerIds: [],
        pendingWager: null,
        controllingPlayerId: null,
      },
    });

    fireEvent.click(await screen.findByRole('button', { name: 'Skip clue' }));
    expect(lastSocket?.sent).toContain(
      JSON.stringify({ type: 'round-action', action: { type: 'skip-clue' } }),
    );
  });

  it('hides the skip button once someone has buzzed in', async () => {
    await joinAs('Host', 'p1', true);
    sendRoomState({
      phase: 'playing',
      hostId: 'p1',
      players: [
        { id: 'p1', name: 'Host', score: 0, connected: true },
        { id: 'p2', name: 'Sam', score: 0, connected: true },
      ],
      queue: [{ queueEntryId: 'q1', round: ROUND, status: 'active' }],
      activeRoundState: {
        type: 'jeopardy',
        revealedClues: [],
        activeClue: { categoryIndex: 0, clueIndex: 0 },
        buzzedPlayerId: 'p2',
        lockedOutPlayerIds: [],
        pendingWager: null,
        controllingPlayerId: null,
      },
    });

    await screen.findByRole('button', { name: 'Correct' });
    expect(screen.queryByRole('button', { name: 'Skip clue' })).toBeNull();
  });

  it('announces round completion once the board is played out', async () => {
    await joinAs('Host', 'p1', true);
    sendRoomState({
      phase: 'playing',
      hostId: 'p1',
      players: [
        { id: 'p1', name: 'Host', score: 0, connected: true },
        { id: 'p2', name: 'Sam', score: 200, connected: true },
      ],
      queue: [{ queueEntryId: 'q1', round: ROUND, status: 'active' }],
      activeRoundState: {
        type: 'jeopardy',
        revealedClues: [
          { categoryIndex: 0, clueIndex: 0 },
          { categoryIndex: 0, clueIndex: 1 },
        ],
        activeClue: null,
        buzzedPlayerId: null,
        lockedOutPlayerIds: [],
        pendingWager: null,
        controllingPlayerId: 'p2',
      },
      roundComplete: true,
    });

    expect(await screen.findByText('Round complete')).toBeInTheDocument();
  });
});
