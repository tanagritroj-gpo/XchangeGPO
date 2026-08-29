import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    include: ['**/__tests__/**/*.test.ts'],
    exclude: ['node_modules', '.next'],
    // auth tests hash with real bcryptjs — cost 12 (~0.2–0.4s/hash) can add up when a
    // test does several hashes on a loaded CI runner. Generous ceiling so a slow-but-
    // healthy run doesn't flake; well-behaved tests still finish in milliseconds.
    testTimeout: 20000,
  },
});
