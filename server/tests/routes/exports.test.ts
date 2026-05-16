import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import PDFDocument from 'pdfkit';
import exportsRouter from '../../src/routes/exports';
import { prisma } from '../../src/lib/prisma';
import { makeRouteTestApp } from '../integration/integrationHarness';

const pdfInstances = vi.hoisted(() => [] as any[]);

vi.mock('pdfkit', () => ({
  default: vi.fn().mockImplementation(function () {
    const doc: any = {
      y: 50,
      pipe: vi.fn((res) => {
        doc.res = res;
        return doc;
      }),
      fontSize: vi.fn(() => doc),
      fillColor: vi.fn(() => doc),
      text: vi.fn(() => doc),
      moveDown: vi.fn(() => doc),
      moveTo: vi.fn(() => doc),
      lineTo: vi.fn(() => doc),
      strokeColor: vi.fn(() => doc),
      stroke: vi.fn(() => doc),
      font: vi.fn(() => doc),
      end: vi.fn(() => doc.res?.end(Buffer.from('%PDF-test'))),
    };
    pdfInstances.push(doc);
    return doc;
  }),
}));

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    transactionJournal: { findMany: vi.fn() },
  },
}));

const categoryTxn = {
  categoryId: 'cat-food',
  category: { id: 'cat-food', name: 'Groceries', icon: 'cart' },
  amountDecimal: '-42.50',
  transactionType: 'withdrawal',
};

function makeApp() {
  return makeRouteTestApp(exportsRouter, { householdId: 'household-1', userId: 'user-1' });
}

describe('exports route integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pdfInstances.length = 0;
    vi.useRealTimers();
  });

  it('rejects invalid export types before querying data', async () => {
    const res = await request(makeApp()).get('/excel?type=balances');

    expect(res.status).toBe(400);
    expect(prisma.transactionJournal.findMany).not.toHaveBeenCalled();
  });

  it('validates PDF date ranges before starting a PDF stream', async () => {
    const res = await request(makeApp()).get('/pdf?type=spending');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('from and to are required for spending export');
    expect(PDFDocument).not.toHaveBeenCalled();
    expect(res.headers['content-type']).toContain('application/json');
  });

  it('exports spending data to Excel with household-scoped non-deleted withdrawals', async () => {
    vi.mocked(prisma.transactionJournal.findMany).mockResolvedValue([
      categoryTxn,
      { ...categoryTxn, amountDecimal: '-7.50' },
      { ...categoryTxn, categoryId: null, category: null, amountDecimal: '-10.00' },
    ] as any);

    const res = await request(makeApp()).get('/excel?type=spending&from=2026-01-01&to=2026-01-31');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('spreadsheetml.sheet');
    expect(res.headers['content-disposition']).toBe('attachment; filename="kuber-spending-report.xlsx"');
    expect(prisma.transactionJournal.findMany).toHaveBeenCalledWith({
      where: {
        householdId: 'household-1',
        date: { gte: new Date('2026-01-01'), lte: new Date('2026-01-31') },
        transactionType: 'withdrawal',
        isHidden: false,
        isDeleted: false,
      },
      include: { category: { select: { name: true, icon: true } } },
    });
  });

  it('exports tax data to Excel for deductible categories in the requested year', async () => {
    vi.mocked(prisma.transactionJournal.findMany).mockResolvedValue([
      {
        amountDecimal: '-125.00',
        category: { id: 'tax-1', name: 'Donations', icon: 'heart' },
      },
    ] as any);

    const res = await request(makeApp()).get('/excel?type=tax&year=2026');

    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toBe('attachment; filename="kuber-tax-report.xlsx"');
    expect(prisma.transactionJournal.findMany).toHaveBeenCalledWith({
      where: {
        householdId: 'household-1',
        isHidden: false,
        date: { gte: new Date(2026, 0, 1), lte: new Date(2026, 11, 31, 23, 59, 59) },
        category: { isTaxDeductible: true },
        isDeleted: false,
      },
      include: { category: { select: { id: true, name: true, icon: true } } },
    });
  });

  it('exports cashflow data to PDF after loading non-hidden household transactions', async () => {
    vi.mocked(prisma.transactionJournal.findMany).mockResolvedValue([
      { amountDecimal: '2500.00', transactionType: 'deposit' },
      { amountDecimal: '-1000.00', transactionType: 'withdrawal' },
    ] as any);

    const res = await request(makeApp()).get('/pdf?type=cashflow&from=2026-01-01&to=2026-01-31');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['content-disposition']).toBe('attachment; filename="kuber-cashflow-report.pdf"');
    expect(prisma.transactionJournal.findMany).toHaveBeenCalledWith({
      where: {
        householdId: 'household-1',
        date: { gte: new Date('2026-01-01'), lte: new Date('2026-01-31') },
        isHidden: false,
        isDeleted: false,
      },
    });
    expect(pdfInstances[0].end).toHaveBeenCalled();
  });
});


