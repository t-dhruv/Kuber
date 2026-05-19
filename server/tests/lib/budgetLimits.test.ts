import { describe, expect, it } from 'vitest';
import { computeRolloverAmount, getPeriodKey, parsePeriodKey } from '../../src/lib/budgetLimits';

describe('getPeriodKey', () => {
  it('returns YYYY-MM for monthly period', () => {
    expect(getPeriodKey(new Date(2024, 2, 15), 'monthly')).toBe('2024-03');
  });

  it('returns YYYY for yearly period', () => {
    expect(getPeriodKey(new Date(2024, 2, 15), 'yearly')).toBe('2024');
  });

  it('returns YYYY-Www for weekly period', () => {
    // 2024-01-08 is in week 2 of 2024 (local time constructor avoids UTC offset shift)
    expect(getPeriodKey(new Date(2024, 0, 8), 'weekly')).toBe('2024-W02');
  });

  it('returns YYYY-Qq for quarterly period', () => {
    expect(getPeriodKey(new Date(2024, 3, 1), 'quarterly')).toBe('2024-Q2');
    expect(getPeriodKey(new Date(2024, 9, 31), 'quarterly')).toBe('2024-Q4');
  });

  it('defaults to monthly for unknown period', () => {
    expect(getPeriodKey(new Date(2024, 5, 1), 'custom')).toBe('2024-06');
  });
});

describe('parsePeriodKey', () => {
  it('parses monthly key to start/end dates', () => {
    const { start, end } = parsePeriodKey('2024-03', 'monthly');
    expect(start.toISOString().startsWith('2024-03-01')).toBe(true);
    expect(end.toISOString().startsWith('2024-03-31')).toBe(true);
  });

  it('parses yearly key', () => {
    const { start, end } = parsePeriodKey('2024', 'yearly');
    expect(start.getFullYear()).toBe(2024);
    expect(start.getMonth()).toBe(0);
    expect(end.getFullYear()).toBe(2024);
    expect(end.getMonth()).toBe(11);
  });
});

describe('computeRolloverAmount', () => {
  it('returns 0 when budget not overspent and rollover disabled', () => {
    expect(computeRolloverAmount({ prevLimit: 500, prevSpent: 300, prevRollover: 0, rolloverEnabled: false })).toBe(0);
  });

  it('carries leftover forward when rollover enabled and under budget', () => {
    // limit=500, spent=300 => 200 leftover rolls over
    expect(computeRolloverAmount({ prevLimit: 500, prevSpent: 300, prevRollover: 0, rolloverEnabled: true })).toBe(200);
  });

  it('carries negative rollover when overspent', () => {
    // limit=500, spent=600 => -100 rollover (debt)
    expect(computeRolloverAmount({ prevLimit: 500, prevSpent: 600, prevRollover: 0, rolloverEnabled: true })).toBe(-100);
  });

  it('compounds rollover across periods', () => {
    // prev rollover=100 (surplus), limit=500, spent=400 => 100+100=200
    expect(computeRolloverAmount({ prevLimit: 500, prevSpent: 400, prevRollover: 100, rolloverEnabled: true })).toBe(200);
  });

  it('rounds to 2 decimal places', () => {
    const result = computeRolloverAmount({ prevLimit: 100.001, prevSpent: 0, prevRollover: 0, rolloverEnabled: true });
    expect(result).toBeCloseTo(100, 2);
  });
});

