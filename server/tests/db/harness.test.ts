import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import { createHousehold, createTestApp, prisma, resetDatabase } from './harness';

// Proves the harness itself does what the slices built on top of it assume:
// the real entry point boots, rows are real, constraints are real, and the
// fixtures produce a Household a later test can log into.

beforeEach(async () => {
  await resetDatabase();
});

describe('the harness boots the real application', () => {
  it('serves the health endpoint from the real app', async () => {
    const app = createTestApp();

    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', name: 'Kuber API' });
  });

  it('mounts the real routers, so an unauthenticated API call is rejected', async () => {
    const app = createTestApp();

    const res = await request(app).get('/api/v1/accounts');

    expect(res.status).toBe(401);
  });
});

describe('the harness talks to a real database', () => {
  it('reads back rows it writes', async () => {
    const household = await prisma.household.create({ data: { name: 'Real Rows' } });

    const found = await prisma.household.findUnique({ where: { id: household.id } });

    expect(found?.name).toBe('Real Rows');
  });

  it('observes a real constraint violation rather than a mocked one', async () => {
    // The unique index on users.email exists only in the database. A mocked
    // client returns whatever it is told, so this assertion is only meaningful
    // at this seam.
    const { user } = await createHousehold();

    await expect(
      prisma.user.create({
        data: {
          email: user.email,
          passwordHash: 'x',
          firstName: 'Duplicate',
          lastName: 'Email',
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('empties the database between tests', async () => {
    expect(await prisma.household.count()).toBe(0);
    expect(await prisma.user.count()).toBe(0);
  });

  it('keeps reference data seeded by migrations across a reset', async () => {
    // These three rows are INSERTed by a migration, not by a test. Nothing puts
    // them back if a reset removes them, so the failure would surface much
    // later as a foreign-key error in an unrelated slice.
    await resetDatabase();

    const linkTypes = await prisma.transactionLinkType.findMany({ orderBy: { id: 'asc' } });

    expect(linkTypes.map((type) => type.name)).toEqual([
      'duplicates',
      'relates-to',
      'repayment',
    ]);
  });
});

describe('the Household fixture', () => {
  it('creates a Household with an owning User', async () => {
    const { household, user, member } = await createHousehold();

    expect(member.role).toBe('owner');
    expect(member.householdId).toBe(household.id);
    expect(member.userId).toBe(user.id);
  });

  it('creates a User who can log in through the real app', async () => {
    const app = createTestApp();
    const { user, password } = await createHousehold();

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
  });

  it('creates distinct Households, so isolation tests have two sides', async () => {
    const one = await createHousehold({ name: 'Household One' });
    const two = await createHousehold({ name: 'Household Two' });

    expect(one.household.id).not.toBe(two.household.id);
    expect(one.user.email).not.toBe(two.user.email);
  });
});
