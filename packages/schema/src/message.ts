import { z } from 'zod';
import type { ContestantRoomView, HostRoomView } from './room.js';
import { roundSchema } from './round.js';

/**
 * Messages a client sends over the websocket — a trust boundary, so this is
 * zod, unlike the plain-TS server -> client types below. `round-action`'s
 * payload is intentionally `unknown`: which round-type action schema applies
 * depends on the room's current active round type, which only `party` knows
 * at parse time (it re-validates via `roundTypeDefinitions[type].actionSchema`
 * from round.ts).
 */
export const clientMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('join'), name: z.string().min(1) }),
  z.object({ type: z.literal('add-round-to-queue'), round: roundSchema }),
  z.object({
    type: z.literal('remove-from-queue'),
    queueEntryId: z.string().min(1),
  }),
  z.object({
    type: z.literal('reorder-queue'),
    queueEntryIds: z.array(z.string().min(1)),
  }),
  z.object({ type: z.literal('start-game') }),
  z.object({ type: z.literal('advance-queue') }),
  z.object({ type: z.literal('return-to-lobby') }),
  z.object({ type: z.literal('reset-scores') }),
  z.object({ type: z.literal('kick-player'), playerId: z.string().min(1) }),
  z.object({ type: z.literal('round-action'), action: z.unknown() }),
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;

/**
 * Messages `party` sends to clients — plain TS, not zod, since `party` fully
 * controls their shape (see room.ts for the host/contestant view split).
 */
export type ServerMessage =
  | { type: 'joined'; playerId: string; isHost: boolean }
  | { type: 'kicked'; reason?: string }
  | { type: 'room-state'; view: HostRoomView | ContestantRoomView }
  | { type: 'error'; message: string };
