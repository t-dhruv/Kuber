import { execFileSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

import { resolveTestDatabaseUrl } from './testDatabaseUrl';

// Runs once, before any db-backed test file. Creates the test database if it is
// absent, empties it, and replays the whole migration history into it — which
// is both the setup every test needs and the thing migrations.test.ts asserts.
//
// Raw queries are issued through PrismaClient rather than a Postgres driver so
// the suite adds no dependency the server does not already ship.

async function withClient<T>(url: string, fn: (client: PrismaClient) => Promise<T>): Promise<T> {
  const client = new PrismaClient({ datasourceUrl: url });
  try {
    return await fn(client);
  } finally {
    await client.$disconnect();
  }
}

async function ensureDatabaseExists(url: string): Promise<void> {
  const databaseName = new URL(url).pathname.replace(/^\//, '');

  // CREATE DATABASE has to be issued from another database on the same cluster.
  const admin = new URL(url);
  admin.pathname = '/postgres';

  await withClient(admin.toString(), async (client) => {
    const existing = await client.$queryRaw<
      { datname: string }[]
    >`SELECT datname FROM pg_database WHERE datname = ${databaseName}`;
    if (existing.length > 0) return;

    // Identifiers cannot be parameterised. The name is already constrained to
    // the `_test` suffix by resolveTestDatabaseUrl; quoting covers the rest.
    await client.$executeRawUnsafe(`CREATE DATABASE "${databaseName.replace(/"/g, '""')}"`);
  });
}

async function emptySchema(url: string): Promise<void> {
  await withClient(url, async (client) => {
    // Dropping the schema rather than truncating is what makes the migration
    // replay a genuine first boot: nothing survives from a previous run.
    await client.$executeRawUnsafe('DROP SCHEMA IF EXISTS public CASCADE');
    await client.$executeRawUnsafe('CREATE SCHEMA public');
  });
}

export default async function setup(): Promise<void> {
  const url = resolveTestDatabaseUrl();

  await ensureDatabaseExists(url);
  await emptySchema(url);

  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'inherit',
  });
}
