import { describe, expect, it, vi } from 'vitest';
import { mintRoomCode, randomRoomCode } from './create-room.js';

describe('randomRoomCode', () => {
  it('generates a 4-character code from the unambiguous alphabet', () => {
    const code = randomRoomCode();
    expect(code).toHaveLength(4);
    expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/);
  });

  it('is deterministic given a fixed random source', () => {
    const random = () => 0;
    expect(randomRoomCode(random)).toBe('AAAA');
  });
});

describe('mintRoomCode', () => {
  it('returns the first reserved code and its token', async () => {
    const reserve = vi.fn(async () => 'token-1');
    const result = await mintRoomCode(reserve, () => 'CODE');

    expect(result).toEqual({ roomId: 'CODE', hostToken: 'token-1' });
    expect(reserve).toHaveBeenCalledTimes(1);
    expect(reserve).toHaveBeenCalledWith('CODE');
  });

  it('retries with a new candidate on collision', async () => {
    const reserve = vi.fn(async (code: string) => (code === 'AAAA' ? null : 'token-2'));
    const codes = ['AAAA', 'BBBB'];
    let i = 0;
    const generateCode = () => codes[i++] ?? 'ZZZZ';

    const result = await mintRoomCode(reserve, generateCode);

    expect(result).toEqual({ roomId: 'BBBB', hostToken: 'token-2' });
    expect(reserve).toHaveBeenCalledTimes(2);
  });

  it('gives up after maxAttempts collisions and returns null', async () => {
    const reserve = vi.fn(async () => null);

    const result = await mintRoomCode(reserve, () => 'CODE', 3);

    expect(result).toBeNull();
    expect(reserve).toHaveBeenCalledTimes(3);
  });
});
