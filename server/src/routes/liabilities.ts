import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import {
  buildAmortizationSummary,
  payoffSimulator,
  resolveVariableRate,
  triggerRate,
} from '../lib/amortization';
import type { MortgageRegion, LoanRateType } from '../lib/amortization';

const router = Router();

// ── Zod schemas ──────────────────────────────────────────────────────────────

const liabilitySchema = z.object({
  name:             z.string().min(1),
  type:             z.enum(['mortgage', 'auto_loan', 'student_loan', 'credit_card', 'other']).default('other'),
  originalAmount:   z.number().min(0),
  currentBalance:   z.number().min(0),
  interestRate:     z.number().min(0).max(100).optional(),
  monthlyPayment:   z.number().min(0).optional(),
  maturityDate:     z.string().datetime().optional(),
  notes:            z.string().optional(),
  currency:         z.string().default('USD'),

  // Amortization metadata
  region:           z.enum(['US', 'CA']).optional(),
  rateType:         z.enum(['fixed', 'variable']).optional(),
  primeRate:        z.number().min(0).max(30).optional(),
  primeDiscount:    z.number().min(0).max(30).optional(),
  termStartDate:    z.string().datetime().optional(),
  termEndDate:      z.string().datetime().optional(),
  amortizationYears: z.number().int().min(1).max(50).optional(),
  paymentFrequency: z.enum(['monthly', 'biweekly', 'weekly']).optional(),
});

const liabilityUpdateSchema = liabilitySchema.partial();

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Resolves the effective annual rate from a liability record.
 * Variable: effectiveRate = primeRate - primeDiscount
 * Fixed:    effectiveRate = interestRate
 */
function resolveRate(liability: {
  rateType:      string | null;
  interestRate:  number | null;
  primeRate:     number | null;
  primeDiscount: number | null;
}): number | null {
  if (liability.rateType === 'variable' && liability.primeRate != null && liability.primeDiscount != null) {
    return resolveVariableRate(liability.primeRate, liability.primeDiscount);
  }
  return liability.interestRate ?? null;
}

// ── CRUD ─────────────────────────────────────────────────────────────────────

// GET /api/v1/liabilities
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const liabilities = await prisma.manualLiability.findMany({
      where: { householdId: req.householdId! },
      orderBy: { createdAt: 'desc' },
    });
    return res.json(liabilities);
  } catch (err) {
    console.error('[liabilities/GET /]', err);
    return res.status(500).json({ error: 'Failed to fetch liabilities' });
  }
});

// POST /api/v1/liabilities
router.post('/', async (req: AuthRequest, res: Response) => {
  const parsed = liabilitySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0].message });
  }
  try {
    const { maturityDate, termStartDate, termEndDate, ...rest } = parsed.data;
    const liability = await prisma.manualLiability.create({
      data: {
        ...rest,
        householdId:   req.householdId!,
        maturityDate:  maturityDate  ? new Date(maturityDate)  : undefined,
        termStartDate: termStartDate ? new Date(termStartDate) : undefined,
        termEndDate:   termEndDate   ? new Date(termEndDate)   : undefined,
      },
    });
    return res.status(201).json(liability);
  } catch (err) {
    console.error('[liabilities/POST /]', err);
    return res.status(500).json({ error: 'Failed to create liability' });
  }
});

