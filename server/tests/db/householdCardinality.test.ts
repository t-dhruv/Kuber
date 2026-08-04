import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  accessTokenFor,
  createHousehold,
  createTestApp,
  migrationsDir,
  prisma,
  resetDatabase,
} from './harness';

// ADR-0004. `HouseholdMember` is a join table with @@unique([userId, householdId]),
// so the schema said many-to-many — while five auth paths resolved the session's
// Household as `householdMembers[0]`, with no ordering and no switcher anywhere.
// A User in two Households would land in an arbitrary one, not necessarily the
// same one twice running. In a finance app that means opening the books and
// seeing different numbers than yesterday.
//
// The constraint is the whole point of this slice and it is invisible below a
// real database: a mocked Prisma returns whatever it is told, so "the second
// membership is rejected" can only be proven here.

beforeEach(async () => {
  await resetDatabase();
});

describe('the database enforces one Household per User', () => {
  it('refuses a second membership for the same User', async () => {
    const first = await createHousehold();
    const other = await prisma.household.create({ data: { name: 'Someone Else' } });

    await expect(
      prisma.householdMember.create({
        data: { userId: first.user.id, householdId: other.id, role: 'member' },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('still allows one membership each for different Users', async () => {
    const a = await createHousehold();
    const b = await createHousehold();

    expect(a.member.householdId).not.toBe(b.member.householdId);
    expect(await prisma.householdMember.count()).toBe(2);
  });

  it('retains the join table rather than collapsing it into a column', async () => {
    // Multi-Household support stays reachable later without a destructive
    // migration, which is the reason the constraint went on the join table
    // instead of the schema being flattened.
    const columns = await prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'household_members'
    `;
    const names = columns.map((column) => column.column_name);
    expect(names).toContain('userId');
    expect(names).toContain('householdId');
  });
});

describe('inviting someone who already belongs to a Household', () => {
  it('is refused with a message that explains why', async () => {
    const owner = await createHousehold();
    const existing = await createHousehold();
    const app = createTestApp();

    const res = await request(app)
      .post('/api/v1/settings/household/invite')
      .set('Authorization', `Bearer ${await accessTokenFor(app, owner)}`)
      .send({ email: existing.user.email, role: 'member' });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already belongs to a household/i);
    expect(await prisma.householdInvite.count()).toBe(0);
  });

  it('is still refused when the person is already in the inviting Household', async () => {
    const owner = await createHousehold();
    const app = createTestApp();

    const res = await request(app)
      .post('/api/v1/settings/household/invite')
      .set('Authorization', `Bearer ${await accessTokenFor(app, owner)}`)
      .send({ email: owner.user.email, role: 'member' });

    expect(res.status).toBe(409);
    expect(await prisma.householdInvite.count()).toBe(0);
  });
});

describe('the migration that introduces the constraint', () => {
  it('applies to a database that already contains a User in two Households', async () => {
    // The replay test proves the history applies to an empty database. This is
    // the other half: an Instance whose data predates the rule must survive the
    // upgrade rather than failing halfway through with a constraint violation.
    const sql = await readFile(join(migrationsDir, '20260804170000_one_household_per_user', 'migration.sql'), 'utf8');
    // Strip `--` comments before splitting: prose runs to end of line and may
    // itself contain a semicolon, which would otherwise cut a statement in two.
    const statements = sql
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n')
      .split(';')
      .map((statement) => statement.trim())
      .filter((statement) => statement.length > 0);

    // This is the one test that touches the schema rather than only the data,
    // and the database is shared by every file in the run. The finally block is
    // what stops a failure here from leaving the constraint missing for
    // everything that comes after.
    let fixture: Awaited<ReturnType<typeof createHousehold>>;
    let second: { id: string };
    try {
      await prisma.$executeRawUnsafe('DROP INDEX IF EXISTS "household_members_userId_key"');
      fixture = await createHousehold();
      second = await prisma.household.create({ data: { name: 'The Other Books' } });
      await prisma.$executeRawUnsafe(
        `INSERT INTO "household_members" ("id", "userId", "householdId", "role", "joinedAt")
         VALUES ('later-membership', $1, $2, 'member', NOW() + INTERVAL '1 day')`,
        fixture.user.id,
        second.id,
      );
      expect(await prisma.householdMember.count({ where: { userId: fixture.user.id } })).toBe(2);

      for (const statement of statements) {
        await prisma.$executeRawUnsafe(statement);
      }
    } finally {
      await prisma.$executeRawUnsafe(
        'CREATE UNIQUE INDEX IF NOT EXISTS "household_members_userId_key" ON "household_members"("userId")',
      );
    }

    // The earliest membership is the one kept, so the User stays in the
    // Household they actually joined first.
    const remaining = await prisma.householdMember.findMany({ where: { userId: fixture.user.id } });
    expect(remaining).toHaveLength(1);
    expect(remaining[0].householdId).toBe(fixture.household.id);

    // And the constraint is in force afterwards.
    await expect(
      prisma.householdMember.create({
        data: { userId: fixture.user.id, householdId: second.id, role: 'member' },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });
});

describe('redeeming an invite as someone who already has a Household', () => {
  it('is refused with a message about the one-Household rule', async () => {
    // The invite endpoint refuses to issue such a link, so this covers the link
    // that predates the rule, or one issued to an address that joined a
    // Household in between.
    const owner = await createHousehold();
    const existing = await createHousehold();
    const invite = await prisma.householdInvite.create({
      data: {
        householdId: owner.household.id,
        email: existing.user.email,
        role: 'member',
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    const res = await request(createTestApp()).post('/api/v1/auth/signup').send({
      email: existing.user.email,
      password: 'correct-horse-battery-staple',
      firstName: 'Already',
      lastName: 'Placed',
      inviteToken: invite.token,
    });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already belongs to a household/i);
    expect(await prisma.householdMember.count()).toBe(2);
  });
});

describe('inviting a brand-new User', () => {
  it('works end to end, from invite to membership', async () => {
    const owner = await createHousehold();
    const app = createTestApp();
    const email = `partner-${Date.now()}@example.test`;

    const invited = await request(app)
      .post('/api/v1/settings/household/invite')
      .set('Authorization', `Bearer ${await accessTokenFor(app, owner)}`)
      .send({ email, role: 'member' });
    expect(invited.status).toBe(200);

    const invite = await prisma.householdInvite.findFirst({ where: { email } });
    expect(invite).not.toBeNull();

    const signup = await request(app).post('/api/v1/auth/signup').send({
      email,
      password: 'correct-horse-battery-staple',
      firstName: 'New',
      lastName: 'Partner',
      inviteToken: invite!.token,
    });
    expect(signup.status).toBe(201);

    const membership = await prisma.householdMember.findFirst({ where: { user: { email } } });
    expect(membership?.householdId).toBe(owner.household.id);
    expect(await prisma.householdMember.count()).toBe(2);
  });
});
