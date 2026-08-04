import type { Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  accessTokenFor,
  createAccount,
  createHousehold,
  createTestApp,
  createTransaction,
  prisma,
  resetDatabase,
} from './harness';

// Issue #161. The Household is the data-isolation boundary (CONTEXT.md): every
// financial record belongs to exactly one, and no query may cross between them.
// It is the product's core safety property, and until this file existed it had
// only ever been asserted against a mocked Prisma — which returns whatever it is
// told and therefore cannot enforce anything.
//
// Here both Households are real rows, created through the real endpoints, and
// every attempt below is a real request carrying a real access token.

let app: Express;

/** Alice and Bob, in separate Households, each with an Account and a Transaction. */
async function twoHouseholds() {
  const alice = await createHousehold({ name: 'Alice Household' });
  const bob = await createHousehold({ name: 'Bob Household' });

  const aliceToken = await accessTokenFor(app, alice);
  const bobToken = await accessTokenFor(app, bob);

  const aliceAccount = await createAccount(app, aliceToken, { name: 'Alice Chequing' });
  const aliceTransaction = await createTransaction(app, aliceToken, {
    accountId: aliceAccount.id,
    description: 'Alice groceries',
    amount: -80.25,
  });

  return { alice, bob, aliceToken, bobToken, aliceAccount, aliceTransaction };
}

/** Nothing in a response body may mention the other Household's records. */
function mentions(res: request.Response, needle: string): boolean {
  return JSON.stringify(res.body).includes(needle);
}

beforeEach(async () => {
  await resetDatabase();
  // A fresh app per test: the rate limiters are live, and a fresh app means a
  // fresh counter, so one test's logins cannot exhaust another's budget.
  app = createTestApp();
});

describe('reading another Household', () => {
  it('does not list its Accounts', async () => {
    const { bobToken, aliceAccount } = await twoHouseholds();

    const res = await request(app)
      .get('/api/v1/accounts')
      .set('Authorization', `Bearer ${bobToken}`);

    expect(res.status).toBe(200);
    expect(res.body.groups).toEqual([]);
    expect(mentions(res, aliceAccount.id)).toBe(false);
    expect(mentions(res, 'Alice Chequing')).toBe(false);
  });

  it('does not fetch one of its Accounts by id', async () => {
    const { bobToken, aliceAccount } = await twoHouseholds();

    const res = await request(app)
      .get(`/api/v1/accounts/${aliceAccount.id}`)
      .set('Authorization', `Bearer ${bobToken}`);

    expect(res.status).toBe(404);
    expect(mentions(res, 'Alice Chequing')).toBe(false);
  });

  it('does not read the Transactions of one of its Accounts', async () => {
    const { bobToken, aliceAccount } = await twoHouseholds();

    const res = await request(app)
      .get(`/api/v1/accounts/${aliceAccount.id}/transactions`)
      .set('Authorization', `Bearer ${bobToken}`);

    expect(res.status).toBe(404);
    expect(mentions(res, 'Alice groceries')).toBe(false);
  });

  it('does not read one of its Accounts’ balance history', async () => {
    const { bobToken, aliceAccount } = await twoHouseholds();

    const res = await request(app)
      .get(`/api/v1/accounts/${aliceAccount.id}/history`)
      .set('Authorization', `Bearer ${bobToken}`);

    expect(res.status).toBe(404);
  });

  it('does not list its Transactions', async () => {
    const { bobToken, aliceTransaction } = await twoHouseholds();

    const res = await request(app)
      .get('/api/v1/transactions')
      .set('Authorization', `Bearer ${bobToken}`);

    expect(res.status).toBe(200);
    expect(mentions(res, aliceTransaction.id)).toBe(false);
    expect(mentions(res, 'Alice groceries')).toBe(false);
  });

  it('does not fetch one of its Transactions by id', async () => {
    const { bobToken, aliceTransaction } = await twoHouseholds();

    const res = await request(app)
      .get(`/api/v1/transactions/${aliceTransaction.id}`)
      .set('Authorization', `Bearer ${bobToken}`);

    expect(res.status).toBe(404);
    expect(mentions(res, 'Alice groceries')).toBe(false);
  });

  it('still shows each Household its own records, so the tests above are not vacuous', async () => {
    const { aliceToken, aliceAccount, aliceTransaction } = await twoHouseholds();

    const accounts = await request(app)
      .get('/api/v1/accounts')
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(mentions(accounts, aliceAccount.id)).toBe(true);

    const transaction = await request(app)
      .get(`/api/v1/transactions/${aliceTransaction.id}`)
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(transaction.status).toBe(200);
    expect(mentions(transaction, 'Alice groceries')).toBe(true);
  });
});