// GET /api/v1/liabilities/debt-payoff
// Returns avalanche & snowball payoff schedules for all liabilities with interestRate > 0.
// Query param: extraMonthly (number, default 0) — extra payment distributed each month.
router.get('/debt-payoff', async (req: AuthRequest, res: Response) => {
  try {
    const householdId = req.householdId!;
    const extra = Math.max(0, parseFloat(req.query.extraMonthly as string) || 0);

    const liabilities = await prisma.manualLiability.findMany({
      where: { householdId, interestRate: { gt: 0 } },
      select: {
        id: true,
        name: true,
        type: true,
        currentBalance: true,
        interestRate: true,
        monthlyPayment: true,
      },
    });

    if (liabilities.length === 0) {
      return res.json({ avalanche: [], snowball: [], totalInterest: { avalanche: 0, snowball: 0 } });
    }

    type DebtItem = {
      id: string;
      name: string;
      type: string;
      balance: number;
      rate: number;       // monthly decimal
      minPayment: number;
    };

    const debts: DebtItem[] = liabilities.map((l) => ({
      id: l.id,
      name: l.name,
      type: l.type,
      balance: l.currentBalance,
      rate: (l.interestRate ?? 0) / 100 / 12,
      minPayment: l.monthlyPayment ?? Math.max(25, l.currentBalance * 0.02),
    }));

    const totalMin = debts.reduce((s, d) => s + d.minPayment, 0);

    function simulate(order: DebtItem[]): { summary: Array<{ id: string; name: string; months: number; totalInterest: number; payoffDate: string }>; totalInterest: number } {
      const balances = Object.fromEntries(order.map((d) => [d.id, d.balance]));
      const interestPaid = Object.fromEntries(order.map((d) => [d.id, 0]));
      const monthsPaid = Object.fromEntries(order.map((d) => [d.id, 0]));
      const payoffDates = Object.fromEntries(order.map((d) => [d.id, '']));

      const remaining = () => order.filter((d) => balances[d.id] > 0.005);
      const now = new Date();
      let month = 0;
      const MAX_MONTHS = 600; // 50 years cap

      while (remaining().length > 0 && month < MAX_MONTHS) {
        month++;
        let rollover = extra; // extra freed from paid-off debts accumulates here

        for (const d of order) {
          if (balances[d.id] <= 0.005) continue;
          const interest = balances[d.id] * d.rate;
          interestPaid[d.id] += interest;
          balances[d.id] += interest;
        }

        // Pay minimums, accumulate freed minimums as rollover
        for (const d of order) {
          if (balances[d.id] <= 0.005) continue;
          const pay = Math.min(d.minPayment, balances[d.id]);
          balances[d.id] -= pay;
          if (balances[d.id] < 0.005) {
            rollover += d.minPayment - pay; // freed minimum
          }
        }

        // Apply rollover to first unpaid debt in priority order
        for (const d of order) {
          if (balances[d.id] <= 0.005) continue;
          const extra2 = Math.min(rollover, balances[d.id]);
          balances[d.id] -= extra2;
          rollover -= extra2;
          if (rollover <= 0) break;
        }

        // Record payoffs this month
        const payoffMonth = new Date(now.getFullYear(), now.getMonth() + month, 1);
        for (const d of order) {
          if (balances[d.id] < 0.005 && !payoffDates[d.id]) {
            payoffDates[d.id] = payoffMonth.toISOString().slice(0, 7);
            monthsPaid[d.id] = month;
          }
        }
      }

      const summary = order.map((d) => ({
        id: d.id,
        name: d.name,
        months: monthsPaid[d.id] || month,
        totalInterest: Math.round(interestPaid[d.id] * 100) / 100,
        payoffDate: payoffDates[d.id] || '',
      }));

      return {
        summary,
        totalInterest: Math.round(summary.reduce((s, d) => s + d.totalInterest, 0) * 100) / 100,
      };
    }

    const avalancheOrder = [...debts].sort((a, b) => b.rate - a.rate);
    const snowballOrder  = [...debts].sort((a, b) => a.balance - b.balance);

    const avalanche = simulate(avalancheOrder);
    const snowball  = simulate(snowballOrder);

    return res.json({
      totalMinMonthly: Math.round(totalMin * 100) / 100,
      extraMonthly: extra,
      avalanche: avalanche.summary,
      snowball: snowball.summary,
      totalInterest: {
        avalanche: avalanche.totalInterest,
        snowball: snowball.totalInterest,
      },
    });
  } catch (err) {
    console.error('[liabilities/GET /debt-payoff]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/v1/liabilities/:id
router.put('/:id', async (req: AuthRequest, res: Response) => {
  const parsed = liabilityUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0].message });
  }
  try {
    const existing = await prisma.manualLiability.findFirst({
      where: { id: req.params.id, householdId: req.householdId! },
    });
    if (!existing) return res.status(404).json({ error: 'Liability not found' });

    const { maturityDate, termStartDate, termEndDate, ...rest } = parsed.data;
    const liability = await prisma.manualLiability.update({
      where: { id: req.params.id },
      data: {
        ...rest,
        ...(maturityDate  !== undefined ? { maturityDate:  maturityDate  ? new Date(maturityDate)  : null } : {}),
        ...(termStartDate !== undefined ? { termStartDate: termStartDate ? new Date(termStartDate) : null } : {}),
        ...(termEndDate   !== undefined ? { termEndDate:   termEndDate   ? new Date(termEndDate)   : null } : {}),
      },
    });
    return res.json(liability);
  } catch (err) {
    console.error('[liabilities/PUT /:id]', err);
    return res.status(500).json({ error: 'Failed to update liability' });
  }
});

