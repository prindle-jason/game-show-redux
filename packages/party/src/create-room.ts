import type { CreateRoomResponse } from '@gameshow/schema';
import { getServerByName } from 'partyserver';
import { corsResponse } from './cors.js';
import type { Env } from './env.js';

/** Excludes 0/O, 1/I/L — a code read aloud or handwritten shouldn't be ambiguous. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 4;
const MAX_MINT_ATTEMPTS = 5;

export function randomRoomCode(random: () => number = Math.random): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
  }
  return code;
}

/**
 * Generates candidate codes and asks `reserve` to atomically check-and-claim
 * each one, retrying on collision (`reserve` returns `null`). Pure/injectable
 * so the retry path is a plain unit test — no real Durable Object required,
 * see create-room.test.ts.
 */
export async function mintRoomCode(
  reserve: (code: string) => Promise<string | null>,
  generateCode: () => string = randomRoomCode,
  maxAttempts: number = MAX_MINT_ATTEMPTS,
): Promise<CreateRoomResponse | null> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const roomId = generateCode();
    const hostToken = await reserve(roomId);
    if (hostToken) return { roomId, hostToken };
  }
  return null;
}

/**
 * `POST /rooms` — deliberately a bare POST (no body, no custom headers) so
 * the browser treats it as a CORS "simple request" and skips a preflight;
 * only the response needs `Access-Control-Allow-Origin`.
 */
export async function handleCreateRoom(env: Env): Promise<Response> {
  const result = await mintRoomCode(async (code) => {
    const stub = await getServerByName(env.GAME_ROOM, code);
    return stub.tryReserveHost();
  });

  if (!result) return corsResponse('Could not allocate a room code', { status: 500 });

  return corsResponse(JSON.stringify(result), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
