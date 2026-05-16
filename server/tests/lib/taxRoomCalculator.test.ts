import { describe, expect, it } from 'vitest';
import { calculateRrspRoom, calculateTfsaRoom, getRrspAnnualLimit } from './taxRoomCalculator';

describe('taxRoomCalculator', () => {
  it('calculates TFSA room only for years where the member is at least 18', () => {
    expect(calculateTfsaRoom(2005, 2026, 10000, 500)).toEqual({
      totalRoomEver: 27500,
      roomRemaining: 18000,
      overContribution: 0,
    });
  });

  it('reports TFSA over-contribution when contributions exceed restored room', () => {
    expect(calculateTfsaRoom(1990, 2026, 120000, 0)).toEqual({
      totalRoomEver: 109000,
      roomRemaining: 0,
      overContribution: 11000,
    });
  });

  it('uses the known RRSP annual limit for a supported year', () => {
    expect(getRrspAnnualLimit(2024)).toBe(31560);
  });

  it('falls back to the latest RRSP annual limit for unsupported years', () => {
    expect(getRrspAnnualLimit(2030)).toBe(32490);
  });

  it('combines RRSP annual limit with carry-forward room and detects over-contribution', () => {
    expect(calculateRrspRoom(2026, 70000, 30000)).toEqual({
      annualLimit: 32490,
      totalRoom: 62490,
      roomRemaining: 0,
      overContribution: 7510,
    });
  });
});
