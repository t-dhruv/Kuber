import { describe, expect, it, vi } from 'vitest';
import {
  buildJournalAuditReport,
  buildJournalCashflowReport,
  buildJournalGroupedReport,
  buildJournalReportCatalog,
  buildJournalReportDrilldown,
  classifyReportPeriod,
  fetchJournalReportRows,
  type JournalReportRow,
} from '../../src/lib/journalReportingCore';

const rows: JournalReportRow[] = [
  {
    id: 'j-exp-food',
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
    id: 'j-exp-tax',
    householdId: 'hh-1',
    transactionType: 'withdrawal',
    date: new Date('2026-01-12T00:00:00.000Z'),
    description: 'State tax',
    amount: 50,
    signedAmount: -50,
    category: { id: 'cat-tax', name: 'Tax', icon: null, type: 'expense', isTaxDeductible: true },
    reportAccount: { id: 'acct-checking', name: 'Checking', type: 'bank', excludeFromReports: false },
    tags: [],
    entryBalance: 0,
  },
  {
    id: 'j-income',
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
    id: 'j-transfer',
    householdId: 'hh-1',
    transactionType: 'transfer',
    date: new Date('2026-01-25T00:00:00.000Z'),
    description: 'Move savings',
    amount: 100,
    signedAmount: -100,
    category: null,
    reportAccount: { id: 'acct-checking', name: 'Checking', type: 'bank', excludeFromReports: false },
    tags: [],
    entryBalance: 0,
  },
];

describe('journal reporting core', () => {
  it('selects Firefly-style generator period buckets', () => {
    expect(classifyReportPeriod(new Date('2026-01-01'), new Date('2026-01-31'))).toBe('month');
    expect(classifyReportPeriod(new Date('2026-01-01'), new Date('2026-04-01'))).toBe('year');
    expect(classifyReportPeriod(new Date('2026-01-01'), new Date('2027-03-01'))).toBe('multi-year');
  });

  it('exposes Firefly-style report taxonomy', () => {
    expect(buildJournalReportCatalog().map((entry) => entry.type)).toEqual([
      'standard',
      'audit',
      'category',
      'budget',
      'tag',
      'account',
      'double',
    ]);
  });

  it('groups spending from journals and excludes transfers', () => {
    const report = buildJournalGroupedReport(rows, {
      mode: 'spending',
      groupBy: 'category',
      start: new Date('2026-01-01'),
      end: new Date('2026-01-31T23:59:59.999Z'),
    });

    expect(report.total).toBe(125);
    expect(report.transactionCount).toBe(2);
    expect(report.items).toEqual([
      expect.objectContaining({ id: 'cat-food', name: 'Food', amount: 75, percent: 60, transactionCount: 1 }),
      expect.objectContaining({ id: 'cat-tax', name: 'Tax', amount: 50, percent: 40, transactionCount: 1 }),
    ]);
  });

  it('groups income and tag reports from journal tags', () => {
    const income = buildJournalGroupedReport(rows, {
      mode: 'income',
      groupBy: 'tag',
      start: new Date('2026-01-01'),
      end: new Date('2026-01-31T23:59:59.999Z'),
    });

    expect(income.total).toBe(300);
    expect(income.items).toEqual([
      expect.objectContaining({ id: 'tag-work', name: 'Work', color: '#222222', amount: 300, percent: 100 }),
    ]);
  });

  it('builds cashflow from journal direction', () => {
    const report = buildJournalCashflowReport(rows, {
      start: new Date('2026-01-01'),
      end: new Date('2026-01-31T23:59:59.999Z'),
    });

    expect(report.income).toBe(300);
    expect(report.expenses).toBe(125);
    expect(report.net).toBe(175);
    expect(report.savingsRate).toBeCloseTo(58.33, 2);
    expect(report.byMonth).toEqual([
      { year: 2026, month: 1, income: 300, expenses: 125, net: 175 },
    ]);
  });

  it('returns journal drilldown rows for chart segments', () => {
    const drill = buildJournalReportDrilldown(rows, {
      mode: 'spending',
      groupBy: 'category',
      groupId: 'cat-food',
      start: new Date('2026-01-01'),
      end: new Date('2026-01-31T23:59:59.999Z'),
    });

    expect(drill.total).toBe(1);
    expect(drill.transactions[0]).toEqual(expect.objectContaining({
      id: 'j-exp-food',
      description: 'Market',
      amount: -75,
      account: { id: 'acct-checking', name: 'Checking' },
    }));
  });

  it('summarizes audit gaps from journals', () => {
    const audit = buildJournalAuditReport([
      ...rows,
      { ...rows[0], id: 'bad-balance', category: null, entryBalance: 12 },
    ]);

    expect(audit.unbalancedJournals).toBe(1);
    expect(audit.noCategoryJournals).toBe(2);
    expect(audit.transferJournals).toBe(1);
  });

  it('reads report rows from transaction journals without requiring the removed legacy transaction delegate', async () => {
    const prisma = {
      transactionJournal: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'journal-food',
            householdId: 'hh-1',
            transactionType: 'withdrawal',
            amountDecimal: 42,
            date: new Date('2026-01-10T00:00:00.000Z'),
            description: 'Groceries',
            category: { id: 'cat-food', name: 'Food', icon: 'cart', type: 'expense', isTaxDeductible: false, excludeFromReports: false },
            entries: [{ accountId: 'acct-checking', amountDecimal: -42, account: { id: 'acct-checking', name: 'Checking', type: 'bank', excludeFromReports: false } }],
            tags: [{ tag: { id: 'tag-home', name: 'Home', color: '#111111' } }],
          },
          {
            id: 'journal-payroll',
            householdId: 'hh-1',
            transactionType: 'deposit',
            amountDecimal: 500,
            date: new Date('2026-01-15T00:00:00.000Z'),
            description: 'Payroll',
            category: { id: 'cat-pay', name: 'Salary', icon: null, type: 'income', isTaxDeductible: false, excludeFromReports: false },
            entries: [{ accountId: 'acct-checking', amountDecimal: 500, account: { id: 'acct-checking', name: 'Checking', type: 'bank', excludeFromReports: false } }],
            tags: [],
          },
        ]),
      },
    };

    const reportRows = await fetchJournalReportRows(
      {
        householdId: 'hh-1',
        start: new Date('2026-01-01'),
        end: new Date('2026-01-31'),
      },
      prisma as any,
    );

    expect(reportRows).toHaveLength(2);
    expect(buildJournalGroupedReport(reportRows, {
      mode: 'spending',
      groupBy: 'category',
      start: new Date('2026-01-01'),
      end: new Date('2026-01-31'),
    }).items).toEqual([
      expect.objectContaining({ id: 'cat-food', name: 'Food', amount: 42, transactionCount: 1 }),
    ]);
    expect(buildJournalCashflowReport(reportRows, {
      start: new Date('2026-01-01'),
      end: new Date('2026-01-31'),
    })).toMatchObject({ income: 500, expenses: 42, net: 458 });
    expect(prisma.transactionJournal.findMany).toHaveBeenCalled();
  });
});

