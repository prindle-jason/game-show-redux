import type { Env } from './env.js';

/**
 * Deterministic R2 key for one round's asset — shared by upload (PUT) and
 * serving (GET), and by the queue-removal cleanup that deletes this prefix.
 */
export function mediaKey(roomId: string, roundId: string, assetId: string): string {
  return `rooms/${roomId}/${roundId}/${assetId}`;
}

export interface UploadTokenPayload {
  roomId: string;
  roundId: string;
  assetId: string;
  contentType: string;
  maxBytes: number;
  exp: number;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(value: string): Uint8Array {
  const padded = value
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

/**
 * Short-lived, signed proof that the DO already checked "host, lobby, and
 * within size/content-type limits" for this exact asset — verified by the
 * plain `PUT /media/upload` route without touching the DO (see media.ts's
 * milestone doc: keeps large uploads off the single-threaded room instance).
 */
export async function signUploadToken(
  secret: string,
  payload: UploadTokenPayload,
): Promise<string> {
  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));
  const key = await hmacKey(secret);
  const signature = await crypto.subtle.sign('HMAC', key, payloadBytes);
  return `${base64UrlEncode(payloadBytes)}.${base64UrlEncode(new Uint8Array(signature))}`;
}

export async function verifyUploadToken(
  secret: string,
  token: string,
): Promise<UploadTokenPayload | null> {
  const [payloadPart, signaturePart] = token.split('.');
  if (!payloadPart || !signaturePart) return null;

  const payloadBytes = base64UrlDecode(payloadPart);
  const key = await hmacKey(secret);
  const valid = await crypto.subtle.verify(
    'HMAC',
    key,
    base64UrlDecode(signaturePart),
    payloadBytes,
  );
  if (!valid) return null;

  let payload: UploadTokenPayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(payloadBytes));
  } catch {
    return null;
  }

  if (typeof payload.exp !== 'number' || payload.exp < Date.now()) return null;
  return payload;
}

/**
 * Media is served/uploaded cross-origin from `player-app` (a different dev
 * port, and a different domain in production), and the upload token in the
 * URL is the sole auth check — there's no session/cookie trust boundary a
 * stricter origin allowlist would protect, so a wildcard is fine here.
 */
const CORS_HEADERS = { 'Access-Control-Allow-Origin': '*' };

function corsResponse(body: BodyInit | null, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) headers.set(key, value);
  return new Response(body, { ...init, headers });
}

/** Handles the CORS preflight for `PUT /media/upload`, triggered by its Content-Type header. */
export function handleMediaOptions(): Response {
  return corsResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

/** Serves a previously-uploaded asset. `pathname` is the incoming request's full path. */
export async function handleMediaGet(env: Env, pathname: string): Promise<Response> {
  const key = pathname.slice('/media/'.length);
  const object = await env.MEDIA.get(key);
  if (!object) return corsResponse('Not found', { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  headers.set('Access-Control-Allow-Origin', CORS_HEADERS['Access-Control-Allow-Origin']);
  return new Response(object.body, { headers });
}

/**
 * Plain, stateless upload route — deliberately bypasses the room Durable
 * Object (see milestone doc) so large uploads don't contend with that room's
 * websocket traffic. All authorization already happened when the token was
 * signed; this only checks the signature/expiry and the declared limits.
 */
export async function handleMediaUpload(env: Env, request: Request): Promise<Response> {
  const token = new URL(request.url).searchParams.get('token');
  if (!token) return corsResponse('Missing token', { status: 400 });

  const payload = await verifyUploadToken(env.MEDIA_UPLOAD_SECRET, token);
  if (!payload) return corsResponse('Invalid or expired token', { status: 403 });

  const contentType = request.headers.get('Content-Type') ?? '';
  if (contentType !== payload.contentType) {
    return corsResponse('Content-Type does not match token', { status: 400 });
  }

  const contentLength = Number(request.headers.get('Content-Length'));
  if (!Number.isFinite(contentLength) || contentLength <= 0 || contentLength > payload.maxBytes) {
    return corsResponse('File too large', { status: 413 });
  }

  const key = mediaKey(payload.roomId, payload.roundId, payload.assetId);
  await env.MEDIA.put(key, request.body, { httpMetadata: { contentType } });
  return corsResponse(null, { status: 204 });
}
