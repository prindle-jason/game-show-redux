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

describe('App', () => {
  beforeEach(() => {
    vi.resetModules();
    lastSocket = undefined;
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
    fireEvent.click(screen.getByRole('button', { name: 'Join' }));

    expect(lastSocket).toBeDefined();
    lastSocket?.dispatchEvent(new Event('open'));
    expect(lastSocket?.sent).toEqual([JSON.stringify({ type: 'join', name: 'Host' })]);

    lastSocket?.dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify({ type: 'joined', playerId: 'p1', isHost: true }),
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
    fireEvent.click(screen.getByRole('button', { name: 'Join' }));

    lastSocket?.dispatchEvent(new Event('open'));
    lastSocket?.dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify({ type: 'joined', playerId: 'p2', isHost: false }),
      }),
    );
    lastSocket?.dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify({
          type: 'room-state',
          view: {
            phase: 'lobby',
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
    fireEvent.click(screen.getByRole('button', { name: 'Join' }));

    lastSocket?.dispatchEvent(new Event('open'));
    lastSocket?.dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify({ type: 'joined', playerId: 'p1', isHost: true }),
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

  it('shows a return-to-lobby control once the game has ended', async () => {
    const { App } = await import('./App.js');
    render(<App />);

    fireEvent.change(screen.getByLabelText('Room code'), { target: { value: 'ABC123' } });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Host' } });
    fireEvent.click(screen.getByRole('button', { name: 'Join' }));

    lastSocket?.dispatchEvent(new Event('open'));
    lastSocket?.dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify({ type: 'joined', playerId: 'p1', isHost: true }),
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
    fireEvent.click(screen.getByRole('button', { name: 'Join' }));

    lastSocket?.dispatchEvent(new Event('open'));
    lastSocket?.dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify({ type: 'joined', playerId: 'p2', isHost: false }),
      }),
    );
    lastSocket?.dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify({
          type: 'room-state',
          view: {
            phase: 'lobby',
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

    expect(await screen.findByRole('button', { name: 'Join' })).toBeInTheDocument();
    expect(screen.getByLabelText('Room code')).toHaveValue('');
    expect(screen.getByLabelText('Name')).toHaveValue('');

    fireEvent.change(screen.getByLabelText('Room code'), { target: { value: 'ABC123' } });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Sam' } });
    fireEvent.click(screen.getByRole('button', { name: 'Join' }));

    expect(lastSocket).not.toBe(kickedSocket);
    lastSocket?.dispatchEvent(new Event('open'));
    expect(lastSocket?.sent).toEqual([JSON.stringify({ type: 'join', name: 'Sam' })]);
  });
});
