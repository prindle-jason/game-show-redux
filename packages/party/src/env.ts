import type { GameRoom } from './rooms/game-room.js';

export interface Env {
  GAME_ROOM: DurableObjectNamespace<GameRoom>;
  MEDIA: R2Bucket;
}
