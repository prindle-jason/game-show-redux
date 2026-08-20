import type { CreateRoomResponse } from '@gameshow/schema';

export async function createRoom(): Promise<CreateRoomResponse> {
  const response = await fetch(`${import.meta.env.VITE_PARTY_BASE_URL}/rooms`, {
    method: 'POST',
  });
  if (!response.ok) throw new Error('Could not create a room');
  return (await response.json()) as CreateRoomResponse;
}
