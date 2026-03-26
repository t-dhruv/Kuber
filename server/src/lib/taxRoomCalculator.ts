/**
 * taxRoomCalculator.ts
 * CRA TFSA and RRSP contribution room rules engine.
 */

// TFSA annual limits by year (CRA official)
const TFSA_ANNUAL_LIMITS: Record<number, number> = {
  2009: 5000, 2010: 5000, 2011: 5000, 2012: 5000, 2013: 5500,
  2014: 5500, 2015: 10000, 2016: 5500, 2017: 5500, 2018: 5500,
  2019: 6000, 2020: 6000, 2021: 6000, 2022: 6000, 2023: 6500,
  2024: 7000, 2025: 7000, 2026: 7000,
};

/**
 * Calculate cumulative TFSA room for a person.
 * @param birthYear  Year of birth (must be 18+ in a given year to accumulate room)
 * @param currentYear  Current calendar year
 * @param contributions  Total contributions made to date
 * @param withdrawals   Total withdrawals (restored next Jan 1 — simplified: add back)
 */
export function calculateTfsaRoom(
  birthYear: number,
  currentYear: number,
  contributions: number,
  withdrawals: number
): { totalRoomEver: number; roomRemaining: number; overContribution: number } {
  let totalRoomEver = 0;
  for (let year = 2009; year <= currentYear; year++) {
    const age = year - birthYear;
    if (age >= 18) {
      totalRoomEver += TFSA_ANNUAL_LIMITS[year] ?? 7000;
    }
  }
  const roomRemaining = totalRoomEver + withdrawals - contributions;
  const overContribution = Math.max(0, -roomRemaining);
  return { totalRoomEver, roomRemaining: Math.max(0, roomRemaining), overContribution };
}

// RRSP annual limits by year
const RRSP_ANNUAL_LIMITS: Record<number, number> = {
  2020: 27830, 2021: 27830, 2022: 29210, 2023: 30780, 2024: 31560, 2025: 32490, 2026: 32490,
};

/**
 * Calculate RRSP room.
 * Simplified: based on the annual dollar limit (not income-based, as we don't have T4 data).
 * Returns the annual limit for the current year.
 */
export function getRrspAnnualLimit(year: number): number {
  return RRSP_ANNUAL_LIMITS[year] ?? 32490;
}

export function calculateRrspRoom(
  currentYear: number,
  contributions: number,
  carryForwardRoom: number
): { annualLimit: number; totalRoom: number; roomRemaining: number; overContribution: number } {
  const annualLimit = getRrspAnnualLimit(currentYear);
  const totalRoom = annualLimit + carryForwardRoom;
  const roomRemaining = totalRoom - contributions;
  const overContribution = Math.max(0, -roomRemaining);
  return { annualLimit, totalRoom, roomRemaining: Math.max(0, roomRemaining), overContribution };
}
