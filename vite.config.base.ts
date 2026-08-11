import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export const baseConfig = defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/setup-tests.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
