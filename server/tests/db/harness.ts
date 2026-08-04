import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import type { Express } from 'express';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';

import { createApp } from '../../src/app';
import { resolveTestDatabaseUrl } from './testDatabaseUrl';

// The real-database seam (Seam B). Everything here talks to an actual migrated
// Postgres and boots the actual application, so a test written against it
// cannot be satisfied by a mock that returns whatever it is told.
//
// See tests/db/README.md for how to extend this.

export const testDatabaseUrl = resolveTestDatabaseUrl();

export const migrationsDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'prisma',
  'migrations',
);

/**
 * A real client, pointed at the test database.
 *
 * The application's own `src/lib/prisma` reads `DATABASE_URL`, which the db
 * Vitest config already sets to this same URL — so the app under test and this
 * client see the same rows.
 */
export const prisma = new PrismaClient({ datasourceUrl: testDatabaseUrl });

/**
 * Boots the real application — the entry point's full middleware stack, security
 * controls and mounted routers — with no listener and no background jobs.
 *
 * Each call yields a fresh app, so no per-app middleware state leaks between
 * tests.
 *
 * Caveat for a rate-limiting test: all three limiters carry
 * `skip: () => process.env.NODE_ENV === 'test'`, and this suite runs with
 * `NODE_ENV=test`, so they are no-ops here. Asserting that the auth limiter
 * buckets per client means changing that skip condition first.
 */
export function createTestApp(): Express {
  return createApp();
}

/**
 * Tables whose contents come from a migration rather than from a test.
 *
 * `20260424110000_add_transaction_links` INSERTs the three link types every
 * Transfer and duplicate link references. Truncating them would empty the table
 * for the rest of the run — nothing puts them back — and a later slice touching
 * transaction links would hit foreign-key failures for reasons that had nothing
 * to do with its own test. Add to this list if a migration ever seeds another
 * table.
 */
const MIGRATION_SEEDED_TABLES = new Set<string>(['transaction_link_types']);

let tableNames: string[] | null = null;

async function truncatableTables(): Promise<string[]> {
  if (tableNames) return tableNames;

  const rows = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;
  tableNames = rows
    .filter((row) => !MIGRATION_SEEDED_TABLES.has(row.tablename))
    .map((row) => `"public"."${row.tablename}"`);
  return tableNames;
}

/**
 * Empties every application table, leaving the migration history and the
 * reference data seeded by migrations intact.
 *
 * Call this in `beforeEach`. Truncating is much faster than re-migrating and
 * keeps each test's starting point identical to a freshly installed Instance.
 */
export async function resetDatabase(): Promise<void> {
  const tables = await truncatableTables();
  if (tables.length === 0) return;

  // One statement so foreign keys never block the order of removal.
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables.join(', ')} RESTART IDENTITY CASCADE`);
}

/** A Member's role, per CONTEXT.md. */
export type MemberRole = 'owner' | 'member';

export type HouseholdFixture = {
  household: { id: string; name: string };
  user: { id: string; email: string; firstName: string; lastName: string };
  member: { id: string; userId: string; householdId: string; role: MemberRole };
  /** The plaintext password, so a test can log this User in. */
  password: string;
};

export type CreateHouseholdOptions = {
  /** Household name. Defaults to a unique name. */
  name?: string;
  /** User email. Defaults to a unique address. */
  email?: string;
  password?: string;
  role?: MemberRole;
  /**
   * Whether the User's email is already verified. Defaults to true, because
   * login refuses unverified Users and most tests are not about verification.
   */
  emailVerified?: boolean;
};

let fixtureCount = 0;

/**
 * Creates a Household with one User who belongs to it — the smallest fixture
 * that can log in and own records.
 *
 * Call it twice to get two Households for an isolation test; the defaults are
 * unique per call.
 */
export async function createHousehold(
  options: CreateHouseholdOptions = {},
): Promise<HouseholdFixture> {
  const seq = ++fixtureCount;
  const {
    name = `Test Household ${seq}`,
    email = `fixture-${seq}-${Date.now()}@example.test`,
    password = 'correct-horse-battery-staple',
    role = 'owner',
    emailVerified = true,
  } = options;

  const household = await prisma.household.create({ data: { name } });
  const user = await prisma.user.create({
    data: {
      email: email.toLowerCase(),
      passwordHash: await bcrypt.hash(password, 4),
      firstName: 'Fixture',
      lastName: `User ${seq}`,
      emailVerifiedAt: emailVerified ? new Date() : null,
    },
  });
  const member = await prisma.householdMember.create({
    data: { userId: user.id, householdId: household.id, role },
  });

  return { household, user, member: { ...member, role }, password };
}

/**
 * Logs a fixture in through the real login endpoint and returns its access
 * token, for tests that need to call an authenticated route.
 *
 * Deliberately a real login rather than a hand-signed JWT: the token then
 * carries whatever claims the application actually issues, so a test cannot
 * accidentally assert against a session shape the app never produces.
 */
export async function accessTokenFor(app: Express, fixture: HouseholdFixture): Promise<string> {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: fixture.user.email, password: fixture.password });

  if (res.status !== 200 || !res.body.accessToken) {
    throw new Error(`Could not log in fixture ${fixture.user.email}: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body.accessToken as string;
}
