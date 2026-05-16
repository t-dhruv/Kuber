import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import liabilitiesRouter from '../../src/routes/liabilities';
import { prisma } from '../../src/lib/prisma';
import { makeRouteTestApp } from '../integration/integrationHarness';
import { buildAmortizationSummary, payoffSimulator, resolveVariableRate, triggerRate } from '../../src/lib/amortization';

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    manualLiability: {
      findMany: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

vi.mock('../../src/lib/amortization', () => ({
  buildAmortizationSummary: vi.fn(() => ({
    effectiveMonthlyRate: 0.005,
    calculatedPayment: 1200,
    nextPrincipalPortion: 700,
    nextInterestPortion: 500,
    remainingPayments: 300,
    payoffDate: '2051-05-01',
    totalInterestRemaining: 100000,
    periods: [{ period: 1, payment: 1200 }],
  })),
  payoffSimulator: vi.fn(() => ({ monthsSaved: 12, interestSaved: 5000 })),
  resolveVariableRate: vi.fn((primeRate: number, discount: number) => primeRate - discount),
  triggerRate: vi.fn(() => 6.25),
}));

const liability = {
  id: 'liability-1',
  householdId: 'household-1',
  name: 'Mortgage',
  type: 'mortgage',
  originalAmount: 300000,
  currentBalance: 250000,
  interestRate: 5,
  monthlyPayment: 1500,
  maturityDate: new Date('2050-01-01T00:00:00.000Z'),
  notes: null,
  currency: 'CAD',
  region: 'CA',
  rateType: 'variable',
  primeRate: 6,
  primeDiscount: 1,
  termStartDate: new Date('2025-01-01T00:00:00.000Z'),
  termEndDate: new Date('2027-01-01T00:00:00.000Z'),
  amortizationYears: 25,
  paymentFrequency: 'monthly',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

function makeApp() {
  return makeRouteTestApp(liabilitiesRouter, { householdId: 'household-1', userId: 'user-1' });
}

describe('liabilities route integration', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists household liabilities newest first', async () => {
    vi.mocked(prisma.manualLiability.findMany).mockResolvedValue([liability] as any);

    const res = await request(makeApp()).get('/');

    expect(res.status).toBe(200);
    expect(prisma.manualLiability.findMany).toHaveBeenCalledWith({
      where: { householdId: 'household-1' },
      orderBy: { createdAt: 'desc' },
    });
    expect(res.body[0]).toMatchObject({ id: 'liability-1', name: 'Mortgage' });
  });

  it('creates a household liability with parsed date fields', async () => {
    vi.mocked(prisma.manualLiability.create).mockResolvedValue(liability as any);

    const res = await request(makeApp())
      .post('/')
      .send({
        name: 'Mortgage',
        type: 'mortgage',
        originalAmount: 300000,
        currentBalance: 250000,
        interestRate: 5,
        maturityDate: '2050-01-01T00:00:00.000Z',
        termStartDate: '2025-01-01T00:00:00.000Z',
        termEndDate: '2027-01-01T00:00:00.000Z',
      });

    expect(res.status).toBe(201);
    expect(prisma.manualLiability.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        householdId: 'household-1',
        name: 'Mortgage',
        maturityDate: new Date('2050-01-01T00:00:00.000Z'),
        termStartDate: new Date('2025-01-01T00:00:00.000Z'),
        termEndDate: new Date('2027-01-01T00:00:00.000Z'),
      }),
    });
  });

  it('rejects invalid liability payloads before writing', async () => {
    const res = await request(makeApp())
      .post('/')
      .send({ name: '', originalAmount: -1, currentBalance: 100 });

    expect(res.status).toBe(400);
    expect(prisma.manualLiability.create).not.toHaveBeenCalled();
  });

  it('returns debt payoff plans for household liabilities', async () => {
    vi.mocked(prisma.manualLiability.findMany).mockResolvedValue([
      { id: 'card', name: 'Card', type: 'credit_card', currentBalance: 1000, interestRate: 24, monthlyPayment: 100 },
      { id: 'loan', name: 'Loan', type: 'auto_loan', currentBalance: 5000, interestRate: 6, monthlyPayment: 250 },
    ] as any);

    const res = await request(makeApp()).get('/debt-payoff?extraMonthly=50');

    expect(res.status).toBe(200);
    expect(prisma.manualLiability.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { householdId: 'household-1', interestRate: { gt: 0 } },
    }));
    expect(res.body).toMatchObject({
      totalMinMonthly: 350,
      extraMonthly: 50,
      totalInterest: {
        avalanche: expect.any(Number),
        snowball: expect.any(Number),
      },
    });
    expect(res.body.avalanche[0].id).toBe('card');
    expect(res.body.snowball[0].id).toBe('card');
  });

  it('updates only household liabilities', async () => {
    vi.mocked(prisma.manualLiability.findFirst).mockResolvedValue(liability as any);
    vi.mocked(prisma.manualLiability.update).mockResolvedValue({ ...liability, currentBalance: 240000 } as any);

    const res = await request(makeApp())
      .put('/liability-1')
      .send({ currentBalance: 240000 });

    expect(res.status).toBe(200);
    expect(prisma.manualLiability.findFirst).toHaveBeenCalledWith({
      where: { id: 'liability-1', householdId: 'household-1' },
    });
    expect(prisma.manualLiability.update).toHaveBeenCalledWith({
      where: { id: 'liability-1' },
      data: { currentBalance: 240000 },
    });
  });

  it('returns 404 when deleting another household liability', async () => {
    vi.mocked(prisma.manualLiability.findFirst).mockResolvedValue(null);

    const res = await request(makeApp()).delete('/liability-other');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Liability not found' });
    expect(prisma.manualLiability.delete).not.toHaveBeenCalled();
  });

  it('deletes a household liability', async () => {
    vi.mocked(prisma.manualLiability.findFirst).mockResolvedValue(liability as any);
    vi.mocked(prisma.manualLiability.delete).mockResolvedValue(liability as any);

    const res = await request(makeApp()).delete('/liability-1');

    expect(res.status).toBe(200);
    expect(prisma.manualLiability.delete).toHaveBeenCalledWith({ where: { id: 'liability-1' } });
  });

  it('returns amortization details for liabilities with rate metadata', async () => {
    vi.mocked(prisma.manualLiability.findFirst).mockResolvedValue(liability as any);

    const res = await request(makeApp()).get('/liability-1/amortization');

    expect(res.status).toBe(200);
    expect(resolveVariableRate).toHaveBeenCalledWith(6, 1);
    expect(buildAmortizationSummary).toHaveBeenCalledWith(250000, 5, 25, 'CA', 'variable', 1500);
    expect(triggerRate).toHaveBeenCalledWith(1500, 250000);
    expect(res.body).toMatchObject({
      region: 'CA',
      rateType: 'variable',
      effectiveAnnualRate: 5,
      triggerRate: 6.25,
      schedule: { nextPaymentAmount: 1200 },
    });
  });

  it('rejects payoff simulator negative extra payments', async () => {
    vi.mocked(prisma.manualLiability.findFirst).mockResolvedValue(liability as any);

    const res = await request(makeApp())
      .post('/liability-1/payoff-simulator')
      .send({ extraMonthly: -1 });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'extraMonthly must be >= 0' });
    expect(payoffSimulator).not.toHaveBeenCalled();
  });

  it('runs payoff simulator for a household liability', async () => {
    vi.mocked(prisma.manualLiability.findFirst).mockResolvedValue(liability as any);

    const res = await request(makeApp())
      .post('/liability-1/payoff-simulator')
      .send({ extraMonthly: 100 });

    expect(res.status).toBe(200);
    expect(payoffSimulator).toHaveBeenCalledWith(250000, 5, 300, 1500, 100, 'CA', 'variable');
    expect(res.body).toEqual({ monthsSaved: 12, interestSaved: 5000 });
  });
});


