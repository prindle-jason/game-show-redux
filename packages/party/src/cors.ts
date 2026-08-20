/**
 * `party`'s HTTP routes (media, room minting) are called cross-origin from
 * `player-app` — a different dev port, and a different domain in production —
 * and none of them carry a session/cookie trust boundary a stricter origin
 * allowlist would protect, so a wildcard is fine here.
 */
export const CORS_HEADERS = { 'Access-Control-Allow-Origin': '*' };

export function corsResponse(body: BodyInit | null, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) headers.set(key, value);
  return new Response(body, { ...init, headers });
}
