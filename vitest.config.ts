import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'dist/**'],
      thresholds: {
        statements: 90,
        branches: 85,
        functions: 95,
      },
    },
    environmentMatchGlobs: [
      ['tests/integration/react.test.ts', 'jsdom'],
    ],
    fakeTimers: {
      shouldAdvanceTime: false,
    },
  },
});
