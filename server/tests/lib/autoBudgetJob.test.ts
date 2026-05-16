import { describe, expect, it } from 'vitest';
import { computeAutoBudgetAmount } from './autoBudgetJob';
import { Decimal } from '@prisma/client/runtime/library';

describe('computeAutoBudgetAmount', () => {
  it('RESET: always returns base amount', () => {
    const base = new Decimal(500);
    expect(computeAutoBudgetAmount('RESET', base, null).toNumber()).toBe(500);
    expect(computeAutoBudgetAmount('RESET', base, { amount: new Decimal(500), spent: new Decimal(300) }).toNumber()).toBe(500);
  });

  it('ROLLOVER: adds unspent from previous period', () => {
    const base = new Decimal(500);
    const prev = { amount: new Decimal(500), spent: new Decimal(300) };
    expect(computeAutoBudgetAmount('ROLLOVER', base, prev).toNumber()).toBe(700);
  });

  it('ROLLOVER: does not subtract if overspent', () => {
    const base = new Decimal(500);
    const prev = { amount: new Decimal(500), spent: new Decimal(600) };
    expect(computeAutoBudgetAmount('ROLLOVER', base, prev).toNumber()).toBe(500);
  });

  it('ADJUSTED: subtracts overspent from previous period', () => {
    const base = new Decimal(500);
    const prev = { amount: new Decimal(500), spent: new Decimal(650) };
    expect(computeAutoBudgetAmount('ADJUSTED', base, prev).toNumber()).toBe(350);
  });

  it('ADJUSTED: does not exceed base if underspent', () => {
    const base = new Decimal(500);
    const prev = { amount: new Decimal(500), spent: new Decimal(300) };
    expect(computeAutoBudgetAmount('ADJUSTED', base, prev).toNumber()).toBe(500);
  });
});
