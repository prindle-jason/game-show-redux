/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PARTY_HOST: string;
  /** Absolute origin for the media upload/serving routes (see party's media.ts). */
  readonly VITE_MEDIA_BASE_URL: string;
  /** Absolute origin for the room-mint route (see party's create-room.ts). */
  readonly VITE_PARTY_BASE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
