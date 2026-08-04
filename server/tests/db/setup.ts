import { afterAll } from 'vitest';

import { prisma } from './harness';

// Each test file gets its own worker process and therefore its own client.
// Closing the pool at the end of the file keeps a long run from accumulating
// idle Postgres connections until the server refuses new ones.
afterAll(async () => {
  await prisma.$disconnect();
});
