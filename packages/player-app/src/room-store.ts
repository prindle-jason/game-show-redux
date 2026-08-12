import type {
  ClientMessage,
  ContestantRoomView,
  HostRoomView,
  ServerMessage,
} from '@gameshow/schema';
import { PartySocket } from 'partysocket';
import { create } from 'zustand';

type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'closed';

interface RoomStore {
  status: ConnectionStatus;
  roomCode: string | null;
  self: { playerId: string; isHost: boolean } | null;
  view: HostRoomView | ContestantRoomView | null;
  error: string | null;
  join: (roomCode: string, name: string) => void;
  send: (message: ClientMessage) => void;
}

let socket: PartySocket | null = null;

export const useRoomStore = create<RoomStore>((set, get) => ({
  status: 'idle',
  roomCode: null,
  self: null,
  view: null,
  error: null,
  join: (roomCode, name) => {
    if (socket) return;

    set({ status: 'connecting', roomCode });
    socket = new PartySocket({
      host: import.meta.env.VITE_PARTY_HOST,
      party: 'game-room',
      room: roomCode,
    });

    socket.addEventListener('open', () => {
      set({ status: 'connected' });
      get().send({ type: 'join', name });
    });

    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data as string) as ServerMessage;
      if (message.type === 'joined') {
        set({ self: { playerId: message.playerId, isHost: message.isHost } });
      } else if (message.type === 'room-state') {
        set({ view: message.view });
      } else if (message.type === 'kicked') {
        socket?.close();
        socket = null;
        set({
          status: 'idle',
          roomCode: null,
          self: null,
          view: null,
          error: message.reason ?? null,
        });
      } else {
        set({ error: message.message });
      }
    });

    socket.addEventListener('close', () => set({ status: 'closed' }));
  },
  send: (message) => {
    socket?.send(JSON.stringify(message));
  },
}));
