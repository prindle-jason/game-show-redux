import type {
  ClientMessage,
  ContestantRoomView,
  HostRoomView,
  MediaRef,
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
  requestMediaUploadTokens: (
    roundId: string,
    assets: Array<{ assetId: string; kind: MediaRef['kind']; contentType: string; size: number }>,
  ) => Promise<Array<{ assetId: string; token: string }>>;
}

let socket: PartySocket | null = null;
/**
 * The websocket protocol isn't naturally request/response — this bridges the
 * one `request-media-upload-tokens` in flight (host uploads one round at a
 * time) back to a promise the caller can await.
 */
let pendingUploadTokenRequest: {
  resolve: (tokens: Array<{ assetId: string; token: string }>) => void;
  reject: (error: Error) => void;
} | null = null;

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
      } else if (message.type === 'media-upload-tokens') {
        pendingUploadTokenRequest?.resolve(message.tokens);
        pendingUploadTokenRequest = null;
      } else {
        pendingUploadTokenRequest?.reject(new Error(message.message));
        pendingUploadTokenRequest = null;
        set({ error: message.message });
      }
    });

    socket.addEventListener('close', () => set({ status: 'closed' }));
  },
  send: (message) => {
    socket?.send(JSON.stringify(message));
  },
  requestMediaUploadTokens: (roundId, assets) => {
    return new Promise((resolve, reject) => {
      pendingUploadTokenRequest = { resolve, reject };
      get().send({ type: 'request-media-upload-tokens', roundId, assets });
    });
  },
}));
