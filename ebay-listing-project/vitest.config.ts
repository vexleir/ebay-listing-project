/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Vitest config for the React frontend. Server (CJS) tests stay on
// node:test — they're already wired into `npm run test:server`.
//
// happy-dom over jsdom: smaller install, faster boot, and we don't need
// the full DOM surface for utility + component tests.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
