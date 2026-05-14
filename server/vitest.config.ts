import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['src/test-setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json-summary'],
      include: ['src/lib/**', 'src/routes/**'],
      thresholds: {
        statements: 33,
        branches: 26,
        functions: 40,
        lines: 35,
      },
    },
  },
});
