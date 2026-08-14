import { routePartykitRequest } from 'partyserver';
import type { Env } from './env.js';
import { handleMediaGet, handleMediaOptions, handleMediaUpload } from './media.js';
import { GameRoom } from './rooms/game-room.js';

export { GameRoom };

export default {
  async fetch(request, env, _ctx): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname.startsWith('/media/rooms/')) {
      return handleMediaGet(env, url.pathname);
    }
    if (request.method === 'PUT' && url.pathname === '/media/upload') {
      return handleMediaUpload(env, request);
    }
    if (request.method === 'OPTIONS' && url.pathname === '/media/upload') {
      return handleMediaOptions();
    }

    return (await routePartykitRequest(request, env)) ?? new Response('Not found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
