import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import reportsRouter from '../../src/routes/reports';
import { fetchJournalReportRows, type JournalReportRow } from '../../src/lib/journalReportingCore';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    account: { findMany: vi.fn() },
    investmentHolding: { findMany: vi.fn() },
    budget: { findMany: vi.fn() },
    savedReport: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    category: { findMany: vi.fn() },
    tag: { findMany: vi.fn() },
  },
}));

vi.mock('../../src/lib/journalReportingCore', async () => {
  const actual = await vi.importActual<typeof import('../../src/lib/journalReportingCore')>('../../src/lib/journalReportingCore');
  return {
    ...actual,
    fetchJournalReportRows: vi.fn(),
  };
});

function makeApp(householdId = 'hh-1', userId = 'user-1') {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res: any, next: any) => {
    req.householdId = householdId;
    req.userId = userId;
    req.log = { error: vi.fn(), info: vi.fn(), child: () => req.log };
    next();
  });
  app.use('/reports', reportsRouter);
  return app;
}

const rows: JournalReportRow[] = [
  {
    id: 'journal-food',
    householdId: 'hh-1',
    transactionType: 'withdrawal',
    date: new Date('2026-01-05T00:00:00.000Z'),
    description: 'Market',
    amount: 75,
    signedAmount: -75,
    category: { id: 'cat-food', name: 'Food', icon: 'cart', type: 'expense', isTaxDeductible: false },
    reportAccount: { id: 'acct-checking', name: 'Checking', type: 'bank', excludeFromReports: false },
    tags: [{ id: 'tag-home', name: 'Home', color: '#111111' }],
    entryBalance: 0,
  },
  {
    id: 'journal-payroll',
    householdId: 'hh-1',
    transactionType: 'deposit',
    date: new Date('2026-01-20T00:00:00.000Z'),
    description: 'Payroll',
    amount: 300,
    signedAmount: 300,
    category: { id: 'cat-pay', name: 'Salary', icon: null, type: 'income', isTaxDeductible: false },
    reportAccount: { id: 'acct-checking', name: 'Checking', type: 'bank', excludeFromReports: false },
    tags: [{ id: 'tag-work', name: 'Work', color: '#222222' }],
    entryBalance: 0,
  },
  {
    id: 'journal-transfer',
    householdId: 'hh-1',
    transactionType: 'transfer',
    date: new Date('2026-01-21T00:00:00.000Z'),
    description: 'Move savings',
    amount: 100,
    signedAmount: -100,
    category: null,
    reportAccount: { id: 'acct-checking', name: 'Checking', type: 'bank', excludeFromReports: false },
    tags: [],
    entryBalance: 0,
  },
  {
    id: 'journal-donation',
    householdId: 'hh-1',
    transactionType: 'withdrawal',
    date: new Date('2026-02-10T00:00:00.000Z'),
    description: 'Donation',
    amount: 50,
    signedAmount: -50,
    category: { id: 'cat-charity', name: 'Charity', icon: 'heart', type: 'expense', isTaxDeductible: true },
    reportAccount: { id: 'acct-checking', name: 'Checking', type: 'bank', excludeFromReports: false },
    tags: [],
    entryBalance: 0,
  },
];

describe('journal-backed report routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchJournalReportRows).mockResolvedValue(rows);
  });

  it('serves spending from journal rows without querying flat transactions', async () => {
    const res = await request(makeApp()).get('/reports/spending?startDate=2026-01-01&endDate=2026-01-31&groupBy=category');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      total: 75,
      transactionCount: 1,
      items: [expect.objectContaining({ id: 'cat-food', name: 'Food', amount: 75, percent: 100 })],
    });
    expect(fetchJournalReportRows).toHaveBeenCalledWith({
      householdId: 'hh-1',
      start: new Date('2026-01-01'),
      end: new Date('2026-01-31'),
    });
  });

  it('serves cashflow from journal rows and excludes transfers', async () => {
    const res = await request(makeApp()).get('/reports/cashflow?startDate=2026-01-01&endDate=2026-01-31');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ income: 300, expenses: 75, net: 225 });
    expect(res.body.byMonth).toEqual([{ year: 2026, month: 1, income: 300, expenses: 75, net: 225 }]);
  });

  it('returns journal drilldown rows for a report segment', async () => {
    const res = await request(makeApp()).get('/reports/drill?startDate=2026-01-01&endDate=2026-01-31&groupBy=category&groupId=cat-food&mode=spending');

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.transactions[0]).toMatchObject({
      id: 'journal-food',
      description: 'Market',
      amount: -75,
      account: { id: 'acct-checking', name: 'Checking' },
    });
  });

  it('exports journal-backed report CSV', async () => {
    const res = await request(makeApp()).get('/reports/export/csv?type=spending&startDate=2026-01-01&endDate=2026-01-31');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text).toContain('Category,Amount,Percentage');
    expect(res.text).toContain('Food,75,100');
  });

  it('accepts from/to aliases for report CSV exports', async () => {
    const res = await request(makeApp()).get('/reports/export/csv?type=cashflow&from=2026-01-01&to=2026-01-31');

    expect(res.status).toBe(200);
    expect(res.text).toContain('Month,Income,Expenses,Net');
    expect(fetchJournalReportRows).toHaveBeenCalledWith({
      householdId: 'hh-1',
      start: new Date('2026-01-01'),
      end: new Date('2026-01-31'),
    });
  });

  it('exports tax report CSV by year', async () => {
    const res = await request(makeApp()).get('/reports/export/csv?type=tax&year=2026');

    expect(res.status).toBe(200);
    expect(res.text).toContain('Category,Transactions,Amount');
    expect(res.text).toContain('Charity,1,50');
    expect(fetchJournalReportRows).toHaveBeenCalledWith({
      householdId: 'hh-1',
      start: new Date(2026, 0, 1),
      end: new Date(2026, 11, 31, 23, 59, 59, 999),
    });
  });
});