// DELETE /api/v1/liabilities/:id
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const existing = await prisma.manualLiability.findFirst({
      where: { id: req.params.id, householdId: req.householdId! },
    });
    if (!existing) return res.status(404).json({ error: 'Liability not found' });

    await prisma.manualLiability.delete({ where: { id: req.params.id } });
    return res.json({ message: 'Deleted' });
  } catch (err) {
    console.error('[liabilities/DELETE /:id]', err);
    return res.status(500).json({ error: 'Failed to delete liability' });
  }
});

// ── Amortization ─────────────────────────────────────────────────────────────

// GET /api/v1/liabilities/:id/amortization
router.get('/:id/amortization', async (req: AuthRequest, res: Response) => {
  try {
    const liability = await prisma.manualLiability.findFirst({
      where: { id: req.params.id, householdId: req.householdId! },
    });
    if (!liability) return res.status(404).json({ error: 'Liability not found' });

    const annualRate = resolveRate(liability);
    if (annualRate == null) {
      return res.status(422).json({ error: 'interestRate (or primeRate + primeDiscount for variable) must be set to calculate amortization' });
    }
    if (!liability.amortizationYears) {
      return res.status(422).json({ error: 'amortizationYears must be set to calculate amortization' });
    }

    const region   = (liability.region   ?? 'US') as MortgageRegion;
    const rateType = (liability.rateType ?? 'fixed') as LoanRateType;

    const summary = buildAmortizationSummary(
      liability.currentBalance,
      annualRate,
      liability.amortizationYears,
      region,
      rateType,
      liability.monthlyPayment ?? undefined,
    );

    // Term renewal countdown
    let daysUntilRenewal: number | null = null;
    if (liability.termEndDate) {
      daysUntilRenewal = Math.max(0, Math.round(
        (liability.termEndDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000)
      ));
    }

    // Trigger rate (CA variable only)
    let triggerRateValue: number | null = null;
    if (liability.region === 'CA' && liability.rateType === 'variable' && liability.monthlyPayment) {
      triggerRateValue = triggerRate(liability.monthlyPayment, liability.currentBalance);
    }

    return res.json({
      region,
      rateType,
      effectiveAnnualRate: annualRate,
      effectiveMonthlyRate: summary.effectiveMonthlyRate,
      calculatedPayment:    summary.calculatedPayment,
      schedule: {
        nextPaymentAmount:      summary.calculatedPayment,
        principalPortion:       summary.nextPrincipalPortion,
        interestPortion:        summary.nextInterestPortion,
        remainingPayments:      summary.remainingPayments,
        payoffDate:             summary.payoffDate,
        totalInterestRemaining: summary.totalInterestRemaining,
      },
      term: {
        termEndDate:      liability.termEndDate?.toISOString().slice(0, 10) ?? null,
        daysUntilRenewal,
      },
      triggerRate: triggerRateValue,
      periods: summary.periods.slice(0, 60), // return first 5 years of schedule
    });
  } catch (err) {
    console.error('[liabilities/GET /:id/amortization]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/liabilities/:id/payoff-simulator
router.post('/:id/payoff-simulator', async (req: AuthRequest, res: Response) => {
  try {
    const liability = await prisma.manualLiability.findFirst({
      where: { id: req.params.id, householdId: req.householdId! },
    });
    if (!liability) return res.status(404).json({ error: 'Liability not found' });

    const extraMonthly = typeof req.body.extraMonthly === 'number' ? req.body.extraMonthly : 0;
    if (extraMonthly < 0) return res.status(400).json({ error: 'extraMonthly must be >= 0' });

    const annualRate = resolveRate(liability);
    if (annualRate == null) {
      return res.status(422).json({ error: 'interestRate must be set to run payoff simulation' });
    }
    if (!liability.amortizationYears) {
      return res.status(422).json({ error: 'amortizationYears must be set to run payoff simulation' });
    }

    const region       = (liability.region   ?? 'US') as MortgageRegion;
    const rateType     = (liability.rateType ?? 'fixed') as LoanRateType;
    const termMonths   = liability.amortizationYears * 12;
    const basePayment  = liability.monthlyPayment
      ?? (await import('../lib/amortization')).calcPayment(liability.currentBalance, annualRate, termMonths, region, rateType);

    const result = payoffSimulator(
      liability.currentBalance,
      annualRate,
      termMonths,
      basePayment,
      extraMonthly,
      region,
      rateType,
    );

    return res.json(result);
  } catch (err) {
    console.error('[liabilities/POST /:id/payoff-simulator]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
