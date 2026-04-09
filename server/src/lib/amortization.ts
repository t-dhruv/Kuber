/**
 * Mortgage amortization engine — pure functions, no I/O.
 *
 * Compounding rules:
 *   US:              i = r / 12            (monthly compounding)
 *   CA fixed:        i = (1 + r/2)^(2/12) - 1  (semi-annual compounding, per the Interest Act)
 *   CA variable:     i = r / 12            (variable-rate mortgages use monthly compounding)
 *
 * Payment formula:
 *   P = L * [ i(1+i)^n ] / [ (1+i)^n - 1 ]
 */

export type MortgageRegion  = 'US' | 'CA';
export type LoanRateType    = 'fixed' | 'variable';
export type PaymentFrequency = 'monthly' | 'biweekly' | 'weekly';

export interface AmortizationPeriod {
  period:    number;
  payment:   number;
  principal: number;
  interest:  number;
  balance:   number;
}

export interface PayoffResult {
  newPayoffMonths:   number;
  monthsSaved:       number;
  interestSaved:     number;
  totalInterestBase: number;
  totalInterestNew:  number;
}

export interface AmortizationSummary {
  effectiveMonthlyRate:  number;  // i
  calculatedPayment:     number;  // P
  nextPrincipalPortion:  number;
  nextInterestPortion:   number;
  remainingPayments:     number;
  payoffDate:            string;  // ISO date
  totalInterestRemaining: number;
  periods:               AmortizationPeriod[];  // full schedule
}

// ── Rate calculation ─────────────────────────────────────────────────────────

/**
 * Derives the effective annual rate for a variable-rate mortgage.
 * Effective rate = Prime - Discount  (floor 0.01 to avoid zero-rate edge case)
 */
export function resolveVariableRate(primeRate: number, primeDiscount: number): number {
  return Math.max(0.01, primeRate - primeDiscount);
}

/**
 * Calculates the effective monthly periodic rate (i).
 *
 * US:           i = r / 12
 * CA fixed:     i = (1 + r/2)^(2/12) - 1
 * CA variable:  i = r / 12  (monthly compounding by industry standard)
 */
export function monthlyRate(
  annualRatePercent: number,
  region:   MortgageRegion,
  rateType: LoanRateType,
): number {
  const r = annualRatePercent / 100;

  if (region === 'CA' && rateType === 'fixed') {
    // Semi-annual compounding: convert to monthly equivalent
    // i = (1 + r/2)^(2/12) - 1
    return Math.pow(1 + r / 2, 2 / 12) - 1;
  }

  // US (any) and CA variable: monthly compounding
  return r / 12;
}

// ── Payment calculation ──────────────────────────────────────────────────────

/**
 * Standard amortization payment formula:
 *   P = L * i(1+i)^n / ((1+i)^n - 1)
 *
 * Edge case: i = 0  →  P = L / n  (interest-free loan)
 */
export function calcPayment(
  principal: number,
  annualRatePercent: number,
  termMonths: number,
  region:   MortgageRegion,
  rateType: LoanRateType,
): number {
  if (principal <= 0 || termMonths <= 0) return 0;

  const i = monthlyRate(annualRatePercent, region, rateType);

  if (i === 0) return round2(principal / termMonths);

  const compoundFactor = Math.pow(1 + i, termMonths);
  return round2(principal * (i * compoundFactor) / (compoundFactor - 1));
}

// ── Amortization schedule ────────────────────────────────────────────────────

/**
 * Generates a full amortization schedule.
 * paymentOverride: supply a known payment amount (e.g. from DB) instead of recalculating.
 * The final period is adjusted to clear any floating-point residual.
 */
export function amortizationSchedule(
  principal: number,
  annualRatePercent: number,
  termMonths: number,
  region:   MortgageRegion,
  rateType: LoanRateType,
  paymentOverride?: number,
): AmortizationPeriod[] {
  const i       = monthlyRate(annualRatePercent, region, rateType);
  const payment = paymentOverride ?? calcPayment(principal, annualRatePercent, termMonths, region, rateType);

  const periods: AmortizationPeriod[] = [];
  let balance = principal;

  for (let period = 1; period <= termMonths && balance > 0.005; period++) {
    const interestCharge  = round2(balance * i);
    const principalCharge = Math.min(balance, round2(payment - interestCharge));
    const actualPayment   = round2(interestCharge + principalCharge);

    balance = Math.max(0, round2(balance - principalCharge));

    periods.push({ period, payment: actualPayment, principal: principalCharge, interest: interestCharge, balance });
  }

  return periods;
}

// ── Full amortization summary ────────────────────────────────────────────────

/**
 * Builds the full amortization summary for a liability.
 * Returns calculated payment, next-period breakdown, payoff date, and full schedule.
 */
export function buildAmortizationSummary(
  currentBalance: number,
  annualRatePercent: number,
  amortizationYears: number,
  region:   MortgageRegion,
  rateType: LoanRateType,
  existingPayment?: number,
): AmortizationSummary {
  const termMonths = amortizationYears * 12;
  const i          = monthlyRate(annualRatePercent, region, rateType);
  const payment    = existingPayment ?? calcPayment(currentBalance, annualRatePercent, termMonths, region, rateType);

  const periods               = amortizationSchedule(currentBalance, annualRatePercent, termMonths, region, rateType, payment);
  const totalInterestRemaining = round2(periods.reduce((s, p) => s + p.interest, 0));

  const nextPeriod = periods[0];
  const payoffMs   = Date.now() + periods.length * 30.4375 * 24 * 60 * 60 * 1000;
  const payoffDate = new Date(payoffMs).toISOString().slice(0, 10);

  return {
    effectiveMonthlyRate:   i,
    calculatedPayment:      payment,
    nextPrincipalPortion:   nextPeriod?.principal ?? 0,
    nextInterestPortion:    nextPeriod?.interest  ?? 0,
    remainingPayments:      periods.length,
    payoffDate,
    totalInterestRemaining,
    periods,
  };
}

// ── Payoff simulator ─────────────────────────────────────────────────────────

/**
 * Computes the effect of making an extra monthly principal payment.
 * Returns months saved and total interest saved vs. the base schedule.
 */
export function payoffSimulator(
  currentBalance: number,
  annualRatePercent: number,
  remainingMonths: number,
  basePayment: number,
  extraPayment: number,
  region:   MortgageRegion,
  rateType: LoanRateType,
): PayoffResult {
  const base = amortizationSchedule(currentBalance, annualRatePercent, remainingMonths, region, rateType, basePayment);
  const accel = amortizationSchedule(currentBalance, annualRatePercent, remainingMonths, region, rateType, basePayment + extraPayment);

  const totalInterestBase = round2(base.reduce((s, p) => s + p.interest, 0));
  const totalInterestNew  = round2(accel.reduce((s, p) => s + p.interest, 0));

  return {
    newPayoffMonths:   accel.length,
    monthsSaved:       base.length - accel.length,
    interestSaved:     round2(totalInterestBase - totalInterestNew),
    totalInterestBase,
    totalInterestNew,
  };
}

// ── Trigger rate (Canadian VRM) ──────────────────────────────────────────────

/**
 * The rate at which a fixed payment no longer covers monthly interest.
 * Formula: r_trigger = (payment / balance) * 12 * 100
 * (VRM uses monthly compounding)
 */
export function triggerRate(fixedMonthlyPayment: number, currentBalance: number): number {
  if (currentBalance <= 0) return 0;
  return round2((fixedMonthlyPayment / currentBalance) * 12 * 100);
}

// ── Utility ──────────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
