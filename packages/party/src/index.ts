import { routePartykitRequest } from 'partyserver';
import type { Env } from './env.js';
import { GameRoom } from './rooms/game-room.js';

export { GameRoom };

export default {
  async fetch(request, env, _ctx): Promise<Response> {
    return (await routePartykitRequest(request, env)) ?? new Response('Not found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
