import { defineConfig } from 'vitest/config';

import { resolveTestDatabaseUrl } from './tests/db/testDatabaseUrl';

// The database-backed suite (Seam B) runs under its own config because it must
// NOT load src/test-setup.ts — that file mocks @prisma/client globally, which
// is exactly what these tests exist to avoid. Keeping the two configs separate
// is what makes "this test talked to a real database" true by construction
// rather than by convention.

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/db/**/*.test.ts'],
    globalSetup: ['tests/db/globalSetup.ts'],
    // Closes each worker's connection pool. Deliberately NOT src/test-setup.ts.
    setupFiles: ['tests/db/setup.ts'],

    // One database, shared by every file: run them one at a time so a
    // resetDatabase() in one file cannot empty the table another is reading.
    fileParallelism: false,
    sequence: { concurrent: false },

    // Migration replay and bcrypt are both slower than a mocked call.
    testTimeout: 30_000,
    hookTimeout: 60_000,

    env: {
      NODE_ENV: 'test',
      // The application resolves its own client from DATABASE_URL, so pointing
      // it here is what makes the app under test and the harness share rows.
      DATABASE_URL: resolveTestDatabaseUrl(),
      JWT_SECRET: 'test-jwt-secret',
      JWT_REFRESH_SECRET: 'test-jwt-refresh-secret',
      AI_ENCRYPTION_KEY: '0'.repeat(64),
      CLIENT_URL: 'http://localhost:3000',
    },
  },
});
