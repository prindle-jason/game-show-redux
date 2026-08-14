import { env, exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { signUploadToken, verifyUploadToken } from './media.js';

describe('signUploadToken / verifyUploadToken', () => {
  const payload = {
    roomId: 'room-1',
    roundId: 'round-1',
    assetId: 'asset-1',
    contentType: 'image/png',
    maxBytes: 1024,
    exp: Date.now() + 60_000,
  };

  it('round-trips a validly-signed token', async () => {
    const token = await signUploadToken('test-secret', payload);
    expect(await verifyUploadToken('test-secret', token)).toEqual(payload);
  });

  it('rejects a token signed with a different secret', async () => {
    const token = await signUploadToken('secret-a', payload);
    expect(await verifyUploadToken('secret-b', token)).toBeNull();
  });

  it('rejects an expired token', async () => {
    const expired = { ...payload, exp: Date.now() - 1000 };
    const token = await signUploadToken('test-secret', expired);
    expect(await verifyUploadToken('test-secret', token)).toBeNull();
  });

  it('rejects a malformed token', async () => {
    expect(await verifyUploadToken('test-secret', 'not-a-token')).toBeNull();
  });
});

describe('GET/PUT /media routes', () => {
  it('uploads then serves an asset end-to-end', async () => {
    const payload = {
      roomId: 'room-x',
      roundId: 'round-x',
      assetId: 'asset-x',
      contentType: 'image/png',
      maxBytes: 1024,
      exp: Date.now() + 60_000,
    };
    const token = await signUploadToken(env.MEDIA_UPLOAD_SECRET, payload);
    const body = new Uint8Array([1, 2, 3, 4]);

    const putResponse = await exports.default.fetch(
      `https://example.com/media/upload?token=${encodeURIComponent(token)}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'image/png', 'Content-Length': String(body.byteLength) },
        body,
      },
    );
    expect(putResponse.status).toBe(204);
    expect(putResponse.headers.get('Access-Control-Allow-Origin')).toBe('*');

    const getResponse = await exports.default.fetch(
      'https://example.com/media/rooms/room-x/round-x/asset-x',
    );
    expect(getResponse.status).toBe(200);
    expect(getResponse.headers.get('Content-Type')).toBe('image/png');
    expect(getResponse.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(new Uint8Array(await getResponse.arrayBuffer())).toEqual(body);
  });

  it('answers the upload preflight with the allowed method/header set', async () => {
    const response = await exports.default.fetch('https://example.com/media/upload', {
      method: 'OPTIONS',
    });
    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, PUT, OPTIONS');
    expect(response.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type');
  });

  it('returns 404 for a missing asset', async () => {
    const response = await exports.default.fetch('https://example.com/media/rooms/none/none/none');
    expect(response.status).toBe(404);
  });

  it('rejects an upload with an invalid token', async () => {
    const response = await exports.default.fetch('https://example.com/media/upload?token=bogus', {
      method: 'PUT',
      headers: { 'Content-Type': 'image/png', 'Content-Length': '4' },
      body: new Uint8Array([1, 2, 3, 4]),
    });
    expect(response.status).toBe(403);
  });

  it('rejects an upload whose Content-Type does not match the token', async () => {
    const payload = {
      roomId: 'r',
      roundId: 'rd',
      assetId: 'a',
      contentType: 'image/png',
      maxBytes: 1024,
      exp: Date.now() + 60_000,
    };
    const token = await signUploadToken(env.MEDIA_UPLOAD_SECRET, payload);
    const response = await exports.default.fetch(
      `https://example.com/media/upload?token=${encodeURIComponent(token)}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'image/webp', 'Content-Length': '4' },
        body: new Uint8Array([1, 2, 3, 4]),
      },
    );
    expect(response.status).toBe(400);
  });

  it('rejects an upload larger than the token allows', async () => {
    const payload = {
      roomId: 'r',
      roundId: 'rd',
      assetId: 'a',
      contentType: 'image/png',
      maxBytes: 2,
      exp: Date.now() + 60_000,
    };
    const token = await signUploadToken(env.MEDIA_UPLOAD_SECRET, payload);
    const body = new Uint8Array([1, 2, 3, 4]);
    const response = await exports.default.fetch(
      `https://example.com/media/upload?token=${encodeURIComponent(token)}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'image/png', 'Content-Length': String(body.byteLength) },
        body,
      },
    );
    expect(response.status).toBe(413);
  });
});
