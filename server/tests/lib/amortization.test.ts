import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  amortizationSchedule,
  buildAmortizationSummary,
  calcPayment,
  monthlyRate,
  payoffSimulator,
  resolveVariableRate,
  triggerRate,
} from './amortization';

afterEach(() => {
  vi.useRealTimers();
});

describe('resolveVariableRate', () => {
  it('subtracts discount from prime rate', () => {
    expect(resolveVariableRate(6.95, 1.1)).toBeCloseTo(5.85);
  });

  it('floors the resolved rate at 0.01 percent', () => {
    expect(resolveVariableRate(1, 5)).toBe(0.01);
  });
});

describe('monthlyRate', () => {
  it('uses simple monthly compounding for US and Canadian variable mortgages', () => {
    expect(monthlyRate(6, 'US', 'fixed')).toBeCloseTo(0.005);
    expect(monthlyRate(6, 'CA', 'variable')).toBeCloseTo(0.005);
  });

  it('uses semi-annual compounding for Canadian fixed mortgages', () => {
    expect(monthlyRate(6, 'CA', 'fixed')).toBeCloseTo(Math.pow(1.03, 1 / 6) - 1);
  });
});

describe('calcPayment', () => {
  it('calculates a standard monthly mortgage payment', () => {
    expect(calcPayment(300000, 6, 360, 'US', 'fixed')).toBeCloseTo(1798.65, 2);
  });

  it('returns a straight-line payment for zero-interest loans', () => {
    expect(calcPayment(1200, 0, 12, 'US', 'fixed')).toBe(100);
  });

  it('returns zero for invalid principal or term values', () => {
    expect(calcPayment(0, 6, 360, 'US', 'fixed')).toBe(0);
    expect(calcPayment(300000, 6, 0, 'US', 'fixed')).toBe(0);
  });
});

describe('amortizationSchedule', () => {
  it('generates a schedule that clears the final balance', () => {
    const schedule = amortizationSchedule(1200, 0, 12, 'US', 'fixed');

    expect(schedule).toHaveLength(12);
    expect(schedule[0]).toEqual({
      period: 1,
      payment: 100,
      principal: 100,
      interest: 0,
      balance: 1100,
    });
    expect(schedule.at(-1)?.balance).toBe(0);
  });

  it('honors an existing payment override', () => {
    const schedule = amortizationSchedule(1000, 12, 12, 'US', 'fixed', 200);

    expect(schedule[0]?.payment).toBe(200);
    expect(schedule.length).toBeLessThan(12);
    expect(schedule.at(-1)?.balance).toBe(0);
  });
});

describe('buildAmortizationSummary', () => {
  it('summarizes the next payment, remaining interest, and payoff date', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

    const summary = buildAmortizationSummary(1200, 0, 1, 'US', 'fixed');

    expect(summary.calculatedPayment).toBe(100);
    expect(summary.nextPrincipalPortion).toBe(100);
    expect(summary.nextInterestPortion).toBe(0);
    expect(summary.remainingPayments).toBe(12);
    expect(summary.totalInterestRemaining).toBe(0);
    expect(summary.payoffDate).toBe('2027-01-01');
  });
});

describe('payoffSimulator', () => {
  it('reports months and interest saved from extra monthly principal', () => {
    const result = payoffSimulator(10000, 6, 60, 193.33, 100, 'US', 'fixed');

    expect(result.newPayoffMonths).toBeLessThan(60);
    expect(result.monthsSaved).toBeGreaterThan(0);
    expect(result.interestSaved).toBeGreaterThan(0);
    expect(result.totalInterestNew).toBeLessThan(result.totalInterestBase);
  });
});

describe('triggerRate', () => {
  it('calculates the annualized trigger rate for a fixed monthly payment', () => {
    expect(triggerRate(1500, 250000)).toBe(7.2);
  });

  it('returns zero when current balance is not positive', () => {
    expect(triggerRate(1500, 0)).toBe(0);
  });
});