describe('modifying another Household', () => {
  it('cannot rename one of its Accounts', async () => {
    const { bobToken, aliceAccount } = await twoHouseholds();

    const res = await request(app)
      .put(`/api/v1/accounts/${aliceAccount.id}`)
      .set('Authorization', `Bearer ${bobToken}`)
      .send({ name: 'Bob took this' });

    expect(res.status).toBe(404);

    const stored = await prisma.account.findUnique({ where: { id: aliceAccount.id } });
    expect(stored?.name).toBe('Alice Chequing');
  });

  it('cannot delete one of its Accounts', async () => {
    const { bobToken, aliceAccount } = await twoHouseholds();

    const res = await request(app)
      .delete(`/api/v1/accounts/${aliceAccount.id}`)
      .set('Authorization', `Bearer ${bobToken}`);

    expect(res.status).toBe(404);

    // The row is not merely still present — it is not soft-deleted either.
    const stored = await prisma.account.findUnique({ where: { id: aliceAccount.id } });
    expect(stored?.isDeleted).toBe(false);
  });

  it('cannot edit one of its Transactions', async () => {
    const { bobToken, aliceTransaction } = await twoHouseholds();

    const res = await request(app)
      .put(`/api/v1/transactions/${aliceTransaction.id}`)
      .set('Authorization', `Bearer ${bobToken}`)
      .send({ description: 'Bob rewrote this' });

    expect(res.status).toBe(404);

    const stored = await prisma.transactionJournal.findUnique({
      where: { id: aliceTransaction.id },
    });
    expect(stored?.description).toBe('Alice groceries');
  });

  it('cannot delete one of its Transactions', async () => {
    const { bobToken, aliceTransaction } = await twoHouseholds();

    const res = await request(app)
      .delete(`/api/v1/transactions/${aliceTransaction.id}`)
      .set('Authorization', `Bearer ${bobToken}`);

    expect(res.status).toBe(404);

    const stored = await prisma.transactionJournal.findUnique({
      where: { id: aliceTransaction.id },
    });
    expect(stored?.isDeleted).toBe(false);
  });

  it('cannot hide one of its Transactions from its own Household', async () => {
    const { bobToken, aliceTransaction } = await twoHouseholds();

    const res = await request(app)
      .put(`/api/v1/transactions/${aliceTransaction.id}`)
      .set('Authorization', `Bearer ${bobToken}`)
      .send({ isHidden: true });

    expect(res.status).toBe(404);

    const stored = await prisma.transactionJournal.findUnique({
      where: { id: aliceTransaction.id },
    });
    expect(stored?.isHidden).toBe(false);
  });
});

describe('writing into another Household', () => {
  it('cannot post a Transaction against one of its Accounts', async () => {
    const { bobToken, aliceAccount } = await twoHouseholds();

    const res = await request(app)
      .post('/api/v1/transactions')
      .set('Authorization', `Bearer ${bobToken}`)
      .send({
        accountId: aliceAccount.id,
        amount: -10,
        description: 'Bob wrote into Alice’s books',
        date: new Date().toISOString().slice(0, 10),
      });

    expect(res.status).toBe(404);

    const entries = await prisma.transactionEntry.count({
      where: { accountId: aliceAccount.id },
    });
    expect(entries).toBe(1); // Only Alice's own Transaction.
  });

  it('cannot move its own Transaction onto one of their Accounts', async () => {
    const { bobToken, alice, aliceAccount, aliceTransaction } = await twoHouseholds();

    const bobAccount = await createAccount(app, bobToken, { name: 'Bob Chequing' });
    const bobTransaction = await createTransaction(app, bobToken, {
      accountId: bobAccount.id,
      description: 'Bob coffee',
    });

    // The update contract does not accept an accountId, so the field is
    // ignored rather than refused — the assertions below are what prove it was
    // ignored, and they are what fails if a later change starts honouring it.
    const res = await request(app)
      .put(`/api/v1/transactions/${bobTransaction.id}`)
      .set('Authorization', `Bearer ${bobToken}`)
      .send({ accountId: aliceAccount.id });
    expect(res.status).toBe(200);

    const entry = await prisma.transactionEntry.findFirst({
      where: { journalId: bobTransaction.id },
      select: { accountId: true },
    });
    expect(entry?.accountId).toBe(bobAccount.id);

    // And Alice's Household still holds exactly the one Transaction she made.
    const aliceJournals = await prisma.transactionJournal.findMany({
      where: { householdId: alice.household.id },
      select: { id: true },
    });
    expect(aliceJournals.map((j) => j.id)).toEqual([aliceTransaction.id]);
  });
});
