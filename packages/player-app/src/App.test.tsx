import { CURRENT_ROUND_SCHEMA_VERSION, type Round } from '@gameshow/schema';
import { fireEvent, render, screen, within } from '@testing-library/react';
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

vi.mock('./round-import.js', () => ({ importRoundZip: vi.fn() }));

async function joinAsHostInLobby() {
  const { App } = await import('./App.js');
  render(<App />);

  fireEvent.change(screen.getByLabelText('Room code'), { target: { value: 'ABC123' } });
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Host' } });
  fireEvent.click(screen.getByRole('button', { name: 'Join room' }));

  lastSocket?.dispatchEvent(new Event('open'));
  lastSocket?.dispatchEvent(
    new MessageEvent('message', {
      data: JSON.stringify({
        type: 'joined',
        playerId: 'p1',
        isHost: true,
        sessionToken: 'session-p1',
      }),
    }),
  );
  lastSocket?.dispatchEvent(
    new MessageEvent('message', {
      data: JSON.stringify({
        type: 'room-state',
        view: {
          phase: 'lobby',
          hostId: 'p1',
          players: [{ id: 'p1', name: 'Host', score: 0, connected: true }],
          queue: [],
          activeRoundState: null,
        },
      }),
    }),
  );

  return await screen.findByLabelText('Import round');
}

