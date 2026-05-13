import { describe, expect, it } from 'vitest';
import { getPeriodKey, getExpectedPeriodStart, isBillDueInPeriod } from './billMatcher';

describe('getPeriodKey', () => {
  it('formats date as YYYY-MM', () => {
    expect(getPeriodKey(new Date('2026-04-15'))).toBe('2026-04');
    expect(getPeriodKey(new Date('2026-12-01'))).toBe('2026-12');
  });
});

describe('getExpectedPeriodStart', () => {
  it('returns start date when txDate is in same month as first period', () => {
    const billStart = new Date('2026-04-15');
    const txDate    = new Date('2026-04-15');
    const result    = getExpectedPeriodStart(billStart, 'monthly', 0, txDate);
    expect(result).not.toBeNull();
  });

  it('returns null when txDate is before bill startDate', () => {
    const billStart = new Date('2026-05-01');
    const txDate    = new Date('2026-04-01');
    expect(getExpectedPeriodStart(billStart, 'monthly', 0, txDate)).toBeNull();
  });
});

describe('isBillDueInPeriod', () => {
  it('returns true when txDate falls within monthly period window', () => {
    const bill = {
      startDate:   new Date('2026-01-15'),
      endDate:     null,
      repeatFreq:  'monthly',
      skipPeriods: 0,
      amountMin:   null,
      amountMax:   null,
    };
    expect(isBillDueInPeriod(bill, new Date('2026-04-17'), -120)).toBe(true);
  });

  it('returns false when amount is outside range', () => {
    const bill = {
      startDate:   new Date('2026-01-15'),
      endDate:     null,
      repeatFreq:  'monthly',
      skipPeriods: 0,
      amountMin:   { toNumber: () => 100 } as any,
      amountMax:   { toNumber: () => 200 } as any,
    };
    expect(isBillDueInPeriod(bill, new Date('2026-04-15'), -50)).toBe(false);
    expect(isBillDueInPeriod(bill, new Date('2026-04-15'), -150)).toBe(true);
  });

  it('returns false when txDate is after bill endDate', () => {
    const bill = {
      startDate:   new Date('2026-01-01'),
      endDate:     new Date('2026-03-31'),
      repeatFreq:  'monthly',
      skipPeriods: 0,
      amountMin:   null,
      amountMax:   null,
    };
    expect(isBillDueInPeriod(bill, new Date('2026-04-15'), -100)).toBe(false);
  });
});
