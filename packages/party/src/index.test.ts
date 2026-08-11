import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

describe('worker fetch handler', () => {
  it('returns 404 for unmatched routes', async () => {
    const response = await SELF.fetch('https://example.com/not-a-party-route');

    expect(response.status).toBe(404);
  });
});