describe('App', () => {
  beforeEach(() => {
    vi.resetModules();
    lastSocket = undefined;
    window.history.pushState({}, '', '/');
    sessionStorage.clear();
  });

  it('renders the live-room heading', async () => {
    const { App } = await import('./App.js');
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Quiz Show' })).toBeInTheDocument();
  });

  it('joins a room and reveals host controls once the server confirms it', async () => {
    const { App } = await import('./App.js');
    render(<App />);

    fireEvent.change(screen.getByLabelText('Room code'), { target: { value: 'ABC123' } });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Host' } });
    fireEvent.click(screen.getByRole('button', { name: 'Join room' }));

    expect(lastSocket).toBeDefined();
    lastSocket?.dispatchEvent(new Event('open'));
    expect(lastSocket?.sent).toEqual([JSON.stringify({ type: 'join', name: 'Host' })]);

    lastSocket?.dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify({
          type: 'joined',
          playerId: 'p1',
          isHost: true,
          sessionToken: 'session-p1',
        }),
      }),
    );
    lastSocket?.dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify({
          type: 'room-state',
          view: {
            phase: 'lobby',
            hostId: 'p1',
            players: [{ id: 'p1', name: 'Host', score: 0, connected: true }],
            queue: [],
            activeRoundState: null,
          },
        }),
      }),
    );

    expect(await screen.findByRole('button', { name: 'Add fixture round' })).toBeInTheDocument();
  });

  it('does not show host controls for a contestant', async () => {
    const { App } = await import('./App.js');
    render(<App />);

    fireEvent.change(screen.getByLabelText('Room code'), { target: { value: 'ABC123' } });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Sam' } });
    fireEvent.click(screen.getByRole('button', { name: 'Join room' }));

    lastSocket?.dispatchEvent(new Event('open'));
    lastSocket?.dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify({
          type: 'joined',
          playerId: 'p2',
          isHost: false,
          sessionToken: 'session-p2',
        }),
      }),
    );
    lastSocket?.dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify({
          type: 'room-state',
          view: {
            phase: 'lobby',
            hostId: 'p1',
            players: [
              { id: 'p1', name: 'Host', score: 0, connected: true },
              { id: 'p2', name: 'Sam', score: 0, connected: true },
            ],
            queue: [],
            activeRoundState: null,
          },
        }),
      }),
    );

    const playersList = await screen.findByRole('list', { name: 'Players' });
    expect(within(playersList).getByText(/Sam/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add fixture round' })).not.toBeInTheDocument();
  });

  it('lets the host kick another player but not themselves', async () => {
    const { App } = await import('./App.js');
    render(<App />);

    fireEvent.change(screen.getByLabelText('Room code'), { target: { value: 'ABC123' } });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Host' } });
    fireEvent.click(screen.getByRole('button', { name: 'Join room' }));

    lastSocket?.dispatchEvent(new Event('open'));
    lastSocket?.dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify({
          type: 'joined',
          playerId: 'p1',
          isHost: true,
          sessionToken: 'session-p1',
        }),
      }),
    );
    lastSocket?.dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify({
          type: 'room-state',
          view: {
            phase: 'lobby',
            hostId: 'p1',
            players: [
              { id: 'p1', name: 'Host', score: 0, connected: true },
              { id: 'p2', name: 'Sam', score: 0, connected: true },
            ],
            queue: [],
            activeRoundState: null,
          },
        }),
      }),
    );

    const playersList = await screen.findByRole('list', { name: 'Players' });
    expect(within(playersList).getAllByRole('button', { name: 'Kick' })).toHaveLength(1);

    fireEvent.click(within(playersList).getByRole('button', { name: 'Kick' }));
    expect(lastSocket?.sent).toContain(JSON.stringify({ type: 'kick-player', playerId: 'p2' }));

    expect(await screen.findByRole('button', { name: 'Reset scores' })).toBeInTheDocument();
  });

  it('lets the host make another player host, and the swap is reflected live (not cached)', async () => {
    const { App } = await import('./App.js');
    render(<App />);

    fireEvent.change(screen.getByLabelText('Room code'), { target: { value: 'ABC123' } });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Host' } });
    fireEvent.click(screen.getByRole('button', { name: 'Join room' }));

    lastSocket?.dispatchEvent(new Event('open'));
    lastSocket?.dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify({
          type: 'joined',
          playerId: 'p1',
          isHost: true,
          sessionToken: 'session-p1',
        }),
      }),
    );
    lastSocket?.dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify({
          type: 'room-state',
          view: {
            phase: 'lobby',
            hostId: 'p1',
            players: [
              { id: 'p1', name: 'Host', score: 0, connected: true },
              { id: 'p2', name: 'Sam', score: 0, connected: true },
            ],
            queue: [],
            activeRoundState: null,
          },
        }),
      }),
    );

    const playersList = await screen.findByRole('list', { name: 'Players' });
    expect(within(playersList).getAllByRole('button', { name: 'Make host' })).toHaveLength(1);

    fireEvent.click(within(playersList).getByRole('button', { name: 'Make host' }));
    expect(lastSocket?.sent).toContain(JSON.stringify({ type: 'make-host', playerId: 'p2' }));

    lastSocket?.dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify({
          type: 'room-state',
          view: {
            phase: 'lobby',
            hostId: 'p2',
            players: [
              { id: 'p1', name: 'Host', score: 0, connected: true },
              { id: 'p2', name: 'Sam', score: 0, connected: true },
            ],
            queue: [],
            activeRoundState: null,
          },
        }),
      }),
    );

    await vi.waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Add fixture round' })).not.toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: 'Make host' })).not.toBeInTheDocument();
  });

  it('shows a return-to-lobby control once the game has ended', async () => {
    const { App } = await import('./App.js');
    render(<App />);

    fireEvent.change(screen.getByLabelText('Room code'), { target: { value: 'ABC123' } });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Host' } });
    fireEvent.click(screen.getByRole('button', { name: 'Join room' }));

    lastSocket?.dispatchEvent(new Event('open'));
    lastSocket?.dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify({
          type: 'joined',
          playerId: 'p1',
          isHost: true,
          sessionToken: 'session-p1',
        }),
      }),
    );
    lastSocket?.dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify({
          type: 'room-state',
          view: {
            phase: 'ended',
            hostId: 'p1',
            players: [{ id: 'p1', name: 'Host', score: 0, connected: true }],
            queue: [],
            activeRoundState: null,
          },
        }),
      }),
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Return to lobby' }));
    expect(lastSocket?.sent).toContain(JSON.stringify({ type: 'return-to-lobby' }));
  });

  it('returns to the join form when kicked, and allows rejoining', async () => {
    const { App } = await import('./App.js');
    render(<App />);

    fireEvent.change(screen.getByLabelText('Room code'), { target: { value: 'ABC123' } });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Sam' } });
    fireEvent.click(screen.getByRole('button', { name: 'Join room' }));

    lastSocket?.dispatchEvent(new Event('open'));
    lastSocket?.dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify({
          type: 'joined',
          playerId: 'p2',
          isHost: false,
          sessionToken: 'session-p2',
        }),
      }),
    );
    lastSocket?.dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify({
          type: 'room-state',
          view: {
            phase: 'lobby',
            hostId: 'p1',
            players: [
              { id: 'p1', name: 'Host', score: 0, connected: true },
              { id: 'p2', name: 'Sam', score: 0, connected: true },
            ],
            queue: [],
            activeRoundState: null,
          },
        }),
      }),
    );
    expect(await screen.findByText(/Room code: ABC123/)).toBeInTheDocument();

    const kickedSocket = lastSocket;
    kickedSocket?.dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify({ type: 'kicked', reason: 'Testing' }),
      }),
    );

    expect(await screen.findByRole('button', { name: 'Join room' })).toBeInTheDocument();
    expect(screen.getByLabelText('Room code')).toHaveValue('');
    expect(screen.getByLabelText('Name')).toHaveValue('');

    fireEvent.change(screen.getByLabelText('Room code'), { target: { value: 'ABC123' } });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Sam' } });
    fireEvent.click(screen.getByRole('button', { name: 'Join room' }));

    expect(lastSocket).not.toBe(kickedSocket);
    lastSocket?.dispatchEvent(new Event('open'));
    expect(lastSocket?.sent).toEqual([JSON.stringify({ type: 'join', name: 'Sam' })]);
  });

  it('imports a round from a zip file and adds it to the queue', async () => {
    const input = await joinAsHostInLobby();

    const { importRoundZip } = await import('./round-import.js');
    const importedRound: Round = {
      schemaVersion: CURRENT_ROUND_SCHEMA_VERSION,
      roundId: 'round-1',
      title: 'Imported',
      type: 'wheel-of-fortune',
      data: {
        category: 'Cat',
        solution: ['ABC'],
        wedges: [{ kind: 'cash', value: 100 }],
        vowelCost: 100,
        solveBonus: 100,
      },
    };
    vi.mocked(importRoundZip).mockResolvedValueOnce({ round: importedRound, assets: [] });

    const file = new File(['zip-bytes'], 'round.zip', { type: 'application/zip' });
    fireEvent.change(input, { target: { files: [file] } });

    await vi.waitFor(() => {
      expect(lastSocket?.sent).toContain(
        JSON.stringify({ type: 'add-round-to-queue', round: importedRound }),
      );
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows an error and adds nothing when the round import fails', async () => {
    const input = await joinAsHostInLobby();

    const { importRoundZip } = await import('./round-import.js');
    vi.mocked(importRoundZip).mockRejectedValueOnce(new Error('Missing round.json'));

    const file = new File(['zip-bytes'], 'round.zip', { type: 'application/zip' });
    fireEvent.change(input, { target: { files: [file] } });

    expect(await screen.findByRole('alert')).toHaveTextContent('Missing round.json');
    expect(lastSocket?.sent.some((message) => message.includes('add-round-to-queue'))).toBe(false);
  });

  it('creates a room, then joins it as host with the minted token', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ roomId: 'WXYZ', hostToken: 'token-abc' }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { App } = await import('./App.js');
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Create room' }));

    await vi.waitFor(() => expect(lastSocket).toBeDefined());
    lastSocket?.dispatchEvent(new Event('open'));
    expect(lastSocket?.sent).toEqual([
      JSON.stringify({ type: 'join', name: 'Host', hostToken: 'token-abc' }),
    ]);

    vi.unstubAllGlobals();
  });

  it('creates a room with a chosen name instead of the "Host" default', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ roomId: 'WXYZ', hostToken: 'token-abc' }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { App } = await import('./App.js');
    render(<App />);

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Alex' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create room' }));

    await vi.waitFor(() => expect(lastSocket).toBeDefined());
    lastSocket?.dispatchEvent(new Event('open'));
    expect(lastSocket?.sent).toEqual([
      JSON.stringify({ type: 'join', name: 'Alex', hostToken: 'token-abc' }),
    ]);

    vi.unstubAllGlobals();
  });

  it('joins a room from a link with just a name, and sends no host token', async () => {
    window.history.pushState({}, '', '/?room=WXYZ');

    const { App } = await import('./App.js');
    render(<App />);

    expect(screen.getByText(/Room code: WXYZ/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Room code')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Sam' } });
    fireEvent.click(screen.getByRole('button', { name: 'Join' }));

    expect(lastSocket).toBeDefined();
    lastSocket?.dispatchEvent(new Event('open'));
    expect(lastSocket?.sent).toEqual([JSON.stringify({ type: 'join', name: 'Sam' })]);
  });

  it('persists the session token from `joined` and presents it again after a refresh', async () => {
    const { App } = await import('./App.js');
    const firstRender = render(<App />);

    fireEvent.change(screen.getByLabelText('Room code'), { target: { value: 'ABC123' } });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Sam' } });
    fireEvent.click(screen.getByRole('button', { name: 'Join room' }));

    lastSocket?.dispatchEvent(new Event('open'));
    expect(lastSocket?.sent).toEqual([JSON.stringify({ type: 'join', name: 'Sam' })]);
    lastSocket?.dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify({
          type: 'joined',
          playerId: 'p2',
          isHost: false,
          sessionToken: 'session-p2',
        }),
      }),
    );

    expect(sessionStorage.getItem('gameshow:sessionToken:ABC123')).toBe('session-p2');

    // Simulate a page refresh: the module-level socket resets, but sessionStorage survives.
    firstRender.unmount();
    vi.resetModules();
    const { App: RefreshedApp } = await import('./App.js');
    render(<RefreshedApp />);

    fireEvent.change(screen.getByLabelText('Room code'), { target: { value: 'ABC123' } });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Sam' } });
    fireEvent.click(screen.getByRole('button', { name: 'Join room' }));

    lastSocket?.dispatchEvent(new Event('open'));
    expect(lastSocket?.sent).toEqual([
      JSON.stringify({ type: 'join', name: 'Sam', sessionToken: 'session-p2' }),
    ]);
  });
});
