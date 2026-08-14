import type { GameRoom } from './rooms/game-room.js';

export interface Env {
  GAME_ROOM: DurableObjectNamespace<GameRoom>;
  MEDIA: R2Bucket;
  /** Absolute origin used to build fetchable media URLs (see media.ts). */
  MEDIA_BASE_URL: string;
  /** HMAC signing key for short-lived upload tokens (see media.ts). */
  MEDIA_UPLOAD_SECRET: string;
}
