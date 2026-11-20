import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    strictPort: true,
    // The project lives in a OneDrive folder; polling keeps hot reload reliable there.
    watch: { usePolling: true, interval: 300 },
  },
  build: {
    rollupOptions: {
      // two pages: the Bar Gambling site (/) and game 1 (/holdem/)
      input: {
        site: resolve(import.meta.dirname, 'index.html'),
        holdem: resolve(import.meta.dirname, 'holdem/index.html'),
      },
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    testTimeout: 30000, // the deck-dealing tests simulate thousands of hands
  },
});
